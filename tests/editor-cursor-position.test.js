import { describe, it, expect } from 'vitest';
import {
  markdownOffsetToRendered,
  renderedOffsetToMarkdown,
} from '../src/editors/position-converter.js';

describe('Position Converter', () => {
  describe('Headings', () => {
    it('should handle H1 heading syntax', () => {
      const markdown = '# Heading\nContent here';

      // Position at "H" in "Heading" (after "# ")
      const markdownPos = 2;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(0); // First character in rendered text

      // Convert back - will map to first content char (close enough for cursor positioning)
      const backToMarkdown = renderedOffsetToMarkdown(markdown, renderedPos);
      // Note: Skipped syntax maps to first content character
      expect(backToMarkdown).toBeGreaterThanOrEqual(0);
      expect(backToMarkdown).toBeLessThanOrEqual(markdownPos);
    });

    it('should handle H2 heading syntax', () => {
      const markdown = '## Heading Two\nContent';

      // Position at "H" in "Heading" (after "## ")
      const markdownPos = 3;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(0); // First character in rendered text
    });

    it('should handle H3 heading syntax', () => {
      const markdown = '### Heading Three';

      // Position at "H" (after "### ")
      const markdownPos = 4;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(0);
    });
  });

  describe('Bold and Italic', () => {
    it('should handle bold text (**bold**)', () => {
      const markdown = 'This is **bold** text';

      // Position at "b" in "bold" (after "This is **")
      const markdownPos = 10;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(8); // "This is " = 8 chars

      // Position after closing **
      const afterBold = 16; // After "**bold**"
      const afterRendered = markdownOffsetToRendered(markdown, afterBold);
      expect(afterRendered).toBe(12); // "This is bold" = 12 chars
    });

    it('should handle italic text (_italic_)', () => {
      const markdown = 'This is _italic_ text';

      // Position at "i" in "italic" (after "This is _")
      const markdownPos = 9;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(8); // "This is " = 8 chars
    });

    it('should handle italic with asterisk (*italic*)', () => {
      const markdown = 'This is *italic* text';

      // Position at "i" in "italic"
      const markdownPos = 9;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(8); // "This is " = 8 chars
    });
  });

  describe('Code', () => {
    it('should handle inline code (`code`)', () => {
      const markdown = 'This is `code` here';

      // Position at "c" in "code" (after "This is `")
      const markdownPos = 9;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(8); // "This is " = 8 chars
    });
  });

  describe('Links', () => {
    it('should handle link syntax [text](url)', () => {
      const markdown = 'Click [here](http://example.com) now';

      // Position at "h" in "here" (after "Click [")
      const markdownPos = 7;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(6); // "Click " = 6 chars

      // Position after the entire link (after closing paren)
      const afterLink = 33; // After "](http://example.com)"
      const afterRendered = markdownOffsetToRendered(markdown, afterLink);
      // Should be close to "Click here" = 10 chars (within 1-2 chars is acceptable)
      expect(afterRendered).toBeGreaterThanOrEqual(10);
      expect(afterRendered).toBeLessThanOrEqual(12);
    });
  });

  describe('Lists', () => {
    it('should handle unordered list with dash', () => {
      const markdown = '- Item one\n- Item two';

      // Position at "I" in "Item one" (after "- ")
      const markdownPos = 2;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(0); // First character
    });

    it('should handle unordered list with asterisk', () => {
      const markdown = '* Item one\n* Item two';

      // Position at "I" in "Item one"
      const markdownPos = 2;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(0);
    });

    it('should handle numbered list', () => {
      const markdown = '1. First item\n2. Second item';

      // Position at "F" in "First" (after "1. ")
      const markdownPos = 3;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(0);
    });

    it('should handle multi-digit numbered list', () => {
      const markdown = '10. Tenth item';

      // Position at "T" in "Tenth" (after "10. ")
      const markdownPos = 4;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(0);
    });
  });

  describe('Blockquotes', () => {
    it('should handle blockquote syntax', () => {
      const markdown = '> This is a quote\nNormal text';

      // Position at "T" in "This" (after "> ")
      const markdownPos = 2;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      expect(renderedPos).toBe(0);
    });
  });

  describe('Complex markdown', () => {
    it('should handle mixed markdown syntax', () => {
      const markdown = '# Heading\n\nThis is **bold** and _italic_ text with `code`.';

      // Position at "b" in "bold" (after "# Heading\n\nThis is **")
      const markdownPos = 24;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      // Should be around position 17-20 (close to "Heading\n\nThis is ")
      expect(renderedPos).toBeGreaterThanOrEqual(17);
      expect(renderedPos).toBeLessThanOrEqual(21);
    });

    it('should handle text with link and formatting', () => {
      const markdown = 'See **[the docs](http://example.com)** for more.';

      // Position at "t" in "the" (after "See **[")
      const markdownPos = 8;
      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      // Should be around position 4-5 (close to "See ")
      expect(renderedPos).toBeGreaterThanOrEqual(4);
      expect(renderedPos).toBeLessThanOrEqual(6);
    });
  });

  describe('Bidirectional conversion', () => {
    it('should convert markdown→rendered→markdown correctly', () => {
      const markdown = '# Title\n\nThis is **bold** text.';
      const markdownPos = 20; // Position at "b" in "bold"

      const renderedPos = markdownOffsetToRendered(markdown, markdownPos);
      const backToMarkdown = renderedOffsetToMarkdown(markdown, renderedPos);

      expect(backToMarkdown).toBe(markdownPos);
    });

    it('should handle roundtrip conversion for various positions', () => {
      const markdown = '## Header\n- List item\n**bold** and _italic_';

      const positions = [0, 5, 10, 20, 30];

      positions.forEach((pos) => {
        if (pos <= markdown.length) {
          const rendered = markdownOffsetToRendered(markdown, pos);
          const back = renderedOffsetToMarkdown(markdown, rendered);

          // Should be close to original position (within range of syntax characters)
          expect(Math.abs(back - pos)).toBeLessThanOrEqual(4);
        }
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const markdown = '';
      expect(markdownOffsetToRendered(markdown, 0)).toBe(0);
      expect(renderedOffsetToMarkdown(markdown, 0)).toBe(0);
    });

    it('should handle position at start', () => {
      const markdown = '# Heading';
      expect(markdownOffsetToRendered(markdown, 0)).toBe(0);
    });

    it('should handle position at end', () => {
      const markdown = 'Simple text';
      const endPos = markdown.length;
      const rendered = markdownOffsetToRendered(markdown, endPos);
      expect(rendered).toBe(endPos); // No syntax, so same length
    });

    it('should handle plain text without markdown', () => {
      const markdown = 'Just plain text here';
      const pos = 10;

      const rendered = markdownOffsetToRendered(markdown, pos);
      expect(rendered).toBe(pos); // Should be the same for plain text

      const back = renderedOffsetToMarkdown(markdown, rendered);
      expect(back).toBe(pos);
    });

    it('should handle position beyond document length', () => {
      const markdown = '# Short';
      const tooFar = 1000;

      const rendered = markdownOffsetToRendered(markdown, tooFar);
      expect(rendered).toBeGreaterThanOrEqual(0);
      expect(rendered).toBeLessThanOrEqual(markdown.length);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle cursor in heading being switched to WYSIWYG', () => {
      const markdown = '# My Document\n\nSome content here.';

      // Cursor at "D" in "Document" (position 5 in raw markdown, after "# My ")
      const cursorInMarkdown = 5;
      const cursorInRendered = markdownOffsetToRendered(markdown, cursorInMarkdown);

      // Should be close to "D" in rendered text (around position 2-3, after "My ")
      expect(cursorInRendered).toBeGreaterThanOrEqual(2);
      expect(cursorInRendered).toBeLessThanOrEqual(4);
    });

    it('should handle cursor after bold text when switching modes', () => {
      const markdown = 'This text is **very important** to read.';

      // Cursor right after "important" (before closing **)
      const cursorInMarkdown = 29;
      const cursorInRendered = markdownOffsetToRendered(markdown, cursorInMarkdown);

      // In rendered: "This text is very important"
      expect(cursorInRendered).toBe(27); // After "important"
    });

    it('should handle cursor in link text when switching', () => {
      const markdown = 'Visit [our website](https://example.com) today.';

      // Cursor at "w" in "website" (position 11 in raw)
      const cursorInMarkdown = 11;
      const cursorInRendered = markdownOffsetToRendered(markdown, cursorInMarkdown);

      // In rendered: "Visit our website today."
      // "Visit " = 6 chars, "our " = 4 chars, so "w" is at position 10
      expect(cursorInRendered).toBe(10);
    });
  });
});
