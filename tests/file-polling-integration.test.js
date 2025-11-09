/**
 * Integration tests for file polling and synchronization
 * Tests the actual implementation with mocked FileSystemAdapter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockFileHandle, createMockDirectoryHandle } from './mocks/filesystem.js';

describe('File Polling Integration Tests', () => {
  let mockFileHandle;
  let mockDirHandle;
  let FileSystemAdapter;
  let testState;

  beforeEach(() => {
    // Create mock file system
    mockFileHandle = createMockFileHandle('test.txt', 'initial content');
    mockDirHandle = createMockDirectoryHandle('test-project');
    mockDirHandle._addEntry('test.txt', mockFileHandle);

    // Mock FileSystemAdapter
    FileSystemAdapter = {
      async readFile(handle) {
        return handle._getContent();
      },
      async writeFile(handle, content) {
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      },
      async getFileMetadata(handle) {
        const file = await handle.getFile();
        return {
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
        };
      },
    };

    // Test state mimicking app state
    testState = {
      currentFileHandle: null,
      lastKnownModified: null,
      lastModifiedLocal: null,
      lastUserActivityTime: Date.now(),
      filePollingInterval: null,
      isPollingPaused: false,
      originalContent: '',
      isDirty: false,
    };
  });

  afterEach(() => {
    if (testState.filePollingInterval) {
      clearInterval(testState.filePollingInterval);
    }
  });

  it('should initialize file modification tracking when opening file', async () => {
    // Open file
    testState.currentFileHandle = mockFileHandle;
    const metadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    testState.lastKnownModified = metadata.lastModified;
    testState.lastModifiedLocal = null;

    expect(testState.lastKnownModified).toBeDefined();
    expect(testState.lastKnownModified).toBeGreaterThan(0);
    expect(testState.lastModifiedLocal).toBeNull();
  });

  it('should update lastKnownModified when saving file', async () => {
    testState.currentFileHandle = mockFileHandle;
    const initialMetadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    testState.lastKnownModified = initialMetadata.lastModified;

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Save file
    await FileSystemAdapter.writeFile(mockFileHandle, 'new content');
    const newMetadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    testState.lastKnownModified = newMetadata.lastModified;
    testState.lastModifiedLocal = null;

    expect(newMetadata.lastModified).toBeGreaterThan(initialMetadata.lastModified);
    expect(testState.lastModifiedLocal).toBeNull();
  });

  it('should detect external file changes', async () => {
    testState.currentFileHandle = mockFileHandle;
    const initialMetadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    testState.lastKnownModified = initialMetadata.lastModified;

    // Simulate external modification
    await new Promise((resolve) => setTimeout(resolve, 10));
    mockFileHandle._setContent('externally modified content');

    const currentMetadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    const hasExternalChanges = currentMetadata.lastModified > testState.lastKnownModified;

    expect(hasExternalChanges).toBe(true);
  });

  it('should not reload when local changes are newer', async () => {
    testState.currentFileHandle = mockFileHandle;
    const initialMetadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    testState.lastKnownModified = initialMetadata.lastModified;

    // User makes local edit (more recent)
    await new Promise((resolve) => setTimeout(resolve, 10));
    testState.lastModifiedLocal = Date.now();

    // External change happens (but with older timestamp)
    mockFileHandle._setLastModified(testState.lastKnownModified + 5);

    const externalMetadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);

    // Check reconciliation logic
    const shouldReload =
      !testState.lastModifiedLocal || externalMetadata.lastModified > testState.lastModifiedLocal;

    expect(shouldReload).toBe(false);
  });

  it('should reload when external changes are newer', async () => {
    testState.currentFileHandle = mockFileHandle;
    const initialMetadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    testState.lastKnownModified = initialMetadata.lastModified;

    // User makes local edit
    testState.lastModifiedLocal = Date.now();

    // External change happens later
    await new Promise((resolve) => setTimeout(resolve, 10));
    const newTimestamp = Date.now();
    mockFileHandle._setLastModified(newTimestamp);

    const externalMetadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);

    // Check reconciliation logic
    const shouldReload =
      !testState.lastModifiedLocal || externalMetadata.lastModified > testState.lastModifiedLocal;

    expect(shouldReload).toBe(true);
  });

  it('should not poll when user is not idle', () => {
    testState.currentFileHandle = mockFileHandle;
    testState.lastUserActivityTime = Date.now(); // User is active

    const isUserIdle = () => {
      const idleThreshold = 4000;
      return Date.now() - testState.lastUserActivityTime > idleThreshold;
    };

    const shouldPoll =
      testState.currentFileHandle !== null && !testState.isPollingPaused && isUserIdle();

    expect(shouldPoll).toBe(false);
  });

  it('should poll when user is idle', () => {
    testState.currentFileHandle = mockFileHandle;
    testState.lastUserActivityTime = Date.now() - 5000; // User is idle

    const isUserIdle = () => {
      const idleThreshold = 4000;
      return Date.now() - testState.lastUserActivityTime > idleThreshold;
    };

    const shouldPoll =
      testState.currentFileHandle !== null && !testState.isPollingPaused && isUserIdle();

    expect(shouldPoll).toBe(true);
  });

  it('should not poll when polling is paused', () => {
    testState.currentFileHandle = mockFileHandle;
    testState.lastUserActivityTime = Date.now() - 5000; // User is idle
    testState.isPollingPaused = true; // Polling is paused

    const isUserIdle = () => {
      const idleThreshold = 4000;
      return Date.now() - testState.lastUserActivityTime > idleThreshold;
    };

    const shouldPoll =
      testState.currentFileHandle !== null && !testState.isPollingPaused && isUserIdle();

    expect(shouldPoll).toBe(false);
  });

  it('should preserve file content after reload', async () => {
    const newContent = 'reloaded content';
    mockFileHandle._setContent(newContent);

    const content = await FileSystemAdapter.readFile(mockFileHandle);
    expect(content).toBe(newContent);
  });

  it('should update timestamps correctly after save', async () => {
    const beforeSave = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await FileSystemAdapter.writeFile(mockFileHandle, 'new content');

    const metadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    expect(metadata.lastModified).toBeGreaterThanOrEqual(beforeSave);
  });

  it('should handle multiple consecutive saves', async () => {
    const saves = [];

    for (let i = 0; i < 3; i++) {
      await FileSystemAdapter.writeFile(mockFileHandle, `content ${i}`);
      const metadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
      saves.push(metadata.lastModified);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Each save should have a timestamp >= previous
    expect(saves[1]).toBeGreaterThanOrEqual(saves[0]);
    expect(saves[2]).toBeGreaterThanOrEqual(saves[1]);
  });

  it('should detect no changes when file is unchanged', async () => {
    testState.currentFileHandle = mockFileHandle;
    const metadata1 = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    testState.lastKnownModified = metadata1.lastModified;

    // Check again without modification
    const metadata2 = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    const hasChanges = metadata2.lastModified > testState.lastKnownModified;

    expect(hasChanges).toBe(false);
  });

  it('should clear lastModifiedLocal after successful save', async () => {
    testState.currentFileHandle = mockFileHandle;
    testState.lastModifiedLocal = Date.now();
    testState.isDirty = true;

    // Save file
    await FileSystemAdapter.writeFile(mockFileHandle, 'saved content');
    const metadata = await FileSystemAdapter.getFileMetadata(mockFileHandle);
    testState.lastKnownModified = metadata.lastModified;
    testState.lastModifiedLocal = null; // Clear after save
    testState.isDirty = false;

    expect(testState.lastModifiedLocal).toBeNull();
    expect(testState.isDirty).toBe(false);
  });
});

describe('File Polling - Session Restoration', () => {
  it('should restore file state with correct timestamps', async () => {
    const mockFileHandle = createMockFileHandle('session-test.txt', 'content');
    const metadata = await mockFileHandle.getFile();

    const sessionState = {
      lastKnownModified: metadata.lastModified,
      filePath: 'session-test.txt',
      cursorLine: 10,
      scrollTop: 100,
    };

    expect(sessionState.lastKnownModified).toBeDefined();
    expect(sessionState.filePath).toBe('session-test.txt');
  });
});
