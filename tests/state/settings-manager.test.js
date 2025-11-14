import { describe, it, expect, beforeEach } from 'vitest';
import {
  settingsManager,
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings,
  resetSettings,
  validateEndpointUrl,
} from '../../src/state/settings-manager.js';

describe('Settings Manager', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('Default Settings', () => {
    it('should return default settings when no settings are stored', () => {
      const settings = getSettings();

      // Check structure includes all provider settings
      expect(settings.provider).toBe('ollama');
      expect(settings.ollama).toEqual({
        endpoint: 'http://localhost:11434',
        model: 'llama2',
        systemPrompt:
          'You are a helpful AI assistant. Improve the provided text while maintaining its original meaning and tone. Include only the replacement text in your response.',
        temperature: 0.7,
        topP: 0.9,
      });
      expect(settings.claude).toBeDefined();
      expect(settings.openai).toBeDefined();
      expect(settings.apiKeys).toBeDefined();
    });

    it('should have valid default endpoint URL', () => {
      const settings = getSettings();
      expect(validateEndpointUrl(settings.ollama.endpoint)).toBe(true);
    });

    it('should have temperature between 0 and 1', () => {
      const settings = getSettings();
      expect(settings.ollama.temperature).toBeGreaterThanOrEqual(0);
      expect(settings.ollama.temperature).toBeLessThanOrEqual(1);
    });

    it('should have topP between 0 and 1', () => {
      const settings = getSettings();
      expect(settings.ollama.topP).toBeGreaterThanOrEqual(0);
      expect(settings.ollama.topP).toBeLessThanOrEqual(1);
    });
  });

  describe('loadSettings', () => {
    it('should load settings from localStorage', () => {
      const customSettings = {
        ollama: {
          endpoint: 'http://custom:8080',
          model: 'mistral',
          systemPrompt: 'Custom prompt',
          temperature: 0.5,
          topP: 0.8,
        },
      };

      localStorage.setItem('hotnote_settings', JSON.stringify(customSettings));

      const loaded = loadSettings();
      // Settings are merged with defaults, so check specific fields
      expect(loaded.ollama).toEqual(customSettings.ollama);
      expect(loaded.provider).toBeDefined();
      expect(loaded.apiKeys).toBeDefined();
    });

    it('should return default settings if localStorage is empty', () => {
      const settings = loadSettings();

      expect(settings.ollama.endpoint).toBe('http://localhost:11434');
      expect(settings.ollama.model).toBe('llama2');
    });

    it('should return default settings if localStorage contains invalid JSON', () => {
      localStorage.setItem('hotnote_settings', '{ invalid json');

      const settings = loadSettings();
      expect(settings.ollama.endpoint).toBe('http://localhost:11434');
    });

    it('should merge with defaults if settings are incomplete', () => {
      const partialSettings = {
        ollama: {
          endpoint: 'http://custom:9000',
        },
      };

      localStorage.setItem('hotnote_settings', JSON.stringify(partialSettings));

      const settings = loadSettings();
      expect(settings.ollama.endpoint).toBe('http://custom:9000');
      expect(settings.ollama.model).toBe('llama2'); // From defaults
      expect(settings.ollama.temperature).toBe(0.7); // From defaults
    });
  });

  describe('saveSettings', () => {
    it('should save settings to localStorage', () => {
      const newSettings = {
        ollama: {
          endpoint: 'http://localhost:11434',
          model: 'codellama',
          systemPrompt: 'Test prompt',
          temperature: 0.3,
          topP: 0.95,
        },
      };

      saveSettings(newSettings);

      const stored = localStorage.getItem('hotnote_settings');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored);
      // Settings are merged with defaults, so check specific fields
      expect(parsed.ollama).toEqual(newSettings.ollama);
      expect(parsed.provider).toBeDefined();
    });

    it('should overwrite existing settings', () => {
      const initialSettings = {
        ollama: {
          endpoint: 'http://old:8080',
          model: 'llama2',
          systemPrompt: 'Old prompt',
          temperature: 0.5,
          topP: 0.8,
        },
      };

      saveSettings(initialSettings);

      const newSettings = {
        ollama: {
          endpoint: 'http://new:9090',
          model: 'mistral',
          systemPrompt: 'New prompt',
          temperature: 0.6,
          topP: 0.85,
        },
      };

      saveSettings(newSettings);

      const stored = JSON.parse(localStorage.getItem('hotnote_settings'));
      expect(stored.ollama.endpoint).toBe('http://new:9090');
      expect(stored.ollama.model).toBe('mistral');
    });
  });

  describe('updateSettings', () => {
    it('should update specific settings while preserving others', () => {
      const initial = getSettings();

      updateSettings({
        ollama: {
          endpoint: 'http://updated:7777',
        },
      });

      const updated = getSettings();
      expect(updated.ollama.endpoint).toBe('http://updated:7777');
      expect(updated.ollama.model).toBe(initial.ollama.model);
      expect(updated.ollama.systemPrompt).toBe(initial.ollama.systemPrompt);
    });

    it('should update multiple fields at once', () => {
      updateSettings({
        ollama: {
          model: 'phi',
          temperature: 0.2,
        },
      });

      const settings = getSettings();
      expect(settings.ollama.model).toBe('phi');
      expect(settings.ollama.temperature).toBe(0.2);
    });

    it('should persist updates to localStorage', () => {
      updateSettings({
        ollama: {
          endpoint: 'http://persistent:3000',
        },
      });

      const stored = JSON.parse(localStorage.getItem('hotnote_settings'));
      expect(stored.ollama.endpoint).toBe('http://persistent:3000');
    });
  });

  describe('resetSettings', () => {
    it('should reset to default settings', () => {
      // First, modify settings
      updateSettings({
        ollama: {
          endpoint: 'http://custom:5000',
          model: 'custom-model',
          temperature: 0.1,
        },
      });

      // Verify settings were changed
      let settings = getSettings();
      expect(settings.ollama.endpoint).toBe('http://custom:5000');

      // Reset
      resetSettings();

      // Verify settings are back to defaults
      settings = getSettings();
      expect(settings.ollama.endpoint).toBe('http://localhost:11434');
      expect(settings.ollama.model).toBe('llama2');
      expect(settings.ollama.temperature).toBe(0.7);
    });

    it('should remove settings from localStorage', () => {
      updateSettings({
        ollama: { endpoint: 'http://test:8080' },
      });

      expect(localStorage.getItem('hotnote_settings')).toBeTruthy();

      resetSettings();

      expect(localStorage.getItem('hotnote_settings')).toBeNull();
    });
  });

  describe('validateEndpointUrl', () => {
    it('should accept valid http URLs', () => {
      expect(validateEndpointUrl('http://localhost:11434')).toBe(true);
      expect(validateEndpointUrl('http://127.0.0.1:8080')).toBe(true);
      expect(validateEndpointUrl('http://example.com:3000')).toBe(true);
    });

    it('should accept valid https URLs', () => {
      expect(validateEndpointUrl('https://api.example.com')).toBe(true);
      expect(validateEndpointUrl('https://ollama.local:443')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateEndpointUrl('not a url')).toBe(false);
      expect(validateEndpointUrl('')).toBe(false);
      expect(validateEndpointUrl('ftp://example.com')).toBe(false);
    });

    it('should reject URLs without protocol', () => {
      expect(validateEndpointUrl('localhost:11434')).toBe(false);
      expect(validateEndpointUrl('example.com')).toBe(false);
    });

    it('should accept URLs without port', () => {
      expect(validateEndpointUrl('http://localhost')).toBe(true);
      expect(validateEndpointUrl('https://example.com')).toBe(true);
    });
  });

  describe('Settings Manager Singleton', () => {
    it('should provide singleton instance', () => {
      expect(settingsManager).toBeDefined();
      expect(typeof settingsManager.get).toBe('function');
      expect(typeof settingsManager.update).toBe('function');
      expect(typeof settingsManager.reset).toBe('function');
    });

    it('should maintain state across calls', () => {
      settingsManager.update({
        ollama: { model: 'singleton-test' },
      });

      const settings1 = settingsManager.get();
      const settings2 = settingsManager.get();

      expect(settings1.ollama.model).toBe('singleton-test');
      expect(settings2.ollama.model).toBe('singleton-test');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete settings workflow', () => {
      // Start with defaults
      const defaults = getSettings();
      expect(defaults.ollama.model).toBe('llama2');

      // Update settings
      updateSettings({
        ollama: {
          endpoint: 'http://workflow:4000',
          model: 'workflow-model',
          systemPrompt: 'Workflow prompt',
          temperature: 0.4,
          topP: 0.75,
        },
      });

      // Verify update
      let settings = getSettings();
      expect(settings.ollama.endpoint).toBe('http://workflow:4000');
      expect(settings.ollama.model).toBe('workflow-model');

      // Simulate reload (clear memory, load from localStorage)
      const stored = localStorage.getItem('hotnote_settings');
      const reloaded = JSON.parse(stored);

      expect(reloaded.ollama.endpoint).toBe('http://workflow:4000');
      expect(reloaded.ollama.model).toBe('workflow-model');

      // Reset
      resetSettings();

      // Verify reset
      settings = getSettings();
      expect(settings.ollama.model).toBe('llama2');
      expect(localStorage.getItem('hotnote_settings')).toBeNull();
    });

    it('should handle corrupted localStorage gracefully', () => {
      // Corrupt localStorage
      localStorage.setItem('hotnote_settings', 'corrupted{data');

      // Should fall back to defaults without throwing
      expect(() => loadSettings()).not.toThrow();

      const settings = loadSettings();
      expect(settings.ollama.endpoint).toBe('http://localhost:11434');
    });

    it('should validate settings before saving', () => {
      const invalidSettings = {
        ollama: {
          endpoint: 'invalid url',
          model: 'test',
          systemPrompt: 'test',
          temperature: 1.5, // Out of range
          topP: -0.1, // Out of range
        },
      };

      // saveSettings should validate and clamp values
      saveSettings(invalidSettings);

      const settings = getSettings();
      // Endpoint should be rejected, fall back to default
      expect(validateEndpointUrl(settings.ollama.endpoint)).toBe(true);
    });
  });
});
