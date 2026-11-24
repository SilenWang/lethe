## VYB-2676 P2 / xlsx: part-direct redact + restore

Base: `next/rewrite` · branch: `next/p2-xlsx`

### Why part-direct

The 500-hit gate on a 101-part, 1.75 MB workbook:

| Path | 500-cell write | Part diff | Residual name |
|---|---:|---|---:|
| BetterOffice `editCells` | 6.13 s | 100/101, `calcChain.xml` dropped, `TODAY()` recalc | 500 in `sharedStrings.xml` |
| + `postprocess()` | 6.13 s | `sheet4.xml` only | 500 (orphan SST) |
| Python part-direct | **0.07 s** | `sharedStrings.xml` only | **0** |

The library converts shared-string cells to inline strings (C14N structure
change) and never rewrites the SST entry.  Clearing the leak requires editing
`sharedStrings.xml`, i.e. a part outside the edited worksheet — the issue's
fallback trigger.  BetterOffice xlsx is no longer vendored or precached.

### What changed

- **Eager runtime preload** — `web/lib/runtime-config.js` is shared by the
  worker and SW: docx + xlsx formats, BetterOffice docx only, Pyodide
  lxml+cryptography, all Python modules.  On the first online start the SW
  pre-caches Pyodide, the wheels, docx and `/py/`; the worker never downloads a
  format on first use.  Progress/retry UI; offline cold start is the new e2e
  (`clear cache → online start → offline reload → docx + xlsx`).  xlsx
  BetterOffice assets are still deleted.
- **`lethe/xlsx_engine.py`** — part-direct redact/restore.  Shared strings are
  split by cell reference: in-place only when every reference is a hit,
  otherwise a new deduplicated `<si>` is appended and only hit cells are
  reindexed; non-hit cells keep the original text.  Orphan entries are
  scrubbed.  Independent unit test covers the split.
- **Three storage forms** — pure SST, pure inline and mixed all covered; the
  corpus now contains one of each (`xlsx-001/002/003`) and a parametrized test
  round-trips all three without changing the storage form.
- **Formulas** — `t="str"` cells change only the cached `<v>`; `<f>` is
  byte-identical and `xl/calcChain.xml` is never touched (asserted).
- **Text parts** — legacy/threaded comments and authors, persons, customXml,
  docProps and drawing/chart `a:t` text are all in the leak scan.  The corpus
  element checklist now tracks `persons`, `threaded_comments`, `custom_xml`,
  `doc_props` (30/30) and the three storage forms.
- **Streaming** — linear open-tag + close-tag scanners, one cell/`<si>` at a
  time; only changed parts are materialised.  No lxml tree for the 8–35 MB
  sheet.  Progress and the 60 s first-byte watchdog are unchanged.
- **Worker/UI** — `.xlsx` routes to the Python engine (no BetterOffice), returns
  `warnings`, the UI accepts `.docx/.xlsx`, keeps the suffix on downloads and
  shows the xlsx degradation list.
- **Assets** — `@betteroffice/xlsx` removed from `tools/vendor_assets.py`, the
  vendored tree, `manifest.json` and the P0 asset test; 57.6 MB remains
  (Pyodide + docx + pptx).  `fidelity-corpus` still verifies all 178 files.

### 50 MB measurement

Fixture: 49.8 MB (52,198,922 bytes), 250,000 shared strings containing
`John Smith`, 250,000 rows, 28 MB incompressible media.  Chromium 157 headless,
real P1 worker (Pyodide + part-direct engine).

| Metric | Value |
|---|---:|
| Redact (250,001 hits) | 32.8 s |
| Restore (250,001 hits) | 16.8 s |
| Peak Pyodide `HEAPU8` | 601.6 MB |
| Peak JS heap | 9.5 MB |
| Baseline RSS | 1,093 MB |
| Peak absolute RSS | **1,792 MB** |
| RSS delta | 698.6 MB |
| Abort / OOM | none |
| Leak scan | 0 |
| Part diff | `xl/sharedStrings.xml` + `docProps/core.xml` only; sheet/media identical |
| Restored text | `extract_all_text_parts(restored) == source` |

The xlsx DoD is **absolute RSS ≤2 GB**; 1,792 MB leaves 208 MB headroom.

### Verification (local, all green)

```
pixi run lint             All checks passed
pixi run typecheck        no issues in 11 source files
pixi run unit             210 passed, 3 skipped
pixi run guard            9 passed; guard: clean (lethe, web)
pixi run fidelity-corpus  OK — 90 files; assets 178 files 57.6 MB sha256 OK
pixi run browser          22 passed + 4 passed
pixi run web-check        sources OK
```

### Out of scope

pptx write-back and the five-layer regression land in the next PR(s), with
`fidelity-corpus` as the final gate.  Pivot caches, chart numeric caches,
SmartArt, OLE, formula literals and external-link caches are reported as
warnings and listed in the UI + `docs/p2/xlsx-part-direct.md`.
