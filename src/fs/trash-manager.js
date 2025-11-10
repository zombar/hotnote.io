/**
 * Trash Management System
 * Handles file deletion with undo functionality
 */

/**
 * TrashManager - Manages file deletion and restoration via a .trash directory
 */
export class TrashManager {
  constructor(options = {}) {
    this.trashDirHandle = null;
    this.callbacks = {
      onFileDeleted: options.onFileDeleted || (() => {}),
      onFileRestored: options.onFileRestored || (() => {}),
      refreshFilePicker: options.refreshFilePicker || (() => {}),
    };
  }

  /**
   * Move a file to trash
   * @param {FileSystemDirectoryHandle} currentDirHandle - Current directory
   * @param {FileSystemFileHandle} fileHandle - File to delete
   * @returns {Promise<void>}
   */
  async moveToTrash(currentDirHandle, fileHandle) {
    if (!currentDirHandle || !fileHandle) {
      throw new Error('Directory handle and file handle are required');
    }

    try {
      // Create .trash folder if it doesn't exist
      if (!this.trashDirHandle) {
        this.trashDirHandle = await currentDirHandle.getDirectoryHandle('.trash', {
          create: true,
        });
      }

      // Read file contents
      const file = await fileHandle.getFile();
      const contents = await file.text();

      // Create file in trash with same name
      const trashFileHandle = await this.trashDirHandle.getFileHandle(fileHandle.name, {
        create: true,
      });
      const writable = await trashFileHandle.createWritable();
      await writable.write(contents);
      await writable.close();

      // Delete from original location
      await currentDirHandle.removeEntry(fileHandle.name);

      // Notify callback
      this.callbacks.onFileDeleted(fileHandle.name);

      // Refresh the file picker
      await this.callbacks.refreshFilePicker(currentDirHandle);
    } catch (err) {
      console.error('Error moving file to trash:', err);
      throw new Error('Error deleting file: ' + err.message);
    }
  }

  /**
   * Restore a file from trash
   * @param {FileSystemDirectoryHandle} currentDirHandle - Current directory
   * @param {string} filename - Name of file to restore
   * @returns {Promise<void>}
   */
  async restoreFromTrash(currentDirHandle, filename) {
    if (!currentDirHandle || !filename) {
      throw new Error('Directory handle and filename are required');
    }

    try {
      if (!this.trashDirHandle) {
        throw new Error('Trash directory not initialized');
      }

      // Read file from trash
      const trashFileHandle = await this.trashDirHandle.getFileHandle(filename);
      const file = await trashFileHandle.getFile();
      const contents = await file.text();

      // Restore to original location
      const restoredFileHandle = await currentDirHandle.getFileHandle(filename, {
        create: true,
      });
      const writable = await restoredFileHandle.createWritable();
      await writable.write(contents);
      await writable.close();

      // Delete from trash
      await this.trashDirHandle.removeEntry(filename);

      // Notify callback
      this.callbacks.onFileRestored(filename);

      // Refresh the file picker
      await this.callbacks.refreshFilePicker(currentDirHandle);
    } catch (err) {
      console.error('Error restoring file from trash:', err);
      throw new Error('Error restoring file: ' + err.message);
    }
  }

  /**
   * Show an undo snackbar notification
   * @param {string} filename - Name of deleted file
   * @param {FileSystemDirectoryHandle} currentDirHandle - Current directory
   * @param {Object} options - Snackbar options
   * @returns {void}
   */
  showUndoSnackbar(filename, currentDirHandle, options = {}) {
    const { message = `Deleted ${filename}`, duration = 10000, actionText = 'UNDO' } = options;

    // Remove existing snackbar if any
    const existingSnackbar = document.querySelector('.snackbar');
    if (existingSnackbar) {
      existingSnackbar.remove();
    }

    // Create snackbar
    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar';
    snackbar.setAttribute('data-testid', 'snackbar');

    const messageEl = document.createElement('span');
    messageEl.className = 'snackbar-message';
    messageEl.textContent = message;

    const undoBtn = document.createElement('button');
    undoBtn.className = 'snackbar-action';
    undoBtn.textContent = actionText;
    undoBtn.addEventListener('click', async () => {
      try {
        await this.restoreFromTrash(currentDirHandle, filename);
        snackbar.remove();
      } catch (err) {
        console.error('Error in undo:', err);
        alert('Could not restore file: ' + err.message);
      }
    });

    snackbar.appendChild(messageEl);
    snackbar.appendChild(undoBtn);
    document.body.appendChild(snackbar);

    // Show snackbar with animation
    setTimeout(() => {
      snackbar.classList.add('visible');
    }, 10);

    // Auto-dismiss after duration
    const dismissTimeout = setTimeout(() => {
      snackbar.classList.remove('visible');
      setTimeout(() => {
        snackbar.remove();
      }, 200);
    }, duration);

    // Allow manual dismissal by clicking outside
    snackbar.addEventListener('click', (e) => {
      if (e.target === snackbar) {
        clearTimeout(dismissTimeout);
        snackbar.classList.remove('visible');
        setTimeout(() => {
          snackbar.remove();
        }, 200);
      }
    });
  }

  /**
   * Cleanup trash directory
   * @param {FileSystemDirectoryHandle} currentDirHandle - Current directory
   * @returns {Promise<void>}
   */
  async cleanup(currentDirHandle) {
    try {
      if (this.trashDirHandle && currentDirHandle) {
        await currentDirHandle.removeEntry('.trash', { recursive: true });
        this.trashDirHandle = null;
      }
    } catch (err) {
      console.error('Error cleaning up trash:', err);
      throw new Error('Error cleaning up trash: ' + err.message);
    }
  }

  /**
   * Check if trash directory exists
   * @returns {boolean}
   */
  hasTrash() {
    return this.trashDirHandle !== null;
  }

  /**
   * Reset the trash manager (useful for tests)
   * @returns {void}
   */
  reset() {
    this.trashDirHandle = null;
  }

  /**
   * Get trash directory handle
   * @returns {FileSystemDirectoryHandle|null}
   */
  getTrashHandle() {
    return this.trashDirHandle;
  }
}

/**
 * Create a TrashManager instance
 * @param {Object} options - Configuration options
 * @returns {TrashManager}
 */
export function createTrashManager(options = {}) {
  return new TrashManager(options);
}
