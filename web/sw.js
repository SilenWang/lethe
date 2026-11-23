/*
 * Lethe — service worker for the static P1 app (web/). The frozen v1 NiceGUI
 * app keeps its own worker at lethe/web_static/sw.js; P3 removes that one.
 *
 * PRIVACY BOUNDARY — what may enter CacheStorage:
 *   1. the app shell: exact same-origin paths listed in SHELL_PATHS;
 *   2. the vendored runtimes (Pyodide, BetterOffice, /py/ modules) requested
 *      by the document worker. They are cached lazily, per format: a docx run
 *      caches the Pyodide + BetterOffice docx assets, and nothing else.
 * Anything else — uploaded documents, extracted text, de-identified or
 * restored files, token maps, IndexedDB data, /api/*, non-GET, ranged reads
 * — is passed straight to the network and never cached. Documents are read
 * with arrayBuffer in the page, so they never reach this fetch handler.
 *
 * VERSIONING: the cache name carries the release version (?v=, falling back
 * to the rule version). activate() drops every older lethe-* cache, so a new
 * release can never serve a stale shell.
 */
'use strict';

var CACHE_VERSION = '3';
var APP_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
var SHELL_CACHE = 'lethe-p1-shell-v' + APP_VERSION + '-r' + CACHE_VERSION;
var RUNTIME_CACHE = 'lethe-p1-runtime-v' + APP_VERSION + '-r' + CACHE_VERSION;

// The complete shell allow-list, relative to the app root.
var SHELL_PATHS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/client-store.js',
  '/ui/app.js',
  '/ui/app.css',
  '/ui/i18n.js',
  '/ui/format.js',
  '/ui/store.js',
  '/ui/favicon.svg',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-512-maskable.png',
  '/lib/pyodide_bridge.js',
  '/lib/protocol.js',
  '/worker/pyodide_worker.js',
  '/locales/en.json',
  '/locales/zh.json'
];

// Same-origin asset prefixes cached on demand (never precached wholesale, so
// pptx bundles are not downloaded until a run actually needs them; xlsx is
// handled by the Python part-direct engine and needs no BetterOffice bundle).
var RUNTIME_PREFIXES = [
  '/assets/vendor/pyodide/',
  '/assets/vendor/betteroffice/',
  '/py/'
];

function isShell(pathname) {
  return SHELL_PATHS.indexOf(pathname) !== -1;
}

function isRuntimeAsset(pathname) {
  return RUNTIME_PREFIXES.some(function (prefix) {
    return pathname.indexOf(prefix) === 0;
  });
}

// The privacy boundary, in one predicate. User documents/results never match:
// they are not shell paths and not under the vendored asset prefixes.
function cachePolicy(request) {
  if (request.method !== 'GET') return null;
  if (request.headers.has('range')) return null;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (isShell(url.pathname)) return 'shell';
  if (isRuntimeAsset(url.pathname)) return 'runtime';
  return null;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        // cache: 'reload' bypasses the HTTP cache so the precache holds the
        // bytes this release actually ships.
        return cache.addAll(
          SHELL_PATHS.map(function (path) {
            return new Request(path, { cache: 'reload' });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf('lethe-') === 0 && key !== SHELL_CACHE && key !== RUNTIME_CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var policy = cachePolicy(event.request);
  if (!policy) return; // never respondWith: the browser goes to the network
  event.respondWith(serve(event.request, policy === 'shell' ? SHELL_CACHE : RUNTIME_CACHE));
});

// Cache-first with a background refresh: offline works immediately, while the
// next visit gets the current copy.
function serve(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var network = fetch(request, { cache: 'no-cache' })
        .then(function (response) {
          if (response && response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(function () {
          return cached;
        });
      return cached || network;
    });
  });
}
