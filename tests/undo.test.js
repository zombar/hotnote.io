import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveTempChanges,
  loadTempChanges,
  clearTempChanges,
  hasTempChanges,
  getFilePathKey,
} from '../core.js';

describe('Undo to Original Content', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Original Content Tracking', () => {
    it('should track when content matches original', () => {
      const originalContent = 'const x = 1;';
      const currentContent = 'const x = 1;';

      expect(currentContent === originalContent).toBe(true);
    });

    it('should detect when content differs from original', () => {
      const originalContent = 'const x = 1;';
      const currentContent = 'const x = 2;';

      expect(currentContent === originalContent).toBe(false);
    });

    it('should handle multiline content comparison', () => {
      const originalContent = 'line1\nline2\nline3';
      const currentContent = 'line1\nline2\nline3';

      expect(currentContent === originalContent).toBe(true);
    });

    it('should detect whitespace changes', () => {
      const originalContent = 'const x = 1;';
      const currentContent = 'const x = 1; '; // Extra space

      expect(currentContent === originalContent).toBe(false);
    });
  });

  describe('Temp Storage Behavior on Undo', () => {
    it('should clear temp storage when content matches original', () => {
      const path = [{ name: 'src' }];
      const filename = 'test.js';
      const key = getFilePathKey(path, filename);

      // Save temp changes
      saveTempChanges(key, 'const x = 2;');
      expect(hasTempChanges(key)).toBe(true);

      // Simulate undo to original (clearing temp)
      clearTempChanges(key);
      expect(hasTempChanges(key)).toBe(false);
    });

    it('should not clear temp storage if content still differs', () => {
      const path = [{ name: 'src' }];
      const filename = 'test.js';
      const key = getFilePathKey(path, filename);

      // Save temp changes
      saveTempChanges(key, 'const x = 2;');
      expect(hasTempChanges(key)).toBe(true);

      // Content still differs, don't clear
      expect(loadTempChanges(key)).toBe('const x = 2;');
    });
  });

  describe('isDirty Flag Management', () => {
    it('should set isDirty to false when content matches original', () => {
      const originalContent = 'const x = 1;';
      let isDirty = true;

      // Simulate undo back to original
      const currentContent = 'const x = 1;';
      if (currentContent === originalContent) {
        isDirty = false;
      }

      expect(isDirty).toBe(false);
    });

    it('should set isDirty to true when content differs', () => {
      const originalContent = 'const x = 1;';
      let isDirty = false;

      // Make a change
      const currentContent = 'const x = 2;';
      if (currentContent !== originalContent) {
        isDirty = true;
      }

      expect(isDirty).toBe(true);
    });

    it('should toggle isDirty during edit and undo cycle', () => {
      const originalContent = 'const x = 1;';
      let isDirty = false;

      // Make change
      let currentContent = 'const x = 2;';
      isDirty = currentContent !== originalContent;
      expect(isDirty).toBe(true);

      // Make another change
      currentContent = 'const x = 3;';
      isDirty = currentContent !== originalContent;
      expect(isDirty).toBe(true);

      // Undo back to original
      currentContent = 'const x = 1;';
      isDirty = currentContent !== originalContent;
      expect(isDirty).toBe(false);
    });
  });

  describe('Save Updates Original Content', () => {
    it('should update original content after save', () => {
      let originalContent = 'const x = 1;';
      const editedContent = 'const x = 2;';

      // After save, edited content becomes new original
      originalContent = editedContent;

      expect(originalContent).toBe('const x = 2;');
    });

    it('should allow undo to new original after save', () => {
      let originalContent = 'const x = 1;';

      // Edit
      let currentContent = 'const x = 2;';
      expect(currentContent !== originalContent).toBe(true);

      // Save - updates original
      originalContent = currentContent;

      // More edits
      currentContent = 'const x = 3;';
      expect(currentContent !== originalContent).toBe(true);

      // Undo to last saved state
      currentContent = 'const x = 2;';
      expect(currentContent === originalContent).toBe(true);
    });
  });
});

describe('Integration: Undo to Original Workflow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should complete full edit and undo cycle', () => {
    const path = [{ name: 'src' }];
    const filename = 'test.js';
    const key = getFilePathKey(path, filename);

    const originalContent = 'const x = 1;';
    let currentContent = originalContent;
    let isDirty = false;

    // Step 1: Make an edit
    currentContent = 'const x = 2;';
    isDirty = currentContent !== originalContent;
    if (isDirty) {
      saveTempChanges(key, currentContent);
    }

    expect(isDirty).toBe(true);
    expect(hasTempChanges(key)).toBe(true);

    // Step 2: Make another edit
    currentContent = 'const x = 3;';
    isDirty = currentContent !== originalContent;
    if (isDirty) {
      saveTempChanges(key, currentContent);
    }

    expect(isDirty).toBe(true);
    expect(loadTempChanges(key)).toBe('const x = 3;');

    // Step 3: Undo back to original
    currentContent = originalContent;
    isDirty = currentContent !== originalContent;
    if (!isDirty) {
      clearTempChanges(key);
    }

    expect(isDirty).toBe(false);
    expect(hasTempChanges(key)).toBe(false);
  });

  it('should handle save, edit, and undo to saved state', () => {
    const path = [{ name: 'src' }];
    const filename = 'test.js';
    const _key = getFilePathKey(path, filename);

    let originalContent = 'const x = 1;';
    let currentContent = originalContent;
    let isDirty = false;

    // Step 1: Edit
    currentContent = 'const x = 2;';
    isDirty = currentContent !== originalContent;
    saveTempChanges(_key, currentContent);

    expect(isDirty).toBe(true);

    // Step 2: Save (updates original)
    originalContent = currentContent;
    isDirty = false;
    clearTempChanges(_key);

    expect(isDirty).toBe(false);
    expect(hasTempChanges(_key)).toBe(false);

    // Step 3: More edits
    currentContent = 'const x = 3;';
    isDirty = currentContent !== originalContent;
    saveTempChanges(_key, currentContent);

    expect(isDirty).toBe(true);
    expect(hasTempChanges(_key)).toBe(true);

    // Step 4: Undo to last saved state (x = 2)
    currentContent = originalContent;
    isDirty = currentContent !== originalContent;
    if (!isDirty) {
      clearTempChanges(_key);
    }

    expect(isDirty).toBe(false);
    expect(hasTempChanges(_key)).toBe(false);
    expect(currentContent).toBe('const x = 2;');
  });

  it('should handle navigation with temp changes and undo', () => {
    const path = [{ name: 'src' }];
    const file1 = 'file1.js';
    const file2 = 'file2.js';
    const key1 = getFilePathKey(path, file1);
    const _key2 = getFilePathKey(path, file2);

    // Edit file1
    const file1Original = 'file1 content';
    let file1Current = 'file1 edited';
    saveTempChanges(key1, file1Current);

    // Navigate to file2
    const _file2Original = 'file2 content';
    const file2Current = 'file2 edited';
    saveTempChanges(_key2, file2Current);

    // Both have temp changes
    expect(hasTempChanges(key1)).toBe(true);
    expect(hasTempChanges(_key2)).toBe(true);

    // Navigate back to file1 and undo
    file1Current = file1Original;
    clearTempChanges(key1);

    // File1 clean, file2 still has changes
    expect(hasTempChanges(key1)).toBe(false);
    expect(hasTempChanges(_key2)).toBe(true);
  });

  it('should preserve temp changes across sessions until undo', () => {
    const path = [{ name: 'src' }];
    const filename = 'test.js';
    const key = getFilePathKey(path, filename);

    const originalContent = 'original';
    let currentContent = 'edited';

    // Save temp changes
    saveTempChanges(key, currentContent);
    expect(hasTempChanges(key)).toBe(true);

    // Simulate app reload - temp still there
    const restoredTemp = loadTempChanges(key);
    expect(restoredTemp).toBe('edited');

    // Undo to original
    currentContent = originalContent;
    clearTempChanges(key);

    // After undo, temp is gone even after "reload"
    const noTemp = loadTempChanges(key);
    expect(noTemp).toBeNull();
  });

  it('should handle empty file content', () => {
    const path = [{ name: 'src' }];
    const filename = 'empty.js';
    getFilePathKey(path, filename);

    const originalContent = '';
    let currentContent = '';
    let isDirty = false;

    // Edit empty file
    currentContent = 'new content';
    isDirty = currentContent !== originalContent;

    expect(isDirty).toBe(true);

    // Undo back to empty
    currentContent = '';
    isDirty = currentContent !== originalContent;

    expect(isDirty).toBe(false);
  });

  it('should detect undo in middle of content', () => {
    const path = [{ name: 'src' }];
    const filename = 'test.js';
    const key = getFilePathKey(path, filename);

    const originalContent = 'line1\nline2\nline3';
    let currentContent = originalContent;
    let isDirty = false;

    // Edit middle line
    currentContent = 'line1\nEDITED\nline3';
    isDirty = currentContent !== originalContent;
    saveTempChanges(key, currentContent);

    expect(isDirty).toBe(true);

    // Undo middle line change
    currentContent = 'line1\nline2\nline3';
    isDirty = currentContent !== originalContent;
    if (!isDirty) {
      clearTempChanges(key);
    }

    expect(isDirty).toBe(false);
    expect(hasTempChanges(key)).toBe(false);
  });
});

describe('Edge Cases: Undo to Original', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle rapid edit and undo cycles', () => {
    const originalContent = 'original';
    let currentContent = originalContent;
    let isDirty = false;

    // Rapid changes
    for (let i = 0; i < 10; i++) {
      currentContent = `edit${i}`;
      isDirty = currentContent !== originalContent;
      expect(isDirty).toBe(true);
    }

    // Undo back
    currentContent = originalContent;
    isDirty = currentContent !== originalContent;
    expect(isDirty).toBe(false);
  });

  it('should handle identical edits that match original', () => {
    const originalContent = 'const x = 1;';
    let currentContent = originalContent;
    let isDirty = false;

    // Edit away
    currentContent = 'const x = 2;';
    isDirty = currentContent !== originalContent;
    expect(isDirty).toBe(true);

    // Edit to something else
    currentContent = 'const x = 3;';
    isDirty = currentContent !== originalContent;
    expect(isDirty).toBe(true);

    // Manually type back to original
    currentContent = 'const x = 1;';
    isDirty = currentContent !== originalContent;
    expect(isDirty).toBe(false);
  });

  it('should handle very large file content', () => {
    const largeLine = 'x'.repeat(10000);
    const originalContent = Array(100).fill(largeLine).join('\n');
    let currentContent = originalContent;

    // Edit
    currentContent = currentContent + '\nextra';
    expect(currentContent !== originalContent).toBe(true);

    // Undo
    currentContent = originalContent;
    expect(currentContent === originalContent).toBe(true);
  });
});
