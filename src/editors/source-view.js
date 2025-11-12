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
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
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
}
