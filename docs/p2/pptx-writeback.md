# PPTX write-back (P2)

## Architecture

BetterOffice 0.5.1 owns slide text (including text boxes and tables).  The
engine finds the detected surfaces with `findText` and applies
`replaceText` steps through `applyEdits`.  The library refuses more than **128
steps per batch**, so the worker loops: find again, replace 128, repeat.  A
10,101-hit 50 MB deck drains in 79 batches.

The library has no API for four containers, so Python patches them directly:

| Gap | Parts |
|---|---|
| speaker notes | `ppt/notesSlides/notesSlide*.xml` |
| master / layout text | `ppt/slideMasters/*`, `ppt/slideLayouts/*` |
| existing comments + authors | `ppt/comments/comment*.xml`, `ppt/commentAuthors.xml` (body + `name`) |
| document properties | `docProps/core.xml`, `app.xml`, `custom.xml` |

`finish()` runs `postprocess()` first (source package, only library-changed
slide parts kept, every other part copied as its original compressed stream),
then applies the gap patches with the same source-priority repack.  A final
leak scan covers slides, notes, masters, layouts, comments, authors and
properties; a leak aborts instead of shipping.

## Split runs and case

Notes/master/layout paragraphs are replaced across `a:t` runs: if a name is
split across runs, the paragraph collapses to one run (same trade-off as
docx).  `findText` is exact/case-sensitive, so the replacement list is built
from the **actual casing found in slide text** (`JOHN SMITH` gets its own
entry and its own leak-scan surface).

## Degradation list (also shown in the UI)

* chart numeric caches (chart titles in slide text are redacted);
* SmartArt / diagram text;
* OLE embedded objects;
* text baked into images or scanned media.

Codes: `pptx.chart_cache`, `pptx.smartart`, `pptx.ole`.

## 50 MB measurement (2026-11-23)

Chromium 157 headless, the real P1 worker (Pyodide + BetterOffice pptx +
part patches).  Peak RSS is the sum of the Chromium process tree, sampled every
100 ms; baseline is measured after the worker is ready.

| Fixture | Hits | Redact | Baseline RSS | Peak RSS | Delta | Pyodide heap |
|---|---:|---:|---:|---:|---:|---:|
| 49.1 MB, 5 slides × 100 paragraphs + 49 MB media | 506 | 3.7 s | 1,139 MB | **2,648 MB** | 1,509 MB | 79 MB |
| 49.3 MB, 100 slides × 100 paragraphs + 49 MB media (stress) | 10,101 | 24.3 s | 1,140 MB | **2,812 MB** | 1,672 MB | 94 MB |

**Gate conflict remains:** both BetterOffice modules/wasms are deferred, but
the eager lxml+cryptography runtime keeps the baseline ~1.14 GB; absolute peak
is 2.65–2.81 GB, still 148–312 MB over the unchanged pptx ≤2.5 GB gate.  The
next lever is deferring cryptography (assets still pre-cached; first vault
operation loads it) or a user-approved gate change.  Do not silently raise the
gate.

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
