// Service Worker for hotnote
// Provides offline functionality by caching app assets

const CACHE_NAME = 'hotnote-v5'; // Updated for AI model caching

// Install event - skip pre-caching, rely on runtime caching instead
// (Production files have hashed names that change with each build)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => {
      console.log('Service Worker installed, cache created');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event - network first, fallback to cache (for fresh content)
// Special handling for AI model files from HuggingFace and WebLLM
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Identify AI model files (HuggingFace and WebLLM CDN)
  const isModelFile =
    url.hostname === 'huggingface.co' ||
    url.hostname.includes('hf.co') ||
    url.hostname.includes('cdn-lfs.huggingface.co') ||
    url.hostname.includes('mlc.ai') ||
    url.pathname.includes('.onnx') ||
    url.pathname.includes('.safetensors') ||
    url.pathname.includes('.bin') ||
    url.pathname.includes('.wasm');

  // For model files: cache-first strategy (they don't change)
  // For app files: network-first strategy (keep fresh)
  if (isModelFile) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache - fetch from network and cache it
        return fetch(event.request).then((response) => {
          // Only cache successful responses
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      })
    );
  } else {
    // App files: network-first strategy
    event.respondWith(
      // Try network first
      fetch(event.request)
        .then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response to cache it
          const responseToCache = response.clone();

          // Update cache with fresh content
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Network failed - try to serve from cache
          return caches.match(event.request).then((response) => {
            if (response) {
              return response;
            }
            // If both cache and network fail, show offline message
            return new Response('Offline - please check your connection', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain',
              }),
            });
          });
        })
    );
  }
});
