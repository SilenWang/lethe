"""i18n: locale integrity, translator behaviour, and no hardcoded UI English.

These tests are deliberately dependency-free (pytest only) so CI stays fast —
they check the locale files, the translator, and the app source itself.
"""
from __future__ import annotations

import ast
import json
import os
import re
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from lethe import i18n  # noqa: E402
from lethe.i18n import Translator  # noqa: E402

APP = os.path.join(ROOT, "app.py")
LOCALES = os.path.join(ROOT, "lethe", "locales")


def _locale(lang: str) -> dict:
    with open(os.path.join(LOCALES, f"{lang}.json"), encoding="utf-8") as fh:
        return json.load(fh)


EN = _locale("en")
ZH = _locale("zh")


# ---------------------------------------------------------------- locale files
def test_both_languages_are_shipped():
    assert set(i18n.SUPPORTED_LANGS) == {"zh", "en"}
    for lang in i18n.SUPPORTED_LANGS:
        assert os.path.exists(os.path.join(LOCALES, f"{lang}.json"))


def test_locales_have_identical_keys():
    assert set(EN) == set(ZH), f"key mismatch: {set(EN) ^ set(ZH)}"


def test_locale_values_are_non_empty_strings():
    for lang, data in (("en", EN), ("zh", ZH)):
        for key, value in data.items():
            assert isinstance(value, str) and value.strip(), f"{lang}:{key} is empty"


def test_english_locale_is_not_the_chinese_one():
    """A copy/paste regression guard: no key may hold identical prose in both
    languages unless it is language-neutral (product names, tokens, markup-only)."""
    neutral = {"ref.utc", "ref.token", "col.count"}  # language-neutral symbols
    identical = [k for k in EN if EN[k] == ZH[k] and k not in neutral]
    assert not identical, f"untranslated (identical) values: {identical}"


def test_format_placeholders_match_across_languages():
    for key in EN:
        assert set(re.findall(r"\{(\w+)\}", EN[key])) == set(re.findall(r"\{(\w+)\}", ZH[key])), \
            f"{key}: placeholder mismatch"


def test_guide_and_about_are_translated():
    for key in ("guide.md", "about.html"):
        assert EN[key] != ZH[key], f"{key} was not translated"
        assert len(ZH[key]) > 300, f"{key} looks truncated"


# ------------------------------------------------------------------ translator
def test_translator_returns_the_language_value():
    assert Translator("zh")("tab.settings") == ZH["tab.settings"]
    assert Translator("en")("tab.settings") == EN["tab.settings"]


def test_translator_formats_placeholders():
    assert Translator("en")("restore.found", count=3) == "Found 3 distinct token(s)"
    assert "3" in Translator("zh")("restore.found", count=3)
    # language-neutral placeholder keeps the token in place
    assert "abc123" in Translator("zh")("reid.deleted", job="abc123")


def test_translator_tolerates_bad_input():
    t = Translator("zh")
    assert t("deid.summary", count=2)              # formatted
    assert t("deid.summary", count=2, nope=1)      # unused kwarg is ignored
    assert t("deid.summary")                        # missing kwarg -> raw template
    assert t("no.such.key") == "no.such.key"        # unknown key degrades visibly


def test_normalize_and_accept_language():
    assert i18n.normalize("zh-Hans-CN") == "zh"
    assert i18n.normalize("en_US") == "en"
    assert i18n.normalize("de") is None
    assert i18n.from_accept_language("en-US,en;q=0.9,zh;q=0.8") == "en"
    assert i18n.from_accept_language("de,zh-CN;q=0.9,en;q=0.5") == "zh"
    assert i18n.from_accept_language("de-DE,fr;q=0.8") is None


def test_language_resolution_order():
    # explicit ?lang= wins, then the cookie, then the browser, then the default
    assert i18n.resolve("en", "zh", "zh-CN,zh;q=0.9") == "en"
    assert i18n.resolve(None, "zh", "en-US,en;q=0.9") == "zh"
    assert i18n.resolve(None, None, "zh-TW,zh;q=0.9") == "zh"
    assert i18n.resolve(None, None, "en-GB,en;q=0.9") == "en"
    assert i18n.resolve(None, None, "de-DE,fr;q=0.8") == i18n.DEFAULT_LANG
    assert i18n.resolve(None, None, None) == i18n.DEFAULT_LANG


# ------------------------------------------------------------------ app source
def _app_source() -> str:
    with open(APP, encoding="utf-8") as fh:
        return fh.read()


def _tr_keys(source: str) -> set[str]:
    """Literal keys passed to tr(...) anywhere in the app."""
    keys = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                and node.func.id == "tr" and node.args \
                and isinstance(node.args[0], ast.Constant):
            keys.add(node.args[0].value)
    return keys


def test_every_tr_key_resolves():
    keys = _tr_keys(_app_source())
    assert len(keys) > 150, f"suspiciously few tr() keys: {len(keys)}"
    missing = sorted(k for k in keys if k not in EN or k not in ZH)
    assert not missing, f"keys missing from a locale file: {missing}"


def test_every_locale_key_is_used():
    """No dead strings: every key is referenced by the UI (the review-table badge
    labels are passed dynamically, so they are added explicitly)."""
    keys = _tr_keys(_app_source()) | {"badge.known", "badge.pattern",
                                      "badge.suggested", "badge.manual"}
    unused = sorted(k for k in EN if k not in keys)
    assert not unused, f"locale keys never used by the app: {unused}"


def _ui_source() -> str:
    """app.py without comments or docstrings (both are developer-facing, not UI)."""
    import io as _io
    import tokenize

    tokens = tokenize.generate_tokens(_io.StringIO(_app_source()).readline)
    cleaned = "".join(t.string for t in tokens if t.type != tokenize.COMMENT)
    tree = ast.parse(_app_source())
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            doc = ast.get_docstring(node, clean=False)
            if doc:
                cleaned = cleaned.replace(doc, "")
    return cleaned


@pytest.mark.parametrize("text", [
    # page titles, tabs, buttons
    "De-identify", "Re-identify", "Entity dictionary", "Add documents",
    "Try a sample memo", "Redact selection", "Confirm & export",
    "Generate de-identified file(s)", "Past conversions", "Bring the real names back",
    "Scan for tokens", "Restore document", "Save dictionary", "Bulk import from a list",
    "Detection & OCR languages", "Token types", "Files & folders", "About Lethe",
    # guidance, tooltips, notifications
    "Tick = redact", "Passphrase (optional)", "Blank passphrase =",
    "Select any text in the document below", "Select a conversion from the list above",
    "Upload a tokenised file or paste some text first",
    "Scanning for names", "Generating de-identified file(s)",
    "Drop / browse files", "Local · offline", "Toggle light / dark",
    "How to use this tool", "Keep this file secure", "DE-IDENTIFICATION REFERENCE",
])
def test_no_hardcoded_ui_english_left(text):
    """The DoD's first bullet: no user-visible English may remain hardcoded in the
    app source — it must come from a locale file."""
    assert text not in _ui_source(), f"hardcoded UI English still in app.py: {text!r}"


def test_guide_and_about_text_left_the_source():
    """The long help/About copy moved into the locale files; the sample *document*
    (content, not UI copy) legitimately stays in the source."""
    source = _app_source()
    assert "GUIDE_MD" not in source
    assert "ABOUT_HTML" not in source
    assert 'Dear Mr John Smith' in source  # the demo memo is content, not UI


# ------------------------------------------------------- language persistence
def test_switching_language_persists_to_the_browser(monkeypatch):
    """The choice must be written to localStorage (browser-side persistence) and
    mirrored into a cookie so the server can render it on the next load."""
    import app as lethe_app

    captured = {}

    def fake_run_javascript(script, *args, **kwargs):
        captured["script"] = script

    monkeypatch.setattr(lethe_app.ui, "run_javascript", fake_run_javascript)
    lethe_app._switch_language("en")

    script = captured["script"]
    assert f"{i18n.STORAGE_KEY}" in script       # localStorage key
    assert f"'en'" in script or '"en"' in script
    assert i18n.COOKIE_NAME in script            # cookie mirror
    assert "location.reload()" in script          # re-render in the new language
    assert "localStorage.setItem" in script


def test_reference_file_is_localised():
    """The exported token → name reference follows the UI language."""
    import app as lethe_app

    job = lethe_app._reference_text(_tr_for("zh"), "job-1", "2026-01-01T00:00:00",
                                    ["a.docx"], {"[PERSON_001]": "Jane Doe"}).decode("utf-8")
    assert ZH["ref.title"] in job
    assert EN["ref.title"] not in job
    assert "[PERSON_001]" in job and "Jane Doe" in job

    job_en = lethe_app._reference_text(_tr_for("en"), "job-1", "2026-01-01T00:00:00",
                                       ["a.docx"], {"[PERSON_001]": "Jane Doe"}).decode("utf-8")
    assert EN["ref.title"] in job_en


def _tr_for(lang: str) -> Translator:
    return Translator(lang)
