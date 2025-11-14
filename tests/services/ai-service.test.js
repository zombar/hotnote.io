import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  callOllama,
  extractCommentsFromText,
  buildPrompt,
  improveText,
  parseStreamingResponse,
} from '../../src/services/ai-service.js';
import * as settingsManager from '../../src/state/settings-manager.js';
import * as environment from '../../src/utils/environment.js';

describe('AI Service', () => {
  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn();

    // Mock environment as local so Ollama provider is available in tests
    vi.spyOn(environment, 'isLocalEnvironment').mockReturnValue(true);

    // Mock settings to use Ollama provider by default
    vi.spyOn(settingsManager, 'getSettings').mockReturnValue({
      provider: 'ollama',
      ollama: {
        endpoint: 'http://localhost:11434',
        model: 'llama2',
        systemPrompt:
          'You are a helpful AI assistant. Improve the provided text while maintaining its original meaning and tone. Include only the replacement text in your response.',
        temperature: 0.7,
        topP: 0.9,
      },
      apiKeys: {
        openai: '',
        claude: '',
      },
      openai: {
        model: 'gpt-4o-mini',
        systemPrompt: 'You are a helpful AI assistant.',
        temperature: 0.7,
        topP: 0.9,
      },
      claude: {
        model: 'claude-3-haiku-20240307',
        systemPrompt: 'You are a helpful AI assistant.',
        temperature: 0.7,
        topP: 0.9,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractCommentsFromText', () => {
    it('should extract single-line comments from code', () => {
      const text = `function test() {
  // This is a comment
  console.log('hello');
}`;

      const result = extractCommentsFromText(text);
      expect(result.comments).toEqual(['This is a comment']);
      expect(result.textWithoutComments).toContain('function test()');
      expect(result.textWithoutComments).toContain("console.log('hello')");
      expect(result.textWithoutComments).not.toContain('// This is a comment');
    });

    it('should extract multiple single-line comments', () => {
      const text = `// Comment 1
// Comment 2
const x = 5;
// Comment 3`;

      const result = extractCommentsFromText(text);
      expect(result.comments).toHaveLength(3);
      expect(result.comments).toContain('Comment 1');
      expect(result.comments).toContain('Comment 2');
      expect(result.comments).toContain('Comment 3');
    });

    it('should extract multi-line comments', () => {
      const text = `/* This is a
multi-line comment */
function test() {}`;

      const result = extractCommentsFromText(text);
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toContain('This is a');
      expect(result.comments[0]).toContain('multi-line comment');
    });

    it('should handle markdown comments (HTML style)', () => {
      const text = `# Heading

<!-- Make this more concise -->
This is a paragraph that needs improvement.

<!-- Add more examples -->
Another paragraph.`;

      const result = extractCommentsFromText(text);
      expect(result.comments).toHaveLength(2);
      expect(result.comments).toContain('Make this more concise');
      expect(result.comments).toContain('Add more examples');
    });

    it('should return empty array when no comments found', () => {
      const text = 'Just plain text without comments';

      const result = extractCommentsFromText(text);
      expect(result.comments).toEqual([]);
      expect(result.textWithoutComments).toBe(text);
    });

    it('should preserve code structure when removing comments', () => {
      const text = `function test() {
  // Comment here
  const x = 5;
  return x;
}`;

      const result = extractCommentsFromText(text);
      expect(result.textWithoutComments).toContain('function test()');
      expect(result.textWithoutComments).toContain('const x = 5');
      expect(result.textWithoutComments).toContain('return x');
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt with default instruction when no comments', () => {
      const text = 'This is some text.';
      const systemPrompt = 'You are helpful.';

      const prompt = buildPrompt(text, [], systemPrompt);

      expect(prompt).toContain(systemPrompt);
      expect(prompt).toContain('improve this text');
      expect(prompt).toContain(text);
    });

    it('should include comments as instructions when present', () => {
      const text = 'This is some text.';
      const comments = ['Make it more formal', 'Add examples'];
      const systemPrompt = 'You are helpful.';

      const prompt = buildPrompt(text, comments, systemPrompt);

      expect(prompt).toContain(systemPrompt);
      expect(prompt).toContain('Make it more formal');
      expect(prompt).toContain('Add examples');
      expect(prompt).toContain(text);
      expect(prompt).not.toContain('improve this text');
    });

    it('should format multiple comments as numbered list', () => {
      const text = 'Sample text';
      const comments = ['Instruction 1', 'Instruction 2', 'Instruction 3'];
      const systemPrompt = 'System';

      const prompt = buildPrompt(text, comments, systemPrompt);

      expect(prompt).toMatch(/1[.)]\s*Instruction 1/);
      expect(prompt).toMatch(/2[.)]\s*Instruction 2/);
      expect(prompt).toMatch(/3[.)]\s*Instruction 3/);
    });

    it('should handle empty system prompt', () => {
      const text = 'Text';
      const comments = [];
      const systemPrompt = '';

      const prompt = buildPrompt(text, comments, systemPrompt);

      expect(prompt).toContain(text);
      expect(prompt).toContain('improve this text');
    });
  });

  describe('callOllama', () => {
    it('should make POST request to Ollama API', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'Improved text here',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await callOllama('http://localhost:11434', 'llama2', 'Test prompt', 0.7, 0.9);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"model":"llama2"'),
        })
      );

      expect(result).toBe('Improved text here');
    });

    it('should include temperature and topP in request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ response: 'Result' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await callOllama('http://localhost:11434', 'mistral', 'Prompt', 0.3, 0.8);

      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.options.temperature).toBe(0.3);
      expect(body.options.top_p).toBe(0.8);
    });

    it('should set stream to false', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ response: 'Result' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await callOllama('http://localhost:11434', 'llama2', 'Prompt', 0.7, 0.9);

      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.stream).toBe(false);
    });

    it('should throw error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(
        callOllama('http://localhost:11434', 'llama2', 'Prompt', 0.7, 0.9)
      ).rejects.toThrow('Ollama API error: 500 Internal Server Error');
    });

    it('should throw error on network failure', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(
        callOllama('http://localhost:11434', 'llama2', 'Prompt', 0.7, 0.9)
      ).rejects.toThrow('Network error');
    });

    it('should handle timeout', async () => {
      /* global DOMException */
      // Mock a fetch that respects abort signal
      global.fetch.mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({ ok: true, json: () => ({ response: 'Late' }) });
          }, 500);

          options.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        });
      });

      const timeout = 100; // 100ms timeout

      await expect(
        callOllama('http://localhost:11434', 'llama2', 'Prompt', 0.7, 0.9, timeout)
      ).rejects.toThrow('Request timeout');
    }, 1000); // Set test timeout to 1 second

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(
        callOllama('http://localhost:11434', 'llama2', 'Prompt', 0.7, 0.9)
      ).rejects.toThrow('Invalid JSON');
    });
  });

  describe('improveText', () => {
    beforeEach(() => {
      // Mock settings
      localStorage.setItem(
        'hotnote_settings',
        JSON.stringify({
          ollama: {
            endpoint: 'http://localhost:11434',
            model: 'llama2',
            systemPrompt: 'Test system prompt',
            temperature: 0.7,
            topP: 0.9,
          },
        })
      );
    });

    it('should improve text without comments using default instruction', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'This text has been improved.',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const text = 'This is some text.';
      const result = await improveText(text);

      expect(result).toBe('This text has been improved.');
      expect(global.fetch).toHaveBeenCalled();

      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.prompt).toContain('improve this text');
      expect(body.prompt).toContain(text);
    });

    it('should extract comments and use as instructions', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'Improved text.',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const text = `// Make this more concise
This is a long paragraph that could be shorter.`;

      const result = await improveText(text);

      expect(result).toBe('Improved text.');

      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.prompt).toContain('Make this more concise');
      expect(body.prompt).not.toContain('// Make this more concise');
    });

    it('should use settings from SettingsManager', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ response: 'Result' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await improveText('Test text');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.anything()
      );

      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe('llama2');
      expect(body.options.temperature).toBe(0.7);
      expect(body.options.top_p).toBe(0.9);
    });

    it('should propagate errors from Ollama API', async () => {
      global.fetch.mockRejectedValue(new Error('Connection refused'));

      await expect(improveText('Test text')).rejects.toThrow('Connection refused');
    });

    it('should handle empty text input', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ response: '' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await improveText('');
      expect(result).toBe('');
    });
  });

  describe('parseStreamingResponse', () => {
    it('should parse newline-delimited JSON chunks', () => {
      const chunks = ['{"response": "Hello"}\n', '{"response": " world"}\n', '{"response": "!"}\n'];

      const result = parseStreamingResponse(chunks.join(''));
      expect(result).toBe('Hello world!');
    });

    it('should handle single chunk', () => {
      const chunk = '{"response": "Complete response"}\n';

      const result = parseStreamingResponse(chunk);
      expect(result).toBe('Complete response');
    });

    it('should handle done flag', () => {
      const chunks = '{"response": "Text"}\n{"response": "", "done": true}\n';

      const result = parseStreamingResponse(chunks);
      expect(result).toBe('Text');
    });

    it('should handle malformed chunks gracefully', () => {
      const chunks = '{"response": "Valid"}\n{invalid json}\n{"response": " text"}\n';

      // Should skip invalid chunk and continue
      const result = parseStreamingResponse(chunks);
      expect(result).toContain('Valid');
      expect(result).toContain('text');
    });

    it('should return empty string for empty input', () => {
      const result = parseStreamingResponse('');
      expect(result).toBe('');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete AI improvement workflow', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'The quick brown fox jumps over the lazy dog.',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const text = `// Make this more elegant
The fox jumped over the dog.`;

      const result = await improveText(text);

      expect(result).toBe('The quick brown fox jumps over the lazy dog.');

      // Verify comments were extracted
      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.prompt).toContain('Make this more elegant');
      expect(body.prompt).toContain('The fox jumped over the dog.');
      expect(body.prompt).not.toContain('// Make this more elegant');
    });

    it('should handle multiple comment types in one text', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ response: 'Improved' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const text = `// Instruction 1
/* Instruction 2 */
<!-- Instruction 3 -->
Some text to improve`;

      await improveText(text);

      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.prompt).toContain('Instruction 1');
      expect(body.prompt).toContain('Instruction 2');
      expect(body.prompt).toContain('Instruction 3');
    });
  });

  describe('Text replacement behavior', () => {
    it('should return only the improved text without comments', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'The improved sentence.',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const text = `// make this more concise
This is a very long and wordy sentence that could be much shorter.`;

      const result = await improveText(text);

      // Result should not contain the comment
      expect(result).toBe('The improved sentence.');
      expect(result).not.toContain('//');
      expect(result).not.toContain('make this more concise');
    });

    it('should handle text with multiple inline comments', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'First paragraph improved.\n\nSecond paragraph improved.',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const text = `// improve clarity
First paragraph needs work.

<!-- simplify language -->
Second paragraph is too complex.`;

      const result = await improveText(text);

      // Verify comments were used as instructions
      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.prompt).toContain('improve clarity');
      expect(body.prompt).toContain('simplify language');
      expect(body.prompt).toContain('First paragraph needs work.');
      expect(body.prompt).toContain('Second paragraph is too complex.');

      // Verify result doesn't contain comments
      expect(result).not.toContain('//');
      expect(result).not.toContain('<!--');
      expect(result).not.toContain('-->');
    });

    it('should preserve structure when only text content changes', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'This is improved text.',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const originalText = 'This is original text.';
      const result = await improveText(originalText);

      // Should return improved text that can replace the original
      expect(result).toBe('This is improved text.');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty result from AI', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: '',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const text = 'Some text';
      const result = await improveText(text);

      expect(result).toBe('');
    });

    it('should preserve whitespace and formatting in response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'Line one.\n\nLine two.\n  Indented line.',
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const text = 'Multiline text';
      const result = await improveText(text);

      expect(result).toContain('\n\n');
      expect(result).toContain('  Indented');
    });
  });
});
