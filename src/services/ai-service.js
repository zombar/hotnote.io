/**
 * AI Service
 * Handles communication with AI providers for text improvement
 */

import { getSettings } from '../state/settings-manager.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { ClaudeProvider } from './providers/claude-provider.js';
import { OllamaProvider } from './providers/ollama-provider.js';
import { isLocalEnvironment } from '../utils/environment.js';

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
  openai: OpenAIProvider,
  claude: ClaudeProvider,
  ollama: OllamaProvider,
};

/**
 * Create provider instance based on settings
 */
function createProvider(settings) {
  let provider = settings.provider || 'claude';

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
    // Fall back to Claude if Ollama is selected
    if (provider === 'ollama') {
      console.warn(
        '[AI] Ollama is not available on hosted site due to mixed content policy. Falling back to Claude.'
      );
      provider = 'claude';
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
 * - Local (localhost): Only Ollama works (cloud APIs blocked by CORS)
 * - Hosted (hotnote.io): Only cloud APIs work (Ollama blocked by mixed content)
 */
export function getAvailableProviders() {
  // When running locally (localhost), only Ollama works
  // Cloud APIs (Claude, OpenAI) are blocked by CORS policy
  if (isLocalEnvironment()) {
    return [{ value: 'ollama', label: 'Ollama (Local)' }];
  }

  // When hosted (hotnote.io), only cloud APIs work
  // Ollama (localhost) is blocked by mixed content policy (HTTPS → HTTP)
  return [
    { value: 'claude', label: 'Claude (Anthropic)' },
    { value: 'openai', label: 'ChatGPT (OpenAI)' },
  ];
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

    return improvedText;
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
