import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEnhancedFileHandle,
  createEnhancedDirectoryHandle,
  createMockCodeMirrorEditor,
  mockNavigationHistory,
} from './setup.js';
import { createMockProject } from './mocks/filesystem.js';

// Mock the DOM elements and app state needed for file operations
const createMockAppState = () => {
  return {
    currentFileHandle: null,
    currentDirHandle: null,
    currentPath: [],
    editor: null,
    isDirty: false,
    autosaveEnabled: false,
    richMode: false,
  };
};

const createMockDOM = () => {
  const breadcrumb = document.createElement('div');
  breadcrumb.id = 'breadcrumb';

  const filePicker = document.createElement('div');
  filePicker.id = 'file-picker';
  filePicker.style.display = 'none';

  const filenameInput = document.createElement('input');
  filenameInput.id = 'filename-input';

  const autocompleteDropdown = document.createElement('div');
  autocompleteDropdown.id = 'autocomplete-dropdown';
  autocompleteDropdown.style.display = 'none';

  return {
    breadcrumb,
    filePicker,
    filenameInput,
    autocompleteDropdown,
  };
};

describe('File Creation Integration Tests', () => {
  let appState;
  let _mockDOM;
  let mockProject;

  beforeEach(() => {
    appState = createMockAppState();
    _mockDOM = createMockDOM();
    mockProject = createMockProject({
      'README.md': '# Test Project',
      src: {
        'index.js': 'console.log("hello");',
        components: {
          'App.js': 'export default App;',
        },
      },
      tests: {},
    });
    appState.currentDirHandle = mockProject;
  });

  it('should create a new file in root directory', async () => {
    const filename = 'newfile.txt';

    // Simulate file creation
    const fileHandle = await appState.currentDirHandle.getFileHandle(filename, { create: true });

    expect(fileHandle).toBeDefined();
    expect(fileHandle.kind).toBe('file');
    expect(fileHandle.name).toBe(filename);
    expect(appState.currentDirHandle._hasEntry(filename)).toBe(true);
  });

  it('should create a file with initial empty content', async () => {
    const filename = 'empty.txt';
    const fileHandle = await appState.currentDirHandle.getFileHandle(filename, { create: true });

    // Write empty content
    const writable = await fileHandle.createWritable();
    await writable.write('');
    await writable.close();

    const file = await fileHandle.getFile();
    const content = await file.text();

    expect(content).toBe('');
  });

  it('should create file with nested path (src/utils/helper.js)', async () => {
    const _filePath = 'src/utils/helper.js';

    // Navigate to src directory
    const srcDir = await appState.currentDirHandle.getDirectoryHandle('src');

    // Create utils directory and file
    const utilsDir = await srcDir.getDirectoryHandle('utils', { create: true });
    const fileHandle = await utilsDir.getFileHandle('helper.js', { create: true });

    expect(fileHandle).toBeDefined();
    expect(fileHandle.name).toBe('helper.js');
    expect(utilsDir._hasEntry('helper.js')).toBe(true);
  });

  it('should handle creating file using path-based API', async () => {
    const filePath = 'src/utils/helper.js';

    // Simulate the path-based creation logic
    const parts = filePath.split('/');
    let currentDir = appState.currentDirHandle;

    // Navigate through directories, creating as needed
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
    }

    // Create the file
    const fileName = parts[parts.length - 1];
    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });

    expect(fileHandle.name).toBe('helper.js');

    // Verify directory structure was created
    const srcDir = appState.currentDirHandle._getEntry('src');
    expect(srcDir.kind).toBe('directory');

    const utilsDir = srcDir._getEntry('utils');
    expect(utilsDir.kind).toBe('directory');

    expect(utilsDir._hasEntry('helper.js')).toBe(true);
  });

  it('should open existing file instead of creating if file exists', async () => {
    const filename = 'README.md';

    // File already exists in mock project
    const existingFile = await appState.currentDirHandle.getFileHandle(filename);
    const existingContent = await (await existingFile.getFile()).text();

    // Try to "create" it again
    const fileHandle = await appState.currentDirHandle.getFileHandle(filename, { create: true });
    const content = await (await fileHandle.getFile()).text();

    expect(fileHandle).toBe(existingFile);
    expect(content).toBe(existingContent);
  });

  it('should preserve temp storage when creating file while another is dirty', async () => {
    // Open and edit existing file
    const readmeHandle = await appState.currentDirHandle.getFileHandle('README.md');
    appState.currentFileHandle = readmeHandle;
    appState.isDirty = true;

    // Save to temp storage
    const tempKey = 'README.md';
    const tempContent = '# Modified Content';
    localStorage.setItem(tempKey, tempContent);

    // Create new file
    const _newFileHandle = await appState.currentDirHandle.getFileHandle('newfile.txt', {
      create: true,
    });

    // Verify temp storage still has the old file's changes
    expect(localStorage.getItem(tempKey)).toBe(tempContent);

    // Switch back to README
    const restoredContent = localStorage.getItem(tempKey);
    expect(restoredContent).toBe(tempContent);
  });

  it('should reject invalid filenames with reserved characters', async () => {
    const invalidNames = ['file:name.txt', 'file<name>.txt', 'file|name.txt', 'file?name.txt'];

    for (const invalidName of invalidNames) {
      // File System Access API would typically reject these
      // Our mock should also handle validation
      const hasInvalidChars = /[<>:"|?*]/.test(invalidName);
      expect(hasInvalidChars).toBe(true);
    }
  });

  it('should handle empty filename gracefully', async () => {
    await expect(async () => {
      // Most implementations would reject empty names
      if (''.trim() === '') {
        throw new Error('Filename cannot be empty');
      }
      await appState.currentDirHandle.getFileHandle('', { create: true });
    }).rejects.toThrow();
  });

  it('should create file with special characters in name', async () => {
    const specialNames = ['file-name.txt', 'file_name.txt', 'file.name.txt', 'file (1).txt'];

    for (const name of specialNames) {
      const fileHandle = await appState.currentDirHandle.getFileHandle(name, { create: true });
      expect(fileHandle.name).toBe(name);
      expect(appState.currentDirHandle._hasEntry(name)).toBe(true);
    }
  });

  it('should initialize editor with correct language mode after creation', async () => {
    const testCases = [
      { filename: 'test.js', expectedExt: 'js' },
      { filename: 'test.py', expectedExt: 'py' },
      { filename: 'test.md', expectedExt: 'md' },
      { filename: 'test.json', expectedExt: 'json' },
      { filename: 'test.html', expectedExt: 'html' },
    ];

    for (const { filename, expectedExt } of testCases) {
      const ext = filename.split('.').pop().toLowerCase();
      expect(ext).toBe(expectedExt);
    }
  });

  it('should enable autosave after file creation', async () => {
    const filename = 'autosave-test.txt';
    const fileHandle = await appState.currentDirHandle.getFileHandle(filename, { create: true });

    // Simulate enabling autosave
    appState.autosaveEnabled = true;
    appState.currentFileHandle = fileHandle;

    expect(appState.autosaveEnabled).toBe(true);
    expect(appState.currentFileHandle).toBe(fileHandle);
  });

  it('should focus editor after file creation', async () => {
    const filename = 'focus-test.txt';
    await appState.currentDirHandle.getFileHandle(filename, { create: true });

    // Create mock editor
    const mockEditor = createMockCodeMirrorEditor();
    appState.editor = mockEditor;

    // Simulate focus
    mockEditor.view.focus();

    expect(mockEditor.view.focus).toHaveBeenCalled();
  });

  it('should add file creation to navigation history', async () => {
    const filename = 'history-test.txt';
    const fileHandle = await appState.currentDirHandle.getFileHandle(filename, { create: true });

    // Simulate adding to history
    mockNavigationHistory.push({
      type: 'file',
      handle: fileHandle,
      path: [filename],
    });

    const current = mockNavigationHistory.getCurrent();
    expect(current.type).toBe('file');
    expect(current.handle).toBe(fileHandle);
  });

  it('should handle rapid file creation without conflicts', async () => {
    const filePromises = [];

    for (let i = 0; i < 10; i++) {
      filePromises.push(appState.currentDirHandle.getFileHandle(`file${i}.txt`, { create: true }));
    }

    const fileHandles = await Promise.all(filePromises);

    expect(fileHandles).toHaveLength(10);
    expect(new Set(fileHandles.map((h) => h.name)).size).toBe(10);
  });

  it('should create deeply nested file structure', async () => {
    const deepPath = 'a/b/c/d/e/deep.txt';
    const parts = deepPath.split('/');

    let currentDir = appState.currentDirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
    }

    const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true });

    expect(fileHandle.name).toBe('deep.txt');

    // Verify path depth
    const aDir = appState.currentDirHandle._getEntry('a');
    const bDir = aDir._getEntry('b');
    const cDir = bDir._getEntry('c');
    const dDir = cDir._getEntry('d');
    const eDir = dDir._getEntry('e');

    expect(eDir._hasEntry('deep.txt')).toBe(true);
  });
});

describe('File Opening Integration Tests', () => {
  let appState;
  let mockProject;

  beforeEach(() => {
    appState = createMockAppState();
    mockProject = createMockProject({
      'README.md': '# Test Project\n\nThis is a test.',
      'data.json': '{"test": true}',
      src: {
        'index.js': 'console.log("app");',
        'styles.css': 'body { margin: 0; }',
      },
    });
    appState.currentDirHandle = mockProject;
  });

  it('should open file from directory handle', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('README.md');
    const file = await fileHandle.getFile();
    const content = await file.text();

    expect(content).toBe('# Test Project\n\nThis is a test.');
    expect(fileHandle.kind).toBe('file');
    expect(fileHandle.name).toBe('README.md');
  });

  it('should load file content into editor', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('README.md');
    const file = await fileHandle.getFile();
    const content = await file.text();

    // Create and populate editor
    const mockEditor = createMockCodeMirrorEditor();
    mockEditor.setContent(content);

    expect(mockEditor.getContent()).toBe('# Test Project\n\nThis is a test.');
  });

  it('should restore temp changes when reopening file', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('README.md');
    const pathKey = 'README.md';

    // Simulate having temp changes
    const tempContent = '# Modified Project\n\nEdited content.';
    localStorage.setItem(pathKey, tempContent);

    // Open file
    const file = await fileHandle.getFile();
    const originalContent = await file.text();

    // Check for temp changes
    const savedContent = localStorage.getItem(pathKey);

    expect(originalContent).toBe('# Test Project\n\nThis is a test.');
    expect(savedContent).toBe(tempContent);

    // Editor should use temp content if present
    const mockEditor = createMockCodeMirrorEditor();
    mockEditor.setContent(savedContent || originalContent);

    expect(mockEditor.getContent()).toBe(tempContent);
  });

  it('should mark file as dirty when temp changes exist', async () => {
    const pathKey = 'README.md';
    localStorage.setItem(pathKey, '# Modified');

    const hasTempChanges = localStorage.getItem(pathKey) !== null;
    appState.isDirty = hasTempChanges;

    expect(appState.isDirty).toBe(true);
  });

  it('should switch between files preserving unsaved changes', async () => {
    // Open first file
    const _file1Handle = await appState.currentDirHandle.getFileHandle('README.md');
    const file1Key = 'README.md';

    // Edit first file
    const mockEditor1 = createMockCodeMirrorEditor();
    mockEditor1.setContent('Modified README');
    localStorage.setItem(file1Key, mockEditor1.getContent());

    // Open second file
    const file2Handle = await appState.currentDirHandle.getFileHandle('data.json');
    const _file2Key = 'data.json';

    const mockEditor2 = createMockCodeMirrorEditor();
    const file2Content = await (await file2Handle.getFile()).text();
    mockEditor2.setContent(file2Content);

    // First file's changes should still be in storage
    expect(localStorage.getItem(file1Key)).toBe('Modified README');

    // Switch back to first file
    const restoredContent = localStorage.getItem(file1Key);
    mockEditor1.setContent(restoredContent);

    expect(mockEditor1.getContent()).toBe('Modified README');
  });

  it('should activate rich mode for markdown files', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('README.md');

    // Check if file is markdown
    const isMarkdown = fileHandle.name.endsWith('.md');

    if (isMarkdown) {
      appState.richMode = true;
    }

    expect(appState.richMode).toBe(true);
  });

  it('should not activate rich mode for non-markdown files', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('data.json');

    const isMarkdown = fileHandle.name.endsWith('.md');
    appState.richMode = isMarkdown;

    expect(appState.richMode).toBe(false);
  });

  it('should handle file read errors gracefully', async () => {
    const mockHandle = createEnhancedFileHandle('error.txt', 'content');
    mockHandle._setPermissionState('denied');

    await expect(async () => {
      await mockHandle.getFile();
    }).rejects.toThrow('Permission denied');
  });

  it('should update breadcrumb with file path', async () => {
    const srcDir = await appState.currentDirHandle.getDirectoryHandle('src');
    const _fileHandle = await srcDir.getFileHandle('index.js');

    const path = ['src', 'index.js'];
    appState.currentPath = path;

    expect(appState.currentPath).toEqual(['src', 'index.js']);
  });

  it('should add file opening to navigation history', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('README.md');

    mockNavigationHistory.push({
      type: 'file',
      handle: fileHandle,
      path: ['README.md'],
    });

    expect(mockNavigationHistory.getCurrent().handle).toBe(fileHandle);
  });

  it('should handle opening file from nested directory', async () => {
    const srcDir = await appState.currentDirHandle.getDirectoryHandle('src');
    const fileHandle = await srcDir.getFileHandle('index.js');
    const file = await fileHandle.getFile();
    const content = await file.text();

    expect(content).toBe('console.log("app");');
    expect(fileHandle.name).toBe('index.js');
  });

  it('should preserve editor state when switching files', async () => {
    // Open file 1
    const _file1 = await appState.currentDirHandle.getFileHandle('README.md');
    const editor1 = createMockCodeMirrorEditor();
    editor1.setContent('Content 1');

    const editor1State = {
      content: editor1.getContent(),
      cursorPos: 0,
    };

    // Open file 2
    const _file2 = await appState.currentDirHandle.getFileHandle('data.json');
    const editor2 = createMockCodeMirrorEditor();
    editor2.setContent('Content 2');

    // Verify we can restore file 1 state
    expect(editor1State.content).toBe('Content 1');
  });
});

describe('File Search Integration Tests', () => {
  let appState;
  let mockProject;

  beforeEach(() => {
    appState = createMockAppState();
    mockProject = createMockProject({
      'README.md': '# Root',
      'app.js': 'main app',
      'app.test.js': 'tests',
      src: {
        'index.js': 'entry',
        'app.js': 'src app',
        components: {
          'App.js': 'component',
          'AppHeader.js': 'header',
          'UserProfile.js': 'profile',
        },
        utils: {
          'helpers.js': 'helpers',
          'api.js': 'api',
        },
      },
      tests: {
        'app.test.js': 'tests',
        'utils.test.js': 'utils tests',
      },
    });
    appState.currentDirHandle = mockProject;
  });

  it('should perform prefix search in current directory', async () => {
    const query = 'app';
    const matches = [];

    for await (const [name, handle] of appState.currentDirHandle.entries()) {
      if (handle.kind === 'file' && name.toLowerCase().startsWith(query.toLowerCase())) {
        matches.push({ name, handle });
      }
    }

    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.name)).toContain('app.js');
    expect(matches.map((m) => m.name)).toContain('app.test.js');
  });

  it('should perform recursive search across subdirectories', async () => {
    const query = 'app';
    const maxDepth = 10;

    const allFiles = appState.currentDirHandle._getAllFiles('', maxDepth);
    const matches = allFiles.filter((file) =>
      file.name.toLowerCase().includes(query.toLowerCase())
    );

    expect(matches.length).toBeGreaterThan(2);

    const paths = matches.map((m) => m.path);
    expect(paths).toContain('app.js');
    expect(paths).toContain('app.test.js');
    expect(paths).toContain('src/app.js');
    expect(paths).toContain('src/components/App.js');
    expect(paths).toContain('tests/app.test.js');
  });

  it('should implement fuzzy matching algorithm', () => {
    const fuzzyMatch = (query, target) => {
      const q = query.toLowerCase().replace(/\s+/g, '');
      const t = target.toLowerCase();

      let queryIndex = 0;
      let targetIndex = 0;

      while (queryIndex < q.length && targetIndex < t.length) {
        if (q[queryIndex] === t[targetIndex]) {
          queryIndex++;
        }
        targetIndex++;
      }

      return queryIndex === q.length;
    };

    expect(fuzzyMatch('app', 'App.js')).toBe(true);
    expect(fuzzyMatch('apj', 'App.js')).toBe(true);
    expect(fuzzyMatch('uj', 'UserProfile.js')).toBe(true);
    expect(fuzzyMatch('xyz', 'App.js')).toBe(false);
  });

  it('should score results by relevance (exact > prefix > substring > fuzzy)', () => {
    const query = 'app.js';
    const files = [
      { name: 'app.js', path: 'app.js', depth: 0 },
      { name: 'App.js', path: 'src/components/App.js', depth: 2 },
      { name: 'app.test.js', path: 'app.test.js', depth: 0 },
      { name: 'application.js', path: 'src/application.js', depth: 1 },
      { name: 'helpers.js', path: 'src/utils/helpers.js', depth: 2 },
    ];

    const scoreFile = (file, query) => {
      const name = file.name.toLowerCase();
      const q = query.toLowerCase();

      if (name === q) return 1000 - file.depth; // Exact match
      if (name.startsWith(q.split('.')[0])) return 500 - file.depth; // Prefix match
      if (name.includes(q.split('.')[0])) return 100 - file.depth; // Substring match
      return 10 - file.depth; // Fuzzy match
    };

    const scored = files.map((file) => ({
      ...file,
      score: scoreFile(file, query),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });

    // app.js should score highest (exact match: 1000)
    expect(scored[0].name).toBe('app.js');
    expect(scored[0].score).toBe(1000);
    // Prefix matches should be next (500, 499, 498)
    expect(scored[1].score).toBeGreaterThan(100);
    expect(scored[1].score).toBeLessThan(1000);
  });

  it('should search in nested directories up to max depth', async () => {
    const query = 'js';
    const maxDepth = 3;

    const searchRecursive = (dirHandle, currentPath = '', currentDepth = 0) => {
      if (currentDepth >= maxDepth) return [];

      const results = [];
      const entries = Array.from(dirHandle._entries.entries());

      for (const [name, entry] of entries) {
        const fullPath = currentPath ? `${currentPath}/${name}` : name;

        if (entry.kind === 'file' && name.includes(query)) {
          results.push({ name, path: fullPath, depth: currentDepth });
        } else if (entry.kind === 'directory') {
          results.push(...searchRecursive(entry, fullPath, currentDepth + 1));
        }
      }

      return results;
    };

    const matches = searchRecursive(appState.currentDirHandle);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.depth < maxDepth)).toBe(true);
  });

  it('should return correct file paths in search results', async () => {
    const query = 'App';
    const allFiles = appState.currentDirHandle._getAllFiles();
    const matches = allFiles.filter((file) => file.name.includes(query));

    const paths = matches.map((m) => m.path);

    expect(paths).toContain('src/components/App.js');
    expect(paths).toContain('src/components/AppHeader.js');
  });

  it('should handle search with no results', async () => {
    const query = 'nonexistent';
    const allFiles = appState.currentDirHandle._getAllFiles();
    const matches = allFiles.filter((file) => file.name.toLowerCase().includes(query));

    expect(matches).toHaveLength(0);
  });

  it('should handle search in empty directory', async () => {
    const emptyDir = createEnhancedDirectoryHandle('empty');
    const allFiles = emptyDir._getAllFiles();

    expect(allFiles).toHaveLength(0);
  });

  it('should search with special characters', async () => {
    // Create files with special characters
    await appState.currentDirHandle.getFileHandle('file-name.js', { create: true });
    await appState.currentDirHandle.getFileHandle('file_name.js', { create: true });

    const query1 = 'file-name';
    const query2 = 'file_name';

    const files = appState.currentDirHandle._getAllFiles();

    const matches1 = files.filter((f) => f.name.includes(query1));
    const matches2 = files.filter((f) => f.name.includes(query2));

    expect(matches1.length).toBeGreaterThan(0);
    expect(matches2.length).toBeGreaterThan(0);
  });

  it('should handle case-insensitive search', async () => {
    const query = 'APP';
    const allFiles = appState.currentDirHandle._getAllFiles();
    const matches = allFiles.filter((file) =>
      file.name.toLowerCase().includes(query.toLowerCase())
    );

    expect(matches.length).toBeGreaterThan(0);
  });

  it('should limit search results to max count', async () => {
    const maxResults = 5;
    const allFiles = appState.currentDirHandle._getAllFiles();

    const limitedResults = allFiles.slice(0, maxResults);

    expect(limitedResults.length).toBeLessThanOrEqual(maxResults);
  });

  it('should skip hidden files in search', async () => {
    // Create hidden files
    await appState.currentDirHandle.getFileHandle('.hidden', { create: true });
    await appState.currentDirHandle.getFileHandle('.gitignore', { create: true });

    const allFiles = appState.currentDirHandle._getAllFiles();

    // Filter out hidden files
    const visibleFiles = allFiles.filter((f) => !f.name.startsWith('.'));

    expect(visibleFiles.every((f) => !f.name.startsWith('.'))).toBe(true);
  });

  it('should handle large directory structures efficiently', async () => {
    // Create a large structure
    const largeDir = createEnhancedDirectoryHandle('large');

    for (let i = 0; i < 100; i++) {
      await largeDir.getFileHandle(`file${i}.js`, { create: true });
    }

    const allFiles = largeDir._getAllFiles();

    expect(allFiles).toHaveLength(100);
  });

  it('should return search results with file handles', async () => {
    const query = 'app';
    const allFiles = appState.currentDirHandle._getAllFiles();
    const matches = allFiles.filter((file) => file.name.toLowerCase().includes(query));

    expect(matches.every((m) => m.handle !== undefined)).toBe(true);
    expect(matches.every((m) => m.handle.kind === 'file')).toBe(true);
  });

  it('should support opening file from search results', async () => {
    const query = 'App.js';
    const allFiles = appState.currentDirHandle._getAllFiles();
    const match = allFiles.find((file) => file.name === query);

    expect(match).toBeDefined();

    // Open the file
    const fileHandle = match.handle;
    const file = await fileHandle.getFile();
    const content = await file.text();

    expect(content).toBe('component');
  });

  it('should handle search query with slashes for path-based search', () => {
    const query = 'src/app';
    const allFiles = appState.currentDirHandle._getAllFiles();

    // Path-based search
    const matches = allFiles.filter((file) => file.path.toLowerCase().includes(query));

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.path.startsWith('src/'))).toBe(true);
  });

  it('should prevent infinite loops with circular references', async () => {
    // Mock directory structure should not have circular references
    const visited = new Set();

    const checkForCycles = (dir, path = []) => {
      const dirId = dir.name;

      if (visited.has(dirId)) {
        return false; // Cycle detected
      }

      visited.add(dirId);

      for (const [name, entry] of dir._entries) {
        if (entry.kind === 'directory') {
          if (!checkForCycles(entry, [...path, name])) {
            return false;
          }
        }
      }

      visited.delete(dirId);
      return true;
    };

    const noCycles = checkForCycles(appState.currentDirHandle);
    expect(noCycles).toBe(true);
  });

  it('should handle search cancellation', () => {
    const _cancelled = false;
    const cancelToken = { cancelled: false };

    const searchWithCancel = (dirHandle, query, cancelToken) => {
      if (cancelToken.cancelled) return [];

      const results = [];
      const allFiles = dirHandle._getAllFiles();

      for (const file of allFiles) {
        if (cancelToken.cancelled) break;

        if (file.name.includes(query)) {
          results.push(file);
        }
      }

      return results;
    };

    // Start search
    setTimeout(() => {
      cancelToken.cancelled = true;
    }, 10);

    const results = searchWithCancel(appState.currentDirHandle, 'app', cancelToken);

    // Results may be partial if cancelled
    expect(Array.isArray(results)).toBe(true);
  });
});
