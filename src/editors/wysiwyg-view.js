import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { nord } from '@milkdown/theme-nord';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { history } from '@milkdown/plugin-history';
import { gfm } from '@milkdown/preset-gfm';
import { $prose } from '@milkdown/utils';
import { TextSelection, Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { markdownOffsetToRendered, renderedOffsetToMarkdown } from './position-converter.js';

// Plugin key for comment decorations
const commentDecorationKey = new PluginKey('commentDecorations');

// Create comment decoration plugin factory
function createCommentDecorationPlugin() {
  let commentDecorations = [];
  let activeCommentId = null;
  let onCommentClickHandler = null;

  return $prose(() => {
    return new Plugin({
      key: commentDecorationKey,
      state: {
        init() {
          return DecorationSet.empty;
        },
        apply(tr, set) {
          // Map decorations through document changes
          set = set.map(tr.mapping, tr.doc);

          // Check for comment decoration meta updates
          const meta = tr.getMeta(commentDecorationKey);
          if (meta) {
            if (meta.action === 'add') {
              commentDecorations = meta.comments;
              activeCommentId = meta.activeCommentId;
              onCommentClickHandler = meta.onCommentClick;
              return createDecorationSet(tr.doc, commentDecorations, activeCommentId);
            } else if (meta.action === 'clear') {
              commentDecorations = [];
              activeCommentId = null;
              return DecorationSet.empty;
            }
          }

          return set;
        },
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
        handleDOMEvents: {
          click(view, event) {
            const target = event.target;
            if (target.classList?.contains('comment-highlight')) {
              const commentId = target.getAttribute('data-comment-id');
              if (commentId && onCommentClickHandler) {
                onCommentClickHandler(commentId);
                event.preventDefault();
                return true;
              }
            }
            return false;
          },
        },
      },
    });
  });
}

// Helper function to create decoration set from comments
function createDecorationSet(doc, comments, activeCommentId) {
  const decorations = [];

  for (const comment of comments) {
    const { id, position } = comment;
    const isActive = id === activeCommentId;
    const className = isActive ? 'comment-highlight active' : 'comment-highlight';

    // Ensure positions are within document bounds
    // Note: ProseMirror positions need adjustment - add 1 to account for document structure
    const from = Math.max(0, Math.min(position.from + 1, doc.content.size));
    const to = Math.max(from, Math.min(position.to + 1, doc.content.size));

    if (from < to) {
      decorations.push(
        Decoration.inline(from, to, {
          class: className,
          'data-comment-id': id,
        })
      );
    }
  }

  return DecorationSet.create(doc, decorations);
}

/**
 * WYSIWYG Editor View using Milkdown (ProseMirror wrapper)
 * Provides a consistent interface for the editor manager
 */
export class WYSIWYGView {
  constructor(container, markdown = '', onChange = null, readOnly = false) {
    this.container = container;
    this.editor = null;
    this.currentMarkdown = markdown;
    this.onChangeCallback = onChange;
    this.readOnly = readOnly;
    this.initPromise = this.init(markdown);
  }

  async init(initialContent) {
    try {
      this.editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, this.container);
          ctx.set(defaultValueCtx, initialContent);

          // Set up change listener (only if not readonly)
          if (!this.readOnly) {
            ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
              this.currentMarkdown = markdown;
              if (this.onChangeCallback) {
                this.onChangeCallback(markdown);
              }
            });
          }
        })
        .use(nord)
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(history)
        .use(createCommentDecorationPlugin())
        .create();

      // Set readonly mode using ProseMirror's editable property
      if (this.readOnly) {
        this.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          // Update the view's editable prop - this is the proper way to make ProseMirror readonly
          view.setProps({ editable: () => false });
          // Add readonly class for styling
          this.container.classList.add('readonly-editor');
        });
      }

      return this.editor;
    } catch (error) {
      console.error('[WYSIWYGView] Failed to initialize Milkdown:', error);
      throw error;
    }
  }

  /**
   * Wait for editor to be fully initialized
   */
  async ready() {
    await this.initPromise;
  }

  /**
   * Get current markdown content
   */
  getContent() {
    return this.currentMarkdown;
  }

  /**
   * Get cursor position as {line, column}
   */
  getCursor() {
    if (!this.editor) {
      return { line: 0, column: 0 };
    }

    try {
      let line = 0;
      let column = 0;
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from } = state.selection;

        // Get the text from start of document to cursor
        // Use '\n' as block separator to match how markdown works
        const textBefore = state.doc.textBetween(0, from, '\n');
        const lines = textBefore.split('\n');
        line = lines.length - 1;
        column = lines[lines.length - 1].length;
      });
      return { line, column };
    } catch (error) {
      console.error('[WYSIWYGView] Error getting cursor:', error);
      return { line: 0, column: 0 };
    }
  }

  /**
   * Set cursor position by line and column
   */
  setCursor(targetLine, targetColumn) {
    if (!this.editor) {
      return;
    }

    try {
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state, dispatch } = view;
        const { doc } = state;

        // Get text content and find the position (use '\n' as separator like in getCursor)
        const fullText = state.doc.textBetween(0, state.doc.content.size, '\n');
        const lines = fullText.split('\n');

        // Calculate text offset
        let textOffset = 0;
        for (let i = 0; i < targetLine && i < lines.length; i++) {
          textOffset += lines[i].length + 1; // +1 for newline
        }
        textOffset += Math.min(targetColumn, lines[targetLine]?.length || 0);

        // Find ProseMirror position by walking the document
        let currentTextOffset = 0;
        let targetPos = 1;
        let found = false;

        doc.descendants((node, pos) => {
          if (found) return false;

          if (node.isText) {
            const endOffset = currentTextOffset + node.text.length;
            if (endOffset >= textOffset) {
              targetPos = pos + (textOffset - currentTextOffset);
              found = true;
              return false;
            }
            currentTextOffset = endOffset;
          } else if (node.type.name === 'hardBreak') {
            currentTextOffset += 1;
            if (currentTextOffset >= textOffset) {
              targetPos = pos + 1;
              found = true;
              return false;
            }
          } else if (node.isBlock) {
            // Count block boundaries as newlines (except at document start)
            if (pos > 0 && currentTextOffset > 0) {
              currentTextOffset += 1;
              if (currentTextOffset >= textOffset) {
                targetPos = pos;
                found = true;
                return false;
              }
            }
          }
        });

        // Ensure position is valid
        const safePos = Math.max(1, Math.min(targetPos, doc.content.size));
        const selection = TextSelection.create(doc, safePos);
        dispatch(state.tr.setSelection(selection).scrollIntoView());
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error setting cursor:', error);
    }
  }

  /**
   * Get cursor position as absolute character offset in raw markdown
   * @param {string} markdown - The raw markdown content
   * @returns {number} Absolute character offset in raw markdown
   */
  getAbsoluteCursor(markdown) {
    try {
      let renderedOffset = 0;

      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from } = state.selection;
        const { doc } = state;

        // Count actual text characters up to cursor position
        let charCount = 0;
        doc.nodesBetween(0, from, (node, pos) => {
          if (node.isText) {
            const endPos = pos + node.nodeSize;
            if (endPos <= from) {
              // Entire text node is before cursor
              charCount += node.text.length;
            } else {
              // Cursor is within this text node
              charCount += from - pos;
              return false; // Stop iteration
            }
          } else if (node.isBlock && pos > 0 && pos < from) {
            // Add newline for block boundaries (except the first one)
            charCount += 1;
          }
        });

        renderedOffset = charCount;
      });

      // Convert rendered position to raw markdown position
      return renderedOffsetToMarkdown(markdown, renderedOffset);
    } catch (error) {
      console.error('[WYSIWYGView] Error getting absolute cursor:', error);
      return 0;
    }
  }

  /**
   * Set cursor position by absolute character offset in raw markdown
   * @param {number} offset - Absolute character offset in raw markdown
   * @param {string} markdown - The raw markdown content
   */
  setAbsoluteCursor(offset, markdown) {
    try {
      // Convert raw markdown position to rendered text position
      const renderedOffset = markdownOffsetToRendered(markdown, offset);

      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state, dispatch } = view;
        const { doc } = state;

        // Walk the document tree to find the ProseMirror position
        // that corresponds to the rendered text offset
        let currentCharCount = 0;
        let targetPos = 1;
        let found = false;

        doc.descendants((node, pos) => {
          if (found) return false;

          if (node.isText) {
            const textLength = node.text.length;
            if (currentCharCount + textLength >= renderedOffset) {
              // Cursor is in this text node
              const offsetInNode = renderedOffset - currentCharCount;
              targetPos = pos + offsetInNode;
              found = true;
              return false;
            }
            currentCharCount += textLength;
          } else if (node.isBlock && pos > 0) {
            // Count block boundary as newline (except the first block)
            if (currentCharCount >= renderedOffset) {
              // Cursor is at this block boundary
              targetPos = pos;
              found = true;
              return false;
            }
            currentCharCount += 1;
          }
        });

        // If not found, position is at the end
        if (!found) {
          targetPos = doc.content.size;
        }

        const safePos = Math.max(1, Math.min(targetPos, doc.content.size));
        const selection = TextSelection.create(doc, safePos);
        dispatch(state.tr.setSelection(selection).scrollIntoView());
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error setting absolute cursor:', error);
    }
  }

  /**
   * Get scroll position
   */
  getScrollPosition() {
    // The scrollable element is #editor, not .milkdown
    const scroller = document.getElementById('editor');
    return scroller ? scroller.scrollTop : 0;
  }

  /**
   * Set scroll position
   */
  setScrollPosition(scrollTop) {
    // The scrollable element is #editor, not .milkdown
    const scroller = document.getElementById('editor');
    if (scroller) {
      scroller.scrollTop = scrollTop;
    }
  }

  /**
   * Focus the editor
   */
  focus() {
    if (!this.editor) return;

    try {
      // Use ProseMirror's view.focus() for proper focus handling
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (view && view.focus) {
          view.focus();
          console.log('[WYSIWYGView] Editor focused via ProseMirror API');
        } else {
          // Fallback to DOM focus
          const editorElement = this.container.querySelector('.milkdown .ProseMirror');
          if (editorElement) {
            editorElement.focus();
            console.log('[WYSIWYGView] Editor focused via DOM');
          }
        }
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error focusing editor:', error);
    }
  }

  /**
   * Destroy the editor and clean up
   */
  destroy() {
    if (this.editor) {
      try {
        this.editor.destroy();
      } catch (error) {
        console.error('[WYSIWYGView] Error destroying editor:', error);
      }
      this.editor = null;
      this.onChangeCallback = null;
      this.currentMarkdown = '';
    }
  }

  /**
   * Check if editor is initialized
   */
  isActive() {
    return this.editor !== null;
  }

  /**
   * Extract headings from the document for TOC
   * Returns array of {level, text, id, pos}
   */
  getHeadings() {
    if (!this.editor) {
      return [];
    }

    const headings = [];

    try {
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { doc } = state;

        doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            const level = node.attrs.level;
            const text = node.textContent;
            // Create a simple ID from the text
            const id = text
              .toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, '-');

            headings.push({
              level,
              text,
              id: `heading-${id}-${pos}`,
              pos,
            });
          }
        });
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error extracting headings:', error);
    }

    return headings;
  }

  /**
   * Scroll to a specific position in the document
   * Sets cursor at the position and scrolls to it
   * Inspired by: scrollIntoView but works without requiring focus
   */
  scrollToPosition(pos) {
    if (!this.editor) {
      console.error('[WYSIWYGView] scrollToPosition: editor not initialized');
      return;
    }

    console.log('[WYSIWYGView] scrollToPosition called with pos:', pos);

    try {
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state, dispatch } = view;
        const { doc } = state;

        console.log('[WYSIWYGView] Document size:', doc.content.size);

        // Ensure position is valid
        const safePos = Math.max(0, Math.min(pos, doc.content.size));
        console.log('[WYSIWYGView] Safe position:', safePos);

        // Create selection at that position
        const selection = TextSelection.create(doc, safePos);
        console.log('[WYSIWYGView] Created selection:', selection);

        // Dispatch transaction WITHOUT scrollIntoView to avoid conflicts
        const tr = state.tr.setSelection(selection);
        dispatch(tr);
        console.log('[WYSIWYGView] Dispatched transaction (selection only, no scroll)');

        // Scroll to the position using coordsAtPos which gives us the exact coordinates
        try {
          const coords = view.coordsAtPos(safePos);
          // The scrollable element is #editor, not .milkdown
          const scroller = document.getElementById('editor');

          console.log('[WYSIWYGView] Scroller element:', scroller);
          console.log('[WYSIWYGView] Scroller scrollTop before:', scroller?.scrollTop);

          if (scroller && coords) {
            // Calculate scroll position to center the target in viewport
            const scrollerRect = scroller.getBoundingClientRect();
            const targetScrollTop =
              coords.top - scrollerRect.top + scroller.scrollTop - scrollerRect.height / 2;

            console.log('[WYSIWYGView] Scrolling to coordinates:', {
              coordsTop: coords.top,
              scrollerTop: scrollerRect.top,
              currentScroll: scroller.scrollTop,
              targetScroll: targetScrollTop,
            });

            // Scroll to the calculated position
            scroller.scrollTop = targetScrollTop;

            console.log('[WYSIWYGView] Immediately after setting scrollTop:', scroller.scrollTop);

            // Verify scroll actually happened
            setTimeout(() => {
              const scrollPos = this.getScrollPosition();
              console.log('[WYSIWYGView] Final scroll position after 50ms:', scrollPos);
              console.log('[WYSIWYGView] Scroller.scrollTop directly:', scroller.scrollTop);
            }, 50);

            setTimeout(() => {
              console.log('[WYSIWYGView] Scroll position after 200ms:', scroller.scrollTop);
            }, 200);
          } else {
            console.warn(
              '[WYSIWYGView] Could not get coordinates or scroller for position:',
              safePos,
              'coords:',
              coords,
              'scroller:',
              scroller
            );
          }
        } catch (error) {
          console.warn('[WYSIWYGView] Could not perform scroll:', error);
        }
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error scrolling to position:', error);
    }
  }

  /**
   * Get current text selection
   * @returns {{from: number, to: number, text: string}|null} Selection object or null if no selection
   */
  getSelection() {
    if (!this.editor) {
      return null;
    }

    try {
      return this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from, to } = state.selection;

        // If there's no selection, return null
        if (from === to) {
          return null;
        }

        const text = state.doc.textBetween(from, to, '\n');

        return {
          from,
          to,
          text,
        };
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error getting selection:', error);
      return null;
    }
  }

  /**
   * Get full document text
   * @returns {string} Document text
   */
  getDocumentText() {
    if (!this.editor) {
      return '';
    }

    try {
      return this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        return state.doc.textContent;
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error getting document text:', error);
      return '';
    }
  }

  /**
   * Apply comment decorations to the editor
   * @param {Array} comments - Array of comments with positions
   * @param {string} activeCommentId - ID of active comment
   * @param {function} onCommentClick - Click handler
   */
  applyCommentDecorations(comments, activeCommentId = null, onCommentClick = null) {
    if (!this.editor) return;

    try {
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const tr = view.state.tr;

        tr.setMeta(commentDecorationKey, {
          action: 'add',
          comments,
          activeCommentId,
          onCommentClick,
        });

        view.dispatch(tr);
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error applying comment decorations:', error);
    }
  }

  /**
   * Clear all comment decorations
   */
  clearCommentDecorations() {
    if (!this.editor) return;

    try {
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const tr = view.state.tr;

        tr.setMeta(commentDecorationKey, {
          action: 'clear',
        });

        view.dispatch(tr);
      });
    } catch (error) {
      console.error('[WYSIWYGView] Error clearing comment decorations:', error);
    }
  }

  /**
   * Add a single comment decoration
   * @param {string} commentId - Comment ID
   * @param {number} from - Start position
   * @param {number} to - End position
   * @param {boolean} isActive - Whether this is the active comment
   */
  addCommentDecoration(commentId, from, to, isActive = false) {
    // For simplicity, we'll use applyCommentDecorations with a single comment
    this.applyCommentDecorations(
      [{ id: commentId, position: { from, to } }],
      isActive ? commentId : null
    );
  }

  /**
   * Remove a comment decoration
   * @param {string} _commentId - Comment ID to remove
   */
  removeCommentDecoration(_commentId) {
    // To remove a specific comment, we'd need to track all comments
    // For now, this is a placeholder that clears all
    // In a full implementation, you'd maintain state and filter out the comment
    console.warn(
      '[WYSIWYGView] removeCommentDecoration not fully implemented - use applyCommentDecorations instead'
    );
  }

  /**
   * Set the active comment
   * @param {string} _commentId - Comment ID
   * @param {function} _onCommentClick - Click handler
   */
  setActiveComment(_commentId, _onCommentClick) {
    // Re-apply decorations with new active comment
    // In a full implementation, you'd track the comments list
    console.warn(
      '[WYSIWYGView] setActiveComment - use applyCommentDecorations with full comment list'
    );
  }
}
