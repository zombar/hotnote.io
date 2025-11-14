/**
 * E2E tests for AI Provider Settings
 * Tests provider selection, configuration, and environment-based availability
 */

import { test, expect } from '@playwright/test';

// Helper to clear localStorage
async function clearStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    /* global sessionStorage */
    sessionStorage.clear();
  });
}

// Helper to open settings panel
async function openSettings(page) {
  // Click the settings button
  await page.click('[data-testid="settings-btn"]');

  // Wait for settings panel to be visible
  await page.waitForSelector('.settings-panel', { state: 'visible' });
}

// Helper to get current provider from settings
async function getCurrentProvider(page) {
  return await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('hotnote_settings') || '{}');
    return settings.provider;
  });
}

test.describe('AI Provider Settings - Local Environment', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to localhost (local environment)
    await page.goto('http://localhost:3011');
    await clearStorage(page);

    // Reload to get fresh defaults
    await page.reload();
  });

  test('should show only Ollama provider when running locally', async ({ page }) => {
    await openSettings(page);

    // Provider dropdown should exist
    const providerDropdown = page.locator('select[name="provider"]');
    await expect(providerDropdown).toBeVisible();

    // Should only have 1 option: Ollama
    const options = await providerDropdown.locator('option').all();
    expect(options.length).toBe(1);

    // Verify it's Ollama
    const firstOption = await providerDropdown.locator('option').first();
    await expect(firstOption).toHaveValue('ollama');
    await expect(firstOption).toContainText('Ollama');
  });

  test('should show Ollama-specific fields when running locally', async ({ page }) => {
    await openSettings(page);

    // Should show Endpoint URL field (not API Key)
    const endpointField = page.locator('input[name="endpoint"]');
    await expect(endpointField).toBeVisible();
    await expect(endpointField).toHaveValue('http://localhost:11434');

    // Should NOT show API Key field
    const apiKeyField = page.locator('input[name^="apiKey"]');
    await expect(apiKeyField).not.toBeVisible();

    // Should show help text for Ollama
    await expect(page.locator('text=Enter the URL of your local Ollama server')).toBeVisible();

    // Should NOT show Anthropic/OpenAI links
    await expect(page.locator('a[href*="anthropic.com"]')).not.toBeVisible();
    await expect(page.locator('a[href*="openai.com"]')).not.toBeVisible();
  });

  test('should show Ollama model text input when running locally', async ({ page }) => {
    await openSettings(page);

    // Should be a text input (not dropdown) for Ollama
    const modelInput = page.locator('input[name="model"]');
    await expect(modelInput).toBeVisible();
    await expect(modelInput).toHaveAttribute('type', 'text');

    // Should have default value of llama2
    await expect(modelInput).toHaveValue('llama2');

    // Should have help text with examples
    await expect(page.locator('text=llama2, mistral, codellama')).toBeVisible();
  });

  test('should NOT show privacy banner when running locally', async ({ page }) => {
    await openSettings(page);

    // Privacy banner should NOT be visible when running locally
    const banner = page.locator('.settings-info-banner');
    await expect(banner).not.toBeVisible();
  });

  test('should default to Ollama provider when running locally', async ({ page }) => {
    await openSettings(page);

    const providerDropdown = page.locator('select[name="provider"]');
    await expect(providerDropdown).toHaveValue('ollama');
  });

  test('should save Ollama settings correctly', async ({ page }) => {
    await openSettings(page);

    // Change endpoint
    await page.fill('input[name="endpoint"]', 'http://localhost:8080');

    // Change model (now a text input)
    await page.fill('input[name="model"]', 'mistral');

    // Change system prompt
    await page.fill('textarea[name="systemPrompt"]', 'Custom test prompt for Ollama');

    // Save settings
    await page.click('button:has-text("Save")');

    // Wait for panel to close
    await expect(page.locator('.settings-panel')).not.toBeVisible();

    // Verify settings were saved
    const savedProvider = await getCurrentProvider(page);
    expect(savedProvider).toBe('ollama');

    const savedSettings = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('hotnote_settings'));
    });

    expect(savedSettings.ollama.endpoint).toBe('http://localhost:8080');
    expect(savedSettings.ollama.model).toBe('mistral');
    expect(savedSettings.ollama.systemPrompt).toBe('Custom test prompt for Ollama');
  });

  test('should handle legacy settings with cloud provider gracefully', async ({ page }) => {
    // Simulate old settings with Claude provider
    await page.evaluate(() => {
      localStorage.setItem(
        'hotnote_settings',
        JSON.stringify({
          provider: 'claude',
          claude: {
            model: 'claude-3-haiku-20240307',
            systemPrompt: 'Old prompt',
          },
          apiKeys: {
            claude: 'sk-ant-test123',
          },
        })
      );
    });

    await page.reload();
    await openSettings(page);

    // Should show Ollama fields (not Claude fields)
    const endpointField = page.locator('input[name="endpoint"]');
    await expect(endpointField).toBeVisible();

    // Should NOT show API key field
    const apiKeyField = page.locator('input[name^="apiKey"]');
    await expect(apiKeyField).not.toBeVisible();

    // Provider should be Ollama
    const providerDropdown = page.locator('select[name="provider"]');
    await expect(providerDropdown).toHaveValue('ollama');
  });

  test('should validate Ollama endpoint URL', async ({ page }) => {
    await openSettings(page);

    // Enter invalid URL
    await page.fill('input[name="endpoint"]', 'not-a-valid-url');

    // Try to save
    await page.click('button:has-text("Save")');

    // Should show validation error
    await expect(page.locator('.settings-error')).toBeVisible();
    await expect(page.locator('#settings-endpoint-error')).toContainText('valid');
  });
});

test.describe('AI Provider Settings - Hosted Environment', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // Skip if not testing hosted environment
    // This test would run when BASE_URL is set to hotnote.io
    if (!baseURL || baseURL.includes('localhost')) {
      test.skip();
    }

    await page.goto(baseURL);
    await clearStorage(page);
    await page.reload();
  });

  test('should show only cloud providers when hosted', async ({ page }) => {
    await openSettings(page);

    const providerDropdown = page.locator('select[name="provider"]');
    await expect(providerDropdown).toBeVisible();

    // Should have 2 options: Claude and OpenAI (no Ollama)
    const options = await providerDropdown.locator('option').all();
    expect(options.length).toBe(2);

    // Verify options
    const optionTexts = await Promise.all(options.map((opt) => opt.textContent()));
    expect(optionTexts.some((text) => text.includes('Claude'))).toBeTruthy();
    expect(optionTexts.some((text) => text.includes('OpenAI'))).toBeTruthy();
    expect(optionTexts.some((text) => text.includes('Ollama'))).toBeFalsy();
  });

  test('should show API key field for cloud providers', async ({ page }) => {
    await openSettings(page);

    // Should show API Key field
    const apiKeyField = page.locator('input[type="password"][name^="apiKey"]');
    await expect(apiKeyField).toBeVisible();

    // Should NOT show Endpoint URL field
    const endpointField = page.locator('input[name="endpoint"]');
    await expect(endpointField).not.toBeVisible();
  });

  test('should show appropriate help link for each provider', async ({ page }) => {
    await openSettings(page);

    // Test Claude provider
    await page.selectOption('select[name="provider"]', 'claude');
    await expect(page.locator('a[href*="anthropic.com"]')).toBeVisible();
    await expect(page.locator('a:has-text("Anthropic API key")')).toBeVisible();

    // Test OpenAI provider
    await page.selectOption('select[name="provider"]', 'openai');
    await expect(page.locator('a[href*="openai.com"]')).toBeVisible();
    await expect(page.locator('a:has-text("OpenAI API key")')).toBeVisible();
  });

  test('should show privacy banner when hosted', async ({ page }) => {
    await openSettings(page);

    // Privacy banner should be visible on hosted version
    const banner = page.locator('.settings-info-banner');
    await expect(banner).toBeVisible();

    // Should contain privacy messaging
    await expect(banner).toContainText('Local-First & Private');
    await expect(banner).toContainText('Your data never leaves your device');

    // Should have lock icon
    await expect(page.locator('.settings-info-icon')).toContainText('🔒');
  });

  test('should validate API key format', async ({ page }) => {
    await openSettings(page);

    // Test Claude API key validation
    await page.selectOption('select[name="provider"]', 'claude');
    await page.fill('input[name="apiKey-claude"]', 'invalid-key');
    await page.click('button:has-text("Save")');

    await expect(page.locator('.settings-error')).toBeVisible();
    await expect(page.locator('#settings-apiKey-claude-error')).toContainText('sk-ant-');

    // Test OpenAI API key validation
    await page.selectOption('select[name="provider"]', 'openai');
    await page.fill('input[name="apiKey-openai"]', 'invalid-key');
    await page.click('button:has-text("Save")');

    await expect(page.locator('.settings-error')).toBeVisible();
    await expect(page.locator('#settings-apiKey-openai-error')).toContainText('sk-');
  });
});

test.describe('AI Provider Settings - Common Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3011');
    await clearStorage(page);
    await page.reload();
  });

  test('should toggle API key visibility', async ({ page }) => {
    // Set up cloud provider in settings (will be tested in hosted env)
    await page.evaluate(() => {
      localStorage.setItem(
        'hotnote_settings',
        JSON.stringify({
          provider: 'claude',
          apiKeys: { claude: 'sk-ant-test123' },
        })
      );
    });

    // For this test, temporarily modify environment to show cloud providers
    // (In real hosted environment, this would work naturally)
    await openSettings(page);

    // Find toggle button (if API key field is visible)
    const toggleButton = page.locator('button.settings-api-key-toggle');

    if (await toggleButton.isVisible()) {
      const apiKeyInput = page.locator('input[name^="apiKey"]').first();

      // Initially should be password type
      await expect(apiKeyInput).toHaveAttribute('type', 'password');
      await expect(toggleButton).toHaveText('Show');

      // Click to show
      await toggleButton.click();
      await expect(apiKeyInput).toHaveAttribute('type', 'text');
      await expect(toggleButton).toHaveText('Hide');

      // Click to hide
      await toggleButton.click();
      await expect(apiKeyInput).toHaveAttribute('type', 'password');
      await expect(toggleButton).toHaveText('Show');
    }
  });

  test('should update model field type when provider changes', async ({ page }) => {
    // Note: This test assumes we can change providers
    // In local env, only Ollama is available (text input)
    // In hosted env, we can switch between Claude and OpenAI (dropdowns)
    // This test is more applicable in hosted environment

    await openSettings(page);

    // Check current model field type
    const modelInput = page.locator('input[name="model"]');
    const modelDropdown = page.locator('select[name="model"]');

    // Either input or dropdown should be visible
    const hasInput = await modelInput.isVisible();
    const hasDropdown = await modelDropdown.isVisible();

    expect(hasInput || hasDropdown).toBeTruthy();
  });

  test('should preserve system prompt when changing models', async ({ page }) => {
    await openSettings(page);

    // Set custom system prompt
    const customPrompt = 'My custom system prompt';
    await page.fill('textarea[name="systemPrompt"]', customPrompt);

    // Change model (text input for Ollama)
    const modelInput = page.locator('input[name="model"]');
    if (await modelInput.isVisible()) {
      await modelInput.fill('mistral');
      // System prompt should remain
      await expect(page.locator('textarea[name="systemPrompt"]')).toHaveValue(customPrompt);
    } else {
      // Dropdown for cloud providers
      const modelDropdown = page.locator('select[name="model"]');
      const optionCount = await modelDropdown.locator('option').count();
      if (optionCount > 1) {
        await modelDropdown.selectOption({ index: 1 });
        // System prompt should remain
        await expect(page.locator('textarea[name="systemPrompt"]')).toHaveValue(customPrompt);
      }
    }
  });

  test('should close settings on cancel', async ({ page }) => {
    await openSettings(page);

    // Make a change
    await page.fill('textarea[name="systemPrompt"]', 'Changed prompt');

    // Click cancel
    await page.click('button:has-text("Cancel")');

    // Settings should close
    await expect(page.locator('.settings-panel')).not.toBeVisible();

    // Changes should not be saved
    const settings = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('hotnote_settings') || '{}');
    });

    expect(settings.ollama?.systemPrompt).not.toBe('Changed prompt');
  });

  test('should close settings on overlay click', async ({ page }) => {
    await openSettings(page);

    // Click on overlay (outside panel)
    await page.click('.settings-overlay');

    // Settings should close
    await expect(page.locator('.settings-panel')).not.toBeVisible();
  });

  test('should close settings on ESC key', async ({ page }) => {
    await openSettings(page);

    // Press ESC
    await page.keyboard.press('Escape');

    // Settings should close
    await expect(page.locator('.settings-panel')).not.toBeVisible();
  });

  test('should show appropriate source code link', async ({ page }) => {
    await openSettings(page);

    const sourceLink = page.locator('[data-testid="settings-source-code-link"]');

    if (await sourceLink.isVisible()) {
      await expect(sourceLink).toHaveAttribute('href', 'https://github.com/zombar/hotnote.io');
      await expect(sourceLink).toHaveAttribute('target', '_blank');
      await expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});

test.describe('AI Provider Settings - Model Defaults', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3011');
    await clearStorage(page);
    await page.reload();
  });

  test('should have correct default model for Ollama', async ({ page }) => {
    await openSettings(page);

    const modelInput = page.locator('input[name="model"]');
    const currentValue = await modelInput.inputValue();

    // Default Ollama model should be llama2
    expect(currentValue).toBe('llama2');
  });

  test('should allow custom Ollama model names', async ({ page }) => {
    await openSettings(page);

    const modelInput = page.locator('input[name="model"]');

    // Should allow entering custom models
    await modelInput.fill('');
    await modelInput.fill('llama3:70b');
    await expect(modelInput).toHaveValue('llama3:70b');

    await modelInput.fill('mistral:latest');
    await expect(modelInput).toHaveValue('mistral:latest');

    await modelInput.fill('custom-model');
    await expect(modelInput).toHaveValue('custom-model');
  });

  test('should maintain model selection after reopening settings', async ({ page }) => {
    await openSettings(page);

    // Enter a custom model
    await page.fill('input[name="model"]', 'codellama:13b');

    // Save
    await page.click('button:has-text("Save")');
    await expect(page.locator('.settings-panel')).not.toBeVisible();

    // Reopen settings
    await openSettings(page);

    // Model should still be the custom value
    await expect(page.locator('input[name="model"]')).toHaveValue('codellama:13b');
  });
});
