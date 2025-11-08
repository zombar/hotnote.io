import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { nord } from '@milkdown/theme-nord';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { history } from '@milkdown/plugin-history';
import { gfm } from '@milkdown/preset-gfm';

let milkdownEditor = null;
let onChangeCallback = null;
let currentMarkdown = '';

// Initialize Milkdown editor
export const initMarkdownEditor = async (container, initialContent = '', onChange = null) => {
  if (milkdownEditor) {
    destroyMarkdownEditor();
  }

  onChangeCallback = onChange;
  currentMarkdown = initialContent;

  try {
    milkdownEditor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, container);
        ctx.set(defaultValueCtx, initialContent);

        // Set up change listener
        ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
          currentMarkdown = markdown;
          if (onChangeCallback) {
            onChangeCallback(markdown);
          }
        });
      })
      .use(nord)
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .create();

    return milkdownEditor;
  } catch (error) {
    console.error('Failed to initialize Milkdown:', error);
    throw error;
  }
};

// Destroy Milkdown editor
export const destroyMarkdownEditor = () => {
  if (milkdownEditor) {
    try {
      milkdownEditor.destroy();
    } catch (error) {
      console.error('Error destroying Milkdown:', error);
    }
    milkdownEditor = null;
    onChangeCallback = null;
    currentMarkdown = '';
  }
};

// Get current markdown content
export const getMarkdownContent = () => {
  return currentMarkdown;
};

// Set markdown content
export const setMarkdownContent = (content) => {
  if (!milkdownEditor) {
    return;
  }

  try {
    milkdownEditor.action((ctx) => {
      ctx.set(defaultValueCtx, content);
    });
  } catch (error) {
    console.error('Error setting markdown content:', error);
  }
};

// Check if Milkdown is initialized
export const isMarkdownEditorActive = () => {
  return milkdownEditor !== null;
};

// Focus the markdown editor
export const focusMarkdownEditor = () => {
  if (!milkdownEditor) {
    return;
  }

  try {
    // Find the ProseMirror editor element and focus it
    const editorElement = document.querySelector('.milkdown .ProseMirror');
    if (editorElement) {
      editorElement.focus();
    }
  } catch (error) {
    console.error('Error focusing markdown editor:', error);
  }
};
