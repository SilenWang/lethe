# Preset dictionary distribution

This document defines the immutable preset-dictionary layer. The separate
user-owned IndexedDB layer and its read-time merge are documented in
`docs/p3/user-dictionary-isolation.md`. Neither layer removes any v1 module.

## Release artifact

`pixi run dictionary-build` reads `dictionary/entities.jsonl` and writes:

```text
web/dictionary/
  manifest.json
  manifest.sig
  packs/<packVersion>/core.jsonl.gz
  packs/<packVersion>/<topic>.jsonl.gz
```

The detached Ed25519 signature covers the exact bytes of `manifest.json`. The
32-byte raw public key is the trust anchor in
`web/lib/dictionary-config.js`; the signing private key is supplied only through
`LETHE_DICTIONARY_SIGNING_KEY` and is never committed.

The checked-in bootstrap pack verifies the distribution contract. Before the
first curated production dictionary is published, provision the release private
key in the repository's secret store, rotate the public trust anchor in the same
reviewed change, and rebuild the signed artifact.

The manifest names each shard, its versioned download path, gzip byte length,
SHA-256 and entity count. Shards are JSONL containing only
`{canonical,type,aliases,source:"preset"}` rows. A shard does not embed the
pack version, so unchanged content keeps the same SHA-256 and can be reused by
the next release.

Build and CI enforce:

- core gzip total `<= 150 KiB`;
- full gzip total `<= 8 MiB`;
- a valid manifest structure, safe relative paths and unique shard ids;
- a detached signature that verifies with the shipped trust anchor;
- every checked-in shard's length and SHA-256;
- no non-preset row in a preset shard.

`pixi run dictionary-check` verifies the checked-in release artifact.

## Version and update model

`packVersion` is `YYYY.MM.DD.N`. A client accepts a newer signed version and
rejects an older one unless the user explicitly calls rollback. Reusing a
version with different manifest bytes is a conflict when that version is the
current OR the retained previous pack; both manifest digests live in the
pointer.

OPFS layout:

```text
lethe-dictionaries/
  active-0.json
  active-1.json
  shards/<sha256>.jsonl.gz
  packs/<packVersion>/manifest.json
  packs/<packVersion>/manifest.sig
```

Shards are content-addressed. On update, a shard with an existing valid
SHA-256 file is reused; only missing shards are requested. A new pack becomes
visible after every shard, the signed manifest and its read-back verification
succeed.

Activation uses two alternating small pointer files. The inactive slot is
written last, after the new pack is complete. Before `status()`, `update()` or
`loadEntities()` accepts a slot, it verifies the pointer's manifest digest,
the detached signature and every referenced shard. A torn pointer or a pack
with a missing/damaged manifest, signature or shard is skipped; the client
writes a higher-sequence pointer that atomically promotes the previous
complete slot. This makes activation and damage fallback atomic without
relying on rename support.

Parsed entity rows are cached by current `packVersion`, current manifest
digest and shard SHA-256, never by shard SHA alone. A successful persistent
fallback also clears the in-memory entity cache, so one client instance cannot
continue returning rows labelled with the pre-fallback `packVersion`.

Rollback swaps `currentVersion` and `previousVersion` through the same pointer
mechanism. Both packs remain on disk, allowing a roll-forward after rollback.
The current implementation intentionally does not garbage-collect old pack
directories or unreferenced content-addressed shards.

## Offline boundary

The service worker precaches the signed manifest, its detached signature and
the shards listed in `coreShards` alongside the application/runtime assets.
Additional shards are fetched from the same origin and verified before they are
written to OPFS. Uploaded documents, extracted text, token maps, results and
IndexedDB user entities never enter this module or its OPFS directory.

## Follow-on PR boundaries

1. User dictionary isolation: implemented separately in
   `docs/p3/user-dictionary-isolation.md`.
2. Migration: IndexedDB v2/v3 compatibility, v1 `/api/migrate/export` import,
   Fernet fixture parity and wrong-passphrase safety are implemented separately
   in `docs/p3/data-migration.md`.
3. i18n/cleanup: final key parity, source badges, gate/degradation copy and
   non-cutover dead-code removal.
4. Release/docs: static deployment, offline install/upgrade, sizing and machine
   recommendations.
5. Cutover: remove v1 server/NLP/PDF/email paths and extras. This is a separate
   review gate after the four slices above, never part of this PR.
