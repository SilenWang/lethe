# P3 offline DoD handoff (merged P2)

After #26 and #27 merge, the runtime supports:

```js
SUPPORTED_FORMATS = ["docx", "xlsx", "pptx"]
BETTEROFFICE_PACKAGES = ["docx"]   // xlsx + pptx are part-direct
PYODIDE_PACKAGES = ["lxml"]        // cryptography deferred to first vault
```

`tests/browser/test_p1_dod.py` now runs the merged sequence: clear caches →
online start → completely offline reload → docx, xlsx, pptx roundtrips →
offline vault load.  The SW serves all assets from the runtime cache.

## 50 MB matrix

| Format | Redact time | Baseline | Peak absolute RSS | Gate |
|---|---:|---:|---:|---:|
| docx BetterOffice | 2.9 s | 1,108 MB | **2,050 MB** | ≤2.5 GB |
| xlsx part-direct | 33.1 s | 1,118 MB | **1,870 MB** | ≤2 GB |
| pptx part-direct | 1.0 s | 1,118 MB | **1,634 MB** | ≤2.5 GB |

No gate changed.  The unused pptx BetterOffice bundle has been removed from
the repository, manifest and service-worker precache.  The resulting manifest
has **154 files / 53,652,823 bytes (51.2 MiB)**.

Raw fixtures, sha256 and Pyodide heap values are in
[`runtime-50mb.json`](runtime-50mb.json).

## Final P2 regression

`pixi run fidelity-corpus` now runs part/hash integrity, text-only C14N,
zero-leak/character-exact restore, LibreOffice SSIM and the recorded 50 MB
runtime gates.  Release and cache rules are in `docs/p3/release.md`.
