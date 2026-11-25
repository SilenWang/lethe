## VYB-2676 P2 / P3: five-layer fidelity gate and runtime cleanup

Base: `next/rewrite` · branch: `next/p2-fidelity`

### What changed

- `fidelity-corpus` now runs all five fidelity layers over 90 corpus files:
  source part/hash/C1-C3 integrity, text-only C14N, zero leaks plus exact
  restore, LibreOffice render SSIM, and the 50 MB runtime matrix.
- LibreOffice and Poppler are pinned in a small offline render image built by
  the pixi task; crash/corruption/repair log lines fail the gate.
- The unused BetterOffice pptx bundle is deleted.  The vendor manifest drops
  from **178 files / 60,346,519 bytes** to **154 files / 53,652,823 bytes**
  (24 files and 6,693,696 bytes removed).
- Runtime-config/build guards reject BetterOffice xlsx and pptx preloads.
  `CACHE_VERSION` is bumped to `5`; release, cache invalidation, version
  upgrade and known degradations are documented in `docs/p3/release.md`.
- `pixi run measure-50mb` generates `docs/p3/runtime-50mb.json`; the fidelity
  gate checks its absolute process-tree RSS against the unchanged limits.

### Five-layer result

```text
fidelity: 90 files; L1-L3/L5 OK; LibreOffice 366 pages, minimum SSIM 1.000000
```

The only structural exception is intentional xlsx shared-string splitting:
an appended token `<si>` is allowed while every original `<si>` remains
structurally unchanged and non-hit cells keep their original index/text.

### 50 MB matrix

Chromium headless, real worker, absolute process-tree `VmRSS` sampled every
100 ms.

| Format | Fixture / hits | Redact | Baseline | Peak | Gate |
|---|---:|---:|---:|---:|---:|
| docx BetterOffice | 52,230,244 B / 35 | 2.9 s | 1,108 MB | **2,050 MB** | ≤2.5 GB |
| xlsx part-direct | 52,198,922 B / 250,001 | 33.1 s | 1,118 MB | **1,870 MB** | ≤2 GB |
| pptx part-direct | 51,437,965 B / 506 | 1.0 s | 1,118 MB | **1,634 MB** | ≤2.5 GB |

No memory or time gate changed.

### Verification

```text
lint               All checks passed
typecheck          no issues in 14 source files
unit               223 passed, 3 skipped
browser            24 passed + UI 5 passed
fidelity-corpus    90 files; 366 pages; min SSIM 1.000000; assets 154 / 51.2 MiB
guard              9 passed; guard: clean
web-check          sources OK
```

The browser job includes the merged offline sequence: clear cache → online
start/precache → fully offline reload → docx, xlsx and pptx roundtrips →
offline vault load, with zero external requests.

### Known degradation

The complete list is in `docs/p3/release.md`: xlsx pivot/chart caches,
SmartArt, OLE, external-link caches and formula literals; pptx chart caches,
SmartArt, OLE and text baked into images.  Formula cached strings are covered.
