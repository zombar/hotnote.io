import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { shell as shellMode } from '@codemirror/legacy-modes/mode/shell';
import { ruby as rubyMode } from '@codemirror/legacy-modes/mode/ruby';
import { groovy as groovyMode } from '@codemirror/legacy-modes/mode/groovy';
import { nginx as nginxMode } from '@codemirror/legacy-modes/mode/nginx';
import { python as pythonMode } from '@codemirror/legacy-modes/mode/python';
import {
  initMarkdownEditor,
  destroyMarkdownEditor,
  getMarkdownContent,
  isMarkdownEditorActive,
  focusMarkdownEditor,
} from './markdown-editor.js';

// File System Adapter - Browser File System Access API
const FileSystemAdapter = {
  // Check if file system access is supported
  isSupported() {
    return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
  },

  // Open directory picker
  async openDirectory() {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return dirHandle;
  },

  // List directory entries
  async listDirectory(dirHandle) {
    const entries = [];
    for await (const entry of dirHandle.values()) {
      entries.push(entry);
    }
    return entries;
  },

  // Read file content
  async readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return await file.text();
  },

  // Write file content
  async writeFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  },

  // Save file picker (for new files)
  async saveFilePicker(suggestedName) {
    return await window.showSaveFilePicker({
      types: [
        {
          description: 'Text Files',
          accept: { 'text/*': ['.txt', '.md', '.js', '.py', '.html', '.css', '.json'] },
        },
      ],
      suggestedName: suggestedName,
    });
  },

  // Get file metadata (name, etc.)
  async getFileMetadata(fileHandle) {
    const file = await fileHandle.getFile();
    return {
      name: file.name,
    };
  },

  // Navigate to subdirectory
  async navigateToSubdirectory(parentHandle, name) {
    return await parentHandle.getDirectoryHandle(name);
  },
};

// Session Management (.HN file persistence)
const createSessionFileName = (_dirHandle) => {
  return '.session_properties.HN';
};

const loadSessionFile = async (dirHandle) => {
  try {
    const sessionFileName = createSessionFileName(dirHandle);
    const sessionFileHandle = await dirHandle.getFileHandle(sessionFileName, { create: false });
    const sessionContent = await FileSystemAdapter.readFile(sessionFileHandle);
    return JSON.parse(sessionContent);
  } catch {
    // File doesn't exist or invalid JSON - return null
    return null;
  }
};

const saveSessionFile = async (dirHandle, sessionData) => {
  try {
    const sessionFileName = createSessionFileName(dirHandle);
    const sessionFileHandle = await dirHandle.getFileHandle(sessionFileName, { create: true });
    sessionData.lastModified = Date.now();
    const content = JSON.stringify(sessionData, null, 2);
    await FileSystemAdapter.writeFile(sessionFileHandle, content);
  } catch (err) {
    console.error('Error saving session file:', err);
  }
};

const createEmptySession = (folderName) => {
  return {
    version: '1.0',
    folderName: folderName,
    lastModified: Date.now(),
    session: {
      lastOpenFile: null,
    },
    comments: [],
  };
};

// App state
let currentFileHandle = null;
let currentFilename = 'untitled';
let currentDirHandle = null;
let rootDirHandle = null; // The initially opened directory (for session file)
let currentPath = []; // Array of {name, handle} objects
let editorView = null;
let isRichMode = false; // Track if rich markdown editor is active

// Navigation history
let navigationHistory = [];
let historyIndex = -1;

// Autosave
let autosaveEnabled = true;
let autosaveInterval = null;
let isDirty = false;

// Original file content (for detecting undo to original state)
let originalContent = '';

// Temp storage for unsaved changes
const TEMP_STORAGE_PREFIX = 'hotnote_temp_';

// Get file path key for storage
const getFilePathKey = () => {
  if (!currentFileHandle) return null;
  const pathParts = currentPath.map((p) => p.name);
  pathParts.push(currentFilename);
  return pathParts.join('/');
};

// Get relative file path (excluding root folder name) for session storage
const getRelativeFilePath = () => {
  if (!currentFileHandle) return null;
  // Skip the first element (root folder) since we're already inside it when loading
  const pathParts = currentPath.slice(1).map((p) => p.name);
  pathParts.push(currentFilename);
  return pathParts.join('/');
};

// Save temp changes
const saveTempChanges = () => {
  const key = getFilePathKey();
  if (!key || !isDirty) return;

  const content = getEditorContent();
  localStorage.setItem(TEMP_STORAGE_PREFIX + key, content);
};

// Load temp changes
const loadTempChanges = (key) => {
  return localStorage.getItem(TEMP_STORAGE_PREFIX + key);
};

// Clear temp changes
const clearTempChanges = (key) => {
  localStorage.removeItem(TEMP_STORAGE_PREFIX + key);
};

// Check if file has temp changes
const hasTempChanges = (key) => {
  return localStorage.getItem(TEMP_STORAGE_PREFIX + key) !== null;
};

// Custom syntax highlighting using brand colors (light mode - darker muted)
const brandHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#a65580', fontWeight: '500' }, // darker muted pink
  { tag: tags.operator, color: '#7a65ad' }, // darker muted purple
  { tag: tags.variableName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.string, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.number, color: '#7a65ad' }, // darker muted purple
  { tag: tags.bool, color: '#7a65ad' }, // darker muted purple
  { tag: tags.comment, color: '#999999', fontStyle: 'italic' }, // gray
  { tag: tags.tagName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.attributeName, color: '#a65580' }, // darker muted pink
  { tag: tags.propertyName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.function(tags.variableName), color: '#5a9cb8', fontWeight: '500' }, // darker muted cyan
  { tag: tags.className, color: '#a65580' }, // darker muted pink
  { tag: tags.typeName, color: '#a65580' }, // darker muted pink
  { tag: tags.regexp, color: '#7a65ad' }, // darker muted purple
  { tag: tags.escape, color: '#a65580' }, // darker muted pink
  { tag: tags.meta, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.constant(tags.variableName), color: '#7a65ad' }, // darker muted purple
]);

// Custom syntax highlighting using brand colors (dark mode - lighter muted)
const brandHighlightStyleDark = HighlightStyle.define([
  { tag: tags.keyword, color: '#e8bcd4', fontWeight: '500' }, // lighter muted pink
  { tag: tags.operator, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.variableName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.string, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.number, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.bool, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.comment, color: '#888888', fontStyle: 'italic' }, // gray
  { tag: tags.tagName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.attributeName, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.propertyName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.function(tags.variableName), color: '#b8e5f2', fontWeight: '500' }, // lighter muted cyan
  { tag: tags.className, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.typeName, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.regexp, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.escape, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.meta, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.constant(tags.variableName), color: '#c8bce8' }, // lighter muted purple
]);

// Language detection based on file extension
const getLanguageExtension = (filename) => {
  // Check for special filenames without extensions
  const basename = filename.split('/').pop().toLowerCase();

  // Bazel files (use Python/Starlark syntax)
  if (
    basename === 'build' ||
    basename === 'build.bazel' ||
    basename === 'workspace' ||
    basename === 'workspace.bazel'
  ) {
    return StreamLanguage.define(pythonMode);
  }

  // Jenkinsfile
  if (basename === 'jenkinsfile') {
    return StreamLanguage.define(groovyMode);
  }

  // Nginx config
  if (basename === 'nginx.conf' || basename.startsWith('nginx.')) {
    return StreamLanguage.define(nginxMode);
  }

  // .gitignore and other ignore files
  if (basename === '.gitignore' || basename.endsWith('ignore')) {
    return StreamLanguage.define(shellMode);
  }

  const ext = filename.split('.').pop().toLowerCase();
  const langMap = {
    js: javascript(),
    jsx: javascript({ jsx: true }),
    ts: javascript({ typescript: true }),
    tsx: javascript({ typescript: true, jsx: true }),
    py: python(),
    go: go(),
    rs: rust(),
    php: php(),
    java: java(),
    groovy: StreamLanguage.define(groovyMode),
    c: cpp(),
    cpp: cpp(),
    cc: cpp(),
    cxx: cpp(),
    h: cpp(),
    hpp: cpp(),
    xml: xml(),
    yaml: yaml(),
    yml: yaml(),
    sh: StreamLanguage.define(shellMode),
    bash: StreamLanguage.define(shellMode),
    rb: StreamLanguage.define(rubyMode),
    html: html(),
    htm: html(),
    css: css(),
    scss: css(),
    json: json(),
    md: markdown(),
    markdown: markdown(),
    bzl: StreamLanguage.define(pythonMode), // Bazel/Starlark files
    conf: StreamLanguage.define(nginxMode), // Nginx config files
    tf: javascript(), // Terraform files (HCL syntax similar to JavaScript)
    tfvars: javascript(), // Terraform variable files
    hcl: javascript(), // HashiCorp Configuration Language
  };
  return langMap[ext] || [];
};

// Helper: Check if file is markdown
const isMarkdownFile = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  return ext === 'md' || ext === 'markdown';
};

// Helper: Get current editor content
const getEditorContent = () => {
  if (isRichMode && isMarkdownEditorActive()) {
    return getMarkdownContent();
  } else if (editorView) {
    return editorView.state.doc.toString();
  }
  return '';
};

// Initialize editor (CodeMirror or Milkdown based on file type and mode)
const initEditor = async (initialContent = '', filename = 'untitled') => {
  // Store original content for undo detection
  originalContent = initialContent;

  // Clear both editors first
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  if (isMarkdownEditorActive()) {
    destroyMarkdownEditor();
  }

  // Determine if we should use rich markdown editor
  const shouldUseRichEditor = isMarkdownFile(filename) && isRichMode;

  if (shouldUseRichEditor) {
    // Initialize Milkdown for markdown files
    const editorContainer = document.getElementById('editor');
    editorContainer.innerHTML = ''; // Clear container

    try {
      await initMarkdownEditor(editorContainer, initialContent, (content) => {
        // Handle content changes
        const currentContent = content;

        if (currentContent === originalContent) {
          if (isDirty) {
            isDirty = false;
            const key = getFilePathKey();
            if (key) {
              clearTempChanges(key);
            }
            updateBreadcrumb();
          }
        } else {
          if (!isDirty) {
            isDirty = true;
            updateBreadcrumb();
          }
        }
      });
    } catch (error) {
      console.error('Failed to initialize Milkdown, falling back to CodeMirror:', error);
      // Fall back to CodeMirror if Milkdown fails
      await initCodeMirrorEditor(initialContent, filename);
    }
  } else {
    // Initialize CodeMirror for all other files
    await initCodeMirrorEditor(initialContent, filename);
  }

  isDirty = false;
  updateRichToggleButton();
};

// Initialize CodeMirror editor
const initCodeMirrorEditor = async (initialContent = '', filename = 'untitled') => {
  // Use appropriate highlight style based on current theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const highlightStyle = isDark ? brandHighlightStyleDark : brandHighlightStyle;

  // Check if we have a file open
  const hasFileOpen = currentFileHandle !== null;

  const extensions = [
    lineNumbers(),
    EditorView.lineWrapping,
    syntaxHighlighting(highlightStyle),
    keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          saveFile();
          return true;
        },
      },
      {
        key: 'Mod-Shift-o',
        run: () => {
          openFolder();
          return true;
        },
      },
      {
        key: 'Mod-n',
        run: () => {
          newFile();
          return true;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const currentContent = update.state.doc.toString();

        // Check if we've undone back to original content
        if (currentContent === originalContent) {
          if (isDirty) {
            isDirty = false;
            // Clear temp storage
            const key = getFilePathKey();
            if (key) {
              clearTempChanges(key);
            }
            updateBreadcrumb();
          }
        } else {
          // Content differs from original
          if (!isDirty) {
            isDirty = true;
            updateBreadcrumb();
          }
        }
      }

      // Save editor state on selection change or scroll
      if (update.selectionSet || update.geometryChanged) {
        debouncedSaveEditorState();
      }
    }),
  ];

  // If no file is open, make editor read-only and show placeholder
  if (!hasFileOpen) {
    extensions.push(EditorState.readOnly.of(true));
    extensions.push(
      placeholder(
        'Open a file or create a new one to start editing (Cmd/Ctrl+Shift+O or Cmd/Ctrl+N)'
      )
    );
    extensions.push(EditorView.editable.of(false));
  }

  const languageExtension = getLanguageExtension(filename);
  if (languageExtension) {
    extensions.push(languageExtension);
  }

  const startState = EditorState.create({
    doc: initialContent,
    extensions,
  });

  editorView = new EditorView({
    state: startState,
    parent: document.getElementById('editor'),
  });

  // Add scroll listener to save editor state
  if (editorView && editorView.scrollDOM) {
    editorView.scrollDOM.addEventListener('scroll', debouncedSaveEditorState);
  }
};

// Update logo state based on whether a folder or file is open
const updateLogoState = () => {
  const logo = document.querySelector('.app-logo');
  if (logo && (currentFileHandle || currentDirHandle)) {
    logo.classList.add('compact');
  }
};

// Update breadcrumb display
const updateBreadcrumb = () => {
  const breadcrumb = document.getElementById('breadcrumb');
  breadcrumb.innerHTML = '';

  if (currentPath.length === 0) {
    // No folder opened
    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    item.textContent = currentFilename;
    if (isDirty) {
      item.classList.add('has-changes');
    }
    breadcrumb.appendChild(item);
  } else {
    // Show path with abbreviation for long paths
    const MAX_VISIBLE_ITEMS = 7; // Maximum items to show before abbreviating
    const ITEMS_TO_SHOW_AT_END = 5; // How many items to show at the end after ellipsis

    if (currentPath.length > MAX_VISIBLE_ITEMS) {
      // Show first item
      const firstItem = document.createElement('span');
      firstItem.className = 'breadcrumb-item';
      firstItem.textContent = currentPath[0].name;
      firstItem.dataset.index = 0;
      firstItem.addEventListener('click', () => navigateToPathIndex(0));
      breadcrumb.appendChild(firstItem);

      // Show ellipsis
      const ellipsis = document.createElement('span');
      ellipsis.className = 'breadcrumb-item breadcrumb-ellipsis';
      ellipsis.textContent = '...';
      breadcrumb.appendChild(ellipsis);

      // Show last N items
      const startIndex = currentPath.length - ITEMS_TO_SHOW_AT_END;
      for (let i = startIndex; i < currentPath.length; i++) {
        const segment = currentPath[i];
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        item.dataset.index = i;
        item.addEventListener('click', () => navigateToPathIndex(i));
        breadcrumb.appendChild(item);
      }
    } else {
      // Show full path
      currentPath.forEach((segment, index) => {
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        item.dataset.index = index;

        // Make all folder items clickable (even the last one)
        item.addEventListener('click', () => navigateToPathIndex(index));

        breadcrumb.appendChild(item);
      });
    }

    // Add current file if opened, or placeholder if no file
    if (currentFileHandle) {
      const fileItem = document.createElement('span');
      fileItem.className = 'breadcrumb-item';
      if (isDirty) {
        fileItem.classList.add('has-changes');
      }
      fileItem.textContent = currentFilename;
      breadcrumb.appendChild(fileItem);
    } else {
      // Show placeholder when folder is open but no file selected
      const placeholder = document.createElement('span');
      placeholder.className = 'breadcrumb-item breadcrumb-placeholder';
      placeholder.textContent = 'filename (/ for search)';
      breadcrumb.appendChild(placeholder);
    }
  }

  // Set browser tab title: filename (folder/path) • - hotnote
  if (currentFileHandle) {
    const folderPath =
      currentPath.length > 0 ? ` (${currentPath.map((p) => p.name).join('/')})` : '';
    document.title = `${currentFilename}${folderPath}${isDirty ? ' •' : ''} - hotnote`;
  } else if (currentPath.length > 0) {
    document.title = `(${currentPath.map((p) => p.name).join('/')}) - hotnote`;
  } else {
    document.title = 'hotnote';
  }
};

// Update rich toggle button visibility and state
const updateRichToggleButton = () => {
  const richToggleBtn = document.getElementById('rich-toggle-btn');

  if (isMarkdownFile(currentFilename)) {
    richToggleBtn.classList.remove('hidden');
    richToggleBtn.textContent = isRichMode ? 'source' : 'rich';
    richToggleBtn.title = isRichMode ? 'Switch to source mode' : 'Switch to rich mode';
  } else {
    richToggleBtn.classList.add('hidden');
  }
};

// Toggle between rich and source mode for markdown files
const toggleRichMode = async () => {
  if (!isMarkdownFile(currentFilename)) return;

  // Save current content before switching
  const currentContent = getEditorContent();

  // Toggle mode
  isRichMode = !isRichMode;

  // Reinitialize editor with new mode
  await initEditor(currentContent, currentFilename);

  updateRichToggleButton();
};

// Navigate to a specific path index (breadcrumb click)
const navigateToPathIndex = async (index) => {
  if (index >= currentPath.length) return;

  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  // Truncate path to the clicked index
  currentPath = currentPath.slice(0, index + 1);
  currentDirHandle = currentPath[currentPath.length - 1].handle;

  // Close current file
  currentFileHandle = null;
  currentFilename = '';
  await initEditor('', 'untitled');

  // Add to navigation history
  addToHistory();

  // Show file picker for this directory
  await showFilePicker(currentDirHandle);
  updateBreadcrumb();
};

// Add current state to navigation history
const addToHistory = () => {
  // Remove any forward history when navigating to a new location
  navigationHistory = navigationHistory.slice(0, historyIndex + 1);

  navigationHistory.push({
    path: [...currentPath],
    dirHandle: currentDirHandle,
    fileHandle: currentFileHandle,
    filename: currentFilename,
  });

  historyIndex = navigationHistory.length - 1;
  updateNavigationButtons();
};

// Update back/forward button states
const updateNavigationButtons = () => {
  document.getElementById('back-btn').disabled = historyIndex <= 0;
  document.getElementById('forward-btn').disabled = historyIndex >= navigationHistory.length - 1;
  document.getElementById('folder-up-btn').disabled = currentPath.length === 0;
};

// Navigate back
const goBack = async () => {
  if (historyIndex <= 0) return;

  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  historyIndex--;
  const state = navigationHistory[historyIndex];

  currentPath = [...state.path];
  currentDirHandle = state.dirHandle;
  currentFileHandle = state.fileHandle;
  currentFilename = state.filename;

  if (currentFileHandle) {
    const file = await currentFileHandle.getFile();
    currentFilename = file.name;

    // Load original file content from disk
    const fileContent = await file.text();

    // Check for temp changes
    const pathKey = getFilePathKey();
    const tempContent = loadTempChanges(pathKey);

    // Set rich mode for markdown files
    if (isMarkdownFile(currentFilename)) {
      isRichMode = true;
    } else {
      isRichMode = false;
    }

    // Initialize with file content (sets originalContent)
    await initEditor(fileContent, currentFilename);

    // If we have temp changes, apply them
    if (tempContent !== null) {
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: tempContent },
        });
      } else if (isRichMode && isMarkdownFile(currentFilename)) {
        await initEditor(tempContent, currentFilename);
      }
      isDirty = true;
    }
  } else {
    await initEditor('', 'untitled');
  }

  if (currentFileHandle) {
    hideFilePicker();
  } else if (currentDirHandle) {
    await showFilePicker(currentDirHandle);
  }

  updateBreadcrumb();
  updateLogoState();
  updateNavigationButtons();
};

// Navigate forward
const goForward = async () => {
  if (historyIndex >= navigationHistory.length - 1) return;

  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  historyIndex++;
  const state = navigationHistory[historyIndex];

  currentPath = [...state.path];
  currentDirHandle = state.dirHandle;
  currentFileHandle = state.fileHandle;
  currentFilename = state.filename;

  if (currentFileHandle) {
    const file = await currentFileHandle.getFile();
    currentFilename = file.name;

    // Load original file content from disk
    const fileContent = await file.text();

    // Check for temp changes
    const pathKey = getFilePathKey();
    const tempContent = loadTempChanges(pathKey);

    // Set rich mode for markdown files
    if (isMarkdownFile(currentFilename)) {
      isRichMode = true;
    } else {
      isRichMode = false;
    }

    // Initialize with file content (sets originalContent)
    await initEditor(fileContent, currentFilename);

    // If we have temp changes, apply them
    if (tempContent !== null) {
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: tempContent },
        });
      } else if (isRichMode && isMarkdownFile(currentFilename)) {
        await initEditor(tempContent, currentFilename);
      }
      isDirty = true;
    }
  } else {
    await initEditor('', 'untitled');
  }

  if (currentFileHandle) {
    hideFilePicker();
  } else if (currentDirHandle) {
    await showFilePicker(currentDirHandle);
  }

  updateBreadcrumb();
  updateLogoState();
  updateNavigationButtons();
};

// Navigate up one folder
const goFolderUp = async () => {
  if (currentPath.length === 0) return;

  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  if (currentPath.length === 1) {
    // At root level, prompt to open a new parent folder
    await openFolder();
  } else {
    // Remove the last path segment
    currentPath.pop();
    currentDirHandle = currentPath[currentPath.length - 1].handle;
    currentFileHandle = null;
    currentFilename = '';
    await initEditor('', 'untitled');

    addToHistory();
    await showFilePicker(currentDirHandle);
    updateBreadcrumb();
  }
};

// Check if File System Access API is supported
const isFileSystemAccessSupported = () => {
  return FileSystemAdapter.isSupported();
};

// Open folder
const openFolder = async () => {
  if (!isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

  try {
    // Save temp changes if file is dirty
    if (isDirty && currentFileHandle) {
      saveTempChanges();
    }

    const dirHandle = await FileSystemAdapter.openDirectory();
    if (!dirHandle) return; // User cancelled

    currentDirHandle = dirHandle;
    rootDirHandle = dirHandle; // Set root directory for session file
    currentPath = [{ name: dirHandle.name, handle: dirHandle }];
    currentFileHandle = null;
    currentFilename = '';
    await initEditor('', 'untitled');

    // Save folder name to localStorage for auto-resume
    localStorage.setItem('lastFolderName', dirHandle.name);

    // Load session file and restore last open file
    let sessionData = await loadSessionFile(rootDirHandle);
    if (!sessionData) {
      // Create empty session file
      console.log('No session file found, creating new one');
      sessionData = createEmptySession(dirHandle.name);
      await saveSessionFile(rootDirHandle, sessionData);
    } else {
      console.log('Session file loaded:', sessionData);
    }

    // Track if file was successfully restored
    let fileRestored = false;

    // Try to restore last open file
    if (sessionData.session && sessionData.session.lastOpenFile) {
      const lastFile = sessionData.session.lastOpenFile;
      console.log('Attempting to restore last file:', lastFile.path);
      const opened = await openFileByPath(lastFile.path);
      console.log('File opened successfully:', opened);

      if (opened) {
        fileRestored = true;

        // Restore editor state after a brief delay to let editor initialize
        setTimeout(() => {
          if (editorView) {
            // Restore scroll position
            if (lastFile.scrollTop !== undefined) {
              editorView.scrollDOM.scrollTop = lastFile.scrollTop;
            }
            if (lastFile.scrollLeft !== undefined) {
              editorView.scrollDOM.scrollLeft = lastFile.scrollLeft;
            }
            // Restore cursor position
            if (lastFile.cursorPosition !== undefined) {
              try {
                editorView.dispatch({
                  selection: { anchor: lastFile.cursorPosition, head: lastFile.cursorPosition },
                });
              } catch (err) {
                console.error('Error restoring cursor position:', err);
              }
            }
          } else if (isMarkdownEditorActive()) {
            // Restore scroll for Milkdown
            const milkdownScroller = document.querySelector('.milkdown');
            if (milkdownScroller && lastFile.scrollTop !== undefined) {
              milkdownScroller.scrollTop = lastFile.scrollTop;
            }
          }

          // Restore rich mode for markdown files
          if (lastFile.isRichMode !== undefined && isMarkdownFile(currentFilename)) {
            isRichMode = lastFile.isRichMode;
            updateRichToggleButton();
          }
        }, 100);
      }
    }

    addToHistory();

    // Only show file picker if file was not restored
    if (!fileRestored) {
      await showFilePicker(dirHandle);
    }

    updateBreadcrumb();
    updateLogoState();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error opening folder:', err);
      alert('Error opening folder: ' + err.message);
    }
  }
};

// Show file picker for a directory
const showFilePicker = async (dirHandle) => {
  const picker = document.getElementById('file-picker');
  picker.classList.remove('hidden');

  // Create header
  picker.innerHTML = `
        <div class="file-picker-header">
            <span class="file-picker-path">${currentPath.map((p) => p.name).join(' › ')}</span>
            <button class="file-picker-close" onclick="hideFilePicker()">close</button>
        </div>
        <div class="file-list" id="file-list"></div>
    `;

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
    icon.textContent = entry.kind === 'directory' ? '📁' : '📄';

    const name = document.createElement('span');
    name.className = 'file-item-name';
    name.textContent = entry.name;

    // Check if file has temp changes
    if (entry.kind === 'file') {
      const pathParts = currentPath.map((p) => p.name);
      pathParts.push(entry.name);
      const filePathKey = pathParts.join('/');
      if (hasTempChanges(filePathKey)) {
        item.classList.add('has-unsaved-changes');
      }
    }

    item.appendChild(icon);
    item.appendChild(name);

    // Add delete button for files only
    if (entry.kind === 'file') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'file-item-delete';
      deleteBtn.textContent = 'rm';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent opening the file
        await deleteFile(entry);
      });
      item.appendChild(deleteBtn);
    }

    item.addEventListener('click', async () => {
      if (entry.kind === 'directory') {
        await navigateToDirectory(entry);
      } else {
        await openFileFromPicker(entry);
      }
    });

    fileList.appendChild(item);
  }
};

// Hide file picker
window.hideFilePicker = () => {
  document.getElementById('file-picker').classList.add('hidden');
};

// Delete a file
const deleteFile = async (fileHandle) => {
  const confirmDelete = window.confirm(
    `Are you sure you want to delete "${fileHandle.name}"? This action cannot be undone.`
  );

  if (!confirmDelete) {
    return;
  }

  try {
    // Remove the file from the directory
    await currentDirHandle.removeEntry(fileHandle.name);

    // If the deleted file is currently open, close it
    if (currentFileHandle && currentFileHandle.name === fileHandle.name) {
      currentFileHandle = null;
      currentFilename = '';
      isDirty = false;
      await initEditor('', 'untitled');
      updateBreadcrumb();
    }

    // Clear temp changes for this file
    const pathParts = currentPath.map((p) => p.name);
    pathParts.push(fileHandle.name);
    const filePathKey = pathParts.join('/');
    clearTempChanges(filePathKey);

    // Refresh the file picker
    await showFilePicker(currentDirHandle);
  } catch (err) {
    console.error('Error deleting file:', err);
    alert('Error deleting file: ' + err.message);
  }
};

// Navigate to a subdirectory
const navigateToDirectory = async (dirHandle) => {
  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  currentPath.push({ name: dirHandle.name, handle: dirHandle });
  currentDirHandle = dirHandle;

  // Close current file
  currentFileHandle = null;
  currentFilename = '';
  await initEditor('', 'untitled');

  addToHistory();
  await showFilePicker(dirHandle);
  updateBreadcrumb();
};

// Open a file by relative path from current directory
const openFileByPath = async (relativePath) => {
  if (!currentDirHandle || !relativePath) return false;

  try {
    const parts = relativePath.split('/');
    const filename = parts.pop();

    let targetDir = currentDirHandle;

    // Navigate through subdirectories
    for (const dirName of parts) {
      if (dirName) {
        // Skip empty parts
        targetDir = await targetDir.getDirectoryHandle(dirName);
      }
    }

    // Get file handle
    const fileHandle = await targetDir.getFileHandle(filename);

    // Update current path if navigated to subdirectory
    if (parts.length > 0 && parts[0]) {
      // Reconstruct path by navigating from root
      currentPath = [currentPath[0]]; // Keep root
      let pathDir = currentDirHandle;
      for (const dirName of parts) {
        if (dirName) {
          pathDir = await pathDir.getDirectoryHandle(dirName);
          currentPath.push({ name: dirName, handle: pathDir });
        }
      }
    }

    // Open the file using existing logic
    await openFileFromPicker(fileHandle);
    return true;
  } catch (err) {
    console.error('Error opening file by path:', relativePath, err);
    return false;
  }
};

// Open a file from the file picker
const openFileFromPicker = async (fileHandle) => {
  try {
    // Save temp changes for currently open file if dirty
    if (isDirty && currentFileHandle) {
      saveTempChanges();
    }

    currentFileHandle = fileHandle;
    currentFilename = fileHandle.name;

    // Set rich mode to true for markdown files by default
    if (isMarkdownFile(fileHandle.name)) {
      isRichMode = true;
    } else {
      isRichMode = false;
    }

    // Always load the original file content from disk
    const fileContent = await FileSystemAdapter.readFile(fileHandle);

    // Check for temp changes
    const pathKey = getFilePathKey();
    const tempContent = loadTempChanges(pathKey);

    if (tempContent !== null) {
      // Restore temp changes but remember the file content as original
      isDirty = true;
    } else {
      // Load from file
      isDirty = false;
    }

    // Initialize editor with the content (temp or file)
    // but originalContent will be set to fileContent in initEditor
    await initEditor(fileContent, fileHandle.name);

    // If we loaded temp content, replace the editor content and mark as dirty
    if (tempContent !== null) {
      if (editorView) {
        // CodeMirror editor
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: tempContent },
        });
      }
      // Note: For Milkdown, we pass tempContent directly to initEditor above
      // So we need to reinitialize with tempContent for Milkdown
      if (isRichMode && isMarkdownFile(file.name)) {
        await initEditor(tempContent, file.name);
      }
      isDirty = true;
    }

    updateBreadcrumb();
    updateLogoState();
    hideFilePicker();

    addToHistory();

    // Save session file with current file info (debounced to avoid excessive writes)
    if (currentDirHandle) {
      setTimeout(async () => {
        try {
          const filePath = getRelativeFilePath();
          if (filePath) {
            let sessionData = await loadSessionFile(currentDirHandle);
            if (!sessionData) {
              sessionData = createEmptySession(currentDirHandle.name);
            }

            sessionData.session.lastOpenFile = {
              path: filePath,
              cursorPosition: editorView ? editorView.state.selection.main.head : 0,
              scrollTop: editorView ? editorView.scrollDOM.scrollTop : 0,
              scrollLeft: editorView ? editorView.scrollDOM.scrollLeft : 0,
              isRichMode: isRichMode,
            };

            await saveSessionFile(rootDirHandle, sessionData);
          }
        } catch (err) {
          console.error('Error saving session file:', err);
        }
      }, 500);
    }
  } catch (err) {
    console.error('Error opening file:', err);
    alert('Error opening file: ' + err.message);
  }
};

// Save file
const saveFile = async () => {
  if (!isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

  if (!isDirty && currentFileHandle) {
    // No changes to save
    return;
  }

  try {
    const content = getEditorContent();

    // If no file handle exists, prompt for save location
    if (!currentFileHandle) {
      currentFileHandle = await FileSystemAdapter.saveFilePicker(currentFilename || 'untitled.txt');

      if (!currentFileHandle) return; // User cancelled

      currentFilename = currentFileHandle.name;
      updateBreadcrumb();
    }

    // Write to file
    await FileSystemAdapter.writeFile(currentFileHandle, content);

    isDirty = false;

    // Update original content to the saved content
    originalContent = content;

    // Clear temp changes after successful save
    const pathKey = getFilePathKey();
    if (pathKey) {
      clearTempChanges(pathKey);
    }

    updateBreadcrumb();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error saving file:', err);
      alert('Error saving file: ' + err.message);
    }
  }
};

// Autosave functionality
const startAutosave = () => {
  if (autosaveInterval) {
    clearInterval(autosaveInterval);
  }

  autosaveInterval = setInterval(async () => {
    if (isDirty && currentFileHandle) {
      await saveFile();
    }
  }, 2000); // Save every 2 seconds if dirty
};

const stopAutosave = () => {
  if (autosaveInterval) {
    clearInterval(autosaveInterval);
    autosaveInterval = null;
  }
};

const toggleAutosave = (enabled) => {
  autosaveEnabled = enabled;
  if (enabled) {
    startAutosave();
  } else {
    stopAutosave();
  }
};

// Debounce utility
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Save current editor state to session file (debounced)
const saveEditorStateToSession = async () => {
  if (!currentDirHandle || !currentFileHandle) return;

  try {
    const filePath = getRelativeFilePath();
    if (!filePath) return;

    let sessionData = await loadSessionFile(currentDirHandle);
    if (!sessionData) {
      sessionData = createEmptySession(currentDirHandle.name);
    }

    // Get current editor state
    let cursorPosition = 0;
    let scrollTop = 0;
    let scrollLeft = 0;

    if (editorView) {
      cursorPosition = editorView.state.selection.main.head;
      scrollTop = editorView.scrollDOM.scrollTop;
      scrollLeft = editorView.scrollDOM.scrollLeft;
    } else if (isMarkdownEditorActive()) {
      const milkdownScroller = document.querySelector('.milkdown');
      if (milkdownScroller) {
        scrollTop = milkdownScroller.scrollTop;
        scrollLeft = milkdownScroller.scrollLeft;
      }
    }

    sessionData.session.lastOpenFile = {
      path: filePath,
      cursorPosition: cursorPosition,
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
      isRichMode: isRichMode,
    };

    await saveSessionFile(rootDirHandle, sessionData);
  } catch (err) {
    console.error('Error saving editor state:', err);
  }
};

// Debounced version (save every 2 seconds)
const debouncedSaveEditorState = debounce(saveEditorStateToSession, 2000);

// Fuzzy match helper - handles case-insensitive, substring, and space-as-wildcard matching
const fuzzyMatch = (text, query) => {
  if (!query) return true;

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Normalize: replace spaces in query with a regex pattern that matches '', '-', or '_'
  const queryPattern = queryLower
    .split(' ')
    .map((part) =>
      part
        .split('')
        .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('')
    )
    .join('[\\s\\-_]*');

  const regex = new RegExp(queryPattern);
  return regex.test(textLower);
};

// Calculate relevance score for search results
const calculateRelevance = (filename, query, depth = 0) => {
  if (!query) return 1000;

  const filenameLower = filename.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match (highest priority)
  if (filenameLower === queryLower) {
    return 1000 - depth;
  }

  // Prefix match
  if (filenameLower.startsWith(queryLower)) {
    return 500 - depth;
  }

  // Substring match
  if (filenameLower.includes(queryLower)) {
    return 100 - depth;
  }

  // Fuzzy match (lowest priority)
  return 10 - depth;
};

// Recursive search through directories (async generator for progressive results)
const recursiveSearchFiles = async function* (dirHandle, query, maxDepth = 10, maxResults = 100) {
  const visited = new Set(); // Prevent infinite loops
  let resultCount = 0;

  const traverse = async function* (currentDir, currentPath = '', depth = 0) {
    // Stop if we've hit depth limit or result limit
    if (depth > maxDepth || resultCount >= maxResults) {
      return;
    }

    try {
      const entries = await FileSystemAdapter.listDirectory(currentDir);

      for (const entry of entries) {
        // Stop if we've reached result limit
        if (resultCount >= maxResults) {
          return;
        }

        // Skip hidden files and folders (starting with .)
        if (entry.name.startsWith('.')) {
          continue;
        }

        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        // Check if we've already visited this entry (avoid cycles)
        const entryKey = `${depth}:${entryPath}`;
        if (visited.has(entryKey)) {
          continue;
        }
        visited.add(entryKey);

        // Check if entry matches query
        if (fuzzyMatch(entry.name, query)) {
          const relevance = calculateRelevance(entry.name, query, depth);
          yield {
            name: entry.name,
            path: currentPath,
            fullPath: entryPath,
            kind: entry.kind,
            handle: entry,
            depth: depth,
            relevance: relevance,
          };
          resultCount++;
        }

        // Recursively search subdirectories
        if (entry.kind === 'directory' && resultCount < maxResults) {
          yield* traverse(entry, entryPath, depth + 1);
        }
      }
    } catch (err) {
      // Skip directories we can't access
      console.warn(`Cannot access directory: ${currentPath}`, err);
    }
  };

  yield* traverse(dirHandle);
};

// Helper function to create a dropdown item for autocomplete
const createDropdownItem = (result, input, dropdown, handleSubmit) => {
  const item = document.createElement('div');
  item.className = 'autocomplete-item';
  if (result.kind === 'directory') {
    item.classList.add('is-directory');
  }

  // Name line
  const nameDiv = document.createElement('div');
  nameDiv.className = 'autocomplete-item-name';
  const icon = result.kind === 'directory' ? '📁 ' : '📄 ';
  nameDiv.textContent = icon + result.name;

  // Path line (if not in current directory)
  if (result.path) {
    const pathDiv = document.createElement('div');
    pathDiv.className = 'autocomplete-item-path';
    pathDiv.textContent = result.path;
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

// Show inline filename input with autocomplete
const showFilenameInput = async (existingFiles = [], initialValue = '') => {
  return new Promise((resolve) => {
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = '';

    // Rebuild path if exists
    if (currentPath.length > 0) {
      currentPath.forEach((segment, _index) => {
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        breadcrumb.appendChild(item);
      });
    }

    // Create autocomplete container
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.className = 'autocomplete-container';

    // Add input where filename would normally appear
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'breadcrumb-input';
    input.placeholder = 'filename (/ for search)';
    input.value = initialValue;
    input.autocomplete = 'off';

    // Create dropdown for autocomplete
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.display = 'none';

    let selectedIndex = -1;
    let filteredFiles = [];
    let resolved = false;
    let searchInProgress = false;
    const header = document.querySelector('header');

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

        if (isRecursiveMode && currentDirHandle) {
          // Show loading animation for recursive search
          header.classList.add('searching');

          // Recursive search mode with progressive results
          const results = [];
          dropdown.innerHTML = '';

          // Stream results as they're found
          for await (const result of recursiveSearchFiles(currentDirHandle, searchQuery)) {
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
          filteredFiles = existingFiles
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

    const handleSubmit = () => {
      if (resolved) return;
      resolved = true;

      // Clean up dropdown and loading animation
      dropdown.remove();
      header.classList.remove('searching');

      const filename = input.value.trim();
      // Validate filename
      if (!filename) {
        resolve(null);
        return;
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
            handleCancel();
          }
        }
      } else {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      }
    });

    input.addEventListener('blur', () => {
      // Delay to allow click on dropdown
      setTimeout(() => {
        dropdown.style.display = 'none';
        handleCancel();
      }, 200);
    });

    autocompleteContainer.appendChild(input);
    breadcrumb.appendChild(autocompleteContainer);
    // Append dropdown to body for fixed positioning
    document.body.appendChild(dropdown);
    input.focus();

    // Trigger autocomplete if there's an initial value
    if (initialValue) {
      updateDropdown();
    }
  });
};

// Quick file creation - triggered by typing
const quickFileCreate = async (initialChar = '') => {
  // Only trigger if we have a directory context
  if (!currentDirHandle) {
    return;
  }

  // Get existing files in current directory for autocomplete
  let existingFiles = [];
  try {
    const entries = await FileSystemAdapter.listDirectory(currentDirHandle);
    existingFiles = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name);
  } catch (err) {
    console.error('Error listing directory:', err);
  }

  // Show inline input for filename with initial character
  const filename = await showFilenameInput(existingFiles, initialChar);

  if (!filename) {
    // User cancelled - restore breadcrumb
    updateBreadcrumb();
    return;
  }

  // Continue with newFile logic
  await createOrOpenFile(filename);
};

// Helper to create or open a file
const createOrOpenFile = async (filePathOrName) => {
  const previousFileHandle = currentFileHandle;
  const previousFilename = currentFilename;
  const previousDirHandle = currentDirHandle;
  const previousPath = [...currentPath];
  const wasDirty = isDirty;

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
      let targetDirHandle = currentDirHandle;
      const newPath = [...currentPath];

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
      currentDirHandle = targetDirHandle;
      currentPath = newPath;
    }

    // Check if the target is a directory or file
    if (currentDirHandle) {
      // First try to see if it's a directory
      try {
        const dirHandle = await currentDirHandle.getDirectoryHandle(actualFilename, {
          create: false,
        });

        // It's a directory - navigate to it
        currentDirHandle = dirHandle;
        currentPath.push({ name: actualFilename, handle: dirHandle });

        // Close current file
        currentFileHandle = null;
        currentFilename = '';
        await initEditor('', 'untitled');

        updateBreadcrumb();
        addToHistory();
        await showFilePicker(dirHandle);
        return;
      } catch {
        // Not a directory, try as file
        try {
          fileHandle = await currentDirHandle.getFileHandle(actualFilename, { create: false });
          fileExists = true;
        } catch {
          // File doesn't exist, create it
          fileHandle = await currentDirHandle.getFileHandle(actualFilename, { create: true });
        }
      }
    } else {
      fileHandle = await FileSystemAdapter.saveFilePicker(actualFilename);
      if (!fileHandle) {
        currentFileHandle = previousFileHandle;
        currentFilename = previousFilename;
        currentDirHandle = previousDirHandle;
        currentPath = previousPath;
        isDirty = wasDirty;
        updateBreadcrumb();
        return;
      }
    }

    // Set as current file
    currentFileHandle = fileHandle;
    currentFilename = actualFilename;

    // Set rich mode for markdown files
    if (isMarkdownFile(actualFilename)) {
      isRichMode = true;
    } else {
      isRichMode = false;
    }

    // If file exists, open it instead of creating new
    if (fileExists) {
      const content = await FileSystemAdapter.readFile(fileHandle);
      await initEditor(content, actualFilename);
      isDirty = false;
      originalContent = content;
    } else {
      await FileSystemAdapter.writeFile(fileHandle, '');
      await initEditor('', actualFilename);
      isDirty = false;
      originalContent = '';
    }

    updateBreadcrumb();
    updateLogoState();
    addToHistory();
    hideFilePicker();

    // Focus the editor after DOM updates complete
    setTimeout(() => {
      if (isMarkdownEditorActive()) {
        focusMarkdownEditor();
      } else if (editorView) {
        editorView.focus();
      }
    }, 100);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error creating/opening file:', err);
      alert('Error: ' + err.message);
    }
    // Restore previous state
    currentFileHandle = previousFileHandle;
    currentFilename = previousFilename;
    currentDirHandle = previousDirHandle;
    currentPath = previousPath;
    isDirty = wasDirty;
    updateBreadcrumb();
  }
};

// New file
const newFile = async () => {
  if (!isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

  // Store current state in case we need to restore
  const previousFileHandle = currentFileHandle;
  const previousFilename = currentFilename;
  const wasDirty = isDirty;

  if (editorView && editorView.state.doc.toString().length > 0 && isDirty) {
    const confirm = window.confirm('Current file has unsaved changes. Create new file anyway?');
    if (!confirm) return;
  }

  // Get existing files in current directory for autocomplete
  let existingFiles = [];
  if (currentDirHandle) {
    try {
      const entries = await FileSystemAdapter.listDirectory(currentDirHandle);
      existingFiles = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name);
    } catch (err) {
      console.error('Error listing directory:', err);
    }
  }

  // Show inline input for filename with autocomplete
  const filename = await showFilenameInput(existingFiles);

  if (!filename) {
    // User cancelled - restore previous state
    currentFileHandle = previousFileHandle;
    currentFilename = previousFilename;
    isDirty = wasDirty;
    updateBreadcrumb();
    return;
  }

  // Use helper to create or open the file
  await createOrOpenFile(filename);
};

// Dark mode toggle
const toggleDarkMode = async () => {
  const html = document.documentElement;
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const isDark = html.getAttribute('data-theme') === 'dark';

  if (isDark) {
    html.removeAttribute('data-theme');
    darkModeToggle.textContent = '○';
    darkModeToggle.title = 'Switch to dark mode';
    themeColorMeta.setAttribute('content', '#e91e8c');
    localStorage.setItem('theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    darkModeToggle.textContent = '●';
    darkModeToggle.title = 'Switch to light mode';
    themeColorMeta.setAttribute('content', '#ff2d96');
    localStorage.setItem('theme', 'dark');
  }

  // Reinitialize editor with new theme colors
  if (editorView || isMarkdownEditorActive()) {
    const currentContent = getEditorContent();

    // Save scroll position
    let scrollTop = 0;
    let scrollLeft = 0;
    if (editorView) {
      const scroller = editorView.scrollDOM;
      scrollTop = scroller.scrollTop;
      scrollLeft = scroller.scrollLeft;
    } else if (isMarkdownEditorActive()) {
      const milkdownScroller = document.querySelector('.milkdown');
      if (milkdownScroller) {
        scrollTop = milkdownScroller.scrollTop;
        scrollLeft = milkdownScroller.scrollLeft;
      }
    }

    await initEditor(currentContent, currentFilename);

    // Restore scroll position
    setTimeout(() => {
      if (editorView) {
        editorView.scrollDOM.scrollTop = scrollTop;
        editorView.scrollDOM.scrollLeft = scrollLeft;
      } else if (isMarkdownEditorActive()) {
        const milkdownScroller = document.querySelector('.milkdown');
        if (milkdownScroller) {
          milkdownScroller.scrollTop = scrollTop;
          milkdownScroller.scrollLeft = scrollLeft;
        }
      }
    }, 0);
  }
};

// Initialize dark mode from localStorage
const initDarkMode = () => {
  const savedTheme = localStorage.getItem('theme');
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    darkModeToggle.textContent = '●';
    darkModeToggle.title = 'Switch to light mode';
    themeColorMeta.setAttribute('content', '#ff2d96');
  }

  // Remove preload class to enable transitions after initial theme is set
  setTimeout(() => {
    document.body.classList.remove('preload');
  }, 100);
};

// Event listeners
document.getElementById('new-btn').addEventListener('click', newFile);
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('forward-btn').addEventListener('click', goForward);
document.getElementById('folder-up-btn').addEventListener('click', goFolderUp);
// Helper function to animate autosave label
const animateAutosaveLabel = (shouldHide) => {
  const label = document.getElementById('autosave-label');

  if (shouldHide) {
    // Linger for 2 seconds, then fade out
    setTimeout(() => {
      label.classList.add('fade-out');
      // After fade animation completes, hide completely
      setTimeout(() => {
        label.classList.add('hidden');
      }, 500); // Match CSS transition duration
    }, 2000);
  } else {
    // Show label immediately when unchecked
    label.classList.remove('hidden', 'fade-out');
  }
};

document.getElementById('autosave-checkbox').addEventListener('change', (e) => {
  toggleAutosave(e.target.checked);
  animateAutosaveLabel(e.target.checked);
});
document.getElementById('rich-toggle-btn').addEventListener('click', toggleRichMode);
document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);

// Global keyboard listener for quick file creation/search
document.addEventListener('keydown', async (e) => {
  // Trigger on alphanumeric keys or forward slash
  if (!/^[a-zA-Z0-9\/]$/.test(e.key)) {
    return;
  }

  // Don't trigger if user is typing in an input field or the editor
  const activeElement = document.activeElement;
  if (
    activeElement &&
    (activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.classList.contains('cm-content') ||
      activeElement.classList.contains('ProseMirror'))
  ) {
    return;
  }

  // Don't trigger if there's no directory context
  if (!currentDirHandle) {
    return;
  }

  // Don't trigger if autocomplete is already showing
  if (document.querySelector('.breadcrumb-input')) {
    return;
  }

  // Trigger quick file creation/search with the typed character
  e.preventDefault();
  await quickFileCreate(e.key);
});

// Initialize dark mode on load
initDarkMode();

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.log('Service worker registration failed:', err);
  });
}

// Show welcome prompt on first load
// Show resume prompt with last folder name
const showResumePrompt = (folderName) => {
  const picker = document.getElementById('file-picker');
  picker.classList.remove('hidden');

  picker.innerHTML = `
        <div class="file-picker-header">
            <span class="file-picker-path">Welcome back to hotnote</span>
            <button class="file-picker-close" onclick="hideFilePicker()">close</button>
        </div>
        <div class="welcome-content">
            <p class="welcome-text">Continue where you left off?</p>
            <div class="welcome-actions">
                <button id="resume-folder-btn" class="welcome-btn">📁 Resume editing ${folderName}</button>
                <button id="new-folder-btn" class="welcome-btn" style="background: transparent; border: 1px solid var(--border); color: var(--text-secondary);">Open Different Folder</button>
            </div>
        </div>
    `;

  document.getElementById('resume-folder-btn').addEventListener('click', () => {
    hideFilePicker();
    openFolder();
  });

  document.getElementById('new-folder-btn').addEventListener('click', () => {
    // Clear saved folder name and show welcome prompt
    localStorage.removeItem('lastFolderName');
    hideFilePicker();
    openFolder();
  });

  // Add close button handler to forget folder
  document.querySelector('.file-picker-close').addEventListener('click', () => {
    localStorage.removeItem('lastFolderName');
    hideFilePicker();
  });
};

const showWelcomePrompt = () => {
  const picker = document.getElementById('file-picker');
  picker.classList.remove('hidden');

  picker.innerHTML = `
        <div class="file-picker-header">
            <span class="file-picker-path">Welcome to hotnote</span>
            <button class="file-picker-close" onclick="hideFilePicker()">close</button>
        </div>
        <div class="welcome-content">
            <p class="welcome-text">Open a folder to start browsing and editing files.</p>
            <div class="welcome-actions">
                <button id="welcome-folder-btn" class="welcome-btn">Open Folder</button>
            </div>
        </div>
    `;

  document.getElementById('welcome-folder-btn').addEventListener('click', () => {
    hideFilePicker();
    openFolder();
  });
};

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      console.log('Service Worker registered with scope:', registration.scope);
    })
    .catch((error) => {
      console.log('Service Worker registration failed:', error);
    });
}

// Initialize app
(async () => {
  // Initialize editor on load
  await initEditor();
  updateBreadcrumb();
  updateNavigationButtons();

  // Start autosave (enabled by default)
  if (autosaveEnabled) {
    startAutosave();
    // Animate the autosave label to hide after initial load
    animateAutosaveLabel(true);
  }

  // Check for saved folder and show appropriate prompt
  setTimeout(() => {
    const lastFolderName = localStorage.getItem('lastFolderName');
    if (lastFolderName) {
      showResumePrompt(lastFolderName);
    } else {
      showWelcomePrompt();
    }
  }, 500);

  // Add window focus listener for multi-instance detection
  window.addEventListener('focus', async () => {
    if (!currentDirHandle || !currentFileHandle) return;

    try {
      // Reload session file to check for external changes
      const sessionData = await loadSessionFile(currentDirHandle);
      if (sessionData && sessionData.session && sessionData.session.lastOpenFile) {
        // Check if another instance changed the session file
        // We could add more sophisticated conflict detection here
        // For now, we just silently sync the state
        console.log('Session file checked on window focus');
      }
    } catch (err) {
      console.error('Error checking session on focus:', err);
    }
  });
})();
