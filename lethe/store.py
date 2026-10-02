"""Dictionary logic for the known-entity list (people + counterparties).

Since the client-side storage migration the user's dictionary and custom token
types live in the browser (IndexedDB, see ``web_static/client-store.js``); the
server no longer writes ``entities.json`` / ``token_types.json``. This module
keeps the pure data logic shared by the UI bridge, plus read-only helpers for
the one-time migration of a legacy server-side ``DATA_DIR``.
"""
from __future__ import annotations

import json
import os

from .core import Entity


def rows_to_entities(rows: list[dict]) -> list[Entity]:
    """Convert stored/UI rows (dicts with canonical/type/aliases) to Entity
    objects. Blank canonical names are dropped; missing types fall back to
    COUNTERPARTY; aliases may be a list or a comma-separated string."""
    out: list[Entity] = []
    seen = set()
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        canonical = str(row.get("canonical") or "").strip()
        if not canonical or canonical.lower() in seen:
            continue
        seen.add(canonical.lower())
        aliases = row.get("aliases") or []
        if isinstance(aliases, str):
            aliases = [a.strip() for a in aliases.split(",") if a.strip() and a.strip() != canonical]
        else:
            aliases = [str(a).strip() for a in aliases
                       if str(a).strip() and str(a).strip().lower() != canonical.lower()]
        out.append(Entity(canonical=canonical,
                          type=str(row.get("type") or "COUNTERPARTY"),
                          aliases=aliases))
    return out


def entities_to_dicts(entities: list[Entity]) -> list[dict]:
    """Entity objects -> plain dicts for the IndexedDB store."""
    return [{"canonical": e.canonical, "type": e.type,
             "aliases": [a for a in (e.aliases or []) if a != e.canonical]} for e in entities]


def merge_entities(entities: list[Entity], new_entities: list[Entity]) -> int:
    """Add new entities into ``entities`` in place (dedup by canonical name,
    case-insensitive; any new aliases merge into an existing entry).
    Returns the number of brand-new entities added. Pure data logic — the
    browser store (client-store.js) mirrors it for client-side writes."""
    keys = {e.canonical.strip().lower(): e for e in entities}
    added = 0
    for ne in new_entities or []:
        k = (ne.canonical or "").strip().lower()
        if not k:
            continue
        if k in keys:
            ex = keys[k]
            have = {a.lower() for a in ex.aliases} | {k}
            for a in ne.aliases:
                if a.strip() and a.strip().lower() not in have:
                    ex.aliases.append(a.strip())
                    have.add(a.strip().lower())
        else:
            entities.append(ne)
            keys[k] = ne
            added += 1
    return added


# ---- legacy server-side DATA_DIR migration (read-only) ---------------------

def legacy_load_entities(data_dir: str) -> list[Entity]:
    """Read the pre-migration entities.json from an old DATA_DIR. Returns []
    when the file is absent or unreadable."""
    path = os.path.join(data_dir, "entities.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except (ValueError, OSError):
        return []
    return rows_to_entities(raw)


def legacy_load_token_types(data_dir: str) -> list[str]:
    """Read the pre-migration token_types.json from an old DATA_DIR."""
    path = os.path.join(data_dir, "token_types.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return [str(t) for t in json.load(fh) if str(t).strip()]
    except (ValueError, OSError):
        return []


def legacy_user_data_present(data_dir: str) -> bool:
    """True when an old DATA_DIR still holds user data that can be migrated."""
    vault_dir = os.path.join(data_dir, "vault")
    return (os.path.exists(os.path.join(data_dir, "entities.json"))
            or os.path.exists(os.path.join(data_dir, "token_types.json"))
            or os.path.isdir(vault_dir))
