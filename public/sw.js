// Service Worker for Agora PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Basic offline fallback
self.addEventListener('fetch', (event) => {
  // Let normal requests go through
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).catch(() => {
      return fetch(event.request);
    })
  );
});