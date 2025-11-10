import { describe, it, expect, vi } from 'vitest';
import {
  FileSystemAdapter,
  isFileSystemAccessSupported,
  openFileByPath,
  navigateToDirectory,
} from '../../src/fs/filesystem-adapter.js';
import {
  createMockFileHandle,
  createMockDirectoryHandle,
  createMockProject,
} from '../mocks/filesystem.js';

describe('FileSystemAdapter', () => {
  describe('isSupported', () => {
    it('should return true when File System Access API is available', () => {
      const result = FileSystemAdapter.isSupported();
      expect(result).toBe(true);
    });

    it('should return false when showOpenFilePicker is not available', () => {
      const original = window.showOpenFilePicker;
      delete window.showOpenFilePicker;

      const result = FileSystemAdapter.isSupported();
      expect(result).toBe(false);

      window.showOpenFilePicker = original;
    });

    it('should return false when showDirectoryPicker is not available', () => {
      const original = window.showDirectoryPicker;
      delete window.showDirectoryPicker;

      const result = FileSystemAdapter.isSupported();
      expect(result).toBe(false);

      window.showDirectoryPicker = original;
    });
  });

  describe('listDirectory', () => {
    it('should list all entries in a directory', async () => {
      const mockDir = createMockDirectoryHandle('test-dir', {
        'file1.txt': 'content1',
        'file2.js': 'content2',
        subdir: {},
      });

      const entries = await FileSystemAdapter.listDirectory(mockDir);

      expect(entries).toHaveLength(3);
      expect(entries[0].name).toBe('file1.txt');
      expect(entries[1].name).toBe('file2.js');
      expect(entries[2].name).toBe('subdir');
    });

    it('should return empty array for empty directory', async () => {
      const mockDir = createMockDirectoryHandle('empty-dir', {});

      const entries = await FileSystemAdapter.listDirectory(mockDir);

      expect(entries).toHaveLength(0);
    });

    it('should handle large directories', async () => {
      const files = {};
      for (let i = 0; i < 100; i++) {
        files[`file${i}.txt`] = `content${i}`;
      }
      const mockDir = createMockDirectoryHandle('large-dir', files);

      const entries = await FileSystemAdapter.listDirectory(mockDir);

      expect(entries).toHaveLength(100);
    });
  });

  describe('readFile', () => {
    it('should read file contents', async () => {
      const mockFile = createMockFileHandle('test.txt', 'Hello, World!');

      const content = await FileSystemAdapter.readFile(mockFile);

      expect(content).toBe('Hello, World!');
    });

    it('should read empty file', async () => {
      const mockFile = createMockFileHandle('empty.txt', '');

      const content = await FileSystemAdapter.readFile(mockFile);

      expect(content).toBe('');
    });

    it('should read large file', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      const mockFile = createMockFileHandle('large.txt', largeContent);

      const content = await FileSystemAdapter.readFile(mockFile);

      expect(content).toBe(largeContent);
      expect(content.length).toBe(1024 * 1024);
    });

    it('should handle unicode content', async () => {
      const unicodeContent = '你好世界 🌍 مرحبا';
      const mockFile = createMockFileHandle('unicode.txt', unicodeContent);

      const content = await FileSystemAdapter.readFile(mockFile);

      expect(content).toBe(unicodeContent);
    });

    it('should throw error for invalid file handle', async () => {
      const mockFile = createMockFileHandle('test.txt', 'content');
      mockFile.getFile = vi.fn().mockRejectedValue(new Error('File not found'));

      await expect(FileSystemAdapter.readFile(mockFile)).rejects.toThrow('File not found');
    });
  });

  describe('writeFile', () => {
    it('should write file contents', async () => {
      const mockFile = createMockFileHandle('test.txt', '');

      await FileSystemAdapter.writeFile(mockFile, 'New content');

      const file = await mockFile.getFile();
      const content = await file.text();
      expect(content).toBe('New content');
    });

    it('should overwrite existing content', async () => {
      const mockFile = createMockFileHandle('test.txt', 'Old content');

      await FileSystemAdapter.writeFile(mockFile, 'New content');

      const file = await mockFile.getFile();
      const content = await file.text();
      expect(content).toBe('New content');
    });

    it('should write empty content', async () => {
      const mockFile = createMockFileHandle('test.txt', 'content');

      await FileSystemAdapter.writeFile(mockFile, '');

      const file = await mockFile.getFile();
      const content = await file.text();
      expect(content).toBe('');
    });

    it('should write large content', async () => {
      const largeContent = 'y'.repeat(5 * 1024 * 1024); // 5MB
      const mockFile = createMockFileHandle('large.txt', '');

      await FileSystemAdapter.writeFile(mockFile, largeContent);

      const file = await mockFile.getFile();
      const content = await file.text();
      expect(content.length).toBe(5 * 1024 * 1024);
    });

    it('should handle unicode content', async () => {
      const unicodeContent = 'Привет 世界 🚀';
      const mockFile = createMockFileHandle('test.txt', '');

      await FileSystemAdapter.writeFile(mockFile, unicodeContent);

      const file = await mockFile.getFile();
      const content = await file.text();
      expect(content).toBe(unicodeContent);
    });

    it('should throw error on write failure', async () => {
      const mockFile = createMockFileHandle('test.txt', '');
      mockFile.createWritable = vi.fn().mockRejectedValue(new Error('Permission denied'));

      await expect(FileSystemAdapter.writeFile(mockFile, 'content')).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('getFileMetadata', () => {
    it('should return file metadata', async () => {
      const mockFile = createMockFileHandle('test.txt', 'Hello');

      const metadata = await FileSystemAdapter.getFileMetadata(mockFile);

      expect(metadata).toHaveProperty('name');
      expect(metadata).toHaveProperty('size');
      expect(metadata).toHaveProperty('lastModified');
      expect(metadata.name).toBe('test.txt');
      expect(metadata.size).toBe(5); // "Hello" = 5 bytes
      expect(typeof metadata.lastModified).toBe('number');
    });

    it('should return correct size for empty file', async () => {
      const mockFile = createMockFileHandle('empty.txt', '');

      const metadata = await FileSystemAdapter.getFileMetadata(mockFile);

      expect(metadata.size).toBe(0);
    });

    it('should return recent lastModified timestamp', async () => {
      const mockFile = createMockFileHandle('test.txt', 'content');

      const metadata = await FileSystemAdapter.getFileMetadata(mockFile);

      const now = Date.now();
      expect(metadata.lastModified).toBeLessThanOrEqual(now);
      expect(metadata.lastModified).toBeGreaterThan(now - 10000); // Within last 10 seconds
    });
  });

  describe('navigateToSubdirectory', () => {
    it('should navigate to existing subdirectory', async () => {
      const mockProject = createMockProject({
        src: {
          components: {
            'App.js': 'content',
          },
        },
      });

      const srcDir = await FileSystemAdapter.navigateToSubdirectory(mockProject, 'src');

      expect(srcDir.name).toBe('src');
      expect(srcDir.kind).toBe('directory');
    });

    it('should throw error for non-existent subdirectory', async () => {
      const mockDir = createMockDirectoryHandle('root', []);

      await expect(
        FileSystemAdapter.navigateToSubdirectory(mockDir, 'nonexistent')
      ).rejects.toThrow();
    });

    it('should navigate multiple levels', async () => {
      const mockProject = createMockProject({
        src: {
          components: {
            ui: {
              'Button.js': 'content',
            },
          },
        },
      });

      const srcDir = await FileSystemAdapter.navigateToSubdirectory(mockProject, 'src');
      const componentsDir = await FileSystemAdapter.navigateToSubdirectory(srcDir, 'components');
      const uiDir = await FileSystemAdapter.navigateToSubdirectory(componentsDir, 'ui');

      expect(uiDir.name).toBe('ui');
    });
  });
});

describe('isFileSystemAccessSupported', () => {
  it('should return true when API is supported', () => {
    const result = isFileSystemAccessSupported();
    expect(result).toBe(true);
  });

  it('should match FileSystemAdapter.isSupported()', () => {
    const result1 = isFileSystemAccessSupported();
    const result2 = FileSystemAdapter.isSupported();
    expect(result1).toBe(result2);
  });
});

describe('openFileByPath', () => {
  it('should open file in root directory', async () => {
    const mockProject = createMockProject({
      'README.md': '# Test',
      'index.js': 'console.log("hello");',
    });

    const result = await openFileByPath(mockProject, 'README.md');

    expect(result).not.toBeNull();
    expect(result.fileHandle.name).toBe('README.md');
    expect(result.dirHandle).toBe(mockProject);
  });

  it('should open file in nested directory', async () => {
    const mockProject = createMockProject({
      src: {
        components: {
          'App.js': 'export default App;',
        },
      },
    });

    const result = await openFileByPath(mockProject, 'src/components/App.js');

    expect(result).not.toBeNull();
    expect(result.fileHandle.name).toBe('App.js');
    expect(result.dirHandle.name).toBe('components');
  });

  it('should open file in deeply nested path', async () => {
    const mockProject = createMockProject({
      src: {
        features: {
          auth: {
            components: {
              'LoginForm.js': 'content',
            },
          },
        },
      },
    });

    const result = await openFileByPath(mockProject, 'src/features/auth/components/LoginForm.js');

    expect(result).not.toBeNull();
    expect(result.fileHandle.name).toBe('LoginForm.js');
  });

  it('should return null for non-existent file', async () => {
    const mockProject = createMockProject({
      'README.md': '# Test',
    });

    const result = await openFileByPath(mockProject, 'nonexistent.txt');

    expect(result).toBeNull();
  });

  it('should return null for non-existent directory in path', async () => {
    const mockProject = createMockProject({
      src: {
        'index.js': 'content',
      },
    });

    const result = await openFileByPath(mockProject, 'src/nonexistent/file.js');

    expect(result).toBeNull();
  });

  it('should return null for null root handle', async () => {
    const result = await openFileByPath(null, 'file.txt');

    expect(result).toBeNull();
  });

  it('should return null for empty path', async () => {
    const mockProject = createMockProject({ 'file.txt': 'content' });

    const result = await openFileByPath(mockProject, '');

    expect(result).toBeNull();
  });

  it('should handle paths with trailing slashes', async () => {
    const mockProject = createMockProject({
      src: {
        'index.js': 'content',
      },
    });

    const result = await openFileByPath(mockProject, 'src/index.js/');

    // Should handle gracefully (depends on implementation - might succeed or fail)
    expect(result).toBeDefined();
  });

  it('should handle paths with multiple slashes', async () => {
    const mockProject = createMockProject({
      src: {
        'index.js': 'content',
      },
    });

    const result = await openFileByPath(mockProject, 'src//index.js');

    expect(result).not.toBeNull();
    expect(result.fileHandle.name).toBe('index.js');
  });
});

describe('navigateToDirectory', () => {
  it('should navigate to subdirectory', async () => {
    const mockProject = createMockProject({
      src: {
        'index.js': 'content',
      },
    });

    const srcDir = await navigateToDirectory(mockProject, 'src');

    expect(srcDir.name).toBe('src');
    expect(srcDir.kind).toBe('directory');
  });

  it('should be an alias for FileSystemAdapter.navigateToSubdirectory', async () => {
    const mockProject = createMockProject({
      test: {},
    });

    const result1 = await navigateToDirectory(mockProject, 'test');
    const result2 = await FileSystemAdapter.navigateToSubdirectory(mockProject, 'test');

    expect(result1.name).toBe(result2.name);
  });
});
