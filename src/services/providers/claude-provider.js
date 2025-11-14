/**
 * Claude (Anthropic) Provider
 * Implements AI text improvement using Anthropic's Messages API
 */

import { BaseProvider } from './base-provider.js';

export class ClaudeProvider extends BaseProvider {
  static PROVIDER_NAME = 'claude';
  static API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
  static DEFAULT_MODEL = 'claude-3-haiku-20240307';
  static ANTHROPIC_VERSION = '2023-06-01';
  static TIMEOUT = 60000; // 60 seconds

  static MODELS = [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Most Capable)' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast & Affordable)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  ];

  /**
   * Improve text using Claude API with streaming
   */
  async improveText(text, comments, onChunk, signal) {
    const { apiKey, model, systemPrompt, temperature, topP } = this.config;

    if (!apiKey) {
      throw new Error('Anthropic API key is required. Please add it in Settings.');
    }

    // Build the user prompt
    const userPrompt = this.buildPrompt(text, comments, systemPrompt);

    // Prepare request
    const requestBody = {
      model: model || ClaudeProvider.DEFAULT_MODEL,
      max_tokens: 4096,
      system:
        systemPrompt ||
        'You are a helpful AI assistant. Improve the provided text while maintaining its original meaning and tone. Include only the replacement text in your response.',
      messages: [
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
    }, ClaudeProvider.TIMEOUT);

    try {
      const response = await fetch(ClaudeProvider.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ClaudeProvider.ANTHROPIC_VERSION,
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
        throw new Error('Request timeout - Claude API took too long to respond');
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Check if it's a CORS error
        if (
          error.message.includes('CORS') ||
          error.message.includes('cors') ||
          error.message.includes('blocked')
        ) {
          throw new Error(
            'Cannot connect to Claude API due to CORS restrictions. Cloud AI providers only work when hosted on hotnote.io. When running locally, please use Ollama instead.'
          );
        }
        throw new Error('Cannot connect to Claude API. Please check your internet connection.');
      }

      throw error;
    }
  }

  /**
   * Handle streaming response from Claude
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

        // Process complete events (separated by double newlines)
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer

        for (const event of events) {
          if (!event.trim()) continue;

          const lines = event.split('\n');
          let eventType = null;
          let eventData = null;

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                eventData = JSON.parse(line.slice(6));
              } catch (e) {
                console.warn('Failed to parse Claude stream data:', e);
              }
            }
          }

          // Handle different event types
          if (eventType === 'content_block_delta' && eventData?.delta?.text) {
            const content = eventData.delta.text;
            fullText += content;
            if (onChunk) {
              onChunk(content);
            }
          } else if (eventType === 'error') {
            throw new Error(eventData?.error?.message || 'Unknown streaming error');
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
          'Invalid Anthropic API key. Please check your API key in Settings. Get one at: https://console.anthropic.com/settings/keys'
        );
      case 429:
        return new Error(
          'Claude rate limit exceeded. Please try again in a moment or upgrade your plan at: https://console.anthropic.com/settings/plans'
        );
      case 404:
        return new Error(
          `Model not found. Please check that the model "${this.config.model}" is available for your API key.`
        );
      case 500:
      case 502:
      case 503:
        return new Error('Claude API is currently unavailable. Please try again later.');
      default:
        return new Error(`Claude API error: ${errorMessage}`);
    }
  }

  /**
   * Validate Claude configuration
   */
  static validateConfig(config) {
    const errors = [];

    if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
      errors.push('API key is required');
    } else if (!config.apiKey.startsWith('sk-ant-')) {
      errors.push('API key should start with "sk-ant-"');
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
    return ClaudeProvider.PROVIDER_NAME;
  }

  /**
   * Get default model
   */
  static getDefaultModel() {
    return ClaudeProvider.DEFAULT_MODEL;
  }

  /**
   * Get available models
   */
  static getAvailableModels() {
    return ClaudeProvider.MODELS;
  }
}
