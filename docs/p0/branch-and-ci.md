# P0 branch, CI and gates (v2 `next/rewrite`)

This page is the operational contract for P0. It describes what the five CI jobs
do, what the guard and the four hard gates enforce, and how the vendored assets
are pinned. The one-time GitHub actions that need credentials are in
[`handoff.md`](handoff.md).

## Job map

| job (required check name) | task | what it proves |
|---|---|---|
| `lint + typecheck` | `pixi run lint`, `pixi run typecheck` | new P0 code is lint-clean and type-clean |
| `unit (pytest)` | `pixi run unit` | the whole pytest suite (v1 + P0 gates/guard/contracts) |
| `browser (Playwright, offline assets)` | `pixi run browser` | Pyodide + BetterOffice load with every non-localhost request aborted; browser-computed sha256 matches the manifest |
| `fidelity corpus (90 files + asset lock)` | `pixi run fidelity-corpus` | 30 docx + 30 xlsx + 30 pptx, element checklist + sha256 + pinned asset versions |
| `guard (no bare save/toBytes)` | `pixi run guard` | product code cannot serialise a package directly; deliberate violations fail |

`ci.yml` runs on pushes to `main`, `dev` and `next/rewrite`, and on every PR
whose base is one of those branches. There is no path filter: a version bump or
an asset change runs the full suite.

## Branch rules

- `main` only accepts `hotfix/*` PRs. `next/rewrite` never merges into `main`
  before the P3 cutover conditions are met.
- `next/rewrite` is cut from `dev@64b1953`, not from `main`. All v2 PRs use
  `next/rewrite` as base; topic branches are `next/<topic>` and are deleted
  after merge.
- Protection: no direct pushes, no force pushes, no deletions, 1 approving
  review, all five checks green, require up-to-date branch, conversation
  resolution required.
- GitHub has no per-branch merge-method setting. "Squash only" is a repository
  setting (`allow_merge_commit=false`, `allow_rebase_merge=false`); apply it
  repo-wide and keep the hotfix PRs single-commit.

## The naked-save guard

`tools/guard_no_bare_save.py` scans `web/**` and `lethe/**` (tests and vendored
bundles excluded) for `.save(` and `.toBytes()` / `.to_bytes(` calls. The only
sanctioned exit is `postprocess()`. Two deliberate fixtures prove the guard is
red on purpose:

- `tools/guard_fixtures/violation_save.py` — reports `P0-GUARD-SAVE` at
  `file:line` with `api='save('`;
- `tools/guard_fixtures/violation_tobytes.js` — reports `P0-GUARD-TOBYTES`
  with `api='toBytes()'`.

The frozen v1 engine (`lethe/docio.py`) is the only exemption while v1 still
ships. `LEGACY_FROZEN_COUNTS` records five call sites; the test fails if that
number grows, and fails again if the file is deleted at the P3 cutover but the
exemption is left behind.

## The four hard gates

`lethe/gates.py` runs **before** any document library. It reads only the ZIP
central directory, never decompresses an entry, and never parses XML:

| gate | rule |
|---|---|
| `G1:file.size` | > 35MB warns, > 50MB rejects |
| `G2:xml.part` | one `*.xml` / `*.rels` part > 40MB rejects |
| `G3:xml.total` | all XML parts > 150MB rejects |
| `G4a:zip.total` | all entries decompressed > 500MB rejects |
| `G4b:zip.entries` | more than 10,000 entries rejects |
| `G4c:zip.ratio` | one entry ≥1MB with > 100:1 compression rejects |

Every rejection carries the gate id, the part name (where a part exists) and
the actual/limit numbers. The UI copy lives in `lethe/locales/{en,zh}.json`
under `gate.*`, including the three fallbacks `gate.tip.split`,
`gate.tip.convert` and `gate.tip.machine`.

Ordering matters: the 15.7MB spreadsheet whose single sheet expands to 118MB
must be rejected before BetterOffice builds its document model. A check after
`openWorkbook()` is already too late.

## Assets and version lock

- Pyodide **0.29.5** (Python 3.13.2): `pyodide.mjs`, `pyodide.js`,
  `pyodide.asm.js`, `pyodide.asm.wasm`, `python_stdlib.zip`,
  `pyodide-lock.json`, plus lxml 6.0.2 and cryptography 46.0.3 with
  cffi/pycparser/six.
- BetterOffice **0.5.1**: the full `dist/` of `@betteroffice/docx`,
  `@betteroffice/xlsx` and `@betteroffice/pptx` (docx parse 6.4MB + edit
  24.4MB, xlsx 7.6MB, pptx 6.3MB).
- Everything is served from `web/assets/vendor/`; `web/assets/runtime-config.json`
  pins `cdn=false`, `micropip=false`, `sameOrigin=true`.
- `tools/vendor_assets.py --verify-only` checks every file against
  `manifest.json` (201 files, 65.2MB, sha256 each).
- `tools/asset_version_guard.py` fails if `VERSIONS.json`, `manifest.json`, the
  runtime config and the Pyodide lock disagree, or if product code mentions a
  CDN or micropip.
- To bump a version: edit `PYODIDE_VERSION` / `BETTEROFFICE_VERSION` in
  `tools/vendor_assets.py`, run `pixi run assets-fetch`, then `pixi run p0`.
  The manifest diff is the trigger for rerunning every gate.

## Corpus

`corpus/` contains 90 generated files and `manifest.csv` with
`path,format,sha256,size_bytes,parts,features,generator_version,seed`.
`tools/make_corpus.py` builds them from the VYB-2671 enhanced seeds and
immediately re-opens each file to prove the elements exist.
`tools/verify_corpus.py --strict` re-checks every hash, part count and element
on every CI run; `corpus/COVERAGE.md` is the human-readable 30/30 table.
