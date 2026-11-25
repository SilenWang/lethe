## VYB-2676 P2 / pptx: part-direct redaction on the merged xlsx baseline

Base: `next/rewrite` · branch: `next/p2-pptx` · includes #26 (`07052a0`).

### What changed

- **PPTX is part-direct** — `lethe/pptx_engine.py` edits slides (text boxes,
  tables, hidden slides), notes, masters/layouts, comments + authors,
  customXml and docProps with lxml.  BetterOffice pptx is not imported or
  initialised; the 50 MB path never builds the presentation object graph.
- **Source-first repack** — unchanged entries keep their original compressed
  stream, edited parts go through the P0 C1/C2/C3 assertions, and a final leak
  scan covers every owned text container.
- **Merged runtime contract** — docx/xlsx/pptx supported; BetterOffice only
  docx; xlsx and pptx part-direct; Pyodide/lxml eager, cryptography deferred
  to the first vault op, docx deferred to the first docx.
- **Offline/e2e** — first online start caches Pyodide, the wheels, Python
  sources and the docx bundle; offline reload processes docx, xlsx and pptx
  with zero external requests.  UI progress/retry and worker restart remain.
- **UI** — accepts `.docx/.xlsx/.pptx`, keeps suffixes, and shows combined xlsx
  + pptx degradation lists.

### 50 MB measurement

| Format | Fixture / hits | Redact | Baseline | Peak absolute RSS | Gate |
|---|---|---:|---:|---:|---:|
| xlsx | 49.8 MB / 250,001 | 32.8 s | 1,093 MB | **1,792 MB** | ≤2 GB |
| pptx | 49.1 MB / 506 | 1.1 s | 1,098 MB | **1,542 MB** | ≤2.5 GB |
| pptx stress | 49.3 MB / 10,101 | 5.6 s | 1,098 MB | **1,620 MB** | ≤2.5 GB |

All three formats are inside their existing gates; no gate changed.  pptx
leak scan is 0 and `extract_all_text_parts(restored) == source`.

### Verification (local, run after the merge)

```
pixi run lint             All checks passed
pixi run typecheck        no issues
pixi run unit             (see final run)
pixi run guard            9 passed; guard: clean
pixi run fidelity-corpus  OK — 90 files
pixi run browser          (see final run)
pixi run web-check        sources OK
```

### Out of scope

Five-layer regression remains the final P2 PR hooked into `fidelity-corpus`.
Chart caches, SmartArt, OLE, pivot caches, formula literals and media text are
warnings, listed in the UI and `docs/p2/*.md`.
