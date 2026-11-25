# Eager runtime preload (P2 merged)

Decision: no per-format lazy download.  The first online start caches the whole
runtime this build can use; later cold starts never need the network to open a
format for the first time.

## Contract

`web/lib/runtime-config.js` is the single source of truth:

* `SUPPORTED_FORMATS` — `docx`, `xlsx`, `pptx`;
* `BETTEROFFICE_PACKAGES` — `docx` only; xlsx and pptx are part-direct;
* `PY_SOURCES` — core, docx, xlsx, pptx engines + gates/postprocess/web entry;
* `PYODIDE_PACKAGES` — `lxml` eager;
* `DEFERRED_PYODIDE_PACKAGES` — `cryptography`, loaded by a vault op.

The worker and SW import the same file.  `web-check` rejects a BetterOffice
xlsx/pptx bundle in the preload set, a missing engine, or wheel drift.

## First online start

The page registers the module SW, waits for it to activate, then sends
`PRECACHE`.  The SW reads `assets/vendor/manifest.json`, selects the full
Pyodide directory, the BetterOffice docx directory and `/py/` sources, caches
each entry, and posts progress/error messages.  The UI shows progress and a
retry button; the worker is created after the precache settles.

The worker eagerly initialises Pyodide, lxml and the Python sources.  docx
loads BetterOffice on its first docx; pptx never uses BetterOffice.  The
cryptography wheel stays cached and is loaded on the first vault operation.

## Cold start

If `navigator.onLine` is false, the page skips `PRECACHE` and starts the worker
immediately; the SW serves every runtime request from the runtime cache.  A
missing cache entry is a hard failure, never a silent network fallback.

Acceptance: clear caches → online start once → completely offline reload →
redact/restore docx, xlsx and pptx in order.  All three succeed with zero
external requests; `tests/browser/test_p1_dod.py` runs that sequence.

## 50MB absolute RSS

| Format | Fixture / hits | Baseline | Peak | Gate |
|---|---|---:|---:|---:|
| xlsx part-direct | 49.8 MB / 250,001 | 1,093 MB | **1,792 MB** | ≤2 GB |
| pptx part-direct | 49.1 MB / 506 | 1,098 MB | **1,542 MB** | ≤2.5 GB |
| pptx part-direct (stress) | 49.3 MB / 10,101 | 1,098 MB | **1,620 MB** | ≤2.5 GB |

docx 50 MB stays on the P1 ≥2.5 GB gate.  No gate was changed.

## Postprocess / restore

Both part-direct engines (`xlsx_engine`, `pptx_engine`) rebuild from the source
archive with `postprocess._rebuild`: unedited entries keep their original
compressed stream; C1/C2/C3 are asserted.  Leak scans cover the owned text
parts and restore is text-for-text covered by the corpus and browser tests.
