"""Lethe — deterministic dictionary matching and reversible tokenisation.

Document parsing and writing live in the same-origin browser runtime. The
Python package now contains only the shared deterministic core plus the pure
legacy-data compatibility helpers.

    from lethe import detect, assign_tokens, build_replacer, vault, ...
"""
from __future__ import annotations

import os
WEB_STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_static")

from . import core, store, vault  # noqa: E402
from .core import (  # noqa: E402
    Entity,
    _whole_word_regex,
    assign_tokens,
    build_replacer,
    build_restorer,
    detect,
)
from .store import (  # noqa: E402
    entities_to_dicts,
    merge_entities,
    rows_to_entities,
)
__all__ = [
    "WEB_STATIC",
    # submodules
    "core", "store", "vault",
    # core API
    "Entity", "assign_tokens", "build_replacer", "build_restorer", "detect",
    "_whole_word_regex",
    # entity dictionary (pure data logic; persistence lives in the browser)
    "entities_to_dicts", "merge_entities", "rows_to_entities",
]
