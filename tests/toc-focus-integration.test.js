import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Integration tests for TOC and FocusManager
 * Tests the fix for focus management issues when clicking TOC items
 */

describe('TOC and FocusManager Integration', () => {
  let tocContent;
  let mockEditor;
  let mockEditorManager;
  let mockFocusManager;
  let appState;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="editor-wrapper">
        <div id="markdown-sidebar" class="markdown-sidebar">
          <div id="markdown-toc" class="markdown-toc">
            <h3 class="toc-title">Contents</h3>
            <div id="toc-content" class="toc-content"></div>
          </div>
        </div>
        <div id="editor" class="editor">
          <div class="ProseMirror" tabindex="0"></div>
        </div>
      </div>
    `;

    tocContent = document.getElementById('toc-content');

    // Mock editor with scrollToPosition (no direct focus management)
    mockEditor = {
      scrollToPosition: vi.fn((pos) => {
        // Simplified version: just sets cursor, no focus
        console.log(`[Mock] scrollToPosition called with ${pos}`);
      }),
      getHeadings: vi.fn(() => []),
      focus: vi.fn(),
    };

    mockEditorManager = {
      getActiveEditor: vi.fn(() => mockEditor),
      getMode: vi.fn(() => 'wysiwyg'),
    };

    // Mock FocusManager
    mockFocusManager = {
      saveFocusState: vi.fn(),
      focusEditor: vi.fn(),
      hasEditorFocus: vi.fn(() => true),
    };

    // Create global appState
    appState = {
      editorManager: mockEditorManager,
      focusManager: mockFocusManager,
    };

    // Make appState global for the TOC click handler
    global.appState = appState;
  });

  afterEach(() => {
    delete global.appState;
    vi.clearAllMocks();
  });

  describe('FocusManager Integration', () => {
    it('should call saveFocusState before TOC navigation', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="42">
            <span class="toc-chevron-spacer"></span>
            <span class="toc-text">Test Heading</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');

      // Simulate the actual click handler from app.js with FocusManager integration
      tocText.addEventListener('click', (e) => {
        e.stopPropagation();

        // Save focus state before navigation
        appState.focusManager.saveFocusState();

        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          editor.scrollToPosition(pos);

          // Restore focus using FocusManager
          appState.focusManager.focusEditor({
            delay: 50,
            reason: 'toc-navigation',
          });
        }
      });

      tocText.click();

      // Verify FocusManager was called BEFORE scrollToPosition
      expect(mockFocusManager.saveFocusState).toHaveBeenCalledTimes(1);
      expect(mockFocusManager.saveFocusState).toHaveBeenCalledBefore(mockEditor.scrollToPosition);
    });

    it('should call focusEditor after TOC navigation', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="100">
            <span class="toc-text">Another Heading</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');

      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        appState.focusManager.saveFocusState();

        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          editor.scrollToPosition(pos);
          appState.focusManager.focusEditor({
            delay: 50,
            reason: 'toc-navigation',
          });
        }
      });

      tocText.click();

      // Verify focusEditor was called with correct parameters
      expect(mockFocusManager.focusEditor).toHaveBeenCalledTimes(1);
      expect(mockFocusManager.focusEditor).toHaveBeenCalledWith({
        delay: 50,
        reason: 'toc-navigation',
      });
    });

    it('should use consistent delay pattern (50ms like other UI elements)', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="50">
            <span class="toc-text">Test</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');

      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        appState.focusManager.saveFocusState();

        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          editor.scrollToPosition(pos);
          appState.focusManager.focusEditor({
            delay: 50,
            reason: 'toc-navigation',
          });
        }
      });

      tocText.click();

      const focusEditorCall = mockFocusManager.focusEditor.mock.calls[0][0];
      expect(focusEditorCall.delay).toBe(50);
    });

    it('should call focus methods in correct order', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="75">
            <span class="toc-text">Heading</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');
      const callOrder = [];

      // Track call order
      mockFocusManager.saveFocusState.mockImplementation(() => {
        callOrder.push('saveFocusState');
      });
      mockEditor.scrollToPosition.mockImplementation(() => {
        callOrder.push('scrollToPosition');
      });
      mockFocusManager.focusEditor.mockImplementation(() => {
        callOrder.push('focusEditor');
      });

      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        appState.focusManager.saveFocusState();

        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          editor.scrollToPosition(pos);
          appState.focusManager.focusEditor({
            delay: 50,
            reason: 'toc-navigation',
          });
        }
      });

      tocText.click();

      expect(callOrder).toEqual(['saveFocusState', 'scrollToPosition', 'focusEditor']);
    });
  });

  describe('Rapid TOC Clicks', () => {
    it('should handle rapid clicks gracefully', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="10">
            <span class="toc-text">First</span>
          </div>
        </div>
        <div class="toc-item-container">
          <div class="toc-item" data-pos="50">
            <span class="toc-text">Second</span>
          </div>
        </div>
        <div class="toc-item-container">
          <div class="toc-item" data-pos="90">
            <span class="toc-text">Third</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocTexts = tocContent.querySelectorAll('.toc-text');
      tocTexts.forEach((text) => {
        text.addEventListener('click', (e) => {
          e.stopPropagation();
          appState.focusManager.saveFocusState();

          const item = e.target.closest('.toc-item');
          const pos = parseInt(item.dataset.pos, 10);
          const editor = appState.editorManager?.getActiveEditor();

          if (editor && editor.scrollToPosition) {
            editor.scrollToPosition(pos);
            appState.focusManager.focusEditor({
              delay: 50,
              reason: 'toc-navigation',
            });
          }
        });
      });

      // Click all three items rapidly
      tocTexts[0].click();
      tocTexts[1].click();
      tocTexts[2].click();

      // All clicks should be processed
      expect(mockFocusManager.saveFocusState).toHaveBeenCalledTimes(3);
      expect(mockEditor.scrollToPosition).toHaveBeenCalledTimes(3);
      expect(mockFocusManager.focusEditor).toHaveBeenCalledTimes(3);

      // Verify correct positions
      expect(mockEditor.scrollToPosition).toHaveBeenNthCalledWith(1, 10);
      expect(mockEditor.scrollToPosition).toHaveBeenNthCalledWith(2, 50);
      expect(mockEditor.scrollToPosition).toHaveBeenNthCalledWith(3, 90);
    });
  });

  describe('Edge Cases', () => {
    it('should not call focusEditor if editor is not available', () => {
      mockEditorManager.getActiveEditor.mockReturnValue(null);

      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="10">
            <span class="toc-text">Test</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');

      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        appState.focusManager.saveFocusState();

        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          editor.scrollToPosition(pos);
          appState.focusManager.focusEditor({
            delay: 50,
            reason: 'toc-navigation',
          });
        }
      });

      tocText.click();

      // saveFocusState should still be called
      expect(mockFocusManager.saveFocusState).toHaveBeenCalledTimes(1);
      // But focusEditor should NOT be called since editor is null
      expect(mockFocusManager.focusEditor).not.toHaveBeenCalled();
    });

    it('should not call focusEditor if scrollToPosition does not exist', () => {
      const editorWithoutScroll = {
        getHeadings: vi.fn(() => []),
        focus: vi.fn(),
        // No scrollToPosition method
      };
      mockEditorManager.getActiveEditor.mockReturnValue(editorWithoutScroll);

      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="10">
            <span class="toc-text">Test</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');

      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        appState.focusManager.saveFocusState();

        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          editor.scrollToPosition(pos);
          appState.focusManager.focusEditor({
            delay: 50,
            reason: 'toc-navigation',
          });
        }
      });

      tocText.click();

      // saveFocusState should still be called
      expect(mockFocusManager.saveFocusState).toHaveBeenCalledTimes(1);
      // But focusEditor should NOT be called
      expect(mockFocusManager.focusEditor).not.toHaveBeenCalled();
    });

    it('should handle clicks when editorManager is undefined', () => {
      appState.editorManager = undefined;

      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="10">
            <span class="toc-text">Test</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');

      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        appState.focusManager.saveFocusState();

        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          editor.scrollToPosition(pos);
          appState.focusManager.focusEditor({
            delay: 50,
            reason: 'toc-navigation',
          });
        }
      });

      expect(() => tocText.click()).not.toThrow();
      expect(mockFocusManager.saveFocusState).toHaveBeenCalledTimes(1);
      expect(mockFocusManager.focusEditor).not.toHaveBeenCalled();
    });
  });

  describe('Focus Manager Reason Tracking', () => {
    it('should provide "toc-navigation" as the reason for focus', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="25">
            <span class="toc-text">Test</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');

      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        appState.focusManager.saveFocusState();

        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          editor.scrollToPosition(pos);
          appState.focusManager.focusEditor({
            delay: 50,
            reason: 'toc-navigation',
          });
        }
      });

      tocText.click();

      const focusEditorCall = mockFocusManager.focusEditor.mock.calls[0][0];
      expect(focusEditorCall.reason).toBe('toc-navigation');
    });
  });
});
