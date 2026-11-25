# Preset dictionary source

`entities.jsonl` is the editable source for the signed preset layer. The
current file is a small bootstrap set drawn from the repository's synthetic
test corpus; it proves the distribution contract and is not a production
dictionary curation decision.

Each line contains `canonical`, `type`, optional `aliases`, `shard` and
`tier` (`core` or `full`). `core` rows are written to the core shard and also
to their topic shard; all other rows are full-pack only. Rebuild the signed
artifact with `pixi run dictionary-build` after curating this file.
