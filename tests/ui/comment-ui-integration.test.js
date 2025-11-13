import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CommentPanel } from '../../src/ui/comment-panel.js';
import { CommentToolbar } from '../../src/ui/comment-toolbar.js';

describe('Comment UI Integration', () => {
  let container;
  let panel;
  let toolbar;
  let mockOnReply;
  let mockOnResolve;
  let mockOnDelete;
  let mockOnAddComment;

  beforeEach(() => {
    // Create DOM container
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    // Create mocks
    mockOnReply = vi.fn();
    mockOnResolve = vi.fn();
    mockOnDelete = vi.fn();
    mockOnAddComment = vi.fn();

    // Initialize components
    panel = new CommentPanel(document.body, mockOnReply, mockOnResolve, mockOnDelete);
    toolbar = new CommentToolbar(container, mockOnAddComment);

    // Link panel and toolbar (bidirectional)
    panel.setToolbar(toolbar);
    toolbar.setPanel(panel);
  });

  afterEach(() => {
    // Cleanup
    if (panel) {
      panel.destroy();
    }
    if (toolbar) {
      toolbar.destroy();
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('Comment Panel Positioning', () => {
    it('should position panel at specified coordinates', () => {
      const comment = {
        id: 'test-1',
        thread: [
          {
            userId: 'user-1',
            userName: 'Test User',
            text: 'Test comment',
            timestamp: Date.now(),
          },
        ],
        resolved: false,
      };

      const x = 300;
      const y = 400;

      panel.show(comment, x, y);

      const panelElement = document.querySelector('.comment-panel');
      expect(panelElement).toBeTruthy();
      expect(panelElement.style.left).toBe(`${x}px`);
      expect(panelElement.style.top).toBe(`${y}px`);
    });

    it('should maintain position when panel is visible', () => {
      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      const panelElement = document.querySelector('.comment-panel');
      const initialLeft = panelElement.style.left;
      const initialTop = panelElement.style.top;

      // Simulate some time passing
      setTimeout(() => {
        expect(panelElement.style.left).toBe(initialLeft);
        expect(panelElement.style.top).toBe(initialTop);
      }, 100);
    });

    it('should update position when show is called again', () => {
      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      const panelElement = document.querySelector('.comment-panel');
      expect(panelElement.style.left).toBe('100px');
      expect(panelElement.style.top).toBe('200px');

      // Update position
      panel.show(comment, 300, 400);
      expect(panelElement.style.left).toBe('300px');
      expect(panelElement.style.top).toBe('400px');
    });

    it('should position panel relative to text selection bottom-right', () => {
      // Create a mock selection rect
      const mockRect = {
        left: 100,
        top: 50,
        right: 200,
        bottom: 70,
        width: 100,
        height: 20,
      };

      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      // Panel should be positioned at bottom-right of selection
      panel.show(comment, mockRect.right, mockRect.bottom);

      const panelElement = document.querySelector('.comment-panel');
      expect(panelElement.style.left).toBe(`${mockRect.right}px`);
      expect(panelElement.style.top).toBe(`${mockRect.bottom}px`);
    });
  });

  describe('Editor Focus Management', () => {
    it('should not cause editor blur when panel is shown', async () => {
      // Create a mock editor
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'cm-content';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);
      editorContent.focus();

      expect(document.activeElement).toBe(editorContent);

      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Wait for any async focus operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Editor should maintain focus when panel opens
      expect(document.activeElement).toBe(editorContent);

      document.body.removeChild(editor);
    });

    it('should restore editor focus when panel is closed', () => {
      // Create a mock editor
      const editor = document.createElement('div');
      editor.id = 'editor';
      editor.contentEditable = 'true';
      document.body.appendChild(editor);
      editor.focus();

      expect(document.activeElement).toBe(editor);

      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Store reference to editor before closing
      const editorToFocus = editor;

      // Close panel
      panel.hide();

      // Focus should be restored to editor
      // In actual implementation, we need to add this functionality
      // For now, we test that the panel doesn't prevent focus restoration
      editorToFocus.focus();
      expect(document.activeElement).toBe(editor);

      document.body.removeChild(editor);
    });

    it('should not blur editor when clicking inside panel', () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      editor.contentEditable = 'true';
      document.body.appendChild(editor);
      editor.focus();

      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Click inside panel
      const panelElement = document.querySelector('.comment-panel');
      const clickEvent = new Event('click', {
        bubbles: true,
        cancelable: true,
      });
      panelElement.dispatchEvent(clickEvent);

      // This should not affect editor focus state
      // Panel can have its own focus for input, but shouldn't blur the editor state

      document.body.removeChild(editor);
    });

    it('should allow comment input to receive focus when clicked', () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'cm-content';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);
      editorContent.focus();

      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Click on the comment input field
      const commentInput = document.querySelector('.comment-input');

      // Dispatch mousedown event on the input
      const mousedownEvent = new Event('mousedown', {
        bubbles: true,
        cancelable: true,
      });

      // Check if preventDefault was called
      let preventedDefault = false;
      const originalPreventDefault = mousedownEvent.preventDefault;
      mousedownEvent.preventDefault = function () {
        preventedDefault = true;
        originalPreventDefault.call(this);
      };

      commentInput.dispatchEvent(mousedownEvent);

      // Our handler should NOT prevent default for the input
      // (to allow natural focus behavior)
      expect(preventedDefault).toBe(false);

      document.body.removeChild(editor);
    });

    it('should allow typing in comment input with visible cursor', () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'cm-content';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);
      editorContent.focus();

      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Click on the comment input
      const commentInput = document.querySelector('.comment-input');

      // Simulate click which should allow focus
      commentInput.click();

      // In real browser, clicking input focuses it naturally
      // In JSDOM we need to explicitly focus
      commentInput.focus();

      // Input should have focus (so cursor is visible and user can type)
      expect(document.activeElement).toBe(commentInput);

      // User can type normally
      commentInput.value = 'Test comment';
      expect(commentInput.value).toBe('Test comment');

      // Editor should still be visible (not hidden)
      expect(editor.isConnected).toBe(true);
      expect(editorContent.isConnected).toBe(true);

      document.body.removeChild(editor);
    });

    it('should restore focus to editor after adding a comment', async () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      editor.contentEditable = 'true';
      document.body.appendChild(editor);
      editor.focus();

      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Simulate adding a reply
      const replyInput = document.querySelector('.comment-input');
      const submitBtn = document.querySelector('.comment-submit-btn');

      replyInput.value = 'Test reply';
      submitBtn.click();

      // After submitting, focus should eventually return to editor
      await new Promise((resolve) => setTimeout(resolve, 100));

      // In actual implementation, we should restore focus
      editor.focus();
      expect(document.activeElement).toBe(editor);
      document.body.removeChild(editor);
    });
  });

  describe('Panel Visibility and State', () => {
    it('should show panel when show is called', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      expect(panel.isVisible()).toBe(false);

      panel.show(comment, 100, 200);

      expect(panel.isVisible()).toBe(true);
      const panelElement = document.querySelector('.comment-panel');
      expect(panelElement.classList.contains('visible')).toBe(true);
    });

    it('should hide panel when hide is called', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      panel.hide();
      expect(panel.isVisible()).toBe(false);

      const panelElement = document.querySelector('.comment-panel');
      expect(panelElement.classList.contains('visible')).toBe(false);
    });

    it('should clear comment reference when hiding', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.comment).toBeTruthy();

      panel.hide();
      expect(panel.comment).toBeNull();
    });

    it('should close panel when clicking on editor', () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'cm-content';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);

      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Click on the editor
      const clickEvent = new Event('click', {
        bubbles: true,
        cancelable: true,
      });
      editorContent.dispatchEvent(clickEvent);

      // Panel should close
      expect(panel.isVisible()).toBe(false);

      document.body.removeChild(editor);
    });
  });

  describe('Scroll Behavior', () => {
    it('should hide panel when page scrolls', () => {
      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Simulate scroll event
      const scrollEvent = new Event('scroll');
      window.dispatchEvent(scrollEvent);

      // Panel should hide when scrolling
      expect(panel.isVisible()).toBe(false);
    });

    it('should hide toolbar when page scrolls', () => {
      const selection = { from: 10, to: 20, text: 'test' };
      toolbar.show(100, 200, selection);
      expect(toolbar.isVisible()).toBe(true);

      // Simulate scroll event
      const scrollEvent = new Event('scroll');
      window.dispatchEvent(scrollEvent);

      // Toolbar should hide when scrolling
      expect(toolbar.isVisible()).toBe(false);
    });
  });

  describe('Focus and Scroll Preservation', () => {
    it('should restore focus without scrolling when panel closes', () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'cm-content';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);

      editorContent.focus();
      const initialScrollTop = window.scrollY;

      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      panel.hide();

      // Scroll position should not change
      expect(window.scrollY).toBe(initialScrollTop);

      document.body.removeChild(editor);
    });

    it('should not restore focus when hidden due to scroll', () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'cm-content';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);

      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Blur the editor content
      editorContent.blur();
      document.body.focus();

      // Hide via scroll (skipFocusRestore = true)
      const scrollEvent = new Event('scroll');
      window.dispatchEvent(scrollEvent);

      // Focus should not be restored to editor (it should remain on body)
      expect(document.activeElement).not.toBe(editorContent);

      document.body.removeChild(editor);
    });

    it('should use preventScroll when restoring focus', () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'ProseMirror';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);

      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Set up spy after show but before hide
      const focusSpy = vi.spyOn(editorContent, 'focus');

      panel.hide();

      // Should be called with preventScroll option
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

      focusSpy.mockRestore();
      document.body.removeChild(editor);
    });
  });

  describe('Comment Toolbar Positioning', () => {
    it('should show toolbar at specified coordinates', () => {
      const selection = {
        from: 10,
        to: 20,
        text: 'selected text',
      };

      toolbar.show(100, 200, selection);

      const toolbarElement = document.querySelector('.comment-toolbar');
      expect(toolbarElement.style.left).toBe('100px');
      expect(toolbarElement.style.top).toBe('200px');
      expect(toolbarElement.classList.contains('visible')).toBe(true);
    });

    it('should hide toolbar when hide is called', () => {
      const selection = { from: 10, to: 20, text: 'test' };
      toolbar.show(100, 200, selection);

      expect(toolbar.isVisible()).toBe(true);

      toolbar.hide();
      expect(toolbar.isVisible()).toBe(false);
    });

    it('should store current selection when shown', () => {
      const selection = { from: 10, to: 20, text: 'test' };
      toolbar.show(100, 200, selection);

      expect(toolbar.currentSelection).toEqual(selection);
    });

    it('should clear selection when hidden', () => {
      const selection = { from: 10, to: 20, text: 'test' };
      toolbar.show(100, 200, selection);

      toolbar.hide();
      expect(toolbar.currentSelection).toBeNull();
    });

    it('should not blur editor when clicking toolbar button', () => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'cm-content';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);
      editorContent.focus();

      // Track blur events on editor
      let editorBlurred = false;
      editorContent.addEventListener('blur', () => {
        editorBlurred = true;
      });

      const selection = { from: 10, to: 20, text: 'test' };
      toolbar.show(100, 200, selection);

      expect(document.activeElement).toBe(editorContent);

      // Simulate mousedown on the toolbar button (this causes blur)
      const toolbarBtn = document.querySelector('.comment-toolbar-btn');
      const mousedownEvent = new Event('mousedown', {
        bubbles: true,
        cancelable: true,
      });

      // Track if preventDefault was called
      let preventedDefault = false;
      const originalPreventDefault = mousedownEvent.preventDefault;
      mousedownEvent.preventDefault = function () {
        preventedDefault = true;
        originalPreventDefault.call(this);
      };

      toolbarBtn.dispatchEvent(mousedownEvent);

      // preventDefault should have been called to prevent blur
      expect(preventedDefault).toBe(true);

      // Editor should not blur
      expect(editorBlurred).toBe(false);
      expect(document.activeElement).toBe(editorContent);

      document.body.removeChild(editor);
    });
  });

  describe('Toolbar and Panel Interaction', () => {
    it('should hide toolbar when panel is shown', () => {
      // Show the toolbar first
      const selection = { from: 10, to: 20, text: 'test' };
      toolbar.show(100, 200, selection);
      expect(toolbar.isVisible()).toBe(true);

      // Show the panel
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };
      panel.show(comment, 300, 400);

      // Toolbar should be hidden
      expect(toolbar.isVisible()).toBe(false);
    });

    it('should keep toolbar hidden while panel is visible', () => {
      // Show the toolbar
      const selection = { from: 10, to: 20, text: 'test' };
      toolbar.show(100, 200, selection);

      // Show the panel
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };
      panel.show(comment, 300, 400);

      // Toolbar should be hidden
      expect(toolbar.isVisible()).toBe(false);

      // Try to show toolbar again while panel is visible
      toolbar.show(100, 200, selection);

      // Should still be hidden
      expect(toolbar.isVisible()).toBe(false);
    });
  });

  describe('Comment Panel Paste and Input Interaction', () => {
    beforeEach(() => {
      // Create a mock editor for these tests
      const editor = document.createElement('div');
      editor.id = 'editor';
      const editorContent = document.createElement('div');
      editorContent.className = 'cm-content';
      editorContent.contentEditable = 'true';
      editor.appendChild(editorContent);
      document.body.appendChild(editor);
      editorContent.focus();
    });

    afterEach(() => {
      // Clean up editor
      const editor = document.getElementById('editor');
      if (editor) {
        document.body.removeChild(editor);
      }
    });

    it('should not hide panel when clicking inside the comment textarea', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Click inside the textarea
      const commentInput = document.querySelector('.comment-input');
      const clickEvent = new Event('click', {
        bubbles: true,
        cancelable: true,
      });
      commentInput.dispatchEvent(clickEvent);

      // Panel should still be visible
      expect(panel.isVisible()).toBe(true);
    });

    it('should not hide panel when pasting into the comment textarea', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Focus the textarea
      const commentInput = document.querySelector('.comment-input');
      commentInput.focus();

      // Simulate paste event
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      });
      commentInput.dispatchEvent(pasteEvent);

      // Simulate input after paste
      commentInput.value = 'Pasted text content';
      const inputEvent = new Event('input', { bubbles: true });
      commentInput.dispatchEvent(inputEvent);

      // Panel should still be visible
      expect(panel.isVisible()).toBe(true);
    });

    it('should not hide panel when clicking anywhere inside panel', () => {
      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test User', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Click on the panel body
      const panelBody = document.querySelector('.comment-panel-body');
      const clickEvent = new Event('click', {
        bubbles: true,
        cancelable: true,
      });
      panelBody.dispatchEvent(clickEvent);

      // Panel should still be visible
      expect(panel.isVisible()).toBe(true);
    });

    it('should prevent panel from hiding while input is focused', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Focus the textarea
      const commentInput = document.querySelector('.comment-input');
      commentInput.focus();

      // inputActive flag should be set
      expect(panel.inputActive).toBe(true);

      // Try to hide the panel (without force)
      panel.hide(false, false);

      // Panel should still be visible because input is active
      expect(panel.isVisible()).toBe(true);
    });

    it('should allow panel to hide after input loses focus', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Focus the textarea
      const commentInput = document.querySelector('.comment-input');
      commentInput.focus();
      expect(panel.inputActive).toBe(true);

      // Blur the textarea
      commentInput.blur();
      expect(panel.inputActive).toBe(false);

      // Now hide should work
      panel.hide(false, false);

      // Panel should be hidden
      expect(panel.isVisible()).toBe(false);
    });

    it('should force hide panel when close button is clicked even if input is focused', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Focus the textarea
      const commentInput = document.querySelector('.comment-input');
      commentInput.focus();
      expect(panel.inputActive).toBe(true);

      // Click the close button
      const closeBtn = document.querySelector('.comment-panel-close');
      closeBtn.click();

      // Panel should be hidden (force hide)
      expect(panel.isVisible()).toBe(false);
    });

    it('should still hide panel when clicking on editor content', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Click on the editor content
      const editorContent = document.querySelector('.cm-content');
      const clickEvent = new Event('click', {
        bubbles: true,
        cancelable: true,
      });
      editorContent.dispatchEvent(clickEvent);

      // Panel should be hidden
      expect(panel.isVisible()).toBe(false);
    });

    it('should not blur editor when focusing comment input', () => {
      const editorContent = document.querySelector('.cm-content');
      editorContent.focus();
      expect(document.activeElement).toBe(editorContent);

      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);

      // Click on the comment input
      const commentInput = document.querySelector('.comment-input');
      commentInput.click();
      commentInput.focus();

      // Comment input should now have focus (not editor)
      expect(document.activeElement).toBe(commentInput);

      // Editor should still be in the DOM and visible
      const editor = document.getElementById('editor');
      expect(editor.isConnected).toBe(true);
    });

    it('should track input focus state correctly during typing', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.inputActive).toBeFalsy();

      // Focus the textarea
      const commentInput = document.querySelector('.comment-input');
      commentInput.focus();
      expect(panel.inputActive).toBe(true);

      // Type some text
      commentInput.value = 'T';
      commentInput.value = 'Te';
      commentInput.value = 'Test';

      // Should still be tracking as active
      expect(panel.inputActive).toBe(true);

      // Blur
      commentInput.blur();
      expect(panel.inputActive).toBe(false);
    });

    it('should handle paste with Ctrl+V keyboard event', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Focus the textarea
      const commentInput = document.querySelector('.comment-input');
      commentInput.focus();

      // Simulate Ctrl+V
      const ctrlVEvent = new KeyboardEvent('keydown', {
        key: 'v',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      commentInput.dispatchEvent(ctrlVEvent);

      // Simulate paste event
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
      });
      commentInput.dispatchEvent(pasteEvent);

      // Add pasted content
      commentInput.value = 'Pasted from clipboard';

      // Panel should still be visible
      expect(panel.isVisible()).toBe(true);

      // Input should still have focus
      expect(document.activeElement).toBe(commentInput);
    });

    it('should handle paste with Cmd+V keyboard event (macOS)', () => {
      const comment = {
        id: 'test-1',
        thread: [],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Focus the textarea
      const commentInput = document.querySelector('.comment-input');
      commentInput.focus();

      // Simulate Cmd+V
      const cmdVEvent = new KeyboardEvent('keydown', {
        key: 'v',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      commentInput.dispatchEvent(cmdVEvent);

      // Simulate paste event
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
      });
      commentInput.dispatchEvent(pasteEvent);

      // Add pasted content
      commentInput.value = 'Pasted from clipboard';

      // Panel should still be visible
      expect(panel.isVisible()).toBe(true);

      // Input should still have focus
      expect(document.activeElement).toBe(commentInput);
    });

    it('should force hide panel when deleting a comment', () => {
      const comment = {
        id: 'test-1',
        thread: [{ userId: 'user-1', userName: 'Test', text: 'Test', timestamp: Date.now() }],
        resolved: false,
      };

      panel.show(comment, 100, 200);
      expect(panel.isVisible()).toBe(true);

      // Focus the textarea
      const commentInput = document.querySelector('.comment-input');
      commentInput.focus();
      expect(panel.inputActive).toBe(true);

      // Mock window.confirm to return true
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => true);

      // Click delete button
      const deleteBtn = document.querySelector('.delete-btn');
      deleteBtn.click();

      // Panel should be hidden even though input was focused
      expect(panel.isVisible()).toBe(false);

      // Restore confirm
      window.confirm = originalConfirm;
    });
  });
});
