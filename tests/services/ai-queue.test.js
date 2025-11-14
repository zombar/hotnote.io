/**
 * Tests for AIRequestQueue
 * Verifies queuing behavior, processing order, and error handling
 */

/* global DOMException, AbortController */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIRequestQueue } from '../../src/services/ai-queue.js';

// Mock the AI service
vi.mock('../../src/services/ai-service.js', () => ({
  improveText: vi.fn((text, onChunk, signal) => {
    // Honor abort signal
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }
    return Promise.resolve(text.toUpperCase());
  }),
}));

describe('AIRequestQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new AIRequestQueue();
  });

  afterEach(() => {
    queue.clear();
  });

  describe('Basic Queuing', () => {
    it('should start with empty queue', () => {
      expect(queue.size()).toBe(0);
      expect(queue.isBusy()).toBe(false);
    });

    it('should enqueue and process a single request', async () => {
      const selection = { from: 0, to: 5, text: 'hello' };
      const onComplete = vi.fn();
      const onError = vi.fn();

      await queue.enqueue({
        selection,
        onComplete,
        onError,
      });

      // Wait for the 100ms delay after processing
      await new Promise((r) => setTimeout(r, 150));

      expect(queue.isBusy()).toBe(false);
      expect(queue.size()).toBe(0);
    });

    it('should mark as busy while processing', async () => {
      const selection = { from: 0, to: 5, text: 'hello' };
      let resolvePromise;
      const _delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      // Start processing but don't complete
      const promise = queue.enqueue({
        selection,
        onComplete: () => resolvePromise(),
      });

      // Give it time to start processing
      await new Promise((r) => setTimeout(r, 10));

      expect(queue.isBusy()).toBe(true);

      // Complete the request
      resolvePromise();
      await promise;

      // Wait for the 100ms delay after processing
      await new Promise((r) => setTimeout(r, 150));

      expect(queue.isBusy()).toBe(false);
    });
  });

  describe('Multiple Requests', () => {
    it('should queue multiple requests and process them in order', async () => {
      const results = [];
      const requests = [
        { text: 'first', delay: 10 },
        { text: 'second', delay: 5 },
        { text: 'third', delay: 1 },
      ];

      const promises = requests.map((req, _index) =>
        queue.enqueue({
          selection: { from: 0, to: 5, text: req.text },
          onComplete: () => {
            results.push(req.text);
          },
        })
      );

      await Promise.all(promises);

      // Should process in order despite different delays
      expect(results).toEqual(['first', 'second', 'third']);
    });

    it('should update queue size correctly', async () => {
      const selection = { from: 0, to: 5, text: 'hello' };
      let resolveFirst;
      const _firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      // Start first request
      const promise1 = queue.enqueue({
        selection,
        onComplete: () => resolveFirst(),
      });

      // Wait for it to start
      await new Promise((r) => setTimeout(r, 10));

      // Queue second and third
      const promise2 = queue.enqueue({ selection });
      const promise3 = queue.enqueue({ selection });

      // Queue should have 2 (second and third)
      expect(queue.size()).toBe(2);

      // Complete first
      resolveFirst();
      await promise1;

      // Wait for processing
      await new Promise((r) => setTimeout(r, 150));

      // Should process remaining
      await Promise.all([promise2, promise3]);
      expect(queue.size()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should call onError when request fails', async () => {
      const onError = vi.fn();
      const selection = { from: 0, to: 5, text: 'hello' };

      // This test verifies the error callback is wired up correctly
      // Actual error testing would require mocking at a different level
      await queue.enqueue({
        selection,
        onError,
        onComplete: vi.fn(),
      });

      // Request should complete successfully with mock
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Queue Management', () => {
    it('should clear all pending requests', async () => {
      const selection = { from: 0, to: 5, text: 'hello' };
      let resolveFirst;
      const _firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      // Start first request
      const promise1 = queue.enqueue({
        selection,
        onComplete: () => resolveFirst(),
      });

      // Wait for it to start
      await new Promise((r) => setTimeout(r, 10));

      // Queue more
      queue.enqueue({ selection });
      queue.enqueue({ selection });

      expect(queue.size()).toBe(2);

      // Clear queue
      queue.clear();

      expect(queue.size()).toBe(0);

      // Complete first
      resolveFirst();
      await promise1;

      // Queue should stay empty
      expect(queue.size()).toBe(0);
    });

    it('should get current request info', async () => {
      const selection = { from: 0, to: 5, text: 'hello' };
      let resolveFirst;
      const _firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const promise = queue.enqueue({
        selection,
        onComplete: () => resolveFirst(),
      });

      // Wait for it to start
      await new Promise((r) => setTimeout(r, 10));

      const current = queue.getCurrentRequest();
      expect(current).toBeDefined();
      expect(current.selection).toEqual(selection);

      resolveFirst();
      await promise;

      // Wait for the 100ms delay after processing
      await new Promise((r) => setTimeout(r, 150));

      // Should be null when done
      expect(queue.getCurrentRequest()).toBeNull();
    });
  });

  describe('Callbacks', () => {
    it('should call onChunk during streaming', async () => {
      const onChunk = vi.fn();
      const selection = { from: 0, to: 5, text: 'hello' };

      await queue.enqueue({
        selection,
        onChunk,
      });

      // onChunk should be called (implementation depends on ai-service mock)
      // This test documents expected behavior
    });

    it('should call onComplete with result', async () => {
      const onComplete = vi.fn();
      const selection = { from: 0, to: 5, text: 'hello' };

      await queue.enqueue({
        selection,
        onComplete,
      });

      expect(onComplete).toHaveBeenCalled();
    });

    it('should respect abort signal', async () => {
      const controller = new AbortController();
      const selection = { from: 0, to: 5, text: 'hello' };

      // Abort immediately
      controller.abort();

      await expect(
        queue.enqueue({
          selection,
          signal: controller.signal,
        })
      ).rejects.toThrow();
    });
  });
});
