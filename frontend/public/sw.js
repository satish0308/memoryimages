// MyMemoryPics Progressive Web App Service Worker
const CACHE_NAME = 'mymemorypics-v1.1';
const THUMBNAIL_CACHE = 'mymemorypics-thumbnails-v1';
const ALLOWED_CACHES = [CACHE_NAME, THUMBNAIL_CACHE];

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: Precache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!ALLOWED_CACHES.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Handles App Shell, Icons, and High-Speed CacheStorage for Thumbnails
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass non-GET requests and media range streams (video seek/scrubbing)
  if (event.request.method !== 'GET' || event.request.headers.get('range')) {
    return;
  }

  // 1. High-Performance Thumbnail & Preview CacheStorage Layer (Zero Network Overhead on Re-scroll)
  const isThumbnail = /^\/api\/v1\/media\/\d+\/(thumbnail|preview)/.test(url.pathname);
  if (isThumbnail) {
    event.respondWith(
      caches.open(THUMBNAIL_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (fetchErr) {
          return cached || new Response('Thumbnail unavailable offline', { status: 503 });
        }
      })
    );
    return;
  }

  // Bypass any other backend API endpoints (dynamic database queries, admin metrics, auth)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Cache-first for static icons and PWA manifest
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. Network-first with cache fallback for navigation / app shell
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('/');
        });
      })
  );
});
