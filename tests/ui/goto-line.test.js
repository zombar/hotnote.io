import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { goToLine } from '../../src/ui/file-picker.js';
import { appState } from '../../src/state/app-state.js';

describe('Go-to-Line Feature', () => {
  beforeEach(() => {
    // Reset app state
    appState.editorView = null;
    appState.editorManager = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('goToLine() function', () => {
    describe('CodeMirror editor (non-markdown files)', () => {
      let mockDoc;
      let mockDispatch;
      let mockFocus;

      beforeEach(() => {
        // Create mock document with 100 lines
        mockDoc = {
          lines: 100,
          line: (lineNumber) => {
            if (lineNumber < 1 || lineNumber > 100) {
              throw new Error('Line out of range');
            }
            // Each line has 50 characters
            const from = (lineNumber - 1) * 50;
            return {
              from,
              to: from + 50,
              length: 50,
            };
          },
        };

        mockDispatch = vi.fn();
        mockFocus = vi.fn();

        appState.editorView = {
          state: {
            doc: mockDoc,
          },
          dispatch: mockDispatch,
          focus: mockFocus,
        };
      });

      it('should navigate to valid line number', () => {
        const result = goToLine(42);

        expect(result).toBe(true);
        expect(mockDispatch).toHaveBeenCalledWith({
          selection: { anchor: 2050, head: 2050 }, // Line 42 starts at position 41 * 50 = 2050
          scrollIntoView: true,
        });
        expect(mockFocus).toHaveBeenCalled();
      });

      it('should navigate to first line', () => {
        const result = goToLine(1);

        expect(result).toBe(true);
        expect(mockDispatch).toHaveBeenCalledWith({
          selection: { anchor: 0, head: 0 },
          scrollIntoView: true,
        });
      });

      it('should navigate to last line', () => {
        const result = goToLine(100);

        expect(result).toBe(true);
        expect(mockDispatch).toHaveBeenCalledWith({
          selection: { anchor: 4950, head: 4950 }, // Line 100 starts at 99 * 50 = 4950
          scrollIntoView: true,
        });
      });

      it('should clamp line number beyond document length', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = goToLine(200);

        expect(result).toBe(true);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Line 200 beyond document (100 lines), jumping to line 100')
        );
        // Should jump to line 100 instead
        expect(mockDispatch).toHaveBeenCalledWith({
          selection: { anchor: 4950, head: 4950 },
          scrollIntoView: true,
        });

        consoleWarnSpy.mockRestore();
      });

      it('should reject zero or negative line numbers', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = goToLine(0);

        expect(result).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid line number: 0')
        );
        expect(mockDispatch).not.toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
      });

      it('should reject negative line numbers', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = goToLine(-5);

        expect(result).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid line number: -5')
        );

        consoleWarnSpy.mockRestore();
      });
    });

    describe('Markdown source mode (EditorManager)', () => {
      let mockSetCursor;
      let mockFocus;
      let mockSourceView;

      beforeEach(() => {
        mockSetCursor = vi.fn();
        mockFocus = vi.fn();
        mockSourceView = {
          getLineCount: vi.fn(() => 50),
        };

        appState.editorManager = {
          getMode: vi.fn(() => 'source'),
          getActiveEditor: vi.fn(() => mockSourceView),
          setCursor: mockSetCursor,
          focus: mockFocus,
        };
      });

      it('should navigate to valid line in markdown source mode', async () => {
        const result = goToLine(25);

        expect(result).toBe(true);
        expect(mockSetCursor).toHaveBeenCalledWith(24, 0); // 0-based: line 25 → 24

        // Focus is called in a setTimeout, so wait for it
        await new Promise((resolve) => setTimeout(resolve, 60));
        expect(mockFocus).toHaveBeenCalled();
      });

      it('should clamp line number beyond document in markdown mode', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = goToLine(100);

        expect(result).toBe(true);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Line 100 beyond document (50 lines), jumping to line 50')
        );
        expect(mockSetCursor).toHaveBeenCalledWith(49, 0); // Clamped to line 50 (0-based: 49)

        consoleWarnSpy.mockRestore();
      });

      it('should handle markdown WYSIWYG mode gracefully', () => {
        appState.editorManager.getMode = vi.fn(() => 'wysiwyg');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = goToLine(10);

        expect(result).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Go-to-line only works in code/source mode')
        );
        expect(mockSetCursor).not.toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
      });
    });

    describe('No editor active', () => {
      it('should return false when no editor is available', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = goToLine(10);

        expect(result).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Go-to-line only works in code/source mode')
        );

        consoleWarnSpy.mockRestore();
      });
    });

    describe('Error handling', () => {
      it('should handle errors gracefully', () => {
        const mockDispatch = vi.fn(() => {
          throw new Error('Test error');
        });
        appState.editorView = {
          state: {
            doc: {
              lines: 10,
              line: () => {
                throw new Error('Line error');
              },
            },
          },
          dispatch: mockDispatch,
          focus: vi.fn(),
        };

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = goToLine(5);

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error navigating to line'),
          expect.any(Error)
        );

        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe('Pattern matching in breadcrumb input', () => {
    it('should match :42 pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = ':42';
      const match = input.match(pattern);

      expect(match).not.toBeNull();
      expect(match[1]).toBe('42');
    });

    it('should match :1 pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = ':1';
      const match = input.match(pattern);

      expect(match).not.toBeNull();
      expect(match[1]).toBe('1');
    });

    it('should match :9999 pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = ':9999';
      const match = input.match(pattern);

      expect(match).not.toBeNull();
      expect(match[1]).toBe('9999');
    });

    it('should NOT match :abc pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = ':abc';
      const match = input.match(pattern);

      expect(match).toBeNull();
    });

    it('should NOT match plain : pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = ':';
      const match = input.match(pattern);

      expect(match).toBeNull();
    });

    it('should NOT match :- pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = ':-5';
      const match = input.match(pattern);

      expect(match).toBeNull();
    });

    it('should NOT match filename pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = 'myfile.js';
      const match = input.match(pattern);

      expect(match).toBeNull();
    });

    it('should NOT match search pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = '/search';
      const match = input.match(pattern);

      expect(match).toBeNull();
    });

    it('should NOT match : with spaces', () => {
      const pattern = /^:(\d+)$/;
      const input = ': 42';
      const match = input.match(pattern);

      expect(match).toBeNull();
    });

    it('should NOT match :42text pattern', () => {
      const pattern = /^:(\d+)$/;
      const input = ':42text';
      const match = input.match(pattern);

      expect(match).toBeNull();
    });
  });
});
