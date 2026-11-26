# Preset dictionary source

`entities.yaml` is the editable source for the signed preset layer. The
current file is a small bootstrap set drawn from the repository's synthetic
test corpus; it proves the distribution contract and contains no production
dictionary values. `entities.example.yaml` is the minimal synthetic template.

The former source was UTF-8 JSONL: one plain-text JSON object per line, with
no base64 or encryption layer. It was migrated one-to-one to YAML.

Edit only the `entities` list in `entities.yaml`. Every entry requires a
`canonical` string and a `type` string. Optional fields are:

- `aliases`: a YAML list of strings;
- `shard`: a lowercase id such as `people`, `counterparties` or a regional
  variant such as `people-zh`;
- `tier`: `core` or `full` (default `full`).

`core` rows are written to the core shard and their topic shard; all other
rows are full-pack only. The loader rejects unknown fields, wrong value
types, invalid shard ids or tiers, duplicate canonical values (case
insensitive), and empty documents. Missing files and malformed YAML report
the source path and, for syntax errors, the line and column.

Do not commit real customer, employee or counterparty values to this public
repository. Curated production source belongs in the private release source;
only the signed generated pack is published.

After editing, run:

```sh
pixi run dictionary-check
pixi run dictionary-build
```

`dictionary-build` requires `LETHE_DICTIONARY_SIGNING_KEY`. To migrate another
old `entities.jsonl`, move each line into the `entities` list and convert its
`aliases` JSON array to a YAML list; all other fields keep their names and
values.
