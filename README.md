<p align="center">
  <img src="lethe/web_static/favicon.svg" width="72" alt="Lethe logo" />
</p>

<h1 align="center">Lethe</h1>

<p align="center">
  A fully local, installable PWA for reversible de-identification of
  <code>.docx</code>, <code>.xlsx</code> and <code>.pptx</code> files.
</p>

Lethe replaces names from the preset and user dictionaries with stable tokens
such as `[PERSON_001]`, then restores them from the saved local mapping. The
document never leaves the browser.

## Features

- Installable, offline-capable same-origin PWA.
- Word, Excel and PowerPoint files stay in their original formats.
- Deterministic dictionary matching plus email, phone and account patterns.
- User dictionary stored separately in IndexedDB and merged with the signed
  preset dictionary only while matching.
- Reversal mappings encrypted with the user's passphrase in the browser.
- Source-package postprocessing preserves unedited OOXML parts.
- One sequential document Worker; large tasks recycle it after completion.

Network access is limited to loading/updating the signed dictionary and the
application's own static assets. Documents, extracted text, mappings and
results are never uploaded.

## Build and run

```text
pixi run release-check
pixi run web-build
pixi run web-serve
```

The deployable artifact is `dist/web`. Serve it at the origin root over HTTPS
(or `localhost` for development), with the MIME and cache settings documented
in [`docs/p3/release.md`](docs/p3/release.md).

## Verification

```text
pixi run lint
pixi run typecheck
pixi run unit
pixi run browser
pixi run fidelity-corpus
pixi run release-offline
```

`release-offline` performs the clean-cache, online-preload, offline-reload and
three-format redact/restore acceptance sequence.

## Data ownership

- User entities: IndexedDB `user_entities`.
- Preset dictionary: verified OPFS packs.
- Jobs and encrypted reversal mappings: IndexedDB.
- Current and previous dictionary packs: OPFS.

The portable artifact remains under `dist/web`; user data stays with the
browser origin. See [`docs/p3/user-dictionary-isolation.md`](docs/p3/user-dictionary-isolation.md),
[`docs/p3/data-migration.md`](docs/p3/data-migration.md), and
[`docs/p3/release.md`](docs/p3/release.md).

## License

Apache License 2.0.
