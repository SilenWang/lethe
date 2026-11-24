## VYB-2676 P2 / pptx: part-direct redaction + eager offline runtime

Base: `next/rewrite` · branch: `next/p2-pptx`

### What changed

- **PPTX is part-direct** — `lethe/pptx_engine.py` edits every owned part with
  lxml: slides (text boxes, tables, hidden slides), speaker notes,
  masters/layouts, legacy comments + authors, customXml and
  `docProps/core|app|custom`.  BetterOffice pptx is not imported or
  initialised; the 50 MB path never builds the presentation object graph.
- **Source-first repack** — unchanged entries keep their original compressed
  stream, edited parts go through the P0 C1/C2/C3 assertions, and a final leak
  scan covers every container above.
- **Split runs** — paragraphs are replaced across `a:t` runs; a name split
  across runs collapses that paragraph to one run.
- **Eager offline runtime** — assets, Python and lxml are eager; cryptography
  loads on the first vault op and docx on the first docx.  The SW pre-caches
  Pyodide, the wheels, the Python sources and the BetterOffice docx bundle
  (pptx has no BetterOffice asset).  Progress/retry UI; offline e2e is
  `clear cache → online start → offline reload → docx + pptx`.
- **Worker/UI** — `.pptx` routes through the Python final path; inspect skips
  `parseDocx`; the UI accepts `.docx/.pptx`, keeps the suffix on downloads and
  shows the pptx degradation list (chart caches, SmartArt, OLE, media text).

### 50 MB measurement

Chromium 157 headless, real worker, peak RSS = Chromium process tree sampled
every 100 ms; no BetterOffice pptx.

| Fixture | Hits | Redact | Baseline RSS | Peak RSS | Delta | Pyodide heap |
|---|---:|---:|---:|---:|---:|---:|
| 49.1 MB, 506 hits + 49 MB media | 506 | **1.1 s** | 1,098 MB | **1,542 MB** | 444 MB | 391 MB |
| 49.3 MB, 10,101 hits (stress) | 10,101 | **5.6 s** | 1,098 MB | **1,620 MB** | 521 MB | 393 MB |

Both pass the unchanged pptx **absolute ≤2.5 GB** gate with 880–959 MB
headroom.  Only slides/notes/core/etc. change; media, rels and
`[Content_Types].xml` are byte-identical.  Leak scan 0;
`extract_all_text_parts(restored) == source`.

### Verification (local, all green)

```
pixi run lint             All checks passed
pixi run typecheck        no issues in 11 source files
pixi run unit             201 passed, 3 skipped
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
