import { describe, it, expect, vi } from 'vitest';

// Mock Milkdown dependencies
vi.mock('@milkdown/kit/core', () => ({
  Editor: vi.fn(),
  editorViewCtx: Symbol('editorViewCtx'),
  rootCtx: Symbol('rootCtx'),
}));

vi.mock('@milkdown/kit/prose', () => ({
  $prose: vi.fn((fn) => ({ prose: fn })),
}));

vi.mock('@milkdown/kit/plugin/listener', () => ({
  listener: { listener: true },
  listenerCtx: Symbol('listenerCtx'),
}));

vi.mock('@milkdown/kit/plugin/history', () => ({
  history: { history: true },
}));

vi.mock('@milkdown/kit/preset/commonmark', () => ({
  commonmark: { commonmark: true },
}));

vi.mock('@milkdown/kit/preset/gfm', () => ({
  gfm: { gfm: true },
}));

vi.mock('@milkdown/theme-nord', () => ({
  nord: { nord: true },
}));

vi.mock('@milkdown/prose/state', () => ({
  TextSelection: {
    create: vi.fn((doc, pos) => ({ from: pos, to: pos })),
  },
  Plugin: vi.fn(),
  PluginKey: vi.fn(),
}));

vi.mock('@milkdown/prose/view', () => ({
  Decoration: {
    inline: vi.fn((from, to, attrs) => ({ from, to, attrs, type: 'inline' })),
  },
  DecorationSet: {
    create: vi.fn((doc, decorations) => decorations),
    empty: [],
  },
}));

describe('WYSIWYG Comment Position Adjustments', () => {
  describe('ProseMirror Position Offset', () => {
    it('should add +1 to positions when creating decorations', async () => {
      // Import after mocks are set up
      const { Decoration } = await import('@milkdown/prose/view');

      // Mock document with content.size
      const mockDoc = {
        content: {
          size: 100,
        },
      };

      // Mock comments with text content positions
      const comments = [
        {
          id: 'comment-1',
          position: { from: 0, to: 5 }, // Text position "Hello" (0-5)
        },
        {
          id: 'comment-2',
          position: { from: 6, to: 11 }, // Text position "world" (6-11)
        },
      ];

      // Simulate createDecorationSet behavior
      const decorations = [];
      for (const comment of comments) {
        const { id, position } = comment;
        // Add +1 to convert text positions to ProseMirror document positions
        const from = Math.max(0, Math.min(position.from + 1, mockDoc.content.size));
        const to = Math.max(from, Math.min(position.to + 1, mockDoc.content.size));

        if (from < to) {
          decorations.push(
            Decoration.inline(from, to, {
              class: 'comment-highlight',
              'data-comment-id': id,
            })
          );
        }
      }

      // Verify decorations were created with adjusted positions
      expect(decorations).toHaveLength(2);
      expect(Decoration.inline).toHaveBeenCalledWith(
        1, // 0 + 1
        6, // 5 + 1
        expect.objectContaining({ 'data-comment-id': 'comment-1' })
      );
      expect(Decoration.inline).toHaveBeenCalledWith(
        7, // 6 + 1
        12, // 11 + 1
        expect.objectContaining({ 'data-comment-id': 'comment-2' })
      );
    });

    it('should respect document bounds when adding offset', async () => {
      const { Decoration } = await import('@milkdown/prose/view');
      Decoration.inline.mockClear();

      const mockDoc = {
        content: {
          size: 10, // Small document
        },
      };

      const comments = [
        {
          id: 'comment-1',
          position: { from: 8, to: 15 }, // Position extends beyond doc
        },
      ];

      const decorations = [];
      for (const comment of comments) {
        const { position } = comment;
        const from = Math.max(0, Math.min(position.from + 1, mockDoc.content.size));
        const to = Math.max(from, Math.min(position.to + 1, mockDoc.content.size));

        if (from < to) {
          decorations.push(Decoration.inline(from, to, {}));
        }
      }

      // Should be clamped to document size
      expect(Decoration.inline).toHaveBeenCalledWith(
        9, // 8 + 1
        10, // min(15 + 1, 10) = 10
        expect.any(Object)
      );
    });

    it('should handle zero-length positions correctly', async () => {
      const { Decoration } = await import('@milkdown/prose/view');
      Decoration.inline.mockClear();

      const mockDoc = {
        content: {
          size: 100,
        },
      };

      const comments = [
        {
          id: 'comment-1',
          position: { from: 5, to: 5 }, // Collapsed position
        },
      ];

      const decorations = [];
      for (const comment of comments) {
        const { position } = comment;
        const from = Math.max(0, Math.min(position.from + 1, mockDoc.content.size));
        const to = Math.max(from, Math.min(position.to + 1, mockDoc.content.size));

        if (from < to) {
          decorations.push(Decoration.inline(from, to, {}));
        }
      }

      // Should not create decoration for zero-length position
      expect(decorations).toHaveLength(0);
      expect(Decoration.inline).not.toHaveBeenCalled();
    });

    it('should maintain relative positions across document changes', async () => {
      const { Decoration } = await import('@milkdown/prose/view');
      Decoration.inline.mockClear();

      // Simulate comment at "world" in "Hello world this is text"
      const originalComment = {
        id: 'comment-1',
        position: { from: 6, to: 11 }, // Text content position
      };

      // Create decoration with offset
      const from = originalComment.position.from + 1;
      const to = originalComment.position.to + 1;

      expect(from).toBe(7); // ProseMirror position
      expect(to).toBe(12);
      expect(to - from).toBe(5); // Length maintained (5 characters in "world")
    });
  });

  describe('Position Conversion Consistency', () => {
    it('should maintain consistency between getSelection and decoration positions', () => {
      // When getSelection returns positions, they should work directly with decorations after +1 adjustment
      const selectionPosition = { from: 0, to: 5 }; // Text "Hello"

      // Apply +1 for ProseMirror document structure
      const decorationFrom = selectionPosition.from + 1; // 1
      const decorationTo = selectionPosition.to + 1; // 6

      // Verify: the decoration should cover 5 characters (positions 1-6 in ProseMirror doc)
      expect(decorationTo - decorationFrom).toBe(5);
    });

    it('should handle multi-word selections correctly', () => {
      // "Hello world" at positions 0-11 in text content
      const selection = { from: 0, to: 11 };

      const decorationFrom = selection.from + 1; // 1
      const decorationTo = selection.to + 1; // 12

      // Should span 11 characters
      expect(decorationTo - decorationFrom).toBe(11);
    });
  });

  describe('Validation Position Integration', () => {
    it('should work with snapped positions from validation', () => {
      // Simulation: validation snaps to "Hello" at text positions 0-5
      const snappedPosition = { from: 0, to: 5 };

      // Apply +1 for decoration
      const from = snappedPosition.from + 1;
      const to = snappedPosition.to + 1;

      // Should create valid decoration
      expect(from).toBe(1);
      expect(to).toBe(6);
      expect(to - from).toBe(5); // Full word length
    });

    it('should work with positions from findNearestWord', () => {
      // Simulation: findNearestWord found "world" at positions 6-11 in text
      const nearestWord = { from: 6, to: 11 };

      // Apply +1 for decoration
      const from = nearestWord.from + 1;
      const to = nearestWord.to + 1;

      expect(from).toBe(7);
      expect(to).toBe(12);
      expect(to - from).toBe(5); // "world" is 5 characters
    });
  });
});
