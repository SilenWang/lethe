# Data migration

The browser store supports both current backups and the JSON response from the
v1 `POST /api/migrate/export` endpoint.

## v1 export shape

```json
{
  "entities": [{"canonical": "Acme", "type": "COUNTERPARTY", "aliases": []}],
  "token_types": ["PROJECT"],
  "jobs": [{
    "job_id": "20260101-000000-abcd",
    "created": "2026-01-01T00:00:00Z",
    "source_files": ["memo.docx"],
    "replacements": 3,
    "mapping": {"[PERSON_001]": "John Smith"}
  }],
  "errors": []
}
```

`window.lethMigration.importExport(data, passphrase)` imports this shape
directly. Entities go through the user-layer normalisation, token types are
unioned, and v1 `job_id` records are re-encrypted through the normal browser
`saveJob` path. The new passphrase is used exactly: if it is blank, imported
mappings are stored unprotected even when the old vault had a passphrase. The
Settings backup file picker auto-detects the same shape.

## Wrong passphrase

The v1 endpoint reports every vault record it could not decrypt in `errors`.
When that list is non-empty, the browser rejects the complete import before
writing any entity, token type or job. The same guard applies to a downloaded
v1 export file, so a wrong passphrase cannot overwrite existing browser data.

## Legacy Fernet fixture

`tests/fixtures/legacy-vault-2026-01-01.json` is a frozen salt + Fernet
ciphertext record produced with the v1 PBKDF2/Fernet format. The Python parity
test checks that `cryptography` still decrypts it to the expected mapping and
that a wrong passphrase is rejected.
