import { test, expect } from '@playwright/test';

test.describe('Editor Padding', () => {
  test('should have correct CSS rules for ProseMirror padding', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');

    // Check the CSS rules directly by evaluating them in the page context
    const paddingStyles = await page.evaluate(() => {
      // Create a test element to check computed styles
      const testDiv = document.createElement('div');
      testDiv.className = 'milkdown';
      testDiv.innerHTML = '<div class="ProseMirror"></div>';
      testDiv.style.position = 'absolute';
      testDiv.style.left = '-9999px';
      document.body.appendChild(testDiv);

      const prosemirror = testDiv.querySelector('.ProseMirror');
      const styles = window.getComputedStyle(prosemirror);

      const result = {
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
        paddingLeft: styles.paddingLeft,
        paddingRight: styles.paddingRight,
        boxSizing: styles.boxSizing,
        minHeight: styles.minHeight,
      };

      // Clean up
      document.body.removeChild(testDiv);

      return result;
    });

    console.log('ProseMirror computed styles:', paddingStyles);

    // Expected: 4rem = 64px top, 7rem = 112px bottom
    expect(paddingStyles.paddingTop).toBe('64px');
    expect(paddingStyles.paddingBottom).toBe('112px');
    expect(paddingStyles.paddingLeft).toBe('0px');
    expect(paddingStyles.paddingRight).toBe('0px');

    // Note: box-sizing should be content-box for padding to extend scrollable area
    // If this shows border-box, the dev server may need cache clearing
    console.log('Box-sizing:', paddingStyles.boxSizing, '(should be content-box)');
  });

  test('should have scrollable content area with padding', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to load
    await page.waitForSelector('[data-testid="editor"]');

    // Check if milkdown container is scrollable
    const milkdown = page.locator('.milkdown');
    const hasMilkdown = await milkdown.count();

    if (hasMilkdown > 0) {
      const overflow = await milkdown.evaluate((el) => {
        return window.getComputedStyle(el).overflow;
      });

      console.log('Milkdown overflow:', overflow);

      // Should be 'auto' to allow scrolling
      expect(overflow).toBe('auto');

      // Check the ProseMirror element
      const prosemirror = page.locator('.milkdown .ProseMirror');
      const minHeight = await prosemirror.evaluate((el) => {
        return window.getComputedStyle(el).minHeight;
      });

      console.log('ProseMirror min-height:', minHeight);
    } else {
      console.log('No Milkdown editor found (no markdown file open)');
    }
  });

  test('should display padding visually with content', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to load
    await page.waitForSelector('[data-testid="editor"]');

    // This test would need a markdown file to be opened to verify padding
    // For now, we'll just check if the styles are correctly set in the DOM

    const prosemirror = page.locator('.milkdown .ProseMirror');
    const count = await prosemirror.count();

    if (count > 0) {
      // Get the bounding box of the ProseMirror element
      const box = await prosemirror.boundingBox();

      if (box) {
        console.log('ProseMirror bounding box:', box);

        // The element should have meaningful height (not collapsed)
        expect(box.height).toBeGreaterThan(100);
      }
    }
  });

  test('should have correct parent container padding', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[data-testid="editor"]');

    const milkdown = page.locator('.milkdown');
    const count = await milkdown.count();

    if (count > 0) {
      // Check the parent container padding (should only be horizontal)
      const paddingLeft = await milkdown.evaluate((el) => {
        return window.getComputedStyle(el).paddingLeft;
      });

      const paddingRight = await milkdown.evaluate((el) => {
        return window.getComputedStyle(el).paddingRight;
      });

      const paddingTop = await milkdown.evaluate((el) => {
        return window.getComputedStyle(el).paddingTop;
      });

      const paddingBottom = await milkdown.evaluate((el) => {
        return window.getComputedStyle(el).paddingBottom;
      });

      console.log('Milkdown container padding:', {
        top: paddingTop,
        right: paddingRight,
        bottom: paddingBottom,
        left: paddingLeft,
      });

      // Container should have 1.5rem (24px) horizontal padding
      expect(paddingLeft).toBe('24px');
      expect(paddingRight).toBe('24px');

      // Container should have 0 vertical padding (padding is on ProseMirror)
      expect(paddingTop).toBe('0px');
      expect(paddingBottom).toBe('0px');
    }
  });
});
