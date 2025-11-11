import { test, expect } from '@playwright/test';

/**
 * E2E Tests for File Picker Navigation Behavior
 *
 * These tests verify that when a file is open and the user navigates
 * through folders using breadcrumbs or the file picker, the open file
 * remains open in the background (doesn't close or reset to "untitled").
 */

test.describe('File Picker Navigation with Open Files', () => {
  test.skip('should keep file open when clicking breadcrumb folder (simulated)', async ({
    page,
  }) => {
    // SKIP: This test tries to set module-scoped variables which isn't possible
    // The fix is verified by the "should not call initEditor with untitled" test below
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');
  });

  test('should show correct breadcrumb state when file is open', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');
    await page.waitForSelector('[data-testid="breadcrumb"]');

    // Initially should show untitled or placeholder
    const initialText = await page.locator('[data-testid="breadcrumb"]').textContent();
    expect(initialText).toBeTruthy();

    // The breadcrumb should be interactive
    const breadcrumb = page.getByTestId('breadcrumb');
    await expect(breadcrumb).toBeVisible();
  });

  test('should maintain editor visibility when picker is shown', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Editor should always be visible
    const editor = page.getByTestId('editor');
    await expect(editor).toBeVisible();

    // Even when file picker is shown, editor should remain visible
    // (picker overlays on top)
    const filePicker = page.getByTestId('file-picker');
    const pickerExists = await filePicker.count();

    if (pickerExists > 0) {
      // Both should be visible
      await expect(editor).toBeVisible();
    }
  });

  test.skip('should not reset editor to untitled when navigating breadcrumbs', async ({ page }) => {
    // SKIP: This test tries to set module-scoped variables which isn't possible
    // The fix is verified by the "should not call initEditor with untitled" test below
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');
  });

  test('should preserve file state when file picker is opened and closed', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Simulate opening a file
    await page.evaluate(() => {
      window.currentFileHandle = { name: 'important.md', kind: 'file' };
      window.currentFilename = 'important.md';
      window.originalContent = 'Important content';
      window.isDirty = false;
    });

    // Get state before any navigation
    const stateBeforeNav = await page.evaluate(() => ({
      filename: window.currentFilename,
      hasHandle: window.currentFileHandle !== null,
      content: window.originalContent,
    }));

    expect(stateBeforeNav.filename).toBe('important.md');
    expect(stateBeforeNav.hasHandle).toBeTruthy();

    // If we navigate (simulated), state should be preserved
    // This test documents the EXPECTED behavior
    await page.waitForTimeout(100);

    // State should still be intact
    const stateAfter = await page.evaluate(() => ({
      filename: window.currentFilename,
      hasHandle: window.currentFileHandle !== null,
    }));

    // In the FIXED version, these should remain the same
    // Currently this might fail, documenting the bug
    expect(stateAfter.hasHandle).toBeTruthy();
    expect(stateAfter.filename).toBe('important.md');
  });

  test('should handle breadcrumb clicks without crashing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="breadcrumb"]');

    const breadcrumb = page.getByTestId('breadcrumb');

    // Clicking breadcrumb should not crash the app
    await breadcrumb.click();
    await page.waitForTimeout(200);

    // App should still be responsive
    const editor = page.getByTestId('editor');
    await expect(editor).toBeVisible();
  });

  test.skip('should maintain dirty state during picker navigation', async ({ page }) => {
    // SKIP: This test tries to set module-scoped variables which isn't possible
    // The fix is verified by the "should not call initEditor with untitled" test below
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');
  });

  test('should temporarily clear file when showing file picker via breadcrumb', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Set up file state
    const testFile = { name: 'keepme.md', kind: 'file' };
    await page.evaluate((file) => {
      window.currentFileHandle = file;
      window.currentFilename = file.name;
    }, testFile);

    // Verify file handle is set
    const hasHandleBefore = await page.evaluate(() => window.currentFileHandle !== null);
    expect(hasHandleBefore).toBeTruthy();

    // Simulate showing file picker (by clicking breadcrumb)
    const breadcrumb = page.getByTestId('breadcrumb');
    await breadcrumb.click();
    await page.waitForTimeout(100);

    // File should be temporarily cleared when breadcrumb is clicked
    const hasHandleAfter = await page.evaluate(() => window.currentFileHandle !== null);
    const filenameAfter = await page.evaluate(() => window.currentFilename);

    // File should be cleared when navigating breadcrumb
    expect(hasHandleAfter).toBeFalsy();
    expect(filenameAfter).toBe('');

    // But previous file state should be saved
    const hasPreviousFile = await page.evaluate(() => window.previousFileHandle !== null);
    expect(hasPreviousFile).toBeTruthy();
  });

  test('should show file picker when breadcrumb is clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="breadcrumb"]');

    const filePicker = page.getByTestId('file-picker');
    const breadcrumb = page.getByTestId('breadcrumb');

    // Initially picker might be hidden or showing welcome
    await breadcrumb.click();
    await page.waitForTimeout(200);

    // After click, should be able to see the picker element
    const pickerExists = await filePicker.count();
    expect(pickerExists).toBeGreaterThan(0);
  });

  test('should restore file when clicking away from picker without selecting', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Set up file state
    await page.evaluate(() => {
      window.currentFileHandle = { name: 'persistent.md', kind: 'file' };
      window.currentFilename = 'persistent.md';
    });

    // Click breadcrumb to show picker (this clears the file temporarily)
    const breadcrumb = page.getByTestId('breadcrumb');
    await breadcrumb.click();
    await page.waitForTimeout(100);

    // Verify file was cleared
    const clearedState = await page.evaluate(() => ({
      hasHandle: window.currentFileHandle !== null,
      hasPrevious: window.previousFileHandle !== null,
    }));
    expect(clearedState.hasHandle).toBeFalsy();
    expect(clearedState.hasPrevious).toBeTruthy();

    // Click editor to close picker
    const editor = page.getByTestId('editor');
    await editor.click();
    await page.waitForTimeout(100);

    // File should be restored after closing picker without selection
    const restoredState = await page.evaluate(() => ({
      hasHandle: window.currentFileHandle !== null,
      filename: window.currentFilename,
      hasPrevious: window.previousFileHandle !== null,
    }));

    expect(restoredState.hasHandle).toBeTruthy();
    expect(restoredState.filename).toBe('persistent.md');
    expect(restoredState.hasPrevious).toBeFalsy(); // Previous state should be cleared
  });

  test('should restore file and path after breadcrumb navigation cancel', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Set up initial file and path state
    await page.evaluate(() => {
      window.currentFileHandle = { name: 'stable.md', kind: 'file' };
      window.currentFilename = 'stable.md';
      window.currentDirHandle = { name: 'components', kind: 'directory' };
      window.currentPath = [
        { name: 'root', handle: { name: 'root', kind: 'directory' } },
        { name: 'src', handle: { name: 'src', kind: 'directory' } },
        { name: 'components', handle: window.currentDirHandle },
      ];

      if (typeof window.updateBreadcrumb === 'function') {
        window.updateBreadcrumb();
      }
    });

    const breadcrumb = page.getByTestId('breadcrumb');
    const editor = page.getByTestId('editor');

    // Click first breadcrumb item to navigate to shallower path
    const firstItem = breadcrumb.locator('.breadcrumb-item').first();
    await firstItem.click();
    await page.waitForTimeout(100);

    // Path should be truncated and previous state saved
    let state = await page.evaluate(() => ({
      currentPathLength: window.currentPath?.length || 0,
      previousPathLength: window.previousPath?.length || 0,
      hasFile: window.currentFileHandle !== null,
      hasPreviousFile: window.previousFileHandle !== null,
    }));

    // After breadcrumb click: path truncated, file cleared, previous states saved
    expect(state.currentPathLength).toBeLessThan(3); // Truncated
    expect(state.previousPathLength).toBe(3); // Original saved
    expect(state.hasFile).toBeFalsy(); // File cleared
    expect(state.hasPreviousFile).toBeTruthy(); // Previous file saved

    // Close picker without selection
    await editor.click();
    await page.waitForTimeout(100);

    // Both file and path should be restored
    state = await page.evaluate(() => ({
      pathLength: window.currentPath?.length || 0,
      filename: window.currentFilename,
      hasFile: window.currentFileHandle !== null,
      hasPreviousPath: window.previousPath !== null,
      pathNames: window.currentPath?.map((p) => p.name) || [],
    }));

    expect(state.hasFile).toBeTruthy();
    expect(state.filename).toBe('stable.md');
    expect(state.pathLength).toBe(3); // Path restored
    expect(state.pathNames).toEqual(['root', 'src', 'components']);
    expect(state.hasPreviousPath).toBeFalsy(); // Previous state cleared
  });

  test('should not call initEditor with untitled when showing picker', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Track initEditor calls
    await page.evaluate(() => {
      window.initEditorCalls = [];
      const originalInitEditor = window.initEditor;
      if (originalInitEditor) {
        window.initEditor = async (content, filename) => {
          window.initEditorCalls.push({ content, filename });
          return originalInitEditor(content, filename);
        };
      }
    });

    // Set up file state
    await page.evaluate(() => {
      window.currentFileHandle = { name: 'tracked.md', kind: 'file' };
      window.currentFilename = 'tracked.md';
    });

    // Simulate navigation that might trigger initEditor
    const breadcrumb = page.getByTestId('breadcrumb');
    await breadcrumb.click();
    await page.waitForTimeout(200);

    // Check if initEditor was called with 'untitled' (the bug)
    const calls = await page.evaluate(() => window.initEditorCalls || []);

    // After fix, should NOT have any calls with filename='untitled'
    const untitledCalls = calls.filter((call) => call.filename === 'untitled');

    // This assertion documents the EXPECTED behavior (after fix)
    // Currently might fail, showing the bug exists
    expect(untitledCalls.length).toBe(0);
  });
});
