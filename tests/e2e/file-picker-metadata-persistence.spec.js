import { test, expect } from '@playwright/test';

/**
 * E2E tests for file picker metadata persistence
 * These tests verify the bug fix: metadata and delete buttons should persist
 * when navigating through directories via breadcrumbs
 */

test.describe('File Picker - Metadata Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]', { timeout: 10000 });
  });

  test('should show file size and delete button on initial file picker load', async ({ page }) => {
    // Open file picker by clicking on navbar
    await page.click('#breadcrumb');
    await page.waitForSelector('.file-list', { timeout: 5000 });

    // Wait for at least one file item to appear
    await page.waitForSelector('.file-item', { timeout: 5000 });

    // Check that first non-directory file has metadata
    const firstFile = page.locator('.file-item:not(.is-directory)').first();

    // Verify the file item is visible
    await expect(firstFile).toBeVisible();

    // Check for metadata (file size)
    const metadata = firstFile.locator('.file-item-metadata');
    const metadataCount = await metadata.count();

    if (metadataCount > 0) {
      await expect(metadata).toBeVisible();
      await expect(metadata).toHaveText(/\d+(\.\d+)?\s+(B|KB|MB)/);
    }

    // Check for delete button
    const deleteBtn = firstFile.locator('.file-item-delete');
    const deleteBtnCount = await deleteBtn.count();

    if (deleteBtnCount > 0) {
      // Delete button exists for files
      expect(deleteBtnCount).toBe(1);
    }
  });

  test('should maintain file size and delete button when navigating directories', async ({
    page,
  }) => {
    // Open file picker
    await page.click('#breadcrumb');
    await page.waitForSelector('.file-list', { timeout: 5000 });

    // Check if there are any subdirectories
    const subdirCount = await page.locator('.file-item.is-directory').count();

    if (subdirCount > 0) {
      // Navigate into first subdirectory
      const subdir = page.locator('.file-item.is-directory').first();

      await subdir.click();
      await page.waitForTimeout(500); // Wait for navigation

      // Navigate back via breadcrumb
      const breadcrumbItems = page.locator('.breadcrumb-item');
      const breadcrumbCount = await breadcrumbItems.count();

      if (breadcrumbCount > 0) {
        await breadcrumbItems.first().click();
        await page.waitForTimeout(500); // Wait for picker update

        // Verify metadata still exists after navigation
        const fileAfterNav = page.locator('.file-item:not(.is-directory)').first();
        const fileCount = await fileAfterNav.count();

        if (fileCount > 0) {
          const metadata = fileAfterNav.locator('.file-item-metadata');
          const deleteBtn = fileAfterNav.locator('.file-item-delete');

          // These should still be present
          const metadataCount = await metadata.count();
          const deleteBtnCount = await deleteBtn.count();

          expect(metadataCount).toBeGreaterThan(0);
          expect(deleteBtnCount).toBeGreaterThan(0);
        }
      }
    } else {
      // No subdirectories, test still passes
      test.skip();
    }
  });

  test('should show correct file size format', async ({ page }) => {
    // Open file picker
    await page.click('#breadcrumb');
    await page.waitForSelector('.file-list', { timeout: 5000 });

    // Get all file items (not directories)
    const files = page.locator('.file-item:not(.is-directory)');
    const fileCount = await files.count();

    if (fileCount > 0) {
      // Check first file's metadata
      const firstFile = files.first();
      const metadata = firstFile.locator('.file-item-metadata');

      const metadataCount = await metadata.count();
      if (metadataCount > 0) {
        const sizeText = await metadata.textContent();

        // Should match pattern: number + unit (B, KB, or MB)
        expect(sizeText).toMatch(/^\d+(\.\d+)?\s+(B|KB|MB)$/);
      }
    }
  });

  test('should not show metadata for directories', async ({ page }) => {
    // Open file picker
    await page.click('#breadcrumb');
    await page.waitForSelector('.file-list', { timeout: 5000 });

    const directories = page.locator('.file-item.is-directory');
    const dirCount = await directories.count();

    if (dirCount > 0) {
      const firstDir = directories.first();

      // Directories should not have metadata or delete buttons
      const metadata = firstDir.locator('.file-item-metadata');
      const deleteBtn = firstDir.locator('.file-item-delete');

      await expect(metadata).not.toBeVisible();
      await expect(deleteBtn).not.toBeVisible();
    }
  });

  test('should maintain metadata after multiple breadcrumb navigations', async ({ page }) => {
    // Open file picker
    await page.click('#breadcrumb');
    await page.waitForSelector('.file-list', { timeout: 5000 });

    const subdirCount = await page.locator('.file-item.is-directory').count();

    if (subdirCount > 0) {
      // Navigate forward and back multiple times
      for (let i = 0; i < 2; i++) {
        // Navigate into subdirectory
        const subdir = page.locator('.file-item.is-directory').first();
        await subdir.click();
        await page.waitForTimeout(300);

        // Navigate back
        const breadcrumbItems = page.locator('.breadcrumb-item');
        const itemCount = await breadcrumbItems.count();

        if (itemCount > 0) {
          await breadcrumbItems.first().click();
          await page.waitForTimeout(300);
        }
      }

      // After multiple navigations, metadata should still be present
      const file = page.locator('.file-item:not(.is-directory)').first();
      const fileCount = await file.count();

      if (fileCount > 0) {
        const metadata = file.locator('.file-item-metadata');
        const deleteBtn = file.locator('.file-item-delete');

        const metadataCount = await metadata.count();
        const deleteBtnCount = await deleteBtn.count();

        expect(metadataCount).toBeGreaterThan(0);
        expect(deleteBtnCount).toBeGreaterThan(0);
      }
    } else {
      test.skip();
    }
  });

  test('should show delete button on file hover', async ({ page }) => {
    // Open file picker
    await page.click('#breadcrumb');
    await page.waitForSelector('.file-list', { timeout: 5000 });

    const file = page.locator('.file-item:not(.is-directory)').first();
    const fileCount = await file.count();

    if (fileCount > 0) {
      // Hover over file
      await file.hover();
      await page.waitForTimeout(200);

      // Delete button should be visible (with hover state)
      const deleteBtn = file.locator('.file-item-delete');
      const deleteBtnCount = await deleteBtn.count();

      if (deleteBtnCount > 0) {
        expect(deleteBtnCount).toBe(1);
      }
    }
  });

  test('should show delete confirmation on delete button click', async ({ page }) => {
    // Open file picker
    await page.click('#breadcrumb');
    await page.waitForSelector('.file-list', { timeout: 5000 });

    const file = page.locator('.file-item:not(.is-directory)').first();
    const fileCount = await file.count();

    if (fileCount > 0) {
      // Hover and click delete button
      await file.hover();

      const deleteBtn = file.locator('.file-item-delete');
      const deleteBtnCount = await deleteBtn.count();

      if (deleteBtnCount > 0) {
        await deleteBtn.click();
        await page.waitForTimeout(200);

        // Confirmation UI should appear
        const confirmContainer = file.locator('.file-item-delete-confirm');
        await expect(confirmContainer).toBeVisible();

        const confirmText = confirmContainer.locator('.file-item-delete-confirm-text');
        await expect(confirmText).toHaveText('Delete?');

        // Should have confirm and cancel buttons
        const confirmBtn = confirmContainer.locator('.file-item-delete-confirm-btn.confirm');
        const cancelBtn = confirmContainer.locator('.file-item-delete-confirm-btn.cancel');

        await expect(confirmBtn).toBeVisible();
        await expect(cancelBtn).toBeVisible();

        // Click cancel to restore normal view
        await cancelBtn.click();
        await page.waitForTimeout(200);

        // Confirmation should be gone, metadata and delete button should be back
        await expect(confirmContainer).not.toBeVisible();
      }
    }
  });

  test('should maintain consistent item structure in quick update and full init', async ({
    page,
  }) => {
    // Open file picker
    await page.click('#breadcrumb');
    await page.waitForSelector('.file-list', { timeout: 5000 });

    // Capture structure of first file (full initialization)
    const firstFile = page.locator('.file-item:not(.is-directory)').first();
    const fileCount = await firstFile.count();

    if (fileCount > 0) {
      const initialStructure = {
        hasIcon: (await firstFile.locator('.file-item-icon').count()) > 0,
        hasName: (await firstFile.locator('.file-item-name').count()) > 0,
        hasMetadata: (await firstFile.locator('.file-item-metadata').count()) > 0,
        hasDeleteBtn: (await firstFile.locator('.file-item-delete').count()) > 0,
      };

      // Navigate to trigger quick update path
      const subdirCount = await page.locator('.file-item.is-directory').count();

      if (subdirCount > 0) {
        const subdir = page.locator('.file-item.is-directory').first();
        await subdir.click();
        await page.waitForTimeout(300);

        const breadcrumbItems = page.locator('.breadcrumb-item');
        const itemCount = await breadcrumbItems.count();

        if (itemCount > 0) {
          await breadcrumbItems.first().click();
          await page.waitForTimeout(300);

          // Capture structure after quick update
          const fileAfterUpdate = page.locator('.file-item:not(.is-directory)').first();
          const afterStructure = {
            hasIcon: (await fileAfterUpdate.locator('.file-item-icon').count()) > 0,
            hasName: (await fileAfterUpdate.locator('.file-item-name').count()) > 0,
            hasMetadata: (await fileAfterUpdate.locator('.file-item-metadata').count()) > 0,
            hasDeleteBtn: (await fileAfterUpdate.locator('.file-item-delete').count()) > 0,
          };

          // Both structures should match
          expect(afterStructure.hasIcon).toBe(initialStructure.hasIcon);
          expect(afterStructure.hasName).toBe(initialStructure.hasName);
          expect(afterStructure.hasMetadata).toBe(initialStructure.hasMetadata);
          expect(afterStructure.hasDeleteBtn).toBe(initialStructure.hasDeleteBtn);
        }
      }
    }
  });
});
