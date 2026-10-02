const CACHE_NAME = 'avatar-g-shell-base';
// The manifest and its icons (app/manifest.ts — the one manifest; /manifest.json and the 180 px icon are gone).
const CORE_ASSETS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512.png',
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
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.png') {
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

// ⚠️ A notification only ever opens OUR site. The push payload's `url` is a path from our own server, but the worker
// trusts no payload: it is resolved against this origin, and anything that lands elsewhere (an absolute URL to another
// host, `//host`, `/\host`, `javascript:`) is dropped — the tap then behaves like a notification without a link.
function sameOriginUrl(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw, self.location.origin);
    return u.origin === self.location.origin ? u.href : null;
  } catch (_e) {
    return null;
  }
}

function pushText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// Web Push (lib/notifications/channels/push.ts → the browser's push service → here), payload `{ title, body, url, tag }`.
// EVERY push shows a notification: Chrome answers a silent one with its own "This site has been updated in the
// background", and Safari revokes the subscription after a few. Purely additive, like the click handler below: it does
// NOT touch CACHE_NAME or any caching/fetch logic.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    const parsed = event.data ? event.data.json() : null;
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch (_e) {
    try {
      data = { body: event.data ? event.data.text() : '' };
    } catch (_e2) {
      data = {};
    }
  }
  const options = {
    body: pushText(data.body, 300),
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: { url: sameOriginUrl(data.url) },
  };
  // Same tag = the OS replaces the earlier notification instead of stacking a duplicate.
  const tag = pushText(data.tag, 64);
  if (tag) options.tag = tag;
  event.waitUntil(
    self.registration.showNotification(pushText(data.title, 120) || 'MyAvatar.ge', options).catch(() => undefined),
  );
});

// PHASE 20 — native completion notifications, and Web Push. A tap on a notification WITHOUT a link (fired via
// registration.showNotification from lib/notify/browserNotify) focuses an already-open app window if there is one, else
// opens a fresh one — unchanged. A push WITH a link focuses a window already on that page, else opens the page in a new
// window: an open tab is never navigated away (it may hold a half-written prompt). Purely additive: it does NOT touch
// CACHE_NAME (stamped from the commit SHA by next.config.js) or any caching/fetch logic.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        if (target) {
          const path = new URL(target).pathname;
          for (const client of clientList) {
            let clientPath = null;
            try {
              clientPath = new URL(client.url).pathname;
            } catch (_e) {
              clientPath = null;
            }
            if (clientPath === path && 'focus' in client) return client.focus();
          }
          if (self.clients.openWindow) return self.clients.openWindow(target);
        }
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('/');
        return undefined;
      })
      .catch(() => undefined),
  );
});
