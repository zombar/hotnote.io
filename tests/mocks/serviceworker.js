/**
 * Mock Service Worker API for testing
 * Provides mocks for ServiceWorker registration, Cache API, and related functionality
 */

export class MockCache {
  constructor(name) {
    this.name = name;
    this._storage = new Map();
  }

  async add(request) {
    const url = typeof request === 'string' ? request : request.url;
    // Simulate fetch
    const response = new Response('mock content', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
    this._storage.set(url, response.clone());
    return undefined;
  }

  async addAll(requests) {
    const promises = requests.map((request) => this.add(request));
    await Promise.all(promises);
  }

  async put(request, response) {
    const url = typeof request === 'string' ? request : request.url;
    this._storage.set(url, response.clone());
  }

  async match(request, options = {}) {
    const url = typeof request === 'string' ? request : request.url;

    if (this._storage.has(url)) {
      return this._storage.get(url).clone();
    }

    // Handle ignoreSearch option
    if (options.ignoreSearch) {
      const urlWithoutSearch = url.split('?')[0];
      for (const [cachedUrl, response] of this._storage.entries()) {
        if (cachedUrl.split('?')[0] === urlWithoutSearch) {
          return response.clone();
        }
      }
    }

    return undefined;
  }

  async matchAll(request, options = {}) {
    if (!request) {
      return Array.from(this._storage.values()).map((r) => r.clone());
    }

    const url = typeof request === 'string' ? request : request.url;
    const matches = [];

    for (const [cachedUrl, response] of this._storage.entries()) {
      if (cachedUrl === url) {
        matches.push(response.clone());
      } else if (options.ignoreSearch && cachedUrl.split('?')[0] === url.split('?')[0]) {
        matches.push(response.clone());
      }
    }

    return matches;
  }

  async delete(request, _options = {}) {
    const url = typeof request === 'string' ? request : request.url;
    return this._storage.delete(url);
  }

  async keys(request, options = {}) {
    if (!request) {
      return Array.from(this._storage.keys()).map((url) => new Request(url));
    }

    const url = typeof request === 'string' ? request : request.url;
    const keys = [];

    for (const cachedUrl of this._storage.keys()) {
      if (cachedUrl === url) {
        keys.push(new Request(cachedUrl));
      } else if (options.ignoreSearch && cachedUrl.split('?')[0] === url.split('?')[0]) {
        keys.push(new Request(cachedUrl));
      }
    }

    return keys;
  }

  // Helper methods for testing
  _clear() {
    this._storage.clear();
  }

  _has(url) {
    return this._storage.has(url);
  }

  _size() {
    return this._storage.size;
  }
}

export class MockCacheStorage {
  constructor() {
    this._caches = new Map();
  }

  async open(cacheName) {
    if (!this._caches.has(cacheName)) {
      this._caches.set(cacheName, new MockCache(cacheName));
    }
    return this._caches.get(cacheName);
  }

  async has(cacheName) {
    return this._caches.has(cacheName);
  }

  async delete(cacheName) {
    return this._caches.delete(cacheName);
  }

  async keys() {
    return Array.from(this._caches.keys());
  }

  async match(request, options = {}) {
    const url = typeof request === 'string' ? request : request.url;

    // Search through all caches
    for (const cache of this._caches.values()) {
      const response = await cache.match(url, options);
      if (response) {
        return response;
      }
    }

    return undefined;
  }

  // Helper methods for testing
  _clear() {
    this._caches.clear();
  }

  _getCache(name) {
    return this._caches.get(name);
  }
}

export class MockServiceWorker {
  constructor(scriptURL, _options = {}) {
    this.scriptURL = scriptURL;
    this.state = 'installing';
    this._eventListeners = new Map();
    this._scope = _options.scope || '/';
  }

  addEventListener(type, listener) {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, []);
    }
    this._eventListeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    if (this._eventListeners.has(type)) {
      const listeners = this._eventListeners.get(type);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  postMessage(message) {
    // Simulate message handling
    const event = new MessageEvent('message', { data: message });
    this._dispatchEvent(event);
  }

  _dispatchEvent(event) {
    const type = event.type;
    if (this._eventListeners.has(type)) {
      const listeners = this._eventListeners.get(type);
      listeners.forEach((listener) => listener(event));
    }
  }

  _setState(state) {
    this.state = state;
    this._dispatchEvent(new Event('statechange'));
  }
}

export class MockServiceWorkerRegistration {
  constructor(serviceWorker, options = {}) {
    this.installing = null;
    this.waiting = null;
    this.active = null;
    this.scope = options.scope || '/';
    this._eventListeners = new Map();
    this._timeouts = [];

    // Initial state
    this.installing = serviceWorker;

    // Simulate registration flow
    const timeout1 = setTimeout(() => {
      if (!this.installing) return; // Check if unregistered
      this.installing._setState('installed');
      this.waiting = this.installing;
      this.installing = null;

      const timeout2 = setTimeout(() => {
        if (!this.waiting) return; // Check if unregistered
        this.waiting._setState('activating');
        this.active = this.waiting;
        this.waiting = null;

        const timeout3 = setTimeout(() => {
          if (!this.active) return; // Check if unregistered
          this.active._setState('activated');
          this._dispatchEvent(new Event('controllerchange'));
        }, 10);
        this._timeouts.push(timeout3);
      }, 10);
      this._timeouts.push(timeout2);
    }, 10);
    this._timeouts.push(timeout1);
  }

  async update() {
    // Simulate update check
    return this;
  }

  async unregister() {
    // Clear all pending timeouts
    this._timeouts.forEach(clearTimeout);
    this._timeouts = [];

    this.installing = null;
    this.waiting = null;
    this.active = null;
    return true;
  }

  addEventListener(type, listener) {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, []);
    }
    this._eventListeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    if (this._eventListeners.has(type)) {
      const listeners = this._eventListeners.get(type);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  _dispatchEvent(event) {
    const type = event.type;
    if (this._eventListeners.has(type)) {
      const listeners = this._eventListeners.get(type);
      listeners.forEach((listener) => listener(event));
    }
  }
}

export class MockServiceWorkerContainer {
  constructor() {
    this.controller = null;
    this._eventListeners = new Map();
    this._registrations = new Map();
  }

  async register(scriptURL, options = {}) {
    const serviceWorker = new MockServiceWorker(scriptURL, options);
    const registration = new MockServiceWorkerRegistration(serviceWorker, options);

    const scope = options.scope || '/';
    this._registrations.set(scope, registration);

    // Update controller after activation
    setTimeout(() => {
      this.controller = registration.active;
      this._dispatchEvent(new Event('controllerchange'));
    }, 50);

    return registration;
  }

  async getRegistration(scope = '/') {
    return this._registrations.get(scope) || null;
  }

  async getRegistrations() {
    return Array.from(this._registrations.values());
  }

  async ready() {
    // Wait for an active service worker
    const registration = await this.getRegistration();
    if (registration && registration.active) {
      return registration;
    }

    // Poll until ready
    return new Promise((resolve) => {
      const checkReady = () => {
        this.getRegistration().then((reg) => {
          if (reg && reg.active) {
            resolve(reg);
          } else {
            setTimeout(checkReady, 10);
          }
        });
      };
      checkReady();
    });
  }

  addEventListener(type, listener) {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, []);
    }
    this._eventListeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    if (this._eventListeners.has(type)) {
      const listeners = this._eventListeners.get(type);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  _dispatchEvent(event) {
    const type = event.type;
    if (this._eventListeners.has(type)) {
      const listeners = this._eventListeners.get(type);
      listeners.forEach((listener) => listener(event));
    }
  }

  // Helper methods for testing
  _reset() {
    this.controller = null;
    this._registrations.clear();
  }
}

// Mock fetch event for service worker testing
export class MockFetchEvent extends Event {
  constructor(request) {
    super('fetch');
    this.request = request instanceof Request ? request : new Request(request);
    this._response = null;
    this._defaultPrevented = false;
  }

  respondWith(response) {
    this._response = Promise.resolve(response);
  }

  waitUntil(promise) {
    // Just consume the promise
    Promise.resolve(promise).catch(() => {});
  }

  preventDefault() {
    this._defaultPrevented = true;
  }
}

// Global mock setup
export function setupServiceWorkerMocks(global) {
  const cacheStorage = new MockCacheStorage();
  const serviceWorkerContainer = new MockServiceWorkerContainer();

  global.caches = cacheStorage;
  global.navigator.serviceWorker = serviceWorkerContainer;

  return {
    cacheStorage,
    serviceWorkerContainer,
  };
}

// Helper to simulate service worker lifecycle events
export async function simulateServiceWorkerInstall(registration, filesToCache = []) {
  const installEvent = new Event('install');
  const cache = await registration.active._cacheStorage.open('test-cache');

  installEvent.waitUntil = (promise) => Promise.resolve(promise);

  // Simulate caching files
  if (filesToCache.length > 0) {
    await cache.addAll(filesToCache);
  }

  return installEvent;
}

// Helper to simulate service worker fetch
export async function simulateServiceWorkerFetch(url, cacheStorage) {
  const request = new Request(url);
  const fetchEvent = new MockFetchEvent(request);

  // Try cache first
  const cachedResponse = await cacheStorage.match(request);
  if (cachedResponse) {
    fetchEvent.respondWith(cachedResponse);
    return fetchEvent;
  }

  // Simulate network fetch
  const networkResponse = new Response('network content', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
  fetchEvent.respondWith(networkResponse);

  return fetchEvent;
}
