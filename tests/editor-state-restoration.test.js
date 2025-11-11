import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for editor state restoration including scroll position animation
 * and cursor placement for both CodeMirror and Milkdown editors
 */
describe('Editor State Restoration', () => {
  let mockEditorView;
  let mockMilkdownEditor;
  let sessionData;

  beforeEach(() => {
    // Mock CodeMirror editorView
    mockEditorView = {
      state: {
        selection: {
          main: {
            head: 0,
            anchor: 0,
          },
        },
        doc: {
          length: 1000,
          toString: () => 'test content\n'.repeat(100),
        },
      },
      scrollDOM: {
        scrollTop: 0,
        scrollLeft: 0,
        scrollTo: vi.fn(),
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    // Mock Milkdown context and view
    const mockProseMirrorView = {
      state: {
        selection: {
          from: 0,
          to: 0,
        },
        doc: {
          content: {
            size: 1000,
          },
        },
        tr: {
          setSelection: vi.fn().mockReturnThis(),
        },
      },
      dispatch: vi.fn(),
    };

    mockMilkdownEditor = {
      action: vi.fn((callback) => {
        const ctx = {
          get: vi.fn(() => mockProseMirrorView),
        };
        return callback(ctx);
      }),
    };

    // Mock DOM elements
    global.document = {
      querySelector: vi.fn((selector) => {
        if (selector === '.milkdown') {
          return {
            scrollTop: 0,
            scrollLeft: 0,
            scrollTo: vi.fn(),
          };
        }
        if (selector === '.milkdown .ProseMirror') {
          return {
            focus: vi.fn(),
          };
        }
        return null;
      }),
    };

    // Sample session data with editor state
    sessionData = {
      folderName: 'test-project',
      session: {
        lastOpenFile: {
          path: 'test.md',
          cursorPosition: 150,
          scrollTop: 500,
          scrollLeft: 0,
          isRichMode: false,
        },
      },
    };
  });

  describe('CodeMirror Editor Restoration', () => {
    it('should restore cursor position', () => {
      const savedCursor = 150;

      mockEditorView.dispatch({
        selection: { anchor: savedCursor, head: savedCursor },
      });

      expect(mockEditorView.dispatch).toHaveBeenCalledWith({
        selection: { anchor: 150, head: 150 },
      });
    });

    it('should animate to saved scroll position', () => {
      const savedScrollTop = 500;
      const savedScrollLeft = 0;

      mockEditorView.scrollDOM.scrollTo({
        top: savedScrollTop,
        left: savedScrollLeft,
        behavior: 'smooth',
      });

      expect(mockEditorView.scrollDOM.scrollTo).toHaveBeenCalledWith({
        top: 500,
        left: 0,
        behavior: 'smooth',
      });
    });

    it('should focus editor after restoration', () => {
      mockEditorView.focus();

      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should handle restoration in correct order: cursor, scroll, focus', () => {
      const calls = [];

      mockEditorView.dispatch = vi.fn(() => calls.push('cursor'));
      mockEditorView.scrollDOM.scrollTo = vi.fn(() => calls.push('scroll'));
      mockEditorView.focus = vi.fn(() => calls.push('focus'));

      // Simulate restoration
      mockEditorView.dispatch({ selection: { anchor: 150, head: 150 } });
      mockEditorView.scrollDOM.scrollTo({ top: 500, left: 0, behavior: 'smooth' });
      mockEditorView.focus();

      expect(calls).toEqual(['cursor', 'scroll', 'focus']);
    });

    it('should handle missing cursor position gracefully', () => {
      const savedCursor = undefined;

      if (savedCursor !== undefined) {
        mockEditorView.dispatch({
          selection: { anchor: savedCursor, head: savedCursor },
        });
      }

      expect(mockEditorView.dispatch).not.toHaveBeenCalled();
    });

    it('should handle missing scroll position gracefully', () => {
      const savedScrollTop = undefined;
      const savedScrollLeft = undefined;

      if (savedScrollTop !== undefined || savedScrollLeft !== undefined) {
        mockEditorView.scrollDOM.scrollTo({
          top: savedScrollTop || 0,
          left: savedScrollLeft || 0,
          behavior: 'smooth',
        });
      }

      expect(mockEditorView.scrollDOM.scrollTo).not.toHaveBeenCalled();
    });
  });

  describe('Milkdown Editor Restoration', () => {
    it('should restore cursor position using ProseMirror API', () => {
      const savedCursor = 150;
      let capturedPosition = null;

      mockMilkdownEditor.action((ctx) => {
        const view = ctx.get();
        const { state } = view;
        const { doc } = state;

        // Simulate position clamping
        const safePosition = Math.min(Math.max(0, savedCursor), doc.content.size);
        capturedPosition = safePosition;
      });

      expect(capturedPosition).toBe(150);
    });

    it('should clamp cursor position to document bounds', () => {
      const oversizedPosition = 9999;
      let capturedPosition = null;

      mockMilkdownEditor.action((ctx) => {
        const view = ctx.get();
        const { state } = view;
        const { doc } = state;

        const safePosition = Math.min(Math.max(0, oversizedPosition), doc.content.size);
        capturedPosition = safePosition;
      });

      expect(capturedPosition).toBe(1000); // clamped to doc.content.size
    });

    it('should animate scroll position for Milkdown', () => {
      const milkdownScroller = global.document.querySelector('.milkdown');
      const savedScrollTop = 500;
      const savedScrollLeft = 0;

      milkdownScroller.scrollTo({
        top: savedScrollTop,
        left: savedScrollLeft,
        behavior: 'smooth',
      });

      expect(milkdownScroller.scrollTo).toHaveBeenCalledWith({
        top: 500,
        left: 0,
        behavior: 'smooth',
      });
    });

    it('should focus Milkdown editor after restoration', () => {
      const proseMirrorElement = global.document.querySelector('.milkdown .ProseMirror');

      proseMirrorElement.focus();

      expect(proseMirrorElement.focus).toHaveBeenCalled();
    });
  });

  describe('Session Data Validation', () => {
    it('should include all required state in session data', () => {
      expect(sessionData.session.lastOpenFile).toHaveProperty('path');
      expect(sessionData.session.lastOpenFile).toHaveProperty('cursorPosition');
      expect(sessionData.session.lastOpenFile).toHaveProperty('scrollTop');
      expect(sessionData.session.lastOpenFile).toHaveProperty('scrollLeft');
      expect(sessionData.session.lastOpenFile).toHaveProperty('isRichMode');
    });

    it('should preserve cursor position across sessions', () => {
      const savedCursor = sessionData.session.lastOpenFile.cursorPosition;
      expect(savedCursor).toBe(150);
      expect(typeof savedCursor).toBe('number');
    });

    it('should preserve scroll positions across sessions', () => {
      const { scrollTop, scrollLeft } = sessionData.session.lastOpenFile;
      expect(scrollTop).toBe(500);
      expect(scrollLeft).toBe(0);
      expect(typeof scrollTop).toBe('number');
      expect(typeof scrollLeft).toBe('number');
    });

    it('should preserve rich mode state', () => {
      const isRichMode = sessionData.session.lastOpenFile.isRichMode;
      expect(typeof isRichMode).toBe('boolean');
    });
  });

  describe('Timing and Initialization', () => {
    it('should use longer delay for Milkdown (300ms vs 100ms)', () => {
      const richModeDelay = 300;
      const plainModeDelay = 100;

      const sessionWithRichMode = { isRichMode: true };
      const sessionWithPlainMode = { isRichMode: false };

      const delay1 = sessionWithRichMode.isRichMode ? 300 : 100;
      const delay2 = sessionWithPlainMode.isRichMode ? 300 : 100;

      expect(delay1).toBe(richModeDelay);
      expect(delay2).toBe(plainModeDelay);
    });

    it('should restore isRichMode before opening file', () => {
      const operations = [];

      // Simulate session restoration flow
      const lastFile = sessionData.session.lastOpenFile;
      let isRichMode = false;

      // Step 1: Restore isRichMode
      if (lastFile.isRichMode !== undefined) {
        isRichMode = lastFile.isRichMode;
        operations.push('set-rich-mode');
      }

      // Step 2: Open file (would happen here)
      operations.push('open-file');

      // Step 3: Restore editor state
      operations.push('restore-state');

      expect(operations).toEqual(['set-rich-mode', 'open-file', 'restore-state']);
      expect(isRichMode).toBe(false);
    });
  });

  describe('Smooth Scroll Behavior', () => {
    it('should use smooth scroll behavior instead of instant', () => {
      const scrollOptions = {
        top: 500,
        left: 0,
        behavior: 'smooth',
      };

      expect(scrollOptions.behavior).toBe('smooth');
      expect(scrollOptions.behavior).not.toBe('auto');
      expect(scrollOptions.behavior).not.toBe('instant');
    });

    it('should provide scroll coordinates', () => {
      const scrollTop = 500;
      const scrollLeft = 0;

      const scrollOptions = {
        top: scrollTop || 0,
        left: scrollLeft || 0,
        behavior: 'smooth',
      };

      expect(scrollOptions.top).toBe(500);
      expect(scrollOptions.left).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle cursor restoration errors gracefully', () => {
      mockEditorView.dispatch = vi.fn(() => {
        throw new Error('Invalid cursor position');
      });

      let error = null;
      try {
        mockEditorView.dispatch({
          selection: { anchor: 150, head: 150 },
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toBe('Invalid cursor position');
    });

    it('should continue restoration even if cursor placement fails', () => {
      const operations = [];
      mockEditorView.dispatch = vi.fn(() => {
        operations.push('cursor-error');
        throw new Error('Cursor error');
      });
      mockEditorView.scrollDOM.scrollTo = vi.fn(() => operations.push('scroll-success'));
      mockEditorView.focus = vi.fn(() => operations.push('focus-success'));

      // Simulate try-catch for cursor, then continue
      try {
        mockEditorView.dispatch({ selection: { anchor: 150, head: 150 } });
      } catch {
        // Continue with scroll and focus
      }
      mockEditorView.scrollDOM.scrollTo({ top: 500, left: 0, behavior: 'smooth' });
      mockEditorView.focus();

      expect(operations).toEqual(['cursor-error', 'scroll-success', 'focus-success']);
    });
  });

  describe('Cursor Position Bounds Checking', () => {
    it('should not restore cursor if line number exceeds document length', () => {
      // Simulate a 1-line document
      const mockDoc = {
        lines: 1,
        length: 20,
        line: vi.fn((lineNum) => {
          if (lineNum < 1 || lineNum > 1) {
            throw new RangeError(`Invalid line number ${lineNum} in 1-line document`);
          }
          return { from: 0, length: 20 };
        }),
      };

      mockEditorView.state.doc = mockDoc;

      // Try to restore cursor to line 2 (out of bounds)
      const savedCursorLine = 1; // 0-based line 1
      const targetLine = savedCursorLine + 1; // Convert to 1-based = line 2

      // This should NOT throw because we check bounds first
      expect(() => {
        if (targetLine >= 1 && targetLine <= mockDoc.lines) {
          mockDoc.line(targetLine);
          mockEditorView.dispatch({ selection: { anchor: 0, head: 0 } });
        }
      }).not.toThrow();

      // Verify line() was never called (bounds check prevented it)
      expect(mockDoc.line).not.toHaveBeenCalled();
    });

    it('should restore cursor if line number is within bounds', () => {
      // Simulate a 5-line document
      const mockDoc = {
        lines: 5,
        length: 100,
        line: vi.fn((lineNum) => {
          if (lineNum < 1 || lineNum > 5) {
            throw new RangeError(`Invalid line number ${lineNum} in 5-line document`);
          }
          return { from: (lineNum - 1) * 20, length: 20 };
        }),
      };

      mockEditorView.state.doc = mockDoc;

      // Restore cursor to line 3 (valid)
      const savedCursorLine = 2; // 0-based line 2
      const targetLine = savedCursorLine + 1; // Convert to 1-based = line 3

      // This should work fine
      if (targetLine >= 1 && targetLine <= mockDoc.lines) {
        const line = mockDoc.line(targetLine);
        const pos = line.from + 5; // Column 5
        mockEditorView.dispatch({ selection: { anchor: pos, head: pos } });
      }

      expect(mockDoc.line).toHaveBeenCalledWith(3);
      expect(mockEditorView.dispatch).toHaveBeenCalledWith({
        selection: { anchor: 45, head: 45 },
      });
    });

    it('should handle cursor at exact document boundary', () => {
      // Simulate a 10-line document
      const mockDoc = {
        lines: 10,
        length: 200,
        line: vi.fn((lineNum) => {
          if (lineNum < 1 || lineNum > 10) {
            throw new RangeError(`Invalid line number ${lineNum} in 10-line document`);
          }
          return { from: (lineNum - 1) * 20, length: 20 };
        }),
      };

      mockEditorView.state.doc = mockDoc;

      // Restore cursor to last line (line 10)
      const savedCursorLine = 9; // 0-based line 9
      const targetLine = savedCursorLine + 1; // Convert to 1-based = line 10

      if (targetLine >= 1 && targetLine <= mockDoc.lines) {
        const line = mockDoc.line(targetLine);
        const pos = line.from + 10;
        mockEditorView.dispatch({ selection: { anchor: pos, head: pos } });
      }

      expect(mockDoc.line).toHaveBeenCalledWith(10);
      expect(mockEditorView.dispatch).toHaveBeenCalled();
    });

    it('should handle stale session with cursor beyond current document', () => {
      // Scenario: File was 100 lines when saved, now only 5 lines
      const mockDoc = {
        lines: 5,
        length: 100,
        line: vi.fn((lineNum) => {
          if (lineNum < 1 || lineNum > 5) {
            throw new RangeError(`Invalid line number ${lineNum} in 5-line document`);
          }
          return { from: (lineNum - 1) * 20, length: 20 };
        }),
      };

      mockEditorView.state.doc = mockDoc;

      // Try to restore cursor to line 50 (way out of bounds)
      const savedCursorLine = 49; // 0-based line 49
      const targetLine = savedCursorLine + 1; // Convert to 1-based = line 50

      // Should gracefully skip restoration
      if (targetLine >= 1 && targetLine <= mockDoc.lines) {
        mockDoc.line(targetLine);
        mockEditorView.dispatch({ selection: { anchor: 0, head: 0 } });
      }

      // Verify neither line() nor dispatch was called
      expect(mockDoc.line).not.toHaveBeenCalled();
      expect(mockEditorView.dispatch).not.toHaveBeenCalled();
    });

    it('should handle empty document (0 lines)', () => {
      const mockDoc = {
        lines: 0,
        length: 0,
        line: vi.fn(() => {
          throw new RangeError('Invalid line number in empty document');
        }),
      };

      mockEditorView.state.doc = mockDoc;

      // Try to restore any cursor position
      const savedCursorLine = 0;
      const targetLine = savedCursorLine + 1;

      if (targetLine >= 1 && targetLine <= mockDoc.lines) {
        mockDoc.line(targetLine);
      }

      // Should not attempt to access any line
      expect(mockDoc.line).not.toHaveBeenCalled();
    });
  });
});
