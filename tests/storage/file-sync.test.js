import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileSyncManager, createFileSyncManager } from '../../src/storage/file-sync.js';

describe('FileSyncManager', () => {
  let manager;
  let callbacks;
  let fileHandle;

  beforeEach(() => {
    vi.useFakeTimers();
    fileHandle = { kind: 'file', name: 'test.txt' };
    callbacks = {
      getFileHandle: vi.fn(() => fileHandle),
      getFileMetadata: vi.fn(async () => ({ lastModified: Date.now() })),
      readFile: vi.fn(async () => 'file content'),
      isUserIdle: vi.fn(() => true),
      getCurrentEditorState: vi.fn(() => ({
        scrollTop: 0,
        cursorLine: 0,
        cursorColumn: 0,
      })),
      updateEditorContent: vi.fn(async () => {}),
      onFileReloaded: vi.fn(),
      onSyncError: vi.fn(),
      onSyncStart: vi.fn(),
      onSyncEnd: vi.fn(),
    };
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      manager = new FileSyncManager();

      expect(manager.interval).toBe(2500);
      expect(manager.idleThreshold).toBe(4000);
      expect(manager.enabled).toBe(true);
      expect(manager.intervalId).toBeNull();
      expect(manager.lastKnownModified).toBeNull();
      expect(manager.lastModifiedLocal).toBeNull();
      expect(manager.isPaused).toBe(false);
    });

    it('should accept custom interval', () => {
      manager = new FileSyncManager({ interval: 5000 });

      expect(manager.interval).toBe(5000);
    });

    it('should accept custom idle threshold', () => {
      manager = new FileSyncManager({ idleThreshold: 3000 });

      expect(manager.idleThreshold).toBe(3000);
    });

    it('should accept enabled state', () => {
      manager = new FileSyncManager({ enabled: false });

      expect(manager.enabled).toBe(false);
    });

    it('should accept callbacks', () => {
      manager = new FileSyncManager(callbacks);

      expect(manager.callbacks.getFileHandle).toBe(callbacks.getFileHandle);
      expect(manager.callbacks.getFileMetadata).toBe(callbacks.getFileMetadata);
      expect(manager.callbacks.readFile).toBe(callbacks.readFile);
    });

    it('should provide default callbacks', () => {
      manager = new FileSyncManager();

      expect(typeof manager.callbacks.getFileHandle).toBe('function');
      expect(typeof manager.callbacks.getFileMetadata).toBe('function');
      expect(typeof manager.callbacks.readFile).toBe('function');
      expect(typeof manager.callbacks.onFileReloaded).toBe('function');
      expect(typeof manager.callbacks.onSyncError).toBe('function');
    });
  });

  describe('start', () => {
    it('should start polling interval', () => {
      manager = new FileSyncManager(callbacks);
      manager.start();

      expect(manager.intervalId).not.toBeNull();
    });

    it('should clear existing interval before starting new one', () => {
      manager = new FileSyncManager(callbacks);
      manager.start();
      const firstIntervalId = manager.intervalId;

      manager.start();
      const secondIntervalId = manager.intervalId;

      expect(firstIntervalId).not.toBe(secondIntervalId);
    });

    it('should call checkForExternalChanges on interval', async () => {
      manager = new FileSyncManager(callbacks);
      const spy = vi.spyOn(manager, 'checkForExternalChanges');
      manager.start();

      await vi.advanceTimersByTimeAsync(2500);

      expect(spy).toHaveBeenCalled();
    });

    it('should respect custom interval', async () => {
      manager = new FileSyncManager({ ...callbacks, interval: 5000 });
      const spy = vi.spyOn(manager, 'checkForExternalChanges');
      manager.start();

      // Should not check after 2.5 seconds
      await vi.advanceTimersByTimeAsync(2500);
      expect(spy).not.toHaveBeenCalled();

      // Should check after 5 seconds
      await vi.advanceTimersByTimeAsync(2500);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should stop polling interval', () => {
      manager = new FileSyncManager(callbacks);
      manager.start();
      manager.stop();

      expect(manager.intervalId).toBeNull();
    });

    it('should prevent further checks after stopping', async () => {
      manager = new FileSyncManager(callbacks);
      const spy = vi.spyOn(manager, 'checkForExternalChanges');
      manager.start();
      manager.stop();

      await vi.advanceTimersByTimeAsync(5000);

      expect(spy).not.toHaveBeenCalled();
    });

    it('should handle stopping when not started', () => {
      manager = new FileSyncManager(callbacks);

      expect(() => manager.stop()).not.toThrow();
      expect(manager.intervalId).toBeNull();
    });
  });

  describe('pause and resume', () => {
    it('should pause polling', () => {
      manager = new FileSyncManager(callbacks);
      manager.pause();

      expect(manager.isPaused).toBe(true);
    });

    it('should resume polling', () => {
      manager = new FileSyncManager(callbacks);
      manager.pause();
      manager.resume();

      expect(manager.isPaused).toBe(false);
    });

    it('should not check file when paused', async () => {
      manager = new FileSyncManager(callbacks);
      manager.start();
      manager.pause();

      await vi.advanceTimersByTimeAsync(2500);

      expect(callbacks.getFileMetadata).not.toHaveBeenCalled();
    });

    it('should check file after resume', async () => {
      manager = new FileSyncManager(callbacks);
      manager.start();
      manager.pause();

      await vi.advanceTimersByTimeAsync(2500);
      expect(callbacks.getFileMetadata).not.toHaveBeenCalled();

      manager.resume();
      await vi.advanceTimersByTimeAsync(2500);

      expect(callbacks.getFileMetadata).toHaveBeenCalled();
    });
  });

  describe('updateUserActivity', () => {
    it('should update last user activity time', () => {
      manager = new FileSyncManager(callbacks);
      const initialTime = manager.lastUserActivityTime;

      vi.advanceTimersByTime(1000);
      manager.updateUserActivity();

      expect(manager.lastUserActivityTime).toBeGreaterThan(initialTime);
    });
  });

  describe('isUserIdle', () => {
    it('should return false when user is active', () => {
      manager = new FileSyncManager(callbacks);
      manager.updateUserActivity();

      expect(manager.isUserIdle()).toBe(false);
    });

    it('should return true after idle threshold', () => {
      manager = new FileSyncManager({ idleThreshold: 4000 });
      manager.updateUserActivity();

      vi.advanceTimersByTime(4001);

      expect(manager.isUserIdle()).toBe(true);
    });

    it('should return false before idle threshold', () => {
      manager = new FileSyncManager({ idleThreshold: 4000 });
      manager.updateUserActivity();

      vi.advanceTimersByTime(3000);

      expect(manager.isUserIdle()).toBe(false);
    });

    it('should respect custom idle threshold', () => {
      manager = new FileSyncManager({ idleThreshold: 2000 });
      manager.updateUserActivity();

      vi.advanceTimersByTime(2001);

      expect(manager.isUserIdle()).toBe(true);
    });
  });

  describe('shouldPollFile', () => {
    it('should return true when all conditions are met', () => {
      manager = new FileSyncManager(callbacks);
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000); // Make user idle

      expect(manager.shouldPollFile()).toBe(true);
    });

    it('should return false when no file handle', () => {
      callbacks.getFileHandle = vi.fn(() => null);
      manager = new FileSyncManager(callbacks);
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000);

      expect(manager.shouldPollFile()).toBe(false);
    });

    it('should return false when paused', () => {
      manager = new FileSyncManager(callbacks);
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000);
      manager.pause();

      expect(manager.shouldPollFile()).toBe(false);
    });

    it('should return false when user is not idle', () => {
      manager = new FileSyncManager(callbacks);
      manager.updateUserActivity();

      expect(manager.shouldPollFile()).toBe(false);
    });
  });

  describe('checkForExternalChanges', () => {
    it('should not check when shouldPollFile returns false', async () => {
      callbacks.getFileHandle = vi.fn(() => null);
      manager = new FileSyncManager(callbacks);

      await manager.checkForExternalChanges();

      expect(callbacks.getFileMetadata).not.toHaveBeenCalled();
    });

    it('should check file metadata when conditions are met', async () => {
      manager = new FileSyncManager(callbacks);
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000);

      await manager.checkForExternalChanges();

      expect(callbacks.getFileMetadata).toHaveBeenCalledWith(fileHandle);
    });

    it('should not reconcile when file not modified externally', async () => {
      const now = Date.now();
      callbacks.getFileMetadata = vi.fn(async () => ({ lastModified: now }));
      manager = new FileSyncManager(callbacks);
      manager.lastKnownModified = now;
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000);

      await manager.checkForExternalChanges();

      expect(callbacks.readFile).not.toHaveBeenCalled();
    });

    it('should reconcile when file modified externally', async () => {
      const oldTime = Date.now();
      vi.advanceTimersByTime(1000);
      const newTime = Date.now();

      callbacks.getFileMetadata = vi.fn(async () => ({ lastModified: newTime }));
      manager = new FileSyncManager(callbacks);
      manager.lastKnownModified = oldTime;
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000);

      await manager.checkForExternalChanges();

      expect(callbacks.readFile).toHaveBeenCalledWith(fileHandle);
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      callbacks.getFileMetadata = vi.fn().mockRejectedValue(new Error('Test error'));
      manager = new FileSyncManager(callbacks);
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000);

      await manager.checkForExternalChanges();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[File Sync] Error checking file for external changes:',
        expect.any(Error)
      );
      expect(callbacks.onSyncError).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should stop polling on NotFoundError', async () => {
      const error = new Error('File not found');
      error.name = 'NotFoundError';
      callbacks.getFileMetadata = vi.fn().mockRejectedValue(error);
      manager = new FileSyncManager(callbacks);
      manager.start();
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000);

      await manager.checkForExternalChanges();

      expect(manager.intervalId).toBeNull();
    });

    it('should stop polling on NotAllowedError', async () => {
      const error = new Error('Not allowed');
      error.name = 'NotAllowedError';
      callbacks.getFileMetadata = vi.fn().mockRejectedValue(error);
      manager = new FileSyncManager(callbacks);
      manager.start();
      manager.updateUserActivity();
      vi.advanceTimersByTime(5000);

      await manager.checkForExternalChanges();

      expect(manager.intervalId).toBeNull();
    });
  });

  describe('reconcileChanges', () => {
    it('should skip reload when local changes are newer', async () => {
      const externalModified = 1000;
      manager = new FileSyncManager(callbacks);
      manager.lastModifiedLocal = 2000;

      await manager.reconcileChanges(externalModified);

      expect(callbacks.readFile).not.toHaveBeenCalled();
    });

    it('should reload when external changes are newer', async () => {
      const externalModified = 2000;
      manager = new FileSyncManager(callbacks);
      manager.lastModifiedLocal = 1000;

      await manager.reconcileChanges(externalModified);

      expect(callbacks.readFile).toHaveBeenCalled();
    });

    it('should reload when no local changes', async () => {
      const externalModified = 2000;
      manager = new FileSyncManager(callbacks);
      manager.lastModifiedLocal = null;

      await manager.reconcileChanges(externalModified);

      expect(callbacks.readFile).toHaveBeenCalled();
    });

    it('should call onSyncStart before reload', async () => {
      const externalModified = 2000;
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(callbacks.onSyncStart).toHaveBeenCalled();
    });

    it('should get current editor state before reload', async () => {
      const externalModified = 2000;
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(callbacks.getCurrentEditorState).toHaveBeenCalled();
    });

    it('should read fresh content from file', async () => {
      const externalModified = 2000;
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(callbacks.readFile).toHaveBeenCalledWith(fileHandle);
    });

    it('should update editor with fresh content', async () => {
      const externalModified = 2000;
      const editorState = { scrollTop: 100, cursorLine: 5, cursorColumn: 10 };
      callbacks.getCurrentEditorState = vi.fn(() => editorState);
      callbacks.readFile = vi.fn(async () => 'fresh content');
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(callbacks.updateEditorContent).toHaveBeenCalledWith('fresh content', editorState);
    });

    it('should update lastKnownModified timestamp', async () => {
      const externalModified = 2000;
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(manager.lastKnownModified).toBe(externalModified);
    });

    it('should clear lastModifiedLocal timestamp', async () => {
      const externalModified = 2000;
      manager = new FileSyncManager(callbacks);
      manager.lastModifiedLocal = 1000;

      await manager.reconcileChanges(externalModified);

      expect(manager.lastModifiedLocal).toBeNull();
    });

    it('should call onSyncEnd after reload', async () => {
      const externalModified = 2000;
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(callbacks.onSyncEnd).toHaveBeenCalled();
    });

    it('should call onFileReloaded with fresh content', async () => {
      const externalModified = 2000;
      callbacks.readFile = vi.fn(async () => 'fresh content');
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(callbacks.onFileReloaded).toHaveBeenCalledWith('fresh content');
    });

    it('should handle reload errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const externalModified = 2000;
      callbacks.readFile = vi.fn().mockRejectedValue(new Error('Read error'));
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[File Sync] Error reloading file:',
        expect.any(Error)
      );
      expect(callbacks.onSyncError).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should skip reload when no file handle', async () => {
      const externalModified = 2000;
      callbacks.getFileHandle = vi.fn(() => null);
      manager = new FileSyncManager(callbacks);

      await manager.reconcileChanges(externalModified);

      expect(callbacks.readFile).not.toHaveBeenCalled();
    });
  });

  describe('updateLastKnownModified', () => {
    it('should update last known modified timestamp', () => {
      manager = new FileSyncManager();
      manager.updateLastKnownModified(12345);

      expect(manager.lastKnownModified).toBe(12345);
    });
  });

  describe('updateLastModifiedLocal', () => {
    it('should update last modified local timestamp', () => {
      manager = new FileSyncManager();
      manager.updateLastModifiedLocal(54321);

      expect(manager.lastModifiedLocal).toBe(54321);
    });
  });

  describe('getLastKnownModified', () => {
    it('should return last known modified timestamp', () => {
      manager = new FileSyncManager();
      manager.lastKnownModified = 12345;

      expect(manager.getLastKnownModified()).toBe(12345);
    });
  });

  describe('getLastModifiedLocal', () => {
    it('should return last modified local timestamp', () => {
      manager = new FileSyncManager();
      manager.lastModifiedLocal = 54321;

      expect(manager.getLastModifiedLocal()).toBe(54321);
    });
  });

  describe('isRunning', () => {
    it('should return false when not started', () => {
      manager = new FileSyncManager();

      expect(manager.isRunning()).toBe(false);
    });

    it('should return true when started', () => {
      manager = new FileSyncManager(callbacks);
      manager.start();

      expect(manager.isRunning()).toBe(true);
    });

    it('should return false after stopped', () => {
      manager = new FileSyncManager(callbacks);
      manager.start();
      manager.stop();

      expect(manager.isRunning()).toBe(false);
    });
  });

  describe('isPausedState', () => {
    it('should return false initially', () => {
      manager = new FileSyncManager();

      expect(manager.isPausedState()).toBe(false);
    });

    it('should return true when paused', () => {
      manager = new FileSyncManager();
      manager.pause();

      expect(manager.isPausedState()).toBe(true);
    });

    it('should return false after resumed', () => {
      manager = new FileSyncManager();
      manager.pause();
      manager.resume();

      expect(manager.isPausedState()).toBe(false);
    });
  });

  describe('setInterval', () => {
    it('should update interval', () => {
      manager = new FileSyncManager();
      manager.setInterval(3000);

      expect(manager.interval).toBe(3000);
    });

    it('should restart if currently running', () => {
      manager = new FileSyncManager(callbacks);
      manager.start();
      const oldIntervalId = manager.intervalId;

      manager.setInterval(3000);

      expect(manager.intervalId).not.toBe(oldIntervalId);
      expect(manager.intervalId).not.toBeNull();
    });

    it('should not start if not currently running', () => {
      manager = new FileSyncManager();
      manager.setInterval(3000);

      expect(manager.intervalId).toBeNull();
    });

    it('should use new interval for subsequent checks', async () => {
      manager = new FileSyncManager(callbacks);
      const spy = vi.spyOn(manager, 'checkForExternalChanges');
      manager.start();
      manager.setInterval(4000);

      // Should not check after 2.5 seconds
      await vi.advanceTimersByTimeAsync(2500);
      expect(spy).not.toHaveBeenCalled();

      // Should check after 4 seconds
      await vi.advanceTimersByTimeAsync(1500);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getInterval', () => {
    it('should return current interval', () => {
      manager = new FileSyncManager({ interval: 3000 });

      expect(manager.getInterval()).toBe(3000);
    });

    it('should return updated interval', () => {
      manager = new FileSyncManager();
      manager.setInterval(5000);

      expect(manager.getInterval()).toBe(5000);
    });
  });

  describe('setIdleThreshold', () => {
    it('should update idle threshold', () => {
      manager = new FileSyncManager();
      manager.setIdleThreshold(3000);

      expect(manager.idleThreshold).toBe(3000);
    });
  });

  describe('getIdleThreshold', () => {
    it('should return current idle threshold', () => {
      manager = new FileSyncManager({ idleThreshold: 3000 });

      expect(manager.getIdleThreshold()).toBe(3000);
    });

    it('should return updated idle threshold', () => {
      manager = new FileSyncManager();
      manager.setIdleThreshold(5000);

      expect(manager.getIdleThreshold()).toBe(5000);
    });
  });

  describe('reset', () => {
    it('should stop polling', () => {
      manager = new FileSyncManager(callbacks);
      manager.start();
      manager.reset();

      expect(manager.intervalId).toBeNull();
    });

    it('should reset to default values', () => {
      manager = new FileSyncManager({
        interval: 5000,
        idleThreshold: 6000,
        enabled: false,
      });
      manager.lastKnownModified = 12345;
      manager.lastModifiedLocal = 54321;
      manager.pause();

      manager.reset();

      expect(manager.enabled).toBe(true);
      expect(manager.interval).toBe(2500);
      expect(manager.idleThreshold).toBe(4000);
      expect(manager.lastKnownModified).toBeNull();
      expect(manager.lastModifiedLocal).toBeNull();
      expect(manager.isPaused).toBe(false);
    });
  });
});

describe('createFileSyncManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a FileSyncManager instance', () => {
    const manager = createFileSyncManager();

    expect(manager).toBeInstanceOf(FileSyncManager);
  });

  it('should pass options to constructor', () => {
    const manager = createFileSyncManager({ interval: 3000, idleThreshold: 5000 });

    expect(manager.interval).toBe(3000);
    expect(manager.idleThreshold).toBe(5000);
  });
});
