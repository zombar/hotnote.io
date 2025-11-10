/**
 * File Sync Manager
 * Handles file synchronization with external changes using polling
 * Implements "last edit wins" conflict resolution strategy
 */

/**
 * FileSyncManager - Manages file synchronization with external changes
 */
export class FileSyncManager {
  constructor(options = {}) {
    this.interval = options.interval || 2500; // Default 2.5 seconds
    this.idleThreshold = options.idleThreshold || 4000; // Default 4 seconds
    this.enabled = options.enabled !== undefined ? options.enabled : true;

    this.lastKnownModified = null; // Timestamp when file was last loaded/saved
    this.lastModifiedLocal = null; // Timestamp of last local edit
    this.lastUserActivityTime = Date.now(); // Timestamp of last user interaction
    this.intervalId = null;
    this.isPaused = false;

    this.callbacks = {
      // Required callbacks
      getFileHandle: options.getFileHandle || (() => null),
      getFileMetadata: options.getFileMetadata || (async () => ({ lastModified: 0 })),
      readFile: options.readFile || (async () => ''),
      isUserIdle: options.isUserIdle || (() => false),
      getCurrentEditorState: options.getCurrentEditorState || (() => ({})),
      updateEditorContent: options.updateEditorContent || (async () => {}),
      onFileReloaded: options.onFileReloaded || (() => {}),
      onSyncError: options.onSyncError || (() => {}),
      onSyncStart: options.onSyncStart || (() => {}),
      onSyncEnd: options.onSyncEnd || (() => {}),
    };
  }

  /**
   * Start file polling
   * @returns {void}
   */
  start() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.checkForExternalChanges();
    }, this.interval);
  }

  /**
   * Stop file polling
   * @returns {void}
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Pause file polling (e.g., during file picker operations)
   * @returns {void}
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Resume file polling
   * @returns {void}
   */
  resume() {
    this.isPaused = false;
  }

  /**
   * Update user activity timestamp
   * @returns {void}
   */
  updateUserActivity() {
    this.lastUserActivityTime = Date.now();
  }

  /**
   * Check if user is currently idle
   * @returns {boolean}
   */
  isUserIdle() {
    return Date.now() - this.lastUserActivityTime > this.idleThreshold;
  }

  /**
   * Check if file polling should occur
   * @returns {boolean}
   */
  shouldPollFile() {
    const fileHandle = this.callbacks.getFileHandle();
    return (
      fileHandle !== null && // File is open
      !this.isPaused && // Not paused during file picker
      this.isUserIdle() // User is idle
    );
  }

  /**
   * Check file for external changes
   * @returns {Promise<void>}
   */
  async checkForExternalChanges() {
    if (!this.shouldPollFile()) {
      return;
    }

    try {
      const fileHandle = this.callbacks.getFileHandle();
      if (!fileHandle) return;

      const metadata = await this.callbacks.getFileMetadata(fileHandle);
      const externalModified = metadata.lastModified;

      // Check if file was modified externally
      if (this.lastKnownModified && externalModified > this.lastKnownModified) {
        // File changed externally - need to reconcile
        await this.reconcileChanges(externalModified);
      }
    } catch (err) {
      console.error('[File Sync] Error checking file for external changes:', err);
      this.callbacks.onSyncError(err);

      // File might have been deleted - stop polling
      if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
        this.stop();
      }
    }
  }

  /**
   * Reconcile external changes with local changes
   * Uses "last edit wins" strategy
   * @param {number} externalModified - External modification timestamp
   * @returns {Promise<void>}
   */
  async reconcileChanges(externalModified) {
    // Last edit wins: compare timestamps
    if (this.lastModifiedLocal && this.lastModifiedLocal > externalModified) {
      // Our local changes are newer - skip reload
      return;
    }

    // External changes are newer or we have no local edits - reload
    try {
      this.callbacks.onSyncStart();

      const fileHandle = this.callbacks.getFileHandle();
      if (!fileHandle) return;

      // Capture current editor state BEFORE reload
      const editorState = this.callbacks.getCurrentEditorState();

      // Read fresh content from disk
      const freshContent = await this.callbacks.readFile(fileHandle);

      // Update editor with fresh content, preserving state
      await this.callbacks.updateEditorContent(freshContent, editorState);

      // Update tracking variables
      this.lastKnownModified = externalModified;
      this.lastModifiedLocal = null; // Clear local timestamp since we just loaded

      this.callbacks.onSyncEnd();
      this.callbacks.onFileReloaded(freshContent);
    } catch (err) {
      console.error('[File Sync] Error reloading file:', err);
      this.callbacks.onSyncError(err);
    }
  }

  /**
   * Update last known modified timestamp
   * Call this when saving file to disk
   * @param {number} timestamp - Modification timestamp
   * @returns {void}
   */
  updateLastKnownModified(timestamp) {
    this.lastKnownModified = timestamp;
  }

  /**
   * Update last modified local timestamp
   * Call this when user makes local edits
   * @param {number} timestamp - Local modification timestamp
   * @returns {void}
   */
  updateLastModifiedLocal(timestamp) {
    this.lastModifiedLocal = timestamp;
  }

  /**
   * Get last known modified timestamp
   * @returns {number|null}
   */
  getLastKnownModified() {
    return this.lastKnownModified;
  }

  /**
   * Get last modified local timestamp
   * @returns {number|null}
   */
  getLastModifiedLocal() {
    return this.lastModifiedLocal;
  }

  /**
   * Check if file polling is currently running
   * @returns {boolean}
   */
  isRunning() {
    return this.intervalId !== null;
  }

  /**
   * Check if file polling is currently paused
   * @returns {boolean}
   */
  isPausedState() {
    return this.isPaused;
  }

  /**
   * Set polling interval
   * @param {number} interval - Interval in milliseconds
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
   * Get current polling interval
   * @returns {number} Interval in milliseconds
   */
  getInterval() {
    return this.interval;
  }

  /**
   * Set idle threshold
   * @param {number} threshold - Threshold in milliseconds
   * @returns {void}
   */
  setIdleThreshold(threshold) {
    this.idleThreshold = threshold;
  }

  /**
   * Get current idle threshold
   * @returns {number} Threshold in milliseconds
   */
  getIdleThreshold() {
    return this.idleThreshold;
  }

  /**
   * Reset file sync manager (useful for tests)
   * @returns {void}
   */
  reset() {
    this.stop();
    this.lastKnownModified = null;
    this.lastModifiedLocal = null;
    this.lastUserActivityTime = Date.now();
    this.isPaused = false;
    this.enabled = true;
    this.interval = 2500;
    this.idleThreshold = 4000;
  }
}

/**
 * Create a file sync manager instance
 * @param {Object} options - Configuration options
 * @returns {FileSyncManager}
 */
export function createFileSyncManager(options = {}) {
  return new FileSyncManager(options);
}
