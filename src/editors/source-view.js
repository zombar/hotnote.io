import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
  Decoration,
} from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

// Brand-themed syntax highlighting (light mode)
const brandHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#a65580', fontWeight: '500' }, // darker muted pink
  { tag: tags.operator, color: '#7a65ad' }, // darker muted purple
  { tag: tags.variableName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.string, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.number, color: '#7a65ad' }, // darker muted purple
  { tag: tags.bool, color: '#7a65ad' }, // darker muted purple
  { tag: tags.comment, color: '#999999', fontStyle: 'italic' }, // gray
  { tag: tags.tagName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.attributeName, color: '#a65580' }, // darker muted pink
  { tag: tags.propertyName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.function(tags.variableName), color: '#5a9cb8', fontWeight: '500' }, // darker muted cyan
  { tag: tags.className, color: '#a65580' }, // darker muted pink
  { tag: tags.typeName, color: '#a65580' }, // darker muted pink
  { tag: tags.regexp, color: '#7a65ad' }, // darker muted purple
  { tag: tags.escape, color: '#a65580' }, // darker muted pink
  { tag: tags.meta, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.constant(tags.variableName), color: '#7a65ad' }, // darker muted purple
]);

// Brand-themed syntax highlighting (dark mode)
const brandHighlightStyleDark = HighlightStyle.define([
  { tag: tags.keyword, color: '#e8bcd4', fontWeight: '500' }, // lighter muted pink
  { tag: tags.operator, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.variableName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.string, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.number, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.bool, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.comment, color: '#888888', fontStyle: 'italic' }, // gray
  { tag: tags.tagName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.attributeName, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.propertyName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.function(tags.variableName), color: '#b8e5f2', fontWeight: '500' }, // lighter muted cyan
  { tag: tags.className, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.typeName, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.regexp, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.escape, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.meta, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.constant(tags.variableName), color: '#c8bce8' }, // lighter muted purple
]);

// Comment decoration effects
const addCommentDecoration = StateEffect.define();
const removeCommentDecoration = StateEffect.define();
const clearCommentDecorations = StateEffect.define();
const setActiveComment = StateEffect.define();

// Comment decoration state field
const commentDecorationField = StateField.define({
  create() {
    return { decorations: Decoration.none, activeCommentId: null, onCommentClick: null };
  },
  update(state, tr) {
    let { decorations, activeCommentId, onCommentClick } = state;
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(addCommentDecoration)) {
        const { commentId, from, to, isActive } = effect.value;
        const className = isActive ? 'comment-highlight active' : 'comment-highlight';
        const deco = Decoration.mark({
          class: className,
          attributes: { 'data-comment-id': commentId },
        }).range(from, to);
        decorations = decorations.update({ add: [deco] });
      } else if (effect.is(removeCommentDecoration)) {
        const commentId = effect.value;
        decorations = decorations.update({
          filter: (from, to, value) => {
            return value.spec.attributes?.['data-comment-id'] !== commentId;
          },
        });
      } else if (effect.is(clearCommentDecorations)) {
        decorations = Decoration.none;
      } else if (effect.is(setActiveComment)) {
        activeCommentId = effect.value.commentId;
        onCommentClick = effect.value.onCommentClick;
      }
    }

    return { decorations, activeCommentId, onCommentClick };
  },
  provide: (f) => EditorView.decorations.from(f, (state) => state.decorations),
});

// Handle clicks on comment decorations
function commentClickHandler(_view) {
  return EditorView.domEventHandlers({
    click: (event, view) => {
      const target = event.target;
      if (target.classList.contains('comment-highlight')) {
        const commentId = target.getAttribute('data-comment-id');
        const field = view.state.field(commentDecorationField);
        if (commentId && field.onCommentClick) {
          field.onCommentClick(commentId);
          event.preventDefault();
          return true;
        }
      }
      return false;
    },
  });
}

/**
 * Source Editor View using CodeMirror 6
 * Provides a consistent interface for the editor manager
 */
export class SourceView {
  constructor(container, markdown = '', onChange = null, readOnly = false) {
    this.container = container;
    this.onChangeCallback = onChange;
    this.readOnly = readOnly;
    this.view = this.createEditor(markdown);
  }

  createEditor(initialContent) {
    // Use appropriate highlight style based on current theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const highlightStyle = isDark ? brandHighlightStyleDark : brandHighlightStyle;

    const extensions = [
      lineNumbers(),
      EditorView.lineWrapping, // Add line wrapping like regular CodeMirror
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      syntaxHighlighting(highlightStyle), // Use brand colors
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      commentDecorationField,
      commentClickHandler(),
      markdown({
        base: markdownLanguage,
      }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      // Listen for document changes
      EditorView.updateListener.of((update) => {
        if (update.docChanged && this.onChangeCallback) {
          const content = update.state.doc.toString();
          this.onChangeCallback(content);
        }
      }),
    ];

    // Add readonly extension if in readonly mode
    if (this.readOnly) {
      extensions.push(EditorState.readOnly.of(true));
      extensions.push(EditorView.editable.of(false));
    }

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    return new EditorView({
      state,
      parent: this.container,
    });
  }

  /**
   * Get current markdown content
   */
  getContent() {
    return this.view.state.doc.toString();
  }

  /**
   * Get cursor position as {line, column}
   */
  getCursor() {
    const pos = this.view.state.selection.main.head;
    const line = this.view.state.doc.lineAt(pos);
    return {
      line: line.number - 1, // Convert to 0-based
      column: pos - line.from,
    };
  }

  /**
   * Set cursor position by line and column
   */
  setCursor(line, column) {
    try {
      // Convert 0-based line to 1-based for CodeMirror
      const lineObj = this.view.state.doc.line(line + 1);
      const pos = lineObj.from + Math.min(column, lineObj.length);

      this.view.dispatch({
        selection: { anchor: pos, head: pos },
        scrollIntoView: true,
      });
    } catch (error) {
      console.error('[SourceView] Error setting cursor:', error);
    }
  }

  /**
   * Get cursor position as absolute character offset in the document
   * @returns {number} Absolute character offset
   */
  getAbsoluteCursor() {
    return this.view.state.selection.main.head;
  }

  /**
   * Set cursor position by absolute character offset
   * @param {number} offset - Absolute character offset in the document
   */
  setAbsoluteCursor(offset) {
    try {
      const docLength = this.view.state.doc.length;
      const safeOffset = Math.max(0, Math.min(offset, docLength));

      this.view.dispatch({
        selection: { anchor: safeOffset, head: safeOffset },
        scrollIntoView: true,
      });
    } catch (error) {
      console.error('[SourceView] Error setting absolute cursor:', error);
    }
  }

  /**
   * Get total number of lines in document
   */
  getLineCount() {
    return this.view.state.doc.lines;
  }

  /**
   * Get scroll position
   */
  getScrollPosition() {
    return this.view.scrollDOM.scrollTop;
  }

  /**
   * Set scroll position
   */
  setScrollPosition(scrollTop) {
    this.view.scrollDOM.scrollTop = scrollTop;
  }

  /**
   * Focus the editor
   */
  focus() {
    this.view.focus();
  }

  /**
   * Destroy the editor and clean up
   */
  destroy() {
    if (this.view) {
      this.view.destroy();
      this.view = null;
      this.onChangeCallback = null;
    }
  }

  /**
   * Check if editor is active
   */
  isActive() {
    return this.view !== null;
  }

  /**
   * Get current text selection
   * @returns {{from: number, to: number, text: string}|null} Selection object or null if no selection
   */
  getSelection() {
    if (!this.view) {
      return null;
    }

    const state = this.view.state;
    const selection = state.selection.main;

    // If there's no selection (from === to), return null
    if (selection.from === selection.to) {
      return null;
    }

    const text = state.doc.sliceString(selection.from, selection.to);

    return {
      from: selection.from,
      to: selection.to,
      text: text,
    };
  }

  /**
   * Get full document text
   * @returns {string} Document text
   */
  getDocumentText() {
    if (!this.view) {
      return '';
    }

    return this.view.state.doc.toString();
  }

  /**
   * Add a comment decoration to the editor
   * @param {string} commentId - Comment ID
   * @param {number} from - Start position
   * @param {number} to - End position
   * @param {boolean} isActive - Whether this is the active comment
   */
  addCommentDecoration(commentId, from, to, isActive = false) {
    if (!this.view) return;

    this.view.dispatch({
      effects: addCommentDecoration.of({ commentId, from, to, isActive }),
    });
  }

  /**
   * Remove a comment decoration from the editor
   * @param {string} commentId - Comment ID
   */
  removeCommentDecoration(commentId) {
    if (!this.view) return;

    this.view.dispatch({
      effects: removeCommentDecoration.of(commentId),
    });
  }

  /**
   * Clear all comment decorations
   */
  clearCommentDecorations() {
    if (!this.view) return;

    this.view.dispatch({
      effects: clearCommentDecorations.of(null),
    });
  }

  /**
   * Set the active comment (for highlighting)
   * @param {string} commentId - Comment ID
   * @param {function} onCommentClick - Click handler for comments
   */
  setActiveComment(commentId, onCommentClick) {
    if (!this.view) return;

    this.view.dispatch({
      effects: setActiveComment.of({ commentId, onCommentClick }),
    });
  }

  /**
   * Apply multiple comment decorations at once
   * @param {Array} comments - Array of comments with positions
   * @param {string} activeCommentId - ID of active comment
   * @param {function} onCommentClick - Click handler
   */
  applyCommentDecorations(comments, activeCommentId = null, onCommentClick = null) {
    if (!this.view) return;

    const effects = [];

    // Clear existing decorations
    effects.push(clearCommentDecorations.of(null));

    // Add new decorations
    for (const comment of comments) {
      const isActive = comment.id === activeCommentId;
      effects.push(
        addCommentDecoration.of({
          commentId: comment.id,
          from: comment.position.from,
          to: comment.position.to,
          isActive,
        })
      );
    }

    // Set active comment and click handler
    if (activeCommentId || onCommentClick) {
      effects.push(setActiveComment.of({ commentId: activeCommentId, onCommentClick }));
    }

    this.view.dispatch({ effects });
  }
}
