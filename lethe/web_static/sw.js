/*
 * Lethe — service worker (PWA shell cache).
 *
 * SCOPE OF THIS CACHE — the privacy boundary:
 *   It caches ONLY the app's own static assets (the JS/icon/font/manifest
 *   shell, listed in STATIC_PATHS below). It never caches user data:
 *   uploaded documents, extracted text, de-identified/restored files, the
 *   token -> real mappings, or any /api/migrate/* response are NOT cached —
 *   they never even enter this worker, because user documents travel over the
 *   NiceGUI WebSocket (and the migration endpoints are POST to /api/*, which
 *   the fetch handler leaves entirely alone).
 *
 *   Concretely: only same-origin GET requests whose path is in the exact
 *   whitelist below are answered from the cache. Everything else — the page
 *   HTML itself (session-specific, served dynamically by NiceGUI), /api/*,
 *   WebSocket traffic, any POST/PUT/DELETE, any ranged read — is passed
 *   straight to the network untouched.
 *
 * VERSIONING — how updates invalidate the cache:
 *   1. app.py registers this script as /sw.js?v=<APP_VERSION>, so every app
 *      release requests a different script URL and the browser installs the
 *      new worker. The server sends Cache-Control: no-store for /sw.js, so the
 *      bytes are re-checked on every update check rather than served stale.
 *   2. The cache name is derived from that same version ("lethe-static-v<v>-r<n>"),
 *      so activate() drops the previous release's cache wholesale — a new
 *      release can never serve a stale shell.
 *   3. Pre-caching bypasses the HTTP cache (cache: 'reload'), and the
 *      background revalidation revalidates with the server (cache: 'no-cache'),
 *      so a changed asset is picked up even without a version bump.
 *   Bump CACHE_VERSION when the caching rules below change without an app
 *   version bump.
 */
'use strict';

var CACHE_VERSION = '1';
var APP_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
var CACHE_NAME = 'lethe-static-v' + APP_VERSION + '-r' + CACHE_VERSION;

// The complete set of cacheable URLs, relative to the app root. Keep this in
// sync with the assets registered in app.py / referenced by manifest.webmanifest.
var STATIC_PATHS = [
  '/static/client-store.js',
  '/static/migration.js',
  '/static/favicon.svg',
  '/static/fonts/cinzel-latin.woff2',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-512-maskable.png',
  '/manifest.webmanifest'
];

// ---- the privacy boundary, in one predicate ------------------------------
function isCacheable(request) {
  if (request.method !== 'GET') return false;                 // never POST/PUT/DELETE
  if (request.headers.has('range')) return false;             // partial/streamed reads
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;      // same-origin only
  return STATIC_PATHS.indexOf(url.pathname) !== -1;           // exact whitelist
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // cache: 'reload' bypasses the HTTP cache, so the pre-cache always
        // holds the copy this release actually ships.
        return cache.addAll(STATIC_PATHS.map(function (path) {
          return new Request(path, { cache: 'reload' });
        }));
      })
      .then(function () {
        return self.skipWaiting();          // take over on the next page load
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (key) {
          // Drop previous Lethe releases only — never other caches.
          return key.indexOf('lethe-static-') === 0 && key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        }));
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  // Anything outside the static whitelist (user documents and results, the
  // page HTML, /api/migrate/*, WebSockets, every non-GET) is never handled
  // here: no respondWith() means the browser goes straight to the network.
  if (!isCacheable(request)) return;
  event.respondWith(handleStatic(request));
});

// Cache-first with a background revalidation: the shell loads instantly (and
// still works offline), while the network copy refreshes the cache for the
// next visit.
function handleStatic(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var fromNetwork = fetch(request, { cache: 'no-cache' }).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () {
        return cached;                      // offline: fall back to the cache
      });
      return cached || fromNetwork;
    });
  });
}