import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TEMP_STORAGE_PREFIX,
  getFilePathKey,
  saveTempChanges,
  loadTempChanges,
  clearTempChanges,
  hasTempChanges,
  getLanguageExtension,
  isFileSystemAccessSupported,
  buildBreadcrumbPath,
  sortDirectoryEntries,
  canNavigateBack,
  canNavigateForward,
  canNavigateUp,
} from '../core.js';

describe('Temp Storage Functions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getFilePathKey', () => {
    it('should return null if no filename', () => {
      const _result = getFilePathKey([{ name: 'src' }], '');
      expect(_result).toBeNull();
    });

    it('should return just filename for empty path', () => {
      const _result = getFilePathKey([], 'test.js');
      expect(_result).toBe('test.js');
    });

    it('should return full path with filename', () => {
      const path = [{ name: 'src' }, { name: 'components' }];
      const _result = getFilePathKey(path, 'App.js');
      expect(_result).toBe('src/components/App.js');
    });
  });

  describe('saveTempChanges', () => {
    it('should save content to localStorage with prefix', () => {
      const key = 'src/test.js';
      const content = 'console.log("test");';
      saveTempChanges(key, content);
      expect(localStorage.getItem(TEMP_STORAGE_PREFIX + key)).toBe(content);
    });

    it('should not save if key is empty', () => {
      saveTempChanges('', 'content');
      expect(localStorage.getItem(TEMP_STORAGE_PREFIX)).toBeNull();
    });

    it('should not save if content is empty', () => {
      saveTempChanges('src/test.js', '');
      expect(localStorage.getItem(TEMP_STORAGE_PREFIX + 'src/test.js')).toBeNull();
    });
  });

  describe('loadTempChanges', () => {
    it('should load saved temp changes', () => {
      const key = 'src/test.js';
      const content = 'console.log("test");';
      localStorage.setItem(TEMP_STORAGE_PREFIX + key, content);
      const _result = loadTempChanges(key);
      expect(_result).toBe(content);
    });

    it('should return null if no temp changes exist', () => {
      const _result = loadTempChanges('nonexistent.js');
      expect(_result).toBeNull();
    });
  });

  describe('clearTempChanges', () => {
    it('should remove temp changes from localStorage', () => {
      const key = 'src/test.js';
      localStorage.setItem(TEMP_STORAGE_PREFIX + key, 'content');
      clearTempChanges(key);
      expect(localStorage.getItem(TEMP_STORAGE_PREFIX + key)).toBeNull();
    });
  });

  describe('hasTempChanges', () => {
    it('should return true if temp changes exist', () => {
      const key = 'src/test.js';
      localStorage.setItem(TEMP_STORAGE_PREFIX + key, 'content');
      expect(hasTempChanges(key)).toBe(true);
    });

    it('should return false if no temp changes exist', () => {
      expect(hasTempChanges('nonexistent.js')).toBe(false);
    });
  });
});

describe('Language Detection', () => {
  const mockLanguageModules = {
    javascript: vi.fn((opts) => `javascript${opts ? JSON.stringify(opts) : ''}`),
    python: vi.fn(() => 'python'),
    go: vi.fn(() => 'go'),
    rust: vi.fn(() => 'rust'),
    php: vi.fn(() => 'php'),
    java: vi.fn(() => 'java'),
    groovy: vi.fn(() => 'groovy'),
    cpp: vi.fn(() => 'cpp'),
    xml: vi.fn(() => 'xml'),
    yaml: vi.fn(() => 'yaml'),
    shell: vi.fn(() => 'shell'),
    ruby: vi.fn(() => 'ruby'),
    html: vi.fn(() => 'html'),
    css: vi.fn(() => 'css'),
    json: vi.fn(() => 'json'),
    markdown: vi.fn(() => 'markdown'),
  };

  it('should detect JavaScript', () => {
    const _result = getLanguageExtension('test.js', mockLanguageModules);
    expect(_result).toBe('javascript');
  });

  it('should detect JSX', () => {
    const _result = getLanguageExtension('App.jsx', mockLanguageModules);
    expect(mockLanguageModules.javascript).toHaveBeenCalledWith({ jsx: true });
  });

  it('should detect TypeScript', () => {
    const _result = getLanguageExtension('test.ts', mockLanguageModules);
    expect(mockLanguageModules.javascript).toHaveBeenCalledWith({ typescript: true });
  });

  it('should detect TSX', () => {
    const _result = getLanguageExtension('App.tsx', mockLanguageModules);
    expect(mockLanguageModules.javascript).toHaveBeenCalledWith({ typescript: true, jsx: true });
  });

  it('should detect Python', () => {
    const _result = getLanguageExtension('script.py', mockLanguageModules);
    expect(_result).toBe('python');
  });

  it('should detect HTML', () => {
    const _result = getLanguageExtension('index.html', mockLanguageModules);
    expect(_result).toBe('html');
  });

  it('should detect CSS', () => {
    const _result = getLanguageExtension('styles.css', mockLanguageModules);
    expect(_result).toBe('css');
  });

  it('should detect SCSS', () => {
    const _result = getLanguageExtension('styles.scss', mockLanguageModules);
    expect(_result).toBe('css');
  });

  it('should detect JSON', () => {
    const _result = getLanguageExtension('config.json', mockLanguageModules);
    expect(_result).toBe('json');
  });

  it('should detect Markdown', () => {
    const _result = getLanguageExtension('README.md', mockLanguageModules);
    expect(_result).toBe('markdown');
  });

  it('should detect Jenkinsfile', () => {
    const _result = getLanguageExtension('Jenkinsfile', mockLanguageModules);
    expect(_result).toBe('groovy');
  });

  it('should detect Groovy files', () => {
    const _result = getLanguageExtension('script.groovy', mockLanguageModules);
    expect(_result).toBe('groovy');
  });

  it('should detect .gitignore files', () => {
    const _result = getLanguageExtension('.gitignore', mockLanguageModules);
    expect(_result).toBe('shell');
  });

  it('should detect .dockerignore files', () => {
    const _result = getLanguageExtension('.dockerignore', mockLanguageModules);
    expect(_result).toBe('shell');
  });

  it('should return empty array for unknown extensions', () => {
    const _result = getLanguageExtension('file.xyz', mockLanguageModules);
    expect(_result).toEqual([]);
  });
});

describe('File System Access API Support', () => {
  it('should return true if both APIs are available', () => {
    global.window.showOpenFilePicker = vi.fn();
    global.window.showDirectoryPicker = vi.fn();
    expect(isFileSystemAccessSupported()).toBe(true);
  });

  it('should return false if showOpenFilePicker is missing', () => {
    delete global.window.showOpenFilePicker;
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it('should return false if showDirectoryPicker is missing', () => {
    global.window.showOpenFilePicker = vi.fn();
    delete global.window.showDirectoryPicker;
    expect(isFileSystemAccessSupported()).toBe(false);
  });
});

describe('Breadcrumb Path Building', () => {
  it('should build path for file with no folder', () => {
    const result = buildBreadcrumbPath([], 'test.js', null);
    expect(result).toEqual([{ name: 'test.js', isFile: true, isLast: true }]);
  });

  it('should build path for folder structure', () => {
    const path = [
      { name: 'src', handle: {} },
      { name: 'components', handle: {} },
    ];
    const result = buildBreadcrumbPath(path, '', null);
    expect(result).toEqual([
      { name: 'src', isFile: false, isLast: false, index: 0 },
      { name: 'components', isFile: false, isLast: false, index: 1 },
    ]);
  });

  it('should build path with file in folder', () => {
    const path = [{ name: 'src', handle: {} }];
    const result = buildBreadcrumbPath(path, 'App.js', {});
    expect(result).toEqual([
      { name: 'src', isFile: false, isLast: false, index: 0 },
      { name: 'App.js', isFile: true, isLast: true },
    ]);
  });
});

describe('Directory Entry Sorting', () => {
  it('should sort directories before files', () => {
    const entries = [
      { name: 'file1.js', kind: 'file' },
      { name: 'folderA', kind: 'directory' },
      { name: 'file2.js', kind: 'file' },
      { name: 'folderB', kind: 'directory' },
    ];
    const result = sortDirectoryEntries(entries);
    expect(result[0].kind).toBe('directory');
    expect(result[1].kind).toBe('directory');
    expect(result[2].kind).toBe('file');
    expect(result[3].kind).toBe('file');
  });

  it('should sort entries alphabetically within type', () => {
    const entries = [
      { name: 'zebra.js', kind: 'file' },
      { name: 'apple.js', kind: 'file' },
      { name: 'zoo', kind: 'directory' },
      { name: 'animals', kind: 'directory' },
    ];
    const result = sortDirectoryEntries(entries);
    expect(result[0].name).toBe('animals');
    expect(result[1].name).toBe('zoo');
    expect(result[2].name).toBe('apple.js');
    expect(result[3].name).toBe('zebra.js');
  });
});

describe('Navigation Validation', () => {
  describe('canNavigateBack', () => {
    it('should return false at index 0', () => {
      expect(canNavigateBack(0)).toBe(false);
    });

    it('should return true at index > 0', () => {
      expect(canNavigateBack(1)).toBe(true);
      expect(canNavigateBack(5)).toBe(true);
    });
  });

  describe('canNavigateForward', () => {
    it('should return false at end of history', () => {
      expect(canNavigateForward(4, 5)).toBe(false);
    });

    it('should return true before end of history', () => {
      expect(canNavigateForward(0, 5)).toBe(true);
      expect(canNavigateForward(3, 5)).toBe(true);
    });
  });

  describe('canNavigateUp', () => {
    it('should return false with empty path', () => {
      expect(canNavigateUp([])).toBe(false);
    });

    it('should return true with non-empty path', () => {
      expect(canNavigateUp([{ name: 'src' }])).toBe(true);
    });
  });
});
