## VYB-2676 P2 / pptx: slide replaceText + gap patches

Base: `next/rewrite` · branch: `next/p2-pptx`

### What changed

- **Eager runtime preload** — `web/lib/runtime-config.js` is shared by the
  worker and SW: docx + pptx, BetterOffice docx+pptx, Pyodide
  lxml+cryptography, all Python modules.  The first online start pre-caches the
  complete set and initialises both libraries; no format is downloaded on
  first use.  Progress/retry UI; offline e2e is `clear cache → online start →
  offline reload → docx + pptx`.  The merged three-format gate is in
  `docs/p3/offline-dod.md`.
- **`lethe/pptx_engine.py`** — BetterOffice `findText` + `replaceText` for slide
  text (text boxes and tables included), looping in 128-step batches because
  the library caps a batch at 128 steps.
- **Four gap patches in Python** — speaker notes, master/layout text, existing
  comment bodies and `commentAuthors.xml` names, and
  `docProps/core.xml|app.xml|custom.xml`.  These are exactly the containers the
  library's API cannot edit.
- **Source-first finish** — `postprocess()` keeps only library-changed slide
  parts and raw-copies every other entry; gap patches are then applied with the
  same C1/C2/C3-checked repack.  A final leak scan covers slides, notes,
  masters, layouts, comments, authors and properties and aborts on any leak.
- **Split runs and case** — notes/master/layout paragraphs are replaced across
  `a:t` runs; the slide replacement list is built from the actual casing found
  in the deck (`JOHN SMITH` is its own entry and leak-scan surface).
- **Worker/UI** — `.pptx` routes through the Python plan + pptx library; inspect
  skips `parseDocx`; the UI accepts `.docx/.pptx`, keeps the suffix on
  downloads and shows the pptx degradation list (chart caches, SmartArt, OLE,
  media text).

### 50 MB measurement

Chromium 157 headless, real worker, peak RSS = Chromium process tree sampled
every 100 ms.

| Fixture | Hits | Redact | Restore | Baseline RSS | Peak RSS | Delta | Pyodide heap |
|---|---:|---:|---:|---:|---:|---:|---:|
| 49.1 MB, 506 hits + 49 MB media | 506 | 3.7 s | 5.8 s | 1,177 MB | **2,717 MB** | 1,540 MB | 79 MB |
| 49.3 MB, 10,101 hits (stress) | 10,101 | 23.8 s | 22.7 s | 1,185 MB | **2,768 MB** | 1,583 MB | 94 MB |

**Gate conflict (needs P3 decision):** eager docx+pptx raises the idle worker
baseline to ~1.18 GB.  The run-time delta is ~1.54 GB, but absolute peak RSS is
2.72–2.77 GB, above the issue's pptx ≤2.5 GB wording.  The old lazy numbers
were 2.09 / 2.24 GB.  Options: treat the gate as RSS delta, or keep the assets
and modules eager but defer `pptx.initWasm()` until the first pptx run (no
network either way).  I have not changed the gate.

Only slides/notes/core change; media, rels and `[Content_Types].xml` are byte-identical. Leak scan 0;
`extract_all_text_parts(restored) == source`.

### Verification (local, all green)

```
pixi run lint             All checks passed
pixi run typecheck        no issues in 11 source files
pixi run unit             200 passed, 3 skipped
pixi run guard            9 passed; guard: clean (lethe, web)
pixi run fidelity-corpus  OK — 90 files; assets 201 files 65.2 MB sha256 OK
pixi run browser          21 passed + 4 passed
pixi run web-check        sources OK
```

(Browser counts include `test_p2_pptx.py` and the pptx UI round-trip.)

### Out of scope

Five-layer regression lands in the final P2 PR and is hooked into
`fidelity-corpus`.  Chart numeric caches, SmartArt, OLE and media text are
reported as warnings and listed in the UI + `docs/p2/pptx-writeback.md`.
