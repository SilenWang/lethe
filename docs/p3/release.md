# Release, offline deployment and known degradation

## Static release artifact

The production artifact is the directory produced by:

```text
pixi run web-build
```

It is written to `dist/web` and is a complete same-origin static site. On the
current baseline it contains 198 files and about 52 MiB, including 154 pinned
vendor files (53,652,823 bytes). Its deployment shape is:

```text
dist/web/
  index.html  manifest.webmanifest  sw.js  client-store.js
  ui/         lib/        worker/       py/
  locales/    static/     dictionary/  assets/vendor/
```

Publish the whole directory. It is not an SPA that can fetch files from a CDN,
a second origin or a parent directory. The service worker and worker code use
root-relative paths, so deploy at the origin root. Missing files are errors, not
routes to another HTML page.

### HTTPS and MIME requirements

- Serve over HTTPS, or from `http://localhost` for local verification. Service
  workers, OPFS, WebCrypto and installability require a secure context.
- Serve `.mjs`/`.js` as `text/javascript`, `.wasm` as `application/wasm`,
  `.json` as `application/json`, `.whl` as `application/octet-stream`, and
  `.gz` as `application/gzip` (or `application/x-gzip`).
- Send `Cache-Control: no-cache` for `/sw.js` and `/index.html` so deployment
  checks can observe a new release. The service worker supplies the versioned
  shell/runtime caches.
- Do not cache `/api/*`, uploaded documents, extracted text, results or token
  maps at the reverse proxy. The P3 app has no document API, but the same
  origin may still host the frozen v1 app until cutover.

Keep releases immutable and retain at least the current and previous trees:

```text
/srv/lethe/releases/<release-id>/...
/srv/lethe/current -> releases/<release-id>
```

Publish into a new release directory, verify it, then atomically replace the
`current` symlink. Do not overwrite the files of a release that users may still
have open.

Before building a release, bump `CACHE_VERSION` in `web/sw.js` whenever any
shell, runtime asset or worker source changes. The static app currently
registers `/sw.js` directly, so `CACHE_VERSION` is the reliable cache
invalidation key. Do not rely on users clearing site data.

## Runtime load policy

The first online start caches every runtime asset this release can use:
Pyodide, the lxml and cryptography wheels, all Python sources, and the
BetterOffice docx bundle.  There is no per-format download branch.  Pyodide,
lxml and the Python sources initialise with the worker; docx BetterOffice
initialises on the first docx operation, cryptography on the first vault
operation, and xlsx/pptx never initialise BetterOffice.

The cached assets are served from the same origin.  Uploaded documents,
extracted text, results, token maps and IndexedDB data never enter
CacheStorage.

The signed preset dictionary is part of the same eager pre-cache contract:
`/dictionary/manifest.json`, `/dictionary/manifest.sig` and the gzip shards
listed in `coreShards`.  The core is capped at 150 KiB; the complete optional
set is capped at 8 MiB.  `docs/p3/dictionary-distribution.md` defines the
signature, content-addressed shard, OPFS activation and rollback rules.

## Cold start and release upgrade

After the first successful online precache, a fully offline reload starts the
worker from cache and can process docx, xlsx and pptx in sequence without a
network request.  A missing runtime-cache entry is an error; there is no
silent network fallback.

The service worker has separate shell and runtime caches named with
`APP_VERSION` and `CACHE_VERSION`. The static app does not append a query
version when registering the worker, so `APP_VERSION` remains `dev`; every
static release must bump `CACHE_VERSION` (currently `7`). Activation deletes
all older `lethe-*` caches, then claims the current clients. A failed precache
leaves the progress/error UI visible and exposes retry; the next successful
attempt writes the new release cache.

Changing `web/assets/vendor/VERSIONS.json` or
`web/assets/vendor/manifest.json` is the trigger to rerun the complete
`fidelity-corpus` gate.  The asset guard rejects version drift, unpinned files,
CDN references and micropip.

### Upgrade procedure

1. Build and verify the new immutable release tree:

   ```text
   pixi run release-check
   pixi run web-build
   ```

2. Copy `dist/web` to `/srv/lethe/releases/<new-release>`.
3. Atomically point `/srv/lethe/current` at the new release.
4. Open the app online once and wait for the preload/offline-ready indication.
5. Reload once and confirm the new cache names are active and old `lethe-*`
   caches are gone.
6. Disable the network and complete the three-format acceptance run below.
7. Keep the previous release tree until the upgrade has been accepted.

IndexedDB and OPFS are origin-scoped. Upgrading the static files at the same
origin preserves user entities, results and the active/previous signed
dictionary packs. Changing host, port or scheme creates a different origin and
will appear as empty user data.

### Rollback procedure

1. Point `/srv/lethe/current` back to the retained previous release directory.
2. Open the app online once so the browser installs the previous `sw.js` and
   repopulates its versioned caches.
3. Reload and confirm the previous cache names are active.
4. Disable the network and repeat the three-format acceptance run.
5. Do not clear site data as part of rollback. The current IndexedDB schema is
   additive and the same-origin user layer must survive an app rollback.

The signed preset dictionary has its own two-slot OPFS rollback: the client can
activate the retained previous pack without rolling back the static app. See
`docs/p3/dictionary-distribution.md`.

## Fidelity gate

`pixi run fidelity-corpus` checks all 90 corpus files:

1. the source part set, decompressed sha256 and original compressed streams;
2. C14N structure, allowing only text-bearing node/attribute changes;
3. a zero-leak scan and character-exact restore text;
4. LibreOffice PDF render SSIM `>= 0.999`, with repair/corruption log lines
   treated as failures;
5. the 50 MB time/absolute-RSS matrix recorded in `runtime-50mb.json`.

The renderer is pinned by `tools/fidelity-render.Dockerfile` (LibreOffice +
Poppler on Ubuntu 24.04).  The task builds that local image and renders
offline, so the corpus gate does not depend on an unversioned host office
install.

The one documented structural exception is an xlsx shared-string split.  When
only some cells referencing an SST entry are hit, redaction appends a token
`<si>` and reindexes only the hit cells.  Existing `<si>` structure stays
unchanged and non-hit cells keep the original string; the unit test
`test_shared_string_split_keeps_non_hit_reference` covers it.

## 50 MB memory gates

| Format | Absolute peak RSS gate |
|---|---:|
| docx | ≤2.5 GB |
| xlsx | ≤2 GB |
| pptx | ≤2.5 GB |

The committed `runtime-50mb.json` is generated by `pixi run measure-50mb`
and checked by `fidelity-corpus`.  The gate is absolute process-tree RSS, not
Pyodide heap alone, and no format may raise it.

| Format | Fixture / hits | Redact | Baseline | Peak | Headroom |
|---|---:|---:|---:|---:|---:|
| docx | 52,230,244 B / 35 | 2.9 s | 1,108 MB | **2,050 MB** | 510 MB |
| xlsx | 52,198,922 B / 250,001 | 33.1 s | 1,118 MB | **1,870 MB** | 178 MB |
| pptx | 51,437,965 B / 506 | 1.0 s | 1,118 MB | **1,634 MB** | 926 MB |

These are whole process-tree RSS peaks, including the browser and worker, not
only the Pyodide heap.

## File-size and machine limits

- Files over 35 MB show a warning and remain processable.
- Files over 50 MB are rejected before document libraries open them.
- The 90-file fidelity gate keeps the 50 MB absolute peak at or below 2.5 GB
  for docx/pptx and 2 GB for xlsx.
- For deployment planning, reserve about 3.5 GB of transient RSS headroom for a
  50 MB docx, including browser and OS overhead. This is deliberately more
  conservative than the gate measurement and allows for allocator variance.
- Intranet workstations should have at least 16 GB RAM.
- On an 8 GB machine, limit files to 20 MB or less and process only xlsx/pptx.
  Do not use 50 MB docx workloads on 8 GB machines.

## Worker lifecycle

The app deliberately uses one document Worker and one in-flight operation:

- uploads are processed sequentially; a second operation receives `BUSY`
  instead of starting a second Worker;
- the UI disables processing controls while a run is active;
- an input document larger than 35 MB triggers Worker teardown and rebuild after
  its result is delivered;
- OOM, crash, watchdog timeout and cancellation after dispatch also recycle the
  Worker;
- after a large task, wait for the runtime badge to return to ready before
  starting the next file.

Do not batch several large documents concurrently in one browser profile.

## Offline acceptance

The automated acceptance path is:

```text
pixi run release-check
pixi run release-offline
```

`release-offline` is the P1 DoD suite. It clears caches, starts online once,
cuts the network, reloads from the service worker, then redacts and restores
docx, xlsx and pptx fixtures. It asserts zero leaked names, character-identical
restored text parts, no external requests, offline cryptography load, and the
20 MB / 50 MB / repeated-35 MB memory and Worker-recycle gates.

For a release-candidate sign-off, repeat this manual path in a clean Chromium
profile against the HTTPS static origin:

1. Clear site data, open the release online and wait for the preload progress
   to finish with the offline-ready message.
2. Close and reopen the installed PWA while online once; confirm it reaches
   runtime ready without an HTTP error.
3. Set DevTools Network to Offline, then reload. The app shell and Worker must
   still initialise.
4. Upload one docx, one xlsx and one pptx containing known dictionary names.
   For each: inspect, detect, generate/download the redacted file, then restore
   it using the saved conversion.
5. Verify the redacted files contain no known source names and the restored
   text matches the originals. Open the files in Office/LibreOffice and confirm
   there is no repair prompt.
6. Confirm the Network panel recorded no successful external request and that
   CacheStorage contains only same-origin shell/runtime assets.
7. Record the release SHA, browser version, sample SHA-256 values and the
   observed memory figures with the release evidence.
8. Repeat after an online upgrade and after rollback to the previous release;
   user entities and saved conversions must remain visible and usable.

## Known degradation

- xlsx: pivot caches, chart numeric caches, SmartArt, OLE embeddings,
  external-link caches and formula literals (`<f>`) are not redacted.  Formula
  cached strings (`t="str"` `<v>`) are redacted.
- pptx: chart caches, SmartArt, OLE embeddings and text baked into images are
  not redacted.
- Neither writer changes `[Content_Types].xml`, relationships, `calcChain.xml`
  or unedited parts.  Visual comparison applies to the restored file; the
  redacted file intentionally differs where tokens replace visible text.
