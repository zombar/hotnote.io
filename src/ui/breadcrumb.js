import { appState } from '../state/app-state.js';

/**
 * Breadcrumb UI Manager
 * Handles breadcrumb rendering with path abbreviation for long paths
 */

/**
 * Update breadcrumb display with current path and filename
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.openFolder - Open folder picker
 * @param {Function} callbacks.showFilePicker - Show file picker
 * @param {Function} callbacks.saveFocusState - Save current focus state
 */
export const updateBreadcrumb = ({ openFolder, showFilePicker, saveFocusState } = {}) => {
  const breadcrumb = document.getElementById('breadcrumb');
  if (!breadcrumb) return;

  breadcrumb.innerHTML = '';

  if (appState.currentPath.length === 0) {
    // No folder opened
    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    item.textContent = appState.currentFilename || 'untitled';
    if (appState.isDirty) {
      item.classList.add('has-changes');
    }
    // Make breadcrumb clickable to open folder
    item.style.cursor = 'pointer';
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (openFolder) await openFolder();
    });
    breadcrumb.appendChild(item);
  } else {
    // Show path with abbreviation for long paths
    const MAX_VISIBLE_ITEMS = 7; // Maximum items to show before abbreviating
    const ITEMS_TO_SHOW_AT_END = 5; // How many items to show at the end after ellipsis

    if (appState.currentPath.length > MAX_VISIBLE_ITEMS) {
      // Show first item
      const firstItem = document.createElement('span');
      firstItem.className = 'breadcrumb-item';
      firstItem.textContent = appState.currentPath[0].name;
      firstItem.dataset.index = 0;
      firstItem.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToPathIndex(0, { showFilePicker, saveFocusState });
      });
      breadcrumb.appendChild(firstItem);

      // Show ellipsis
      const ellipsis = document.createElement('span');
      ellipsis.className = 'breadcrumb-item breadcrumb-ellipsis';
      ellipsis.textContent = '...';
      breadcrumb.appendChild(ellipsis);

      // Show last N items
      const startIndex = appState.currentPath.length - ITEMS_TO_SHOW_AT_END;
      for (let i = startIndex; i < appState.currentPath.length; i++) {
        const segment = appState.currentPath[i];
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        item.dataset.index = i;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          navigateToPathIndex(i, { showFilePicker, saveFocusState });
        });
        breadcrumb.appendChild(item);
      }
    } else {
      // Show full path
      appState.currentPath.forEach((segment, index) => {
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        item.dataset.index = index;

        // Make all folder items clickable (even the last one)
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          navigateToPathIndex(index, { showFilePicker, saveFocusState });
        });

        breadcrumb.appendChild(item);
      });
    }

    // Add current file if opened, or placeholder if no file
    if (appState.currentFileHandle) {
      const fileItem = document.createElement('span');
      fileItem.className = 'breadcrumb-item';
      if (appState.isDirty) {
        fileItem.classList.add('has-changes');
      }
      fileItem.textContent = appState.currentFilename;
      fileItem.style.cursor = 'pointer';
      fileItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (appState.currentDirHandle) {
          if (saveFocusState) saveFocusState();
          if (showFilePicker) showFilePicker(appState.currentDirHandle);
        }
      });
      breadcrumb.appendChild(fileItem);
    } else {
      // Show placeholder when folder is open but no file selected
      const placeholder = document.createElement('span');
      placeholder.className = 'breadcrumb-item breadcrumb-placeholder';
      placeholder.textContent = 'filename (/ for search)';
      placeholder.style.cursor = 'pointer';
      placeholder.addEventListener('click', (e) => {
        e.stopPropagation();
        if (appState.currentDirHandle) {
          if (saveFocusState) saveFocusState();
          if (showFilePicker) showFilePicker(appState.currentDirHandle);
        }
      });
      breadcrumb.appendChild(placeholder);
    }
  }

  // Set browser tab title: filename (folder/path) • - hotnote
  updateBrowserTitle();
};

/**
 * Update browser tab title based on current state
 */
export const updateBrowserTitle = () => {
  if (appState.currentFileHandle) {
    const folderPath =
      appState.currentPath.length > 0
        ? ` (${appState.currentPath.map((p) => p.name).join('/')})`
        : '';
    document.title = `${appState.currentFilename}${folderPath}${appState.isDirty ? ' •' : ''} - hotnote`;
  } else if (appState.currentPath.length > 0) {
    document.title = `(${appState.currentPath.map((p) => p.name).join('/')}) - hotnote`;
  } else {
    document.title = 'hotnote';
  }
};

/**
 * Navigate to a specific path index (breadcrumb click)
 * @param {number} index - Path index to navigate to
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.showFilePicker - Show file picker
 * @param {Function} callbacks.saveFocusState - Save focus state
 * @param {Function} callbacks.saveTempChanges - Save temporary changes
 */
export const navigateToPathIndex = async (
  index,
  { showFilePicker, saveFocusState, saveTempChanges } = {}
) => {
  if (index >= appState.currentPath.length || index < 0) return;

  // Save focus state before navigation
  if (saveFocusState) saveFocusState();

  // Save temp changes if file is dirty
  if (appState.isDirty && appState.currentFileHandle && saveTempChanges) {
    saveTempChanges();
  }

  // Save current path for restoration if user cancels (closes picker without selection)
  // Deep copy the array to prevent mutations
  appState.previousPath = [...appState.currentPath];

  // Truncate path to the clicked index
  appState.currentPath = appState.currentPath.slice(0, index + 1);
  if (appState.currentPath[appState.currentPath.length - 1]) {
    appState.currentDirHandle =
      appState.currentPath[appState.currentPath.length - 1].handle || appState.currentDirHandle;
  }

  // Note: Don't add to history - breadcrumb navigation is just for browsing

  // Show file picker for this directory
  // Note: showFilePicker will handle clearing/saving the current file
  if (showFilePicker && appState.currentDirHandle) {
    await showFilePicker(appState.currentDirHandle);
  }

  // Update breadcrumb to reflect new path
  updateBreadcrumb({ showFilePicker, saveFocusState, saveTempChanges });
};
