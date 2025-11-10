import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from '../../src/state/app-state.js';

describe('AppState', () => {
  beforeEach(() => {
    appState.resetAll();
  });

  describe('initialization', () => {
    it('should have null editor initially', () => {
      expect(appState.editorView).toBeNull();
    });

    it('should have null editor manager initially', () => {
      expect(appState.editorManager).toBeNull();
    });

    it('should not be dirty initially', () => {
      expect(appState.isDirty).toBe(false);
    });

    it('should have empty navigation history', () => {
      expect(appState.navigationHistory).toEqual([]);
      expect(appState.historyIndex).toBe(-1);
    });

    it('should have default filename "untitled"', () => {
      expect(appState.currentFilename).toBe('untitled');
    });

    it('should have autosave enabled by default', () => {
      expect(appState.autosaveEnabled).toBe(true);
    });

    it('should have focusManager instance', () => {
      expect(appState.focusManager).toBeDefined();
      expect(appState.getFocusManager()).toBe(appState.focusManager);
    });

    it('should have empty original content', () => {
      expect(appState.originalContent).toBe('');
    });
  });

  describe('file state management', () => {
    it('should update current file handle', () => {
      const mockHandle = { name: 'test.js' };
      appState.setCurrentFile(mockHandle);
      expect(appState.currentFileHandle).toBe(mockHandle);
      expect(appState.getCurrentFile()).toBe(mockHandle);
    });

    it('should update current filename', () => {
      appState.setCurrentFilename('test.md');
      expect(appState.currentFilename).toBe('test.md');
      expect(appState.getCurrentFilename()).toBe('test.md');
    });

    it('should update current directory handle', () => {
      const mockDir = { name: 'src' };
      appState.setCurrentDirHandle(mockDir);
      expect(appState.currentDirHandle).toBe(mockDir);
    });

    it('should update root directory handle', () => {
      const mockRoot = { name: 'project' };
      appState.setRootDirHandle(mockRoot);
      expect(appState.rootDirHandle).toBe(mockRoot);
    });

    it('should update current path', () => {
      const path = [{ name: 'src' }, { name: 'components' }];
      appState.setCurrentPath(path);
      expect(appState.currentPath).toEqual(path);
      expect(appState.getCurrentPath()).toEqual(path);
    });
  });

  describe('dirty state management', () => {
    it('should mark dirty state', () => {
      appState.markDirty(true);
      expect(appState.isDirty).toBe(true);
      expect(appState.isDirtyState()).toBe(true);
    });

    it('should clear dirty state', () => {
      appState.markDirty(true);
      appState.markDirty(false);
      expect(appState.isDirty).toBe(false);
    });

    it('should mark dirty by default when called without argument', () => {
      appState.markDirty();
      expect(appState.isDirty).toBe(true);
    });

    it('should track original content', () => {
      const content = 'original content';
      appState.setOriginalContent(content);
      expect(appState.originalContent).toBe(content);
      expect(appState.getOriginalContent()).toBe(content);
    });
  });

  describe('editor state management', () => {
    it('should set editor view', () => {
      const mockEditor = { state: 'mock' };
      appState.setEditor(mockEditor);
      expect(appState.editorView).toBe(mockEditor);
      expect(appState.getEditor()).toBe(mockEditor);
    });

    it('should set editor manager', () => {
      const mockManager = { type: 'markdown' };
      appState.setEditorManager(mockManager);
      expect(appState.editorManager).toBe(mockManager);
      expect(appState.getEditorManager()).toBe(mockManager);
    });
  });

  describe('navigation history', () => {
    it('should add entries to navigation history', () => {
      const entry = { path: [], filename: 'test.js' };
      appState.addToNavigationHistory(entry);
      expect(appState.navigationHistory).toHaveLength(1);
      expect(appState.navigationHistory[0]).toBe(entry);
    });

    it('should update history index', () => {
      appState.setHistoryIndex(5);
      expect(appState.historyIndex).toBe(5);
      expect(appState.getHistoryIndex()).toBe(5);
    });

    it('should track pop state navigation', () => {
      appState.setPopStateNavigation(true);
      expect(appState.isPopStateNavigation).toBe(true);
    });

    it('should clear navigation history', () => {
      appState.addToNavigationHistory({ path: [], filename: 'test1.js' });
      appState.addToNavigationHistory({ path: [], filename: 'test2.js' });
      appState.setHistoryIndex(1);

      appState.clearNavigationHistory();

      expect(appState.navigationHistory).toEqual([]);
      expect(appState.historyIndex).toBe(-1);
    });

    it('should return navigation history', () => {
      const entry1 = { path: [], filename: 'test1.js' };
      const entry2 = { path: [], filename: 'test2.js' };
      appState.addToNavigationHistory(entry1);
      appState.addToNavigationHistory(entry2);

      const history = appState.getNavigationHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toBe(entry1);
      expect(history[1]).toBe(entry2);
    });
  });

  describe('autosave state', () => {
    it('should enable autosave', () => {
      appState.setAutosaveEnabled(true);
      expect(appState.autosaveEnabled).toBe(true);
      expect(appState.isAutosaveEnabled()).toBe(true);
    });

    it('should disable autosave', () => {
      appState.setAutosaveEnabled(false);
      expect(appState.autosaveEnabled).toBe(false);
      expect(appState.isAutosaveEnabled()).toBe(false);
    });

    it('should set autosave interval', () => {
      const interval = 123;
      appState.setAutosaveInterval(interval);
      expect(appState.autosaveInterval).toBe(interval);
    });
  });

  describe('session restoration', () => {
    it('should track session restoration status', () => {
      appState.setRestoringSession(true);
      expect(appState.isRestoringSession).toBe(true);

      appState.setRestoringSession(false);
      expect(appState.isRestoringSession).toBe(false);
    });

    it('should track last restoration time', () => {
      const time = Date.now();
      appState.setLastRestorationTime(time);
      expect(appState.lastRestorationTime).toBe(time);
    });
  });

  describe('reset methods', () => {
    it('should reset basic file state', () => {
      appState.markDirty(true);
      appState.setCurrentFile({ name: 'test.js' });
      appState.setCurrentFilename('test.js');
      appState.setOriginalContent('content');

      appState.reset();

      expect(appState.isDirty).toBe(false);
      expect(appState.currentFileHandle).toBeNull();
      expect(appState.currentFilename).toBe('untitled');
      expect(appState.originalContent).toBe('');
    });

    it('should reset all state', () => {
      // Set various state
      appState.setEditor({ state: 'editor' });
      appState.setEditorManager({ state: 'manager' });
      appState.markDirty(true);
      appState.setCurrentFile({ name: 'test.js' });
      appState.setCurrentFilename('test.js');
      appState.setCurrentDirHandle({ name: 'dir' });
      appState.setRootDirHandle({ name: 'root' });
      appState.setCurrentPath([{ name: 'src' }]);
      appState.addToNavigationHistory({ path: [], filename: 'test.js' });
      appState.setHistoryIndex(0);
      appState.setPopStateNavigation(true);
      appState.setAutosaveInterval(123);
      appState.setRestoringSession(true);
      appState.setLastRestorationTime(Date.now());

      appState.resetAll();

      expect(appState.editorView).toBeNull();
      expect(appState.editorManager).toBeNull();
      expect(appState.isDirty).toBe(false);
      expect(appState.currentFileHandle).toBeNull();
      expect(appState.currentFilename).toBe('untitled');
      expect(appState.currentDirHandle).toBeNull();
      expect(appState.rootDirHandle).toBeNull();
      expect(appState.currentPath).toEqual([]);
      expect(appState.navigationHistory).toEqual([]);
      expect(appState.historyIndex).toBe(-1);
      expect(appState.isPopStateNavigation).toBe(false);
      expect(appState.autosaveInterval).toBeNull();
      expect(appState.isRestoringSession).toBe(false);
      expect(appState.lastRestorationTime).toBe(0);
    });
  });
});
