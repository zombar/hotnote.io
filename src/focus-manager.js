/**
 * FocusManager - Centralized focus management for editor components
 *
 * Handles focus restoration and management for both EditorManager (markdown)
 * and CodeMirror (source code) editors. Ensures editor maintains focus during
 * file operations, navigation, and UI interactions.
 */
export class FocusManager {
  constructor() {
    this.editorManager = null;
    this.editorView = null;
    this.lastFocusTime = 0;
    this.pendingFocus = null;
    this.debugMode = false;
    this._savedState = null; // Store cursor and scroll state
  }

  /**
   * Register active editors with the focus manager
   * @param {EditorManager|null} editorManager - The markdown editor manager
   * @param {Object|null} editorView - The CodeMirror editor view
   */
  setEditors(editorManager, editorView) {
    this.editorManager = editorManager;
    this.editorView = editorView;
  }

  /**
   * Focus the active editor
   * @param {Object} options - Focus options
   * @param {number} options.delay - Delay in ms before focusing (default: 0)
   * @param {string} options.reason - Debug reason for focus (default: 'unknown')
   */
  focusEditor(options = {}) {
    const { delay = 0, reason = 'unknown' } = options;

    if (delay > 0) {
      // Cancel any pending focus operation
      if (this.pendingFocus) {
        clearTimeout(this.pendingFocus);
      }

      this.pendingFocus = setTimeout(() => {
        this.pendingFocus = null;
        this._doFocus(reason);
      }, delay);
    } else {
      this._doFocus(reason);
    }
  }

  /**
   * Internal method to perform the actual focus operation
   * @param {string} reason - Debug reason for focus
   * @private
   */
  _doFocus(reason) {
    if (this.debugMode) {
      console.log(`[FocusManager] Focusing editor: ${reason}`);
    }

    try {
      if (this.editorManager) {
        this.editorManager.focus();
        this.lastFocusTime = Date.now();
      } else if (this.editorView) {
        this.editorView.focus();
        this.lastFocusTime = Date.now();
      } else {
        if (this.debugMode) {
          console.warn('[FocusManager] No editor available to focus');
        }
      }

      // Restore saved state if available
      if (this._savedState) {
        const stateToRestore = this._savedState;
        this._savedState = null; // Clear saved state
        this._restoreEditorState(stateToRestore);
      }
    } catch (error) {
      console.error('[FocusManager] Error focusing editor:', error);
    }
  }

  /**
   * Check if the editor currently has focus
   * @returns {boolean} True if editor has focus
   */
  hasEditorFocus() {
    const activeElement = document.activeElement;
    if (!activeElement) {
      return false;
    }

    // Check for CodeMirror editor focus
    if (activeElement.classList.contains('cm-content')) {
      return true;
    }

    // Check for Milkdown/ProseMirror editor focus
    if (activeElement.classList.contains('ProseMirror')) {
      return true;
    }

    // Check if active element is within an editor container
    const editorContainer = activeElement.closest('#editor');
    if (editorContainer) {
      const cmContent = editorContainer.querySelector('.cm-content');
      const proseMirror = editorContainer.querySelector('.ProseMirror');
      return activeElement === cmContent || activeElement === proseMirror;
    }

    return false;
  }

  /**
   * Capture current editor state (cursor position and scroll)
   * @returns {Object|null} State object with cursor and scroll, or null if no editor
   * @private
   */
  _captureEditorState() {
    try {
      if (this.editorManager) {
        // Markdown editor using EditorManager
        const cursor = this.editorManager.getCursor();
        const scroll = this.editorManager.getScrollPosition();
        return { cursor, scroll };
      } else if (this.editorView) {
        // CodeMirror editor
        const pos = this.editorView.state.selection.main.head;
        const line = this.editorView.state.doc.lineAt(pos);
        const cursor = {
          line: line.number - 1, // Convert to 0-based
          column: pos - line.from,
        };
        const scroll = this.editorView.scrollDOM.scrollTop;
        return { cursor, scroll };
      }
    } catch (error) {
      if (this.debugMode) {
        console.error('[FocusManager] Error capturing editor state:', error);
      }
    }
    return null;
  }

  /**
   * Restore editor state (cursor position and scroll)
   * @param {Object} state - State object with cursor and scroll
   * @private
   */
  _restoreEditorState(state) {
    if (!state) return;

    try {
      requestAnimationFrame(() => {
        try {
          if (this.editorManager) {
            // Markdown editor using EditorManager
            this.editorManager.setCursor(state.cursor.line, state.cursor.column);
            this.editorManager.setScrollPosition(state.scroll);
          } else if (this.editorView) {
            // CodeMirror editor
            const doc = this.editorView.state.doc;
            const line = doc.line(state.cursor.line + 1); // Convert to 1-based
            const pos = line.from + Math.min(state.cursor.column, line.length);
            this.editorView.dispatch({
              selection: { anchor: pos, head: pos },
            });
            this.editorView.scrollDOM.scrollTop = state.scroll;
          }

          if (this.debugMode) {
            console.log('[FocusManager] Restored editor state:', state);
          }
        } catch (error) {
          console.error('[FocusManager] Error restoring editor state:', error);
        }
      });
    } catch (error) {
      console.error('[FocusManager] Error in state restoration:', error);
    }
  }

  /**
   * Save current focus state before a UI operation that will take focus
   * Call this before operations like showing dialogs, clicking buttons, etc.
   */
  saveFocusState() {
    if (this.hasEditorFocus()) {
      this._savedState = this._captureEditorState();
      if (this.debugMode) {
        console.log('[FocusManager] Saved focus state:', this._savedState);
      }
    }
  }

  /**
   * Cancel any pending focus operations
   */
  cancelPendingFocus() {
    if (this.pendingFocus) {
      clearTimeout(this.pendingFocus);
      this.pendingFocus = null;
    }
  }

  /**
   * Focus the editor after the next animation frame
   * Useful when DOM updates need to complete first
   * @param {string} reason - Debug reason for focus
   */
  focusAfterFrame(reason = 'after-frame') {
    requestAnimationFrame(() => {
      this._doFocus(reason);
    });
  }

  /**
   * Enable debug logging
   * @param {boolean} enabled - Enable or disable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  /**
   * Get the time of the last successful focus operation
   * @returns {number} Timestamp of last focus
   */
  getLastFocusTime() {
    return this.lastFocusTime;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.cancelPendingFocus();
    this.editorManager = null;
    this.editorView = null;
    this.lastFocusTime = 0;
    this._savedState = null;
  }
}
