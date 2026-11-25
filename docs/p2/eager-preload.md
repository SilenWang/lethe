# Eager runtime preload (P2)

Decision: no per-format lazy download.  The first online start caches the whole
runtime the current build can use; later cold starts never need the network to
open a format for the first time.

## Contract

`web/lib/runtime-config.js` is the single source of truth:

* `SUPPORTED_FORMATS` — the UI/worker formats (this branch: docx + xlsx);
* `BETTEROFFICE_PACKAGES` — only packages the worker actually initialises
  (this branch: docx; xlsx is part-direct);
* `PY_SOURCES` — the bundled Python modules;
* `PYODIDE_PACKAGES` — `lxml` and `cryptography`.

Both `web/worker/pyodide_worker.js` and `web/sw.js` import it.  `web-check`
fails if an xlsx BetterOffice bundle is added back, if a supported format lacks
its engine module, or if the two Pyodide wheels drift.

## First online start

The page registers the module service worker, waits for it to activate, then
sends `PRECACHE`.  The SW reads `assets/vendor/manifest.json`, selects:

* the full Pyodide directory (wasm, stdlib, lock, lxml/cryptography wheels);
* the vendored BetterOffice `docx` directory;
* `/py/lethe/*.py` and `/py/tools/*.py`.

It fetches each entry once, puts it in `lethe-p1-runtime-*`, and posts
`precache-progress` / `precache-done` / `precache-error` messages.  The UI
shows a progress bar and a retry button; the worker is created only after the
precache settles.  The worker then eagerly initialises Pyodide, lxml,
cryptography and BetterOffice docx before posting `ready`; its phases are shown
in the runtime badge.

## Cold start

If `navigator.onLine` is false, the page skips `PRECACHE` and starts the worker
immediately.  The SW serves every runtime request from the runtime cache.  A
missing cache entry is a hard failure, never a silent network fallback.

Acceptance for this branch: clear caches → online start once → completely
offline reload → redact/restore docx and xlsx; both succeed with zero external
requests.  `tests/browser/test_p1_dod.py` runs exactly that sequence.

### 50MB absolute RSS (xlsx)

`xlsx-50mb.xlsx` = 49.8 MB, 250,001 hits, cryptography/docx deferred and xlsx part-direct:

| Baseline | Peak | Delta | Pyodide heap | Time | Abort |
|---:|---:|---:|---:|---:|---|
| 1,093 MB | **1,792 MB** | 699 MB | 565 MB | 32.8 s | no |

This is under the xlsx absolute ≤2 GB gate (208 MB headroom).  Deferring
cryptography/docx lowered the baseline to ~1.09 GB; the remaining eager
runtime is lxml/Python/browser.  The merged
branch adds the pptx module import (no wasm) on top; the final merged absolute
re-run is part of P3.

## Merged P2/P3

After the xlsx and pptx branches merge, `runtime-config.js` becomes:

```js
SUPPORTED_FORMATS = ["docx", "xlsx", "pptx"]
BETTEROFFICE_PACKAGES = ["docx", "pptx"]
PY_SOURCES = [...core, docx_engine, xlsx_engine, pptx_engine, ...]
```

The merged offline DoD then processes all three formats from one cold start.
See `docs/p3/offline-dod.md` for the remaining work and estimate.
