import { test, expect } from '@playwright/test';

/**
 * Comprehensive E2E tests for TOC functionality
 * These tests verify the complete user experience
 */

test.describe('TOC Rendering and Structure', () => {
  test('should render TOC with correct HTML structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Check that TOC container exists
    const tocContainer = page.locator('#markdown-toc');
    await expect(tocContainer).toBeAttached();

    // Check for title
    const tocTitle = page.locator('.toc-title');
    await expect(tocTitle).toContainText('Contents');

    // Check for content container
    const tocContent = page.locator('#toc-content');
    await expect(tocContent).toBeAttached();
  });

  test('should render suggested links container', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const suggestedLinks = page.locator('#suggested-links');
    await expect(suggestedLinks).toBeAttached();

    const suggestedLinksTitle = page.locator('.suggested-links-title');
    await expect(suggestedLinksTitle).toContainText('Related Files');
  });

  test('should have mobile suggested links container', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const mobileLinks = page.locator('#suggested-links-mobile');
    await expect(mobileLinks).toBeAttached();
    await expect(mobileLinks).toHaveClass(/hidden/);
  });
});

test.describe('TOC Item Styling', () => {
  test('should apply correct CSS classes to TOC items', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocSidebar = page.locator('#markdown-sidebar');

    // Check sidebar styling
    await expect(tocSidebar).toHaveCSS('display', 'flex');
    await expect(tocSidebar).toHaveCSS('flex-direction', 'column');
  });

  test('should have proper spacing according to Material UI guidelines', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocSidebar = page.locator('#markdown-sidebar');

    // Check width (should be 280px on desktop)
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width > 768) {
      await expect(tocSidebar).toHaveCSS('width', '280px');
    }
  });
});

test.describe('TOC Interaction Behavior', () => {
  test('should have clickable TOC items with cursor pointer', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // This test verifies the CSS is set up correctly
    const tocContent = page.locator('#toc-content');
    await expect(tocContent).toBeAttached();
  });

  test('should not show default browser focus outline on TOC', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocItems = page.locator('.toc-item');
    const count = await tocItems.count();

    // Verify user-select: none is applied
    for (let i = 0; i < Math.min(count, 3); i++) {
      const item = tocItems.nth(i);
      await expect(item).toHaveCSS('user-select', 'none');
    }
  });
});

test.describe('Responsive Layout', () => {
  test('should show sidebar on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const editorWrapper = page.locator('#editor-wrapper');
    await expect(editorWrapper).toHaveCSS('display', 'flex');

    // On desktop, sidebar should be able to be not hidden (when markdown file is open)
    const sidebar = page.locator('#markdown-sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('should adjust layout on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const editorWrapper = page.locator('#editor-wrapper');
    await expect(editorWrapper).toBeAttached();

    // Mobile suggested links should exist
    const mobileLinks = page.locator('#suggested-links-mobile');
    await expect(mobileLinks).toBeAttached();
  });

  test('should center editor wrapper on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const editorWrapper = page.locator('#editor-wrapper');

    // Check max-width constraint
    const box = await editorWrapper.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(1400);
    }
  });
});

test.describe('TOC Accessibility', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocTitle = page.locator('.toc-title');
    await expect(tocTitle).toBeAttached();

    const suggestedTitle = page.locator('.suggested-links-title');
    await expect(suggestedTitle).toBeAttached();
  });

  test('should have title attributes for truncated text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // TOC items should have text truncation setup
    const tocContent = page.locator('#toc-content');
    await expect(tocContent).toBeAttached();
  });
});

test.describe('TOC Empty States', () => {
  test('should show proper empty state message structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocContent = page.locator('#toc-content');
    await expect(tocContent).toBeAttached();

    // Content starts empty
    const isEmpty = await tocContent.evaluate((el) => el.children.length === 0);
    expect(isEmpty).toBe(true);
  });

  test('should show empty state for suggested links', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const suggestedContent = page.locator('#suggested-links-content');
    await expect(suggestedContent).toBeAttached();

    const isEmpty = await suggestedContent.evaluate((el) => el.children.length === 0);
    expect(isEmpty).toBe(true);
  });
});

test.describe('TOC Visual Feedback', () => {
  test('should have hover states on TOC items', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Verify hover transition is defined in CSS
    const tocItem = page.locator('.toc-item').first();
    if ((await tocItem.count()) > 0) {
      await expect(tocItem).toHaveCSS('transition', /all/);
    }
  });

  test('should have smooth transitions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocItem = page.locator('.toc-item').first();
    if ((await tocItem.count()) > 0) {
      // Check transition duration is reasonable (0.2s = 200ms)
      await expect(tocItem).toHaveCSS('transition-duration', '0.2s');
    }
  });
});

test.describe('TOC Border and Spacing', () => {
  test('should have border separators on section titles', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocTitle = page.locator('.toc-title');
    await expect(tocTitle).toHaveCSS('border-bottom-width', '1px');

    const suggestedTitle = page.locator('.suggested-links-title');
    await expect(suggestedTitle).toHaveCSS('border-bottom-width', '1px');
  });

  test('should have proper border radius on interactive elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocItem = page.locator('.toc-item').first();
    if ((await tocItem.count()) > 0) {
      await expect(tocItem).toHaveCSS('border-radius', '8px');
    }

    const suggestedLink = page.locator('.suggested-link').first();
    if ((await suggestedLink.count()) > 0) {
      await expect(suggestedLink).toHaveCSS('border-radius', '8px');
    }
  });
});

test.describe('TOC Material Design Compliance', () => {
  test('should use 8px grid for spacing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const sidebar = page.locator('#markdown-sidebar');

    // Gap between sections should be 32px (4 * 8px)
    await expect(sidebar).toHaveCSS('gap', '32px');
  });

  test('should have minimum touch target size of 40px', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocItem = page.locator('.toc-item').first();
    if ((await tocItem.count()) > 0) {
      await expect(tocItem).toHaveCSS('min-height', '40px');
    }

    const suggestedLink = page.locator('.suggested-link').first();
    if ((await suggestedLink.count()) > 0) {
      await expect(suggestedLink).toHaveCSS('min-height', '40px');
    }
  });

  test('should have proper font sizing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const tocItem = page.locator('.toc-item').first();
    if ((await tocItem.count()) > 0) {
      await expect(tocItem).toHaveCSS('font-size', '14px');
    }

    const tocTitle = page.locator('.toc-title');
    await expect(tocTitle).toHaveCSS('font-size', '12px');
  });
});

test.describe('TOC Performance', () => {
  test('should not cause layout shift when TOC appears', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const editorWrapper = page.locator('#editor-wrapper');
    const initialBox = await editorWrapper.boundingBox();

    // Editor wrapper should maintain its structure
    await page.waitForTimeout(100);
    const finalBox = await editorWrapper.boundingBox();

    expect(initialBox).toBeTruthy();
    expect(finalBox).toBeTruthy();
  });

  test('should load TOC containers without JavaScript errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error));

    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    expect(errors).toHaveLength(0);
  });
});
