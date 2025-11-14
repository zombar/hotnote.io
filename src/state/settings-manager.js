/**
 * Settings Manager
 * Manages application settings with localStorage persistence
 */

const STORAGE_KEY = 'hotnote_settings';

const DEFAULT_SETTINGS = {
  provider: 'ollama', // Default to Ollama (works locally, falls back to Claude when hosted)
  apiKeys: {
    openai: '',
    claude: '',
  },
  openai: {
    model: 'gpt-4o-mini',
    systemPrompt:
      'You are a helpful AI assistant. Improve the provided text while maintaining its original meaning and tone. Include only the replacement text in your response.',
    temperature: 0.7,
    topP: 0.9,
  },
  claude: {
    model: 'claude-3-haiku-20240307',
    systemPrompt:
      'You are a helpful AI assistant. Improve the provided text while maintaining its original meaning and tone. Include only the replacement text in your response.',
    temperature: 0.7,
    topP: 0.9,
  },
  ollama: {
    endpoint: 'http://localhost:11434',
    model: 'llama2',
    systemPrompt:
      'You are a helpful AI assistant. Improve the provided text while maintaining its original meaning and tone. Include only the replacement text in your response.',
    temperature: 0.7,
    topP: 0.9,
  },
};

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Clamp a number between min and max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Validate endpoint URL
 */
export function validateEndpointUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_e) {
    return false;
  }
}

/**
 * Validate and sanitize settings
 */
function validateSettings(settings) {
  const validated = deepMerge({}, settings);

  // Validate provider selection
  const validProviders = ['openai', 'claude', 'ollama'];
  if (!validProviders.includes(validated.provider)) {
    validated.provider = DEFAULT_SETTINGS.provider;
  }

  // Note: We don't enforce environment-based provider restrictions here
  // The ai-service.js handles fallback logic when a provider isn't available

  // Validate API keys
  if (validated.apiKeys) {
    if (validated.apiKeys.openai && typeof validated.apiKeys.openai === 'string') {
      validated.apiKeys.openai = validated.apiKeys.openai.trim();
    }
    if (validated.apiKeys.claude && typeof validated.apiKeys.claude === 'string') {
      validated.apiKeys.claude = validated.apiKeys.claude.trim();
    }
  }

  // Validate OpenAI settings
  if (validated.openai) {
    if (validated.openai.model && typeof validated.openai.model === 'string') {
      validated.openai.model = validated.openai.model.trim();
    }
    if (typeof validated.openai.temperature === 'number') {
      validated.openai.temperature = clamp(validated.openai.temperature, 0, 1);
    }
    if (typeof validated.openai.topP === 'number') {
      validated.openai.topP = clamp(validated.openai.topP, 0, 1);
    }
  }

  // Validate Claude settings
  if (validated.claude) {
    if (validated.claude.model && typeof validated.claude.model === 'string') {
      validated.claude.model = validated.claude.model.trim();
    }
    if (typeof validated.claude.temperature === 'number') {
      validated.claude.temperature = clamp(validated.claude.temperature, 0, 1);
    }
    if (typeof validated.claude.topP === 'number') {
      validated.claude.topP = clamp(validated.claude.topP, 0, 1);
    }
  }

  // Validate Ollama settings
  if (validated.ollama) {
    // Normalize and validate endpoint URL
    if (validated.ollama.endpoint && typeof validated.ollama.endpoint === 'string') {
      // Trim whitespace and remove trailing slashes
      validated.ollama.endpoint = validated.ollama.endpoint.trim().replace(/\/+$/, '');
    }
    if (!validateEndpointUrl(validated.ollama.endpoint)) {
      validated.ollama.endpoint = DEFAULT_SETTINGS.ollama.endpoint;
    }

    // Normalize model name
    if (validated.ollama.model && typeof validated.ollama.model === 'string') {
      validated.ollama.model = validated.ollama.model.trim();
    }

    // Clamp temperature to 0-1
    if (typeof validated.ollama.temperature === 'number') {
      validated.ollama.temperature = clamp(validated.ollama.temperature, 0, 1);
    }

    // Clamp topP to 0-1
    if (typeof validated.ollama.topP === 'number') {
      validated.ollama.topP = clamp(validated.ollama.topP, 0, 1);
    }
  }

  return validated;
}

/**
 * Load settings from localStorage
 */
export function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(stored);
    // Merge with defaults to handle incomplete settings
    return deepMerge(DEFAULT_SETTINGS, parsed);
  } catch (error) {
    console.error('Error loading settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings) {
  try {
    const validated = validateSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Get current settings (loads from localStorage)
 */
export function getSettings() {
  return loadSettings();
}

/**
 * Update settings (partial update)
 */
export function updateSettings(updates) {
  const current = loadSettings();
  const merged = deepMerge(current, updates);
  saveSettings(merged);
}

/**
 * Reset settings to defaults
 */
export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Settings Manager Singleton
 */
class SettingsManager {
  constructor() {
    this._settings = null;
  }

  /**
   * Get current settings
   */
  get() {
    return loadSettings();
  }

  /**
   * Update settings (partial)
   */
  update(updates) {
    updateSettings(updates);
  }

  /**
   * Reset to defaults
   */
  reset() {
    resetSettings();
  }

  /**
   * Get specific setting value by path
   * Example: getSetting('ollama.endpoint')
   */
  getSetting(path) {
    const settings = this.get();
    const keys = path.split('.');

    let value = settings;
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set specific setting value by path
   * Example: setSetting('ollama.model', 'mistral')
   */
  setSetting(path, value) {
    const keys = path.split('.');
    const updates = {};

    let current = updates;
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    this.update(updates);
  }
}

// Export singleton instance
export const settingsManager = new SettingsManager();
