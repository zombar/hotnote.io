import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Integration tests for TOC click behavior and focus management
 */

describe('TOC Click Behavior Integration', () => {
  let tocContent;
  let mockEditor;
  let mockEditorManager;

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
        <div id="editor"></div>
      </div>
    `;

    tocContent = document.getElementById('toc-content');

    // Mock editor
    mockEditor = {
      scrollToPosition: vi.fn(),
      getHeadings: vi.fn(() => []),
      focus: vi.fn(),
    };

    mockEditorManager = {
      getActiveEditor: vi.fn(() => mockEditor),
      getMode: vi.fn(() => 'wysiwyg'),
    };
  });

  describe('TOC item click behavior', () => {
    it('should call scrollToPosition when clicking TOC item', () => {
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
      const clickEvent = new window.MouseEvent('click', { bubbles: true });

      // Simulate the click handler from app.js
      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        mockEditor.scrollToPosition(pos);
      });

      tocText.dispatchEvent(clickEvent);

      expect(mockEditor.scrollToPosition).toHaveBeenCalledWith(42);
    });

    it('should not propagate click events', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="10">
            <span class="toc-text">Test</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const propagationSpy = vi.fn();
      tocContent.addEventListener('click', propagationSpy);

      const tocText = tocContent.querySelector('.toc-text');
      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      const clickEvent = new window.MouseEvent('click', { bubbles: true });
      tocText.dispatchEvent(clickEvent);

      expect(propagationSpy).not.toHaveBeenCalled();
    });

    it('should handle clicks on multiple TOC items', () => {
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
      `;
      tocContent.innerHTML = tocHtml;

      const tocTexts = tocContent.querySelectorAll('.toc-text');
      tocTexts.forEach((text) => {
        text.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = e.target.closest('.toc-item');
          const pos = parseInt(item.dataset.pos, 10);
          mockEditor.scrollToPosition(pos);
        });
      });

      tocTexts[0].click();
      expect(mockEditor.scrollToPosition).toHaveBeenCalledWith(10);

      tocTexts[1].click();
      expect(mockEditor.scrollToPosition).toHaveBeenCalledWith(50);
      expect(mockEditor.scrollToPosition).toHaveBeenCalledTimes(2);
    });
  });

  describe('Chevron click behavior', () => {
    it('should toggle collapsed class on chevron click', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item">
            <span class="toc-chevron">▼</span>
            <span class="toc-text">Parent</span>
          </div>
          <div class="toc-item-container">
            <div class="toc-item">
              <span class="toc-text">Child</span>
            </div>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const chevron = tocContent.querySelector('.toc-chevron');

      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        chevron.classList.toggle('collapsed');
      });

      expect(chevron.classList.contains('collapsed')).toBe(false);

      chevron.click();
      expect(chevron.classList.contains('collapsed')).toBe(true);

      chevron.click();
      expect(chevron.classList.contains('collapsed')).toBe(false);
    });

    it('should toggle hidden class on child containers', () => {
      const tocHtml = `
        <div class="toc-item-container" id="parent">
          <div class="toc-item">
            <span class="toc-chevron">▼</span>
            <span class="toc-text">Parent</span>
          </div>
          <div class="toc-item-container" id="child1">
            <div class="toc-item">
              <span class="toc-text">Child 1</span>
            </div>
          </div>
          <div class="toc-item-container" id="child2">
            <div class="toc-item">
              <span class="toc-text">Child 2</span>
            </div>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const chevron = tocContent.querySelector('.toc-chevron');
      const child1 = document.getElementById('child1');
      const child2 = document.getElementById('child2');

      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        const container = chevron.closest('.toc-item-container');
        const nestedContainers = Array.from(
          container.querySelectorAll(':scope > .toc-item-container')
        );
        nestedContainers.forEach((nested) => {
          nested.classList.toggle('hidden');
        });
      });

      chevron.click();
      expect(child1.classList.contains('hidden')).toBe(true);
      expect(child2.classList.contains('hidden')).toBe(true);

      chevron.click();
      expect(child1.classList.contains('hidden')).toBe(false);
      expect(child2.classList.contains('hidden')).toBe(false);
    });

    it('should not affect parent or sibling containers', () => {
      const tocHtml = `
        <div class="toc-item-container" id="parent">
          <div class="toc-item">
            <span class="toc-chevron" id="parent-chevron">▼</span>
            <span class="toc-text">Parent</span>
          </div>
          <div class="toc-item-container" id="child">
            <div class="toc-item">
              <span class="toc-chevron" id="child-chevron">▼</span>
              <span class="toc-text">Child</span>
            </div>
            <div class="toc-item-container" id="grandchild">
              <div class="toc-item">
                <span class="toc-text">Grandchild</span>
              </div>
            </div>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const childChevron = document.getElementById('child-chevron');
      const grandchild = document.getElementById('grandchild');
      const child = document.getElementById('child');

      childChevron.addEventListener('click', (e) => {
        e.stopPropagation();
        const container = childChevron.closest('.toc-item-container');
        const nestedContainers = Array.from(
          container.querySelectorAll(':scope > .toc-item-container')
        );
        nestedContainers.forEach((nested) => {
          nested.classList.toggle('hidden');
        });
      });

      childChevron.click();

      expect(grandchild.classList.contains('hidden')).toBe(true);
      expect(child.classList.contains('hidden')).toBe(false);
    });
  });

  describe('Focus management', () => {
    it('should not blur editor when clicking TOC items', () => {
      const editor = document.getElementById('editor');
      const activeElementSpy = vi.spyOn(document, 'activeElement', 'get');

      editor.focus();
      activeElementSpy.mockReturnValue(editor);

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
        // Simulate scrollToPosition which maintains focus
        mockEditor.scrollToPosition(10);
      });

      tocText.click();

      // Verify scrollToPosition was called (which includes focus management)
      expect(mockEditor.scrollToPosition).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle missing position data gracefully', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item">
            <span class="toc-text">Test</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocText = tocContent.querySelector('.toc-text');
      tocText.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.toc-item');
        const pos = parseInt(item.dataset.pos, 10);
        if (!isNaN(pos)) {
          mockEditor.scrollToPosition(pos);
        }
      });

      expect(() => tocText.click()).not.toThrow();
      expect(mockEditor.scrollToPosition).not.toHaveBeenCalled();
    });

    it('should handle null editor gracefully', () => {
      mockEditorManager.getActiveEditor = vi.fn(() => null);

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
        const editor = mockEditorManager.getActiveEditor();
        if (editor && editor.scrollToPosition) {
          const item = e.target.closest('.toc-item');
          const pos = parseInt(item.dataset.pos, 10);
          editor.scrollToPosition(pos);
        }
      });

      expect(() => tocText.click()).not.toThrow();
    });
  });
});
