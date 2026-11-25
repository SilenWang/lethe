# User dictionary isolation

The user dictionary and signed preset dictionary have separate owners and
lifecycles.

## Storage boundary

- User entities live only in IndexedDB `user_entities`.
- Preset entities live only in the verified OPFS preset pack.
- Preset rows are never copied into `user_entities` by update, fallback,
  rollback, UI add, backup import or read-time merge.
- Every user row is normalised to `source: "user"`. `packVersion` is optional
  provenance and is `null` for rows created in the app; an imported value is
  retained with the row.

`source: "preset"` rows in a backup are skipped. Legacy backup rows without a
source are treated as user-owned, so older exports remain importable without
becoming part of the preset layer.

## Read-time merge

`web/lib/dictionary-merge.js` builds the detection list in memory:

1. load the current verified preset rows from OPFS;
2. load `user_entities` from IndexedDB;
3. merge by canonical name, with user type/canonical ownership winning;
4. union aliases so a user override does not discard a useful preset alias.

The merged result carries `source` and `packVersion` metadata for each row.
No merge result is written back to either storage layer.

The UI never offers a preset-only entity for the "add detected names to my
dictionary" action, preventing an update or review action from copying preset
content into the user layer.

## Backup format

Backups export user rows in both `entities` (legacy shape) and `user_entities`
(current shape). Each row includes:

```json
{"canonical":"Jane Doe","type":"PERSON","aliases":[],"source":"user","packVersion":null}
```

Imports accept either array, reject preset-owned rows and deduplicate the
remaining user rows through the normal `user_entities` merge path.

## Upgrade and rollback

Preset update, fallback and rollback only mutate the OPFS pointer, pack and
shard files. They do not read or write `user_entities`, delete the object
store, or rewrite its rows. Browser regressions snapshot the user layer before
upgrade and compare it exactly after upgrade and rollback.
