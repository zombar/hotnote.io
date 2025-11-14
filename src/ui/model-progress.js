/**
 * Model Loading Progress UI
 * Shows progress bar and status for AI model downloads
 */

export class ModelProgressUI {
  constructor() {
    this.overlay = null;
    this.progressBar = null;
    this.progressText = null;
    this.statusText = null;
    this.isShowing = false;
  }

  /**
   * Check if toast is currently visible
   * @returns {boolean}
   */
  get visible() {
    return this.isShowing;
  }

  /**
   * Create the progress UI DOM structure (bottom-left toast)
   */
  create() {
    // Create toast container (bottom-left, non-blocking)
    this.overlay = document.createElement('div');
    this.overlay.className = 'model-progress-toast';

    // Create progress container
    const container = document.createElement('div');
    container.className = 'model-progress-container';

    // Header
    const header = document.createElement('div');
    header.className = 'model-progress-header';

    const title = document.createElement('div');
    title.className = 'model-progress-title';
    title.textContent = '⚡ Loading AI Model';

    header.appendChild(title);

    // Status text
    this.statusText = document.createElement('div');
    this.statusText.className = 'model-progress-status';
    this.statusText.textContent = 'Initializing...';

    // Progress bar container
    const progressContainer = document.createElement('div');
    progressContainer.className = 'model-progress-bar-container';

    // Progress bar
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'model-progress-bar';

    progressContainer.appendChild(this.progressBar);

    // Progress text (percentage)
    this.progressText = document.createElement('div');
    this.progressText.className = 'model-progress-text';
    this.progressText.textContent = '0%';

    // Assemble container
    container.appendChild(header);
    container.appendChild(this.statusText);
    container.appendChild(progressContainer);
    container.appendChild(this.progressText);

    this.overlay.appendChild(container);

    return this;
  }

  /**
   * Show the progress UI (toast style, bottom-left)
   */
  show() {
    if (this.isShowing) {
      return;
    }

    if (!this.overlay) {
      this.create();
    }

    document.body.appendChild(this.overlay);

    // Trigger animation (slide up and fade in)
    requestAnimationFrame(() => {
      this.overlay.classList.add('visible');
    });

    this.isShowing = true;
  }

  /**
   * Hide the progress UI (slide down and fade out)
   */
  hide() {
    if (!this.isShowing || !this.overlay) {
      return;
    }

    this.overlay.classList.remove('visible');

    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.isShowing = false;
    }, 300);
  }

  /**
   * Update progress
   * @param {Object} progress - Progress information from WebLLM/TransformersJS
   */
  updateProgress(progress) {
    console.log('[ModelProgress] Update:', progress);

    if (!this.isShowing) {
      this.show();
    }

    // Handle WebLLM progress format
    if (progress.progress !== undefined) {
      const percent = Math.round(progress.progress * 100);
      this.setProgress(percent);

      if (progress.text) {
        this.setStatus(progress.text);
      }
    }
    // Handle TransformersJS progress format
    else if (progress.status) {
      this.setStatus(progress.status);

      if (progress.file) {
        this.setStatus(`${progress.status}: ${progress.file}`);
      }

      // TransformersJS provides loaded/total
      if (progress.loaded !== undefined && progress.total !== undefined) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        this.setProgress(percent);
      } else if (progress.progress !== undefined) {
        // Some TransformersJS callbacks provide progress as a decimal
        const percent = Math.round(progress.progress * 100);
        this.setProgress(percent);
      }
    }
  }

  /**
   * Set progress percentage
   * @param {number} percent - Progress percentage (0-100)
   */
  setProgress(percent) {
    if (this.progressBar) {
      this.progressBar.style.width = `${percent}%`;
    }
    if (this.progressText) {
      this.progressText.textContent = `${percent}%`;
    }
  }

  /**
   * Set status text
   * @param {string} status - Status message
   */
  setStatus(status) {
    if (this.statusText) {
      this.statusText.textContent = status;
    }
  }

  /**
   * Show queue info in the toast
   * @param {number} queueSize - Number of items in queue
   */
  showQueueInfo(queueSize) {
    if (queueSize > 0) {
      this.setStatus(`Processing... (${queueSize} queued)`);

      // Add pulse animation to draw attention to queue update
      if (this.statusText) {
        this.statusText.classList.add('updating');
        setTimeout(() => {
          this.statusText.classList.remove('updating');
        }, 300);
      }
    }
  }

  /**
   * Destroy the progress UI
   */
  destroy() {
    this.hide();
    this.overlay = null;
    this.progressBar = null;
    this.progressText = null;
    this.statusText = null;
  }
}
