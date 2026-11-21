# P0 handoff — GitHub state and the one remaining decision

## Status

P0 is on GitHub and the required checks are green.

- `next/rewrite` pushed from `dev@64b1953` (no v1 code changed).
- `next/p0-foundation` pushed; PR **#13** is open with base `next/rewrite`:
  <https://github.com/SilenWang/lethe/pull/13>.
- `next/rewrite` protection is set from `docs/p0/branch-protection.json`:
  no direct/force pushes, no deletions, 1 approval, conversation resolution,
  up-to-date branch, five required checks.
- Repository merge method is squash-only (`allow_merge_commit=false`,
  `allow_rebase_merge=false`).
- All five jobs passed on the PR: `lint + typecheck`, `unit (pytest)`,
  `browser (Playwright, offline assets)`, `fidelity corpus (90 files + asset
  lock)`, `guard (no bare save/toBytes)`.
- `main` was not touched and no tag was pushed.

## Remaining decision (Sylens)

`pyproject.toml` still says `1.3.1`. The `v1.3.2` tag is intentionally not
created yet; pick one:

```bash
# A. version bump first (recommended)
git checkout main && git pull --ff-only
git checkout -b hotfix/v1.3.2
# set version = "1.3.2" in pyproject.toml
git commit -am "chore: release v1.3.2"
git push -u origin hotfix/v1.3.2
gh pr create --base main --head hotfix/v1.3.2 \
  --title "Release v1.3.2" --body "Version bump for the v1 baseline tag."
# after merge:
git checkout main && git pull --ff-only
git tag -a v1.3.2 -m "Lethe v1.3.2 (v1 baseline before next/rewrite)"
git push origin v1.3.2
```

```bash
# B. tag the current main without a version bump
git tag -a v1.3.2 cf93bd2 -m "Lethe v1.3.2"
git push origin v1.3.2
```

`main@cf93bd2` already contains `dev@64b1953`, so no dev→main merge is needed.

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
