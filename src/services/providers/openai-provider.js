/**
 * OpenAI Provider
 * Implements AI text improvement using OpenAI's Chat Completions API
 */

import { BaseProvider } from './base-provider.js';

export class OpenAIProvider extends BaseProvider {
  static PROVIDER_NAME = 'openai';
  static API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  static DEFAULT_MODEL = 'gpt-4o-mini';
  static TIMEOUT = 60000; // 60 seconds

  static MODELS = [
    { value: 'gpt-4o', label: 'GPT-4o (Most Capable)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast & Affordable)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ];

  /**
   * Improve text using OpenAI API with streaming
   */
  async improveText(text, comments, onChunk, signal) {
    const { apiKey, model, systemPrompt, temperature, topP } = this.config;

    if (!apiKey) {
      throw new Error('OpenAI API key is required. Please add it in Settings.');
    }

    // Build the user prompt
    const userPrompt = this.buildPrompt(text, comments, systemPrompt);

    // Prepare request
    const requestBody = {
      model: model || OpenAIProvider.DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            systemPrompt ||
            'You are a helpful AI assistant. Improve the provided text while maintaining its original meaning and tone. Include only the replacement text in your response.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: temperature ?? 0.7,
      top_p: topP ?? 0.9,
      stream: true,
    };

    const timeoutId = setTimeout(() => {
      if (!signal.aborted) {
        signal.abort();
      }
    }, OpenAIProvider.TIMEOUT);

    try {
      const response = await fetch(OpenAIProvider.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.handleAPIError(response.status, errorData);
      }

      // Handle streaming response
      return await this.handleStreamingResponse(response, onChunk, signal);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout - OpenAI API took too long to respond');
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Check if it's a CORS error
        if (
          error.message.includes('CORS') ||
          error.message.includes('cors') ||
          error.message.includes('blocked')
        ) {
          throw new Error(
            'Cannot connect to OpenAI API due to CORS restrictions. Cloud AI providers only work when hosted on hotnote.io. When running locally, please use Ollama instead.'
          );
        }
        throw new Error('Cannot connect to OpenAI API. Please check your internet connection.');
      }

      throw error;
    }
  }

  /**
   * Handle streaming response from OpenAI
   */
  async handleStreamingResponse(response, onChunk, signal) {
    const reader = response.body.getReader();
    /* global TextDecoder */
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (!trimmedLine || trimmedLine === 'data: [DONE]') {
            continue;
          }

          if (trimmedLine.startsWith('data: ')) {
            try {
              const jsonData = JSON.parse(trimmedLine.slice(6));
              const content = jsonData.choices?.[0]?.delta?.content;

              if (content) {
                fullText += content;
                if (onChunk) {
                  onChunk(content);
                }
              }
            } catch (e) {
              // Skip malformed JSON
              console.warn('Failed to parse OpenAI stream chunk:', e);
            }
          }
        }

        if (signal?.aborted) {
          reader.cancel();
          throw new Error('Request aborted by user');
        }
      }

      return fullText;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle API errors
   */
  handleAPIError(status, errorData) {
    const errorMessage = errorData.error?.message || 'Unknown error';

    switch (status) {
      case 401:
        return new Error(
          'Invalid OpenAI API key. Please check your API key in Settings. Get one at: https://platform.openai.com/api-keys'
        );
      case 429:
        return new Error(
          'OpenAI rate limit exceeded. Please try again in a moment or upgrade your plan at: https://platform.openai.com/account/billing'
        );
      case 404:
        return new Error(
          `Model not found. Please check that the model "${this.config.model}" is available for your API key.`
        );
      case 500:
      case 502:
      case 503:
        return new Error('OpenAI API is currently unavailable. Please try again later.');
      default:
        return new Error(`OpenAI API error: ${errorMessage}`);
    }
  }

  /**
   * Validate OpenAI configuration
   */
  static validateConfig(config) {
    const errors = [];

    if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
      errors.push('API key is required');
    } else if (!config.apiKey.startsWith('sk-')) {
      errors.push('API key should start with "sk-"');
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
    return OpenAIProvider.PROVIDER_NAME;
  }

  /**
   * Get default model
   */
  static getDefaultModel() {
    return OpenAIProvider.DEFAULT_MODEL;
  }

  /**
   * Get available models
   */
  static getAvailableModels() {
    return OpenAIProvider.MODELS;
  }
}
