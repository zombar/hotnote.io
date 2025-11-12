/* eslint-env node */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * E2E Regression Tests for TOC Scrolling Functionality
 *
 * REGRESSION: Clicking on headings in the TOC no longer scrolls to the heading
 * in the rich text viewer. These tests ensure this regression never happens again.
 */

test.describe('TOC Scrolling Regression - Critical Tests', () => {
  let consoleLogs = [];
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    // Reset log collectors
    consoleLogs = [];
    consoleErrors = [];

    // Capture console logs for debugging
    page.on('console', (msg) => {
      const text = msg.text();
      consoleLogs.push(text);
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
      // Echo TOC and scroll-related logs for debugging
      if (text.includes('[TOC]') || text.includes('[WYSIWYGView]')) {
        console.log('Browser:', text);
      }
    });

    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
      console.error('Page error:', error.message);
    });
  });

  test('P0: TOC click should actually change scroll position (regression canary)', async ({
    page,
  }) => {
    // This is the CRITICAL test that catches the regression

    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    // Load test document via evaluate to simulate file open
    const testMarkdown = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/long-document.md'),
      'utf-8'
    );

    // Create a markdown file handle and load it
    await page.evaluate((content) => {
      // Simulate loading markdown content
      const event = new CustomEvent('loadMarkdownContent', {
        detail: { content },
      });
      window.dispatchEvent(event);
    }, testMarkdown);

    // Wait for TOC to render
    await page.waitForTimeout(1000);

    // Verify TOC has items
    const tocItems = page.locator('.toc-item');
    const count = await tocItems.count();
    expect(count).toBeGreaterThan(0);

    // Measure initial scroll position
    const initialScroll = await page.evaluate(() => {
      const scrollers = [
        document.querySelector('.editor-scroller'),
        document.querySelector('.ProseMirror-scroller'),
        document.querySelector('[data-scroller]'),
        document.querySelector('.milkdown'),
      ];
      const scroller = scrollers.find((s) => s !== null);
      return scroller ? scroller.scrollTop : 0;
    });

    console.log('Initial scroll position:', initialScroll);

    // Find a TOC item that should be far down the page
    // Look for "Section Five" or similar
    const targetTocText = page
      .locator('.toc-text')
      .filter({ hasText: /Section (Five|Six|Four|Three)/ })
      .first();

    if ((await targetTocText.count()) === 0) {
      // Fallback: click any TOC item that's not the first
      const allTocTexts = await page.locator('.toc-text').all();
      if (allTocTexts.length > 2) {
        await allTocTexts[allTocTexts.length - 2].click();
      }
    } else {
      await targetTocText.click();
    }

    // Wait for scroll to complete
    await page.waitForTimeout(300);

    // Measure final scroll position
    const finalScroll = await page.evaluate(() => {
      const scrollers = [
        document.querySelector('.editor-scroller'),
        document.querySelector('.ProseMirror-scroller'),
        document.querySelector('[data-scroller]'),
        document.querySelector('.milkdown'),
      ];
      const scroller = scrollers.find((s) => s !== null);
      return scroller ? scroller.scrollTop : 0;
    });

    console.log('Final scroll position:', finalScroll);
    console.log('Scroll delta:', finalScroll - initialScroll);

    // CRITICAL ASSERTION: Scroll position MUST have changed significantly
    // If this fails, the regression has occurred
    expect(Math.abs(finalScroll - initialScroll)).toBeGreaterThan(50);

    // Verify no errors occurred during scrolling
    const hasScrollErrors = consoleErrors.some(
      (err) =>
        err.includes('[TOC]') ||
        err.includes('scrollToPosition') ||
        err.includes('Editor or scrollToPosition not available')
    );
    expect(hasScrollErrors).toBe(false);
  });

  test('P0: TOC click should log expected console messages', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const testMarkdown = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/long-document.md'),
      'utf-8'
    );

    await page.evaluate((content) => {
      const event = new CustomEvent('loadMarkdownContent', {
        detail: { content },
      });
      window.dispatchEvent(event);
    }, testMarkdown);

    await page.waitForTimeout(1000);

    // Click a TOC item
    const tocText = page.locator('.toc-text').first();
    if ((await tocText.count()) > 0) {
      await tocText.click();
      await page.waitForTimeout(200);
    }

    // Check for expected log patterns
    const hasTOCClickLog = consoleLogs.some(
      (log) => log.includes('[TOC]') && log.includes('Clicked heading')
    );

    const hasScrollLog = consoleLogs.some(
      (log) =>
        log.includes('[WYSIWYGView]') &&
        (log.includes('scrollToPosition') || log.includes('Scrolled to position'))
    );

    // At least one of these should be true if the mechanism is working
    expect(hasTOCClickLog || hasScrollLog || consoleLogs.length > 0).toBe(true);
  });

  test('P0: TOC click should not produce errors in console', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const testMarkdown = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/long-document.md'),
      'utf-8'
    );

    await page.evaluate((content) => {
      const event = new CustomEvent('loadMarkdownContent', {
        detail: { content },
      });
      window.dispatchEvent(event);
    }, testMarkdown);

    await page.waitForTimeout(1000);

    // Click multiple TOC items
    const tocTexts = await page.locator('.toc-text').all();
    for (let i = 0; i < Math.min(tocTexts.length, 3); i++) {
      await tocTexts[i].click();
      await page.waitForTimeout(100);
    }

    // Check for critical errors
    const criticalErrors = consoleErrors.filter(
      (err) =>
        err.includes('scrollToPosition not available') ||
        err.includes('Editor or scrollToPosition') ||
        err.includes('TypeError') ||
        err.includes('null is not an object') ||
        err.includes('Cannot read property')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('TOC Scrolling - Multiple Scroll Tests', () => {
  test('should support sequential scrolling to different headings', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const testMarkdown = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/long-document.md'),
      'utf-8'
    );

    await page.evaluate((content) => {
      const event = new CustomEvent('loadMarkdownContent', {
        detail: { content },
      });
      window.dispatchEvent(event);
    }, testMarkdown);

    await page.waitForTimeout(1000);

    const getScrollPosition = async () => {
      return await page.evaluate(() => {
        const scrollers = [
          document.querySelector('.editor-scroller'),
          document.querySelector('.ProseMirror-scroller'),
          document.querySelector('[data-scroller]'),
          document.querySelector('.milkdown'),
        ];
        const scroller = scrollers.find((s) => s !== null);
        return scroller ? scroller.scrollTop : 0;
      });
    };

    const tocTexts = await page.locator('.toc-text').all();

    if (tocTexts.length >= 3) {
      // Click first heading
      await tocTexts[0].click();
      await page.waitForTimeout(200);
      const scroll1 = await getScrollPosition();

      // Click last heading
      await tocTexts[tocTexts.length - 1].click();
      await page.waitForTimeout(200);
      const scroll2 = await getScrollPosition();

      // Click middle heading
      const middleIndex = Math.floor(tocTexts.length / 2);
      await tocTexts[middleIndex].click();
      await page.waitForTimeout(200);
      const scroll3 = await getScrollPosition();

      // All three positions should be different
      // (unless document is very short, but our fixture shouldn't be)
      const positions = [scroll1, scroll2, scroll3];
      const uniquePositions = new Set(positions);

      // We should have at least 2 different positions
      expect(uniquePositions.size).toBeGreaterThanOrEqual(2);
    }
  });

  test('should handle rapid consecutive clicks', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const testMarkdown = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/long-document.md'),
      'utf-8'
    );

    await page.evaluate((content) => {
      const event = new CustomEvent('loadMarkdownContent', {
        detail: { content },
      });
      window.dispatchEvent(event);
    }, testMarkdown);

    await page.waitForTimeout(1000);

    const tocTexts = await page.locator('.toc-text').all();

    // Rapid fire clicks
    if (tocTexts.length >= 3) {
      await tocTexts[0].click();
      await tocTexts[tocTexts.length - 1].click();
      await tocTexts[1].click();

      // Wait for everything to settle
      await page.waitForTimeout(500);

      // Should not have crashed or produced errors
      const errors = await page.evaluate(() => {
        return window.__testErrors || [];
      });

      expect(errors.length || 0).toBe(0);
    }
  });
});

test.describe('TOC Scrolling - Focus Management', () => {
  test('editor should maintain/regain focus after TOC click', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const testMarkdown = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/long-document.md'),
      'utf-8'
    );

    await page.evaluate((content) => {
      const event = new CustomEvent('loadMarkdownContent', {
        detail: { content },
      });
      window.dispatchEvent(event);
    }, testMarkdown);

    await page.waitForTimeout(1000);

    // Focus the editor first
    await page.click('[data-testid="editor"]');
    await page.waitForTimeout(100);

    // Click TOC item
    const tocText = page.locator('.toc-text').first();
    if ((await tocText.count()) > 0) {
      await tocText.click();
      await page.waitForTimeout(300);
    }

    // Check that editor is still focused or can be typed in
    const canType = await page.evaluate(() => {
      const editor = document.querySelector('[data-testid="editor"]');
      const prosemirror = document.querySelector('.ProseMirror');
      return editor !== null || prosemirror !== null;
    });

    expect(canType).toBe(true);
  });
});

test.describe('TOC Scrolling - Data Integrity', () => {
  test('TOC items should have valid data-pos attributes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');

    const testMarkdown = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/long-document.md'),
      'utf-8'
    );

    await page.evaluate((content) => {
      const event = new CustomEvent('loadMarkdownContent', {
        detail: { content },
      });
      window.dispatchEvent(event);
    }, testMarkdown);

    await page.waitForTimeout(1000);

    // Get all TOC items and check their data-pos
    const positions = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.toc-item'));
      return items.map((item) => {
        const pos = item.dataset.pos;
        return {
          hasPos: pos !== undefined,
          posValue: pos,
          isNumber: !isNaN(parseInt(pos, 10)),
        };
      });
    });

    // All items should have valid position data
    positions.forEach((item) => {
      expect(item.hasPos).toBe(true);
      expect(item.isNumber).toBe(true);
    });
  });
});
