const CACHE_NAME = 'avatar-g-shell-v117';
const CORE_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-180x180.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Cache one request/response pair, swallowing any failure. cache.put() throws a
// TypeError / "string did not match the expected pattern" DOMException on
// unsupported schemes (blob:/data:/chrome-extension:), 206 partials, or quota
// pressure — none of which must ever reject the caller or surface as an
// unhandled rejection that wedges the SW lifecycle.
function safeCachePut(cache, request, response) {
  try {
    return cache.put(request, response).catch(() => {});
  } catch (_e) {
    return Promise.resolve();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // RESILIENT pre-cache: a single missing/renamed core asset must NEVER fail
      // the whole install. A failed install leaves the previous SW in control,
      // which can keep serving stale (broken) JS/HTML to every client — the
      // classic "a bad deploy froze the whole app" trap. allSettled + per-asset
      // catch guarantees activation proceeds even if an asset 404s.
      .then((cache) =>
        Promise.allSettled(
          CORE_ASSETS.map((asset) =>
            fetch(asset, { cache: 'no-cache' })
              .then((res) => (res && res.ok ? safeCachePut(cache, asset, res) : undefined))
              .catch(() => undefined),
          ),
        ),
      )
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function shouldHandleRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (!shouldHandleRequest(request, url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => safeCachePut(cache, request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/offline.html');
        }),
    );
    return;
  }

  const destination = request.destination;

  // Large media (video/audio): pass straight through to the network so the
  // browser can serve Range requests natively. Never SW-cache these — caching
  // breaks range streaming and bloats storage on native iOS app wrappers.
  if (destination === 'video' || destination === 'audio') {
    return;
  }

  // App-shell icons: cache-first for instant standalone launch. These are
  // immutable, versioned assets, so a cached copy is always safe; we still
  // revalidate in the background to pick up a new icon set on next load.
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json' || url.pathname === '/favicon.png') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => safeCachePut(cache, request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  if (destination === 'style' || destination === 'script') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => safeCachePut(cache, request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  if (destination === 'image' || destination === 'font') {
    // Network-first (was cache-first): always fetch fresh when online so updated
    // avatar posters / assets are never masked by a stale cached copy; fall back
    // to cache only when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => safeCachePut(cache, request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
  }
});
