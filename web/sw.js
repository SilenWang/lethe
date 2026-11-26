import {
  BETTEROFFICE_PACKAGES,
  PY_SOURCES,
  TOOL_SOURCES,
} from "./lib/runtime-config.js";
import {
  DICTIONARY_MANIFEST_PATH,
  DICTIONARY_SIGNATURE_PATH,
} from "./lib/dictionary-config.js";

/*
 * Lethe — service worker for the static P1 app (web/). The frozen v1 NiceGUI
 * app keeps its own worker at lethe/web_static/sw.js; P3 removes that one.
 *
 * PRIVACY BOUNDARY — what may enter CacheStorage:
 *   1. the app shell: exact same-origin paths listed in SHELL_PATHS;
 *   2. the vendored runtimes (Pyodide, lxml/cryptography, the BetterOffice
 *      packages the worker actually initialises, and /py/ modules). The app
 *      asks the SW to pre-cache the complete set on the first online start;
 *      there is no "download this format on first use" branch.
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

var CACHE_VERSION = '8';
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
  '/ui/task-model.js',
  '/ui/favicon.svg',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-512-maskable.png',
  '/lib/pyodide_bridge.js',
  '/lib/protocol.js',
  '/lib/runtime-config.js',
  '/lib/dictionary-client.js',
  '/lib/dictionary-config.js',
  '/lib/dictionary-merge.js',
  '/worker/pyodide_worker.js',
  '/locales/en.json',
  '/locales/zh.json'
];

// Same-origin asset prefixes the worker may read.  Everything the worker
// actually needs is pre-cached by PRECACHE below; the fetch handler still
// cache-fills as a safety net.
var RUNTIME_PREFIXES = [
  '/assets/vendor/pyodide/',
  '/assets/vendor/betteroffice/',
  '/dictionary/',
  '/py/'
];

var precachePromise = null;

async function runtimePaths() {
  var manifest = await (await fetch('/assets/vendor/manifest.json', { cache: 'no-cache' })).json();
  var dictionaryResponse = await fetch(DICTIONARY_MANIFEST_PATH, { cache: 'no-cache' });
  if (!dictionaryResponse.ok) {
    throw new Error(DICTIONARY_MANIFEST_PATH + ': HTTP ' + dictionaryResponse.status);
  }
  var dictionary = await dictionaryResponse.json();
  var paths = manifest.files
    .map(function (item) { return '/assets/vendor/' + item.path; })
    .filter(function (path) {
      if (path.indexOf('/assets/vendor/pyodide/') === 0) return true;
      return BETTEROFFICE_PACKAGES.some(function (pkg) {
        return path.indexOf('/assets/vendor/betteroffice/' + pkg + '/') === 0;
      });
    });
  paths.push('/assets/vendor/manifest.json', '/assets/vendor/VERSIONS.json');
  paths.push(DICTIONARY_MANIFEST_PATH, DICTIONARY_SIGNATURE_PATH);
  dictionary.shards
    .filter(function (shard) { return dictionary.coreShards.indexOf(shard.id) !== -1; })
    .forEach(function (shard) { paths.push('/dictionary/' + shard.path); });
  PY_SOURCES.forEach(function (name) { paths.push('/py/lethe/' + name); });
  TOOL_SOURCES.forEach(function (name) { paths.push('/py/tools/' + name); });
  return Array.from(new Set(paths));
}

function precacheRuntime() {
  if (precachePromise) return precachePromise;
  precachePromise = (async function () {
    var clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    var notify = function (message) {
      clients.forEach(function (client) { client.postMessage(message); });
    };
    try {
      var paths = await runtimePaths();
      var cache = await caches.open(RUNTIME_CACHE);
      var done = 0;
      for (var path of paths) {
        var cached = await cache.match(path);
        if (!cached) {
          var response = await fetch(path, { cache: 'reload' });
          if (!response || !response.ok) {
            throw new Error(path + ': HTTP ' + (response ? response.status : 'no response'));
          }
          await cache.put(path, response.clone());
        }
        done += 1;
        notify({ type: 'precache-progress', done: done, total: paths.length, path: path });
      }
      notify({ type: 'precache-done', done: done, total: paths.length });
    } catch (error) {
      notify({ type: 'precache-error', message: String(error && error.message || error) });
      throw error;
    }
  })().finally(function () { precachePromise = null; });
  return precachePromise;
}

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
  if (event.data && event.data.type === 'PRECACHE') event.waitUntil(precacheRuntime());
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
