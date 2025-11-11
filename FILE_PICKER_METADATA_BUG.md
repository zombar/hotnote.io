# File Picker Metadata Bug - Test Design

## Bug Description

**Issue**: File size and delete button disappear from file picker when navigating through directories via breadcrumbs.

**Root Cause**: The quick update path in `src/ui/file-picker.js` (lines 28-72) only renders basic file items (icon + name) but doesn't include the metadata (file size) and delete button that the full initialization path includes.

## Location

**File**: `src/ui/file-picker.js:28-72`

**Function**: `showFilePicker()` - Quick update path when `pickerAlreadyOpen === true`

## Problem Code

```javascript
// Lines 40-70: Quick update when picker already open
for (const entry of entries) {
  const item = document.createElement('div');
  item.className = `file-item ${entry.kind === 'directory' ? 'is-directory' : ''}`;

  const icon = document.createElement('span');
  icon.className = 'file-item-icon';
  const iconSymbol = document.createElement('span');
  iconSymbol.className = 'material-symbols-outlined';
  iconSymbol.textContent = getFileIcon(entry.name, entry.kind === 'directory');
  icon.appendChild(iconSymbol);

  const name = document.createElement('span');
  name.className = 'file-item-name';
  name.textContent = entry.name;

  item.appendChild(icon);
  item.appendChild(name);

  // Add click handler
  item.addEventListener('click', async (e) => {
    e.stopPropagation();
    appState.focusManager.saveFocusState();
    if (entry.kind === 'directory') {
      await navigateToDirectory(entry);
    } else {
      await openFileFromPicker(entry);
    }
  });

  fileList.appendChild(item);
}
```

**Missing**: Lines 163-210 from the full initialization path that add:
- Unsaved changes indicator (lines 150-158)
- File size metadata (lines 164-178)
- Lock icon for read-only files (lines 180-196)
- Delete button with confirmation (lines 198-210)

## Fix

Extract the file item rendering logic into a reusable function and use it in both code paths:

```javascript
/**
 * Create a file item element with all metadata
 * @param {FileSystemHandle} entry - File or directory entry
 * @returns {Promise<HTMLElement>} File item element
 */
const createFileItem = async (entry) => {
  const item = document.createElement('div');
  item.className = `file-item ${entry.kind === 'directory' ? 'is-directory' : ''}`;

  const icon = document.createElement('span');
  icon.className = 'file-item-icon';
  const iconSymbol = document.createElement('span');
  iconSymbol.className = 'material-symbols-outlined';
  iconSymbol.textContent = getFileIcon(entry.name, entry.kind === 'directory');
  icon.appendChild(iconSymbol);

  const name = document.createElement('span');
  name.className = 'file-item-name';
  name.textContent = entry.name;

  // Check if file has temp changes
  if (entry.kind === 'file') {
    const pathParts = appState.currentPath.map((p) => p.name);
    pathParts.push(entry.name);
    const filePathKey = pathParts.join('/');
    if (hasTempChanges(filePathKey)) {
      item.classList.add('has-unsaved-changes');
    }
  }

  item.appendChild(icon);
  item.appendChild(name);

  // Add metadata and delete button for files only
  if (entry.kind === 'file') {
    // Get file metadata (size, permissions)
    const file = await entry.getFile();
    const sizeKB =
      file.size < 1024
        ? file.size + ' B'
        : file.size < 1024 * 1024
          ? (file.size / 1024).toFixed(1) + ' KB'
          : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

    // Display file size
    const metadata = document.createElement('span');
    metadata.className = 'file-item-metadata';
    metadata.textContent = sizeKB;
    item.appendChild(metadata);

    // Check if file is read-only
    let lockIcon = null;
    try {
      const permission = await entry.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        lockIcon = document.createElement('span');
        lockIcon.className = 'file-item-lock';
        const lockSymbol = document.createElement('span');
        lockSymbol.className = 'material-symbols-outlined';
        lockSymbol.textContent = 'lock';
        lockIcon.appendChild(lockSymbol);
        lockIcon.title = 'Read-only';
        item.appendChild(lockIcon);
      }
    } catch {
      // Permission check not supported, ignore
    }

    // Add delete button with confirmation
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'file-item-delete';
    const deleteIcon = document.createElement('span');
    deleteIcon.className = 'material-symbols-outlined';
    deleteIcon.textContent = 'close';
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent opening the file
      showDeleteConfirmation(item, entry, metadata, lockIcon);
    });
    item.appendChild(deleteBtn);
  }

  item.addEventListener('click', async (e) => {
    e.stopPropagation();
    appState.focusManager.saveFocusState();
    if (entry.kind === 'directory') {
      await navigateToDirectory(entry);
    } else {
      await openFileFromPicker(entry);
    }
  });

  return item;
};
```

Then use it in both paths:

```javascript
// Quick update path (line ~40)
for (const entry of entries) {
  const item = await createFileItem(entry);
  fileList.appendChild(item);
}

// Full initialization path (line ~135)
for (const entry of entries) {
  const item = await createFileItem(entry);
  fileList.appendChild(item);
}
```

## Test Design

### Unit Tests (`tests/file-picker.test.js`)

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('File Picker - File Item Rendering', () => {
  let mockFileEntry;
  let mockDirEntry;

  beforeEach(() => {
    // Mock FileSystemFileHandle
    mockFileEntry = {
      kind: 'file',
      name: 'test.md',
      getFile: vi.fn().mockResolvedValue({
        size: 1024,
      }),
      queryPermission: vi.fn().mockResolvedValue('granted'),
    };

    // Mock FileSystemDirectoryHandle
    mockDirEntry = {
      kind: 'directory',
      name: 'folder',
    };
  });

  describe('createFileItem', () => {
    it('should include file size for files', async () => {
      const item = await createFileItem(mockFileEntry);
      const metadata = item.querySelector('.file-item-metadata');

      expect(metadata).toBeTruthy();
      expect(metadata.textContent).toContain('KB');
    });

    it('should include delete button for files', async () => {
      const item = await createFileItem(mockFileEntry);
      const deleteBtn = item.querySelector('.file-item-delete');

      expect(deleteBtn).toBeTruthy();
      expect(deleteBtn.querySelector('.material-symbols-outlined').textContent).toBe('close');
    });

    it('should not include metadata for directories', async () => {
      const item = await createFileItem(mockDirEntry);
      const metadata = item.querySelector('.file-item-metadata');
      const deleteBtn = item.querySelector('.file-item-delete');

      expect(metadata).toBeNull();
      expect(deleteBtn).toBeNull();
    });

    it('should show lock icon for read-only files', async () => {
      mockFileEntry.queryPermission = vi.fn().mockResolvedValue('denied');

      const item = await createFileItem(mockFileEntry);
      const lockIcon = item.querySelector('.file-item-lock');

      expect(lockIcon).toBeTruthy();
      expect(lockIcon.querySelector('.material-symbols-outlined').textContent).toBe('lock');
    });

    it('should format file sizes correctly', async () => {
      const testCases = [
        { size: 500, expected: '500 B' },
        { size: 1024, expected: '1.0 KB' },
        { size: 1536, expected: '1.5 KB' },
        { size: 1048576, expected: '1.0 MB' },
        { size: 2621440, expected: '2.5 MB' },
      ];

      for (const testCase of testCases) {
        mockFileEntry.getFile = vi.fn().mockResolvedValue({ size: testCase.size });
        const item = await createFileItem(mockFileEntry);
        const metadata = item.querySelector('.file-item-metadata');

        expect(metadata.textContent).toBe(testCase.expected);
      }
    });

    it('should show unsaved changes indicator when file has temp changes', async () => {
      // Mock hasTempChanges to return true
      vi.mock('../../core.js', () => ({
        hasTempChanges: vi.fn().mockReturnValue(true),
      }));

      const item = await createFileItem(mockFileEntry);

      expect(item.classList.contains('has-unsaved-changes')).toBe(true);
    });
  });
});
```

### E2E Tests (`tests/e2e/file-picker-metadata.spec.js`)

```javascript
import { test, expect } from '@playwright/test';

test.describe('File Picker - Metadata Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');
  });

  test('should show file size and delete button on initial load', async ({ page }) => {
    // Assuming we have a test folder with files
    await page.click('[data-testid="open-folder"]');
    // ... select folder via file system access API mock

    // Wait for file picker to load
    await page.waitForSelector('.file-item');

    // Check that first file has metadata
    const firstFile = page.locator('.file-item').first();
    const metadata = firstFile.locator('.file-item-metadata');
    const deleteBtn = firstFile.locator('.file-item-delete');

    await expect(metadata).toBeVisible();
    await expect(metadata).toContainText(/B|KB|MB/);
    await expect(deleteBtn).toBeVisible();
  });

  test('should maintain file size and delete button when navigating via breadcrumbs', async ({ page }) => {
    // Open folder with subdirectories
    await page.click('[data-testid="open-folder"]');
    await page.waitForSelector('.file-item');

    // Verify initial state
    const initialFile = page.locator('.file-item').filter({ hasText: /\.md$/ }).first();
    await expect(initialFile.locator('.file-item-metadata')).toBeVisible();
    await expect(initialFile.locator('.file-item-delete')).toBeVisible();

    // Navigate into a subdirectory
    const subdir = page.locator('.file-item.is-directory').first();
    await subdir.click();
    await page.waitForTimeout(500); // Wait for navigation

    // Navigate back via breadcrumb
    const breadcrumbItem = page.locator('.breadcrumb-item').first();
    await breadcrumbItem.click();
    await page.waitForTimeout(500); // Wait for picker update

    // Check that metadata and delete button are still visible
    const fileAfterNav = page.locator('.file-item').filter({ hasText: /\.md$/ }).first();
    await expect(fileAfterNav.locator('.file-item-metadata')).toBeVisible();
    await expect(fileAfterNav.locator('.file-item-delete')).toBeVisible();
  });

  test('should maintain file size when using navbar input to navigate', async ({ page }) => {
    await page.click('[data-testid="open-folder"]');
    await page.waitForSelector('.file-item');

    // Click on navbar to open input
    await page.click('#breadcrumb');
    await page.waitForSelector('.breadcrumb-input');

    // Type '..' to go up
    await page.fill('.breadcrumb-input', '..');
    await page.press('.breadcrumb-input', 'Enter');
    await page.waitForTimeout(500);

    // Verify metadata still exists
    const file = page.locator('.file-item').filter({ hasText: /\.md$/ }).first();
    await expect(file.locator('.file-item-metadata')).toBeVisible();
    await expect(file.locator('.file-item-delete')).toBeVisible();
  });

  test('should delete file when delete button is clicked', async ({ page }) => {
    await page.click('[data-testid="open-folder"]');
    await page.waitForSelector('.file-item');

    const testFile = page.locator('.file-item').filter({ hasText: 'test.md' });
    await expect(testFile).toBeVisible();

    // Hover over file to show delete button
    await testFile.hover();

    // Click delete button
    const deleteBtn = testFile.locator('.file-item-delete');
    await deleteBtn.click();

    // Confirm deletion
    const confirmBtn = testFile.locator('.file-item-delete-confirm-btn.confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Verify file is removed (or undo snackbar appears)
    await expect(page.locator('.snackbar')).toBeVisible();
    await expect(page.locator('.snackbar')).toContainText('Moved to trash');
  });

  test('should show correct file sizes for different file types', async ({ page }) => {
    await page.click('[data-testid="open-folder"]');
    await page.waitForSelector('.file-item');

    // Get all file items and check their metadata
    const files = page.locator('.file-item:not(.is-directory)');
    const count = await files.count();

    for (let i = 0; i < count; i++) {
      const file = files.nth(i);
      const metadata = file.locator('.file-item-metadata');

      // Should have valid size format
      await expect(metadata).toBeVisible();
      await expect(metadata).toContainText(/^\d+(\.\d+)?\s+(B|KB|MB)$/);
    }
  });

  test('should not show metadata for directories', async ({ page }) => {
    await page.click('[data-testid="open-folder"]');
    await page.waitForSelector('.file-item');

    const directory = page.locator('.file-item.is-directory').first();
    const metadata = directory.locator('.file-item-metadata');
    const deleteBtn = directory.locator('.file-item-delete');

    // Directories should not have metadata or delete buttons
    await expect(metadata).not.toBeVisible();
    await expect(deleteBtn).not.toBeVisible();
  });
});
```

### Visual Regression Tests

```javascript
test.describe('File Picker - Visual Regression', () => {
  test('file item layout should be consistent', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="open-folder"]');
    await page.waitForSelector('.file-item');

    // Take screenshot of file picker
    const filePicker = page.locator('#file-picker');
    await expect(filePicker).toHaveScreenshot('file-picker-with-metadata.png');
  });

  test('file item layout after breadcrumb navigation', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="open-folder"]');
    await page.waitForSelector('.file-item');

    // Navigate and come back
    const subdir = page.locator('.file-item.is-directory').first();
    await subdir.click();
    await page.waitForTimeout(300);

    const breadcrumb = page.locator('.breadcrumb-item').first();
    await breadcrumb.click();
    await page.waitForTimeout(300);

    // Screenshot should match initial state
    const filePicker = page.locator('#file-picker');
    await expect(filePicker).toHaveScreenshot('file-picker-after-navigation.png');
  });
});
```

## Steps to Reproduce Bug

1. Open hotnote application
2. Choose a folder with subdirectories
3. Observe that files show size and delete button
4. Navigate into a subdirectory by clicking on it
5. Click on a breadcrumb item to navigate back to parent
6. **BUG**: Files no longer show size or delete button

## Expected Behavior

After navigating via breadcrumbs, files should still show:
- File size (e.g., "1.5 KB")
- Delete button (X icon that appears on hover)
- Lock icon (if file is read-only)
- Unsaved changes indicator (if applicable)

## Implementation Checklist

- [ ] Extract file item rendering into `createFileItem()` function
- [ ] Update quick update path (line ~40) to use `createFileItem()`
- [ ] Update full initialization path (line ~135) to use `createFileItem()`
- [ ] Add unit tests for `createFileItem()` function
- [ ] Add e2e tests for breadcrumb navigation persistence
- [ ] Add visual regression tests
- [ ] Verify fix works with real File System Access API
- [ ] Test with read-only files
- [ ] Test with files that have unsaved changes
- [ ] Update documentation if needed

## Related Files

- `src/ui/file-picker.js` - Main file picker implementation
- `style.css` - File item styling
- `tests/e2e/file-picker.spec.js` - Existing file picker tests
- `tests/e2e/file-picker-resize.spec.js` - Resize tests
- `tests/e2e/file-picker-navigation.spec.js` - Navigation tests

## Priority

**HIGH** - This affects core functionality and user experience. Users rely on file sizes to make decisions about which files to open, and the delete button is a primary way to manage files.
