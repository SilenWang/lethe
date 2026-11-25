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

| Format | Baseline | Peak absolute RSS | Gate |
|---|---:|---:|---:|
| xlsx part-direct | 1,093 MB | **1,792 MB** | ≤2 GB |
| pptx part-direct | 1,098 MB | **1,542 MB** | ≤2.5 GB |
| pptx stress | 1,098 MB | **1,620 MB** | ≤2.5 GB |
| docx | P1 DoD | P1 DoD | ≤2.5 GB |

No gate changed.  The pptx BetterOffice asset is no longer initialised or
preloaded; removing the vendored directory can be a P3 cleanup.

## Remaining P3

1. Final five-layer regression PR hooked into `fidelity-corpus` (1–1.5 d).
2. Delete unused pptx BetterOffice asset and update asset manifest/docs (0.5 d).
3. Release/cache-invalidation docs and merged 50 MB/offline report (0.5–1 d).

Total: **2–3 person-days** excluding review/merge queue.
