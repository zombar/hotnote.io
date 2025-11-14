/**
 * Base Provider Interface
 * Abstract base class that all AI providers must implement
 */

export class BaseProvider {
  /**
   * @param {Object} config - Provider configuration
   * @param {string} config.apiKey - API key for the provider (if required)
   * @param {string} config.model - Model name to use
   * @param {string} config.systemPrompt - System prompt for the AI
   * @param {number} config.temperature - Temperature setting (0-1)
   * @param {number} config.topP - Top P setting (0-1)
   */
  constructor(config) {
    if (this.constructor === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Improve text using AI with streaming support
   * @param {string} _text - Text to improve
   * @param {string[]} _comments - Comments extracted from text as instructions
   * @param {Function} _onChunk - Callback for streaming chunks: (chunk: string) => void
   * @param {AbortSignal} _signal - AbortSignal for canceling the request
   * @returns {Promise<string>} - Complete improved text
   */
  async improveText(_text, _comments, _onChunk, _signal) {
    throw new Error('improveText() must be implemented by provider');
  }

  /**
   * Validate provider configuration
   * @param {Object} _config - Configuration to validate
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  static validateConfig(_config) {
    throw new Error('validateConfig() must be implemented by provider');
  }

  /**
   * Get provider name
   * @returns {string} - Provider name (e.g., 'openai', 'claude', 'ollama')
   */
  static getProviderName() {
    throw new Error('getProviderName() must be implemented by provider');
  }

  /**
   * Get default model for this provider
   * @returns {string} - Default model name
   */
  static getDefaultModel() {
    throw new Error('getDefaultModel() must be implemented by provider');
  }

  /**
   * Get available models for this provider
   * @returns {Array<{value: string, label: string}>} - Available models
   */
  static getAvailableModels() {
    throw new Error('getAvailableModels() must be implemented by provider');
  }

  /**
   * Build prompt from text and comments
   * @param {string} text - Text to improve
   * @param {string[]} comments - Comments as instructions
   * @param {string} _systemPrompt - System prompt (unused in base implementation)
   * @returns {string} - Constructed prompt
   */
  buildPrompt(text, comments, _systemPrompt) {
    let prompt = '';

    // Add instructions
    if (comments.length > 0) {
      prompt += 'Instructions:\n';
      comments.forEach((comment, index) => {
        prompt += `${index + 1}. ${comment}\n`;
      });
      prompt += '\n';
    } else {
      prompt += 'Please improve this text while maintaining its original meaning and tone.\n\n';
    }

    // Add text to improve
    prompt += `Text to improve:\n${text}`;

    return prompt;
  }
}
