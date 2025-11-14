/**
 * AI Request Queue
 * Manages queuing of AI improvement requests when one is already in progress
 */

export class AIRequestQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.currentRequest = null;
    this.activeDecorations = []; // Track active AI processing ranges
  }

  /**
   * Add a request to the queue
   * @param {Object} request - Request object {selection, onChunk, signal, onComplete, onError}
   * @returns {Promise} - Promise that resolves when request is processed
   */
  async enqueue(request) {
    console.log('[AI Queue] Enqueueing request, current queue size:', this.queue.length);

    return new Promise((resolve, reject) => {
      this.queue.push({
        ...request,
        resolve,
        reject,
      });

      // If not currently processing, start processing
      if (!this.isProcessing) {
        this.processNext();
      } else {
        console.log(
          '[AI Queue] Request queued (currently processing). Queue size:',
          this.queue.length
        );
      }
    });
  }

  /**
   * Process the next request in the queue
   */
  async processNext() {
    // If queue is empty, mark as not processing
    if (this.queue.length === 0) {
      this.isProcessing = false;
      this.currentRequest = null;
      console.log('[AI Queue] Queue empty, stopping processing');
      return;
    }

    this.isProcessing = true;
    const request = this.queue.shift();
    this.currentRequest = request;

    console.log('[AI Queue] Processing request', `(${this.queue.length} remaining in queue)`);

    try {
      // Import improveText dynamically to avoid circular dependency
      const { improveText } = await import('./ai-service.js');

      // Call the AI service
      const result = await improveText(request.selection.text, request.onChunk, request.signal);

      // Call onComplete callback if provided
      if (request.onComplete) {
        request.onComplete(result);
      }

      // Resolve the promise
      request.resolve(result);
    } catch (error) {
      // Differentiate between intentional aborts and page unload
      const isPageUnloading =
        document.visibilityState === 'hidden' ||
        error.message?.includes('unload') ||
        error.message?.includes('navigation');

      // If it's an AbortError but NOT page unloading, it's an intentional abort
      const isIntentionalAbort = error.name === 'AbortError' && !isPageUnloading;

      if (isPageUnloading) {
        // Silently discard errors during page unload/reload
        // (user doesn't care if AI inference was interrupted by page reload)
        console.log('[AI Queue] Request cancelled due to page unload');
        request.resolve('');
      } else if (isIntentionalAbort) {
        // User intentionally cancelled - reject the promise
        console.log('[AI Queue] Request aborted by user');
        request.reject(error);
        return; // Don't process next on abort
      } else {
        console.error('[AI Queue] Request failed:', error);

        // Call onError callback if provided
        if (request.onError) {
          request.onError(error);
        }

        // Reject the promise
        request.reject(error);
        return; // Don't process next on error
      }
    } finally {
      // Process next request after a small delay
      setTimeout(() => {
        this.processNext();
      }, 100);
    }
  }

  /**
   * Get current queue size
   * @returns {number}
   */
  size() {
    return this.queue.length;
  }

  /**
   * Check if queue is processing
   * @returns {boolean}
   */
  isBusy() {
    return this.isProcessing;
  }

  /**
   * Clear all pending requests
   */
  clear() {
    console.log('[AI Queue] Clearing queue, size:', this.queue.length);
    this.queue = [];
  }

  /**
   * Get current request info
   * @returns {Object|null}
   */
  getCurrentRequest() {
    return this.currentRequest;
  }

  /**
   * Add active decoration range
   * @param {number} from - Start position
   * @param {number} to - End position
   */
  addDecoration(from, to) {
    this.activeDecorations.push({ from, to });
    console.log(
      '[AI Queue] Decoration added, total active decorations:',
      this.activeDecorations.length,
      { from, to }
    );
  }

  /**
   * Remove decoration for a specific range
   * @param {number} from - Start position
   * @param {number} to - End position
   */
  removeDecoration(from, to) {
    const beforeLength = this.activeDecorations.length;
    this.activeDecorations = this.activeDecorations.filter(
      (dec) => dec.from !== from || dec.to !== to
    );
    console.log(
      '[AI Queue] Decoration removed, total active decorations:',
      this.activeDecorations.length,
      '(was',
      beforeLength + ')',
      { from, to }
    );
  }

  /**
   * Get all active decoration ranges
   * @returns {Array<{from: number, to: number}>}
   */
  getActiveDecorations() {
    return [...this.activeDecorations];
  }

  /**
   * Clear all active decorations
   */
  clearDecorations() {
    this.activeDecorations = [];
  }
}

// Export singleton instance
export const aiQueue = new AIRequestQueue();
