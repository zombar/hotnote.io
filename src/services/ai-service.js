/**
 * AI Service
 * Handles communication with Ollama for text improvement
 * Hotnote uses Ollama for local-first, privacy-preserving AI features
 */

import { getSettings } from '../state/settings-manager.js';
import { OllamaProvider } from './providers/ollama-provider.js';
import { WebLLMProvider } from './providers/webllm-provider.js';
import { TransformersJSProvider } from './providers/transformersjs-provider.js';
import { isLocalEnvironment } from '../utils/environment.js';

/**
 * Clean AI response to extract only the improved text
 * Removes common preambles, explanations, and wrapper text
 */
export function cleanAIResponse(response) {
  let cleaned = response.trim();

  // Remove common preambles (case-insensitive)
  const preambles = [
    /^(?:here(?:'s| is)|sure[,!]?|okay[,!]?|certainly[,!]?|of course[,!]?|i(?:'d| would) be happy to|i can help|let me|here you go)[^\n]*(?:\n|:)/gi,
    /^(?:improved|revised|edited|updated|enhanced|better|new) (?:text|version)[:\s]*\n*/gi,
    /^(?:the )?(?:improved|revised|edited) (?:text|version) is[:\s]*\n*/gi,
  ];

  for (const pattern of preambles) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove quotes/backticks if the entire response is wrapped
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('`') && cleaned.endsWith('`'))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove code block markers if entire response is wrapped
  if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  }

  // Remove trailing explanations (text after the improved content)
  // Look for phrases like "I've improved...", "Changes made:", etc.
  const explanationPatterns = [
    /\n+(?:i(?:'ve| have)|changes|improvements|notes?|explanation)[:\s][^\n]*$/gi,
    /\n+(?:let me know|feel free|if you|hope this helps)[^\n]*$/gi,
  ];

  for (const pattern of explanationPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Extract comments from text
 * Supports:
 * - Single-line comments: // comment
 * - Multi-line comments: /* comment *\/
 * - HTML/Markdown comments: <!-- comment -->
 */
export function extractCommentsFromText(text) {
  const comments = [];
  let textWithoutComments = text;

  // Match single-line comments (// ...)
  const singleLineRegex = /\/\/\s*(.+?)$/gm;
  const singleLineMatches = text.matchAll(singleLineRegex);
  for (const match of singleLineMatches) {
    comments.push(match[1].trim());
  }

  // Match multi-line comments (/* ... */)
  const multiLineRegex = /\/\*\s*([\s\S]*?)\s*\*\//g;
  const multiLineMatches = text.matchAll(multiLineRegex);
  for (const match of multiLineMatches) {
    comments.push(match[1].trim());
  }

  // Match HTML/Markdown comments (<!-- ... -->)
  const htmlCommentRegex = /<!--\s*([\s\S]*?)\s*-->/g;
  const htmlMatches = text.matchAll(htmlCommentRegex);
  for (const match of htmlMatches) {
    comments.push(match[1].trim());
  }

  // Remove all comments from text
  textWithoutComments = textWithoutComments
    .replace(singleLineRegex, '')
    .replace(multiLineRegex, '')
    .replace(htmlCommentRegex, '');

  return {
    comments,
    textWithoutComments,
  };
}

/**
 * Provider registry
 */
const PROVIDERS = {
  ollama: OllamaProvider,
  webllm: WebLLMProvider,
  transformersjs: TransformersJSProvider,
};

/**
 * Create provider instance based on settings
 */
function createProvider(settings) {
  let provider = settings.provider || 'webllm'; // Default to browser-based AI

  // Browser-based AI fallback logic
  // If WebLLM is selected but WebGPU is not available, fall back to Transformers.js
  if (provider === 'webllm' && !WebLLMProvider.isSupported()) {
    console.warn(
      '[AI] WebLLM requires WebGPU which is not available in this browser. Falling back to Transformers.js.'
    );
    provider = 'transformersjs';
  }

  // Environment-based fallback logic
  if (isLocalEnvironment()) {
    // When running locally, cloud APIs don't work due to CORS
    // Fall back to Ollama if a cloud provider is selected
    if (provider === 'claude' || provider === 'openai') {
      console.warn(
        `[AI] ${provider} is not available when running locally due to CORS. Falling back to Ollama.`
      );
      provider = 'ollama';
    }
  } else {
    // When hosted, Ollama doesn't work due to mixed content (HTTPS → HTTP)
    // Fall back to WebLLM if Ollama is selected
    if (provider === 'ollama') {
      console.warn(
        '[AI] Ollama is not available on hosted site due to mixed content policy. Falling back to WebLLM.'
      );
      provider = 'webllm';
      // Check WebGPU again after fallback
      if (!WebLLMProvider.isSupported()) {
        console.warn('[AI] WebGPU not available. Falling back to Transformers.js.');
        provider = 'transformersjs';
      }
    }
  }

  const ProviderClass = PROVIDERS[provider];

  if (!ProviderClass) {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  // Build provider config based on provider type
  let config;
  if (provider === 'ollama') {
    config = {
      endpoint: settings.ollama?.endpoint,
      model: settings.ollama?.model,
      systemPrompt: settings.ollama?.systemPrompt,
      temperature: settings.ollama?.temperature,
      topP: settings.ollama?.topP,
    };
  } else if (provider === 'webllm') {
    config = {
      model: settings.webllm?.model,
      systemPrompt: settings.webllm?.systemPrompt,
      temperature: settings.webllm?.temperature,
      topP: settings.webllm?.topP,
    };
  } else if (provider === 'transformersjs') {
    config = {
      model: settings.transformersjs?.model,
      systemPrompt: settings.transformersjs?.systemPrompt,
      temperature: settings.transformersjs?.temperature,
      topP: settings.transformersjs?.topP,
      dtype: settings.transformersjs?.dtype,
    };
  } else {
    // OpenAI and Claude use API keys
    config = {
      apiKey: settings.apiKeys?.[provider],
      model: settings[provider]?.model,
      systemPrompt: settings[provider]?.systemPrompt,
      temperature: settings[provider]?.temperature,
      topP: settings[provider]?.topP,
    };
  }

  return new ProviderClass(config);
}

/**
 * Get available providers based on environment
 * - Local (localhost): Browser AI + Ollama (cloud APIs blocked by CORS)
 * - Hosted (hotnote.io): Browser AI + cloud APIs (Ollama blocked by mixed content)
 */
export function getAvailableProviders() {
  const providers = [];

  // Browser-based AI is always available
  if (WebLLMProvider.isSupported()) {
    providers.push({ value: 'webllm', label: 'WebLLM (Browser, WebGPU)' });
  }
  providers.push({ value: 'transformersjs', label: 'Transformers.js (Browser, CPU/GPU)' });

  // When running locally (localhost), only Ollama works
  // Cloud APIs (Claude, OpenAI) are blocked by CORS policy
  if (isLocalEnvironment()) {
    providers.push({ value: 'ollama', label: 'Ollama (Local Server)' });
  } else {
    // When hosted (hotnote.io), only cloud APIs work
    // Ollama (localhost) is blocked by mixed content policy (HTTPS → HTTP)
    providers.push({ value: 'claude', label: 'Claude (Anthropic)' });
    providers.push({ value: 'openai', label: 'ChatGPT (OpenAI)' });
  }

  return providers;
}

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(provider) {
  const ProviderClass = PROVIDERS[provider];
  if (!ProviderClass) {
    return [];
  }
  return ProviderClass.getAvailableModels();
}

/**
 * Global progress callback function
 */
let progressCallback = null;

/**
 * Set progress callback for model loading
 * @param {Function} callback - Progress callback function
 */
export function setModelProgressCallback(callback) {
  progressCallback = callback;
}

/**
 * Improve text using AI with streaming support
 * This is the main function that orchestrates the AI improvement workflow
 *
 * @param {string} text - Text to improve
 * @param {Function} onChunk - Optional callback for streaming chunks: (chunk: string) => void
 * @param {AbortSignal} signal - Optional AbortSignal for canceling the request
 * @returns {Promise<string>} - Complete improved text
 */
export async function improveText(text, onChunk = null, signal = null) {
  // Get settings
  const settings = getSettings();

  // Create provider
  const provider = createProvider(settings);

  // Log system prompt being used (for debugging)
  const providerName = settings.provider || 'webllm';
  const systemPrompt = settings[providerName]?.systemPrompt;
  console.log('[AI Service] Using provider:', providerName);
  console.log('[AI Service] System prompt:', systemPrompt || '(using default)');

  // Set progress callback on provider if it supports it
  if (progressCallback && provider.setProgressCallback) {
    console.log('[AI Service] Setting progress callback on provider');
    provider.setProgressCallback(progressCallback);
  } else if (progressCallback) {
    console.log('[AI Service] Provider does not support progress callbacks');
  }

  // Extract comments from text
  const { comments, textWithoutComments } = extractCommentsFromText(text);

  // Create abort controller if not provided
  /* global AbortController */
  const controller = signal ? null : new AbortController();
  const abortSignal = signal || controller.signal;

  try {
    // Call provider's improveText method with streaming support
    const improvedText = await provider.improveText(
      textWithoutComments,
      comments,
      onChunk,
      abortSignal
    );

    // Clean the response to remove preambles and explanations
    const cleanedText = cleanAIResponse(improvedText);

    console.log('[AI Service] Response cleaning:', {
      originalLength: improvedText.length,
      cleanedLength: cleanedText.length,
      removed: improvedText.length - cleanedText.length,
    });

    return cleanedText;
  } catch (error) {
    // Re-throw error to be handled by caller
    throw error;
  }
}

/**
 * DEPRECATED: Compatibility exports for tests
 * These are kept for backward compatibility with existing tests
 */

/**
 * Build prompt for AI (compatibility export)
 * @deprecated Use provider.buildPrompt() instead
 */
export function buildPrompt(text, comments, systemPrompt) {
  const provider = new OllamaProvider({ systemPrompt });
  return provider.buildFullPrompt(text, comments, systemPrompt);
}

/**
 * Call Ollama API directly (compatibility export)
 * @deprecated Use OllamaProvider instead
 */
export async function callOllama(endpoint, model, prompt, temperature, topP, timeout = 30000) {
  /* global AbortController */
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Create a temporary "prompt" by wrapping in a function
    const response = await fetch(`${endpoint.replace(/\/+$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature, top_p: topP },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Model "${model}" not found. Please check that the model is installed on your Ollama server (run: ollama list)`
        );
      }
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Request timeout - Ollama server took too long to respond');
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to Ollama server at ${endpoint}. Please verify the server is running and the endpoint URL is correct.`
      );
    }

    throw error;
  }
}

/**
 * Parse streaming response (compatibility export)
 * @deprecated Not used in new provider architecture
 */
export function parseStreamingResponse(chunks) {
  const lines = chunks.split('\n').filter((line) => line.trim() !== '');
  let result = '';

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.response) {
        result += parsed.response;
      }
    } catch (_e) {
      continue;
    }
  }

  return result;
}
