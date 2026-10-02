"""Tiny i18n layer for Lethe's UI.

Two languages (English + Simplified Chinese) are supported; their strings live
in ``lethe/locales/<code>.json``.  A :class:`Translator` is created once per
page build with the language resolved for that client and is passed down to
every panel builder, so a page is rendered in one language consistently and
switching languages simply rebuilds the page.

Language resolution order for a fresh page load:

1. a ``?lang=`` query parameter (usable for deep links),
2. the ``lethe_lang`` cookie (mirrored from localStorage by the in-header
   language switcher),
3. the browser's ``Accept-Language`` header,
4. ``DEFAULT_LANG`` (``zh``).

The user's choice itself is persisted in the browser (localStorage, plus a
cookie mirror so the server can pick it up synchronously at page-build time),
so it survives a refresh or a restart.
"""
from __future__ import annotations

import json
import os
from typing import Any

LOCALES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "locales")
SUPPORTED_LANGS: tuple[str, ...] = ("zh", "en")
DEFAULT_LANG = "zh"
FALLBACK_LANG = "en"
LANG_LABELS: dict[str, str] = {"zh": "中文", "en": "English"}
COOKIE_NAME = "lethe_lang"
STORAGE_KEY = "lethe.lang"

_cache: dict[str, dict[str, Any]] = {}


def _load(lang: str) -> dict[str, Any]:
    if lang not in _cache:
        with open(os.path.join(LOCALES_DIR, f"{lang}.json"), encoding="utf-8") as fh:
            _cache[lang] = json.load(fh)
    return _cache[lang]


def normalize(lang: str | None) -> str | None:
    """Map 'zh-CN' / 'zh_CN' / 'en-US' / 'zh' to a supported code, else None."""
    if not lang:
        return None
    base = lang.replace("_", "-").split("-")[0].strip().lower()
    return base if base in SUPPORTED_LANGS else None


def from_accept_language(header: str | None) -> str | None:
    """First supported language in an Accept-Language header, honouring q-weights.

    'zh-CN,zh;q=0.9,en;q=0.8' -> 'zh'; 'en-US,en;q=0.9' -> 'en'."""
    if not header:
        return None
    entries: list[tuple[float, str]] = []
    for part in header.split(","):
        bits = part.split(";")
        tag = bits[0].strip()
        q = 1.0
        for b in bits[1:]:
            b = b.strip()
            if b.startswith("q="):
                try:
                    q = float(b[2:])
                except ValueError:
                    q = 0.0
        entries.append((-q, tag))
    for _, tag in sorted(entries):
        code = normalize(tag)
        if code:
            return code
    return None


def has_key(key: str) -> bool:
    """True if the key exists in a shipped locale. Used for optional UI text, such
    as a language the engine knows but the locale files don't translate yet."""
    return any(isinstance(_load(lang).get(key), str)
               for lang in dict.fromkeys((DEFAULT_LANG, FALLBACK_LANG)))


def resolve(lang_param: str | None = None, cookie: str | None = None,
            accept_language: str | None = None) -> str:
    """Pick the language for a page load (see module docstring for priority)."""
    return (normalize(lang_param) or normalize(cookie)
            or from_accept_language(accept_language) or DEFAULT_LANG)


class Translator:
    """Locale lookup bound to one language. ``translator(key, **kw)`` returns
    the translated string, formatting ``{name}`` placeholders with ``kw``.

    Unknown keys fall back to English and then to the key itself, so a missing
    translation degrades to a readable string instead of crashing the UI.
    """

    def __init__(self, lang: str | None):
        self.lang = normalize(lang) or DEFAULT_LANG

    def __call__(self, key: str, **kwargs: Any) -> str:
        text = self._lookup(key)
        if kwargs:
            try:
                return text.format(**kwargs)
            except (KeyError, IndexError, ValueError):
                return text  # leave unformatted rather than raise in the UI
        return text

    def _lookup(self, key: str) -> str:
        for lang in (self.lang, FALLBACK_LANG):
            val = _load(lang).get(key)
            if isinstance(val, str):
                return val
        return key

    def language(self) -> str:
        return self.lang
