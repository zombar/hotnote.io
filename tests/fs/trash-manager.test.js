import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrashManager, createTrashManager } from '../../src/fs/trash-manager.js';
import { createMockFileHandle, createMockDirectoryHandle } from '../mocks/filesystem.js';

describe('TrashManager', () => {
  let trashManager;
  let mockDirHandle;
  let mockFileHandle;
  let callbacks;

  beforeEach(() => {
    callbacks = {
      onFileDeleted: vi.fn(),
      onFileRestored: vi.fn(),
      refreshFilePicker: vi.fn(),
    };

    trashManager = new TrashManager(callbacks);

    mockDirHandle = createMockDirectoryHandle('test-dir', {
      'file.txt': 'test content',
      'another.js': 'console.log("test");',
    });

    mockFileHandle = mockDirHandle._getEntry('file.txt');
  });

  afterEach(() => {
    // Clean up any snackbars
    document.querySelectorAll('.snackbar').forEach((el) => el.remove());
  });

  describe('constructor', () => {
    it('should initialize with null trash handle', () => {
      expect(trashManager.trashDirHandle).toBeNull();
    });

    it('should accept custom callbacks', () => {
      const customCallbacks = {
        onFileDeleted: vi.fn(),
        onFileRestored: vi.fn(),
        refreshFilePicker: vi.fn(),
      };

      const manager = new TrashManager(customCallbacks);
      expect(manager.callbacks).toEqual(customCallbacks);
    });

    it('should provide default callbacks if none given', () => {
      const manager = new TrashManager();
      expect(typeof manager.callbacks.onFileDeleted).toBe('function');
      expect(typeof manager.callbacks.onFileRestored).toBe('function');
      expect(typeof manager.callbacks.refreshFilePicker).toBe('function');
    });
  });

  describe('moveToTrash', () => {
    it('should create trash directory on first use', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      expect(trashManager.trashDirHandle).not.toBeNull();
      expect(trashManager.trashDirHandle.name).toBe('.trash');
    });

    it('should copy file to trash before deleting', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      const trashDir = trashManager.trashDirHandle;
      const trashedFile = await trashDir.getFileHandle('file.txt');
      const file = await trashedFile.getFile();
      const content = await file.text();

      expect(content).toBe('test content');
    });

    it('should remove file from original location', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      expect(mockDirHandle._hasEntry('file.txt')).toBe(false);
    });

    it('should call onFileDeleted callback', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      expect(callbacks.onFileDeleted).toHaveBeenCalledWith('file.txt');
    });

    it('should refresh file picker after deletion', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      expect(callbacks.refreshFilePicker).toHaveBeenCalledWith(mockDirHandle);
    });

    it('should reuse existing trash directory', async () => {
      const file1 = mockDirHandle._getEntry('file.txt');
      const file2 = mockDirHandle._getEntry('another.js');

      await trashManager.moveToTrash(mockDirHandle, file1);
      const firstTrashHandle = trashManager.trashDirHandle;

      await trashManager.moveToTrash(mockDirHandle, file2);
      const secondTrashHandle = trashManager.trashDirHandle;

      expect(firstTrashHandle).toBe(secondTrashHandle);
    });

    it('should handle files with special characters in name', async () => {
      mockDirHandle._addEntry(
        'special-file (copy).txt',
        createMockFileHandle('special-file (copy).txt', 'special content')
      );

      const specialFile = mockDirHandle._getEntry('special-file (copy).txt');
      await trashManager.moveToTrash(mockDirHandle, specialFile);

      const trashDir = trashManager.trashDirHandle;
      const trashedFile = await trashDir.getFileHandle('special-file (copy).txt');
      expect(trashedFile.name).toBe('special-file (copy).txt');
    });

    it('should handle empty files', async () => {
      mockDirHandle._addEntry('empty.txt', createMockFileHandle('empty.txt', ''));

      const emptyFile = mockDirHandle._getEntry('empty.txt');
      await trashManager.moveToTrash(mockDirHandle, emptyFile);

      const trashDir = trashManager.trashDirHandle;
      const trashedFile = await trashDir.getFileHandle('empty.txt');
      const file = await trashedFile.getFile();
      const content = await file.text();

      expect(content).toBe('');
    });

    it('should handle large files', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      mockDirHandle._addEntry('large.txt', createMockFileHandle('large.txt', largeContent));

      const largeFile = mockDirHandle._getEntry('large.txt');
      await trashManager.moveToTrash(mockDirHandle, largeFile);

      const trashDir = trashManager.trashDirHandle;
      const trashedFile = await trashDir.getFileHandle('large.txt');
      const file = await trashedFile.getFile();
      const content = await file.text();

      expect(content.length).toBe(1024 * 1024);
    });

    it('should throw error if directory handle is missing', async () => {
      await expect(trashManager.moveToTrash(null, mockFileHandle)).rejects.toThrow(
        'Directory handle and file handle are required'
      );
    });

    it('should throw error if file handle is missing', async () => {
      await expect(trashManager.moveToTrash(mockDirHandle, null)).rejects.toThrow(
        'Directory handle and file handle are required'
      );
    });

    it('should handle write errors gracefully', async () => {
      mockFileHandle.getFile = vi.fn().mockRejectedValue(new Error('Read failed'));

      await expect(trashManager.moveToTrash(mockDirHandle, mockFileHandle)).rejects.toThrow(
        'Error deleting file'
      );
    });
  });

  describe('restoreFromTrash', () => {
    beforeEach(async () => {
      // Setup: move a file to trash first
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);
    });

    it('should restore file from trash', async () => {
      await trashManager.restoreFromTrash(mockDirHandle, 'file.txt');

      expect(mockDirHandle._hasEntry('file.txt')).toBe(true);
    });

    it('should restore file with original content', async () => {
      await trashManager.restoreFromTrash(mockDirHandle, 'file.txt');

      const restoredFile = mockDirHandle._getEntry('file.txt');
      const file = await restoredFile.getFile();
      const content = await file.text();

      expect(content).toBe('test content');
    });

    it('should remove file from trash after restoring', async () => {
      await trashManager.restoreFromTrash(mockDirHandle, 'file.txt');

      const trashDir = trashManager.trashDirHandle;
      expect(trashDir._hasEntry('file.txt')).toBe(false);
    });

    it('should call onFileRestored callback', async () => {
      await trashManager.restoreFromTrash(mockDirHandle, 'file.txt');

      expect(callbacks.onFileRestored).toHaveBeenCalledWith('file.txt');
    });

    it('should refresh file picker after restoration', async () => {
      await trashManager.restoreFromTrash(mockDirHandle, 'file.txt');

      expect(callbacks.refreshFilePicker).toHaveBeenCalledWith(mockDirHandle);
    });

    it('should throw error if trash not initialized', async () => {
      const newManager = new TrashManager(callbacks);

      await expect(newManager.restoreFromTrash(mockDirHandle, 'file.txt')).rejects.toThrow(
        'Trash directory not initialized'
      );
    });

    it('should throw error if file not in trash', async () => {
      await expect(trashManager.restoreFromTrash(mockDirHandle, 'nonexistent.txt')).rejects.toThrow(
        'Error restoring file'
      );
    });

    it('should throw error if directory handle is missing', async () => {
      await expect(trashManager.restoreFromTrash(null, 'file.txt')).rejects.toThrow(
        'Directory handle and filename are required'
      );
    });

    it('should throw error if filename is missing', async () => {
      await expect(trashManager.restoreFromTrash(mockDirHandle, null)).rejects.toThrow(
        'Directory handle and filename are required'
      );
    });
  });

  describe('showUndoSnackbar', () => {
    it('should create snackbar element', () => {
      trashManager.showUndoSnackbar('file.txt', mockDirHandle);

      const snackbar = document.querySelector('.snackbar');
      expect(snackbar).not.toBeNull();
    });

    it('should display correct message', () => {
      trashManager.showUndoSnackbar('file.txt', mockDirHandle);

      const message = document.querySelector('.snackbar-message');
      expect(message.textContent).toBe('Deleted file.txt');
    });

    it('should accept custom message', () => {
      trashManager.showUndoSnackbar('file.txt', mockDirHandle, {
        message: 'Custom message',
      });

      const message = document.querySelector('.snackbar-message');
      expect(message.textContent).toBe('Custom message');
    });

    it('should create undo button', () => {
      trashManager.showUndoSnackbar('file.txt', mockDirHandle);

      const undoBtn = document.querySelector('.snackbar-action');
      expect(undoBtn).not.toBeNull();
      expect(undoBtn.textContent).toBe('UNDO');
    });

    it('should accept custom action text', () => {
      trashManager.showUndoSnackbar('file.txt', mockDirHandle, {
        actionText: 'RESTORE',
      });

      const undoBtn = document.querySelector('.snackbar-action');
      expect(undoBtn.textContent).toBe('RESTORE');
    });

    it('should add visible class after animation delay', async () => {
      trashManager.showUndoSnackbar('file.txt', mockDirHandle);

      const snackbar = document.querySelector('.snackbar');
      expect(snackbar.classList.contains('visible')).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(snackbar.classList.contains('visible')).toBe(true);
    });

    it('should remove existing snackbar before creating new one', () => {
      trashManager.showUndoSnackbar('file1.txt', mockDirHandle);
      trashManager.showUndoSnackbar('file2.txt', mockDirHandle);

      const snackbars = document.querySelectorAll('.snackbar');
      expect(snackbars.length).toBe(1);
      expect(snackbars[0].textContent).toContain('file2.txt');
    });

    it('should auto-dismiss after specified duration', async () => {
      trashManager.showUndoSnackbar('file.txt', mockDirHandle, {
        duration: 100,
      });

      const snackbar = document.querySelector('.snackbar');
      expect(snackbar).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(snackbar.classList.contains('visible')).toBe(false);
    });

    it('should restore file when undo is clicked', async () => {
      // Setup: move file to trash first
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      trashManager.showUndoSnackbar('file.txt', mockDirHandle);

      const undoBtn = document.querySelector('.snackbar-action');
      undoBtn.click();

      // Wait for async restoration to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockDirHandle._hasEntry('file.txt')).toBe(true);
    });

    it('should remove snackbar after undo is clicked', async () => {
      // Setup: move file to trash first
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      trashManager.showUndoSnackbar('file.txt', mockDirHandle);

      const undoBtn = document.querySelector('.snackbar-action');
      await undoBtn.click();

      // Give time for snackbar to be removed
      await new Promise((resolve) => setTimeout(resolve, 10));

      const snackbar = document.querySelector('.snackbar');
      expect(snackbar).toBeNull();
    });

    it('should add data-testid attribute', () => {
      trashManager.showUndoSnackbar('file.txt', mockDirHandle);

      const snackbar = document.querySelector('[data-testid="snackbar"]');
      expect(snackbar).not.toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove trash directory', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);
      await trashManager.cleanup(mockDirHandle);

      expect(mockDirHandle._hasEntry('.trash')).toBe(false);
    });

    it('should reset trash handle', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);
      await trashManager.cleanup(mockDirHandle);

      expect(trashManager.trashDirHandle).toBeNull();
    });

    it('should handle cleanup when trash not initialized', async () => {
      await expect(trashManager.cleanup(mockDirHandle)).resolves.not.toThrow();
    });

    it('should handle missing directory handle', async () => {
      await expect(trashManager.cleanup(null)).resolves.not.toThrow();
    });

    it('should throw error on cleanup failure', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      mockDirHandle.removeEntry = vi.fn().mockRejectedValue(new Error('Permission denied'));

      await expect(trashManager.cleanup(mockDirHandle)).rejects.toThrow('Error cleaning up trash');
    });
  });

  describe('hasTrash', () => {
    it('should return false when trash not initialized', () => {
      expect(trashManager.hasTrash()).toBe(false);
    });

    it('should return true when trash is initialized', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      expect(trashManager.hasTrash()).toBe(true);
    });

    it('should return false after cleanup', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);
      await trashManager.cleanup(mockDirHandle);

      expect(trashManager.hasTrash()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset trash handle to null', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);
      trashManager.reset();

      expect(trashManager.trashDirHandle).toBeNull();
    });

    it('should allow reinitialization after reset', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);
      trashManager.reset();

      const newFile = createMockFileHandle('new.txt', 'new content');
      mockDirHandle._addEntry('new.txt', newFile);

      await trashManager.moveToTrash(mockDirHandle, newFile);

      expect(trashManager.trashDirHandle).not.toBeNull();
    });
  });

  describe('getTrashHandle', () => {
    it('should return null when trash not initialized', () => {
      expect(trashManager.getTrashHandle()).toBeNull();
    });

    it('should return trash handle when initialized', async () => {
      await trashManager.moveToTrash(mockDirHandle, mockFileHandle);

      const handle = trashManager.getTrashHandle();
      expect(handle).not.toBeNull();
      expect(handle.name).toBe('.trash');
    });
  });

  describe('createTrashManager', () => {
    it('should create a TrashManager instance', () => {
      const manager = createTrashManager();

      expect(manager).toBeInstanceOf(TrashManager);
    });

    it('should accept callbacks', () => {
      const customCallbacks = {
        onFileDeleted: vi.fn(),
        onFileRestored: vi.fn(),
        refreshFilePicker: vi.fn(),
      };

      const manager = createTrashManager(customCallbacks);

      expect(manager.callbacks).toEqual(customCallbacks);
    });
  });
});
