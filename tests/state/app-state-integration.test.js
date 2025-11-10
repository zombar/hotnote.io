import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from '../../src/state/app-state.js';

describe('AppState Integration', () => {
  beforeEach(() => {
    appState.resetAll();
  });

  it('should maintain state across simulated file opening', () => {
    // Simulate opening a file
    const mockFile = { name: 'index.js' };
    const mockDir = { name: 'src' };
    const path = [{ name: 'src' }];

    appState.setCurrentDirHandle(mockDir);
    appState.setCurrentFile(mockFile);
    appState.setCurrentFilename('index.js');
    appState.setCurrentPath(path);
    appState.setOriginalContent('console.log("hello");');

    // Verify state
    expect(appState.getCurrentFile()).toBe(mockFile);
    expect(appState.getCurrentFilename()).toBe('index.js');
    expect(appState.currentDirHandle).toBe(mockDir);
    expect(appState.getCurrentPath()).toEqual(path);
    expect(appState.getOriginalContent()).toBe('console.log("hello");');
  });

  it('should track dirty state during editing workflow', () => {
    // Start clean
    expect(appState.isDirtyState()).toBe(false);

    // User makes edit
    appState.markDirty(true);
    expect(appState.isDirtyState()).toBe(true);

    // User saves
    appState.markDirty(false);
    expect(appState.isDirtyState()).toBe(false);
  });

  it('should handle navigation history workflow', () => {
    // Navigate to first file
    appState.addToNavigationHistory({
      path: [],
      filename: 'file1.js',
      editorState: { cursor: 0 },
    });
    appState.setHistoryIndex(0);

    // Navigate to second file
    appState.addToNavigationHistory({
      path: [{ name: 'src' }],
      filename: 'file2.js',
      editorState: { cursor: 10 },
    });
    appState.setHistoryIndex(1);

    // Verify history
    expect(appState.getNavigationHistory()).toHaveLength(2);
    expect(appState.getHistoryIndex()).toBe(1);

    // Simulate back navigation
    appState.setHistoryIndex(0);
    expect(appState.getHistoryIndex()).toBe(0);
    expect(appState.getNavigationHistory()[0].filename).toBe('file1.js');
  });

  it('should maintain editor state across mode switches', () => {
    const mockCodeMirror = { type: 'codemirror' };
    const mockMarkdown = { type: 'markdown' };

    // Start with CodeMirror
    appState.setEditor(mockCodeMirror);
    expect(appState.getEditor()).toBe(mockCodeMirror);
    expect(appState.getEditorManager()).toBeNull();

    // Switch to markdown
    appState.setEditor(null);
    appState.setEditorManager(mockMarkdown);
    expect(appState.getEditor()).toBeNull();
    expect(appState.getEditorManager()).toBe(mockMarkdown);
  });

  it('should handle autosave state transitions', () => {
    // Initially enabled
    expect(appState.isAutosaveEnabled()).toBe(true);

    // Set interval
    const interval = 999;
    appState.setAutosaveInterval(interval);
    expect(appState.autosaveInterval).toBe(interval);

    // Disable autosave
    appState.setAutosaveEnabled(false);
    expect(appState.isAutosaveEnabled()).toBe(false);

    // Clear interval
    appState.setAutosaveInterval(null);
    expect(appState.autosaveInterval).toBeNull();
  });

  it('should track session restoration lifecycle', () => {
    const timestamp = Date.now();

    // Start restoration
    appState.setRestoringSession(true);
    appState.setLastRestorationTime(timestamp);

    expect(appState.isRestoringSession).toBe(true);
    expect(appState.lastRestorationTime).toBe(timestamp);

    // Complete restoration
    appState.setRestoringSession(false);
    expect(appState.isRestoringSession).toBe(false);
  });

  it('should handle complete file editing workflow', () => {
    const mockDir = { name: 'project' };
    const mockFile = { name: 'app.js' };
    const mockEditor = { state: 'editor' };

    // Open folder
    appState.setRootDirHandle(mockDir);
    appState.setCurrentDirHandle(mockDir);

    // Open file
    appState.setCurrentFile(mockFile);
    appState.setCurrentFilename('app.js');
    appState.setOriginalContent('// original');

    // Initialize editor
    appState.setEditor(mockEditor);

    // Make changes
    appState.markDirty(true);

    // Save
    appState.markDirty(false);

    // Add to history
    appState.addToNavigationHistory({
      path: [],
      filename: 'app.js',
      editorState: { cursor: 0 },
    });
    appState.setHistoryIndex(0);

    // Verify final state
    expect(appState.rootDirHandle).toBe(mockDir);
    expect(appState.getCurrentFile()).toBe(mockFile);
    expect(appState.getCurrentFilename()).toBe('app.js');
    expect(appState.getEditor()).toBe(mockEditor);
    expect(appState.isDirtyState()).toBe(false);
    expect(appState.getNavigationHistory()).toHaveLength(1);
  });

  it('should reset state cleanly between sessions', () => {
    // Set up complex state
    appState.setEditor({ state: 'editor' });
    appState.setCurrentFile({ name: 'test.js' });
    appState.setCurrentFilename('test.js');
    appState.setCurrentPath([{ name: 'src' }]);
    appState.markDirty(true);
    appState.addToNavigationHistory({ path: [], filename: 'test.js' });

    // Reset
    appState.reset();

    // Verify basic state reset
    expect(appState.isDirtyState()).toBe(false);
    expect(appState.getCurrentFile()).toBeNull();
    expect(appState.getCurrentFilename()).toBe('untitled');

    // Editor and history should still be there (reset doesn't clear everything)
    expect(appState.getEditor()).not.toBeNull();

    // ResetAll should clear everything
    appState.resetAll();
    expect(appState.getEditor()).toBeNull();
    expect(appState.getNavigationHistory()).toEqual([]);
  });
});
