import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorManager } from '../src/editors/editor-manager.js';

// Mock the view classes
vi.mock('../src/editors/source-view.js', () => ({
  SourceView: class {
    constructor(container, content, onChange) {
      this.container = container;
      this.content = content;
      this.onChange = onChange;
    }
    getContent() {
      return this.content;
    }
    getCursor() {
      return { line: 0, column: 0 };
    }
    getAbsoluteCursor() {
      return 0;
    }
    getScrollPosition() {
      return 0;
    }
    setCursor() {}
    setAbsoluteCursor() {}
    setScrollPosition() {}
    focus() {}
    destroy() {}
    isActive() {
      return true;
    }
    getSelection() {
      return { from: 10, to: 20, text: 'selected' };
    }
    getDocumentText() {
      return this.content;
    }
  },
}));

vi.mock('../src/editors/wysiwyg-view.js', () => ({
  WYSIWYGView: class {
    constructor(container, content, onChange) {
      this.container = container;
      this.content = content;
      this.onChange = onChange;
    }
    ready() {
      return Promise.resolve();
    }
    getContent() {
      return this.content;
    }
    getCursor() {
      return { line: 5, column: 10 };
    }
    getAbsoluteCursor() {
      return 50;
    }
    getScrollPosition() {
      return 100;
    }
    setCursor() {}
    setAbsoluteCursor() {}
    setScrollPosition() {}
    focus() {}
    destroy() {}
    isActive() {
      return true;
    }
    getHeadings() {
      return [];
    }
    scrollToPosition() {}
    getSelection() {
      return { from: 5, to: 15, text: 'wysiwyg text' };
    }
    getDocumentText() {
      return this.content;
    }
  },
}));

describe('EditorManager', () => {
  let container;
  let onChange;

  beforeEach(() => {
    container = document.createElement('div');
    onChange = vi.fn();
  });

  describe('Initialization', () => {
    it('should initialize in wysiwyg mode by default', async () => {
      const manager = new EditorManager(container, 'wysiwyg', 'test content', onChange);
      await manager.ready();

      expect(manager.getMode()).toBe('wysiwyg');
      expect(manager.getContent()).toBe('test content');
    });

    it('should initialize in source mode when specified', async () => {
      const manager = new EditorManager(container, 'source', 'test content', onChange);
      await manager.ready();

      expect(manager.getMode()).toBe('source');
      expect(manager.getContent()).toBe('test content');
    });

    it('should call onChange callback', async () => {
      const manager = new EditorManager(container, 'source', 'test', onChange);
      await manager.ready();

      expect(manager.onChangeCallback).toBe(onChange);
    });
  });

  describe('Mode Switching', () => {
    it('should switch from wysiwyg to source', async () => {
      const manager = new EditorManager(container, 'wysiwyg', 'content', onChange);
      await manager.ready();

      await manager.switchMode('source');
      expect(manager.getMode()).toBe('source');
    });

    it('should switch from source to wysiwyg', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      await manager.switchMode('wysiwyg');
      expect(manager.getMode()).toBe('wysiwyg');
    });

    it('should not switch if already in target mode', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      const currentEditor = manager.currentEditor;
      await manager.switchMode('source');

      expect(manager.currentEditor).toBe(currentEditor);
    });

    it('should preserve content when switching modes', async () => {
      const manager = new EditorManager(container, 'wysiwyg', 'test content', onChange);
      await manager.ready();

      await manager.switchMode('source');
      expect(manager.getContent()).toBe('test content');
    });

    it('should toggle between modes', async () => {
      const manager = new EditorManager(container, 'wysiwyg', 'content', onChange);
      await manager.ready();

      await manager.toggleMode();
      expect(manager.getMode()).toBe('source');

      await manager.toggleMode();
      expect(manager.getMode()).toBe('wysiwyg');
    });
  });

  describe('State Management', () => {
    it('should get cursor position', async () => {
      const manager = new EditorManager(container, 'wysiwyg', 'content', onChange);
      await manager.ready();

      const cursor = manager.getCursor();
      expect(cursor).toEqual({ line: 5, column: 10 });
    });

    it('should get scroll position', async () => {
      const manager = new EditorManager(container, 'wysiwyg', 'content', onChange);
      await manager.ready();

      const scroll = manager.getScrollPosition();
      expect(scroll).toBe(100);
    });

    it('should set cursor position', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      const spy = vi.spyOn(manager.currentEditor, 'setCursor');
      manager.setCursor(10, 20);
      expect(spy).toHaveBeenCalledWith(10, 20);
    });

    it('should set scroll position', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      const spy = vi.spyOn(manager.currentEditor, 'setScrollPosition');
      manager.setScrollPosition(200);
      expect(spy).toHaveBeenCalledWith(200);
    });

    it('should focus editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      const spy = vi.spyOn(manager.currentEditor, 'focus');
      manager.focus();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Lifecycle', () => {
    it('should destroy editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      const spy = vi.spyOn(manager.currentEditor, 'destroy');
      manager.destroy();

      expect(spy).toHaveBeenCalled();
      expect(manager.currentEditor).toBeNull();
    });

    it('should check if active', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      expect(manager.isActive()).toBe(true);

      manager.destroy();
      expect(manager.isActive()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle getCursor with no editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      manager.currentEditor = null;

      expect(manager.getCursor()).toEqual({ line: 0, column: 0 });
    });

    it('should handle getScrollPosition with no editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      manager.currentEditor = null;

      expect(manager.getScrollPosition()).toBe(0);
    });

    it('should handle getContent with no editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      manager.currentEditor = null;

      expect(manager.getContent()).toBe('');
    });

    it('should handle setCursor with no editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      manager.currentEditor = null;

      expect(() => manager.setCursor(0, 0)).not.toThrow();
    });

    it('should handle setScrollPosition with no editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      manager.currentEditor = null;

      expect(() => manager.setScrollPosition(0)).not.toThrow();
    });

    it('should handle focus with no editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      manager.currentEditor = null;

      expect(() => manager.focus()).not.toThrow();
    });
  });

  describe('Selection API', () => {
    it('should get selection from source mode', async () => {
      const manager = new EditorManager(container, 'source', 'test content', onChange);
      await manager.ready();

      const selection = manager.getSelection();

      expect(selection).toEqual({ from: 10, to: 20, text: 'selected' });
    });

    it('should get selection from wysiwyg mode', async () => {
      const manager = new EditorManager(container, 'wysiwyg', 'test content', onChange);
      await manager.ready();

      const selection = manager.getSelection();

      expect(selection).toEqual({ from: 5, to: 15, text: 'wysiwyg text' });
    });

    it('should return null selection when no editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      manager.currentEditor = null;

      const selection = manager.getSelection();

      expect(selection).toBeNull();
    });

    it('should get document text from source mode', async () => {
      const manager = new EditorManager(container, 'source', 'full document text', onChange);
      await manager.ready();

      const text = manager.getDocumentText();

      expect(text).toBe('full document text');
    });

    it('should get document text from wysiwyg mode', async () => {
      const manager = new EditorManager(container, 'wysiwyg', 'wysiwyg document', onChange);
      await manager.ready();

      const text = manager.getDocumentText();

      expect(text).toBe('wysiwyg document');
    });

    it('should return empty string for document text when no editor', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      manager.currentEditor = null;

      const text = manager.getDocumentText();

      expect(text).toBe('');
    });

    it('should call underlying editor getSelection', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      const spy = vi.spyOn(manager.currentEditor, 'getSelection');
      manager.getSelection();

      expect(spy).toHaveBeenCalled();
    });

    it('should call underlying editor getDocumentText', async () => {
      const manager = new EditorManager(container, 'source', 'content', onChange);
      await manager.ready();

      const spy = vi.spyOn(manager.currentEditor, 'getDocumentText');
      manager.getDocumentText();

      expect(spy).toHaveBeenCalled();
    });
  });
});
