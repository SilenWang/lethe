# Preset dictionary source

`entities.yaml` is the editable source for the signed preset layer, and the
only file to edit when curating the preset glossary. The current file is a
small bootstrap set drawn from the repository's synthetic test corpus; it
proves the distribution contract and contains no production dictionary
values. `entities.example.yaml` is the minimal synthetic template.

The former source was UTF-8 JSONL: one plain-text JSON object per line, with
no base64 or encryption layer. It was migrated one-to-one to YAML, so nothing
was hidden in the old encoding.

## Editing

Edit only the `entities` list in `entities.yaml`. The file must be UTF-8 (a
byte-order mark is tolerated); a non-UTF-8 file is rejected with the offending
byte and offset so you can re-save it. Every entry requires a `canonical`
string and a `type` string. Optional fields are:

- `aliases`: a YAML list of strings;
- `shard`: a lowercase id such as `people`, `counterparties` or a regional
  variant such as `people-zh`;
- `tier`: `core` or `full` (default `full`).

`core` rows are written to the core shard and their topic shard; all other
rows are full-pack only.

Minimal entry:

```yaml
schemaVersion: 1
entities:
  - canonical: Example Person
    type: PERSON
    aliases:
      - Example P.
    shard: people
    tier: full
```

## Validation

The loader rejects, naming the source path and the failing entry index:

- unknown top-level fields or unknown per-entity fields;
- a `schemaVersion` other than `1`, or an `entities` value that is not a
  non-empty list;
- a duplicate key written inside one mapping (YAML would otherwise silently
  keep the last value), reported with line and column. A standard merge key
  (`<<: *base`) is not a duplicate: only keys spelled out in the same mapping
  are compared;
- a non-string or empty `canonical` / `type`, an invalid shard id, or a `tier`
  other than `core` / `full`;
- an `aliases` value that is present but not a list, such as `null`, `""`, a
  number or a mapping; the message names the field and the offending type
  (e.g. `aliases must be a list of strings, got null`). A **missing**
  `aliases` key is valid and means "no aliases";
- a non-string element inside `aliases`, reported with its index
  (e.g. `aliases[1] must be a string, got number 7`);
- duplicate canonical values, compared case-insensitively;
- malformed YAML, reported with line and column.

Missing files report the path they were looked for at.

## Rebuild and check

After editing:

```sh
pixi run dictionary-build     # requires LETHE_DICTIONARY_SIGNING_KEY
pixi run dictionary-check
```

`dictionary-check` validates the edited source *and* proves it still rebuilds
to exactly the checked-in `web/dictionary` pack. Editing this file without
running `dictionary-build` therefore fails CI with a message telling you to
rebuild, instead of shipping a pack that disagrees with the reviewed source.

Do not commit real customer, employee or counterparty values to this public
repository. Curated production source belongs in the private release source;
only the signed generated pack is published.

To migrate another old `entities.jsonl`, move each line into the `entities`
list and convert its `aliases` JSON array to a YAML list; all other fields
keep their names and values.
