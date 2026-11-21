# P0 handoff — GitHub state

## Status

P0 is on GitHub and the required checks are green.

- `next/rewrite` pushed from `dev@64b1953` (no v1 code changed).
- `next/p0-foundation` pushed; PR **#13** is open with base `next/rewrite`:
  <https://github.com/SilenWang/lethe/pull/13>.
- `next/rewrite` protection is set from `docs/p0/branch-protection.json`:
  no direct/force pushes, no deletions, no mandatory approval (single-maintainer
  fork), conversation resolution, up-to-date branch, five required checks.
- Repository merge method is squash-only (`allow_merge_commit=false`,
  `allow_rebase_merge=false`).
- All five jobs passed on the PR: `lint + typecheck`, `unit (pytest)`,
  `browser (Playwright, offline assets)`, `fidelity corpus (90 files + asset
  lock)`, `guard (no bare save/toBytes)`.
- `main` was not touched and **no `v1.3.2` tag will be created**: Sylens
  decided `dev` is frozen (it will not advance), only `next/rewrite` continues,
  and the v1 baseline bookmark is `cf93bd2`.

## How the branch was built (reproducible)

The P0 code-only patch is attached to VYB-2674. It excludes the 65.2MB
vendored assets and the 90 generated corpus files; both are reproducible:

```bash
git checkout next/rewrite
git checkout -b next/p0-foundation
git apply p0-foundation.patch
pixi install
pixi run corpus        # 90 files, sha256 identical to corpus/manifest.csv
pixi run assets-fetch  # 201 files / 65.2MB, sha256 identical to manifest.json
```

## Branch protection (applied)

```bash
gh api -X PUT repos/SilenWang/lethe/branches/next/rewrite/protection \
  --input docs/p0/branch-protection.json
gh api -X PATCH repos/SilenWang/lethe \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false
```

The five contexts in the protection rule match the five job `name:` fields in
`.github/workflows/ci.yml` exactly.

## Local result snapshot (pre-push)

| job | command | result |
|---|---|---|
| lint + typecheck | `pixi run lint`, `pixi run typecheck` | pass (ruff clean; mypy clean on 5 P0 modules) |
| unit | `pixi run unit` | 170 passed, 3 skipped |
| browser | `pixi run browser` | 1 passed (offline load, sha256, wasm compile) |
| fidelity corpus | `pixi run fidelity-corpus` | 90 files OK; 201 assets / 65.2MB sha256 OK |
| guard | `pixi run guard` | 9 passed; product paths clean |
