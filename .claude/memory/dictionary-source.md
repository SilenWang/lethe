---
name: dictionary-source
description: Where the preset dictionary lives (dictionary/entities.yaml), how it is validated and rebuilt, and why dictionary-check compares source to pack
metadata:
  type: project
---

The preset dictionary's editable source is **`dictionary/entities.yaml`**
(schema version 1, one `entities` list). `dictionary/README.md` is the editing
guide; `dictionary/entities.example.yaml` is the minimal template. The old
`dictionary/entities.jsonl` was plain UTF-8 JSONL with no encoding layer and
was migrated one-to-one — each line became a list item, `aliases` became a
YAML list.

`tools/build_dictionary.py` loads it with a `SafeLoader` subclass that rejects
duplicate mapping keys (plain `safe_load` keeps the last one silently) and
decodes UTF-8 explicitly, so a GBK/ANSI re-save fails with the offending byte
and offset instead of a bare `UnicodeDecodeError`.

`verify_dictionary(..., source=...)` — what `--verify-only` and `web-check`
call — rebuilds the pack in memory and compares it byte for byte with
`web/dictionary`. Editing the YAML without running `pixi run dictionary-build`
therefore fails CI. `dictionary-check` also validates the source itself, so a
broken glossary fails before the signature check.

The checked-in values are synthetic (drawn from `samples/` and `corpus/`);
real customer, employee or counterparty values must never land in this public
repository. `pixi run dictionary-build` needs
`LETHE_DICTIONARY_SIGNING_KEY`; the shipped trust anchor lives in
`web/lib/dictionary-config.js` and is rewritten by the build.

Docs to keep in sync: `dictionary/README.md`, `docs/p3/dictionary-distribution.md`
and the README architecture note. Follows [[keep-docs-in-sync]].
