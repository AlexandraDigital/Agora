// Service Worker for Agora PWA 
const CACHE_VERSION = "agora-v3"; 
const ASSET_CACHE = `${CACHE_VERSION}-assets`; 

self.addEventListener("install", (event) => { 
  console.log("Service Worker installing:", CACHE_VERSION); 
  event.waitUntil(self.skipWaiting()); 
}); 

self.addEventListener("activate", (event) => { 
  console.log("Service Worker activating:", CACHE_VERSION); 
  event.waitUntil( 
    caches.keys().then((cacheNames) => Promise.all( 
      cacheNames 
        .filter((name) => name !== ASSET_CACHE) 
        .map((name) => { 
          console.log("Deleting old cache:", name); 
          return caches.delete(name); 
        }) 
    ) ).then(() => self.clients.claim()) 
  ); 
}); 

self.addEventListener("fetch", (event) => { 
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
            caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, clone)); 
          } 
          return response; 
        }) 
        .catch(() => caches.match(event.request)) 
    ); 
    return; 
  } 

  // 3. manifest.json - Network-first, fallback to cache
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
          // 🔥 FIX: Welcome both basic local files and cross-origin CORS CDN files cleanly into cache
          const isAllowedType = response.type === "basic" || response.type === "cors";
          
          if (response && response.status === 200 && isAllowedType) { 
            const clone = response.clone(); 
            caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, clone)); 
          } 
          return response; 
        }) 
        .catch(() => { 
          if (event.request.destination === "document") { 
            return caches.match("/"); 
          } 
          return caches.match(event.request); 
        }); 
    }) 
  ); 
});
