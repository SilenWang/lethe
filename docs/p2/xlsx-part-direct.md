# XLSX part-direct redaction (P2)

## Why not BetterOffice

The 500-hit gate (VYB-2676, 2026-11-23) measured a 101-part, 1.75 MB workbook
with 500 edited cells:

| Path | 500-cell write | Part diff | Leak |
|---|---:|---|---|
| BetterOffice `editCells` | 6.13 s | 100/101 parts, `calcChain.xml` dropped, `TODAY()` recalc | 500 names left in `sharedStrings.xml` |
| BetterOffice + `postprocess()` | 6.13 s | `sheet4.xml` only | 500 names left (orphan SST entries) |
| Python part-direct | **0.07 s** | `sharedStrings.xml` only | **0** |

The library converts shared-string cells to inline strings (a C14N structure
change) and never rewrites the original SST entry.  Fixing the leak requires
editing `sharedStrings.xml`, i.e. a part outside the edited worksheet, which is
the issue's pre-agreed fallback trigger.  The xlsx BetterOffice bundle is no
longer vendored or precached.

## What is rewritten

| Container | Rule |
|---|---|
| `xl/sharedStrings.xml` | split by cell reference (see below); orphan entries are scrubbed |
| worksheet `t="inlineStr"` | `<is>` text, rich runs preserved where possible |
| worksheet `t="str"` | cached `<v>` only; `<f>` is never touched |
| `xl/comments*.xml` | comment body + `<author>` |
| `xl/threadedComments/*.xml` | `<text>` |
| `xl/persons/*.xml` | `displayName` |
| `customXml/*.xml` | every text node |
| `docProps/core.xml`, `app.xml`, `custom.xml` | creator/title/company/custom values |
| `xl/drawings/*.xml`, `xl/charts/*.xml` | `a:t` text (text boxes, chart titles) |

Every other entry is copied as its original compressed stream
(`postprocess.repack`); `[Content_Types].xml`, rels, `calcChain.xml`, styles,
media and pivot/slicer/timeline parts are byte-identical.

## Shared strings are split, not rewritten wholesale

One `<si>` can be referenced by many cells.  Rewriting it in place would change
cells that were not selected.  The engine therefore:

1. records every reference to each changed index (all worksheets);
2. if every reference is a hit, rewrites the entry in place (no new index);
3. otherwise appends a new `<si>` with the redacted text, deduplicated by text,
   and points only the hit cells at it; non-hit cells keep the original index;
4. scrubs an entry that becomes unreferenced, so no PII remains in the package.

`tests/test_xlsx_engine.py::test_shared_string_split_keeps_non_hit_reference`
is the independent unit test for rule 3.

## Storage forms

The engine reads/writes all three forms:

* pure `sharedStrings.xml` (corpus `xlsx-001`);
* pure `t="inlineStr"` (corpus `xlsx-002` and most generated cases);
* mixed (corpus `xlsx-003`).

No `sharedStrings.xml` is required; the engine never assumes one exists.

## Formula policy

Only the cached string value `<v>` of `t="str"` cells is redacted.  `<f>` text
is left byte-identical, and `xl/calcChain.xml` is never modified (cell
addresses do not change).  Formula string literals are in the degradation list
below; the cell's displayed cached value is still redacted.

## Leak scan and memory

`extract_all_text_parts()` covers all containers in the table above, including
the whole shared-string table (orphans included).  `scan_leaks()` must return
empty for every corpus file.

Worksheets and the shared-string table are scanned with a linear open-tag +
`</c>`/`</si>` scanner, one cell/entry at a time; only changed parts are
materialised.  No `lxml` tree is built for the 8 MB sheet, so the 50 MB file
stays well under the 2 GB xlsx peak-memory gate.

## Degradation list (also shown in the UI)

These are reported as warnings, never silently skipped:

* pivot-table cache values and pivot field items;
* chart numeric caches (chart titles are redacted);
* SmartArt / diagram text;
* OLE embedded objects;
* string literals inside formulas (cached results are redacted);
* external-link cached workbook paths/names.

The `warnings` array from `xlsx_engine.redact()` uses the codes
`xlsx.pivot_cache`, `xlsx.chart_cache`, `xlsx.smartart`, `xlsx.ole`,
`xlsx.formula_literal`, `xlsx.external_links`.

## 50MB measurement (2026-11-23)

Fixture: 49.8 MB (52,198,922 bytes), 250,000 shared strings containing
`John Smith`, 250,000 rows, plus a 28 MB incompressible media part.
Chromium 157 headless, the real P1 worker (Pyodide + the part-direct engine).

| Metric | Value |
|---|---:|
| Redact (250,001 hits) | 32.8 s |
| Restore (250,001 hits) | 16.8 s |
| Peak Pyodide `HEAPU8` | **567.8 MB** |
| Peak `performance.memory` JS heap | 9.5 MB |
| Abort / OOM | none |
| Leak scan | 0 |
| Part diff | `xl/sharedStrings.xml` + `docProps/core.xml` only; sheet/media byte-identical |
| Restored text | `extract_all_text_parts(restored) == source` |

The xlsx memory gate is **absolute RSS ≤2 GB**: with docx eager the measured
baseline is 1,137 MB, peak 1,865 MB, delta 728 MB (135 MB headroom).  The whole package
hash changes between source and restore only because the two edited parts are
recompressed (zip timestamps/compression); every other entry keeps its original
compressed stream, and the text parts are char-for-char equal.

## Eager preload

The first online start pre-caches Pyodide, lxml/cryptography, the Python
modules and the BetterOffice docx bundle; xlsx itself stays part-direct.  There
is no first-format network branch.  The SW/worker contract and the offline e2e
are documented in `docs/p2/eager-preload.md`; the merged three-format P3 gate
is in `docs/p3/offline-dod.md`.
