import { appState } from '../state/app-state.js';

/**
 * Navigation History Manager
 * Handles browser navigation history, back/forward/folder-up navigation
 */

/**
 * Add current state to navigation history
 * @param {Object} options - Options for history entry
 * @param {Function} options.captureEditorState - Function to capture current editor state
 */
export const addToHistory = ({ captureEditorState } = {}) => {
  // Remove any forward history when navigating to a new location
  appState.navigationHistory = appState.navigationHistory.slice(0, appState.historyIndex + 1);

  // Capture current editor state if we have a file open
  let editorState = null;
  if (appState.currentFileHandle && captureEditorState) {
    editorState = captureEditorState();
  }

  appState.navigationHistory.push({
    path: [...appState.currentPath],
    dirHandle: appState.currentDirHandle,
    fileHandle: appState.currentFileHandle,
    filename: appState.currentFilename,
    editorState: editorState, // Store cursor and scroll position
  });

  appState.historyIndex = appState.navigationHistory.length - 1;
  updateNavigationButtons();

  // Sync with browser history (unless we're navigating via popstate)
  if (!appState.isPopStateNavigation) {
    // Build URL params the same way URLParamManager does (preserving forward slashes)
    const workdirPath = appState.rootDirHandle?.name ? `/${appState.rootDirHandle.name}` : null;

    let relativeFilePath = null;
    if (appState.currentFileHandle && appState.currentFilename) {
      // Build relative path from root (excluding root folder name)
      const pathParts = appState.currentPath.slice(1).map((p) => p.name);
      pathParts.push(appState.currentFilename);
      relativeFilePath = pathParts.join('/') || appState.currentFilename;
    }

    // Build query string manually to preserve forward slashes (same as URLParamManager)
    let queryString = '';
    if (workdirPath) {
      const encodePreservingSlashes = (str) => encodeURIComponent(str).replace(/%2F/g, '/');
      queryString = `?workdir=${encodePreservingSlashes(workdirPath)}`;
      if (relativeFilePath) {
        queryString += `&file=${encodePreservingSlashes(relativeFilePath)}`;
      }
    }

    const title = appState.currentFilename || 'hotnote';

    window.history.pushState(
      {
        historyIndex: appState.historyIndex,
        appHistory: true,
      },
      title,
      window.location.pathname + queryString
    );
  }
};

/**
 * Update back/forward button states
 */
export const updateNavigationButtons = () => {
  const backBtn = document.getElementById('back-btn');
  const forwardBtn = document.getElementById('forward-btn');
  const folderUpBtn = document.getElementById('folder-up-btn');

  if (backBtn) {
    backBtn.disabled = appState.historyIndex <= 0;
  }
  if (forwardBtn) {
    forwardBtn.disabled = appState.historyIndex >= appState.navigationHistory.length - 1;
  }
  if (folderUpBtn) {
    folderUpBtn.disabled = appState.currentPath.length === 0;
  }
};

/**
 * Convert current path and filename to URL parameter
 * @returns {string} URL parameter string
 */
export const pathToUrlParam = () => {
  if (appState.currentPath.length === 0) {
    return '';
  }

  // Build path from appState.currentPath array
  const pathParts = appState.currentPath.map((p) => encodeURIComponent(p.name));
  let fullPath = './' + pathParts.join('/');

  // Add filename if we have one
  if (appState.currentFilename) {
    fullPath += '/' + encodeURIComponent(appState.currentFilename);
  }

  return fullPath;
};

/**
 * Parse URL parameter back to path segments
 * @param {string} param - URL parameter to parse
 * @returns {Array<string>} Array of path segments
 */
export const urlParamToPath = (param) => {
  if (!param || param === '/' || param === './') {
    return [];
  }

  // Remove leading ./ or / and split
  let cleaned = param;
  if (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('/')) {
    cleaned = cleaned.slice(1);
  }
  return cleaned.split('/').filter((p) => p.length > 0);
};

/**
 * Navigate back in history
 * @param {Object} callbacks - Callback functions for side effects
 * @param {Function} callbacks.saveTempChanges - Save temporary changes
 * @param {Function} callbacks.loadTempChanges - Load temporary changes
 * @param {Function} callbacks.initEditor - Initialize editor with content
 * @param {Function} callbacks.updateBreadcrumb - Update breadcrumb UI
 * @param {Function} callbacks.updateLogoState - Update logo state
 * @param {Function} callbacks.hideFilePicker - Hide file picker
 * @param {Function} callbacks.showFilePicker - Show file picker
 * @param {Function} callbacks.getFilePathKey - Get file path key
 * @param {Function} callbacks.restoreEditorState - Restore editor state
 * @param {Function} callbacks.isMarkdownFile - Check if file is markdown
 */
export const goBack = async ({
  saveTempChanges,
  loadTempChanges,
  initEditor,
  updateBreadcrumb,
  updateLogoState,
  hideFilePicker,
  showFilePicker,
  getFilePathKey,
  restoreEditorState,
  isMarkdownFile,
} = {}) => {
  if (appState.historyIndex <= 0) return;

  // Save temp changes if file is dirty
  if (appState.isDirty && appState.currentFileHandle && saveTempChanges) {
    saveTempChanges();
  }

  appState.historyIndex--;
  const state = appState.navigationHistory[appState.historyIndex];

  appState.currentPath = [...state.path];
  appState.currentDirHandle = state.dirHandle;
  appState.currentFileHandle = state.fileHandle;
  appState.currentFilename = state.filename;

  if (appState.currentFileHandle) {
    const file = await appState.currentFileHandle.getFile();
    appState.currentFilename = file.name;

    // Load original file content from disk
    const fileContent = await file.text();

    // Check for temp changes
    const pathKey = getFilePathKey ? getFilePathKey() : null;
    const tempContent = loadTempChanges ? loadTempChanges(pathKey) : null;

    // Initialize with file content (sets appState.originalContent)
    if (initEditor) {
      await initEditor(fileContent, appState.currentFilename);
    }

    // If we have temp changes, apply them
    if (tempContent !== null) {
      if (appState.editorView) {
        appState.editorView.dispatch({
          changes: { from: 0, to: appState.editorView.state.doc.length, insert: tempContent },
        });
      } else if (
        appState.editorManager &&
        isMarkdownFile &&
        isMarkdownFile(appState.currentFilename)
      ) {
        await initEditor(tempContent, appState.currentFilename);
      }
      appState.isDirty = true;
    }
  } else {
    if (initEditor) {
      await initEditor('', 'untitled');
    }
  }

  if (appState.currentFileHandle) {
    if (hideFilePicker) hideFilePicker();
  } else if (appState.currentDirHandle) {
    if (showFilePicker) await showFilePicker(appState.currentDirHandle);
  }

  if (updateBreadcrumb) updateBreadcrumb();
  if (updateLogoState) updateLogoState();
  updateNavigationButtons();

  // Restore editor state if available
  if (state.editorState && restoreEditorState) {
    // Use requestAnimationFrame to ensure editor is fully initialized
    requestAnimationFrame(() => {
      restoreEditorState(state.editorState);
    });
  }

  // No need to update URL - browser history already has the correct URL
  // from when addToHistory() was originally called with pushState()
};

/**
 * Navigate forward in history
 * @param {Object} callbacks - Same callbacks as goBack
 */
export const goForward = async (callbacks = {}) => {
  if (appState.historyIndex >= appState.navigationHistory.length - 1) return;

  const {
    saveTempChanges,
    loadTempChanges,
    initEditor,
    updateBreadcrumb,
    updateLogoState,
    hideFilePicker,
    showFilePicker,
    getFilePathKey,
    restoreEditorState,
    isMarkdownFile,
  } = callbacks;

  // Save temp changes if file is dirty
  if (appState.isDirty && appState.currentFileHandle && saveTempChanges) {
    saveTempChanges();
  }

  appState.historyIndex++;
  const state = appState.navigationHistory[appState.historyIndex];

  appState.currentPath = [...state.path];
  appState.currentDirHandle = state.dirHandle;
  appState.currentFileHandle = state.fileHandle;
  appState.currentFilename = state.filename;

  if (appState.currentFileHandle) {
    const file = await appState.currentFileHandle.getFile();
    appState.currentFilename = file.name;

    // Load original file content from disk
    const fileContent = await file.text();

    // Check for temp changes
    const pathKey = getFilePathKey ? getFilePathKey() : null;
    const tempContent = loadTempChanges ? loadTempChanges(pathKey) : null;

    // Initialize with file content
    if (initEditor) {
      await initEditor(fileContent, appState.currentFilename);
    }

    // If we have temp changes, apply them
    if (tempContent !== null) {
      if (appState.editorView) {
        appState.editorView.dispatch({
          changes: { from: 0, to: appState.editorView.state.doc.length, insert: tempContent },
        });
      } else if (
        appState.editorManager &&
        isMarkdownFile &&
        isMarkdownFile(appState.currentFilename)
      ) {
        await initEditor(tempContent, appState.currentFilename);
      }
      appState.isDirty = true;
    }
  } else {
    if (initEditor) {
      await initEditor('', 'untitled');
    }
  }

  if (appState.currentFileHandle) {
    if (hideFilePicker) hideFilePicker();
  } else if (appState.currentDirHandle) {
    if (showFilePicker) await showFilePicker(appState.currentDirHandle);
  }

  if (updateBreadcrumb) updateBreadcrumb();
  if (updateLogoState) updateLogoState();
  updateNavigationButtons();

  // Restore editor state if available
  if (state.editorState && restoreEditorState) {
    requestAnimationFrame(() => {
      restoreEditorState(state.editorState);
    });
  }

  // No need to update URL - browser history already has the correct URL
  // from when addToHistory() was originally called with pushState()
};

/**
 * Navigate up one folder
 * @param {Object} callbacks - Callback functions for side effects
 */
export const goFolderUp = async ({
  saveTempChanges,
  initEditor,
  updateBreadcrumb,
  updateLogoState,
  showFilePicker,
} = {}) => {
  if (appState.currentPath.length === 0) return;

  // Save temp changes if file is dirty
  if (appState.isDirty && appState.currentFileHandle && saveTempChanges) {
    saveTempChanges();
  }

  // Add current state to history before navigating
  addToHistory({});

  // Remove last path segment
  appState.currentPath = appState.currentPath.slice(0, -1);

  // Update directory handle by traversing from root
  if (appState.currentPath.length === 0) {
    // Back to root - we need to get the root handle
    // This should be set when the folder is first opened
    appState.currentDirHandle = appState.rootDirHandle || appState.currentDirHandle;
  } else {
    // Navigate to parent directory
    // Note: In the actual implementation, we'd need to traverse from root
    // For now, we'll keep the current approach
  }

  // Clear current file
  appState.currentFileHandle = null;
  appState.currentFilename = '';

  // Initialize empty editor
  if (initEditor) {
    await initEditor('', 'untitled');
  }

  // Show file picker for new directory
  if (showFilePicker && appState.currentDirHandle) {
    await showFilePicker(appState.currentDirHandle);
  }

  if (updateBreadcrumb) updateBreadcrumb();
  if (updateLogoState) updateLogoState();
  updateNavigationButtons();
};

/**
 * Handle browser popstate event (back/forward browser buttons)
 * @param {PopStateEvent} event - Popstate event
 * @param {Object} callbacks - Callback functions
 */
export const handlePopState = async (event, callbacks = {}) => {
  if (!event.state || !event.state.appHistory) {
    return;
  }

  appState.isPopStateNavigation = true;

  const targetIndex = event.state.historyIndex;

  if (targetIndex < appState.historyIndex) {
    // Going back
    while (appState.historyIndex > targetIndex) {
      await goBack(callbacks);
    }
  } else if (targetIndex > appState.historyIndex) {
    // Going forward
    while (appState.historyIndex < targetIndex) {
      await goForward(callbacks);
    }
  }

  appState.isPopStateNavigation = false;
};
