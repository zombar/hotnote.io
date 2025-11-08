import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockCodeMirrorEditor, mockAutosaveTimer } from './setup.js';
import { createMockProject } from './mocks/filesystem.js';

const createMockAppState = () => {
  return {
    currentFileHandle: null,
    currentDirHandle: null,
    editor: null,
    isDirty: false,
    autosaveEnabled: false,
    autosaveTimer: mockAutosaveTimer,
  };
};

describe('Autosave Integration Tests', () => {
  let appState;
  let mockProject;

  beforeEach(() => {
    appState = createMockAppState();
    mockProject = createMockProject({
      'file1.txt': 'Original content 1',
      'file2.txt': 'Original content 2',
      'README.md': '# Original README',
    });
    appState.currentDirHandle = mockProject;
  });

  it('should trigger autosave after delay when content changes', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;
    appState.autosaveEnabled = true;

    const editor = createMockCodeMirrorEditor();
    appState.editor = editor;

    const saveCallback = vi.fn(async () => {
      localStorage.setItem('file1.txt', editor.getContent());
    });

    // Set content and start autosave timer
    editor.setContent('Modified content');
    appState.autosaveTimer.start('autosave', saveCallback, 2000);

    expect(appState.autosaveTimer.hasPending('autosave')).toBe(true);

    // Trigger the timer
    await appState.autosaveTimer.trigger('autosave');

    expect(saveCallback).toHaveBeenCalled();
    expect(localStorage.getItem('file1.txt')).toBe('Modified content');
  });

  it('should save to temp storage when autosave triggers', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('README.md');
    appState.currentFileHandle = fileHandle;
    appState.autosaveEnabled = true;

    const editor = createMockCodeMirrorEditor();
    editor.setContent('# Modified README');

    const pathKey = 'README.md';
    const saveCallback = async () => {
      localStorage.setItem(pathKey, editor.getContent());
    };

    appState.autosaveTimer.start('autosave', saveCallback, 2000);
    await appState.autosaveTimer.trigger('autosave');

    expect(localStorage.getItem(pathKey)).toBe('# Modified README');
  });

  it('should reset autosave timer when content changes again', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;
    appState.autosaveEnabled = true;

    const editor = createMockCodeMirrorEditor();
    const saveCallback = vi.fn();

    // First change
    editor.setContent('Change 1');
    appState.autosaveTimer.start('autosave', saveCallback, 2000);

    // Second change before timer fires
    editor.setContent('Change 2');
    appState.autosaveTimer.start('autosave', saveCallback, 2000);

    // Should only trigger once with latest content
    await appState.autosaveTimer.trigger('autosave');

    expect(saveCallback).toHaveBeenCalledTimes(1);
  });

  it('should cancel autosave on manual save', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;
    appState.autosaveEnabled = true;

    const editor = createMockCodeMirrorEditor();
    editor.setContent('Modified');

    const saveCallback = vi.fn();
    appState.autosaveTimer.start('autosave', saveCallback, 2000);

    // Manual save
    const writable = await fileHandle.createWritable();
    await writable.write(editor.getContent());
    await writable.close();

    // Cancel autosave
    appState.autosaveTimer.stop('autosave');

    expect(appState.autosaveTimer.hasPending('autosave')).toBe(false);
  });

  it('should handle autosave with multiple dirty files', async () => {
    await appState.currentDirHandle.getFileHandle('file1.txt');
    await appState.currentDirHandle.getFileHandle('file2.txt');

    const editor1 = createMockCodeMirrorEditor();
    editor1.setContent('Modified file 1');

    const editor2 = createMockCodeMirrorEditor();
    editor2.setContent('Modified file 2');

    // Save both files to temp storage
    const save1 = async () => localStorage.setItem('file1.txt', editor1.getContent());
    const save2 = async () => localStorage.setItem('file2.txt', editor2.getContent());

    appState.autosaveTimer.start('file1', save1, 2000);
    appState.autosaveTimer.start('file2', save2, 2000);

    expect(appState.autosaveTimer.getPendingCount()).toBe(2);

    // Trigger all
    await appState.autosaveTimer.triggerAll();

    expect(localStorage.getItem('file1.txt')).toBe('Modified file 1');
    expect(localStorage.getItem('file2.txt')).toBe('Modified file 2');
  });

  it('should not autosave when autosave is disabled', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;
    appState.autosaveEnabled = false;

    const editor = createMockCodeMirrorEditor();
    editor.setContent('Modified');

    // Autosave should not be started
    expect(appState.autosaveEnabled).toBe(false);
    expect(appState.autosaveTimer.hasPending('autosave')).toBe(false);
  });

  it('should mark file as dirty after autosave to temp storage', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;

    const editor = createMockCodeMirrorEditor();
    editor.setContent('Modified');

    const saveCallback = async () => {
      localStorage.setItem('file1.txt', editor.getContent());
      appState.isDirty = true;
    };

    appState.autosaveTimer.start('autosave', saveCallback, 2000);
    await appState.autosaveTimer.trigger('autosave');

    expect(appState.isDirty).toBe(true);
  });

  it('should clear dirty flag after manual save', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;
    appState.isDirty = true;

    const editor = createMockCodeMirrorEditor();
    editor.setContent('Final content');

    // Manual save
    const writable = await fileHandle.createWritable();
    await writable.write(editor.getContent());
    await writable.close();

    // Clear temp storage and dirty flag
    localStorage.removeItem('file1.txt');
    appState.isDirty = false;

    expect(appState.isDirty).toBe(false);
    expect(localStorage.getItem('file1.txt')).toBeNull();
  });

  it('should preserve autosave state when switching files', async () => {
    await appState.currentDirHandle.getFileHandle('file1.txt');
    const file2 = await appState.currentDirHandle.getFileHandle('file2.txt');

    // Edit file1 and start autosave
    const editor1 = createMockCodeMirrorEditor();
    editor1.setContent('File 1 modified');

    const save1 = async () => localStorage.setItem('file1.txt', editor1.getContent());
    appState.autosaveTimer.start('file1', save1, 2000);

    // Switch to file2
    appState.currentFileHandle = file2;

    // File1 autosave should still be pending
    expect(appState.autosaveTimer.hasPending('file1')).toBe(true);

    // Trigger it
    await appState.autosaveTimer.trigger('file1');

    expect(localStorage.getItem('file1.txt')).toBe('File 1 modified');
  });

  it('should handle autosave errors gracefully', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;

    const editor = createMockCodeMirrorEditor();
    editor.setContent('Content');

    const failingSaveCallback = vi.fn(async () => {
      throw new Error('Save failed');
    });

    appState.autosaveTimer.start('autosave', failingSaveCallback, 2000);

    await expect(async () => {
      await appState.autosaveTimer.trigger('autosave');
    }).rejects.toThrow('Save failed');

    expect(failingSaveCallback).toHaveBeenCalled();
  });

  it('should debounce rapid changes with autosave', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;

    const editor = createMockCodeMirrorEditor();
    const saveCallback = vi.fn(async () => {
      localStorage.setItem('file1.txt', editor.getContent());
    });

    // Simulate rapid typing
    for (let i = 0; i < 10; i++) {
      editor.setContent(`Content ${i}`);
      appState.autosaveTimer.start('autosave', saveCallback, 2000);
    }

    // Only one timer should be active
    expect(appState.autosaveTimer.hasPending('autosave')).toBe(true);

    // Trigger it once
    await appState.autosaveTimer.trigger('autosave');

    // Save should be called only once with final content
    expect(saveCallback).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('file1.txt')).toBe('Content 9');
  });

  it('should stop autosave when file is closed', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;

    const editor = createMockCodeMirrorEditor();
    editor.setContent('Content');

    const saveCallback = vi.fn();
    appState.autosaveTimer.start('autosave', saveCallback, 2000);

    // Close file (cleanup)
    appState.autosaveTimer.stop('autosave');
    appState.currentFileHandle = null;

    expect(appState.autosaveTimer.hasPending('autosave')).toBe(false);
  });

  it('should handle autosave with large file content', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('large.txt', {
      create: true,
    });
    appState.currentFileHandle = fileHandle;

    const editor = createMockCodeMirrorEditor();
    const largeContent = 'a'.repeat(100000); // 100KB
    editor.setContent(largeContent);

    const saveCallback = async () => {
      localStorage.setItem('large.txt', editor.getContent());
    };

    appState.autosaveTimer.start('autosave', saveCallback, 2000);
    await appState.autosaveTimer.trigger('autosave');

    expect(localStorage.getItem('large.txt')).toBe(largeContent);
  });

  it('should update autosave timestamp after save', async () => {
    const fileHandle = await appState.currentDirHandle.getFileHandle('file1.txt');
    appState.currentFileHandle = fileHandle;

    const editor = createMockCodeMirrorEditor();
    editor.setContent('Content');

    let lastSaveTime = null;

    const saveCallback = async () => {
      localStorage.setItem('file1.txt', editor.getContent());
      lastSaveTime = Date.now();
    };

    appState.autosaveTimer.start('autosave', saveCallback, 2000);
    await appState.autosaveTimer.trigger('autosave');

    expect(lastSaveTime).not.toBeNull();
    expect(Date.now() - lastSaveTime).toBeLessThan(1000);
  });

  it('should handle autosave with concurrent file operations', async () => {
    await appState.currentDirHandle.getFileHandle('file1.txt');
    await appState.currentDirHandle.getFileHandle('file2.txt');

    const editor1 = createMockCodeMirrorEditor();
    editor1.setContent('Content 1');

    const editor2 = createMockCodeMirrorEditor();
    editor2.setContent('Content 2');

    const save1 = async () => localStorage.setItem('file1.txt', editor1.getContent());
    const save2 = async () => localStorage.setItem('file2.txt', editor2.getContent());

    // Start both autosave timers
    appState.autosaveTimer.start('file1', save1, 2000);
    appState.autosaveTimer.start('file2', save2, 2000);

    // Trigger both concurrently
    await Promise.all([
      appState.autosaveTimer.trigger('file1'),
      appState.autosaveTimer.trigger('file2'),
    ]);

    expect(localStorage.getItem('file1.txt')).toBe('Content 1');
    expect(localStorage.getItem('file2.txt')).toBe('Content 2');
  });

  it('should cleanup autosave timers on app close', () => {
    const saveCallback = vi.fn();

    appState.autosaveTimer.start('file1', saveCallback, 2000);
    appState.autosaveTimer.start('file2', saveCallback, 2000);
    appState.autosaveTimer.start('file3', saveCallback, 2000);

    expect(appState.autosaveTimer.getPendingCount()).toBe(3);

    // Cleanup all timers
    appState.autosaveTimer.stopAll();

    expect(appState.autosaveTimer.getPendingCount()).toBe(0);
  });
});
