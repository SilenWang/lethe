# Lethe — notes for AI agents

Project memory lives in [`.claude/memory/`](.claude/memory/). Read
[`.claude/memory/MEMORY.md`](.claude/memory/MEMORY.md) first for the index, then the
linked files for details. Add new persistent facts there (not under any per-user path)
so they travel with the repo.

Lethe is a fully local, reversible document de-identifier delivered as an
installable PWA. Browser code lives under `web/`; the retained Python package is
the deterministic core used in Pyodide plus legacy-data compatibility helpers.
Keep the static UI, release runbook and README current with feature changes.
