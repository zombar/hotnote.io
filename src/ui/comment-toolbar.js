/**
 * Comment Toolbar
 *
 * Shows a floating toolbar button when text is selected,
 * allowing users to create comments on the selected text.
 */

import { appState } from '../state/app-state.js';

export class CommentToolbar {
  constructor(container, onAddComment) {
    this.container = container;
    this.onAddComment = onAddComment;
    this.toolbar = null;
    this.currentSelection = null;
    this.panel = null; // Reference to comment panel
    this.init();
  }

  /**
   * Set the panel reference so toolbar can check if panel is visible
   * @param {CommentPanel} panel - The comment panel instance
   */
  setPanel(panel) {
    this.panel = panel;
  }

  init() {
    // Create toolbar element
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'comment-toolbar';
    this.toolbar.innerHTML = `
      <button class="comment-toolbar-btn" title="Add comment">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Comment</span>
      </button>
    `;

    // Add to body (not container) so it's not clipped or removed
    document.body.appendChild(this.toolbar);

    // Event listeners
    const btn = this.toolbar.querySelector('.comment-toolbar-btn');

    // Prevent toolbar from stealing focus from editor when clicked
    this.toolbar.addEventListener('mousedown', (e) => {
      // Prevent default to avoid blurring the editor
      e.preventDefault();
    });

    btn.addEventListener('click', () => this.handleAddComment());

    // Hide toolbar on scroll to prevent it from becoming detached from text
    this.scrollHandler = () => this.hide();
    window.addEventListener('scroll', this.scrollHandler, true);
  }

  /**
   * Show the toolbar at a specific position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {object} selection - Selection object {from, to, text}
   */
  show(x, y, selection) {
    // Don't show toolbar in read-only mode (GitHub or other remote files)
    if (appState.isGitHubMode || appState.isReadOnly) {
      return;
    }

    // Don't show toolbar if panel is visible
    if (this.panel && this.panel.isVisible()) {
      return;
    }

    this.currentSelection = selection;
    this.toolbar.classList.add('visible');

    // Position the toolbar
    this.toolbar.style.left = `${x}px`;
    this.toolbar.style.top = `${y}px`;
  }

  /**
   * Hide the toolbar
   */
  hide() {
    this.toolbar.classList.remove('visible');
    this.currentSelection = null;
  }

  /**
   * Check if the toolbar is currently visible
   * @returns {boolean}
   */
  isVisible() {
    return this.toolbar.classList.contains('visible');
  }

  /**
   * Handle add comment button click
   */
  handleAddComment() {
    if (this.currentSelection && this.onAddComment) {
      this.onAddComment(this.currentSelection);
    }
    this.hide();
  }

  /**
   * Destroy the toolbar
   */
  destroy() {
    // Remove scroll handler
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler, true);
      this.scrollHandler = null;
    }

    if (this.toolbar) {
      this.toolbar.remove();
      this.toolbar = null;
    }
    this.currentSelection = null;
  }
}
