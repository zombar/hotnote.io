/**
 * Autosave Manager
 * Handles automatic file saving with configurable intervals
 */

/**
 * AutosaveManager - Manages automatic file saving
 */
export class AutosaveManager {
  constructor(options = {}) {
    this.interval = options.interval || 2000; // Default 2 seconds
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.intervalId = null;
    this.callbacks = {
      onSave: options.onSave || (() => {}),
      shouldSave: options.shouldSave || (() => false),
      onStart: options.onStart || (() => {}),
      onStop: options.onStop || (() => {}),
    };
  }

  /**
   * Start autosave
   * @returns {void}
   */
  start() {
    // Clear any existing interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Create new interval
    this.intervalId = setInterval(async () => {
      if (this.callbacks.shouldSave()) {
        try {
          await this.callbacks.onSave();
        } catch (err) {
          console.error('Autosave error:', err);
        }
      }
    }, this.interval);

    this.callbacks.onStart();
  }

  /**
   * Stop autosave
   * @returns {void}
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.callbacks.onStop();
  }

  /**
   * Toggle autosave on/off
   * @param {boolean} enabled - Whether to enable autosave
   * @returns {void}
   */
  toggle(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  /**
   * Check if autosave is currently running
   * @returns {boolean}
   */
  isRunning() {
    return this.intervalId !== null;
  }

  /**
   * Check if autosave is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Update autosave interval
   * @param {number} interval - New interval in milliseconds
   * @returns {void}
   */
  setInterval(interval) {
    this.interval = interval;
    // Restart if currently running
    if (this.isRunning()) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get current interval
   * @returns {number} Current interval in milliseconds
   */
  getInterval() {
    return this.interval;
  }

  /**
   * Trigger an immediate save (bypasses interval)
   * @returns {Promise<void>}
   */
  async saveNow() {
    if (this.callbacks.shouldSave()) {
      try {
        await this.callbacks.onSave();
      } catch (err) {
        console.error('Manual save error:', err);
        throw err;
      }
    }
  }

  /**
   * Reset autosave manager (useful for tests)
   * @returns {void}
   */
  reset() {
    this.stop();
    this.enabled = true;
    this.interval = 2000;
  }
}

/**
 * Create an autosave manager instance
 * @param {Object} options - Configuration options
 * @returns {AutosaveManager}
 */
export function createAutosaveManager(options = {}) {
  return new AutosaveManager(options);
}

/**
 * Animate autosave label visibility
 * @param {boolean} shouldHide - Whether to hide the label
 * @param {Object} options - Animation options
 * @returns {void}
 */
export function animateAutosaveLabel(shouldHide, options = {}) {
  const { labelId = 'autosave-label', lingerDuration = 2000, fadeDuration = 500 } = options;

  const label = document.getElementById(labelId);
  if (!label) return;

  if (shouldHide) {
    // Linger for specified duration, then fade out
    setTimeout(() => {
      label.classList.add('fade-out');
      // After fade animation completes, hide completely
      setTimeout(() => {
        label.classList.add('hidden');
      }, fadeDuration);
    }, lingerDuration);
  } else {
    // Show label immediately when unchecked
    label.classList.remove('hidden', 'fade-out');
  }
}

/**
 * Setup autosave UI controls
 * @param {AutosaveManager} manager - Autosave manager instance
 * @param {Object} options - UI options
 * @returns {void}
 */
export function setupAutosaveUI(manager, options = {}) {
  const {
    checkboxId = 'autosave-checkbox',
    labelId = 'autosave-label',
    animateLabel = true,
  } = options;

  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) {
    console.warn(`Autosave checkbox not found: ${checkboxId}`);
    return;
  }

  // Set initial checkbox state
  checkbox.checked = manager.isEnabled();

  // Setup change listener
  checkbox.addEventListener('change', (e) => {
    manager.toggle(e.target.checked);

    if (animateLabel) {
      animateAutosaveLabel(e.target.checked, { labelId });
    }
  });
}
