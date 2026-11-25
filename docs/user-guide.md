# Lethe PWA — user guide

## Supported files

Lethe accepts `.docx`, `.xlsx` and `.pptx`. Files larger than 35 MB are allowed
with a warning; files larger than 50 MB are rejected before parsing.

## Redact and restore

1. Open the installed PWA online once and wait until the offline-ready message
   appears.
2. Upload a supported document, inspect it, and run detection.
3. Review the proposed names, select what should be replaced, and generate the
   redacted file.
4. Give the tokenised file to the AI. Keep every `[TOKEN_NNN]` unchanged.
5. Paste or upload the AI result in the Restore panel and choose the matching
   conversion. Lethe restores the original names from the encrypted local
   mapping.

## User dictionary

The user dictionary is local to the browser. It is merged with the signed
preset dictionary only while matching; updates and rollbacks of preset packs do
not modify user entities. See
[`p3/user-dictionary-isolation.md`](p3/user-dictionary-isolation.md).

## Backup and migration

Browser backups include user entities, custom token types and conversion
mappings. Importing a v1 export re-encrypts each mapping with the passphrase
entered for this browser. A wrong old passphrase rejects the entire import
before IndexedDB is written. See [`p3/data-migration.md`](p3/data-migration.md).

The PWA header's **Import backup** button imports both current JSON backups and
previously downloaded v1 export files locally; it makes no server request.

## Offline and release notes

Deployment, upgrade, rollback, machine sizing and the manual offline acceptance
procedure are in [`p3/release.md`](p3/release.md).
