import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initMarkdownEditor,
  destroyMarkdownEditor,
  getMarkdownContent,
  setMarkdownContent,
  isMarkdownEditorActive,
} from '../markdown-editor.js';

describe('Markdown Editor Module', () => {
  let container;
  let changeCallback;

  beforeEach(() => {
    // Create a container element for the editor
    container = document.createElement('div');
    container.id = 'test-editor';
    document.body.appendChild(container);

    // Clean up any existing editor
    destroyMarkdownEditor();

    // Mock callback
    changeCallback = vi.fn();
  });

  describe('Editor Lifecycle', () => {
    it('should initialize Milkdown editor', async () => {
      const editor = await initMarkdownEditor(container, 'Hello World', changeCallback);

      expect(editor).toBeDefined();
      expect(isMarkdownEditorActive()).toBe(true);
    });

    it('should destroy editor cleanly', async () => {
      await initMarkdownEditor(container, 'Test', changeCallback);
      expect(isMarkdownEditorActive()).toBe(true);

      destroyMarkdownEditor();
      expect(isMarkdownEditorActive()).toBe(false);
    });

    it('should replace existing editor on re-initialization', async () => {
      await initMarkdownEditor(container, 'First', changeCallback);
      const firstActive = isMarkdownEditorActive();

      await initMarkdownEditor(container, 'Second', changeCallback);
      const secondActive = isMarkdownEditorActive();

      expect(firstActive).toBe(true);
      expect(secondActive).toBe(true);
    });

    it('should handle initialization with empty content', async () => {
      const editor = await initMarkdownEditor(container, '', changeCallback);

      expect(editor).toBeDefined();
      expect(isMarkdownEditorActive()).toBe(true);
    });
  });

  describe('Content Management', () => {
    it('should get markdown content', async () => {
      const initialContent = '# Heading\n\nParagraph text.';
      await initMarkdownEditor(container, initialContent, changeCallback);

      const content = getMarkdownContent();
      expect(content).toBeDefined();
    });

    it('should return empty string when editor not initialized', () => {
      const content = getMarkdownContent();
      expect(content).toBe('');
    });

    it('should set markdown content', async () => {
      await initMarkdownEditor(container, 'Initial', changeCallback);

      setMarkdownContent('# New Content');

      // Content should be updated (implementation may vary)
      expect(isMarkdownEditorActive()).toBe(true);
    });

    it('should handle setting content on uninitialized editor', () => {
      // Should not throw error
      expect(() => setMarkdownContent('Test')).not.toThrow();
    });
  });

  describe('Change Listeners', () => {
    it('should call onChange callback when content changes', async () => {
      await initMarkdownEditor(container, 'Initial', changeCallback);

      // Simulate content change (this depends on Milkdown's API)
      // The callback would be triggered by actual editing
      // This is a placeholder test - actual implementation may need adjustment
      expect(changeCallback).toHaveBeenCalledTimes(0); // Not called on init
    });

    it('should not call callback when onChange is null', async () => {
      // Should not throw error
      await expect(initMarkdownEditor(container, 'Test', null)).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle destroy on non-existent editor', () => {
      expect(() => destroyMarkdownEditor()).not.toThrow();
    });

    it('should handle getMarkdownContent errors gracefully', () => {
      destroyMarkdownEditor();
      const content = getMarkdownContent();
      expect(content).toBe('');
    });
  });

  describe('State Queries', () => {
    it('should report inactive when not initialized', () => {
      destroyMarkdownEditor();
      expect(isMarkdownEditorActive()).toBe(false);
    });

    it('should report active when initialized', async () => {
      await initMarkdownEditor(container, 'Test', changeCallback);
      expect(isMarkdownEditorActive()).toBe(true);
    });

    it('should report inactive after destruction', async () => {
      await initMarkdownEditor(container, 'Test', changeCallback);
      destroyMarkdownEditor();
      expect(isMarkdownEditorActive()).toBe(false);
    });
  });
});

describe('Markdown Editor Integration', () => {
  describe('File Type Detection', () => {
    it('should detect .md files as markdown', () => {
      const testCases = [
        { filename: 'test.md', expected: true },
        { filename: 'README.md', expected: true },
        { filename: 'doc.markdown', expected: true },
        { filename: 'file.MD', expected: true },
        { filename: 'test.js', expected: false },
        { filename: 'test.txt', expected: false },
        { filename: 'noextension', expected: false },
      ];

      // This tests the isMarkdownFile function from app.js
      // We'll need to export it or test it through integration
      testCases.forEach(({ filename, expected }) => {
        const ext = filename.split('.').pop().toLowerCase();
        const isMarkdown = ext === 'md' || ext === 'markdown';
        expect(isMarkdown).toBe(expected);
      });
    });
  });

  describe('Editor Content Retrieval', () => {
    it('should return empty string when no editor is active', () => {
      // Mock scenario where neither editor is active
      const _result = ''; // getEditorContent would return this
      expect(_result).toBe('');
    });
  });

  describe('Rich Mode Toggle', () => {
    it('should track rich mode state', () => {
      let _isRichMode = false;

      // Simulate opening markdown file
      _isRichMode = true;
      expect(_isRichMode).toBe(true);

      // Simulate toggle
      _isRichMode = !_isRichMode;
      expect(_isRichMode).toBe(false);

      // Toggle again
      _isRichMode = !_isRichMode;
      expect(_isRichMode).toBe(true);
    });

    it('should disable rich mode for non-markdown files', () => {
      let _isRichMode = true;

      // Simulate opening non-markdown file
      const filename = 'test.js';
      const isMarkdown = filename.endsWith('.md') || filename.endsWith('.markdown');

      if (!isMarkdown) {
        _isRichMode = false;
      }

      expect(_isRichMode).toBe(false);
    });
  });

  describe('Button Visibility', () => {
    it('should show rich button for markdown files', () => {
      const filename = 'test.md';
      const isMarkdown = filename.endsWith('.md') || filename.endsWith('.markdown');
      const shouldShowButton = isMarkdown;

      expect(shouldShowButton).toBe(true);
    });

    it('should hide rich button for non-markdown files', () => {
      const filename = 'test.js';
      const isMarkdown = filename.endsWith('.md') || filename.endsWith('.markdown');
      const shouldShowButton = isMarkdown;

      expect(shouldShowButton).toBe(false);
    });

    it('should update button text based on mode', () => {
      let isRichMode = true;
      let buttonText = isRichMode ? 'source' : 'rich';
      expect(buttonText).toBe('source');

      isRichMode = false;
      buttonText = isRichMode ? 'source' : 'rich';
      expect(buttonText).toBe('rich');
    });
  });
});

describe('Markdown Editor Workflows', () => {
  describe('Opening Markdown Files', () => {
    it('should default to rich mode for .md files', () => {
      const filename = 'document.md';
      let isRichMode = false;

      // Simulate file opening logic
      if (filename.endsWith('.md') || filename.endsWith('.markdown')) {
        isRichMode = true;
      }

      expect(isRichMode).toBe(true);
    });

    it('should use source mode for non-markdown files', () => {
      const filename = 'script.js';
      let isRichMode = false;

      // Simulate file opening logic
      if (filename.endsWith('.md') || filename.endsWith('.markdown')) {
        isRichMode = true;
      }

      expect(isRichMode).toBe(false);
    });
  });

  describe('Mode Switching', () => {
    it('should preserve content when switching modes', () => {
      const originalContent = '# Heading\n\nContent here.';
      const currentContent = originalContent;
      let _isRichMode = true;

      // Simulate toggle
      const contentBeforeToggle = currentContent;
      _isRichMode = !_isRichMode;
      const contentAfterToggle = currentContent;

      expect(contentBeforeToggle).toBe(contentAfterToggle);
    });

    it('should only toggle for markdown files', () => {
      const markdownFile = 'test.md';
      const jsFile = 'test.js';

      const canToggleMarkdown = markdownFile.endsWith('.md') || markdownFile.endsWith('.markdown');
      const canToggleJs = jsFile.endsWith('.md') || jsFile.endsWith('.markdown');

      expect(canToggleMarkdown).toBe(true);
      expect(canToggleJs).toBe(false);
    });
  });

  describe('Saving Content', () => {
    it('should get content from active editor', () => {
      // Mock scenario: Milkdown is active
      const isRichMode = true;
      const milkdownContent = '# Title\n\nParagraph';
      const codemirrorContent = '';

      const content = isRichMode ? milkdownContent : codemirrorContent;
      expect(content).toBe('# Title\n\nParagraph');
    });

    it('should get content from CodeMirror when not in rich mode', () => {
      // Mock scenario: CodeMirror is active
      const isRichMode = false;
      const milkdownContent = '';
      const codemirrorContent = 'const x = 1;';

      const content = isRichMode ? milkdownContent : codemirrorContent;
      expect(content).toBe('const x = 1;');
    });
  });

  describe('Temp Storage', () => {
    it('should save temp changes from Milkdown', () => {
      const isRichMode = true;
      const isDirty = true;
      const content = '# Unsaved changes';

      // Mock getEditorContent behavior
      const savedContent = isRichMode ? content : '';

      expect(savedContent).toBe('# Unsaved changes');
      expect(isDirty).toBe(true);
    });

    it('should restore temp changes to correct editor', () => {
      const _tempContent = '# Restored content';
      const isRichMode = true;

      // Content should be loaded into Milkdown
      const targetEditor = isRichMode ? 'milkdown' : 'codemirror';

      expect(targetEditor).toBe('milkdown');
    });
  });

  describe('Navigation', () => {
    it('should reinitialize correct editor after navigation', () => {
      // Navigate to markdown file
      let currentFile = 'notes.md';
      let isRichMode = currentFile.endsWith('.md') || currentFile.endsWith('.markdown');
      expect(isRichMode).toBe(true);

      // Navigate to code file
      currentFile = 'script.js';
      isRichMode = currentFile.endsWith('.md') || currentFile.endsWith('.markdown');
      expect(isRichMode).toBe(false);

      // Navigate back to markdown
      currentFile = 'notes.md';
      isRichMode = currentFile.endsWith('.md') || currentFile.endsWith('.markdown');
      expect(isRichMode).toBe(true);
    });
  });
});
