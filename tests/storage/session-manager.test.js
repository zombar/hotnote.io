import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSessionFileName,
  createEmptySession,
  loadSessionFile,
  saveSessionFile,
  initSessionManager,
} from '../../src/storage/session-manager.js';

describe('Session Manager', () => {
  let mockFileSystemAdapter;
  let mockDirHandle;

  beforeEach(() => {
    // Mock FileSystemAdapter
    mockFileSystemAdapter = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    };

    // Mock directory handle
    mockDirHandle = {
      name: 'test-project',
      getFileHandle: vi.fn(),
    };

    // Initialize session manager with mock adapter
    initSessionManager(mockFileSystemAdapter);
  });

  describe('createSessionFileName', () => {
    it('should return fixed session filename', () => {
      const filename = createSessionFileName(mockDirHandle);
      expect(filename).toBe('.session_properties.HN');
    });
  });

  describe('createEmptySession', () => {
    it('should create empty session object with correct structure', () => {
      const session = createEmptySession('my-project');

      expect(session).toHaveProperty('version', '1.0');
      expect(session).toHaveProperty('folderName', 'my-project');
      expect(session).toHaveProperty('lastModified');
      expect(session).toHaveProperty('session');
      expect(session.session).toHaveProperty('lastOpenFile', null);
      expect(session).toHaveProperty('comments');
      expect(Array.isArray(session.comments)).toBe(true);
    });

    it('should set timestamp', () => {
      const before = Date.now();
      const session = createEmptySession('test');
      const after = Date.now();

      expect(session.lastModified).toBeGreaterThanOrEqual(before);
      expect(session.lastModified).toBeLessThanOrEqual(after);
    });
  });

  describe('loadSessionFile', () => {
    it('should load and parse session file', async () => {
      const mockSessionData = {
        version: '1.0',
        folderName: 'test',
        session: { lastOpenFile: 'test.js' },
      };

      const mockFileHandle = {
        getFile: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue(JSON.stringify(mockSessionData)),
        }),
      };

      mockDirHandle.getFileHandle.mockResolvedValue(mockFileHandle);
      mockFileSystemAdapter.readFile.mockResolvedValue(JSON.stringify(mockSessionData));

      const result = await loadSessionFile(mockDirHandle);

      expect(mockDirHandle.getFileHandle).toHaveBeenCalledWith('.session_properties.HN', {
        create: false,
      });
      expect(result).toEqual(mockSessionData);
    });

    it('should return null if file does not exist', async () => {
      mockDirHandle.getFileHandle.mockRejectedValue(new Error('NotFoundError'));

      const result = await loadSessionFile(mockDirHandle);

      expect(result).toBeNull();
    });

    it('should return null if JSON is invalid', async () => {
      const mockFileHandle = {};
      mockDirHandle.getFileHandle.mockResolvedValue(mockFileHandle);
      mockFileSystemAdapter.readFile.mockResolvedValue('{ invalid json');

      const result = await loadSessionFile(mockDirHandle);

      expect(result).toBeNull();
    });
  });

  describe('saveSessionFile', () => {
    it('should save session data to file', async () => {
      const sessionData = {
        version: '1.0',
        folderName: 'test',
        session: { lastOpenFile: 'index.js' },
      };

      const mockFileHandle = {};
      mockDirHandle.getFileHandle.mockResolvedValue(mockFileHandle);
      mockFileSystemAdapter.writeFile.mockResolvedValue(undefined);

      await saveSessionFile(mockDirHandle, sessionData);

      expect(mockDirHandle.getFileHandle).toHaveBeenCalledWith('.session_properties.HN', {
        create: true,
      });
      expect(sessionData).toHaveProperty('lastModified');
      expect(mockFileSystemAdapter.writeFile).toHaveBeenCalledWith(
        mockFileHandle,
        expect.stringContaining('"version"')
      );
    });

    it('should add lastModified timestamp when saving', async () => {
      const sessionData = {
        version: '1.0',
        folderName: 'test',
        session: {},
      };

      mockDirHandle.getFileHandle.mockResolvedValue({});
      mockFileSystemAdapter.writeFile.mockResolvedValue(undefined);

      const before = Date.now();
      await saveSessionFile(mockDirHandle, sessionData);
      const after = Date.now();

      expect(sessionData.lastModified).toBeGreaterThanOrEqual(before);
      expect(sessionData.lastModified).toBeLessThanOrEqual(after);
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockDirHandle.getFileHandle.mockRejectedValue(new Error('Permission denied'));

      const sessionData = { version: '1.0' };

      await saveSessionFile(mockDirHandle, sessionData);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error saving session file:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should format JSON with indentation', async () => {
      const sessionData = {
        version: '1.0',
        session: { lastOpenFile: 'test.js' },
      };

      mockDirHandle.getFileHandle.mockResolvedValue({});
      mockFileSystemAdapter.writeFile.mockImplementation((handle, content) => {
        expect(content).toContain('\n');
        expect(content).toMatch(/"version": "1\.0"/);
        return Promise.resolve();
      });

      await saveSessionFile(mockDirHandle, sessionData);

      expect(mockFileSystemAdapter.writeFile).toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle save and load cycle', async () => {
      const originalData = {
        version: '1.0',
        folderName: 'test-project',
        session: {
          lastOpenFile: {
            path: 'src/index.js',
            cursorLine: 10,
            cursorColumn: 5,
          },
        },
        comments: [],
      };

      let savedContent = '';
      const mockFileHandle = {};

      // Setup save
      mockDirHandle.getFileHandle.mockResolvedValueOnce(mockFileHandle);
      mockFileSystemAdapter.writeFile.mockImplementation((handle, content) => {
        savedContent = content;
        return Promise.resolve();
      });

      // Save
      await saveSessionFile(mockDirHandle, originalData);

      // Setup load
      mockDirHandle.getFileHandle.mockResolvedValueOnce(mockFileHandle);
      mockFileSystemAdapter.readFile.mockResolvedValue(savedContent);

      // Load
      const loadedData = await loadSessionFile(mockDirHandle);

      expect(loadedData.version).toBe(originalData.version);
      expect(loadedData.folderName).toBe(originalData.folderName);
      expect(loadedData.session.lastOpenFile.path).toBe('src/index.js');
      expect(loadedData.session.lastOpenFile.cursorLine).toBe(10);
    });
  });
});
