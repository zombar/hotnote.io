/**
 * Transformers.js Provider
 * Implements AI text improvement using browser-based LLMs via Transformers.js
 * Works with both WebGPU (fast) and WASM (compatible fallback)
 */

import { BaseProvider } from './base-provider.js';

export class TransformersJSProvider extends BaseProvider {
  static PROVIDER_NAME = 'transformersjs';
  static DEFAULT_MODEL = 'Xenova/Qwen1.5-0.5B-Chat';

  static MODELS = [
    { value: 'Xenova/Qwen1.5-0.5B-Chat', label: 'Qwen1.5 0.5B (500MB) - Fast', size: '500MB' },
    {
      value: 'Xenova/Qwen1.5-1.8B-Chat',
      label: 'Qwen1.5 1.8B (1.8GB) - Better Quality',
      size: '1.8GB',
    },
    {
      value: 'Xenova/SmolLM-135M-Instruct',
      label: 'SmolLM 135M (250MB) - Ultra Fast',
      size: '250MB',
    },
  ];

  pipeline = null;
  progressCallback = null;

  /**
   * Set progress callback for model loading
   * @param {Function} callback - Callback function (progress) => void
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * Improve text using Transformers.js
   */
  async improveText(text, comments, onChunk, signal) {
    // Lazy load Transformers.js to avoid bundling issues
    const { pipeline, env } = await import('@huggingface/transformers');

    // Configure environment
    env.allowLocalModels = false; // Use remote models from HuggingFace
    env.allowRemoteModels = true;

    const { model, systemPrompt, temperature, topP, dtype } = this.config;

    // Initialize pipeline if not already initialized
    if (!this.pipeline) {
      try {
        // Determine device based on WebGPU availability
        const device = navigator.gpu ? 'webgpu' : 'wasm';
        const quantization = dtype || 'q4';

        // Create text generation pipeline
        this.pipeline = await pipeline(
          'text-generation',
          model || TransformersJSProvider.DEFAULT_MODEL,
          {
            device,
            dtype: quantization,
            progress_callback: (progress) => {
              if (this.progressCallback) {
                this.progressCallback(progress);
              }
            },
          }
        );
      } catch (error) {
        throw new Error(`Failed to load model: ${error.message}`);
      }
    }

    // Check if request was aborted
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    // Build prompt
    const userPrompt = this.buildPrompt(text, comments);
    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\n${userPrompt}`
      : `You are a helpful writing assistant. Improve the provided text based on the instructions. Return only the improved text without any explanations or preamble.\n\n${userPrompt}`;

    try {
      // Note: Transformers.js doesn't support native streaming for text generation
      // We'll generate the full text and call onChunk once
      const output = await this.pipeline(fullPrompt, {
        max_new_tokens: 512,
        temperature: temperature ?? 0.7,
        top_p: topP ?? 0.9,
        do_sample: true,
      });

      // Check if aborted during generation
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      // Extract generated text
      let generatedText = '';
      if (Array.isArray(output)) {
        generatedText = output[0]?.generated_text || '';
      } else {
        generatedText = output?.generated_text || '';
      }

      // Remove the input prompt from the output (models often return prompt + completion)
      if (generatedText.startsWith(fullPrompt)) {
        generatedText = generatedText.slice(fullPrompt.length).trim();
      }

      // Call chunk callback with full response
      if (onChunk && generatedText) {
        onChunk(generatedText);
      }

      return generatedText;
    } catch (error) {
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        throw new Error('Request aborted by user');
      }
      throw error;
    }
  }

  /**
   * Reset the pipeline (useful for switching models)
   */
  async reset() {
    if (this.pipeline) {
      try {
        // Dispose of the pipeline
        await this.pipeline.dispose?.();
      } catch (error) {
        console.warn('Error disposing Transformers.js pipeline:', error);
      }
      this.pipeline = null;
    }
  }

  /**
   * Validate Transformers.js configuration
   */
  static validateConfig(config) {
    const errors = [];

    if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
      errors.push('Model is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if the provider is supported (always true for Transformers.js with WASM fallback)
   */
  static isSupported() {
    return true; // Works on all modern browsers via WASM
  }

  /**
   * Get provider name
   */
  static getProviderName() {
    return TransformersJSProvider.PROVIDER_NAME;
  }

  /**
   * Get default model
   */
  static getDefaultModel() {
    return TransformersJSProvider.DEFAULT_MODEL;
  }

  /**
   * Get available models
   */
  static getAvailableModels() {
    return TransformersJSProvider.MODELS;
  }
}
