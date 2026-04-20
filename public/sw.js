// Service Worker for Agora PWA
const CACHE_NAME = "agora-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json"
];

// Install event - cache essential files
self.addEventListener("install", (event) => {
  console.log("Service Worker installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Cache opened");
      return cache.addAll(urlsToCache).catch((err) => {
        console.log("Cache addAll error:", err);
        // Don't fail install if some resources are not available
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker activating...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log("Deleting cache:", cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Skip API requests - always go to network
  if (event.request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        console.log("Serving from cache:", event.request.url);
        return response;
      }

      return fetch(event.request)
        .then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === "error") {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache successful responses
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Network request failed, try to return a cached version
          return caches.match("/index.html");
        });
    })
  );
});
