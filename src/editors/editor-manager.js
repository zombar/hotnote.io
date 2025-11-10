import { WYSIWYGView } from './wysiwyg-view.js';
import { SourceView } from './source-view.js';

/**
 * EditorManager - Manages switching between WYSIWYG and Source modes
 * Only one editor is active at a time, eliminating position sync issues
 */
export class EditorManager {
  constructor(container, initialMode = 'wysiwyg', initialContent = '', onChange = null) {
    this.container = container;
    this.currentMode = initialMode;
    this.currentEditor = null;
    this.onChangeCallback = onChange;

    // Initialize the first editor
    this.initPromise = this.init(initialMode, initialContent);
  }

  async init(mode, content) {
    if (mode === 'source') {
      this.currentEditor = new SourceView(this.container, content, this.onChangeCallback);
    } else {
      this.currentEditor = new WYSIWYGView(this.container, content, this.onChangeCallback);
      await this.currentEditor.ready();
    }
    return this.currentEditor;
  }

  /**
   * Wait for editor to be fully initialized
   */
  async ready() {
    await this.initPromise;
    if (this.currentMode === 'wysiwyg' && this.currentEditor) {
      await this.currentEditor.ready();
    }
  }

  /**
   * Switch between WYSIWYG and Source modes
   * @param {string} newMode - 'wysiwyg' or 'source'
   */
  async switchMode(newMode) {
    if (newMode === this.currentMode) {
      return;
    }

    // 1. Capture state from current editor
    const state = {
      content: this.currentEditor.getContent(),
      cursor: this.currentEditor.getCursor(),
      scroll: this.currentEditor.getScrollPosition(),
    };

    // 2. Destroy current editor
    this.currentEditor.destroy();
    this.container.innerHTML = ''; // Clear container

    // 3. Create new editor
    if (newMode === 'source') {
      this.currentEditor = new SourceView(this.container, state.content, this.onChangeCallback);
    } else {
      this.currentEditor = new WYSIWYGView(this.container, state.content, this.onChangeCallback);
      await this.currentEditor.ready();
    }

    this.currentMode = newMode;

    // 4. Restore state (delay for editor stabilization)
    await this.nextFrame();

    // Wait a bit longer for WYSIWYG editor to fully render
    if (newMode === 'wysiwyg') {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Set cursor and scroll
    this.currentEditor.setCursor(state.cursor.line, state.cursor.column);
    this.currentEditor.setScrollPosition(state.scroll);

    // Wait one more frame before focusing
    await this.nextFrame();
    this.currentEditor.focus();
  }

  /**
   * Wait for next animation frame
   */
  nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  /**
   * Toggle between modes
   */
  async toggleMode() {
    const newMode = this.currentMode === 'wysiwyg' ? 'source' : 'wysiwyg';
    await this.switchMode(newMode);
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Get current content
   */
  getContent() {
    return this.currentEditor ? this.currentEditor.getContent() : '';
  }

  /**
   * Get current cursor position
   */
  getCursor() {
    return this.currentEditor ? this.currentEditor.getCursor() : { line: 0, column: 0 };
  }

  /**
   * Set cursor position
   */
  setCursor(line, column) {
    if (this.currentEditor) {
      this.currentEditor.setCursor(line, column);
    }
  }

  /**
   * Get scroll position
   */
  getScrollPosition() {
    return this.currentEditor ? this.currentEditor.getScrollPosition() : 0;
  }

  /**
   * Set scroll position
   */
  setScrollPosition(scrollTop) {
    if (this.currentEditor) {
      this.currentEditor.setScrollPosition(scrollTop);
    }
  }

  /**
   * Focus the editor
   */
  focus() {
    if (this.currentEditor) {
      this.currentEditor.focus();
    }
  }

  /**
   * Destroy the editor
   */
  destroy() {
    if (this.currentEditor) {
      this.currentEditor.destroy();
      this.currentEditor = null;
    }
  }

  /**
   * Check if editor is active
   */
  isActive() {
    return this.currentEditor !== null && this.currentEditor.isActive();
  }

  /**
   * Get the currently active editor instance
   */
  getActiveEditor() {
    return this.currentEditor;
  }
}
