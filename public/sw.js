// Service Worker for Agora PWA 
// IMPORTANT: Change CACHE_VERSION on every deploy to bust stale caches. 
const CACHE_VERSION = "agora-v4"; // Incremented to v4 to clear old broken setups
const ASSET_CACHE = `${CACHE_VERSION}-assets`; 

// Install: Force the service worker to activate immediately
self.addEventListener("install", (event) => { 
  console.log("Service Worker installing:", CACHE_VERSION); 
  event.waitUntil(self.skipWaiting()); 
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
            caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, clone)); 
          } 
          return response; 
        }) 
        .catch(() => caches.match(event.request) || caches.match("/")) 
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
          // FIX #1: Removed response.type === "basic" so Google Fonts / CDN assets can cache
          if (response && response.status === 200) { 
            const clone = response.clone(); 
            caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, clone)); 
          } 
          return response; 
        }) 
        .catch(() => { 
          // FIX #2: Safely handle asset load failures based on destination type
          if (event.request.destination === "document") { 
            return caches.match("/"); 
          }
          // Never return a page/HTML fallback for JS, CSS, or image assets.
          // This prevents the "Unexpected token '<'" parsing crashes.
          return new Response("Asset unavailable offline", {
            status: 404,
            statusText: "Not Found",
            headers: new Headers({ "Content-Type": "text/plain" })
          });
        }); 
    }) 
  ); 
});
