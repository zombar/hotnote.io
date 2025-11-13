import { describe, it, expect } from 'vitest';
import {
  isCollapsedSelection,
  findNearestWord,
  shouldDeleteComment,
  validateCommentPosition,
} from '../src/utils/comment-validator.js';

describe('Comment Position Validation', () => {
  describe('isCollapsedSelection', () => {
    it('should detect when selection bounds are equal', () => {
      const position = { from: 10, to: 10 };
      expect(isCollapsedSelection(position)).toBe(true);
    });

    it('should detect when selection bounds differ by zero', () => {
      const position = { from: 25, to: 25 };
      expect(isCollapsedSelection(position)).toBe(true);
    });

    it('should return false when selection has non-zero range', () => {
      const position = { from: 10, to: 20 };
      expect(isCollapsedSelection(position)).toBe(false);
    });

    it('should handle null position', () => {
      expect(isCollapsedSelection(null)).toBe(true);
    });

    it('should handle undefined position', () => {
      expect(isCollapsedSelection(undefined)).toBe(true);
    });
  });

  describe('findNearestWord', () => {
    it('should find nearest word in any direction', () => {
      const doc = 'Hello world this is text';
      const position = 5; // After "Hello", before "world"
      const result = findNearestWord(doc, position);

      expect(result).not.toBeNull();
      expect(result.to).toBeGreaterThan(result.from);
      expect(doc.substring(result.from, result.to)).toMatch(/^[a-zA-Z0-9]+$/);
      // Should find either "Hello" or "world" since both are very close
      expect(['Hello', 'world']).toContain(doc.substring(result.from, result.to));
    });

    it('should find word to the left of position', () => {
      const doc = 'Hello    '; // Spaces after word
      const position = 8; // In the spaces
      const result = findNearestWord(doc, position);

      expect(result).not.toBeNull();
      expect(result.from).toBe(0);
      expect(result.to).toBe(5);
      expect(doc.substring(result.from, result.to)).toBe('Hello');
    });

    it('should prefer closer word when equidistant', () => {
      const doc = 'one  two';
      const position = 4; // Between words, closer to "one"
      const result = findNearestWord(doc, position);

      expect(result).not.toBeNull();
      // Should find "two" since it's just to the right
      expect(doc.substring(result.from, result.to)).toMatch(/^(one|two)$/);
    });

    it('should return null when no words exist nearby', () => {
      const doc = '     '; // Only spaces
      const position = 2;
      const result = findNearestWord(doc, position);

      expect(result).toBeNull();
    });

    it('should return null when document is empty', () => {
      const doc = '';
      const position = 0;
      const result = findNearestWord(doc, position);

      expect(result).toBeNull();
    });

    it('should handle position at document start', () => {
      const doc = 'Hello world';
      const position = 0;
      const result = findNearestWord(doc, position);

      expect(result).not.toBeNull();
      expect(result.from).toBe(0);
      expect(result.to).toBe(5);
    });

    it('should handle position at document end', () => {
      const doc = 'Hello world';
      const position = doc.length;
      const result = findNearestWord(doc, position);

      expect(result).not.toBeNull();
      expect(doc.substring(result.from, result.to)).toBe('world');
    });

    it('should find word within markdown heading', () => {
      const doc = '# Heading Text\n\nContent';
      const position = 2; // In "Heading"
      const result = findNearestWord(doc, position);

      expect(result).not.toBeNull();
      expect(doc.substring(result.from, result.to)).toMatch(/^(Heading|Text)$/);
    });

    it('should find word in markdown bold text', () => {
      const doc = 'This is **bold** text';
      const position = 12; // Near "bold"
      const result = findNearestWord(doc, position);

      expect(result).not.toBeNull();
      // Should find a word (could be "bold" or nearby)
      expect(doc.substring(result.from, result.to)).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should respect maximum search distance', () => {
      const doc = 'word' + ' '.repeat(200) + 'faraway';
      const position = 4; // Right after "word"
      const result = findNearestWord(doc, position, 50); // 50 char max distance

      // Should find "word" to the left, not "faraway" which is too far
      expect(result).not.toBeNull();
      expect(doc.substring(result.from, result.to)).toBe('word');
    });
  });

  describe('shouldDeleteComment', () => {
    it('should return true when no words exist nearby', () => {
      const doc = '     '; // Only spaces
      const position = 2;
      const result = shouldDeleteComment(doc, position);

      expect(result).toBe(true);
    });

    it('should return false when word exists nearby', () => {
      const doc = 'Hello world';
      const position = 5;
      const result = shouldDeleteComment(doc, position);

      expect(result).toBe(false);
    });

    it('should return true for empty document', () => {
      const doc = '';
      const position = 0;
      const result = shouldDeleteComment(doc, position);

      expect(result).toBe(true);
    });

    it('should return true when only special characters remain', () => {
      const doc = '# ** __ ``';
      const position = 5;
      const result = shouldDeleteComment(doc, position);

      expect(result).toBe(true);
    });
  });

  describe('validateCommentPosition', () => {
    it('should return original position when anchor is found and valid', () => {
      const doc = 'Hello world this is text';
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: 'Hello ',
          exact: 'world',
          suffix: ' this',
        },
        fallbackPosition: { from: 6, to: 11 },
      };

      const result = validateCommentPosition(doc, comment);

      expect(result.action).toBe('keep');
      expect(result.position).toEqual({ from: 6, to: 11 });
    });

    it('should snap to nearest word when selection collapses', () => {
      const doc = 'Hello this is text'; // "world" deleted
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: 'Hello ',
          exact: 'world',
          suffix: ' this',
        },
        fallbackPosition: { from: 6, to: 11 },
      };

      const result = validateCommentPosition(doc, comment);

      expect(result.action).toBe('snap');
      expect(result.position).not.toBeNull();
      expect(result.position.from).not.toBe(result.position.to);
      // Should snap to nearby word
      const snappedText = doc.substring(result.position.from, result.position.to);
      expect(snappedText).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should delete comment when no words remain nearby', () => {
      const doc = '     '; // Only spaces, all content deleted
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: 'Hello ',
          exact: 'world',
          suffix: ' text',
        },
        fallbackPosition: { from: 6, to: 11 },
      };

      const result = validateCommentPosition(doc, comment);

      expect(result.action).toBe('delete');
      expect(result.position).toBeNull();
    });

    it('should keep comment when anchor moves but remains valid', () => {
      const doc = 'Hello wonderful world this is text';
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: 'Hello ',
          exact: 'world',
          suffix: ' this',
        },
        fallbackPosition: { from: 6, to: 11 },
      };

      const result = validateCommentPosition(doc, comment);

      // Anchor should be found at new position
      expect(result.action).toBe('keep');
      expect(result.position).not.toBeNull();
      expect(doc.substring(result.position.from, result.position.to)).toBe('world');
    });

    it('should handle comment in heading that gets deleted', () => {
      const doc = 'Content here'; // Heading removed
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: '# ',
          exact: 'Heading',
          suffix: '\n\n',
        },
        fallbackPosition: { from: 2, to: 9 },
      };

      const result = validateCommentPosition(doc, comment);

      // Should either snap to nearby word or delete
      expect(['snap', 'delete']).toContain(result.action);
    });

    it('should handle comment where entire paragraph is deleted', () => {
      const doc = 'First paragraph.\n\nThird paragraph.';
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: '\n\n',
          exact: 'Second paragraph text',
          suffix: '\n\n',
        },
        fallbackPosition: { from: 18, to: 39 },
      };

      const result = validateCommentPosition(doc, comment);

      expect(result.action).toBe('snap');
      // Should snap to nearby paragraph
      expect(result.position).not.toBeNull();
    });

    it('should handle multiple consecutive space characters after deletion', () => {
      const doc = 'Hello  text'; // Extra space where "world" was
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: 'Hello ',
          exact: 'world',
          suffix: ' text',
        },
        fallbackPosition: { from: 6, to: 11 },
      };

      const result = validateCommentPosition(doc, comment);

      expect(result.action).toBe('snap');
      expect(result.position).not.toBeNull();
      // Should snap to nearby word, not spaces
      const snappedText = doc.substring(result.position.from, result.position.to);
      expect(snappedText).toMatch(/^[a-zA-Z0-9]+$/);
    });
  });

  describe('Edge cases', () => {
    it('should handle comment at document boundary', () => {
      const doc = 'Hello';
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: '',
          exact: 'Hello',
          suffix: '',
        },
        fallbackPosition: { from: 0, to: 5 },
      };

      const result = validateCommentPosition(doc, comment);

      expect(result.action).toBe('keep');
      expect(result.position).toEqual({ from: 0, to: 5 });
    });

    it('should handle very long documents efficiently', () => {
      const doc = 'Start ' + 'x '.repeat(10000) + 'End';
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: '',
          exact: 'Start',
          suffix: ' x',
        },
        fallbackPosition: { from: 0, to: 5 },
      };

      const startTime = Date.now();
      const result = validateCommentPosition(doc, comment);
      const duration = Date.now() - startTime;

      expect(result.action).toBe('keep');
      expect(duration).toBeLessThan(100); // Should complete quickly
    });

    it('should handle Unicode characters in text', () => {
      const doc = 'Hello 世界 world';
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: 'Hello ',
          exact: '世界',
          suffix: ' world',
        },
        fallbackPosition: { from: 6, to: 8 },
      };

      const result = validateCommentPosition(doc, comment);

      expect(result.action).toBe('keep');
    });

    it('should handle special regex characters in anchor text', () => {
      const doc = 'Code: (function() { return true; })';
      const comment = {
        id: 'comment-1',
        anchor: {
          prefix: 'Code: ',
          exact: '(function() {',
          suffix: ' return',
        },
        fallbackPosition: { from: 6, to: 19 },
      };

      const result = validateCommentPosition(doc, comment);

      expect(result.action).toBe('keep');
    });
  });
});
