import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveTempChanges,
  loadTempChanges,
  clearTempChanges,
  hasTempChanges,
  getFilePathKey,
} from '../core.js';

describe('Integration: File Navigation and Temp Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and restore temp changes when navigating between files', () => {
    // Simulate editing file1
    const path1 = [{ name: 'src' }];
    const filename1 = 'file1.js';
    const key1 = getFilePathKey(path1, filename1);
    const content1 = 'console.log("file1");';

    // Save temp changes for file1
    saveTempChanges(key1, content1);
    expect(hasTempChanges(key1)).toBe(true);

    // Navigate to file2
    const filename2 = 'file2.js';
    const key2 = getFilePathKey(path1, filename2);
    const content2 = 'console.log("file2");';

    // Save temp changes for file2
    saveTempChanges(key2, content2);
    expect(hasTempChanges(key2)).toBe(true);

    // Navigate back to file1 - changes should be restored
    const restoredContent1 = loadTempChanges(key1);
    expect(restoredContent1).toBe(content1);

    // Both files should have temp changes
    expect(hasTempChanges(key1)).toBe(true);
    expect(hasTempChanges(key2)).toBe(true);
  });

  it('should clear temp changes after saving', () => {
    const path = [{ name: 'src' }];
    const filename = 'file.js';
    const key = getFilePathKey(path, filename);
    const content = 'console.log("test");';

    // Save temp changes
    saveTempChanges(key, content);
    expect(hasTempChanges(key)).toBe(true);

    // Simulate saving the file
    clearTempChanges(key);
    expect(hasTempChanges(key)).toBe(false);
  });

  it('should maintain temp changes across folder navigation', () => {
    // Edit file in deep folder
    const deepPath = [{ name: 'src' }, { name: 'components' }, { name: 'forms' }];
    const filename = 'LoginForm.jsx';
    const key = getFilePathKey(deepPath, filename);
    const content = 'const LoginForm = () => {};';

    saveTempChanges(key, content);

    // Navigate up folders (file should close but changes saved)
    expect(hasTempChanges(key)).toBe(true);

    // Navigate back to the file
    const restoredContent = loadTempChanges(key);
    expect(restoredContent).toBe(content);
  });
});

describe('Integration: Multiple Files with Unsaved Changes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should track multiple files with unsaved changes', () => {
    const path = [{ name: 'src' }];
    const files = [
      { name: 'file1.js', content: 'code1' },
      { name: 'file2.js', content: 'code2' },
      { name: 'file3.js', content: 'code3' },
    ];

    // Edit all files
    files.forEach((file) => {
      const key = getFilePathKey(path, file.name);
      saveTempChanges(key, file.content);
    });

    // All files should have unsaved changes
    files.forEach((file) => {
      const key = getFilePathKey(path, file.name);
      expect(hasTempChanges(key)).toBe(true);
    });

    // Save one file
    const key1 = getFilePathKey(path, files[0].name);
    clearTempChanges(key1);

    // Only file1 should be saved
    expect(hasTempChanges(key1)).toBe(false);
    expect(hasTempChanges(getFilePathKey(path, files[1].name))).toBe(true);
    expect(hasTempChanges(getFilePathKey(path, files[2].name))).toBe(true);
  });

  it('should handle nested folder structures', () => {
    const testCases = [
      {
        path: [{ name: 'src' }],
        filename: 'index.js',
        content: 'src index',
      },
      {
        path: [{ name: 'src' }, { name: 'components' }],
        filename: 'App.jsx',
        content: 'app component',
      },
      {
        path: [{ name: 'src' }, { name: 'components' }, { name: 'ui' }],
        filename: 'Button.jsx',
        content: 'button component',
      },
    ];

    // Save temp changes for all files
    testCases.forEach((tc) => {
      const key = getFilePathKey(tc.path, tc.filename);
      saveTempChanges(key, tc.content);
    });

    // Verify all changes are saved with correct paths
    testCases.forEach((tc) => {
      const key = getFilePathKey(tc.path, tc.filename);
      expect(loadTempChanges(key)).toBe(tc.content);
    });

    // Verify keys are unique
    const keys = testCases.map((tc) => getFilePathKey(tc.path, tc.filename));
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(testCases.length);
  });
});

describe('Integration: Autosave Workflow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should simulate autosave clearing temp storage after save', () => {
    const path = [{ name: 'src' }];
    const filename = 'autosave.js';
    const key = getFilePathKey(path, filename);

    // User makes changes
    let content = 'const x = 1;';
    saveTempChanges(key, content);
    expect(hasTempChanges(key)).toBe(true);

    // Autosave triggers - would save to file, then clear temp
    clearTempChanges(key);
    expect(hasTempChanges(key)).toBe(false);

    // User makes more changes
    content = 'const x = 2;';
    saveTempChanges(key, content);
    expect(hasTempChanges(key)).toBe(true);

    // Another autosave
    clearTempChanges(key);
    expect(hasTempChanges(key)).toBe(false);
  });
});

describe('Integration: Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle files with same name in different folders', () => {
    const path1 = [{ name: 'src' }, { name: 'utils' }];
    const path2 = [{ name: 'src' }, { name: 'components' }];
    const filename = 'helpers.js';

    const key1 = getFilePathKey(path1, filename);
    const key2 = getFilePathKey(path2, filename);

    const content1 = 'utils helper';
    const content2 = 'components helper';

    saveTempChanges(key1, content1);
    saveTempChanges(key2, content2);

    expect(loadTempChanges(key1)).toBe(content1);
    expect(loadTempChanges(key2)).toBe(content2);
    expect(key1).not.toBe(key2);
  });

  it('should handle special characters in filenames', () => {
    const path = [{ name: 'src' }];
    const specialNames = ['file-name.js', 'file_name.js', 'file.name.js', 'file name.js'];

    specialNames.forEach((name) => {
      const key = getFilePathKey(path, name);
      const content = `content for ${name}`;
      saveTempChanges(key, content);
      expect(loadTempChanges(key)).toBe(content);
    });
  });

  it('should handle empty content', () => {
    const path = [{ name: 'src' }];
    const filename = 'empty.js';
    const key = getFilePathKey(path, filename);

    // Empty content should not save
    saveTempChanges(key, '');
    expect(hasTempChanges(key)).toBe(false);
  });

  it('should handle very long paths', () => {
    const longPath = [];
    for (let i = 0; i < 20; i++) {
      longPath.push({ name: `folder${i}` });
    }
    const filename = 'deep-file.js';
    const key = getFilePathKey(longPath, filename);
    const content = 'deep content';

    saveTempChanges(key, content);
    expect(loadTempChanges(key)).toBe(content);
  });
});
