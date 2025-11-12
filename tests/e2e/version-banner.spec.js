import { test, expect } from '@playwright/test';

test.describe('Version Banner', () => {
  test('should show welcome message on first launch', async ({ page }) => {
    // Clear localStorage to simulate first launch
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Wait for app to initialize and banner to be created
    await page.waitForSelector('#version-banner', { timeout: 10000 });

    // Wait for banner to appear
    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Should show welcome message (not version update message)
    const message = banner.locator('.version-banner-message');
    await expect(message).toContainText('Welcome');

    // Should have dismiss button
    const dismissBtn = banner.locator('#version-dismiss-btn');
    await expect(dismissBtn).toBeVisible();
  });

  test('should dismiss welcome banner and not show again', async ({ page }) => {
    // Clear localStorage to simulate first launch
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Click dismiss button
    const dismissBtn = banner.locator('#version-dismiss-btn');
    await dismissBtn.click();

    // Banner should be hidden
    await expect(banner).toHaveClass(/hidden/);

    // Reload page - banner should not reappear
    await page.reload();
    await expect(banner).toHaveClass(/hidden/);
  });

  test('should hide banner when versions match', async ({ page, context: _context }) => {
    // Mock version.json to return same version as app
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.1' }),
      });
    });

    // Mark as not first launch
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('hasSeenWelcome', 'true'));
    await page.reload();

    // Wait a bit for version check
    await page.waitForTimeout(500);

    const banner = page.locator('#version-banner');
    await expect(banner).toHaveClass(/hidden/);
  });

  test('should show banner when new version is available', async ({ page }) => {
    // Mark as not first launch
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('hasSeenWelcome', 'true'));

    // Mock version.json to return different version
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.2' }),
      });
    });

    await page.reload();

    // Wait for version check
    await page.waitForTimeout(500);

    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Should show update message
    const message = banner.locator('.version-banner-message');
    await expect(message).toContainText('New version available');
  });

  test('should reload page when reload button is clicked', async ({ page }) => {
    // Mock version.json to trigger update banner
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.2' }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('hasSeenWelcome', 'true'));
    await page.reload();

    // Wait for banner
    await page.waitForTimeout(500);
    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Set up listener for navigation
    const navigationPromise = page.waitForNavigation();

    // Click reload button
    const reloadBtn = banner.locator('#version-reload-btn');
    await reloadBtn.click();

    // Should trigger page reload
    await navigationPromise;
  });

  test('should dismiss update banner temporarily', async ({ page }) => {
    // Mock version.json to trigger update banner
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.2' }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('hasSeenWelcome', 'true'));
    await page.reload();

    // Wait for banner
    await page.waitForTimeout(500);
    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Click dismiss
    const dismissBtn = banner.locator('#version-dismiss-btn');
    await dismissBtn.click();

    // Banner should be hidden
    await expect(banner).toHaveClass(/hidden/);
  });

  test('should check for updates on window focus', async ({ page }) => {
    // Start with no update
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.1' }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('hasSeenWelcome', 'true'));
    await page.reload();

    // Wait for initial check
    await page.waitForTimeout(500);
    const banner = page.locator('#version-banner');
    await expect(banner).toHaveClass(/hidden/);

    // Now mock a new version
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.2' }),
      });
    });

    // Simulate window focus
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    // Wait for check
    await page.waitForTimeout(500);

    // Banner should now be visible
    await expect(banner).toBeVisible();
  });

  test('should style banner for light mode', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('hasSeenWelcome', 'true');
      localStorage.removeItem('theme'); // Ensure light mode
    });

    // Mock version update
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.2' }),
      });
    });

    await page.reload();
    await page.waitForTimeout(500);

    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Check that banner has proper styling
    const bgColor = await banner.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toBeTruthy();
  });

  test('should style banner for dark mode', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('hasSeenWelcome', 'true');
      localStorage.setItem('theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Mock version update
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.2' }),
      });
    });

    await page.reload();
    await page.waitForTimeout(500);

    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Verify dark theme is active
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Check that banner has proper styling for dark mode
    const bgColor = await banner.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toBeTruthy();
  });

  test('should handle failed version check gracefully', async ({ page }) => {
    // Mock version.json to fail
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 404,
      });
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('hasSeenWelcome', 'true'));
    await page.reload();

    // Wait for check attempt
    await page.waitForTimeout(500);

    // Banner should remain hidden
    const banner = page.locator('#version-banner');
    await expect(banner).toHaveClass(/hidden/);
  });

  test('should show welcome message only once per user', async ({ page, context }) => {
    // First visit - clear everything
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();

    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Dismiss welcome
    const dismissBtn = banner.locator('#version-dismiss-btn');
    await dismissBtn.click();

    // Close and reopen in new context to simulate returning user
    await page.close();
    const newPage = await context.newPage();
    await newPage.goto('/');

    // Welcome banner should not appear
    const newBanner = newPage.locator('#version-banner');
    await expect(newBanner).toHaveClass(/hidden/);
  });

  test('should display changelog link in update banner', async ({ page }) => {
    // Mark as not first launch
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('hasSeenWelcome', 'true'));

    // Mock version.json to return different version
    await page.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.4.2' }),
      });
    });

    await page.reload();

    // Wait for version check
    await page.waitForTimeout(500);

    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();

    // Should contain changelog link
    const message = banner.locator('.version-banner-message');
    await expect(message).toContainText('View changelog');

    // Verify the link has the correct gitreader parameter
    const changelogLink = message.locator('a');
    await expect(changelogLink).toHaveAttribute('href', /\?gitreader=.*CHANGELOG\.md/);
  });
});
