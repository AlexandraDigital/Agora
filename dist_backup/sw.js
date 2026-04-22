// Service Worker for Agora PWA
// IMPORTANT: Change CACHE_VERSION on every deploy to bust stale caches.
const CACHE_VERSION = "agora-v2";
const ASSET_CACHE   = `${CACHE_VERSION}-assets`;

// Install: skip waiting so new SW activates immediately
self.addEventListener("install", (event) => {
  console.log("Service Worker installing:", CACHE_VERSION);
  self.skipWaiting();
});

// Activate: delete ALL old caches so stale JS bundles are never served
self.addEventListener("activate", (event) => {
  console.log("Service Worker activating:", CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== ASSET_CACHE)
          .map((name) => {
            console.log("Deleting old cache:", name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Always go to network for API calls
  if (url.pathname.startsWith("/api/")) return;

  // HTML pages: network-first so the app shell is always fresh after a deploy.
  // Falls back to cache only if offline.
  if (event.request.headers.get("accept")?.includes("text/html") ||
      url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (JS, CSS, images): cache-first for performance.
  // These have content-hashed filenames so stale files are not an issue.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type !== "error") {
          const clone = response.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match("/index.html"));
    })
  );
});

