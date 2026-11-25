"""Static PWA locale integrity after the v1 cutover."""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
LOCALES = REPO / "lethe" / "locales"


def _locale(name: str) -> dict[str, str]:
    return json.loads((LOCALES / f"{name}.json").read_text(encoding="utf-8"))


def test_bilingual_locales_have_identical_nonempty_keys():
    english = _locale("en")
    chinese = _locale("zh")
    assert set(english) == set(chinese)
    assert len(english) >= 100
    for lang, rows in (("en", english), ("zh", chinese)):
        assert all(isinstance(value, str) and value.strip() for value in rows.values()), lang
        assert all(key.startswith(("p1.", "gate.")) for key in rows), lang


def test_placeholders_match():
    english = _locale("en")
    chinese = _locale("zh")
    for key in english:
        assert set(re.findall(r"\{\w+\}", english[key])) == set(
            re.findall(r"\{\w+\}", chinese[key])
        ), key


def test_all_static_markup_keys_exist():
    keys = set(
        re.findall(
            r'data-i18n="([^"]+)"',
            (REPO / "web" / "index.html").read_text(encoding="utf-8"),
        )
    )
    missing = keys - set(_locale("en"))
    assert not missing, sorted(missing)


def test_gate_and_dictionary_source_keys_exist():
    english = _locale("en")
    gate_source = (REPO / "lethe" / "gates.py").read_text(encoding="utf-8")
    gate_keys = set(re.findall(r'"(gate\.[a-z_.]+)"', gate_source))
    assert {"p1.source.dictionary", "p1.source.pattern", "p1.source.preset_rule",
            "p1.source.manual", "p1.source.unknown"} <= set(english)
    assert gate_keys
    assert gate_keys <= set(english)
