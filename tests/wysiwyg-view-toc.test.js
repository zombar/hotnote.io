import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WYSIWYGView } from '../src/editors/wysiwyg-view.js';

// Mock Milkdown and its dependencies
vi.mock('@milkdown/core', () => ({
  Editor: {
    make: vi.fn(() => ({
      config: vi.fn(function () {
        return this;
      }),
      use: vi.fn(function () {
        return this;
      }),
      create: vi.fn(() => Promise.resolve(mockEditor)),
    })),
  },
  rootCtx: Symbol('rootCtx'),
  defaultValueCtx: Symbol('defaultValueCtx'),
  editorViewCtx: Symbol('editorViewCtx'),
}));

vi.mock('@milkdown/preset-commonmark', () => ({
  commonmark: {},
}));

vi.mock('@milkdown/theme-nord', () => ({
  nord: {},
}));

vi.mock('@milkdown/plugin-listener', () => ({
  listener: {},
  listenerCtx: {
    markdownUpdated: vi.fn(() => vi.fn()),
  },
}));

vi.mock('@milkdown/plugin-history', () => ({
  history: {},
}));

vi.mock('@milkdown/preset-gfm', () => ({
  gfm: {},
}));

vi.mock('@milkdown/prose/state', () => ({
  TextSelection: {
    create: vi.fn((doc, pos) => ({ from: pos, to: pos })),
  },
}));

let mockEditor;
let mockView;
let mockDispatch;
let mockFocus;

describe('WYSIWYGView TOC Features', () => {
  let container;
  let view;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Reset mocks
    mockDispatch = vi.fn();
    mockFocus = vi.fn();

    mockView = {
      state: {
        doc: {
          descendants: vi.fn(),
          content: { size: 1000 },
          textContent: 'Test document',
        },
        selection: { from: 0, to: 0 },
        tr: {
          setSelection: vi.fn(function () {
            return this;
          }),
          scrollIntoView: vi.fn(function () {
            return this;
          }),
        },
      },
      dispatch: mockDispatch,
      dom: {
        focus: mockFocus,
      },
    };

    mockEditor = {
      action: vi.fn((callback) => {
        callback({
          get: (ctx) => {
            if (ctx.toString() === 'Symbol(editorViewCtx)') {
              return mockView;
            }
            return {};
          },
        });
      }),
      destroy: vi.fn(),
    };
  });

  describe('getHeadings', () => {
    it('should extract headings from document', async () => {
      view = new WYSIWYGView(container, '# Heading 1\n## Heading 2');
      await view.ready();

      // Mock the descendants method to simulate headings
      mockView.state.doc.descendants = vi.fn((callback) => {
        callback({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'Heading 1' }, 0);
        callback({ type: { name: 'heading' }, attrs: { level: 2 }, textContent: 'Heading 2' }, 10);
      });

      const headings = view.getHeadings();

      expect(headings).toHaveLength(2);
      expect(headings[0].level).toBe(1);
      expect(headings[0].text).toBe('Heading 1');
      expect(headings[1].level).toBe(2);
      expect(headings[1].text).toBe('Heading 2');
    });

    it('should generate unique IDs for headings', async () => {
      view = new WYSIWYGView(container, '# Test');
      await view.ready();

      mockView.state.doc.descendants = vi.fn((callback) => {
        callback({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'Test' }, 0);
      });

      const headings = view.getHeadings();

      expect(headings[0].id).toMatch(/^heading-test-\d+$/);
    });

    it('should handle special characters in heading text', async () => {
      view = new WYSIWYGView(container, '# Test & Special!');
      await view.ready();

      mockView.state.doc.descendants = vi.fn((callback) => {
        callback(
          { type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'Test & Special!' },
          0
        );
      });

      const headings = view.getHeadings();

      expect(headings[0].text).toBe('Test & Special!');
      // Special chars are removed, spaces become hyphens: "Test & Special!" -> "test-special"
      expect(headings[0].id).toMatch(/^heading-test-special-\d+$/);
    });

    it('should return empty array when no headings exist', async () => {
      view = new WYSIWYGView(container, 'No headings here');
      await view.ready();

      mockView.state.doc.descendants = vi.fn((callback) => {
        callback({ type: { name: 'paragraph' }, textContent: 'No headings here' }, 0);
      });

      const headings = view.getHeadings();

      expect(headings).toEqual([]);
    });
  });

  describe('scrollToPosition', () => {
    beforeEach(async () => {
      view = new WYSIWYGView(container, '# Test');
      await view.ready();
    });

    it('should create selection at target position', () => {
      const targetPos = 42;

      view.scrollToPosition(targetPos);

      expect(mockView.state.tr.setSelection).toHaveBeenCalled();
    });

    it('should dispatch transaction with selection', () => {
      view.scrollToPosition(50);

      // Verify transaction was dispatched
      expect(mockDispatch).toHaveBeenCalled();
      // Note: scrollIntoView is now handled separately via DOM API, not in transaction
    });

    it('should NOT directly manage focus (delegated to caller/FocusManager)', (done) => {
      view.scrollToPosition(100);

      // scrollToPosition should NOT call focus directly anymore
      // Focus management is now handled by the caller via FocusManager
      setTimeout(() => {
        expect(mockFocus).not.toHaveBeenCalled();
        done();
      }, 150);
    });

    it('should clamp position to document bounds', () => {
      const docSize = mockView.state.doc.content.size;

      // Test position beyond document size
      view.scrollToPosition(docSize + 100);

      // Should be called, but position should be clamped internally
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('should handle negative positions', () => {
      view.scrollToPosition(-10);

      // Should clamp to 0 internally
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('should handle errors gracefully', () => {
      mockEditor.action = vi.fn(() => {
        throw new Error('Test error');
      });

      // Should not throw
      expect(() => view.scrollToPosition(50)).not.toThrow();
    });

    it('should do nothing if editor is not initialized', () => {
      view.editor = null;

      view.scrollToPosition(50);

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  describe('Heading extraction edge cases', () => {
    it('should handle multiple headings at same level', async () => {
      view = new WYSIWYGView(container, '# A\n# B\n# C');
      await view.ready();

      mockView.state.doc.descendants = vi.fn((callback) => {
        callback({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'A' }, 0);
        callback({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'B' }, 10);
        callback({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'C' }, 20);
      });

      const headings = view.getHeadings();

      expect(headings).toHaveLength(3);
      expect(headings.map((h) => h.text)).toEqual(['A', 'B', 'C']);
    });

    it('should handle deeply nested headings', async () => {
      view = new WYSIWYGView(container, '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6');
      await view.ready();

      mockView.state.doc.descendants = vi.fn((callback) => {
        for (let i = 1; i <= 6; i++) {
          callback(
            { type: { name: 'heading' }, attrs: { level: i }, textContent: `H${i}` },
            i * 10
          );
        }
      });

      const headings = view.getHeadings();

      expect(headings).toHaveLength(6);
      expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle headings with emoji', async () => {
      view = new WYSIWYGView(container, '# 🚀 Launch');
      await view.ready();

      mockView.state.doc.descendants = vi.fn((callback) => {
        callback({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: '🚀 Launch' }, 0);
      });

      const headings = view.getHeadings();

      expect(headings[0].text).toBe('🚀 Launch');
    });
  });
});
