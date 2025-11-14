/**
 * Ollama Provider
 * Implements AI text improvement using local Ollama server
 */

import { BaseProvider } from './base-provider.js';

export class OllamaProvider extends BaseProvider {
  static PROVIDER_NAME = 'ollama';
  static DEFAULT_ENDPOINT = 'http://localhost:11434';
  static DEFAULT_MODEL = 'llama2';
  static TIMEOUT = 30000; // 30 seconds

  static MODELS = [
    { value: 'llama2', label: 'Llama 2' },
    { value: 'llama3', label: 'Llama 3' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'mixtral', label: 'Mixtral' },
    { value: 'codellama', label: 'Code Llama' },
    { value: 'phi', label: 'Phi' },
    { value: 'gemma', label: 'Gemma' },
  ];

  /**
   * Improve text using Ollama API
   */
  async improveText(text, comments, onChunk, signal) {
    const { endpoint, model, systemPrompt, temperature, topP } = this.config;

    // Build the full prompt (Ollama doesn't have separate system/user messages)
    const fullPrompt = this.buildFullPrompt(text, comments, systemPrompt);

    // Normalize endpoint - remove trailing slashes
    const normalizedEndpoint = (endpoint || OllamaProvider.DEFAULT_ENDPOINT).replace(/\/+$/, '');

    // Prepare request
    const requestBody = {
      model: model || OllamaProvider.DEFAULT_MODEL,
      prompt: fullPrompt,
      stream: false, // Using non-streaming for simplicity, can enable later
      options: {
        temperature: temperature ?? 0.7,
        top_p: topP ?? 0.9,
      },
    };

    const timeoutId = setTimeout(() => {
      if (!signal.aborted) {
        signal.abort();
      }
    }, OllamaProvider.TIMEOUT);

    try {
      const response = await fetch(`${normalizedEndpoint}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw this.handleAPIError(response.status, model);
      }

      const data = await response.json();
      const improvedText = data.response;

      // Call onChunk with full response for consistency with other providers
      if (onChunk && improvedText) {
        onChunk(improvedText);
      }

      return improvedText;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout - Ollama server took too long to respond');
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Cannot connect to Ollama server at ${normalizedEndpoint}. Please verify the server is running and the endpoint URL is correct.`
        );
      }

      throw error;
    }
  }

  /**
   * Build full prompt for Ollama (includes system prompt in the prompt text)
   */
  buildFullPrompt(text, comments, systemPrompt) {
    let prompt = '';

    // Add system prompt if provided
    if (systemPrompt) {
      prompt += `${systemPrompt}\n\n`;
    }

    // Add instructions from comments
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

  /**
   * Handle API errors
   */
  handleAPIError(status, model) {
    switch (status) {
      case 404:
        return new Error(
          `Model "${model}" not found. Please check that the model is installed on your Ollama server (run: ollama list)`
        );
      default:
        return new Error(`Ollama API error: ${status}`);
    }
  }

  /**
   * Validate Ollama configuration
   */
  static validateConfig(config) {
    const errors = [];

    if (!config.endpoint || typeof config.endpoint !== 'string' || config.endpoint.trim() === '') {
      errors.push('Endpoint URL is required');
    } else {
      try {
        const url = new URL(config.endpoint);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          errors.push('Endpoint URL must use HTTP or HTTPS');
        }
      } catch {
        errors.push('Invalid endpoint URL');
      }
    }

    if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
      errors.push('Model is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get provider name
   */
  static getProviderName() {
    return OllamaProvider.PROVIDER_NAME;
  }

  /**
   * Get default model
   */
  static getDefaultModel() {
    return OllamaProvider.DEFAULT_MODEL;
  }

  /**
   * Get available models
   */
  static getAvailableModels() {
    return OllamaProvider.MODELS;
  }

  /**
   * Get default endpoint
   */
  static getDefaultEndpoint() {
    return OllamaProvider.DEFAULT_ENDPOINT;
  }
}
