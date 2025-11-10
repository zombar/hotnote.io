/**
 * File System Access API Adapter
 * Provides a clean interface to browser's File System Access API
 */

/**
 * Core filesystem operations adapter
 */
export const FileSystemAdapter = {
  /**
   * Check if file system access is supported
   * @returns {boolean} True if File System Access API is available
   */
  isSupported() {
    return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
  },

  /**
   * Open directory picker
   * @returns {Promise<FileSystemDirectoryHandle>} Directory handle
   */
  async openDirectory() {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return dirHandle;
  },

  /**
   * List directory entries
   * @param {FileSystemDirectoryHandle} dirHandle - Directory to list
   * @returns {Promise<Array>} Array of file/directory entries
   */
  async listDirectory(dirHandle) {
    const entries = [];
    for await (const entry of dirHandle.values()) {
      entries.push(entry);
    }
    return entries;
  },

  /**
   * Read file content
   * @param {FileSystemFileHandle} fileHandle - File to read
   * @returns {Promise<string>} File content as text
   */
  async readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return await file.text();
  },

  /**
   * Write file content
   * @param {FileSystemFileHandle} fileHandle - File to write
   * @param {string} content - Content to write
   * @returns {Promise<void>}
   */
  async writeFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  },

  /**
   * Save file picker (for new files)
   * @param {string} suggestedName - Suggested filename
   * @returns {Promise<FileSystemFileHandle>} New file handle
   */
  async saveFilePicker(suggestedName) {
    return await window.showSaveFilePicker({
      types: [
        {
          description: 'Text Files',
          accept: { 'text/*': ['.txt', '.md', '.js', '.py', '.html', '.css', '.json'] },
        },
      ],
      suggestedName: suggestedName,
    });
  },

  /**
   * Get file metadata (name, size, lastModified)
   * @param {FileSystemFileHandle} fileHandle - File handle
   * @returns {Promise<{name: string, size: number, lastModified: number}>} File metadata
   */
  async getFileMetadata(fileHandle) {
    const file = await fileHandle.getFile();
    return {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    };
  },

  /**
   * Navigate to subdirectory
   * @param {FileSystemDirectoryHandle} parentHandle - Parent directory
   * @param {string} name - Subdirectory name
   * @returns {Promise<FileSystemDirectoryHandle>} Subdirectory handle
   */
  async navigateToSubdirectory(parentHandle, name) {
    return await parentHandle.getDirectoryHandle(name);
  },
};

/**
 * Check if File System Access API is supported (alias for backwards compatibility)
 * @returns {boolean}
 */
export function isFileSystemAccessSupported() {
  return FileSystemAdapter.isSupported();
}

/**
 * Open a file by relative path from current directory
 * @param {FileSystemDirectoryHandle} rootDirHandle - Root directory handle
 * @param {string} relativePath - Relative path (e.g. "src/index.js")
 * @returns {Promise<{fileHandle: FileSystemFileHandle, dirHandle: FileSystemDirectoryHandle} | null>}
 */
export async function openFileByPath(rootDirHandle, relativePath) {
  if (!rootDirHandle || !relativePath) return null;

  try {
    const parts = relativePath.split('/').filter((p) => p); // Remove empty parts
    const filename = parts.pop();

    let targetDir = rootDirHandle;

    // Navigate through subdirectories
    for (const dirName of parts) {
      targetDir = await targetDir.getDirectoryHandle(dirName);
    }

    // Get file handle
    const fileHandle = await targetDir.getFileHandle(filename);

    return { fileHandle, dirHandle: targetDir };
  } catch (err) {
    console.error('Error opening file by path:', relativePath, err);
    return null;
  }
}

/**
 * Navigate to a subdirectory
 * @param {FileSystemDirectoryHandle} parentHandle - Parent directory
 * @param {string} name - Subdirectory name
 * @returns {Promise<FileSystemDirectoryHandle>} Subdirectory handle
 */
export async function navigateToDirectory(parentHandle, name) {
  return await FileSystemAdapter.navigateToSubdirectory(parentHandle, name);
}
