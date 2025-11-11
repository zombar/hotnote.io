import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addToHistory,
  updateNavigationButtons,
  pathToUrlParam,
  urlParamToPath,
  goBack,
  goForward,
  goFolderUp,
  handlePopState,
} from '../../src/navigation/history-manager.js';
import { appState } from '../../src/state/app-state.js';
import { createMockFileHandle, createMockDirectoryHandle } from '../mocks/filesystem.js';

describe('History Manager', () => {
  let mockCallbacks;

  beforeEach(() => {
    // Reset app state
    appState.navigationHistory = [];
    appState.historyIndex = -1;
    appState.currentPath = [];
    appState.currentDirHandle = null;
    appState.currentFileHandle = null;
    appState.currentFilename = '';
    appState.isDirty = false;
    appState.isPopStateNavigation = false;

    // Mock DOM elements
    document.body.innerHTML = `
      <button id="back-btn"></button>
      <button id="forward-btn"></button>
      <button id="folder-up-btn"></button>
    `;

    // Mock callbacks
    mockCallbacks = {
      saveTempChanges: vi.fn(),
      loadTempChanges: vi.fn(() => null),
      initEditor: vi.fn(),
      updateBreadcrumb: vi.fn(),
      updateLogoState: vi.fn(),
      hideFilePicker: vi.fn(),
      showFilePicker: vi.fn(),
      getFilePathKey: vi.fn(() => 'test-key'),
      restoreEditorState: vi.fn(),
      isMarkdownFile: vi.fn(() => false),
      captureEditorState: vi.fn(() => ({ cursor: 0, scroll: 0 })),
    };

    // Mock window.history and location
    global.window = {
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      location: {
        pathname: '/',
        search: '',
        href: 'http://localhost/',
        origin: 'http://localhost',
      },
    };
  });

  describe('addToHistory', () => {
    it('should add entry to navigation history', () => {
      appState.currentPath = [{ name: 'src' }];
      appState.currentFilename = 'test.js';

      addToHistory({});

      expect(appState.navigationHistory).toHaveLength(1);
      expect(appState.navigationHistory[0].filename).toBe('test.js');
      expect(appState.navigationHistory[0].path).toEqual([{ name: 'src' }]);
    });

    it('should update history index', () => {
      addToHistory({});

      expect(appState.historyIndex).toBe(0);
    });

    it('should remove forward history when adding new entry', () => {
      addToHistory({});
      addToHistory({});
      addToHistory({});

      // Go back twice
      appState.historyIndex = 0;

      // Add new entry
      addToHistory({});

      expect(appState.navigationHistory).toHaveLength(2);
    });

    it('should capture editor state if available', () => {
      const mockFileHandle = createMockFileHandle('test.js', 'content');
      appState.currentFileHandle = mockFileHandle;

      const captureEditorState = vi.fn(() => ({ cursor: 10, scroll: 50 }));

      addToHistory({ captureEditorState });

      expect(captureEditorState).toHaveBeenCalled();
      expect(appState.navigationHistory[0].editorState).toEqual({ cursor: 10, scroll: 50 });
    });

    it('should sync with browser history', () => {
      appState.currentPath = [{ name: 'src' }];
      appState.currentFilename = 'app.js';

      addToHistory({});

      expect(window.history.pushState).toHaveBeenCalled();
    });

    it('should not sync with browser history during popstate navigation', () => {
      appState.isPopStateNavigation = true;

      addToHistory({});

      expect(window.history.pushState).not.toHaveBeenCalled();
    });

    it('should store directory handle', () => {
      const mockDir = createMockDirectoryHandle('test', {});
      appState.currentDirHandle = mockDir;

      addToHistory({});

      expect(appState.navigationHistory[0].dirHandle).toBe(mockDir);
    });

    it('should store file handle', () => {
      const mockFile = createMockFileHandle('test.js');
      appState.currentFileHandle = mockFile;

      addToHistory({});

      expect(appState.navigationHistory[0].fileHandle).toBe(mockFile);
    });
  });

  describe('updateNavigationButtons', () => {
    it('should disable back button when at start', () => {
      appState.historyIndex = 0;

      updateNavigationButtons();

      expect(document.getElementById('back-btn').disabled).toBe(true);
    });

    it('should enable back button when history available', () => {
      appState.navigationHistory = [{}, {}];
      appState.historyIndex = 1;

      updateNavigationButtons();

      expect(document.getElementById('back-btn').disabled).toBe(false);
    });

    it('should disable forward button when at end', () => {
      appState.navigationHistory = [{}, {}];
      appState.historyIndex = 1;

      updateNavigationButtons();

      expect(document.getElementById('forward-btn').disabled).toBe(true);
    });

    it('should enable forward button when forward history available', () => {
      appState.navigationHistory = [{}, {}, {}];
      appState.historyIndex = 1;

      updateNavigationButtons();

      expect(document.getElementById('forward-btn').disabled).toBe(false);
    });

    it('should disable folder-up button when at root', () => {
      appState.currentPath = [];

      updateNavigationButtons();

      expect(document.getElementById('folder-up-btn').disabled).toBe(true);
    });

    it('should enable folder-up button when in subfolder', () => {
      appState.currentPath = [{ name: 'src' }];

      updateNavigationButtons();

      expect(document.getElementById('folder-up-btn').disabled).toBe(false);
    });

    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = '';

      expect(() => updateNavigationButtons()).not.toThrow();
    });
  });

  describe('pathToUrlParam', () => {
    it('should convert path to URL parameter', () => {
      appState.currentPath = [{ name: 'src' }, { name: 'components' }];
      appState.currentFilename = 'App.js';

      const result = pathToUrlParam();

      expect(result).toBe('./src/components/App.js');
    });

    it('should handle empty path', () => {
      appState.currentPath = [];

      const result = pathToUrlParam();

      expect(result).toBe('');
    });

    it('should handle path without filename', () => {
      appState.currentPath = [{ name: 'src' }];
      appState.currentFilename = '';

      const result = pathToUrlParam();

      expect(result).toBe('./src');
    });

    it('should encode special characters', () => {
      appState.currentPath = [{ name: 'my folder' }];
      appState.currentFilename = 'file (1).js';

      const result = pathToUrlParam();

      expect(result).toContain('my%20folder');
      expect(result).toContain('file%20(1).js');
    });

    it('should handle single folder', () => {
      appState.currentPath = [{ name: 'docs' }];

      const result = pathToUrlParam();

      expect(result).toBe('./docs');
    });

    it('should handle deeply nested path', () => {
      appState.currentPath = [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }];

      const result = pathToUrlParam();

      expect(result).toBe('./a/b/c/d');
    });
  });

  describe('urlParamToPath', () => {
    it('should parse URL parameter to path', () => {
      const result = urlParamToPath('./src/components/App.js');

      expect(result).toEqual(['src', 'components', 'App.js']);
    });

    it('should handle empty parameter', () => {
      const result = urlParamToPath('');

      expect(result).toEqual([]);
    });

    it('should handle root path', () => {
      expect(urlParamToPath('/')).toEqual([]);
      expect(urlParamToPath('./')).toEqual([]);
    });

    it('should handle path with leading slash', () => {
      const result = urlParamToPath('/src/app.js');

      expect(result).toEqual(['src', 'app.js']);
    });

    it('should handle path with leading ./', () => {
      const result = urlParamToPath('./src/app.js');

      expect(result).toEqual(['src', 'app.js']);
    });

    it('should filter empty segments', () => {
      const result = urlParamToPath('./src//app.js');

      expect(result).toEqual(['src', 'app.js']);
    });
  });

  describe('goBack', () => {
    it('should do nothing if at start of history', async () => {
      appState.historyIndex = 0;

      await goBack(mockCallbacks);

      expect(appState.historyIndex).toBe(0);
    });

    it('should decrement history index', async () => {
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 1;

      await goBack(mockCallbacks);

      expect(appState.historyIndex).toBe(0);
    });

    it('should save temp changes if file is dirty', async () => {
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 1;
      appState.isDirty = true;
      appState.currentFileHandle = createMockFileHandle('test.js');

      await goBack(mockCallbacks);

      expect(mockCallbacks.saveTempChanges).toHaveBeenCalled();
    });

    it('should restore path from history', async () => {
      appState.navigationHistory = [
        { path: [{ name: 'src' }], dirHandle: null, fileHandle: null, filename: '' },
        { path: [{ name: 'tests' }], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 1;

      await goBack(mockCallbacks);

      expect(appState.currentPath).toEqual([{ name: 'src' }]);
    });

    it('should call updateBreadcrumb callback', async () => {
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 1;

      await goBack(mockCallbacks);

      expect(mockCallbacks.updateBreadcrumb).toHaveBeenCalled();
    });

    it('should call updateLogoState callback', async () => {
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 1;

      await goBack(mockCallbacks);

      expect(mockCallbacks.updateLogoState).toHaveBeenCalled();
    });

    it('should not update browser history (handled by browser)', async () => {
      // After refactor: goBack() no longer updates browser history
      // Browser history is updated by window.history.back() in app.js,
      // which triggers popstate event that calls goBack()
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 1;

      await goBack(mockCallbacks);

      // goBack() should NOT update browser history - that's handled by browser
      expect(window.history.replaceState).not.toHaveBeenCalled();
    });
  });

  describe('goForward', () => {
    it('should do nothing if at end of history', async () => {
      appState.navigationHistory = [{}];
      appState.historyIndex = 0;

      await goForward(mockCallbacks);

      expect(appState.historyIndex).toBe(0);
    });

    it('should increment history index', async () => {
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 0;

      await goForward(mockCallbacks);

      expect(appState.historyIndex).toBe(1);
    });

    it('should save temp changes if file is dirty', async () => {
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 0;
      appState.isDirty = true;
      appState.currentFileHandle = createMockFileHandle('test.js');

      await goForward(mockCallbacks);

      expect(mockCallbacks.saveTempChanges).toHaveBeenCalled();
    });

    it('should restore path from history', async () => {
      appState.navigationHistory = [
        { path: [{ name: 'src' }], dirHandle: null, fileHandle: null, filename: '' },
        { path: [{ name: 'tests' }], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 0;

      await goForward(mockCallbacks);

      expect(appState.currentPath).toEqual([{ name: 'tests' }]);
    });

    it('should call updateBreadcrumb callback', async () => {
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 0;

      await goForward(mockCallbacks);

      expect(mockCallbacks.updateBreadcrumb).toHaveBeenCalled();
    });
  });

  describe('goFolderUp', () => {
    it('should do nothing if at root', async () => {
      appState.currentPath = [];

      await goFolderUp(mockCallbacks);

      expect(appState.currentPath).toEqual([]);
    });

    it('should remove last path segment', async () => {
      appState.currentPath = [{ name: 'src' }, { name: 'components' }];

      await goFolderUp(mockCallbacks);

      expect(appState.currentPath).toEqual([{ name: 'src' }]);
    });

    it('should clear current file', async () => {
      appState.currentPath = [{ name: 'src' }];
      appState.currentFileHandle = createMockFileHandle('test.js');
      appState.currentFilename = 'test.js';

      await goFolderUp(mockCallbacks);

      expect(appState.currentFileHandle).toBeNull();
      expect(appState.currentFilename).toBe('');
    });

    it('should save temp changes if file is dirty', async () => {
      appState.currentPath = [{ name: 'src' }];
      appState.isDirty = true;
      appState.currentFileHandle = createMockFileHandle('test.js');

      await goFolderUp(mockCallbacks);

      expect(mockCallbacks.saveTempChanges).toHaveBeenCalled();
    });

    it('should call initEditor with empty content', async () => {
      appState.currentPath = [{ name: 'src' }];

      await goFolderUp(mockCallbacks);

      expect(mockCallbacks.initEditor).toHaveBeenCalledWith('', 'untitled');
    });

    it('should call showFilePicker if directory handle exists', async () => {
      appState.currentPath = [{ name: 'src' }];
      appState.currentDirHandle = createMockDirectoryHandle('test', {});

      await goFolderUp(mockCallbacks);

      expect(mockCallbacks.showFilePicker).toHaveBeenCalled();
    });
  });

  describe('handlePopState', () => {
    it('should do nothing if event has no state', async () => {
      const event = { state: null };

      await handlePopState(event, mockCallbacks);

      expect(mockCallbacks.updateBreadcrumb).not.toHaveBeenCalled();
    });

    it('should do nothing if event state is not app history', async () => {
      const event = { state: { someOtherState: true } };

      await handlePopState(event, mockCallbacks);

      expect(mockCallbacks.updateBreadcrumb).not.toHaveBeenCalled();
    });

    it('should set isPopStateNavigation flag', async () => {
      appState.navigationHistory = [
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
        { path: [], dirHandle: null, fileHandle: null, filename: '' },
      ];
      appState.historyIndex = 2;

      const event = {
        state: {
          appHistory: true,
          historyIndex: 1,
        },
      };

      await handlePopState(event, mockCallbacks);

      expect(appState.isPopStateNavigation).toBe(false); // Should be reset after
    });
  });
});
