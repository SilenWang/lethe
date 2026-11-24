# Eager runtime preload (P2)

Decision: no per-format lazy download.  The first online start caches the whole
runtime the current build can use; later cold starts never need the network to
open a format for the first time.

## Contract

`web/lib/runtime-config.js` is the single source of truth:

* `SUPPORTED_FORMATS` — the UI/worker formats (this branch: docx + pptx);
* `BETTEROFFICE_PACKAGES` — only packages the worker actually initialises
  (this branch: docx; pptx is part-direct);
* `PY_SOURCES` — the bundled Python modules;
* `PYODIDE_PACKAGES` — `lxml`; `cryptography` is deferred to a vault op.

Both `web/worker/pyodide_worker.js` and `web/sw.js` import it.  `web-check`
fails if an xlsx BetterOffice bundle is added back, if a supported format lacks
its engine module, or if the two Pyodide wheels drift.

## First online start

The page registers the module service worker, waits for it to activate, then
sends `PRECACHE`.  The SW reads `assets/vendor/manifest.json`, selects:

* the full Pyodide directory (wasm, stdlib, lock, lxml/cryptography wheels);
* the vendored BetterOffice `docx` directory (pptx is not used);
* `/py/lethe/*.py` and `/py/tools/*.py`.

It fetches each entry once, puts it in `lethe-p1-runtime-*`, and posts
`precache-progress` / `precache-done` / `precache-error` messages.  The UI
shows a progress bar and a retry button; the worker is created only after the
precache settles.  The worker eagerly initialises Pyodide and lxml before
posting `ready`; cryptography loads on the first vault op, docx on the first
docx, and pptx never needs a BetterOffice module.

## Cold start

If `navigator.onLine` is false, the page skips `PRECACHE` and starts the worker
immediately.  The SW serves every runtime request from the runtime cache.  A
missing cache entry is a hard failure, never a silent network fallback.

Acceptance for this branch: clear caches → online start once → completely
offline reload → redact/restore docx and pptx; both succeed with zero external
requests.  `tests/browser/test_p1_dod.py` runs exactly that sequence.

### 50MB absolute RSS (pptx part-direct)

PPTX no longer builds a BetterOffice presentation model.  Redact-only
measurements:

| Fixture | Baseline | Peak | Delta | Pyodide heap | Abort |
|---|---:|---:|---:|---:|---|
| 49.1 MB / 506 hits | 1,098 MB | **1,542 MB** | 444 MB | 391 MB | no |
| 49.3 MB / 10,101 hits | 1,098 MB | **1,620 MB** | 521 MB | 393 MB | no |

Both pass the unchanged **absolute ≤2.5 GB** gate with 880–959 MB headroom.

## Merged P2/P3

After the xlsx and pptx branches merge, `runtime-config.js` becomes:

```js
SUPPORTED_FORMATS = ["docx", "xlsx", "pptx"]
BETTEROFFICE_PACKAGES = ["docx"]
PY_SOURCES = [...core, docx_engine, xlsx_engine, pptx_engine, ...]
```

PPTX is part-direct; xlsx is part-direct; only docx uses BetterOffice.
The merged offline DoD then processes all three formats from one cold start.
See `docs/p3/offline-dod.md` for the remaining work and estimate.
