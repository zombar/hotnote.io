import { appState } from '../state/app-state.js';
import { debounce } from '../utils/helpers.js';

/**
 * Session Management Module
 * Handles persistence and restoration of editor state to .session_properties.HN files
 */

// FileSystemAdapter will be passed as dependency to avoid circular imports
let FileSystemAdapter = null;

/**
 * Initialize the session manager with FileSystemAdapter dependency
 * @param {Object} adapter - The FileSystemAdapter object
 */
export function initSessionManager(adapter) {
  FileSystemAdapter = adapter;
}

/**
 * Create session filename
 * @param {FileSystemDirectoryHandle} _dirHandle - Directory handle (unused, for compatibility)
 * @returns {string} Session filename
 */
export function createSessionFileName(_dirHandle) {
  return '.session_properties.HN';
}

/**
 * Load session file from directory
 * @param {FileSystemDirectoryHandle} dirHandle - Directory handle
 * @returns {Promise<Object|null>} Session data or null if not found
 */
export async function loadSessionFile(dirHandle) {
  try {
    const sessionFileName = createSessionFileName(dirHandle);
    const sessionFileHandle = await dirHandle.getFileHandle(sessionFileName, { create: false });
    const sessionContent = await FileSystemAdapter.readFile(sessionFileHandle);
    return JSON.parse(sessionContent);
  } catch {
    // File doesn't exist or invalid JSON - return null
    return null;
  }
}

/**
 * Save session data to directory
 * @param {FileSystemDirectoryHandle} dirHandle - Directory handle
 * @param {Object} sessionData - Session data to save
 * @returns {Promise<void>}
 */
export async function saveSessionFile(dirHandle, sessionData) {
  try {
    const sessionFileName = createSessionFileName(dirHandle);
    const sessionFileHandle = await dirHandle.getFileHandle(sessionFileName, { create: true });
    sessionData.lastModified = Date.now();
    const content = JSON.stringify(sessionData, null, 2);
    await FileSystemAdapter.writeFile(sessionFileHandle, content);
  } catch (err) {
    console.error('Error saving session file:', err);
  }
}

/**
 * Create empty session object
 * @param {string} folderName - Folder name
 * @returns {Object} Empty session object
 */
export function createEmptySession(folderName) {
  return {
    version: '1.0',
    folderName: folderName,
    lastModified: Date.now(),
    session: {
      lastOpenFile: null,
    },
    comments: [],
  };
}

/**
 * Get relative file path for session storage
 * @param {Function} getRelativeFilePathFn - Function to get relative file path
 * @returns {string|null} Relative file path
 */
function getSessionFilePath(getRelativeFilePathFn) {
  return getRelativeFilePathFn();
}

/**
 * Save current editor state to session file
 * @param {Function} getRelativeFilePathFn - Function to get relative file path
 * @returns {Promise<void>}
 */
export async function saveEditorStateToSession(getRelativeFilePathFn) {
  // Don't save if TOC navigation is in progress
  if (window.blockSessionSave) {
    console.log('[Session] Skipping save - TOC navigation in progress');
    return;
  }

  // Don't save if we just restored state (wait for scroll animation to complete)
  // Block for 1 second (animation is 250ms, plus margin for safety)
  const timeSinceRestoration = Date.now() - appState.lastRestorationTime;
  console.log(
    '[Session] Save check: lastRestorationTime=',
    appState.lastRestorationTime,
    'timeSince=',
    timeSinceRestoration,
    'willBlock=',
    appState.lastRestorationTime > 0 && timeSinceRestoration < 1000
  );
  if (appState.lastRestorationTime > 0 && timeSinceRestoration < 1000) {
    console.log(
      '[Session] Skipping save - scroll animation in progress (',
      timeSinceRestoration,
      'ms since restoration)'
    );
    return;
  }

  if (!appState.currentDirHandle || !appState.currentFileHandle) {
    console.log('[Session] Skipping save - no dir or file handle');
    return;
  }

  try {
    const filePath = getSessionFilePath(getRelativeFilePathFn);
    if (!filePath) {
      console.log('[Session] Skipping save - no file path');
      return;
    }

    let sessionData = await loadSessionFile(appState.currentDirHandle);
    if (!sessionData) {
      sessionData = createEmptySession(appState.currentDirHandle.name);
    }

    // Get current editor state
    let cursorLine = 0;
    let cursorColumn = 0;
    let scrollTop = 0;
    let scrollLeft = 0;
    let editorMode = 'source'; // Default for non-markdown files

    console.log(
      '[Session] saveEditorStateToSession called. editorManager:',
      !!appState.editorManager,
      'editorView:',
      !!appState.editorView
    );

    if (appState.editorManager) {
      // Markdown file using EditorManager
      const cursor = appState.editorManager.getCursor();
      cursorLine = cursor.line;
      cursorColumn = cursor.column;
      scrollTop = appState.editorManager.getScrollPosition();
      editorMode = appState.editorManager.getMode();
      console.log('[Session] Saving EditorManager state:', {
        cursorLine,
        cursorColumn,
        scrollTop,
        editorMode,
      });
    } else if (appState.editorView) {
      // Non-markdown file using CodeMirror
      const pos = appState.editorView.state.selection.main.head;
      const line = appState.editorView.state.doc.lineAt(pos);
      cursorLine = line.number - 1; // Convert to 0-based
      cursorColumn = pos - line.from;
      scrollTop = appState.editorView.scrollDOM.scrollTop;
      scrollLeft = appState.editorView.scrollDOM.scrollLeft;
      console.log('[Session] Saving CodeMirror state:', {
        cursorLine,
        cursorColumn,
        scrollTop,
        scrollLeft,
      });
    } else {
      console.log('[Session] No editor active, saving defaults');
    }

    sessionData.session.lastOpenFile = {
      path: filePath,
      cursorLine: cursorLine,
      cursorColumn: cursorColumn,
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
      editorMode: editorMode,
    };

    console.log('[Session] Saving session file with data:', sessionData.session.lastOpenFile);
    await saveSessionFile(appState.rootDirHandle, sessionData);
  } catch (err) {
    console.error('Error saving editor state:', err);
  }
}

/**
 * Create debounced version of saveEditorStateToSession
 * @param {Function} getRelativeFilePathFn - Function to get relative file path
 * @returns {Function} Debounced save function
 */
export function createDebouncedSaveEditorState(getRelativeFilePathFn) {
  return debounce(() => saveEditorStateToSession(getRelativeFilePathFn), 2000);
}
