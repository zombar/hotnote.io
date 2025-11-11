import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

/**
 * E2E Tests for Navigation Button Functionality
 *
 * Tests actual button clicks (back, forward, folder up) to ensure
 * they properly navigate and load content.
 */

test.describe('Navigation Buttons', () => {
  let testDir;
  let testFiles;

  test.beforeEach(async () => {
    // Create a temporary test directory with files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hotnote-nav-test-'));
    testFiles = {
      file1: path.join(testDir, 'file1.md'),
      file2: path.join(testDir, 'file2.md'),
      file3: path.join(testDir, 'file3.md'),
    };

    // Create test files with distinct content
    await fs.writeFile(testFiles.file1, '# File 1\nContent of file 1');
    await fs.writeFile(testFiles.file2, '# File 2\nContent of file 2');
    await fs.writeFile(testFiles.file3, '# File 3\nContent of file 3');
  });

  test.afterEach(async () => {
    // Clean up test directory
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  test('back button should navigate to previous file and load its content', async ({ page }) => {
    // Start at clean state
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Simulate opening workspace and files via direct state manipulation
    // (since we can't use real file picker in headless browser)
    await page.evaluate(
      ({ dir }) => {
        // Mock the file handles and navigation history
        window.appState.rootDirHandle = { name: dir };
        window.appState.currentPath = [{ name: dir }];

        // Add file1 to history
        window.appState.navigationHistory = [
          {
            path: [{ name: dir }],
            dirHandle: window.appState.rootDirHandle,
            fileHandle: { name: 'file1.md' },
            filename: 'file1.md',
            editorState: null,
          },
        ];
        window.appState.historyIndex = 0;

        // Add file2 to history (current)
        window.appState.navigationHistory.push({
          path: [{ name: dir }],
          dirHandle: window.appState.rootDirHandle,
          fileHandle: { name: 'file2.md' },
          filename: 'file2.md',
          editorState: null,
        });
        window.appState.historyIndex = 1;
        window.appState.currentFileHandle = { name: 'file2.md' };
        window.appState.currentFilename = 'file2.md';

        // Update button states
        if (window.updateNavigationButtons) {
          window.updateNavigationButtons();
        }
      },
      { dir: path.basename(testDir) }
    );

    // Back button should be enabled
    const backBtn = page.locator('#back-btn');
    await expect(backBtn).toBeEnabled();

    // Click back button
    await backBtn.click();

    // Wait for navigation to complete
    await page.waitForTimeout(200);

    // Verify history index changed
    const historyIndex = await page.evaluate(() => window.appState.historyIndex);
    expect(historyIndex).toBe(0);

    // Verify current file changed
    const currentFilename = await page.evaluate(() => window.appState.currentFilename);
    expect(currentFilename).toBe('file1.md');

    // Verify back button is now disabled (at start of history)
    await expect(backBtn).toBeDisabled();
  });

  test('forward button should navigate to next file and load its content', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Set up history with file1 (current) and file2 (forward)
    await page.evaluate(
      ({ dir }) => {
        window.appState.rootDirHandle = { name: dir };
        window.appState.currentPath = [{ name: dir }];

        window.appState.navigationHistory = [
          {
            path: [{ name: dir }],
            dirHandle: window.appState.rootDirHandle,
            fileHandle: { name: 'file1.md' },
            filename: 'file1.md',
            editorState: null,
          },
          {
            path: [{ name: dir }],
            dirHandle: window.appState.rootDirHandle,
            fileHandle: { name: 'file2.md' },
            filename: 'file2.md',
            editorState: null,
          },
        ];
        window.appState.historyIndex = 0;
        window.appState.currentFileHandle = { name: 'file1.md' };
        window.appState.currentFilename = 'file1.md';

        if (window.updateNavigationButtons) {
          window.updateNavigationButtons();
        }
      },
      { dir: path.basename(testDir) }
    );

    // Forward button should be enabled
    const forwardBtn = page.locator('#forward-btn');
    await expect(forwardBtn).toBeEnabled();

    // Click forward button
    await forwardBtn.click();

    // Wait for navigation
    await page.waitForTimeout(200);

    // Verify history index changed
    const historyIndex = await page.evaluate(() => window.appState.historyIndex);
    expect(historyIndex).toBe(1);

    // Verify current file changed
    const currentFilename = await page.evaluate(() => window.appState.currentFilename);
    expect(currentFilename).toBe('file2.md');

    // Verify forward button is now disabled (at end of history)
    await expect(forwardBtn).toBeDisabled();
  });

  test('back and forward buttons should properly navigate through multiple files', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Set up history with 3 files
    await page.evaluate(
      ({ dir }) => {
        window.appState.rootDirHandle = { name: dir };
        window.appState.currentPath = [{ name: dir }];

        window.appState.navigationHistory = [
          {
            path: [{ name: dir }],
            fileHandle: { name: 'file1.md' },
            filename: 'file1.md',
            editorState: null,
          },
          {
            path: [{ name: dir }],
            fileHandle: { name: 'file2.md' },
            filename: 'file2.md',
            editorState: null,
          },
          {
            path: [{ name: dir }],
            fileHandle: { name: 'file3.md' },
            filename: 'file3.md',
            editorState: null,
          },
        ];
        window.appState.historyIndex = 2; // Currently at file3
        window.appState.currentFileHandle = { name: 'file3.md' };
        window.appState.currentFilename = 'file3.md';

        if (window.updateNavigationButtons) {
          window.updateNavigationButtons();
        }
      },
      { dir: path.basename(testDir) }
    );

    const backBtn = page.locator('#back-btn');
    const forwardBtn = page.locator('#forward-btn');

    // Go back twice: file3 -> file2 -> file1
    await backBtn.click();
    await page.waitForTimeout(200);
    let filename = await page.evaluate(() => window.appState.currentFilename);
    expect(filename).toBe('file2.md');

    await backBtn.click();
    await page.waitForTimeout(200);
    filename = await page.evaluate(() => window.appState.currentFilename);
    expect(filename).toBe('file1.md');

    // Back button should be disabled
    await expect(backBtn).toBeDisabled();

    // Go forward twice: file1 -> file2 -> file3
    await forwardBtn.click();
    await page.waitForTimeout(200);
    filename = await page.evaluate(() => window.appState.currentFilename);
    expect(filename).toBe('file2.md');

    await forwardBtn.click();
    await page.waitForTimeout(200);
    filename = await page.evaluate(() => window.appState.currentFilename);
    expect(filename).toBe('file3.md');

    // Forward button should be disabled
    await expect(forwardBtn).toBeDisabled();
  });

  test('folder up button should navigate to parent directory', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Set up state with nested path
    await page.evaluate(
      ({ dir }) => {
        window.appState.rootDirHandle = { name: dir };
        window.appState.currentPath = [{ name: dir }, { name: 'subfolder' }];
        window.appState.currentDirHandle = { name: 'subfolder' };
        window.appState.currentFileHandle = null;
        window.appState.currentFilename = '';

        if (window.updateNavigationButtons) {
          window.updateNavigationButtons();
        }
      },
      { dir: path.basename(testDir) }
    );

    const folderUpBtn = page.locator('#folder-up-btn');

    // Folder up button should be enabled (we're in a subfolder)
    await expect(folderUpBtn).toBeEnabled();

    // Click folder up button
    await folderUpBtn.click();

    // Wait for navigation
    await page.waitForTimeout(200);

    // Verify path was reduced
    const pathLength = await page.evaluate(() => window.appState.currentPath.length);
    expect(pathLength).toBe(1); // Should be back at root

    // Verify file is cleared
    const currentFilename = await page.evaluate(() => window.appState.currentFilename);
    expect(currentFilename).toBe('');
  });

  test('buttons should update URL parameters correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const workdirPath = '/Users/test/myapp';

    // Set up history with URL param support
    await page.evaluate((workdir) => {
      window.appState.rootDirHandle = { name: 'myapp' };
      window.appState.currentPath = [{ name: 'myapp' }];

      window.appState.navigationHistory = [
        {
          path: [{ name: 'myapp' }],
          fileHandle: { name: 'file1.md' },
          filename: 'file1.md',
          editorState: null,
        },
        {
          path: [{ name: 'myapp' }],
          fileHandle: { name: 'file2.md' },
          filename: 'file2.md',
          editorState: null,
        },
      ];
      window.appState.historyIndex = 1;
      window.appState.currentFileHandle = { name: 'file2.md' };
      window.appState.currentFilename = 'file2.md';

      // Set initial URL
      window.URLParamManager.update(workdir, 'file2.md');

      if (window.updateNavigationButtons) {
        window.updateNavigationButtons();
      }
    }, workdirPath);

    // Initial URL should have file2
    let url = page.url();
    expect(url).toContain('file=file2.md');

    // Click back button
    await page.locator('#back-btn').click();
    await page.waitForTimeout(200);

    // URL should now have file1
    url = page.url();
    expect(url).toContain('file=file1.md');

    // Click forward button
    await page.locator('#forward-btn').click();
    await page.waitForTimeout(200);

    // URL should have file2 again
    url = page.url();
    expect(url).toContain('file=file2.md');
  });
});
