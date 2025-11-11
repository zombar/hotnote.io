/* global MouseEvent, KeyboardEvent */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  showFilePicker,
  hideFilePicker,
  initFilePickerResize,
  quickFileCreate,
  createOrOpenFile,
  newFile,
  setupFilePickerClickAway,
} from '../../src/ui/file-picker.js';
import { appState } from '../../src/state/app-state.js';
import { FileSystemAdapter } from '../../src/fs/filesystem-adapter.js';
import { createMockFileHandle, createMockDirectoryHandle } from '../mocks/filesystem.js';

describe('File Picker', () => {
  let filePickerElement;
  let resizeHandleElement;
  let breadcrumbElement;

  beforeEach(() => {
    // Setup DOM elements
    filePickerElement = document.createElement('div');
    filePickerElement.id = 'file-picker';
    filePickerElement.classList.add('hidden');
    document.body.appendChild(filePickerElement);

    resizeHandleElement = document.createElement('div');
    resizeHandleElement.id = 'file-picker-resize-handle';
    resizeHandleElement.classList.add('hidden');
    document.body.appendChild(resizeHandleElement);

    breadcrumbElement = document.createElement('div');
    breadcrumbElement.id = 'breadcrumb';
    document.body.appendChild(breadcrumbElement);

    const header = document.createElement('header');
    document.body.appendChild(header);

    // Mock window functions
    window.alert = vi.fn();
    window.confirm = vi.fn();

    // Reset app state
    appState.currentPath = [];
    appState.currentFilename = '';
    appState.currentFileHandle = null;
    appState.currentDirHandle = null;
    appState.isDirty = false;
    appState.originalContent = '';
    appState.editorView = null;

    // Mock focus manager
    appState.focusManager = {
      focusEditor: vi.fn(),
      saveFocusState: vi.fn(),
    };

    // Mock file sync manager
    window.fileSyncManager = {
      pause: vi.fn(),
      resume: vi.fn(),
    };

    // Mock trash manager
    window.trashManager = {
      moveToTrash: vi.fn().mockResolvedValue(undefined),
      showUndoSnackbar: vi.fn(),
    };

    // Mock global functions
    window.initEditor = vi.fn().mockResolvedValue(undefined);
    window.updateLogoState = vi.fn();
    window.isFileSystemAccessSupported = vi.fn().mockReturnValue(true);
    window.openFolder = vi.fn().mockResolvedValue(undefined);

    // Clear localStorage
    localStorage.clear();

    // Mock FileSystemAdapter methods
    vi.spyOn(FileSystemAdapter, 'listDirectory').mockResolvedValue([]);
    vi.spyOn(FileSystemAdapter, 'readFile').mockResolvedValue('');
    vi.spyOn(FileSystemAdapter, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(FileSystemAdapter, 'getFileMetadata').mockResolvedValue({
      lastModified: Date.now(),
    });
  });

  afterEach(() => {
    if (document.body.contains(filePickerElement)) {
      document.body.removeChild(filePickerElement);
    }
    if (document.body.contains(resizeHandleElement)) {
      document.body.removeChild(resizeHandleElement);
    }
    if (document.body.contains(breadcrumbElement)) {
      document.body.removeChild(breadcrumbElement);
    }
    const header = document.querySelector('header');
    if (header) {
      document.body.removeChild(header);
    }
    vi.restoreAllMocks();
  });

  describe('showFilePicker', () => {
    it('should show the file picker', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);

      await showFilePicker(mockDirHandle);

      expect(filePickerElement.classList.contains('hidden')).toBe(false);
      expect(resizeHandleElement.classList.contains('hidden')).toBe(false);
    });

    it('should pause file sync manager when showing picker', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);

      await showFilePicker(mockDirHandle);

      expect(window.fileSyncManager.pause).toHaveBeenCalled();
    });

    it('should display files from directory', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', [
        { kind: 'file', name: 'test1.js', content: '' },
        { kind: 'file', name: 'test2.md', content: '' },
      ]);
      FileSystemAdapter.listDirectory.mockResolvedValue([
        { kind: 'file', name: 'test1.js', getFile: async () => ({ size: 100 }) },
        { kind: 'file', name: 'test2.md', getFile: async () => ({ size: 200 }) },
      ]);

      await showFilePicker(mockDirHandle);

      const fileItems = filePickerElement.querySelectorAll('.file-item');
      expect(fileItems.length).toBe(2);
    });

    it('should sort directories before files', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      FileSystemAdapter.listDirectory.mockResolvedValue([
        { kind: 'file', name: 'aaa.js', getFile: async () => ({ size: 100 }) },
        { kind: 'directory', name: 'zzz' },
        { kind: 'file', name: 'bbb.js', getFile: async () => ({ size: 200 }) },
      ]);

      await showFilePicker(mockDirHandle);

      const fileItems = filePickerElement.querySelectorAll('.file-item');
      expect(fileItems[0].classList.contains('is-directory')).toBe(true);
    });

    it('should display file sizes', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      FileSystemAdapter.listDirectory.mockResolvedValue([
        { kind: 'file', name: 'small.txt', getFile: async () => ({ size: 500 }) },
        {
          kind: 'file',
          name: 'large.txt',
          getFile: async () => ({ size: 1024 * 500 }),
        },
      ]);

      await showFilePicker(mockDirHandle);

      const metadata = filePickerElement.querySelectorAll('.file-item-metadata');
      expect(metadata.length).toBe(2);
    });

    it('should show delete button for files', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      FileSystemAdapter.listDirectory.mockResolvedValue([
        { kind: 'file', name: 'test.txt', getFile: async () => ({ size: 100 }) },
      ]);

      await showFilePicker(mockDirHandle);

      const deleteBtn = filePickerElement.querySelector('.file-item-delete');
      expect(deleteBtn).toBeTruthy();
    });

    it('should not show delete button for directories', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      FileSystemAdapter.listDirectory.mockResolvedValue([{ kind: 'directory', name: 'subdir' }]);

      await showFilePicker(mockDirHandle);

      const deleteBtn = filePickerElement.querySelector('.file-item-delete');
      expect(deleteBtn).toBeFalsy();
    });

    it('should handle empty directory', async () => {
      const mockDirHandle = createMockDirectoryHandle('empty-dir', []);
      FileSystemAdapter.listDirectory.mockResolvedValue([]);

      await showFilePicker(mockDirHandle);

      const fileItems = filePickerElement.querySelectorAll('.file-item');
      expect(fileItems.length).toBe(0);
    });

    it('should clear current file and save to previous when showing picker', async () => {
      // Setup: user has a file open
      const openFile = createMockFileHandle('important.js', 'content');
      appState.currentFileHandle = openFile;
      appState.currentFilename = 'important.js';

      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      FileSystemAdapter.listDirectory.mockResolvedValue([]);

      await showFilePicker(mockDirHandle);

      // File should be cleared when picker is shown
      expect(appState.currentFileHandle).toBeNull();
      expect(appState.currentFilename).toBe('');

      // But saved to previous for restoration
      expect(appState.previousFileHandle).toBe(openFile);
      expect(appState.previousFilename).toBe('important.js');
    });

    it('should not save to previous if no file was open', async () => {
      // Setup: no file open
      appState.currentFileHandle = null;
      appState.currentFilename = '';
      appState.previousFileHandle = null;
      appState.previousFilename = '';

      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      FileSystemAdapter.listDirectory.mockResolvedValue([]);

      await showFilePicker(mockDirHandle);

      // Should remain null
      expect(appState.previousFileHandle).toBeNull();
      expect(appState.previousFilename).toBe('');
    });
  });

  describe('hideFilePicker', () => {
    it('should hide the file picker', () => {
      filePickerElement.classList.remove('hidden');
      resizeHandleElement.classList.remove('hidden');

      hideFilePicker();

      expect(filePickerElement.classList.contains('hidden')).toBe(true);
      expect(resizeHandleElement.classList.contains('hidden')).toBe(true);
    });

    it('should resume file sync manager when hiding picker', () => {
      hideFilePicker();

      expect(window.fileSyncManager.resume).toHaveBeenCalled();
    });

    it('should focus editor if file is open', () => {
      appState.currentFileHandle = createMockFileHandle('test.txt', '');

      hideFilePicker();

      expect(appState.focusManager.focusEditor).toHaveBeenCalledWith({
        delay: 50,
        reason: 'picker-hidden',
      });
    });

    it('should not focus editor if no file is open', () => {
      appState.currentFileHandle = null;

      hideFilePicker();

      expect(appState.focusManager.focusEditor).not.toHaveBeenCalled();
    });

    it('should restore previous file if picker closed without selection', () => {
      // Setup: user had a file open, then navigated breadcrumb
      const savedFile = createMockFileHandle('important.js', 'content');
      appState.previousFileHandle = savedFile;
      appState.previousFilename = 'important.js';
      appState.currentFileHandle = null; // Cleared by breadcrumb navigation
      appState.currentFilename = '';

      hideFilePicker();

      // Should restore the previous file
      expect(appState.currentFileHandle).toBe(savedFile);
      expect(appState.currentFilename).toBe('important.js');
      // Should clear the previous state
      expect(appState.previousFileHandle).toBeNull();
      expect(appState.previousFilename).toBe('');
    });

    it('should not restore if a new file was selected', () => {
      // Setup: user had a file open, then selected a different file
      appState.previousFileHandle = createMockFileHandle('old.js', 'old content');
      appState.previousFilename = 'old.js';
      appState.currentFileHandle = createMockFileHandle('new.js', 'new content');
      appState.currentFilename = 'new.js';

      hideFilePicker();

      // Should keep the newly selected file
      expect(appState.currentFilename).toBe('new.js');
      // Should clear the previous state
      expect(appState.previousFileHandle).toBeNull();
      expect(appState.previousFilename).toBe('');
    });

    it('should not restore if there was no previous file', () => {
      // Setup: no file was open before
      appState.previousFileHandle = null;
      appState.previousFilename = '';
      appState.currentFileHandle = null;
      appState.currentFilename = '';

      hideFilePicker();

      // Should remain empty
      expect(appState.currentFileHandle).toBeNull();
      expect(appState.currentFilename).toBe('');
    });

    it('should restore previous path if picker closed without selection', () => {
      // Setup: user had a path, navigated breadcrumb to shallower path
      const savedFile = createMockFileHandle('important.js', 'content');
      const originalPath = [{ name: 'root' }, { name: 'src' }, { name: 'components' }];
      appState.previousFileHandle = savedFile;
      appState.previousFilename = 'important.js';
      appState.previousPath = originalPath;
      appState.currentPath = [{ name: 'root' }]; // Truncated by breadcrumb navigation
      appState.currentFileHandle = null;
      appState.currentFilename = '';

      hideFilePicker();

      // Should restore the previous path
      expect(appState.currentPath).toEqual(originalPath);
      expect(appState.currentPath).toHaveLength(3);
      // Should clear the previous state
      expect(appState.previousPath).toBeNull();
    });

    it('should not restore path if new file was selected', () => {
      // Setup: user navigated breadcrumb, then selected a file
      appState.previousPath = [{ name: 'root' }, { name: 'src' }, { name: 'components' }];
      appState.currentPath = [{ name: 'root' }];
      appState.currentFileHandle = createMockFileHandle('new.js', 'new content');
      appState.currentFilename = 'new.js';

      hideFilePicker();

      // Should keep the new path (where the file was selected)
      expect(appState.currentPath).toHaveLength(1);
      expect(appState.currentPath[0].name).toBe('root');
      // Should clear the previous state
      expect(appState.previousPath).toBeNull();
    });

    it('should not restore path if there was no previous path', () => {
      // Setup: no path was saved
      appState.previousPath = null;
      appState.currentPath = [{ name: 'root' }];
      appState.currentFileHandle = null;
      appState.currentFilename = '';

      hideFilePicker();

      // Should remain as is
      expect(appState.currentPath).toHaveLength(1);
      expect(appState.previousPath).toBeNull();
    });
  });

  describe('initFilePickerResize', () => {
    it('should initialize resize functionality', () => {
      initFilePickerResize();

      // Check that CSS variable is set
      const heightVar = document.documentElement.style.getPropertyValue('--file-picker-height');
      expect(heightVar).toBeTruthy();
    });

    it('should load saved height from localStorage', () => {
      localStorage.setItem('filePickerHeight', '400');

      initFilePickerResize();

      const heightVar = document.documentElement.style.getPropertyValue('--file-picker-height');
      expect(heightVar).toBe('400px');
    });

    it('should use default height when no saved value', () => {
      initFilePickerResize();

      const heightVar = document.documentElement.style.getPropertyValue('--file-picker-height');
      expect(heightVar).toBe('300px');
    });

    it('should handle mousedown on resize handle', () => {
      initFilePickerResize();

      const mouseDownEvent = new MouseEvent('mousedown', {
        clientY: 100,
        bubbles: true,
      });
      resizeHandleElement.dispatchEvent(mouseDownEvent);

      expect(resizeHandleElement.classList.contains('dragging')).toBe(true);
    });

    it('should update height on mousemove while dragging', () => {
      initFilePickerResize();

      // Start drag
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientY: 300,
        bubbles: true,
      });
      resizeHandleElement.dispatchEvent(mouseDownEvent);

      // Move mouse
      const mouseMoveEvent = new MouseEvent('mousemove', {
        clientY: 350,
        bubbles: true,
      });
      document.dispatchEvent(mouseMoveEvent);

      const heightVar = document.documentElement.style.getPropertyValue('--file-picker-height');
      expect(heightVar).toBeTruthy();
    });

    it('should stop dragging on mouseup', () => {
      initFilePickerResize();

      // Start drag
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientY: 300,
        bubbles: true,
      });
      resizeHandleElement.dispatchEvent(mouseDownEvent);

      // Release
      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      expect(resizeHandleElement.classList.contains('dragging')).toBe(false);
    });

    it('should enforce minimum height constraint', () => {
      initFilePickerResize();

      // Start drag
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientY: 200,
        bubbles: true,
      });
      resizeHandleElement.dispatchEvent(mouseDownEvent);

      // Try to drag below minimum
      const mouseMoveEvent = new MouseEvent('mousemove', {
        clientY: 50,
        bubbles: true,
      });
      document.dispatchEvent(mouseMoveEvent);

      const heightVar = document.documentElement.style.getPropertyValue('--file-picker-height');
      const height = parseInt(heightVar);
      expect(height).toBeGreaterThanOrEqual(100);
    });
  });

  describe('quickFileCreate', () => {
    it('should return early if no directory handle', async () => {
      appState.currentDirHandle = null;

      await quickFileCreate('t');

      expect(FileSystemAdapter.listDirectory).not.toHaveBeenCalled();
    });

    it('should show filename input with initial character', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      appState.currentDirHandle = mockDirHandle;
      FileSystemAdapter.listDirectory.mockResolvedValue([]);

      // Simulate input and immediate cancel (Escape)
      const promise = quickFileCreate('t');
      await new Promise((resolve) => setTimeout(resolve, 10));

      const input = document.querySelector('.breadcrumb-input');
      expect(input).toBeTruthy();
      expect(input.value).toBe('t');

      // Cancel
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      input.dispatchEvent(escapeEvent);

      await promise;
    });

    it('should list existing files for autocomplete', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      appState.currentDirHandle = mockDirHandle;
      FileSystemAdapter.listDirectory.mockResolvedValue([
        { kind: 'file', name: 'test1.txt' },
        { kind: 'file', name: 'test2.txt' },
      ]);

      // Start quick file create and cancel immediately
      const promise = quickFileCreate('');
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(FileSystemAdapter.listDirectory).toHaveBeenCalledWith(mockDirHandle);

      // Cancel
      const input = document.querySelector('.breadcrumb-input');
      if (input) {
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        input.dispatchEvent(escapeEvent);
      }

      await promise;
    });
  });

  describe('createOrOpenFile', () => {
    it('should create a new file', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      const mockFileHandle = createMockFileHandle('newfile.txt', '');
      appState.currentDirHandle = mockDirHandle;

      mockDirHandle.getFileHandle = vi.fn().mockResolvedValue(mockFileHandle);

      await createOrOpenFile('newfile.txt');

      expect(appState.currentFilename).toBe('newfile.txt');
      expect(appState.currentFileHandle).toBe(mockFileHandle);
    });

    it('should open an existing file', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      const mockFileHandle = createMockFileHandle('existing.txt', 'existing content');
      appState.currentDirHandle = mockDirHandle;

      // Mock: first check if it's a directory (fails), then check if file exists (succeeds)
      mockDirHandle.getDirectoryHandle = vi.fn().mockRejectedValue(new Error('not a directory'));
      mockDirHandle.getFileHandle = vi.fn().mockResolvedValue(mockFileHandle);
      FileSystemAdapter.readFile.mockResolvedValue('existing content');

      await createOrOpenFile('existing.txt');

      expect(appState.currentFilename).toBe('existing.txt');
      expect(window.initEditor).toHaveBeenCalledWith('existing content', 'existing.txt');
    });

    it('should handle paths with subdirectories', async () => {
      const mockRootDir = createMockDirectoryHandle('root', []);
      const mockSubDir = createMockDirectoryHandle('subdir', []);
      const mockFileHandle = createMockFileHandle('file.txt', '');
      appState.currentDirHandle = mockRootDir;
      appState.currentPath = [];

      mockRootDir.getDirectoryHandle = vi.fn().mockResolvedValue(mockSubDir);
      mockSubDir.getFileHandle = vi.fn().mockResolvedValue(mockFileHandle);

      await createOrOpenFile('subdir/file.txt');

      expect(appState.currentPath.length).toBe(1);
      expect(appState.currentPath[0].name).toBe('subdir');
      expect(appState.currentFilename).toBe('file.txt');
    });

    it('should navigate to directory if target is a directory', async () => {
      const mockDirHandle = createMockDirectoryHandle('parent', []);
      const mockSubDir = createMockDirectoryHandle('subdir', []);
      appState.currentDirHandle = mockDirHandle;
      appState.currentPath = [];

      mockDirHandle.getDirectoryHandle = vi.fn().mockResolvedValue(mockSubDir);

      await createOrOpenFile('subdir');

      expect(appState.currentPath.length).toBe(1);
      expect(appState.currentPath[0].name).toBe('subdir');
      expect(appState.currentDirHandle).toBe(mockSubDir);
    });

    it('should alert if directory not found', async () => {
      const mockDirHandle = createMockDirectoryHandle('root', []);
      appState.currentDirHandle = mockDirHandle;

      mockDirHandle.getDirectoryHandle = vi
        .fn()
        .mockRejectedValue(new Error('Directory not found'));

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      await createOrOpenFile('nonexistent/file.txt');

      expect(alertSpy).toHaveBeenCalledWith('Directory not found: nonexistent');
      alertSpy.mockRestore();
    });

    it('should hide file picker after opening file', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      const mockFileHandle = createMockFileHandle('test.txt', '');
      appState.currentDirHandle = mockDirHandle;
      filePickerElement.classList.remove('hidden');

      mockDirHandle.getFileHandle = vi.fn().mockResolvedValue(mockFileHandle);

      await createOrOpenFile('test.txt');

      expect(filePickerElement.classList.contains('hidden')).toBe(true);
    });

    it('should focus editor after opening file', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      const mockFileHandle = createMockFileHandle('test.txt', '');
      appState.currentDirHandle = mockDirHandle;

      mockDirHandle.getFileHandle = vi.fn().mockResolvedValue(mockFileHandle);

      await createOrOpenFile('test.txt');

      expect(appState.focusManager.focusEditor).toHaveBeenCalledWith({
        delay: 100,
        reason: 'new-file',
      });
    });

    it('should restore previous state on error', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      const previousFileHandle = createMockFileHandle('previous.txt', '');
      appState.currentDirHandle = mockDirHandle;
      appState.currentFileHandle = previousFileHandle;
      appState.currentFilename = 'previous.txt';

      mockDirHandle.getFileHandle = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      await createOrOpenFile('test.txt');

      expect(appState.currentFileHandle).toBe(previousFileHandle);
      expect(appState.currentFilename).toBe('previous.txt');
      alertSpy.mockRestore();
    });
  });

  describe('newFile', () => {
    it('should show error if File System Access API not supported', async () => {
      window.isFileSystemAccessSupported.mockReturnValue(false);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      await newFile();

      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('not supported'));
      alertSpy.mockRestore();
    });

    it('should confirm before creating new file if current file is dirty', async () => {
      appState.editorView = {
        state: { doc: { toString: () => 'some content' } },
      };
      appState.isDirty = true;

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      await newFile();

      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('unsaved changes'));
      confirmSpy.mockRestore();
    });

    it('should show filename input when creating new file', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      appState.currentDirHandle = mockDirHandle;
      FileSystemAdapter.listDirectory.mockResolvedValue([]);

      // Start new file and cancel immediately
      const promise = newFile();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const input = document.querySelector('.breadcrumb-input');
      expect(input).toBeTruthy();

      // Cancel
      if (input) {
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        input.dispatchEvent(escapeEvent);
      }

      await promise;
    });

    it('should restore previous state if user cancels', async () => {
      const previousHandle = createMockFileHandle('previous.txt', '');
      appState.currentFileHandle = previousHandle;
      appState.currentFilename = 'previous.txt';
      appState.isDirty = true;
      appState.currentDirHandle = createMockDirectoryHandle('test-dir', []);
      FileSystemAdapter.listDirectory.mockResolvedValue([]);

      // Start new file and cancel
      const promise = newFile();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const input = document.querySelector('.breadcrumb-input');
      if (input) {
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        input.dispatchEvent(escapeEvent);
      }

      await promise;

      expect(appState.currentFileHandle).toBe(previousHandle);
      expect(appState.currentFilename).toBe('previous.txt');
      expect(appState.isDirty).toBe(true);
    });
  });

  describe('setupFilePickerClickAway', () => {
    it('should close picker on outside click', () => {
      setupFilePickerClickAway();
      filePickerElement.classList.remove('hidden');

      const clickEvent = new MouseEvent('click', { bubbles: true });
      document.body.dispatchEvent(clickEvent);

      expect(filePickerElement.classList.contains('hidden')).toBe(true);
    });

    it('should not close picker on inside click', () => {
      setupFilePickerClickAway();
      filePickerElement.classList.remove('hidden');

      const clickEvent = new MouseEvent('click', { bubbles: true });
      filePickerElement.dispatchEvent(clickEvent);

      expect(filePickerElement.classList.contains('hidden')).toBe(false);
    });

    it('should not close picker if already hidden', () => {
      setupFilePickerClickAway();
      filePickerElement.classList.add('hidden');

      const clickEvent = new MouseEvent('click', { bubbles: true });
      document.body.dispatchEvent(clickEvent);

      // Should remain hidden (not toggle)
      expect(filePickerElement.classList.contains('hidden')).toBe(true);
    });

    it('should not close picker when clicking resize handle', () => {
      setupFilePickerClickAway();
      filePickerElement.classList.remove('hidden');

      const clickEvent = new MouseEvent('click', { bubbles: true });
      resizeHandleElement.dispatchEvent(clickEvent);

      expect(filePickerElement.classList.contains('hidden')).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should complete full file creation workflow', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      const mockFileHandle = createMockFileHandle('newfile.txt', '');
      appState.currentDirHandle = mockDirHandle;
      appState.currentPath = [{ name: 'test-dir', handle: mockDirHandle }];

      mockDirHandle.getFileHandle = vi.fn().mockResolvedValue(mockFileHandle);
      FileSystemAdapter.listDirectory.mockResolvedValue([]);

      await createOrOpenFile('newfile.txt');

      expect(appState.currentFileHandle).toBe(mockFileHandle);
      expect(appState.currentFilename).toBe('newfile.txt');
      expect(window.initEditor).toHaveBeenCalled();
      expect(appState.focusManager.focusEditor).toHaveBeenCalled();
    });

    it('should handle delete confirmation workflow', async () => {
      const mockDirHandle = createMockDirectoryHandle('test-dir', []);
      const mockFileEntry = {
        kind: 'file',
        name: 'test.txt',
        getFile: async () => ({ size: 100 }),
      };
      appState.currentDirHandle = mockDirHandle;

      FileSystemAdapter.listDirectory.mockResolvedValue([mockFileEntry]);

      await showFilePicker(mockDirHandle);

      const deleteBtn = filePickerElement.querySelector('.file-item-delete');
      expect(deleteBtn).toBeTruthy();

      // Click delete button
      deleteBtn.click();

      // Confirmation UI should appear
      const confirmUI = filePickerElement.querySelector('.file-item-delete-confirm');
      expect(confirmUI).toBeTruthy();

      // Click confirm
      const confirmBtn = confirmUI.querySelector('.confirm');
      await confirmBtn.click();

      expect(window.trashManager.moveToTrash).toHaveBeenCalled();
    });
  });
});
