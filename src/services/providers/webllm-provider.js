/**
 * WebLLM Provider
 * Implements AI text improvement using browser-based LLMs via WebLLM
 * Requires WebGPU support
 */

import { BaseProvider } from './base-provider.js';

export class WebLLMProvider extends BaseProvider {
  static PROVIDER_NAME = 'webllm';
  static DEFAULT_MODEL = 'Phi-3-mini-4k-instruct-q4f16_1-MLC';

  static MODELS = [
    { value: 'Qwen2-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2 0.5B (500MB) - Fast', size: '500MB' },
    {
      value: 'Qwen2-1.5B-Instruct-q4f16_1-MLC',
      label: 'Qwen2 1.5B (1.5GB) - Balanced',
      size: '1.5GB',
    },
    {
      value: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
      label: 'Phi-3 Mini (2.3GB) - Recommended',
      size: '2.3GB',
    },
    { value: 'gemma-2b-it-q4f16_1-MLC', label: 'Gemma 2B (2.5GB) - High Quality', size: '2.5GB' },
    {
      value: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
      label: 'Llama 3.1 8B (4.5GB) - Desktop Only',
      size: '4.5GB',
    },
  ];

  engine = null;
  progressCallback = null;

  /**
   * Set progress callback for model loading
   * @param {Function} callback - Callback function (progress) => void
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * Improve text using WebLLM
   */
  async improveText(text, comments, onChunk, signal) {
    // Lazy load WebLLM to avoid bundling issues
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

    const { model, systemPrompt, temperature, topP } = this.config;

    // Initialize engine if not already initialized
    if (!this.engine) {
      try {
        this.engine = await CreateMLCEngine(model || WebLLMProvider.DEFAULT_MODEL, {
          initProgressCallback: (progress) => {
            // Report download/initialization progress
            if (this.progressCallback) {
              this.progressCallback(progress);
            }
          },
        });
      } catch (error) {
        if (error.message.includes('WebGPU')) {
          throw new Error(
            'WebGPU not supported in this browser. Please use a modern browser with WebGPU enabled, or switch to Transformers.js provider.'
          );
        }
        throw error;
      }
    }

    // Check if request was aborted
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    // Build messages
    const userPrompt = this.buildPrompt(text, comments);
    const messages = [
      {
        role: 'system',
        content:
          systemPrompt ||
          'You are a helpful writing assistant. Improve the provided text based on the instructions. Return only the improved text without any explanations or preamble.',
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ];

    try {
      // Create streaming completion
      const chunks = await this.engine.chat.completions.create(
        {
          messages,
          stream: true,
          temperature: temperature ?? 0.7,
          top_p: topP ?? 0.9,
        },
        {
          signal, // Pass abort signal
        }
      );

      let fullResponse = '';

      // Process streaming chunks
      for await (const chunk of chunks) {
        // Check if aborted
        if (signal?.aborted) {
          throw new Error('Request aborted');
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        fullResponse += delta;

        // Call chunk callback
        if (onChunk && delta) {
          onChunk(delta);
        }
      }

      return fullResponse;
    } catch (error) {
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        throw new Error('Request aborted by user');
      }
      throw error;
    }
  }

  /**
   * Reset the engine (useful for switching models)
   */
  async reset() {
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch (error) {
        console.warn('Error unloading WebLLM engine:', error);
      }
      this.engine = null;
    }
  }

  /**
   * Validate WebLLM configuration
   */
  static validateConfig(config) {
    const errors = [];

    // Check WebGPU support
    if (typeof navigator !== 'undefined' && !navigator.gpu) {
      errors.push('WebGPU not supported in this browser');
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
   * Check if WebGPU is available
   */
  static isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }

  /**
   * Get provider name
   */
  static getProviderName() {
    return WebLLMProvider.PROVIDER_NAME;
  }

  /**
   * Get default model
   */
  static getDefaultModel() {
    return WebLLMProvider.DEFAULT_MODEL;
  }

  /**
   * Get available models
   */
  static getAvailableModels() {
    return WebLLMProvider.MODELS;
  }
}
