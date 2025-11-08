import { describe, it, expect, beforeEach } from 'vitest';
import { createMockCodeMirrorEditor, mockNavigationHistory } from './setup.js';
import { createMockProject } from './mocks/filesystem.js';

const createMockAppState = () => {
  return {
    currentFileHandle: null,
    currentDirHandle: null,
    currentPath: [],
    editor: null,
    isDirty: false,
    navigationHistory: mockNavigationHistory,
  };
};

describe('Navigation History Integration Tests', () => {
  let appState;
  let mockProject;

  beforeEach(() => {
    appState = createMockAppState();
    mockProject = createMockProject({
      'README.md': '# Root File',
      'file1.txt': 'File 1',
      'file2.txt': 'File 2',
      src: {
        'index.js': 'Index',
        'app.js': 'App',
        components: {
          'Header.js': 'Header',
        },
      },
    });
    appState.currentDirHandle = mockProject;
  });

  it('should push entry to history when opening file', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('README.md');

    appState.navigationHistory.push({
      type: 'file',
      handle: fileHandle,
      path: ['README.md'],
    });

    const current = appState.navigationHistory.getCurrent();
    expect(current).toBeDefined();
    expect(current.type).toBe('file');
    expect(current.handle).toBe(fileHandle);
    expect(current.path).toEqual(['README.md']);
  });

  it('should enable back navigation after visiting multiple files', async () => {
    const file1 = await appState.currentDirHandle.getFileHandle('file1.txt');
    const file2 = await appState.currentDirHandle.getFileHandle('file2.txt');

    appState.navigationHistory.push({ type: 'file', handle: file1, path: ['file1.txt'] });
    appState.navigationHistory.push({ type: 'file', handle: file2, path: ['file2.txt'] });

    expect(appState.navigationHistory.canGoBack()).toBe(true);
    expect(appState.navigationHistory.getCurrent().handle).toBe(file2);
  });

  it('should restore previous file state when navigating back', async () => {
    const file1 = await appState.currentDirHandle.getFileHandle('file1.txt');
    const file2 = await appState.currentDirHandle.getFileHandle('file2.txt');

    // Visit file1
    appState.navigationHistory.push({
      type: 'file',
      handle: file1,
      path: ['file1.txt'],
      editorContent: 'File 1 content',
    });

    // Visit file2
    appState.navigationHistory.push({
      type: 'file',
      handle: file2,
      path: ['file2.txt'],
      editorContent: 'File 2 content',
    });

    // Go back to file1
    const previous = appState.navigationHistory.back();

    expect(previous.handle).toBe(file1);
    expect(previous.editorContent).toBe('File 1 content');
  });

  it('should enable forward navigation after going back', async () => {
    const file1 = await appState.currentDirHandle.getFileHandle('file1.txt');
    const file2 = await appState.currentDirHandle.getFileHandle('file2.txt');

    appState.navigationHistory.push({ type: 'file', handle: file1, path: ['file1.txt'] });
    appState.navigationHistory.push({ type: 'file', handle: file2, path: ['file2.txt'] });

    appState.navigationHistory.back();

    expect(appState.navigationHistory.canGoForward()).toBe(true);
  });

  it('should navigate forward to restore future state', async () => {
    const file1 = await appState.currentDirHandle.getFileHandle('file1.txt');
    const file2 = await appState.currentDirHandle.getFileHandle('file2.txt');

    appState.navigationHistory.push({ type: 'file', handle: file1, path: ['file1.txt'] });
    appState.navigationHistory.push({ type: 'file', handle: file2, path: ['file2.txt'] });

    appState.navigationHistory.back();
    const next = appState.navigationHistory.forward();

    expect(next.handle).toBe(file2);
  });

  it('should clear forward history when new navigation occurs', async () => {
    const file1 = await appState.currentDirHandle.getFileHandle('file1.txt');
    const file2 = await appState.currentDirHandle.getFileHandle('file2.txt');
    const file3 = await appState.currentDirHandle.getFileHandle('README.md');

    appState.navigationHistory.push({ type: 'file', handle: file1, path: ['file1.txt'] });
    appState.navigationHistory.push({ type: 'file', handle: file2, path: ['file2.txt'] });
    appState.navigationHistory.back();

    // New navigation should clear forward stack
    appState.navigationHistory.push({ type: 'file', handle: file3, path: ['README.md'] });

    expect(appState.navigationHistory.canGoForward()).toBe(false);
  });

  it('should preserve temp storage when navigating with unsaved changes', async () => {
    const file1 = await appState.currentDirHandle.getFileHandle('file1.txt');
    const file2 = await appState.currentDirHandle.getFileHandle('file2.txt');

    // Edit file1
    const editor = createMockCodeMirrorEditor();
    editor.setContent('Modified File 1');
    localStorage.setItem('file1.txt', editor.getContent());

    // Navigate to file2
    appState.navigationHistory.push({ type: 'file', handle: file1, path: ['file1.txt'] });
    appState.navigationHistory.push({ type: 'file', handle: file2, path: ['file2.txt'] });

    // Temp storage should still have file1 changes
    expect(localStorage.getItem('file1.txt')).toBe('Modified File 1');

    // Navigate back
    appState.navigationHistory.back();
    const restored = localStorage.getItem('file1.txt');
    expect(restored).toBe('Modified File 1');
  });

  it('should navigate up directory hierarchy', async () => {
    const srcDir = await appState.currentDirHandle.getDirectoryHandle('src');
    const componentsDir = await srcDir.getDirectoryHandle('components');

    appState.navigationHistory.push({
      type: 'directory',
      handle: appState.currentDirHandle,
      path: [],
    });

    appState.navigationHistory.push({
      type: 'directory',
      handle: srcDir,
      path: ['src'],
    });

    appState.navigationHistory.push({
      type: 'directory',
      handle: componentsDir,
      path: ['src', 'components'],
    });

    // Navigate up (back)
    const parent = appState.navigationHistory.back();

    expect(parent.path).toEqual(['src']);
    expect(parent.handle).toBe(srcDir);
  });

  it('should update breadcrumb when navigating directories', async () => {
    const srcDir = await appState.currentDirHandle.getDirectoryHandle('src');

    appState.currentPath = [];
    appState.navigationHistory.push({
      type: 'directory',
      handle: appState.currentDirHandle,
      path: [],
    });

    // Navigate to src
    appState.currentPath = ['src'];
    appState.navigationHistory.push({
      type: 'directory',
      handle: srcDir,
      path: ['src'],
    });

    expect(appState.currentPath).toEqual(['src']);
  });

  it('should preserve dirty state across navigation', async () => {
    const file1 = await appState.currentDirHandle.getFileHandle('file1.txt');

    appState.isDirty = true;
    localStorage.setItem('file1.txt', 'Modified');

    appState.navigationHistory.push({ type: 'file', handle: file1, path: ['file1.txt'] });

    const file2 = await appState.currentDirHandle.getFileHandle('file2.txt');
    appState.navigationHistory.push({ type: 'file', handle: file2, path: ['file2.txt'] });

    // Go back
    appState.navigationHistory.back();

    // Check if file1 is still dirty
    const hasTempChanges = localStorage.getItem('file1.txt') !== null;
    expect(hasTempChanges).toBe(true);
  });

  it('should handle navigation with deeply nested paths', async () => {
    const srcDir = await appState.currentDirHandle.getDirectoryHandle('src');
    const componentsDir = await srcDir.getDirectoryHandle('components');
    const fileHandle = await componentsDir.getFileHandle('Header.js');

    appState.navigationHistory.push({
      type: 'directory',
      handle: appState.currentDirHandle,
      path: [],
    });

    appState.navigationHistory.push({
      type: 'directory',
      handle: srcDir,
      path: ['src'],
    });

    appState.navigationHistory.push({
      type: 'directory',
      handle: componentsDir,
      path: ['src', 'components'],
    });

    appState.navigationHistory.push({
      type: 'file',
      handle: fileHandle,
      path: ['src', 'components', 'Header.js'],
    });

    const current = appState.navigationHistory.getCurrent();
    expect(current.path).toEqual(['src', 'components', 'Header.js']);

    // Navigate back through the hierarchy
    const dir = appState.navigationHistory.back();
    expect(dir.path).toEqual(['src', 'components']);

    const parent = appState.navigationHistory.back();
    expect(parent.path).toEqual(['src']);

    const root = appState.navigationHistory.back();
    expect(root.path).toEqual([]);
  });

  it('should not allow back navigation when at beginning of history', () => {
    expect(appState.navigationHistory.canGoBack()).toBe(false);

    const result = appState.navigationHistory.back();
    expect(result).toBeNull();
  });

  it('should not allow forward navigation when at end of history', async () => {
    const file1 = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.navigationHistory.push({ type: 'file', handle: file1, path: ['file1.txt'] });

    expect(appState.navigationHistory.canGoForward()).toBe(false);

    const result = appState.navigationHistory.forward();
    expect(result).toBeNull();
  });

  it('should handle rapid navigation without losing state', async () => {
    const files = [];
    for (let i = 1; i <= 5; i++) {
      const fileHandle = await appState.currentDirHandle.getFileHandle(
        i === 1 || i === 2 ? `file${i}.txt` : 'README.md'
      );
      files.push(fileHandle);
      appState.navigationHistory.push({
        type: 'file',
        handle: fileHandle,
        path: [`file${i}`],
      });
    }

    // Rapid back navigation
    appState.navigationHistory.back();
    appState.navigationHistory.back();
    appState.navigationHistory.back();

    expect(appState.navigationHistory.canGoBack()).toBe(true);
    expect(appState.navigationHistory.canGoForward()).toBe(true);

    // Forward again
    appState.navigationHistory.forward();
    appState.navigationHistory.forward();

    expect(appState.navigationHistory.getCurrent()).toBeDefined();
  });

  it('should track file creation in navigation history', async () => {
    const newFileHandle = await appState.currentDirHandle.getFileHandle('newfile.txt', {
      create: true,
    });

    appState.navigationHistory.push({
      type: 'file',
      handle: newFileHandle,
      path: ['newfile.txt'],
      action: 'create',
    });

    const current = appState.navigationHistory.getCurrent();
    expect(current.action).toBe('create');
    expect(current.handle).toBe(newFileHandle);
  });

  it('should clear navigation history on demand', () => {
    appState.navigationHistory.push({ type: 'directory', handle: null, path: [] });
    appState.navigationHistory.push({ type: 'directory', handle: null, path: ['src'] });

    appState.navigationHistory.clear();

    expect(appState.navigationHistory.canGoBack()).toBe(false);
    expect(appState.navigationHistory.canGoForward()).toBe(false);
    expect(appState.navigationHistory.getCurrent()).toBeNull();
  });

  it('should support navigation with mixed file and directory entries', async () => {
    const srcDir = await appState.currentDirHandle.getDirectoryHandle('src');
    const fileHandle = await srcDir.getFileHandle('index.js');

    // Start at root directory
    appState.navigationHistory.push({
      type: 'directory',
      handle: appState.currentDirHandle,
      path: [],
    });

    // Navigate to src directory
    appState.navigationHistory.push({
      type: 'directory',
      handle: srcDir,
      path: ['src'],
    });

    // Open file in src
    appState.navigationHistory.push({
      type: 'file',
      handle: fileHandle,
      path: ['src', 'index.js'],
    });

    expect(appState.navigationHistory.getCurrent().type).toBe('file');

    // Go back to directory
    const prev = appState.navigationHistory.back();
    expect(prev.type).toBe('directory');
  });

  it('should preserve scroll position in directory listings', async () => {
    const srcDir = await appState.currentDirHandle.getDirectoryHandle('src');

    appState.navigationHistory.push({
      type: 'directory',
      handle: srcDir,
      path: ['src'],
      scrollPosition: 150,
    });

    const current = appState.navigationHistory.getCurrent();
    expect(current.scrollPosition).toBe(150);
  });
});
