/**
 * Theme Manager
 *
 * Manages light/dark theme switching with:
 * - Manual toggle via UI button
 * - System preference detection
 * - Theme persistence in localStorage
 * - Editor reinitialization on theme change
 */

import { appState } from '../state/app-state.js';

// Store system theme listener for cleanup
let systemThemeListener = null;
let systemThemeMediaQuery = null;

/**
 * Initialize theme manager
 * Sets up initial theme from localStorage or system preferences
 * and sets up system theme change listener
 */
export function initThemeManager() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldUseDark = savedTheme === 'dark' || (savedTheme === null && prefersDark);

  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const icon = darkModeToggle?.querySelector('.material-symbols-outlined');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  if (shouldUseDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (icon) icon.textContent = 'light_mode';
    if (darkModeToggle) darkModeToggle.title = 'Switch to light mode';
    if (themeColorMeta) themeColorMeta.setAttribute('content', '#ff2d96');
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (icon) icon.textContent = 'dark_mode';
    if (darkModeToggle) darkModeToggle.title = 'Switch to dark mode';
    if (themeColorMeta) themeColorMeta.setAttribute('content', '#e91e8c');
  }

  // Remove preload class to enable transitions after initial theme is set
  setTimeout(() => {
    document.body.classList.remove('preload');
  }, 100);

  // Setup system theme change listener
  setupSystemThemeListener();
}

/**
 * Toggle between light and dark themes
 * Reinitializes editor if active to apply new theme colors
 */
export async function toggleTheme() {
  const html = document.documentElement;
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const icon = darkModeToggle?.querySelector('.material-symbols-outlined');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const isDark = html.getAttribute('data-theme') === 'dark';

  if (isDark) {
    html.removeAttribute('data-theme');
    if (icon) icon.textContent = 'dark_mode';
    if (darkModeToggle) darkModeToggle.title = 'Switch to dark mode';
    if (themeColorMeta) themeColorMeta.setAttribute('content', '#e91e8c');
    localStorage.setItem('theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    if (icon) icon.textContent = 'light_mode';
    if (darkModeToggle) darkModeToggle.title = 'Switch to light mode';
    if (themeColorMeta) themeColorMeta.setAttribute('content', '#ff2d96');
    localStorage.setItem('theme', 'dark');
  }

  // Close comment panel and toolbar before reinitializing editor
  if (typeof closeComments !== 'undefined') {
    // eslint-disable-next-line no-undef
    closeComments();
  }

  // Reinitialize editor with new theme colors (skip in GitHub reader mode)
  await reinitializeEditorWithTheme();
}

/**
 * Get current theme (light or dark)
 * @returns {string} 'light' or 'dark'
 */
export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Cleanup theme manager by removing event listeners
 */
export function cleanupThemeManager() {
  if (systemThemeMediaQuery && systemThemeListener) {
    systemThemeMediaQuery.removeEventListener('change', systemThemeListener);
    systemThemeListener = null;
    systemThemeMediaQuery = null;
  }
}

/**
 * Setup listener for system theme changes
 * Only applies changes if user hasn't explicitly set a preference
 */
function setupSystemThemeListener() {
  systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  systemThemeListener = async (e) => {
    const savedTheme = localStorage.getItem('theme');

    // Only apply system theme change if user hasn't explicitly set a preference
    if (savedTheme === null) {
      const isDark = e.matches;
      const darkModeToggle = document.getElementById('dark-mode-toggle');
      const icon = darkModeToggle?.querySelector('.material-symbols-outlined');
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');

      if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (icon) icon.textContent = 'light_mode';
        if (darkModeToggle) darkModeToggle.title = 'Switch to light mode';
        if (themeColorMeta) themeColorMeta.setAttribute('content', '#ff2d96');
      } else {
        document.documentElement.removeAttribute('data-theme');
        if (icon) icon.textContent = 'dark_mode';
        if (darkModeToggle) darkModeToggle.title = 'Switch to dark mode';
        if (themeColorMeta) themeColorMeta.setAttribute('content', '#e91e8c');
      }

      // Close comment panel and toolbar before reinitializing editor
      if (typeof closeComments !== 'undefined') {
        // eslint-disable-next-line no-undef
        closeComments();
      }

      // Re-initialize editor with new theme colors
      await reinitializeEditorWithTheme();
    }
  };

  systemThemeMediaQuery.addEventListener('change', systemThemeListener);
}

/**
 * Reinitialize editor with current theme
 * Preserves scroll position and editor mode
 */
async function reinitializeEditorWithTheme() {
  if (appState.isGitHubMode) {
    return; // Skip in GitHub reader mode
  }

  if (!appState.editorView && !appState.editorManager) {
    return; // No editor to reinitialize
  }

  // Skip editor reinitialization if file picker is open
  // The CSS theme will still update, and we'll reinit when picker closes
  const filePicker = document.getElementById('file-picker');
  const isFilePickerOpen = filePicker && !filePicker.classList.contains('hidden');
  if (isFilePickerOpen) {
    // Mark that we need to reinit when the file picker closes
    appState.needsEditorReinit = true;
    return;
  }

  // Get current editor content

  const currentContent =
    typeof getEditorContent !== 'undefined'
      ? // eslint-disable-next-line no-undef
        getEditorContent() || ''
      : '';

  // Save editor state before destroying
  let scrollTop = 0;
  let scrollLeft = 0;
  let currentMode = null;
  let cursorPosition = null;

  if (appState.editorView) {
    const scroller = appState.editorView.scrollDOM;
    scrollTop = scroller?.scrollTop || 0;
    scrollLeft = scroller?.scrollLeft || 0;
    // Save cursor position for CodeMirror (if available)
    try {
      if (appState.editorView.state?.selection?.main) {
        const pos = appState.editorView.state.selection.main.head;
        const line = appState.editorView.state.doc.lineAt(pos);
        cursorPosition = {
          line: line.number - 1, // Convert to 0-based
          column: pos - line.from,
        };
      }
    } catch (_error) {
      // Cursor position not available, skip
    }
  } else if (appState.editorManager) {
    scrollTop = appState.editorManager.getScrollPosition?.() || 0;
    currentMode = appState.editorManager.getMode?.(); // Preserve current mode for markdown
    // Save cursor position for EditorManager (if available)
    try {
      if (appState.editorManager.getCursor) {
        cursorPosition = appState.editorManager.getCursor();
      }
    } catch (_error) {
      // Cursor position not available, skip
    }
  }

  // Save cursor position and scroll to appState for restoration after editor init
  appState.pendingCursorRestore = {
    cursorPosition,
    scrollTop,
    scrollLeft,
  };

  // Temporarily set appState.isRestoringSession to preserve the mode
  const wasRestoringSession = appState.isRestoringSession;
  if (currentMode) {
    appState.isRestoringSession = true;
    localStorage.setItem(`mode_${appState.currentFilename}`, currentMode);
  }

  // Reinitialize editor with new theme

  if (typeof initEditor !== 'undefined') {
    // eslint-disable-next-line no-undef
    await initEditor(currentContent, appState.currentFilename);
  }

  // Restore previous session state
  appState.isRestoringSession = wasRestoringSession;

  // Cursor position will be restored by the code in app.js after editor initialization
}
