import { vi, beforeEach } from 'vitest';
import {
  createMockFileHandle as createEnhancedFileHandle,
  createMockDirectoryHandle as createEnhancedDirectoryHandle,
  mockShowDirectoryPicker,
  mockShowOpenFilePicker,
  mockShowSaveFilePicker,
} from './mocks/filesystem.js';
import { setupServiceWorkerMocks } from './mocks/serviceworker.js';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

global.localStorage = localStorageMock;

// Initialize global objects
global.window = global.window || {};
global.navigator = global.navigator || {};
global.document = global.document || {};

// Setup Service Worker mocks
const { cacheStorage, serviceWorkerContainer } = setupServiceWorkerMocks(global);
export { cacheStorage, serviceWorkerContainer };

// Mock File System Access API (using enhanced mocks)
global.window.showDirectoryPicker = mockShowDirectoryPicker(null);
global.window.showOpenFilePicker = mockShowOpenFilePicker([]);
global.window.showSaveFilePicker = mockShowSaveFilePicker(null);

// Export both legacy and enhanced mock helpers for backward compatibility
export const createMockFileHandle = (name, content = '') => {
  return {
    name,
    kind: 'file',
    getFile: vi.fn().mockResolvedValue({
      name,
      text: vi.fn().mockResolvedValue(content),
    }),
    createWritable: vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  };
};

export const createMockDirectoryHandle = (name, entries = []) => {
  return {
    name,
    kind: 'directory',
    values: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        for (const entry of entries) {
          yield entry;
        }
      },
    }),
  };
};

// Export enhanced mocks for new tests
export { createEnhancedFileHandle, createEnhancedDirectoryHandle };

// Mock CodeMirror editor
export const createMockCodeMirrorEditor = () => {
  let content = '';
  const listeners = new Map();

  const mockView = {
    state: {
      doc: {
        toString: () => content,
        length: content.length,
      },
    },
    dispatch: vi.fn((transaction) => {
      if (transaction.changes) {
        // Simple mock - just track that changes happened
        const changeListener = listeners.get('change');
        if (changeListener) {
          changeListener();
        }
      }
    }),
    destroy: vi.fn(),
    focus: vi.fn(),
    contentDOM: document.createElement('div'),
  };

  const mockEditor = {
    view: mockView,
    setContent: (newContent) => {
      content = newContent;
      mockView.state.doc = {
        toString: () => content,
        length: content.length,
      };
    },
    getContent: () => content,
    onChange: (callback) => {
      listeners.set('change', callback);
    },
    destroy: () => {
      mockView.destroy();
      listeners.clear();
    },
  };

  return mockEditor;
};

// Mock Milkdown editor for markdown
export const createMockMilkdownEditor = () => {
  let content = '';
  const listeners = new Map();

  const mockEditor = {
    getMarkdown: vi.fn(() => content),
    setMarkdown: vi.fn((newContent) => {
      content = newContent;
      const changeListener = listeners.get('change');
      if (changeListener) {
        changeListener();
      }
    }),
    onChange: (callback) => {
      listeners.set('change', callback);
    },
    destroy: vi.fn(() => {
      listeners.clear();
    }),
    focus: vi.fn(),
  };

  return mockEditor;
};

// Mock navigation history
export class MockNavigationHistory {
  constructor() {
    this.backStack = [];
    this.forwardStack = [];
    this.currentEntry = null;
  }

  push(entry) {
    if (this.currentEntry) {
      this.backStack.push(this.currentEntry);
    }
    this.currentEntry = entry;
    this.forwardStack = [];
  }

  canGoBack() {
    return this.backStack.length > 0;
  }

  canGoForward() {
    return this.forwardStack.length > 0;
  }

  back() {
    if (this.canGoBack()) {
      if (this.currentEntry) {
        this.forwardStack.push(this.currentEntry);
      }
      this.currentEntry = this.backStack.pop();
      return this.currentEntry;
    }
    return null;
  }

  forward() {
    if (this.canGoForward()) {
      if (this.currentEntry) {
        this.backStack.push(this.currentEntry);
      }
      this.currentEntry = this.forwardStack.pop();
      return this.currentEntry;
    }
    return null;
  }

  clear() {
    this.backStack = [];
    this.forwardStack = [];
    this.currentEntry = null;
  }

  getCurrent() {
    return this.currentEntry;
  }
}

// Mock autosave timer manager
export class MockAutosaveTimer {
  constructor() {
    this.timers = new Map();
    this.callbacks = new Map();
  }

  start(key, callback, delay = 2000) {
    this.stop(key);
    const timerId = setTimeout(() => {
      callback();
      this.timers.delete(key);
    }, delay);
    this.timers.set(key, timerId);
    this.callbacks.set(key, callback);
  }

  stop(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  stopAll() {
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    this.callbacks.clear();
  }

  // Test helper: manually trigger a timer
  async trigger(key) {
    if (this.callbacks.has(key)) {
      const callback = this.callbacks.get(key);
      this.stop(key);
      await callback();
    }
  }

  // Test helper: trigger all pending timers
  async triggerAll() {
    const callbacks = Array.from(this.callbacks.values());
    this.stopAll();
    for (const callback of callbacks) {
      await callback();
    }
  }

  hasPending(key) {
    return this.timers.has(key);
  }

  getPendingCount() {
    return this.timers.size;
  }
}

// Create global instances for tests
export const mockNavigationHistory = new MockNavigationHistory();
export const mockAutosaveTimer = new MockAutosaveTimer();

// Reset mocks before each test
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockNavigationHistory.clear();
  mockAutosaveTimer.stopAll();

  // Reset File System Access API mocks
  global.window.showDirectoryPicker = mockShowDirectoryPicker(null);
  global.window.showOpenFilePicker = mockShowOpenFilePicker([]);
  global.window.showSaveFilePicker = mockShowSaveFilePicker(null);

  // Reset Service Worker mocks
  serviceWorkerContainer._reset();
  cacheStorage._clear();
});
