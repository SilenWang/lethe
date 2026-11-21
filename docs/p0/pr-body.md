## P0 — preparation and contract gates (VYB-2674)

Base: `next/rewrite` (cut from `dev@64b1953`). **Do not merge into `main`.**

This PR adds foundations only; it does not write detection, write-back or UI
business logic.

### What is in it

- **Branches/CI:** `.github/workflows/ci.yml` with five jobs on `main`, `dev`
  and `next/rewrite`; all commands run through `pixi`.
- **Guard:** `tools/guard_no_bare_save.py` + tests + two deliberate violation
  fixtures. Product code may only leave through `postprocess()`.
- **Gates:** `lethe/gates.py` (35/50MB, 40MB part, 150MB XML, 500MB/10k/100:1
  zip-bomb) + `tests/test_gates.py` + en/zh copy.
- **Corpus:** 90 files (30 docx / 30 xlsx / 30 pptx) with
  `corpus/manifest.csv` (sha256, part count, element checklist, generator
  version) and `corpus/COVERAGE.md`.
- **Assets:** Pyodide 0.29.5 + BetterOffice 0.5.1 vendored under
  `web/assets/vendor` with a 201-file sha256 manifest; no CDN, no micropip.
- **Contract skeleton:** `tools/postprocess_contract.py` + tests for source
  priority, per-part sha256 and compressed-stream identity (implementation in
  P1).

### Verification (local; not yet run on GitHub)

```
pixi run lint            -> All checks passed
pixi run typecheck       -> Success: no issues found in 5 source files
pixi run unit            -> 170 passed, 3 skipped
pixi run browser         -> 1 passed
pixi run fidelity-corpus -> 90 files OK; 201 assets / 65.2MB sha256 OK
pixi run guard           -> 9 passed; guard: clean (lethe, web)
```

### Notes for reviewers

- `lethe/docio.py` is the frozen v1 exemption (5 call sites). It disappears in
  the P3 cutover; the guard test fails if the count grows or the exemption is
  left behind.
- BetterOffice `dist/` is vendored as-is (65MB total with Pyodide). The browser
  job proves it loads offline and that each wasm compiles.
