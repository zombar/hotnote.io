/**
 * Comment Panel
 *
 * Displays a floating panel with comment threads and reply functionality.
 * Supports dragging to reposition the panel.
 */

import { getUserDisplayName } from '../storage/user-manager.js';

export class CommentPanel {
  constructor(container, onReply, onResolve, onDelete) {
    this.container = container;
    this.onReply = onReply;
    this.onResolve = onResolve;
    this.onDelete = onDelete;
    this.panel = null;
    this.comment = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.toolbar = null; // Reference to comment toolbar
    this.init();
  }

  /**
   * Set the toolbar reference so panel can hide it when shown
   * @param {CommentToolbar} toolbar - The comment toolbar instance
   */
  setToolbar(toolbar) {
    this.toolbar = toolbar;
  }

  init() {
    // Create panel element
    this.panel = document.createElement('div');
    this.panel.className = 'comment-panel';
    this.panel.innerHTML = `
      <div class="comment-panel-header">
        <h3 class="comment-panel-title">Comment Thread</h3>
        <button class="comment-panel-close" title="Close">&times;</button>
      </div>
      <div class="comment-panel-body">
        <div class="comment-thread"></div>
        <div class="comment-reply-form">
          <textarea class="comment-input" placeholder="Add a reply..."></textarea>
          <div class="comment-form-actions">
            <button class="comment-submit-btn">Reply</button>
          </div>
        </div>
      </div>
    `;

    // Add to container
    this.container.appendChild(this.panel);

    // Event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Reply form
    const replyInput = this.panel.querySelector('.comment-input');
    const submitBtn = this.panel.querySelector('.comment-submit-btn');

    // Prevent panel from stealing focus, except for the input field
    this.panel.addEventListener('mousedown', (e) => {
      // Allow input to receive focus naturally so user can type and paste
      if (e.target === replyInput || replyInput.contains(e.target)) {
        return;
      }
      // Prevent default on other elements to avoid unnecessary focus changes
      e.preventDefault();
    });

    // Track when user is actively typing in the input
    replyInput.addEventListener('focus', () => {
      this.inputActive = true;
    });

    replyInput.addEventListener('blur', () => {
      this.inputActive = false;
    });

    // Close button
    const closeBtn = this.panel.querySelector('.comment-panel-close');
    closeBtn.addEventListener('click', () => this.hide(false, true)); // Force hide

    submitBtn.addEventListener('click', () => this.handleReply());

    // Submit on Enter (with Cmd/Ctrl)
    replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.handleReply();
      }
    });

    // Dragging functionality
    const header = this.panel.querySelector('.comment-panel-header');
    header.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.stopDrag());

    // Hide panel on scroll to prevent it from becoming detached from text
    this.scrollHandler = () => this.hide(true); // Skip focus restore on scroll
    window.addEventListener('scroll', this.scrollHandler, true);

    // Hide panel when clicking on editor (but not when interacting with panel)
    this.editorClickHandler = (e) => {
      // Don't hide if clicking inside the panel itself
      if (this.panel.contains(e.target)) {
        return;
      }

      // Check if click is on editor content (not on panel)
      const editorElements = document.querySelectorAll('#editor .cm-content, #editor .ProseMirror');
      for (const editorEl of editorElements) {
        if (editorEl.contains(e.target)) {
          this.hide();
          break;
        }
      }
    };
    document.addEventListener('click', this.editorClickHandler, true);
  }

  /**
   * Show the panel with a comment thread
   * @param {object} comment - Comment object with thread
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  show(comment, x, y) {
    this.comment = comment;
    this.panel.classList.add('visible');

    // Hide the toolbar when panel is shown
    if (this.toolbar) {
      this.toolbar.hide();
    }

    // Position the panel
    this.panel.style.left = `${x}px`;
    this.panel.style.top = `${y}px`;

    // Update panel title based on thread state
    const titleEl = this.panel.querySelector('.comment-panel-title');
    if (titleEl) {
      titleEl.textContent = comment.thread.length === 0 ? 'New Comment' : 'Comment Thread';
    }

    // Render the comment thread
    this.renderThread();

    // Clear reply input (but don't focus it to avoid blurring the editor)
    const replyInput = this.panel.querySelector('.comment-input');
    replyInput.value = '';
  }

  /**
   * Hide the panel
   * @param {boolean} skipFocusRestore - Skip restoring focus to editor
   * @param {boolean} force - Force hide even if input is active
   */
  hide(skipFocusRestore = false, force = false) {
    // Don't hide if user is actively typing in the input (unless forced)
    if (this.inputActive && !force) {
      return;
    }

    this.panel.classList.remove('visible');
    this.comment = null;
    this.inputActive = false; // Reset input active state

    // Restore focus to editor (unless hiding due to scroll)
    if (!skipFocusRestore) {
      this.restoreEditorFocus();
    }
  }

  /**
   * Restore focus to the editor without changing scroll position
   */
  restoreEditorFocus() {
    // Try to find and focus the editor
    const editor = document.querySelector('#editor .cm-content, #editor .ProseMirror');
    if (editor) {
      // Use preventScroll to avoid scroll jumping
      editor.focus({ preventScroll: true });
    }
  }

  /**
   * Check if panel is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.panel.classList.contains('visible');
  }

  /**
   * Render the comment thread
   */
  renderThread() {
    if (!this.comment) return;

    const threadContainer = this.panel.querySelector('.comment-thread');
    threadContainer.innerHTML = '';

    // If thread is empty, show placeholder
    if (this.comment.thread.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'comment-placeholder';
      placeholder.innerHTML = `
        <p style="color: var(--text-secondary); font-size: 14px; margin: 0;">
          Start the conversation by adding a comment below.
        </p>
      `;
      threadContainer.appendChild(placeholder);
    } else {
      // Render each message in the thread
      this.comment.thread.forEach((message, index) => {
        const messageEl = this.createMessageElement(message, index === 0);
        threadContainer.appendChild(messageEl);
      });
    }

    // Show/hide reply form based on resolved state
    const replyForm = this.panel.querySelector('.comment-reply-form');
    if (this.comment.resolved) {
      replyForm.style.display = 'none';
    } else {
      replyForm.style.display = 'block';
    }

    // Update reply form placeholder text
    const replyInput = this.panel.querySelector('.comment-input');
    if (replyInput) {
      replyInput.placeholder =
        this.comment.thread.length === 0 ? 'Add your comment...' : 'Add a reply...';
    }
  }

  /**
   * Create a message element
   * @param {object} message - Message object
   * @param {boolean} isFirst - Whether this is the first message
   * @returns {HTMLElement}
   */
  createMessageElement(message, isFirst) {
    const messageEl = document.createElement('div');
    messageEl.className = 'comment-item';
    if (this.comment.resolved) {
      messageEl.classList.add('resolved');
    }

    const timestamp = new Date(message.timestamp).toLocaleString();
    const userName = message.userName || getUserDisplayName();

    messageEl.innerHTML = `
      <div class="comment-header">
        <span class="comment-user">${this.escapeHtml(userName)}</span>
        <span class="comment-timestamp">${timestamp}</span>
      </div>
      <div class="comment-text">${this.escapeHtml(message.text)}</div>
      ${
        isFirst && !this.comment.resolved
          ? `
        <div class="comment-actions">
          <button class="comment-action-btn resolve-btn">Resolve</button>
          <button class="comment-action-btn delete-btn">Delete</button>
        </div>
      `
          : ''
      }
    `;

    // Add event listeners for action buttons
    if (isFirst && !this.comment.resolved) {
      const resolveBtn = messageEl.querySelector('.resolve-btn');
      const deleteBtn = messageEl.querySelector('.delete-btn');

      resolveBtn?.addEventListener('click', () => this.handleResolve());
      deleteBtn?.addEventListener('click', () => this.handleDelete());
    }

    return messageEl;
  }

  /**
   * Handle reply submission
   */
  handleReply() {
    const replyInput = this.panel.querySelector('.comment-input');
    const text = replyInput.value.trim();

    if (!text || !this.comment) return;

    if (this.onReply) {
      this.onReply(this.comment.id, text);
    }

    // Clear input
    replyInput.value = '';
  }

  /**
   * Handle resolve action
   */
  handleResolve() {
    if (this.comment && this.onResolve) {
      this.onResolve(this.comment.id);
    }
  }

  /**
   * Handle delete action
   */
  handleDelete() {
    if (this.comment && this.onDelete) {
      if (window.confirm('Delete this comment thread?')) {
        this.onDelete(this.comment.id);
        this.hide(false, true); // Force hide after deletion
      }
    }
  }

  /**
   * Start dragging the panel
   */
  startDrag(e) {
    if (e.target.closest('.comment-panel-close')) return;

    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    this.panel.style.cursor = 'grabbing';
  }

  /**
   * Drag the panel
   */
  drag(e) {
    if (!this.isDragging) return;

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;

    // Keep panel within viewport
    const maxX = window.innerWidth - this.panel.offsetWidth;
    const maxY = window.innerHeight - this.panel.offsetHeight;

    this.panel.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    this.panel.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
  }

  /**
   * Stop dragging the panel
   */
  stopDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.panel.style.cursor = '';
    }
  }

  /**
   * Update the panel with new comment data
   * @param {object} comment - Updated comment object
   */
  update(comment) {
    this.comment = comment;

    // Update panel title
    const titleEl = this.panel.querySelector('.comment-panel-title');
    if (titleEl) {
      titleEl.textContent = comment.thread.length === 0 ? 'New Comment' : 'Comment Thread';
    }

    this.renderThread();
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Destroy the panel
   */
  destroy() {
    // Remove scroll handler
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler, true);
      this.scrollHandler = null;
    }

    // Remove editor click handler
    if (this.editorClickHandler) {
      document.removeEventListener('click', this.editorClickHandler, true);
      this.editorClickHandler = null;
    }

    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    this.comment = null;
  }
}
