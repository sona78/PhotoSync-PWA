/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'photosync-pwa-v3'; // Fixed service worker intercepting external requests
const urlsToCache = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json'
];

// Install service worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Listen for skip waiting message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting requested');
    self.skipWaiting();
  }
});

// Fetch from cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip service worker entirely for:
  // 1. External API requests (Supabase, signaling server, etc.)
  // 2. WebSocket connections
  // 3. Chrome extension requests
  // 4. POST/PUT/DELETE requests (only cache GET requests)
  const shouldSkip =
    url.origin !== self.location.origin || // External requests
    url.protocol === 'ws:' || url.protocol === 'wss:' || // WebSockets
    url.protocol === 'chrome-extension:' || // Browser extensions
    event.request.method !== 'GET'; // Non-GET requests

  if (shouldSkip) {
    // Don't intercept - let browser handle normally
    return;
  }

  // For same-origin requests, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch and optionally cache
        return fetch(event.request).then((response) => {
          // Only cache successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clone the response before caching
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        }).catch(() => {
          // Network failed, return offline page or cached version
          return caches.match('/index.html');
        });
      })
  );
});

// Update service worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      console.log('[SW] Service worker activated and claiming clients');
      return self.clients.claim();
    })
  );
});
