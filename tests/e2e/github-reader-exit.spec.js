import { test, expect } from '@playwright/test';

test.describe('GitHub Reader Mode - Exit Behavior', () => {
  test('should restore UI and editor when opening workspace after GitHub reader', async ({
    page,
  }) => {
    // 1. Load a GitHub file first
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Verify we're in GitHub mode (readonly)
    const editorContainer = await page.locator('#editor');
    const hasReadonly = await editorContainer.evaluate((el) => {
      return (
        el.classList.contains('readonly-editor') ||
        el.querySelector('[contenteditable="false"]') !== null
      );
    });
    expect(hasReadonly).toBe(true);

    // Verify code/rich toggle button is hidden in GitHub mode
    const richToggleBtn = await page.locator('#rich-toggle-btn');
    const richToggleBtnVisible = await richToggleBtn.isVisible();
    expect(richToggleBtnVisible).toBe(false);

    // Verify file picker button is hidden in GitHub mode
    const filePickerBtn = await page.locator('#file-picker-btn');
    if ((await filePickerBtn.count()) > 0) {
      const filePickerVisible = await filePickerBtn.isVisible();
      expect(filePickerVisible).toBe(false);
    }

    // 2. Verify the "new" button is disabled in GitHub mode
    const newBtn = await page.locator('#new-btn');
    expect(await newBtn.isVisible()).toBe(true);
    expect(await newBtn.isDisabled()).toBe(true);

    // Mock the file picker dialog and exit GitHub mode programmatically
    await page.evaluate(() => {
      // Mock FileSystemAdapter.openDirectory to simulate user selecting a folder
      window.FileSystemAdapter = {
        openDirectory: async () => {
          // Return a mock directory handle
          return {
            name: 'test-workspace',
            kind: 'directory',
            getDirectoryHandle: async () => null,
            getFileHandle: async () => null,
            values: async function* () {
              // Empty directory
            },
          };
        },
        listDirectory: async () => [],
        readFile: async () => '',
        writeFile: async () => {},
        saveFilePicker: async () => null,
      };

      // Directly call openFolder to exit GitHub mode (since button is disabled)
      window.openFolder();
    });

    await page.waitForTimeout(1000);

    // 3. Verify UI elements are restored
    // Rich toggle button should be visible again (or at least not hidden)
    const richToggleAfter = await page.locator('#rich-toggle-btn');
    const richToggleStyleAfter = await richToggleAfter.evaluate((el) => el.style.display);
    // Should not be 'none' anymore
    expect(richToggleStyleAfter).not.toBe('none');

    // File picker button should be visible again
    const filePickerBtnAfter = await page.locator('#file-picker-btn');
    if ((await filePickerBtnAfter.count()) > 0) {
      const filePickerStyleAfter = await filePickerBtnAfter.evaluate((el) => el.style.display);
      expect(filePickerStyleAfter).not.toBe('none');
    }

    // 4. Verify gitreader URL parameter is cleared
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('gitreader=');

    // 5. Verify GitHub mode state is cleared
    const isGitHubMode = await page.evaluate(() => window.appState?.isGitHubMode);
    expect(isGitHubMode).toBe(false);

    const isReadOnly = await page.evaluate(() => window.appState?.isReadOnly);
    expect(isReadOnly).toBe(false);
  });

  test('should allow editing after exiting GitHub reader mode', async ({ page }) => {
    // Load GitHub file
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Try to type in readonly mode - should not work
    await page.click('#editor');
    await page.keyboard.type('Test text');
    await page.waitForTimeout(500);

    // Content should not change in readonly mode
    const contentBefore = await page.textContent('#editor');
    expect(contentBefore).not.toContain('Test text');

    // Mock file system and exit GitHub mode
    await page.evaluate(() => {
      window.FileSystemAdapter = {
        openDirectory: async () => ({
          name: 'test-workspace',
          kind: 'directory',
          getDirectoryHandle: async () => null,
          getFileHandle: async () => null,
          values: async function* () {},
        }),
        listDirectory: async () => [],
        readFile: async () => '',
        writeFile: async () => {},
        saveFilePicker: async () => null,
      };

      // Directly call openFolder to exit GitHub mode (since button is disabled)
      window.openFolder();
    });

    await page.waitForTimeout(1500);

    // Now editor should be editable
    const isReadOnlyAfter = await page.evaluate(() => window.appState?.isReadOnly);
    expect(isReadOnlyAfter).toBe(false);

    // Verify autosave is re-enabled
    const autosaveEnabled = await page.evaluate(() => window.appState?.isAutosaveEnabled());
    expect(autosaveEnabled).toBe(true);

    // Verify autosave checkbox is re-enabled and checked
    const autosaveCheckbox = await page.locator('#autosave-checkbox');
    expect(await autosaveCheckbox.isDisabled()).toBe(false);
    expect(await autosaveCheckbox.isChecked()).toBe(true);
  });

  test('should restore Related Files section when exiting GitHub mode', async ({ page }) => {
    // Load GitHub file
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Verify Related Files is hidden in GitHub mode
    const suggestedLinks = await page.locator('#suggested-links');
    if ((await suggestedLinks.count()) > 0) {
      const displayStyle = await suggestedLinks.evaluate((el) => el.style.display);
      expect(displayStyle).toBe('none');
    }

    // Mock file system and exit GitHub mode
    await page.evaluate(() => {
      window.FileSystemAdapter = {
        openDirectory: async () => ({
          name: 'test-workspace',
          kind: 'directory',
          getDirectoryHandle: async () => null,
          getFileHandle: async () => null,
          values: async function* () {},
        }),
        listDirectory: async () => [],
        readFile: async () => '',
        writeFile: async () => {},
        saveFilePicker: async () => null,
      };

      // Directly call openFolder to exit GitHub mode (since button is disabled)
      window.openFolder();
    });

    await page.waitForTimeout(1000);

    // Verify Related Files section is visible again
    const suggestedLinksAfter = await page.locator('#suggested-links');
    if ((await suggestedLinksAfter.count()) > 0) {
      const displayStyleAfter = await suggestedLinksAfter.evaluate((el) => el.style.display);
      expect(displayStyleAfter).not.toBe('none');
    }
  });
});
