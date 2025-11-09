/**
 * Mock File System Access API for testing
 * Provides realistic mocks for FileSystemFileHandle, FileSystemDirectoryHandle, and related APIs
 */

export class MockFileSystemWritableFileStream {
  constructor(fileHandle) {
    this.fileHandle = fileHandle;
    this.content = '';
    this.closed = false;
  }

  async write(data) {
    if (this.closed) {
      throw new Error('Stream is closed');
    }
    if (typeof data === 'string') {
      this.content += data;
    } else if (data instanceof Blob) {
      this.content += await data.text();
    } else if (data.type === 'write' && data.data) {
      this.content += data.data;
    }
  }

  async close() {
    if (!this.closed) {
      this.fileHandle._content = this.content;
      this.fileHandle._lastModified = Date.now();
      this.fileHandle._size = this.content.length;
      this.closed = true;
    }
  }

  async abort() {
    this.closed = true;
  }
}

export class MockFileSystemFileHandle {
  constructor(name, content = '', options = {}) {
    this.kind = 'file';
    this.name = name;
    this._content = content;
    this._permissionState = options.permissionState || 'granted';
    this._parent = options.parent || null;
    this._lastModified = options.lastModified || Date.now();
    this._size = content.length;
  }

  async getFile() {
    if (this._permissionState !== 'granted') {
      throw new Error('Permission denied');
    }
    // Create a File-like object with proper properties
    const file = new File([this._content], this.name, {
      type: 'text/plain',
      lastModified: this._lastModified,
    });
    return file;
  }

  async createWritable(options = {}) {
    if (this._permissionState !== 'granted') {
      throw new Error('Permission denied');
    }
    if (options.keepExistingData === false) {
      this._content = '';
    }
    return new MockFileSystemWritableFileStream(this);
  }

  async queryPermission(_options = {}) {
    return this._permissionState;
  }

  async requestPermission(_options = {}) {
    return this._permissionState;
  }

  async isSameEntry(other) {
    return this === other;
  }

  // Helper method for testing
  _setContent(content) {
    this._content = content;
    this._size = content.length;
    this._lastModified = Date.now();
  }

  _getContent() {
    return this._content;
  }

  _setPermissionState(state) {
    this._permissionState = state;
  }

  _setLastModified(timestamp) {
    this._lastModified = timestamp;
  }

  _getLastModified() {
    return this._lastModified;
  }
}

export class MockFileSystemDirectoryHandle {
  constructor(name, options = {}) {
    this.kind = 'directory';
    this.name = name;
    this._entries = new Map();
    this._permissionState = options.permissionState || 'granted';
    this._parent = options.parent || null;
  }

  async getFileHandle(name, options = {}) {
    if (this._permissionState !== 'granted') {
      throw new Error('Permission denied');
    }

    // Handle nested paths (e.g., "src/components/App.js")
    const parts = name.split('/');
    if (parts.length > 1) {
      const [dirName, ...rest] = parts;
      const dir = this._entries.get(dirName);
      if (!dir || dir.kind !== 'directory') {
        if (options.create) {
          const newDir = new MockFileSystemDirectoryHandle(dirName, {
            parent: this,
            permissionState: this._permissionState,
          });
          this._entries.set(dirName, newDir);
          return await newDir.getFileHandle(rest.join('/'), options);
        }
        throw new Error(`Directory not found: ${dirName}`);
      }
      return await dir.getFileHandle(rest.join('/'), options);
    }

    // Single file name
    if (this._entries.has(name)) {
      const entry = this._entries.get(name);
      if (entry.kind !== 'file') {
        throw new Error(`${name} is a directory, not a file`);
      }
      return entry;
    }

    if (options.create) {
      const fileHandle = new MockFileSystemFileHandle(name, '', {
        parent: this,
        permissionState: this._permissionState,
      });
      this._entries.set(name, fileHandle);
      return fileHandle;
    }

    throw new Error(`File not found: ${name}`);
  }

  async getDirectoryHandle(name, options = {}) {
    if (this._permissionState !== 'granted') {
      throw new Error('Permission denied');
    }

    // Handle nested paths
    const parts = name.split('/');
    if (parts.length > 1) {
      const [dirName, ...rest] = parts;
      const dir = this._entries.get(dirName);
      if (!dir || dir.kind !== 'directory') {
        if (options.create) {
          const newDir = new MockFileSystemDirectoryHandle(dirName, {
            parent: this,
            permissionState: this._permissionState,
          });
          this._entries.set(dirName, newDir);
          return await newDir.getDirectoryHandle(rest.join('/'), options);
        }
        throw new Error(`Directory not found: ${dirName}`);
      }
      return await dir.getDirectoryHandle(rest.join('/'), options);
    }

    // Single directory name
    if (this._entries.has(name)) {
      const entry = this._entries.get(name);
      if (entry.kind !== 'directory') {
        throw new Error(`${name} is a file, not a directory`);
      }
      return entry;
    }

    if (options.create) {
      const dirHandle = new MockFileSystemDirectoryHandle(name, {
        parent: this,
        permissionState: this._permissionState,
      });
      this._entries.set(name, dirHandle);
      return dirHandle;
    }

    throw new Error(`Directory not found: ${name}`);
  }

  async removeEntry(name, options = {}) {
    if (this._permissionState !== 'granted') {
      throw new Error('Permission denied');
    }

    if (!this._entries.has(name)) {
      throw new Error(`Entry not found: ${name}`);
    }

    const entry = this._entries.get(name);
    if (entry.kind === 'directory' && entry._entries.size > 0 && !options.recursive) {
      throw new Error(`Directory not empty: ${name}`);
    }

    this._entries.delete(name);
  }

  async resolve(possibleDescendant) {
    if (possibleDescendant === this) {
      return [];
    }

    for (const [name, entry] of this._entries) {
      if (entry === possibleDescendant) {
        return [name];
      }
      if (entry.kind === 'directory') {
        const subPath = await entry.resolve(possibleDescendant);
        if (subPath !== null) {
          return [name, ...subPath];
        }
      }
    }

    return null;
  }

  async queryPermission(_options = {}) {
    return this._permissionState;
  }

  async requestPermission(_options = {}) {
    return this._permissionState;
  }

  async isSameEntry(other) {
    return this === other;
  }

  // Async iteration support
  async *entries() {
    for (const [name, entry] of this._entries) {
      yield [name, entry];
    }
  }

  async *keys() {
    for (const name of this._entries.keys()) {
      yield name;
    }
  }

  async *values() {
    for (const entry of this._entries.values()) {
      yield entry;
    }
  }

  [Symbol.asyncIterator]() {
    return this.entries();
  }

  // Helper methods for testing
  _addEntry(name, entry) {
    entry._parent = this;
    this._entries.set(name, entry);
  }

  _removeEntry(name) {
    this._entries.delete(name);
  }

  _clear() {
    this._entries.clear();
  }

  _hasEntry(name) {
    return this._entries.has(name);
  }

  _getEntry(name) {
    return this._entries.get(name);
  }

  _setPermissionState(state) {
    this._permissionState = state;
    // Propagate to children
    for (const entry of this._entries.values()) {
      entry._setPermissionState(state);
    }
  }

  _getAllFiles(path = '', maxDepth = 10, currentDepth = 0) {
    const files = [];
    if (currentDepth >= maxDepth) {
      return files;
    }

    for (const [name, entry] of this._entries) {
      const fullPath = path ? `${path}/${name}` : name;
      if (entry.kind === 'file') {
        files.push({ name, path: fullPath, handle: entry });
      } else if (entry.kind === 'directory') {
        files.push(...entry._getAllFiles(fullPath, maxDepth, currentDepth + 1));
      }
    }

    return files;
  }
}

// Helper function to create a mock file handle
export function createMockFileHandle(name, content = '', options = {}) {
  return new MockFileSystemFileHandle(name, content, options);
}

// Helper function to create a mock directory handle with nested structure
export function createMockDirectoryHandle(name, structure = {}, options = {}) {
  const dir = new MockFileSystemDirectoryHandle(name, options);

  for (const [entryName, entryValue] of Object.entries(structure)) {
    if (typeof entryValue === 'string') {
      // It's a file with content
      const file = new MockFileSystemFileHandle(entryName, entryValue, {
        parent: dir,
        permissionState: options.permissionState || 'granted',
      });
      dir._addEntry(entryName, file);
    } else if (entryValue && typeof entryValue === 'object') {
      // It's a nested directory
      const subDir = createMockDirectoryHandle(entryName, entryValue, {
        parent: dir,
        permissionState: options.permissionState || 'granted',
      });
      dir._addEntry(entryName, subDir);
    }
  }

  return dir;
}

// Helper to create a complete mock project structure
export function createMockProject(structure) {
  return createMockDirectoryHandle('project', structure);
}

// Mock the window.showDirectoryPicker function
export function mockShowDirectoryPicker(mockHandle) {
  return vi.fn(async () => {
    if (!mockHandle) {
      throw new Error('User cancelled directory picker');
    }
    return mockHandle;
  });
}

// Mock the window.showOpenFilePicker function
export function mockShowOpenFilePicker(mockHandles = []) {
  return vi.fn(async (options = {}) => {
    if (mockHandles.length === 0) {
      throw new Error('User cancelled file picker');
    }
    if (options.multiple) {
      return mockHandles;
    }
    return [mockHandles[0]];
  });
}

// Mock the window.showSaveFilePicker function
export function mockShowSaveFilePicker(mockHandle) {
  return vi.fn(async (options = {}) => {
    if (!mockHandle) {
      throw new Error('User cancelled save picker');
    }
    if (options.suggestedName) {
      mockHandle.name = options.suggestedName;
    }
    return mockHandle;
  });
}
