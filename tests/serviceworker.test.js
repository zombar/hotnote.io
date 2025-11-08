import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheStorage, serviceWorkerContainer } from './setup.js';
import { MockFetchEvent, simulateServiceWorkerFetch } from './mocks/serviceworker.js';

describe('Service Worker Registration Tests', () => {
  beforeEach(() => {
    serviceWorkerContainer._reset();
    cacheStorage._clear();
  });

  it('should register service worker successfully', async () => {
    const registration = await serviceWorkerContainer.register('/sw.js');

    expect(registration).toBeDefined();
    expect(registration.scope).toBe('/');
  });

  it('should register service worker with custom scope', async () => {
    const registration = await serviceWorkerContainer.register('/sw.js', {
      scope: '/app/',
    });

    expect(registration.scope).toBe('/app/');
  });

  it('should set controller after service worker activation', async () => {
    await serviceWorkerContainer.register('/sw.js');

    // Wait for activation
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(serviceWorkerContainer.controller).not.toBeNull();
    expect(serviceWorkerContainer.controller.state).toBe('activated');
  });

  it('should get registration by scope', async () => {
    await serviceWorkerContainer.register('/sw.js');

    const registration = await serviceWorkerContainer.getRegistration('/');

    expect(registration).not.toBeNull();
  });

  it('should return null for non-existent registration', async () => {
    const registration = await serviceWorkerContainer.getRegistration('/nonexistent/');

    expect(registration).toBeNull();
  });

  it('should list all registrations', async () => {
    await serviceWorkerContainer.register('/sw.js', { scope: '/' });
    await serviceWorkerContainer.register('/app-sw.js', { scope: '/app/' });

    const registrations = await serviceWorkerContainer.getRegistrations();

    expect(registrations).toHaveLength(2);
  });

  it('should wait for service worker to be ready', async () => {
    const regPromise = serviceWorkerContainer.register('/sw.js');
    const readyPromise = serviceWorkerContainer.ready();

    await regPromise;
    const readyRegistration = await readyPromise;

    expect(readyRegistration).toBeDefined();
    expect(readyRegistration.active).not.toBeNull();
  });

  it('should unregister service worker', async () => {
    const registration = await serviceWorkerContainer.register('/sw.js');

    const success = await registration.unregister();

    expect(success).toBe(true);
    expect(registration.active).toBeNull();
  });
});

describe('Service Worker Cache Tests', () => {
  beforeEach(() => {
    cacheStorage._clear();
  });

  it('should create cache on install', async () => {
    const cacheName = 'hotnote-v1';
    const cache = await cacheStorage.open(cacheName);

    expect(cache).toBeDefined();
    expect(cache.name).toBe(cacheName);
  });

  it('should cache static assets during install', async () => {
    const cacheName = 'hotnote-v1';
    const cache = await cacheStorage.open(cacheName);

    const assetsToCache = [
      '/',
      '/index.html',
      '/style.css',
      '/app.js',
      '/core.js',
      '/markdown-editor.js',
      '/manifest.json',
    ];

    await cache.addAll(assetsToCache);

    expect(cache._size()).toBe(assetsToCache.length);
  });

  it('should cache individual assets', async () => {
    const cache = await cacheStorage.open('test-cache');

    await cache.add('/index.html');
    await cache.add('/style.css');

    expect(cache._has('/index.html')).toBe(true);
    expect(cache._has('/style.css')).toBe(true);
  });

  it('should retrieve cached responses', async () => {
    const cache = await cacheStorage.open('test-cache');

    await cache.add('/index.html');
    const response = await cache.match('/index.html');

    expect(response).toBeDefined();
    expect(response.status).toBe(200);
    expect(response.headers).toBeDefined();
  });

  it('should return undefined for non-cached resources', async () => {
    const cache = await cacheStorage.open('test-cache');

    const response = await cache.match('/non-existent.html');

    expect(response).toBeUndefined();
  });

  it('should put custom response in cache', async () => {
    const cache = await cacheStorage.open('test-cache');

    const customResponse = new Response('Custom content', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });

    await cache.put('/custom.html', customResponse);

    const cached = await cache.match('/custom.html');
    const text = await cached.text();

    expect(text).toBe('Custom content');
  });

  it('should delete cached responses', async () => {
    const cache = await cacheStorage.open('test-cache');

    await cache.add('/index.html');
    expect(cache._has('/index.html')).toBe(true);

    const deleted = await cache.delete('/index.html');

    expect(deleted).toBe(true);
    expect(cache._has('/index.html')).toBe(false);
  });

  it('should list all cache keys', async () => {
    const cache = await cacheStorage.open('test-cache');

    await cache.add('/index.html');
    await cache.add('/style.css');

    const keys = await cache.keys();

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeInstanceOf(Request);
  });

  it('should match responses across all caches', async () => {
    const cache1 = await cacheStorage.open('cache-v1');
    const cache2 = await cacheStorage.open('cache-v2');

    await cache1.add('/index.html');
    await cache2.add('/style.css');

    const response1 = await cacheStorage.match('/index.html');
    const response2 = await cacheStorage.match('/style.css');

    expect(response1).toBeDefined();
    expect(response2).toBeDefined();
  });

  it('should check if cache exists', async () => {
    await cacheStorage.open('existing-cache');

    const exists = await cacheStorage.has('existing-cache');
    const notExists = await cacheStorage.has('non-existent-cache');

    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  it('should delete cache by name', async () => {
    await cacheStorage.open('cache-to-delete');

    const deleted = await cacheStorage.delete('cache-to-delete');

    expect(deleted).toBe(true);
    expect(await cacheStorage.has('cache-to-delete')).toBe(false);
  });

  it('should list all cache names', async () => {
    await cacheStorage.open('cache-v1');
    await cacheStorage.open('cache-v2');
    await cacheStorage.open('cache-v3');

    const cacheNames = await cacheStorage.keys();

    expect(cacheNames).toHaveLength(3);
    expect(cacheNames).toContain('cache-v1');
    expect(cacheNames).toContain('cache-v2');
    expect(cacheNames).toContain('cache-v3');
  });
});

describe('Service Worker Fetch Strategy Tests', () => {
  beforeEach(() => {
    cacheStorage._clear();
  });

  it('should serve from cache when available (cache-first)', async () => {
    const cache = await cacheStorage.open('test-cache');
    const cachedResponse = new Response('Cached content', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });

    await cache.put('/index.html', cachedResponse);

    const response = await cacheStorage.match('/index.html');
    const text = await response.text();

    expect(text).toBe('Cached content');
  });

  it('should fall back to network when not in cache', async () => {
    const fetchEvent = await simulateServiceWorkerFetch('/new-resource.html', cacheStorage);

    expect(fetchEvent._response).toBeDefined();

    const response = await fetchEvent._response;
    const text = await response.text();

    expect(text).toBe('network content');
  });

  it('should handle fetch events correctly', async () => {
    const request = new Request('/index.html');
    const fetchEvent = new MockFetchEvent(request);

    const response = new Response('Response content');
    fetchEvent.respondWith(response);

    expect(fetchEvent._response).toBeDefined();

    const resolvedResponse = await fetchEvent._response;
    expect(resolvedResponse).toBe(response);
  });

  it('should match cache with ignoreSearch option', async () => {
    const cache = await cacheStorage.open('test-cache');

    await cache.add('/page.html?version=1');

    const response = await cache.match('/page.html', { ignoreSearch: true });

    expect(response).toBeDefined();
  });

  it('should cache network responses for future use', async () => {
    const cache = await cacheStorage.open('dynamic-cache');

    // Simulate network fetch and cache
    const networkResponse = new Response('Network content');
    await cache.put('/api/data.json', networkResponse);

    // Next request should come from cache
    const cachedResponse = await cache.match('/api/data.json');
    const text = await cachedResponse.text();

    expect(text).toBe('Network content');
  });
});

describe('Service Worker Lifecycle Tests', () => {
  beforeEach(() => {
    serviceWorkerContainer._reset();
    cacheStorage._clear();
  });

  it('should transition through installation states', async () => {
    const registration = await serviceWorkerContainer.register('/sw.js');

    expect(registration.installing).not.toBeNull();

    // Wait for state transitions
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(registration.installing).toBeNull();
    expect(registration.active).not.toBeNull();
  });

  it('should activate service worker after installation', async () => {
    const registration = await serviceWorkerContainer.register('/sw.js');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(registration.active).not.toBeNull();
    expect(registration.active.state).toBe('activated');
  });

  it('should clean up old caches on activation', async () => {
    const currentCache = 'hotnote-v2';
    const oldCaches = ['hotnote-v1', 'temp-cache'];

    // Create old caches
    for (const cacheName of oldCaches) {
      await cacheStorage.open(cacheName);
    }

    // Create current cache
    await cacheStorage.open(currentCache);

    expect(await cacheStorage.has('hotnote-v1')).toBe(true);

    // Simulate activation cleanup
    const cacheNames = await cacheStorage.keys();
    const cachesToDelete = cacheNames.filter((name) => name !== currentCache);

    for (const cacheName of cachesToDelete) {
      await cacheStorage.delete(cacheName);
    }

    expect(await cacheStorage.has('hotnote-v1')).toBe(false);
    expect(await cacheStorage.has('temp-cache')).toBe(false);
    expect(await cacheStorage.has(currentCache)).toBe(true);
  });

  it('should handle service worker update', async () => {
    const registration = await serviceWorkerContainer.register('/sw.js');

    await new Promise((resolve) => setTimeout(resolve, 50));

    const updatedRegistration = await registration.update();

    expect(updatedRegistration).toBe(registration);
  });

  it('should emit controllerchange event on activation', async () => {
    const controllerChangeHandler = vi.fn();
    serviceWorkerContainer.addEventListener('controllerchange', controllerChangeHandler);

    await serviceWorkerContainer.register('/sw.js');

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(controllerChangeHandler).toHaveBeenCalled();
  });
});

describe('Service Worker Offline Functionality Tests', () => {
  beforeEach(() => {
    cacheStorage._clear();
  });

  it('should serve app shell from cache when offline', async () => {
    const cache = await cacheStorage.open('hotnote-v1');

    const appShell = ['/index.html', '/style.css', '/app.js'];

    for (const asset of appShell) {
      await cache.add(asset);
    }

    // Simulate offline by checking cache only
    const indexResponse = await cache.match('/index.html');
    const cssResponse = await cache.match('/style.css');
    const jsResponse = await cache.match('/app.js');

    expect(indexResponse).toBeDefined();
    expect(cssResponse).toBeDefined();
    expect(jsResponse).toBeDefined();
  });

  it('should handle offline scenario gracefully', async () => {
    const cache = await cacheStorage.open('offline-cache');

    await cache.add('/index.html');

    // Try to fetch
    const cachedResponse = await cacheStorage.match('/index.html');

    if (!cachedResponse) {
      // Would show offline page or error
      expect(true).toBe(false); // Should not reach here
    } else {
      expect(cachedResponse).toBeDefined();
    }
  });

  it('should cache all critical assets for offline use', async () => {
    const cache = await cacheStorage.open('hotnote-v1');

    const criticalAssets = [
      '/',
      '/index.html',
      '/style.css',
      '/app.js',
      '/core.js',
      '/markdown-editor.js',
      '/sw.js',
      '/manifest.json',
    ];

    await cache.addAll(criticalAssets);

    // Verify all assets are cached
    for (const asset of criticalAssets) {
      const response = await cache.match(asset);
      expect(response).toBeDefined();
    }
  });
});

describe('Service Worker Cache Versioning Tests', () => {
  beforeEach(() => {
    cacheStorage._clear();
  });

  it('should use versioned cache names', async () => {
    const cacheVersion = 'v1';
    const cacheName = `hotnote-${cacheVersion}`;

    const cache = await cacheStorage.open(cacheName);

    expect(cache.name).toBe('hotnote-v1');
  });

  it('should migrate to new cache version', async () => {
    const oldCache = await cacheStorage.open('hotnote-v1');
    const newCache = await cacheStorage.open('hotnote-v2');

    await oldCache.add('/index.html');

    // Copy important assets to new cache
    const response = await oldCache.match('/index.html');
    await newCache.put('/index.html', response.clone());

    // Delete old cache
    await cacheStorage.delete('hotnote-v1');

    expect(await cacheStorage.has('hotnote-v1')).toBe(false);
    expect(await cacheStorage.has('hotnote-v2')).toBe(true);
  });

  it('should handle multiple cache versions during migration', async () => {
    await cacheStorage.open('hotnote-v1');
    await cacheStorage.open('hotnote-v2');
    await cacheStorage.open('hotnote-v3');

    const cacheNames = await cacheStorage.keys();

    expect(cacheNames).toHaveLength(3);

    // Keep only latest version
    const latestVersion = 'hotnote-v3';
    for (const name of cacheNames) {
      if (name !== latestVersion) {
        await cacheStorage.delete(name);
      }
    }

    const remainingCaches = await cacheStorage.keys();
    expect(remainingCaches).toHaveLength(1);
    expect(remainingCaches[0]).toBe(latestVersion);
  });
});
