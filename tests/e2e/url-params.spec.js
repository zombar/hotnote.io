import { test, expect } from '@playwright/test';

/**
 * E2E Tests for URL Parameter Management
 *
 * Tests the complete user experience for URL-based workspace and file navigation
 */

test.describe('URL Parameter Management', () => {
  test('should clear invalid URL (file without workdir) on page load', async ({ page }) => {
    // Load page with invalid URL params
    await page.goto('/?file=test.md');

    // URL should be cleared
    await page.waitForTimeout(100);
    const url = page.url();
    expect(url).not.toContain('file=');
    expect(url).not.toContain('workdir=');

    // Welcome or resume prompt should be shown
    const filePicker = page.getByTestId('file-picker');
    await expect(filePicker).toBeVisible();
  });

  test('should show workdir prompt when loading with workdir param', async ({ page }) => {
    const workdirPath = '/Users/test/projects/myapp';

    // Load page with workdir param
    await page.goto(`/?workdir=${workdirPath}`);

    // Should show custom workdir prompt (not generic welcome)
    const filePicker = page.getByTestId('file-picker');
    await expect(filePicker).toBeVisible();

    // Prompt should mention the workdir path
    const content = await filePicker.textContent();
    expect(content).toContain(workdirPath);

    // URL should still have workdir param
    const url = page.url();
    expect(url).toContain(`workdir=${workdirPath}`);
  });

  test('should preserve workdir param after workspace is opened', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Simulate opening a workspace by setting state
    const workdirPath = '/Users/test/myapp';
    await page.evaluate((path) => {
      window.URLParamManager.update(path, null);
    }, workdirPath);

    await page.waitForTimeout(100);

    // URL should have workdir param (forward slashes NOT encoded)
    const url = page.url();
    expect(url).toContain(`workdir=${workdirPath}`);
    expect(url).not.toContain('file=');
  });

  test('should add file param when file is opened', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Simulate opening workspace + file
    const workdirPath = '/Users/test/myapp';
    const filePath = 'README.md';

    await page.evaluate(
      ({ workdir, file }) => {
        window.URLParamManager.update(workdir, file);
      },
      { workdir: workdirPath, file: filePath }
    );

    await page.waitForTimeout(100);

    // URL should have both params (forward slashes NOT encoded)
    const url = page.url();
    expect(url).toContain(`workdir=${workdirPath}`);
    expect(url).toContain(`file=${filePath}`);
  });

  test('should remove file param when file is closed', async ({ page }) => {
    const workdirPath = '/Users/test/myapp';
    const filePath = 'test.md';

    // Start with file open
    await page.goto(`/?workdir=${workdirPath}&file=${filePath}`);
    await page.waitForSelector('[data-testid="editor"]');

    // Simulate closing file (keeping workspace)
    await page.evaluate((workdir) => {
      window.URLParamManager.update(workdir, null);
    }, workdirPath);

    await page.waitForTimeout(100);

    // URL should have workdir but no file (forward slashes NOT encoded)
    const url = page.url();
    expect(url).toContain(`workdir=${workdirPath}`);
    expect(url).not.toContain('file=');
  });

  test('should clear all params when workspace is closed', async ({ page }) => {
    const workdirPath = '/Users/test/myapp';

    // Start with workspace open
    await page.goto(`/?workdir=${workdirPath}`);
    await page.waitForSelector('[data-testid="editor"]');

    // Simulate closing workspace
    await page.evaluate(() => {
      window.URLParamManager.clear();
    });

    await page.waitForTimeout(100);

    // URL should be clean (no params)
    const url = page.url();
    expect(url).not.toContain('workdir=');
    expect(url).not.toContain('file=');
  });

  test('should handle URL-encoded paths with spaces', async ({ page }) => {
    const workdirPath = '/Users/test/my project';
    const filePath = 'my file.md';

    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Update with paths containing spaces
    await page.evaluate(
      ({ workdir, file }) => {
        window.URLParamManager.update(workdir, file);
      },
      { workdir: workdirPath, file: filePath }
    );

    await page.waitForTimeout(100);

    // URL should have properly encoded paths
    const url = page.url();
    expect(url).toContain('workdir=');
    expect(url).toContain('file=');

    // Decode and verify
    const urlObj = new URL(url);
    expect(urlObj.searchParams.get('workdir')).toBe(workdirPath);
    expect(urlObj.searchParams.get('file')).toBe(filePath);
  });

  test('should maintain params across page reload', async ({ page }) => {
    const workdirPath = '/Users/test/myapp';
    const filePath = 'README.md';

    // Load with params
    await page.goto(`/?workdir=${workdirPath}&file=${filePath}`);
    await page.waitForSelector('[data-testid="editor"]');

    // Reload page
    await page.reload();
    await page.waitForTimeout(200);

    // Params should still be present
    const url = page.url();
    expect(url).toContain(`workdir=${workdirPath}`);
    expect(url).toContain(`file=${filePath}`);
  });

  test('should validate params on every page load', async ({ page }) => {
    // Load with invalid params multiple times
    await page.goto('/?file=test.md');
    await page.waitForTimeout(600); // Wait for app initialization (500ms delay)
    let url = page.url();
    expect(url).not.toContain('file=');

    // Try again with different invalid combo
    await page.goto('/?file=another.md&other=param');
    await page.waitForTimeout(600); // Wait for app initialization (500ms delay)
    url = page.url();
    expect(url).not.toContain('file=');
    expect(url).not.toContain('workdir=');
    // Other unrelated params should be preserved
    expect(url).toContain('other=param');
  });

  test.skip('should use history.replaceState (not pushState) for param updates', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Get initial history length
    const initialLength = await page.evaluate(() => window.history.length);

    // Update params several times
    await page.evaluate(() => {
      window.URLParamManager.update('/path1', null);
      window.URLParamManager.update('/path1', 'file1.md');
      window.URLParamManager.update('/path1', 'file2.md');
    });

    await page.waitForTimeout(100);

    // History length should not change (replaceState doesn't add entries)
    const finalLength = await page.evaluate(() => window.history.length);
    expect(finalLength).toBe(initialLength);
  });

  test('should ignore extra unrelated URL params', async ({ page }) => {
    const workdirPath = '/Users/test/myapp';

    // Load with workdir + extra params
    await page.goto(`/?workdir=${workdirPath}&utm_source=email&debug=true`);
    await page.waitForSelector('[data-testid="editor"]');

    // Validate should only care about workdir/file
    const params = await page.evaluate(() => {
      return window.URLParamManager.validate();
    });

    expect(params.workdir).toBe(workdirPath);
    expect(params.file).toBeNull();

    // Extra params should still be in URL (not removed)
    const url = page.url();
    expect(url).toContain('utm_source=email');
    expect(url).toContain('debug=true');
  });

  test('should handle workdir prompt → folder selection flow', async ({ page }) => {
    const workdirPath = '/Users/test/myapp';

    // Load with workdir param
    await page.goto(`/?workdir=${workdirPath}`);

    // Should show file picker with workdir prompt
    const filePicker = page.getByTestId('file-picker');
    await expect(filePicker).toBeVisible();

    // Look for "Open Workspace" or similar button
    const openButton = page.locator('button:has-text("Open")');
    const buttonExists = (await openButton.count()) > 0;

    // If button exists, verify workdir is mentioned in prompt
    if (buttonExists) {
      const pickerText = await filePicker.textContent();
      expect(pickerText.toLowerCase()).toContain('workspace');
    }

    // URL should still have workdir param before folder is selected
    const url = page.url();
    expect(url).toContain(`workdir=${workdirPath}`);
  });

  test('should preserve workdir when switching between files', async ({ page }) => {
    const workdirPath = '/Users/test/myapp';

    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Open file 1
    await page.evaluate(
      ({ workdir, file }) => {
        window.URLParamManager.update(workdir, file);
      },
      { workdir: workdirPath, file: 'file1.md' }
    );

    let url = page.url();
    expect(url).toContain('file=file1.md');

    // Switch to file 2
    await page.evaluate(
      ({ workdir, file }) => {
        window.URLParamManager.update(workdir, file);
      },
      { workdir: workdirPath, file: 'file2.md' }
    );

    url = page.url();
    expect(url).toContain('file=file2.md');
    expect(url).toContain(`workdir=${workdirPath}`);
  });

  test('should handle full workflow: load → workspace → file → close', async ({ page }) => {
    const workdirPath = '/Users/test/myapp';
    const filePath = 'README.md';

    // 1. Load with workdir
    await page.goto(`/?workdir=${workdirPath}`);
    await page.waitForSelector('[data-testid="editor"]');
    let url = page.url();
    expect(url).toContain(`workdir=${workdirPath}`);
    expect(url).not.toContain('file=');

    // 2. Open file
    await page.evaluate(
      ({ workdir, file }) => {
        window.URLParamManager.update(workdir, file);
      },
      { workdir: workdirPath, file: filePath }
    );
    url = page.url();
    expect(url).toContain(`file=${filePath}`);

    // 3. Close file
    await page.evaluate((workdir) => {
      window.URLParamManager.update(workdir, null);
    }, workdirPath);
    url = page.url();
    expect(url).toContain(`workdir=${workdirPath}`);
    expect(url).not.toContain('file=');

    // 4. Close workspace
    await page.evaluate(() => {
      window.URLParamManager.clear();
    });
    url = page.url();
    expect(url).not.toContain('workdir=');
    expect(url).not.toContain('file=');
  });
});
