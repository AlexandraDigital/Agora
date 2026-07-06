// Service Worker for Agora PWA
// IMPORTANT: Change CACHE_VERSION on every deploy to bust stale caches.
const CACHE_VERSION = "agora-v3";
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// Install: Force the service worker to activate immediately
self.addEventListener("install", (event) => {
  console.log("Service Worker installing:", CACHE_VERSION);
  event.waitUntil(self.skipWaiting()); // Added event.waitUntil
});

// Activate: delete ALL old caches safely
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
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // 1. Cloudflare Pages /api/ routes MUST bypass service worker entirely
  if (url.pathname.startsWith("/api/")) return;

  // 2. HTML & Navigation requests (Network-first, fallback to cache)
  if (
    event.request.mode === "navigate" || 
    event.request.headers.get("accept")?.includes("text/html") || 
    url.pathname.endsWith(".html")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            // Cache under the exact request object used
            caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)) // Fallback to the specific cached page
    );
    return;
  }

  // 3. manifest.json - not hashed, rarely changes, but should stay fresh.
  // Network-first, fallback to cache (instead of cache-first like other static assets).
  if (url.pathname === "/manifest.json") {
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

  // 4. Static assets (Cache-first, fallback to network)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      
      return fetch(event.request)
        .then((response) => {
          // Cache successful responses
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Fallback: only substitute the cached index page for actual document
          // navigations/renders. For CSS/JS/other assets, try to match the exact
          // request again (in case of a race) rather than silently returning HTML,
          // which would otherwise look like a mystery styling bug later.
          if (event.request.destination === "document") {
            return caches.match("/");
          }
          return caches.match(event.request);
        });
    })
  );
});