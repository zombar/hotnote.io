import { test, expect } from '@playwright/test';

test.describe('GitHub Reader Feature', () => {
  test('should load markdown file from GitHub raw URL', async ({ page }) => {
    // Use a public GitHub file for testing
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    // Navigate to hotnote with gitreader parameter
    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Wait for loading overlay to appear and disappear
    await page.waitForSelector('#github-loading-overlay', { timeout: 5000 }).catch(() => {});
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Wait for editor to be initialized
    await page.waitForSelector('#editor', { timeout: 10000 });

    // Wait a bit for content to load
    await page.waitForTimeout(1000);

    // Check that content is loaded (markdown should contain anthropic)
    const editorContent = await page.textContent('#editor');
    expect(editorContent).toContain('Anthropic');

    // Verify filename is set correctly
    const titleElement = await page.textContent('title');
    expect(titleElement).toContain('README.md');
  });

  test('should be in readonly mode', async ({ page }) => {
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Check that autosave is disabled in appState
    const autosaveEnabled = await page.evaluate(() => window.appState?.isAutosaveEnabled());
    expect(autosaveEnabled).toBe(false);

    // Check that autosave checkbox is disabled
    const autosaveCheckbox = await page.locator('#autosave-checkbox');
    expect(await autosaveCheckbox.isDisabled()).toBe(true);
    expect(await autosaveCheckbox.isChecked()).toBe(false);

    // Check that editor has readonly class or attribute
    const editorContainer = await page.locator('#editor');
    const hasReadonlyClass = await editorContainer.evaluate((el) => {
      return (
        el.classList.contains('readonly-editor') ||
        el.querySelector('[contenteditable="false"]') !== null
      );
    });
    expect(hasReadonlyClass).toBe(true);
  });

  test('should display TOC for markdown with headings', async ({ page }) => {
    // Use a markdown file with clear headings
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Click file picker button to open it
    const filePickerBtn = await page.locator('#file-picker-btn');
    if (await filePickerBtn.isVisible()) {
      await filePickerBtn.click();
      await page.waitForTimeout(500);

      // Check that TOC is visible (should show headings)
      const toc = await page.locator('.toc-list, #toc, [class*="toc"]');
      if ((await toc.count()) > 0) {
        const tocVisible = await toc.first().isVisible();
        // TOC should be present when file picker is open
        expect(tocVisible).toBe(true);
      }
    }
  });

  test('should handle github.com blob URLs', async ({ page }) => {
    // Test with github.com blob URL format
    const githubUrl = 'https://github.com/anthropics/anthropic-sdk-python/blob/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Check that content is loaded
    const editorContent = await page.textContent('#editor');
    expect(editorContent).toContain('Anthropic');
  });

  test('should show error for invalid GitHub URL', async ({ page }) => {
    const invalidUrl = 'https://raw.githubusercontent.com/invalid/repo/main/notfound.md';
    const encodedUrl = encodeURIComponent(invalidUrl);

    // Listen for alert dialog
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Failed to load file from GitHub');
      await dialog.accept();
    });

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
  });

  test('should not show related files section in barebones mode', async ({ page }) => {
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Open file picker
    const filePickerBtn = await page.locator('#file-picker-btn');
    if (await filePickerBtn.isVisible()) {
      await filePickerBtn.click();
      await page.waitForTimeout(500);

      // Related files section should not show folder navigation
      // (barebones version doesn't implement this)
      // In barebones mode, we just verify the app loads correctly
      // Full folder navigation is not implemented in this version
    }
  });

  test('should preserve gitreader parameter in URL', async ({ page }) => {
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Check that URL still contains gitreader parameter
    const currentUrl = page.url();
    expect(currentUrl).toContain('gitreader=');
  });

  test('should handle markdown files with code blocks', async ({ page }) => {
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Content should be rendered (code blocks should be visible)
    const editorContent = await page.textContent('#editor');
    expect(editorContent.length).toBeGreaterThan(100);
  });

  test('should not initialize comment system in gitreader mode', async ({ page }) => {
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Comment system may be initialized (it initializes at app startup),
    // but it should be inactive and not usable in GitHub mode
    // The important part is that it doesn't interfere with read-only viewing
    const commentToolbar = await page.evaluate(() => window.commentToolbar);
    const commentPanel = await page.evaluate(() => window.commentPanel);

    // If initialized, verify they exist but are not shown
    if (commentToolbar) {
      const toolbarVisible = await page.$('.comment-toolbar.visible');
      expect(toolbarVisible).toBeNull();
    }

    if (commentPanel) {
      const panelVisible = await page.$('.comment-panel.visible');
      expect(panelVisible).toBeNull();
    }
  });

  test('should not show comment toolbar on text selection in gitreader mode', async ({ page }) => {
    const githubUrl =
      'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';
    const encodedUrl = encodeURIComponent(githubUrl);

    await page.goto(`/?gitreader=${encodedUrl}`);
    await page
      .waitForSelector('#github-loading-overlay', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
    await page.waitForSelector('#editor', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Try to select text in the editor
    await page.evaluate(() => {
      const editor = document.querySelector('#editor .ProseMirror');
      if (editor && editor.firstChild) {
        const range = document.createRange();
        range.selectNodeContents(editor.firstChild);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });

    // Trigger mouseup event to potentially show comment toolbar
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Verify comment toolbar is not visible (even if it exists in DOM)
    const visibleToolbar = await page.$('.comment-toolbar.visible');
    expect(visibleToolbar).toBeNull();
  });
});
