# PPTX write-back (P2)

## Architecture

PPTX is **part-direct**: no BetterOffice presentation model is built.  lxml
parses each owned part and rewrites its text containers:

| Container | Parts |
|---|---|
| slides (text boxes, tables, hidden slides) | `ppt/slides/slide*.xml` |
| speaker notes | `ppt/notesSlides/notesSlide*.xml` |
| master / layout text | `ppt/slideMasters/*`, `ppt/slideLayouts/*` |
| comments + authors | `ppt/comments/comment*.xml`, `ppt/commentAuthors.xml` |
| document properties | `docProps/core.xml`, `app.xml`, `custom.xml` |

The package is rebuilt from the source archive with `postprocess._rebuild`:
only edited parts are recompressed, every other entry keeps its original
compressed stream.  A final leak scan covers every container above and aborts
instead of shipping.  BetterOffice pptx is not imported or initialised, and its
asset is no longer in `BETTEROFFICE_PACKAGES`.

## Split runs and case

Paragraphs are replaced across `a:t` runs: if a name is split across runs, the
paragraph collapses to one run (same trade-off as docx).  Matching is the
shared case-insensitive dictionary/pattern replacer, so `JOHN SMITH` is covered
without a separate exact-search path.

## Degradation list (also shown in the UI)

* chart numeric caches (chart titles in slide text are redacted);
* SmartArt / diagram text;
* OLE embedded objects;
* text baked into images or scanned media.

Codes: `pptx.chart_cache`, `pptx.smartart`, `pptx.ole`.

## 50 MB measurement (2026-11-23)

Chromium 157 headless, the real P1 worker (Pyodide + lxml, no BetterOffice
pptx).  Peak RSS is the sum of the Chromium process tree, sampled every 100 ms;
baseline is measured after the worker is ready.

| Fixture | Hits | Redact | Baseline RSS | Peak RSS | Delta | Pyodide heap |
|---|---:|---:|---:|---:|---:|---:|
| 49.1 MB, 5 slides × 100 paragraphs + 49 MB media | 506 | 1.1 s | 1,098 MB | **1,542 MB** | 444 MB | 391 MB |
| 49.3 MB, 100 slides × 100 paragraphs + 49 MB media (stress) | 10,101 | 5.6 s | 1,098 MB | **1,620 MB** | 521 MB | 393 MB |

Both pass the unchanged pptx **absolute ≤2.5 GB** gate with 880–959 MB
headroom.  The old BetterOffice path peaked at 2.59–2.73 GB; part-direct avoids
the presentation object graph entirely.

Only slides, notes and `docProps/core.xml` change; `[Content_Types].xml`, rels,
masters, layouts (on the stress fixture) and the 49 MB media entry are
byte-identical.  `scan_leaks` is 0 and
`extract_all_text_parts(restored) == source`.

## Tests

* `tests/test_pptx_engine.py` — gap parts, split runs, case variants, batch
  source priority, restore round-trip, corpus files.
* `tests/browser/test_p2_pptx.py` — real worker: 52-part seed, inspect 52
  parts, redact → restore, 0 leaks, text equality.
* `tests/browser/test_p1_ui.py` — UI upload/detect/generate/download/restore for
  `.pptx`, suffix and degradation list.
