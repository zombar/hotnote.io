import { appState } from '../state/app-state.js';
import { FileSystemAdapter } from '../fs/filesystem-adapter.js';
import { recursiveSearchFiles } from '../search/fuzzy-search.js';
import { addToHistory } from '../navigation/history-manager.js';
import { updateBreadcrumb } from './breadcrumb.js';
import { hasTempChanges, saveTempChanges, clearTempChanges } from '../../core.js';
import { debounce } from '../utils/helpers.js';
import { URLParamManager } from '../navigation/url-param-manager.js';

/**
 * Show file picker with current directory contents
 * @param {FileSystemDirectoryHandle} dirHandle - Directory to show
 */
export const showFilePicker = async (dirHandle) => {
  // Check if picker is already open with input (breadcrumb navigation while navbar active)
  const picker = document.getElementById('file-picker');
  const existingInput = document.querySelector('.breadcrumb-input');
  const pickerAlreadyOpen =
    !picker.classList.contains('hidden') &&
    existingInput &&
    existingInput.dataset.hasListeners === 'true';

  if (pickerAlreadyOpen) {
    // Picker already open with input - update file list and breadcrumb, then ensure focus
    // This avoids recreating the entire picker which causes focus loss

    // Update file list for new directory
    const fileList = document.getElementById('file-list');
    if (fileList) {
      fileList.innerHTML = ''; // Clear existing files

      // Collect and sort entries
      const entries = await FileSystemAdapter.listDirectory(dirHandle);
      entries.sort((a, b) => {
        if (a.kind === 'directory' && b.kind === 'file') return -1;
        if (a.kind === 'file' && b.kind === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

      // Recreate file items (same logic as below)
      for (const entry of entries) {
        const item = document.createElement('div');
        item.className = `file-item ${entry.kind === 'directory' ? 'is-directory' : ''}`;

        const icon = document.createElement('span');
        icon.className = 'file-item-icon';
        const iconSymbol = document.createElement('span');
        iconSymbol.className = 'material-symbols-outlined';
        iconSymbol.textContent = getFileIcon(entry.name, entry.kind === 'directory');
        icon.appendChild(iconSymbol);

        const name = document.createElement('span');
        name.className = 'file-item-name';
        name.textContent = entry.name;

        item.appendChild(icon);
        item.appendChild(name);

        // Add click handler
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          appState.focusManager.saveFocusState();
          if (entry.kind === 'directory') {
            await navigateToDirectory(entry);
          } else {
            await openFileFromPicker(entry);
          }
        });

        fileList.appendChild(item);
      }
    }

    // Update breadcrumb path without recreating input
    await quickFileCreate('');

    // Force focus on input after update
    const input = document.querySelector('.breadcrumb-input');
    if (input) {
      input.focus();
    }

    return;
  }

  // Save current file state for restoration if user cancels
  // This happens when navbar gains focus (user interacts with breadcrumb/file picker)
  if (appState.currentFileHandle) {
    appState.previousFileHandle = appState.currentFileHandle;
    appState.previousFilename = appState.currentFilename;
    // Set flag to enable restoration when picker is closed without selection
    appState.isNavigatingBreadcrumbs = true;
  }

  // Clear current file to show clean file picker
  // File will be restored if picker is closed without selection
  appState.currentFileHandle = null;
  appState.currentFilename = '';

  // Update URL params: clear file param, keep workdir
  const workdirPath = appState.rootDirHandle?.name ? `/${appState.rootDirHandle.name}` : null;
  if (workdirPath) {
    URLParamManager.update(workdirPath, null);
  }

  // Note: Breadcrumb will be rebuilt by quickFileCreate() at the end with search input
  // This ensures a single, clean update with proper focus

  // Pause file polling while picker is open
  if (window.fileSyncManager) {
    window.fileSyncManager.pause();
  }

  // Reuse picker variable from earlier check
  const resizeHandle = document.getElementById('file-picker-resize-handle');
  picker.classList.remove('hidden');
  resizeHandle.classList.remove('hidden');

  // Create file list
  picker.innerHTML = "<div class='file-list' id='file-list'></div>";

  const fileList = document.getElementById('file-list');

  // Collect all entries using the adapter
  const entries = await FileSystemAdapter.listDirectory(dirHandle);

  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.kind === 'directory' && b.kind === 'file') return -1;
    if (a.kind === 'file' && b.kind === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  // Create file items
  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = `file-item ${entry.kind === 'directory' ? 'is-directory' : ''}`;

    const icon = document.createElement('span');
    icon.className = 'file-item-icon';
    const iconSymbol = document.createElement('span');
    iconSymbol.className = 'material-symbols-outlined';
    iconSymbol.textContent = getFileIcon(entry.name, entry.kind === 'directory');
    icon.appendChild(iconSymbol);

    const name = document.createElement('span');
    name.className = 'file-item-name';
    name.textContent = entry.name;

    // Check if file has temp changes
    if (entry.kind === 'file') {
      const pathParts = appState.currentPath.map((p) => p.name);
      pathParts.push(entry.name);
      const filePathKey = pathParts.join('/');
      if (hasTempChanges(filePathKey)) {
        item.classList.add('has-unsaved-changes');
      }
    }

    item.appendChild(icon);
    item.appendChild(name);

    // Add metadata and delete button for files only
    if (entry.kind === 'file') {
      // Get file metadata (size, permissions)
      const file = await entry.getFile();
      const sizeKB =
        file.size < 1024
          ? file.size + ' B'
          : file.size < 1024 * 1024
            ? (file.size / 1024).toFixed(1) + ' KB'
            : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

      // Display file size
      const metadata = document.createElement('span');
      metadata.className = 'file-item-metadata';
      metadata.textContent = sizeKB;
      item.appendChild(metadata);

      // Check if file is read-only
      let lockIcon = null;
      try {
        const permission = await entry.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
          lockIcon = document.createElement('span');
          lockIcon.className = 'file-item-lock';
          const lockSymbol = document.createElement('span');
          lockSymbol.className = 'material-symbols-outlined';
          lockSymbol.textContent = 'lock';
          lockIcon.appendChild(lockSymbol);
          lockIcon.title = 'Read-only';
          item.appendChild(lockIcon);
        }
      } catch {
        // Permission check not supported, ignore
      }

      // Add delete button with confirmation
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'file-item-delete';
      const deleteIcon = document.createElement('span');
      deleteIcon.className = 'material-symbols-outlined';
      deleteIcon.textContent = 'close';
      deleteBtn.appendChild(deleteIcon);
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent opening the file
        showDeleteConfirmation(item, entry, metadata, lockIcon);
      });
      item.appendChild(deleteBtn);
    }

    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      appState.focusManager.saveFocusState();
      if (entry.kind === 'directory') {
        await navigateToDirectory(entry);
      } else {
        await openFileFromPicker(entry);
      }
    });

    fileList.appendChild(item);
  }

  // Show filename input with autocomplete
  // Don't await - let it run in background while picker is shown
  quickFileCreate('').catch((err) => {
    console.error('Error in quickFileCreate:', err);
  });
};

/**
 * Hide file picker
 */
export const hideFilePicker = () => {
  document.getElementById('file-picker').classList.add('hidden');
  document.getElementById('file-picker-resize-handle').classList.add('hidden');

  // Resume file polling when picker is closed
  if (window.fileSyncManager) {
    window.fileSyncManager.resume();
  }

  // ONLY restore if we're in breadcrumb navigation mode
  // This prevents restoration when closing welcome screen or other programmatic hides
  if (appState.isNavigatingBreadcrumbs) {
    // Restore previous file and path if picker was closed without selecting a new file
    // This happens when user clicks breadcrumb to browse, then closes picker without selection
    const noFileSelected = !appState.currentFileHandle;

    if (noFileSelected) {
      // Restore previous file if there was one
      if (appState.previousFileHandle) {
        appState.currentFileHandle = appState.previousFileHandle;
        appState.currentFilename = appState.previousFilename;
      }

      // Restore previous path if there was one (from breadcrumb navigation)
      if (appState.previousPath) {
        appState.currentPath = appState.previousPath;
      }
    }
  }

  // Always clear previous state (cleanup happens regardless of navigation mode)
  appState.previousFileHandle = null;
  appState.previousFilename = '';
  appState.previousPath = null;
  appState.isNavigatingBreadcrumbs = false;

  // Restore focus to editor if a file is currently open
  if (appState.currentFileHandle) {
    appState.focusManager.focusEditor({ delay: 50, reason: 'picker-hidden' });
  }
};

/**
 * Initialize file picker resize functionality
 */
export const initFilePickerResize = () => {
  const resizeHandle = document.getElementById('file-picker-resize-handle');
  const filePicker = document.getElementById('file-picker');

  // Load saved height from localStorage
  const savedHeight = localStorage.getItem('filePickerHeight');
  const initialHeight = savedHeight ? parseInt(savedHeight, 10) : 300;
  document.documentElement.style.setProperty('--file-picker-height', `${initialHeight}px`);

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  const onMouseDown = (e) => {
    isDragging = true;
    startY = e.clientY;
    startHeight = filePicker.offsetHeight;

    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;

    const deltaY = e.clientY - startY;
    let newHeight = startHeight + deltaY;

    // Apply constraints: min 100px, max 80vh
    const minHeight = 100;
    const maxHeight = window.innerHeight * 0.8;
    newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    // Update CSS custom property
    document.documentElement.style.setProperty('--file-picker-height', `${newHeight}px`);

    // Save to localStorage
    localStorage.setItem('filePickerHeight', newHeight.toString());
  };

  const onMouseUp = () => {
    if (!isDragging) return;

    isDragging = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  // Attach event listeners
  resizeHandle.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

/**
 * Show delete confirmation UI
 * @param {HTMLElement} item - File item element
 * @param {FileSystemHandle} entry - File/directory handle
 * @param {HTMLElement} metadata - Metadata element
 * @param {HTMLElement} lockIcon - Lock icon element
 */
const showDeleteConfirmation = (item, entry, metadata, lockIcon) => {
  // Hide metadata and lock icon if they exist
  if (metadata) metadata.style.display = 'none';
  if (lockIcon) lockIcon.style.display = 'none';

  // Hide the delete button
  const deleteBtn = item.querySelector('.file-item-delete');
  if (deleteBtn) deleteBtn.style.display = 'none';

  // Create confirmation UI
  const confirmContainer = document.createElement('div');
  confirmContainer.className = 'file-item-delete-confirm';

  const confirmText = document.createElement('span');
  confirmText.className = 'file-item-delete-confirm-text';
  confirmText.textContent = 'Delete?';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'file-item-delete-confirm-btn confirm';
  const confirmIcon = document.createElement('span');
  confirmIcon.className = 'material-symbols-outlined';
  confirmIcon.textContent = 'check';
  confirmBtn.appendChild(confirmIcon);
  confirmBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await window.trashManager.moveToTrash(appState.currentDirHandle, entry);
      window.trashManager.showUndoSnackbar(entry.name, appState.currentDirHandle);
    } catch (err) {
      alert(err.message);
    }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'file-item-delete-confirm-btn cancel';
  const cancelIcon = document.createElement('span');
  cancelIcon.className = 'material-symbols-outlined';
  cancelIcon.textContent = 'close';
  cancelBtn.appendChild(cancelIcon);
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Restore normal view
    if (metadata) metadata.style.display = '';
    if (lockIcon) lockIcon.style.display = '';
    if (deleteBtn) deleteBtn.style.display = '';
    confirmContainer.remove();
  });

  confirmContainer.appendChild(confirmText);
  confirmContainer.appendChild(confirmBtn);
  confirmContainer.appendChild(cancelBtn);
  item.appendChild(confirmContainer);
};

/**
 * Navigate to a subdirectory
 * @param {FileSystemDirectoryHandle} dirHandle - Directory handle
 */
const navigateToDirectory = async (dirHandle) => {
  // Save temp changes if file is dirty
  if (appState.isDirty && appState.currentFileHandle) {
    saveTempChanges();
  }

  appState.currentPath.push({ name: dirHandle.name, handle: dirHandle });
  appState.currentDirHandle = dirHandle;

  // Don't close the current file - keep it open while showing picker
  // Note: Don't add to history - folder navigation is just for browsing

  await showFilePicker(dirHandle);
  updateBreadcrumb();
};

/**
 * Open a file from the file picker
 * @param {FileSystemFileHandle} fileHandle - File handle
 */
export const openFileFromPicker = async (fileHandle) => {
  try {
    // Save temp changes for currently open file if dirty
    if (appState.isDirty && appState.currentFileHandle) {
      saveTempChanges();
    }

    appState.currentFileHandle = fileHandle;
    appState.currentFilename = fileHandle.name;

    // Clear previous file and path state since we're opening a new file
    appState.previousFileHandle = null;
    appState.previousFilename = '';
    appState.previousPath = null;
    appState.isNavigatingBreadcrumbs = false; // File selected, no longer in navigation mode

    // Always load the original file content from disk
    const fileContent = await FileSystemAdapter.readFile(fileHandle);

    // Initialize file modification tracking
    const metadata = await FileSystemAdapter.getFileMetadata(fileHandle);
    appState.lastModified = metadata.lastModified;

    // Initialize the editor with the file content
    await window.initEditor(fileContent, fileHandle.name);

    appState.isDirty = false;
    appState.originalContent = fileContent;

    // Clear temp changes since we're loading fresh content
    const filePathKey = [...appState.currentPath.map((p) => p.name), fileHandle.name].join('/');
    clearTempChanges(filePathKey);

    // Update UI
    updateBreadcrumb();
    window.updateLogoState();

    // addToHistory() will handle updating URL params
    addToHistory();

    // Show notification that file was loaded from disk
    if (window.showFileReloadNotification) {
      window.showFileReloadNotification('Loaded from disk');
    }

    // Hide the file picker
    hideFilePicker();

    // Focus the editor after a short delay
    appState.focusManager.focusEditor({ delay: 100, reason: 'file-opened' });
  } catch (err) {
    console.error('Error opening file:', err);
    alert('Error opening file: ' + err.message);
  }
};

/**
 * Get file icon based on filename
 * @param {string} filename - Filename
 * @param {boolean} isDirectory - Whether it's a directory
 * @returns {string} Material icon name
 */
const getFileIcon = (filename, isDirectory) => {
  if (isDirectory) return 'folder';

  const ext = filename.split('.').pop().toLowerCase();

  const iconMap = {
    // Code files
    js: 'javascript',
    jsx: 'javascript',
    ts: 'code',
    tsx: 'code',
    py: 'code',
    java: 'code',
    cpp: 'code',
    c: 'code',
    cs: 'code',
    go: 'code',
    rs: 'code',
    php: 'code',
    rb: 'code',
    swift: 'code',
    kt: 'code',

    // Web
    html: 'html',
    css: 'css',
    scss: 'css',
    sass: 'css',
    less: 'css',

    // Data
    json: 'data_object',
    xml: 'code',
    yaml: 'code',
    yml: 'code',
    toml: 'code',
    csv: 'table',

    // Documents
    md: 'description',
    txt: 'description',
    pdf: 'picture_as_pdf',
    doc: 'description',
    docx: 'description',

    // Images
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    svg: 'image',
    webp: 'image',
    ico: 'image',

    // Media
    mp4: 'movie',
    mov: 'movie',
    avi: 'movie',
    mp3: 'music_note',
    wav: 'music_note',
    ogg: 'music_note',

    // Archives
    zip: 'folder_zip',
    tar: 'folder_zip',
    gz: 'folder_zip',
    rar: 'folder_zip',
    '7z': 'folder_zip',

    // Config
    env: 'settings',
    config: 'settings',
    ini: 'settings',

    // Other
    default: 'draft',
  };

  return iconMap[ext] || iconMap.default;
};

/**
 * Create dropdown item for search result
 * @param {Object} result - Search result
 * @param {HTMLInputElement} input - Input element
 * @param {HTMLElement} dropdown - Dropdown element
 * @param {Function} handleSubmit - Submit handler
 * @returns {HTMLElement} Dropdown item
 */
const createDropdownItem = (result, input, dropdown, handleSubmit) => {
  const item = document.createElement('div');
  item.className = 'autocomplete-item';

  // Icon
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined autocomplete-item-icon';
  icon.textContent = getFileIcon(result.name || result.fullPath, false);
  item.appendChild(icon);

  // Name
  const nameDiv = document.createElement('div');
  nameDiv.className = 'autocomplete-item-name';
  nameDiv.textContent = result.name || result.fullPath;

  // Path (if exists)
  if (result.path) {
    const pathDiv = document.createElement('div');
    pathDiv.className = 'autocomplete-item-path';
    pathDiv.textContent = result.path || '(root)';
    item.appendChild(nameDiv);
    item.appendChild(pathDiv);
  } else {
    item.appendChild(nameDiv);
  }

  item.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent blur
    input.value = result.fullPath;
    dropdown.style.display = 'none';
    handleSubmit();
  });

  return item;
};

// Track active promise to prevent overlapping calls
let activeFilenamePromise = null;

/**
 * Show inline filename input with autocomplete
 * @param {string[]|Promise<string[]>} existingFilesOrPromise - Existing files or promise resolving to files
 * @param {string} initialValue - Initial input value
 * @returns {Promise<string|null>} Filename or null if cancelled
 */
const showFilenameInput = async (existingFilesOrPromise = [], initialValue = '') => {
  const breadcrumb = document.getElementById('breadcrumb');

  // Check if input already exists (created by previous call)
  let input = breadcrumb.querySelector('.breadcrumb-input');
  let cursor = breadcrumb.querySelector('.breadcrumb-cursor');
  let autocompleteContainer = breadcrumb.querySelector('.autocomplete-container');

  // If input already exists with active promise, just update path and return sentinel
  // This prevents overlapping promises that cause the blur handler bug
  if (input && input.dataset.hasListeners === 'true' && activeFilenamePromise) {
    // Update breadcrumb path to match current state
    // Remove only the breadcrumb path items (keep autocomplete container in place)
    const pathItems = breadcrumb.querySelectorAll('.breadcrumb-item');
    pathItems.forEach((item) => item.remove());

    // Rebuild path items and insert them BEFORE the autocomplete container
    if (appState.currentPath.length > 0) {
      const fragment = document.createDocumentFragment();
      appState.currentPath.forEach((segment, _index) => {
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        fragment.appendChild(item);
      });
      breadcrumb.insertBefore(fragment, autocompleteContainer);
    }

    // Update value if provided
    if (initialValue) {
      input.value = initialValue;
    }

    // Ensure focus without creating new promise
    if (document.activeElement !== input) {
      input.focus();
    }

    // Return sentinel immediately - don't create overlapping promise
    return Promise.resolve('__SKIP__');
  }

  // Create new promise and track it
  const promise = new Promise((resolve) => {
    // Input doesn't exist yet, create everything
    breadcrumb.innerHTML = '';

    // Rebuild path if exists
    if (appState.currentPath.length > 0) {
      appState.currentPath.forEach((segment, _index) => {
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        breadcrumb.appendChild(item);
      });
    }

    // Create autocomplete container
    autocompleteContainer = document.createElement('div');
    autocompleteContainer.className = 'autocomplete-container';

    // Add input where filename would normally appear
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'breadcrumb-input';
    input.placeholder = 'filename (/ for search)';
    input.value = initialValue;
    input.autocomplete = 'off';
    input.dataset.hasListeners = 'true'; // Mark that listeners are attached

    // Create custom block cursor
    cursor = document.createElement('span');
    cursor.className = 'breadcrumb-cursor';

    autocompleteContainer.appendChild(input);
    autocompleteContainer.appendChild(cursor);
    breadcrumb.appendChild(autocompleteContainer);
    input.focus();

    // Create dropdown for autocomplete
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.display = 'none';

    let selectedIndex = -1;
    let filteredFiles = [];
    let resolved = false;
    let searchInProgress = false;
    const header = document.querySelector('header');

    // Resolve the files promise if it's a promise, otherwise use the array directly
    let existingFiles = [];
    if (existingFilesOrPromise && typeof existingFilesOrPromise.then === 'function') {
      // It's a promise - resolve it asynchronously
      existingFilesOrPromise.then((files) => {
        existingFiles = files;
      });
    } else {
      // It's already an array
      existingFiles = existingFilesOrPromise || [];
    }

    const updateDropdownImpl = async () => {
      const value = input.value.trim();
      const isRecursiveMode = value.includes('/');
      const searchQuery = isRecursiveMode ? value.replace('/', '').trim() : value;

      if (!searchQuery) {
        dropdown.style.display = 'none';
        filteredFiles = [];
        header.classList.remove('searching');
        return;
      }

      // Prevent concurrent searches
      if (searchInProgress) {
        return;
      }

      try {
        searchInProgress = true;

        if (isRecursiveMode && appState.currentDirHandle) {
          // Show loading animation for recursive search
          header.classList.add('searching');

          // Recursive search mode with progressive results
          const results = [];
          dropdown.innerHTML = '';

          // Stream results as they're found
          for await (const result of recursiveSearchFiles(appState.currentDirHandle, searchQuery)) {
            results.push(result);

            // Add to dropdown immediately for instant feedback
            const item = createDropdownItem(result, input, dropdown, handleSubmit);
            dropdown.appendChild(item);

            // Show dropdown on first result
            if (results.length === 1) {
              const rect = input.getBoundingClientRect();
              dropdown.style.left = rect.left + 'px';
              dropdown.style.top = rect.bottom + 4 + 'px';
              dropdown.style.display = 'block';
            }
          }

          // Final sort when all results are in
          if (results.length > 1) {
            results.sort((a, b) => {
              if (b.relevance !== a.relevance) return b.relevance - a.relevance;
              if (a.depth !== b.depth) return a.depth - b.depth;
              return a.fullPath.localeCompare(b.fullPath);
            });

            // Rebuild dropdown with sorted results
            dropdown.innerHTML = '';
            results.forEach((result) => {
              const item = createDropdownItem(result, input, dropdown, handleSubmit);
              dropdown.appendChild(item);
            });
          }

          filteredFiles = results;
        } else {
          // Normal prefix mode (current directory only)
          // Await files if they're still loading
          const filesToFilter =
            existingFiles.length > 0
              ? existingFiles
              : existingFilesOrPromise && typeof existingFilesOrPromise.then === 'function'
                ? await existingFilesOrPromise
                : [];

          filteredFiles = filesToFilter
            .filter((file) => file.toLowerCase().startsWith(searchQuery.toLowerCase()))
            .map((name) => ({
              name: name,
              path: '',
              fullPath: name,
              kind: 'file',
              relevance: 1000,
            }));
        }

        if (filteredFiles.length === 0) {
          dropdown.style.display = 'none';
          return;
        }

        // Build dropdown items for non-recursive mode
        if (!isRecursiveMode) {
          dropdown.innerHTML = '';
          filteredFiles.forEach((result, _index) => {
            const item = createDropdownItem(result, input, dropdown, handleSubmit);
            dropdown.appendChild(item);
          });
        }

        // Position dropdown below input
        const rect = input.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = rect.bottom + 4 + 'px';
        dropdown.style.display = 'block';
        selectedIndex = -1;
      } finally {
        searchInProgress = false;
        // Remove loading animation
        header.classList.remove('searching');
      }
    };

    // Debounced version for recursive search
    const debouncedUpdateDropdown = debounce(updateDropdownImpl, 300);

    const updateDropdown = () => {
      const isRecursiveMode = input.value.includes('/');
      if (isRecursiveMode) {
        debouncedUpdateDropdown();
      } else {
        updateDropdownImpl();
      }
    };

    const selectItem = (index) => {
      const items = dropdown.querySelectorAll('.autocomplete-item');
      items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
      });
    };

    const handleSubmit = async () => {
      if (resolved) return;
      resolved = true;

      // Clean up dropdown and loading animation
      dropdown.remove();
      header.classList.remove('searching');

      // Clear active promise tracker
      activeFilenamePromise = null;

      const filename = input.value.trim();
      // Validate filename
      if (!filename) {
        resolve(null);
        return;
      }

      // Handle special navigation shortcuts
      if (filename === '..' || filename === '...') {
        // Handle '..' - go up one folder
        if (filename === '..') {
          if (appState.currentPath.length === 0) {
            // At top level, open folder dialog
            resolve(null);
            await window.openFolder();
            return;
          } else if (appState.currentPath.length === 1) {
            // At root level, prompt to open a new parent folder
            resolve(null);
            await window.openFolder();
            return;
          } else {
            // Remove the last path segment
            appState.currentPath.pop();
            appState.currentDirHandle =
              appState.currentPath[appState.currentPath.length - 1].handle;
            appState.currentFileHandle = null;
            appState.currentFilename = '';
            await window.initEditor('', 'untitled');
            addToHistory();
            await showFilePicker(appState.currentDirHandle);
            updateBreadcrumb();
            resolve(null);
            return;
          }
        }

        // Handle '...' - go to workspace root
        if (filename === '...') {
          if (appState.currentPath.length === 0) {
            // At top level, open folder dialog
            resolve(null);
            await window.openFolder();
            return;
          } else {
            // Go to workspace root (first item in path)
            const rootHandle = appState.currentPath[0].handle;
            appState.currentPath = [appState.currentPath[0]];
            appState.currentDirHandle = rootHandle;
            appState.currentFileHandle = null;
            appState.currentFilename = '';
            await window.initEditor('', 'untitled');
            addToHistory();
            await showFilePicker(appState.currentDirHandle);
            updateBreadcrumb();
            resolve(null);
            return;
          }
        }
      }

      // Check for invalid characters (allow / for paths)
      const invalidChars = /[\\:*?"<>|]/;
      if (invalidChars.test(filename)) {
        alert('Invalid filename. Please avoid using \\ : * ? " < > |');
        resolve(null);
        return;
      }
      resolve(filename);
    };

    const handleCancel = () => {
      if (resolved) return;
      resolved = true;

      // Clean up dropdown and loading animation
      dropdown.remove();
      header.classList.remove('searching');

      // Clear active promise tracker
      activeFilenamePromise = null;

      resolve(null);
    };

    input.addEventListener('input', updateDropdown);

    input.addEventListener('keydown', (e) => {
      if (dropdown.style.display === 'block' && filteredFiles.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, filteredFiles.length - 1);
          selectItem(selectedIndex);
          // Scroll into view
          const items = dropdown.querySelectorAll('.autocomplete-item');
          if (items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, -1);
          selectItem(selectedIndex);
          // Scroll into view
          const items = dropdown.querySelectorAll('.autocomplete-item');
          if (items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedIndex >= 0) {
            input.value = filteredFiles[selectedIndex].fullPath;
            dropdown.style.display = 'none';
          }
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
            selectedIndex = -1;
          } else {
            // Close input and file picker
            handleCancel();
            hideFilePicker();
            // Only focus editor if a document is open
            if (appState.currentFileHandle) {
              setTimeout(() => {
                appState.focusManager.focusEditor({ reason: 'escape-from-navbar' });
              }, 50);
            }
          }
        }
      } else {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // Close input and file picker
          handleCancel();
          hideFilePicker();
          // Only focus editor if a document is open
          if (appState.currentFileHandle) {
            setTimeout(() => {
              appState.focusManager.focusEditor({ reason: 'escape-from-navbar' });
            }, 50);
          }
        }
      }
    });

    // Track if we've attempted to recover from breadcrumb navigation blur
    let hasAttemptedRefocus = false;

    input.addEventListener('blur', (e) => {
      // Hide cursor when input loses focus
      cursor.style.display = 'none';

      // Delay to allow click on dropdown
      setTimeout(() => {
        // Don't cancel if we're actively navigating breadcrumbs AND focus went nowhere (relatedTarget was null)
        // This handles the immediate blur from breadcrumb clicks
        if (appState.isNavigatingBreadcrumbs && !e.relatedTarget && !hasAttemptedRefocus) {
          hasAttemptedRefocus = true;

          // Show cursor again and re-focus
          cursor.style.display = 'inline';
          if (document.querySelector('.breadcrumb-input') === input) {
            input.focus();
          }
          return;
        }

        dropdown.style.display = 'none';
        handleCancel();
      }, 200);
    });

    // Create persistent measureSpan element (kept in DOM to avoid layout thrashing)
    const measureSpan = document.createElement('span');
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.position = 'absolute';
    measureSpan.style.whiteSpace = 'pre';
    measureSpan.style.pointerEvents = 'none';
    document.body.appendChild(measureSpan);

    let isInitializing = true;

    input.addEventListener('focus', () => {
      // Show cursor when input gains focus
      cursor.style.display = 'inline-block';
      // Update position on focus only after initialization
      if (!isInitializing) {
        updateCursorPosition();
      }
    });

    // Function to update cursor position
    const updateCursorPosition = () => {
      try {
        // Only update if input is in the DOM
        if (!input.isConnected) return;

        // Copy input styles to measureSpan (only on first call or if styles changed)
        if (!measureSpan.dataset.styled) {
          const computedStyle = window.getComputedStyle(input);
          measureSpan.style.font = computedStyle.font;
          measureSpan.style.fontSize = computedStyle.fontSize;
          measureSpan.style.fontFamily = computedStyle.fontFamily;
          measureSpan.style.fontWeight = computedStyle.fontWeight;
          measureSpan.dataset.styled = 'true';
        }

        const cursorPos = input.selectionStart || 0;
        measureSpan.textContent = input.value.substring(0, cursorPos) || '\u200B';

        const width = measureSpan.offsetWidth;
        cursor.style.left = width + 'px';
      } catch (err) {
        // Silently fail if there's an error
        console.debug('Cursor position update error:', err);
      }
    };

    // Cleanup function to remove measureSpan when input is removed
    const cleanup = () => {
      if (measureSpan.parentNode) {
        measureSpan.remove();
      }
    };

    // Update cursor position on input and selection change
    input.addEventListener('input', updateCursorPosition);
    input.addEventListener('keyup', updateCursorPosition);
    input.addEventListener('click', updateCursorPosition);
    input.addEventListener('select', updateCursorPosition);

    // Append dropdown to body for fixed positioning (always needed)
    document.body.appendChild(dropdown);

    // Ensure input has focus (might have lost it during setup)
    input.focus();

    // Use requestAnimationFrame for smooth initial cursor positioning
    requestAnimationFrame(() => {
      isInitializing = false;
      updateCursorPosition();

      // Trigger autocomplete if there's an initial value
      if (initialValue) {
        updateDropdown();
      }
    });

    // Clean up measureSpan when done
    input.addEventListener(
      'blur',
      () => {
        setTimeout(cleanup, 250);
      },
      { once: true }
    );
  });

  // Track this promise to prevent overlapping calls
  activeFilenamePromise = promise;

  // Clear tracker when promise resolves
  promise.finally(() => {
    if (activeFilenamePromise === promise) {
      activeFilenamePromise = null;
    }
  });

  return promise;
};

/**
 * Quick file creation - triggered by typing
 * @param {string} initialChar - Initial character
 */
export const quickFileCreate = async (initialChar = '') => {
  // Only trigger if we have a directory context
  if (!appState.currentDirHandle) {
    return;
  }

  // Start loading files for autocomplete in background (don't block input creation)
  const filesPromise = FileSystemAdapter.listDirectory(appState.currentDirHandle)
    .then((entries) => entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name))
    .catch((err) => {
      console.error('Error listing directory:', err);
      return [];
    });

  // Show inline input IMMEDIATELY for responsive UI (files will load in background)
  // This ensures input is created and focused without delay
  const filename = await showFilenameInput(filesPromise, initialChar);

  if (filename === '__SKIP__') {
    // Input already exists with listeners, early return from showFilenameInput
    // Don't call updateBreadcrumb() - input is already showing and updated
    return;
  }

  if (!filename) {
    // User cancelled - restore breadcrumb
    updateBreadcrumb();
    return;
  }

  // Continue with newFile logic
  await createOrOpenFile(filename);
};

/**
 * Helper to create or open a file
 * @param {string} filePathOrName - File path or filename
 */
export const createOrOpenFile = async (filePathOrName) => {
  const previousFileHandle = appState.currentFileHandle;
  const previousFilename = appState.currentFilename;
  const previousDirHandle = appState.currentDirHandle;
  const previousPath = [...appState.currentPath];
  const wasDirty = appState.isDirty;

  try {
    let fileHandle;
    let fileExists = false;
    let actualFilename = filePathOrName;

    // Check if we have a path (contains /)
    if (filePathOrName.includes('/')) {
      const parts = filePathOrName.split('/');
      actualFilename = parts.pop(); // Last part is the filename
      const directories = parts.filter((p) => p); // Remove empty strings

      // Navigate through the directory path
      let targetDirHandle = appState.currentDirHandle;
      const newPath = [...appState.currentPath];

      for (const dirName of directories) {
        try {
          const dirHandle = await targetDirHandle.getDirectoryHandle(dirName, { create: false });
          targetDirHandle = dirHandle;
          newPath.push({ name: dirName, handle: dirHandle });
        } catch (err) {
          console.error(`Directory not found: ${dirName}`, err);
          alert(`Directory not found: ${dirName}`);
          return;
        }
      }

      // Update current context to the target directory
      appState.currentDirHandle = targetDirHandle;
      appState.currentPath = newPath;
    }

    // Check if the target is a directory or file
    if (appState.currentDirHandle) {
      // First try to see if it's a directory
      try {
        const dirHandle = await appState.currentDirHandle.getDirectoryHandle(actualFilename, {
          create: false,
        });

        // It's a directory - navigate to it
        appState.currentDirHandle = dirHandle;
        appState.currentPath.push({ name: actualFilename, handle: dirHandle });

        // Close current file
        appState.currentFileHandle = null;
        appState.currentFilename = '';
        await window.initEditor('', 'untitled');

        updateBreadcrumb();
        addToHistory();
        await showFilePicker(dirHandle);
        return;
      } catch {
        // Not a directory, try as file
        try {
          fileHandle = await appState.currentDirHandle.getFileHandle(actualFilename, {
            create: false,
          });
          fileExists = true;
        } catch {
          // File doesn't exist, create it
          fileHandle = await appState.currentDirHandle.getFileHandle(actualFilename, {
            create: true,
          });
        }
      }
    } else {
      fileHandle = await FileSystemAdapter.saveFilePicker(actualFilename);
      if (!fileHandle) {
        appState.currentFileHandle = previousFileHandle;
        appState.currentFilename = previousFilename;
        appState.currentDirHandle = previousDirHandle;
        appState.currentPath = previousPath;
        appState.isDirty = wasDirty;
        updateBreadcrumb();
        return;
      }
    }

    // Set as current file
    appState.currentFileHandle = fileHandle;
    appState.currentFilename = actualFilename;

    // If file exists, open it instead of creating new
    if (fileExists) {
      const content = await FileSystemAdapter.readFile(fileHandle);
      await window.initEditor(content, actualFilename);
      appState.isDirty = false;
      appState.originalContent = content;

      // Show notification that file was loaded from disk
      if (window.showFileReloadNotification) {
        window.showFileReloadNotification('Loaded from disk');
      }
    } else {
      await FileSystemAdapter.writeFile(fileHandle, '');
      await window.initEditor('', actualFilename);
      appState.isDirty = false;
      appState.originalContent = '';
    }

    updateBreadcrumb();
    window.updateLogoState();
    addToHistory();
    hideFilePicker();

    // Focus the editor after DOM updates complete
    appState.focusManager.focusEditor({ delay: 100, reason: 'new-file' });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error creating/opening file:', err);
      alert('Error: ' + err.message);
    }
    // Restore previous state
    appState.currentFileHandle = previousFileHandle;
    appState.currentFilename = previousFilename;
    appState.currentDirHandle = previousDirHandle;
    appState.currentPath = previousPath;
    appState.isDirty = wasDirty;
    updateBreadcrumb();
  }
};

/**
 * New file button handler
 */
export const newFile = async () => {
  if (!window.isFileSystemAccessSupported || !window.isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

  // Store current state in case we need to restore
  const previousFileHandle = appState.currentFileHandle;
  const previousFilename = appState.currentFilename;
  const wasDirty = appState.isDirty;

  if (
    appState.editorView &&
    appState.editorView.state.doc.toString().length > 0 &&
    appState.isDirty
  ) {
    const confirm = window.confirm('Current file has unsaved changes. Create new file anyway?');
    if (!confirm) return;
  }

  // Get existing files in current directory for autocomplete
  let existingFiles = [];
  if (appState.currentDirHandle) {
    try {
      const entries = await FileSystemAdapter.listDirectory(appState.currentDirHandle);
      existingFiles = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name);
    } catch (err) {
      console.error('Error listing directory:', err);
    }
  }

  // Show inline input for filename with autocomplete
  const filename = await showFilenameInput(existingFiles);

  if (!filename) {
    // User cancelled - restore previous state
    appState.currentFileHandle = previousFileHandle;
    appState.currentFilename = previousFilename;
    appState.isDirty = wasDirty;
    updateBreadcrumb();
    return;
  }

  // Use helper to create or open the file
  await createOrOpenFile(filename);
};

/**
 * Setup click-away to close file picker
 */
export const setupFilePickerClickAway = () => {
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('file-picker');
    if (!picker) return;

    // Check if picker is visible
    if (picker.classList.contains('hidden')) return;

    // Don't close if showing welcome or resume prompt
    if (picker.querySelector('.welcome-content')) return;

    // Don't close if click was inside the picker
    if (picker.contains(e.target)) return;

    // Don't close if click was on the resize handle
    if (e.target.closest('#file-picker-resize-handle')) return;

    // Don't close if click was on specific interactive elements
    // (Breadcrumb items use stopPropagation, but we also check container)
    const clickedElement = e.target;
    if (
      clickedElement.closest('.breadcrumb') ||
      clickedElement.closest('.nav-controls') ||
      clickedElement.closest('.autocomplete-dropdown')
    ) {
      return;
    }

    // Close the picker for clicks outside
    hideFilePicker();
  });
};
