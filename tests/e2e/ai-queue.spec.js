/**
 * E2E Tests for AI Request Queueing
 * Tests the full AI improvement flow with queueing, progress UI, and loading decorations
 */

import { test, expect } from '@playwright/test';

test.describe('AI Request Queueing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForSelector('#editor');

    // Configure mock AI provider to avoid real AI calls
    await page.evaluate(() => {
      // Mock the improveText function to simulate AI response with delay
      const _originalImproveText = window.improveText;
      window.mockAIDelay = 1000; // 1 second delay for testing

      window.improveText = async function (text, onChunk, signal) {
        await new Promise((resolve) => setTimeout(resolve, window.mockAIDelay));

        if (signal?.aborted) {
          throw new Error('Request aborted');
        }

        const improved = text.toUpperCase(); // Simple transformation for testing

        if (onChunk) {
          onChunk(improved);
        }

        return improved;
      };
    });
  });

  test('should show loading decoration when AI request starts', async ({ page }) => {
    // Enter some text
    await page.locator('#editor').click();
    await page.keyboard.type('hello world');

    // Select the text
    await page.keyboard.press('Control+A');

    // Click AI improve button
    await page.click('[data-testid="ai-toolbar-btn"]');

    // Check for loading decoration
    const decoration = await page.locator('.ai-loading-decoration');
    await expect(decoration).toBeVisible({ timeout: 1000 });
  });

  test('should show progress toast in bottom-left', async ({ page }) => {
    // Set up longer delay to see toast
    await page.evaluate(() => {
      window.mockAIDelay = 2000;
    });

    // Enter and select text
    await page.locator('#editor').click();
    await page.keyboard.type('test text');
    await page.keyboard.press('Control+A');

    // Trigger AI improvement
    await page.click('[data-testid="ai-toolbar-btn"]');

    // Check for toast
    const toast = page.locator('.model-progress-toast');
    await expect(toast).toBeVisible({ timeout: 1000 });

    // Verify position
    const box = await toast.boundingBox();
    expect(box.x).toBeLessThan(100); // Left side
    expect(box.y).toBeGreaterThan(window.innerHeight - 200); // Bottom
  });

  test('should queue multiple AI requests', async ({ page }) => {
    // Set up delay
    await page.evaluate(() => {
      window.mockAIDelay = 1500;
    });

    // Enter text
    await page.locator('#editor').click();
    await page.keyboard.type('first second third');

    // Make first request
    await page.keyboard.press('Control+A');
    await page.click('[data-testid="ai-improve-button"]');

    // Wait a bit then make second request
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+A');
    await page.click('[data-testid="ai-improve-button"]');

    // Check toast shows queue info
    const toast = page.locator('.model-progress-toast');
    await expect(toast).toBeVisible();

    const status = page.locator('.model-progress-status');
    await expect(status).toContainText('queued', { timeout: 1000 });
  });

  test('should process queued requests in order', async ({ page }) => {
    // Set up tracking
    await page.evaluate(() => {
      window.aiResults = [];
      window.mockAIDelay = 500;

      // Override to track order
      const original = window.improveText;
      window.improveText = async function (text, onChunk, signal) {
        const result = await original(text, onChunk, signal);
        window.aiResults.push(text);
        return result;
      };
    });

    // Enter text
    await page.locator('#editor').click();
    await page.keyboard.type('first');

    // Queue three requests
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Control+A');
      await page.click('[data-testid="ai-toolbar-btn"]');
      await page.waitForTimeout(50);
    }

    // Wait for all to complete
    await page.waitForTimeout(2000);

    // Check they processed in order
    const results = await page.evaluate(() => window.aiResults);
    expect(results).toHaveLength(3);
    expect(results[0]).toBe('first');
    expect(results[1]).toBe('FIRST'); // Result of first improvement
    expect(results[2]).toBe('FIRST'); // Result of second improvement
  });

  test('should NOT clear queue when switching editor modes', async ({ page }) => {
    // Set up long delay
    await page.evaluate(() => {
      window.mockAIDelay = 3000;
    });

    // Enter text
    await page.locator('#editor').click();
    await page.keyboard.type('test');

    // Queue request
    await page.keyboard.press('Control+A');
    await page.click('[data-testid="ai-improve-button"]');

    // Verify queue has item
    const queueSize = await page.evaluate(() => window.aiQueue?.size());
    expect(queueSize).toBeGreaterThan(0);

    // Switch editor mode
    await page.click('[data-testid="mode-toggle-button"]');

    // Verify queue was NOT cleared
    const newQueueSize = await page.evaluate(() => window.aiQueue?.size());
    expect(newQueueSize).toBeGreaterThan(0);
  });

  test('should preserve AI decorations when switching from WYSIWYG to Source', async ({ page }) => {
    // Set up long delay
    await page.evaluate(() => {
      window.mockAIDelay = 3000;
    });

    // Enter text in WYSIWYG mode
    await page.locator('#editor').click();
    await page.keyboard.type('hello world');

    // Select and trigger AI
    await page.keyboard.press('Control+A');
    await page.click('[data-testid="ai-improve-button"]');

    // Verify decoration is visible in WYSIWYG
    const decorationBefore = page.locator('.ai-loading-decoration');
    await expect(decorationBefore).toBeVisible({ timeout: 1000 });

    // Switch to Source mode
    await page.click('[data-testid="mode-toggle-button"]');

    // Wait for mode switch
    await page.waitForTimeout(500);

    // Verify decoration is still visible in Source mode
    const decorationAfter = page.locator('.ai-loading-decoration');
    await expect(decorationAfter).toBeVisible({ timeout: 1000 });
  });

  test('should preserve AI decorations when switching from Source to WYSIWYG', async ({ page }) => {
    // Start in Source mode
    await page.click('[data-testid="mode-toggle-button"]');
    await page.waitForTimeout(500);

    // Set up long delay
    await page.evaluate(() => {
      window.mockAIDelay = 3000;
    });

    // Enter text in Source mode
    const sourceEditor = page.locator('.cm-editor');
    await sourceEditor.click();
    await page.keyboard.type('test content');

    // Select and trigger AI
    await page.keyboard.press('Control+A');
    await page.click('[data-testid="ai-improve-button"]');

    // Verify decoration in Source mode
    const decorationBefore = page.locator('.ai-loading-decoration');
    await expect(decorationBefore).toBeVisible({ timeout: 1000 });

    // Switch back to WYSIWYG
    await page.click('[data-testid="mode-toggle-button"]');

    // Wait for mode switch
    await page.waitForTimeout(500);

    // Verify decoration is still visible in WYSIWYG
    const decorationAfter = page.locator('.ai-loading-decoration');
    await expect(decorationAfter).toBeVisible({ timeout: 1000 });
  });

  test('should preserve multiple AI decorations across mode switches', async ({ page }) => {
    // Set up long delay
    await page.evaluate(() => {
      window.mockAIDelay = 5000;
    });

    // Enter text with multiple paragraphs
    await page.locator('#editor').click();
    await page.keyboard.type('first paragraph');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second paragraph');

    // Select first paragraph and trigger AI
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Control+A'); // This might select all, adjust as needed
    await page.click('[data-testid="ai-improve-button"]');

    // Wait a bit
    await page.waitForTimeout(100);

    // Select second paragraph and trigger AI
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Control+A');
    await page.click('[data-testid="ai-improve-button"]');

    // Count decorations in WYSIWYG
    const decorationCount = await page.locator('.ai-loading-decoration').count();
    expect(decorationCount).toBeGreaterThan(0);

    // Switch to Source mode
    await page.click('[data-testid="mode-toggle-button"]');
    await page.waitForTimeout(500);

    // Verify decorations are still present
    const decorationCountAfter = await page.locator('.ai-loading-decoration').count();
    expect(decorationCountAfter).toBeGreaterThan(0);

    // Switch back to WYSIWYG
    await page.click('[data-testid="mode-toggle-button"]');
    await page.waitForTimeout(500);

    // Verify decorations are still present
    const decorationCountFinal = await page.locator('.ai-loading-decoration').count();
    expect(decorationCountFinal).toBeGreaterThan(0);
  });

  test('should allow editing while AI is processing', async ({ page }) => {
    // Set up delay
    await page.evaluate(() => {
      window.mockAIDelay = 2000;
    });

    // Enter text
    await page.locator('#editor').click();
    await page.keyboard.type('original');

    // Start AI request
    await page.keyboard.press('Control+A');
    await page.click('[data-testid="ai-improve-button"]');

    // Editor should not be blocked
    await page.keyboard.press('End');
    await page.keyboard.type(' more text');

    // Verify text was added
    const content = await page.evaluate(() => {
      const editor = document.querySelector('#editor');
      return editor.textContent;
    });

    expect(content).toContain('more text');
  });

  test('should hide progress toast after completion', async ({ page }) => {
    // Short delay
    await page.evaluate(() => {
      window.mockAIDelay = 500;
    });

    // Enter and select text
    await page.locator('#editor').click();
    await page.keyboard.type('test');
    await page.keyboard.press('Control+A');

    // Trigger AI
    await page.click('[data-testid="ai-toolbar-btn"]');

    // Toast should appear
    const toast = page.locator('.model-progress-toast');
    await expect(toast).toBeVisible({ timeout: 500 });

    // Wait for completion
    await page.waitForTimeout(1000);

    // Toast should hide
    await expect(toast).not.toBeVisible({ timeout: 1000 });
  });

  test('should remove loading decoration after completion', async ({ page }) => {
    // Short delay
    await page.evaluate(() => {
      window.mockAIDelay = 500;
    });

    // Enter and select text
    await page.locator('#editor').click();
    await page.keyboard.type('test');
    await page.keyboard.press('Control+A');

    // Trigger AI
    await page.click('[data-testid="ai-toolbar-btn"]');

    // Decoration should appear
    const decoration = page.locator('.ai-loading-decoration');
    await expect(decoration).toBeVisible({ timeout: 500 });

    // Wait for completion
    await page.waitForTimeout(1000);

    // Decoration should be removed
    await expect(decoration).not.toBeVisible({ timeout: 1000 });
  });

  test('should handle errors gracefully', async ({ page }) => {
    // Set up to throw error
    await page.evaluate(() => {
      window.improveText = async function () {
        throw new Error('Mock AI error');
      };
    });

    // Listen for alert
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('AI improvement failed');
      await dialog.accept();
    });

    // Enter and select text
    await page.locator('#editor').click();
    await page.keyboard.type('test');
    await page.keyboard.press('Control+A');

    // Trigger AI
    await page.click('[data-testid="ai-toolbar-btn"]');

    // Wait for error handling
    await page.waitForTimeout(500);

    // Decoration should be removed
    const decoration = page.locator('.ai-loading-decoration');
    await expect(decoration).not.toBeVisible();
  });

  test('should show queue count in toast', async ({ page }) => {
    // Set up delay
    await page.evaluate(() => {
      window.mockAIDelay = 2000;
    });

    // Enter text
    await page.locator('#editor').click();
    await page.keyboard.type('test');

    // Queue 3 requests
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Control+A');
      await page.click('[data-testid="ai-toolbar-btn"]');
      await page.waitForTimeout(50);
    }

    // Check toast shows queue count
    const status = page.locator('.model-progress-status');
    await expect(status).toContainText('2 queued', { timeout: 1000 });

    // Wait a bit and check count decreases
    await page.waitForTimeout(2500);
    await expect(status).toContainText('1 queued', { timeout: 1000 });
  });
});
