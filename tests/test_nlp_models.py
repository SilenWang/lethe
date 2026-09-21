"""Model catalogue + model switching for the NLP suggester.

Function-based tests, so pytest discovers them (pytest tests/). The tests that
need spaCy/Presidio/an actual model skip themselves when those aren't installed,
so the suite still runs on a lean install.
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lethe import nlp_suggester  # noqa: E402


def _with_temp_selection():
    """Point the persisted model choice at a throwaway file."""
    path = os.path.join(tempfile.mkdtemp(), "nlp_models.json")
    nlp_suggester._SELECTION_PATH = path
    nlp_suggester._SELECTION = None
    return path


def _uninstalled_model(code: str = "en") -> str | None:
    """A catalogue model that isn't downloaded in this environment (so tests
    that assume "not installed" hold on both lean and full installs)."""
    for L in nlp_suggester.LANGUAGES:
        if L["code"] == code:
            return next((m["name"] for m in L["models"]
                         if not nlp_suggester.is_installed(m["name"])), None)
    return None


def _default_model(code: str) -> str:
    """The catalogue's preferred model for a language (English/Chinese: lg)."""
    for L in nlp_suggester.LANGUAGES:
        if L["code"] == code:
            return next(m["name"] for m in L["models"] if m.get("default"))
    raise AssertionError(f"no language {code}")


def test_catalogue_shape():
    """Every language offers models, exactly one preferred (default) model, and
    the English one ships built-in (so the suggester is usable offline out of
    the box). English and Chinese prefer the largest recall model, `lg`."""
    codes = [L["code"] for L in nlp_suggester.LANGUAGES]
    assert {"en", "zh"} <= set(codes)
    for L in nlp_suggester.LANGUAGES:
        assert L["models"], f"{L['code']} has no models"
        assert sum(1 for m in L["models"] if m.get("default")) == 1
        names = [m["name"] for m in L["models"]]
        assert len(names) == len(set(names))
    en = next(L for L in nlp_suggester.LANGUAGES if L["code"] == "en")
    assert [m["name"] for m in en["models"] if m.get("builtin")] == ["en_core_web_sm"]
    assert _default_model("en") == "en_core_web_lg"
    assert _default_model("zh") == "zh_core_web_lg"
    # The bundled English model stays in the catalogue as the offline fallback.
    assert "en_core_web_sm" in [m["name"] for m in en["models"]]
    # English is not script-gated (Latin text never "contains English script").
    assert en["_re"] is None
    zh = next(L for L in nlp_suggester.LANGUAGES if L["code"] == "zh")
    assert zh["_re"].search("合同") and not zh["_re"].search("contract")


def test_wheel_urls():
    """Wheel URLs point at the pinned spaCy-models release."""
    for L in nlp_suggester.LANGUAGES:
        for m in L["models"]:
            url = nlp_suggester._wheel_url(m)
            assert url.startswith("https://github.com/explosion/spacy-models/releases/download/")
            assert f"/{m['name']}-{nlp_suggester._VERSION}/" in url
            assert url.endswith(f"{m['name']}-{nlp_suggester._VERSION}-py3-none-any.whl")


def test_active_model_prefers_default_and_falls_back():
    """With no user choice the preferred model (`lg`) is used once installed,
    the bundled small model is the offline fallback, and unknown/stale choices
    are ignored."""
    _with_temp_selection()
    if not any(nlp_suggester.is_installed(m["name"])
               for L in nlp_suggester.LANGUAGES if L["code"] == "en"
               for m in L["models"]):
        # Lean install: the [nlp] extra (spaCy + en_core_web_sm) isn't present,
        # so there is no model to fall back to and active_model() is None.
        pytest.skip("no spaCy models installed (lean install)")
    fallback = "en_core_web_sm"  # bundled with the [nlp] extra
    expected = ("en_core_web_lg" if nlp_suggester.is_installed("en_core_web_lg")
                else fallback)
    assert nlp_suggester.active_model("en") == expected
    assert nlp_suggester.active_model("nope") is None
    # A stale choice pointing at a not-yet-downloaded model is ignored.
    missing = _uninstalled_model("en")
    if missing:
        nlp_suggester._SELECTION = {"en": missing}
        assert nlp_suggester.active_model("en") == expected
    # A choice that isn't in the catalogue at all is ignored too.
    nlp_suggester._SELECTION = {"en": "en_core_web_xxl"}
    assert nlp_suggester.active_model("en") == expected


def test_user_can_switch_back_to_smaller_model():
    """A Settings choice overrides the lg default — switching back to sm/md
    keeps working (the whole point of keeping every model in the catalogue)."""
    _with_temp_selection()
    for name in ("en_core_web_sm", "en_core_web_md"):
        if not nlp_suggester.is_installed(name):
            continue
        ok, msg = nlp_suggester.set_active_model("en", name)
        assert ok and name in msg
        assert nlp_suggester.active_model("en") == name


def test_set_active_model_validation():
    """Switching to an unknown or not-yet-downloaded model is refused with a
    clear message; the built-in model can't be removed."""
    path = _with_temp_selection()
    missing = _uninstalled_model("en")
    if missing:
        ok, msg = nlp_suggester.set_active_model("en", missing)
        assert not ok and "download it first" in msg
    ok, msg = nlp_suggester.set_active_model("en", "en_core_web_xxl")
    assert not ok and "Unknown model" in msg
    ok, msg = nlp_suggester.set_active_model("fr", "en_core_web_sm")
    assert not ok and "Unknown language" in msg
    ok, msg = nlp_suggester.remove_model("en_core_web_sm")
    assert not ok and "built-in" in msg
    assert not os.path.exists(path)  # nothing was persisted by the failures


def test_set_active_model_persists_and_reloads():
    """A successful switch is written to disk and read back by a fresh load."""
    path = _with_temp_selection()
    ok, msg = nlp_suggester.set_active_model("en", "en_core_web_md")
    if not nlp_suggester.is_installed("en_core_web_md"):
        assert not ok  # not downloaded in this environment
        return
    assert ok and "en_core_web_md" in msg
    assert os.path.exists(path)
    nlp_suggester._SELECTION = None  # simulate a restart
    assert nlp_suggester.active_model("en") == "en_core_web_md"


def test_language_status_reports_state():
    status = nlp_suggester.language_status()
    assert {L["code"] for L in status} == {L["code"] for L in nlp_suggester.LANGUAGES}
    for L in status:
        assert L["active"] == nlp_suggester.active_model(L["code"])
        active = [m for m in L["models"] if m["active"]]
        assert len(active) <= 1
        for m in L["models"]:
            assert m["installed"] == nlp_suggester.is_installed(m["name"])
            assert m["active"] is False or m["installed"] is True


def test_download_model_unknown_name():
    ok, log = nlp_suggester.download_model("fr_core_news_sm")
    assert not ok and "Unknown model" in log


def test_chinese_name_spans():
    """The rule layer finds form-embedded names and title-suffixed names, and
    does not invent names out of ordinary CJK text."""
    text = "联系人：赵敏女士，由王建军（首席执行官）签署。上海华信资本管理有限公司成立于北京。"
    names = set()
    for m in nlp_suggester._ZH_NAME_RE.finditer(text):
        g = 1 if m.group(1) else 2
        names.add(text[m.start(g):m.end(g)])
    assert "赵敏" in names
    assert "王建军" in names
    assert not any(n in names for n in ("上海华信", "成立于", "北京"))


def test_suggest_spans_are_bounded():
    """suggest() only ever returns in-range spans, with or without models."""
    text = "John Smith of Acme Capital Partners signed. 联系人：赵敏女士。"
    for s, e, t in nlp_suggester.suggest(text):
        assert 0 <= s < e <= len(text)
        assert t in {"PERSON", "COUNTERPARTY"}
    assert nlp_suggester.suggest("   ") == []


def test_place_names_map_to_counterparty():
    """Place names are sensitive too: the geographic labels (GPE/LOC/NORP) map
    to ORGANIZATION so a city/province is surfaced as a counterparty candidate
    instead of being silently dropped."""
    mapping = nlp_suggester._NER_CONFIG["ner_model_configuration"][
        "model_to_presidio_entity_mapping"]
    for label in ("GPE", "LOC", "NORP"):
        assert mapping[label] == "ORGANIZATION"
    # …and a real model run actually surfaces places as COUNTERPARTY spans.
    model = "zh_core_web_lg"
    if not nlp_suggester.is_installed(model):
        return
    text = "上海华信资本管理有限公司位于上海市浦东新区，项目在江苏省苏州市开展。"
    places = [text[s:e] for s, e, t in
              nlp_suggester._analyze("zh", model, text, 0.40)
              if t == "COUNTERPARTY"]
    assert any("上海市" in p or "江苏省" in p or "苏州市" in p for p in places), places
