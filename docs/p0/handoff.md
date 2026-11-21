# P0 handoff — what Sylens must click/push

## Status of this delivery

The runtime that produced P0 has **no GitHub credentials** (no `gh` login, no
git credential helper). Therefore:

- branches `next/rewrite` and `next/p0-foundation` exist **only in the local
  bundle/patch**, not on GitHub;
- no PR was opened;
- `main` was not touched, no tag was pushed;
- the five CI jobs were run locally with `pixi run …`; they were **not
  triggered on GitHub**. See the result table at the bottom.

Everything below is copy-pasteable after `git clone` / `gh auth login`.

## 1. Baseline tag (main already contains dev@64b1953)

Verified in the delivered repository:

```
git merge-base --is-ancestor 64b1953 cf93bd2   # exit 0
git log --oneline 64b1953..cf93bd2             # 3 commits, PR #12
```

So "merge dev into main" is a no-op: `main@cf93bd2` already contains
`dev@64b1953`. The tag is the only baseline step. `pyproject.toml` still says
`1.3.1`, so the recommended path is a one-line hotfix PR, then tag the merge:

```bash
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

If the team wants the tag without a version bump, tag `cf93bd2` directly:

```bash
git tag -a v1.3.2 cf93bd2 -m "Lethe v1.3.2"
git push origin v1.3.2
```

## 2. Create `next/rewrite` (from dev@64b1953)

```bash
git fetch origin --tags
git checkout -b next/rewrite 64b1953
git push -u origin next/rewrite
```

## 3. Branch protection

`docs/p0/branch-protection.json` is ready. The check names match the five job
names in `ci.yml`:

```bash
gh api -X PUT repos/SilenWang/lethe/branches/next/rewrite/protection \
  --input docs/p0/branch-protection.json
```

Squash-only is a repository-level setting (GitHub has no per-branch merge
method):

```bash
gh api -X PATCH repos/SilenWang/lethe \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false
```

Manual UI checklist if `gh` is unavailable:

1. Settings → Branches → add rule for `next/rewrite`.
2. Require a pull request before merging; 1 approval; dismiss stale approvals.
3. Require status checks: the five names above; require branches to be
   up-to-date.
4. Require conversation resolution; block force pushes; block deletions.
5. Settings → General → Pull requests: allow squash only.

## 4. Apply P0 and open the PR

From the bundle:

```bash
git fetch ../p0-foundation.bundle next/p0-foundation:next/p0-foundation
git checkout next/p0-foundation
```

From the patch (equivalent, base `next/rewrite`):

```bash
git checkout next/rewrite
git checkout -b next/p0-foundation
git apply /path/to/p0-foundation-code.patch
pixi install
pixi run assets-fetch        # re-downloads the pinned 65.2MB and verifies sha256
git add -A
git commit -m "P0: foundations, guard, gates, corpus, vendored assets"
```

The code-only patch deliberately excludes `web/assets/vendor/**`; the fetch
script reproduces those 201 files and the manifest verifies every hash.

Then push and open the PR **against `next/rewrite`, never `main`**:

```bash
git push -u origin next/p0-foundation
gh pr create --base next/rewrite --head next/p0-foundation \
  --title "P0: branch/CI foundations, guard, gates, corpus, vendored assets" \
  --body-file docs/p0/pr-body.md
```

## 5. Local result snapshot (not a GitHub run)

| job | command | result |
|---|---|---|
| lint + typecheck | `pixi run lint`, `pixi run typecheck` | pass (ruff clean; mypy clean on 5 P0 modules) |
| unit | `pixi run unit` | 170 passed, 3 skipped |
| browser | `pixi run browser` | 1 passed (offline load, sha256, wasm compile) |
| fidelity corpus | `pixi run fidelity-corpus` | 90 files OK; 201 assets / 65.2MB sha256 OK |
| guard | `pixi run guard` | 9 passed; product paths clean |

The exact output is pasted in the VYB-2674 delivery comment.

Local browser runs need Chromium once: `pixi run python -m playwright install chromium`.
