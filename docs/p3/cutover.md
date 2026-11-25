# v1 cutover

Lethe v2 is a same-origin static PWA. This cutover removes the remaining
server-side application, server document engine, optional recognition/runtime
services and their packaging.

## Removed surfaces

- root server entry point and its desktop/pipx launchers;
- server UI framework and its static service worker;
- server document parser/writer, including unsupported PDF and email ingestion;
- server recognition suggestion module and model installer;
- server runtime workspace/TTL, API middleware and related tests/tools;
- optional recognition, OCR and email extras, including NLP model metadata.

The retained Python package contains deterministic dictionary matching,
tokenisation/restoration, OOXML engine helpers used inside Pyodide, browser
contracts, and legacy-data compatibility helpers.

## Unchanged user data

This cutover does not migrate, delete or rewrite:

- IndexedDB `user_entities`, jobs, encrypted mappings or outputs;
- OPFS dictionary packs and their active/previous pointers;
- browser backups already exported by the user.

The static application keeps the same origin requirements documented in
[`release.md`](release.md). Deploying at a different scheme, host or port
creates a different browser origin and therefore does not share data.

## Build and acceptance

```text
pixi run cutover-check
pixi run release-check
pixi run web-build
pixi run release-offline
pixi run fidelity-corpus
```

`cutover-check` asserts that removed executable/dependency surfaces have zero
active hits. Documentation may retain historical references, but active code,
tests, dependency manifests and workflows may not.

## Rollback

Cutover is intended for a dedicated review PR and must not be merged until the
five required checks and the one-week/two-user acceptance gate pass.

If a merged cutover must be withdrawn:

1. Deploy the previous immutable `dist/web` release at the same origin; user
   IndexedDB/OPFS data remains intact.
2. If restoration of the removed server application itself is required, revert
   this cutover commit in a new reviewed PR and redeploy from that previous
   checkout. Do not rewrite `main` and do not clear browser site data.
3. Keep the cutover release and the rollback evidence in the issue/PR record.

The cutover commit is reversible through Git history, but browser storage is
user-owned and must never be used as rollback scratch space.
