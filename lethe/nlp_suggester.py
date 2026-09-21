"""
Optional NLP-based name/organisation suggester (Microsoft Presidio + spaCy),
with on-demand, per-language, per-model downloads and switching.

Every language offers several spaCy models -- small (sm) through large (lg),
plus the English transformer -- so detection recall can be raised without
reinstalling the app: download a bigger model from Settings and switch to it;
the switch takes effect immediately (and is remembered for next time).

English sm ships bundled and works fully offline; every other model is a
one-off online download. Downloaded models are detected by script: a Chinese
model only runs on text that actually contains Chinese characters, etc.

This powers the *suggestion* lane only -- candidate people and counterparties not
already in the dictionary, surfaced for the human reviewer. It never auto-redacts.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
from functools import lru_cache

from . import DATA_DIR

_BASE = "https://github.com/explosion/spacy-models/releases/download"
_VERSION = "3.8.0"  # all catalogue models ship at the 3.8.0 release line
_SELECTION_PATH = os.path.join(DATA_DIR, "nlp_models.json")

# Each language: the unicode ranges that imply "this script is present in the
# text" (None = always run when installed, e.g. Latin scripts), the Tesseract
# OCR model code(s) downloaded alongside the first model so that adding a
# language enables BOTH name detection and OCR ("ocr_size" is just that OCR
# download), and the spaCy models offered with their download sizes.
# Model entries: "name", "size", "builtin" (ships with the app, can't be
# removed), "default" (the preferred model: used as soon as it is installed,
# so English and Chinese prefer the largest recall model, `lg`; falling back
# to whatever is installed when it isn't),
# "requires" (extra pip packages a model needs, e.g. Transformers for the
# English transformer) and an optional "note".
LANGUAGES = [
    {"code": "en", "label": "English", "ranges": None, "ocr": [], "ocr_size": None,
     "note": "Latin script — checked in every document",
     "models": [
        {"name": "en_core_web_sm", "size": "~12 MB", "builtin": True,
         "note": "Bundled — works fully offline (fallback until lg is installed)"},
        {"name": "en_core_web_md", "size": "~32 MB"},
        {"name": "en_core_web_lg", "size": "~382 MB", "default": True,
         "note": "Default — best recall (word vectors)"},
        {"name": "en_core_web_trf", "size": "~436 MB (+ PyTorch)",
         "requires": ["spacy-transformers"],
         "note": "Transformer — most accurate, heaviest"},
     ]},
    {"code": "zh", "label": "Chinese", "ranges": [(0x3400, 0x9FFF), (0xF900, 0xFAFF)],
     "ocr": ["chi_sim", "chi_tra"], "ocr_size": "~24 MB",
     "note": "CJK script — run when Chinese characters appear",
     "models": [
        {"name": "zh_core_web_sm", "size": "~48 MB"},
        {"name": "zh_core_web_md", "size": "~74 MB"},
        {"name": "zh_core_web_lg", "size": "~575 MB", "default": True,
         "note": "Default — best recall for Chinese names"},
     ]},
    {"code": "ja", "label": "Japanese", "ranges": [(0x3040, 0x30FF), (0x4E00, 0x9FFF), (0xFF66, 0xFF9F)],
     "ocr": ["jpn"], "ocr_size": "~14 MB",
     "note": "CJK script — run when Japanese characters appear",
     "models": [
        {"name": "ja_core_news_sm", "size": "~70 MB", "default": True},
        {"name": "ja_core_news_md", "size": "~40 MB"},
        {"name": "ja_core_news_lg", "size": "~529 MB"},
     ]},
    {"code": "ko", "label": "Korean", "ranges": [(0xAC00, 0xD7AF)],
     "ocr": ["kor"], "ocr_size": "~12 MB",
     "note": "Hangul script — run when Korean characters appear",
     "models": [
        {"name": "ko_core_news_sm", "size": "~36 MB", "default": True},
        {"name": "ko_core_news_md", "size": "~66 MB"},
        {"name": "ko_core_news_lg", "size": "~220 MB"},
     ]},
]

# Compiled script tests, used to skip models whose script isn't in the text.
for _lang in LANGUAGES:
    if _lang["ranges"]:
        _lang["_re"] = re.compile(
            "[" + "".join(f"\\u{a:04x}-\\u{b:04x}" for a, b in _lang["ranges"]) + "]")
    else:
        _lang["_re"] = None

_PRESIDIO_TO_TYPE = {"PERSON": "PERSON", "ORGANIZATION": "COUNTERPARTY"}
# spaCy label -> Presidio entity, applied per language by the NlpEngineProvider
# (PER/PERSON -> PERSON; ORG/FAC/COMPANY -> ORGANIZATION; the geographic labels
# GPE/LOC/NORP also map to ORGANIZATION -- place names are sensitive too, so a
# city/province/country is surfaced as a counterparty candidate like any other
# organisation. They stay *suggestions*, so the reviewer still decides.)
_NER_CONFIG = {
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],  # replaced per language
    "ner_model_configuration": {
        "model_to_presidio_entity_mapping": {
            "PER": "PERSON", "PERSON": "PERSON", "ORG": "ORGANIZATION",
            "FAC": "ORGANIZATION", "COMPANY": "ORGANIZATION",
            "GPE": "ORGANIZATION", "LOC": "ORGANIZATION",
            "NORP": "ORGANIZATION"},
        "low_confidence_score_multiplier": 0.4,
        "low_score_entity_names": [],
    },
}


# ---- the active model per language (persisted, user-switchable) -------------
_SELECTION: dict[str, str] | None = None


def _read_selection() -> dict[str, str]:
    if not os.path.exists(_SELECTION_PATH):
        return {}
    try:
        with open(_SELECTION_PATH, encoding="utf-8") as fh:
            raw = json.load(fh)
        return {str(k): str(v) for k, v in raw.items() if isinstance(v, str)}
    except (OSError, ValueError):
        return {}


def _selection() -> dict[str, str]:
    global _SELECTION
    if _SELECTION is None:
        _SELECTION = _read_selection()
    return _SELECTION


def _reset_selection() -> None:
    global _SELECTION
    _SELECTION = _read_selection()


# ---- catalogue helpers ------------------------------------------------------
def _models_for(code: str) -> list[dict]:
    for L in LANGUAGES:
        if L["code"] == code:
            return L["models"]
    return []


def _find_model(name: str) -> tuple[dict | None, dict | None]:
    """Return (language_entry, model_entry) for a spaCy model name."""
    for L in LANGUAGES:
        for m in L["models"]:
            if m["name"] == name:
                return L, m
    return None, None


def _wheel_url(model: dict) -> str:
    return f"{_BASE}/{model['name']}-{_VERSION}/{model['name']}-{_VERSION}-py3-none-any.whl"


def is_installed(model: str) -> bool:
    try:
        return importlib.util.find_spec(model) is not None
    except (ImportError, ValueError):
        return False


def available() -> bool:
    """The suggester as a whole is usable if Presidio + the English model exist."""
    try:
        import presidio_analyzer  # noqa: F401
        import spacy  # noqa: F401
    except Exception:
        return False
    return is_installed("en_core_web_sm")


# ---- model selection ---------------------------------------------------------
def active_model(code: str) -> str | None:
    """The model actually used for detection: the user's selection if it's
    installed, else the language's default, else the first installed one."""
    installed = [m["name"] for m in _models_for(code) if is_installed(m["name"])]
    if not installed:
        return None
    chosen = _selection().get(code)
    if chosen in installed:
        return chosen
    for m in _models_for(code):
        if m.get("default") and m["name"] in installed:
            return m["name"]
    return installed[0]


def set_active_model(code: str, model: str) -> tuple[bool, str]:
    """Switch the active model for a language. Takes effect immediately.
    Returns (ok, message)."""
    lang = next((L for L in LANGUAGES if L["code"] == code), None)
    if lang is None:
        return False, f"Unknown language: {code}"
    if not any(m["name"] == model for m in lang["models"]):
        return False, f"Unknown model for {lang['label']}: {model}"
    if not is_installed(model):
        return False, f"{model} isn't installed yet — download it first."
    sel = _selection()
    sel[code] = model
    try:
        with open(_SELECTION_PATH, "w", encoding="utf-8") as fh:
            json.dump(sel, fh, indent=2, ensure_ascii=False)
    except OSError as exc:
        return False, f"Couldn't save the model choice: {exc}"
    _reset_selection()
    _analyzer.cache_clear()
    _spacy_model.cache_clear()
    return True, f"{lang['label']} detection now uses {model}."


def language_status() -> list[dict]:
    """One entry per language for the Settings page: the language, its note,
    OCR info and every offered model with install/active state."""
    out = []
    for L in LANGUAGES:
        active = active_model(L["code"])
        models = [{
            "name": m["name"], "size": m["size"], "builtin": bool(m.get("builtin")),
            "installed": is_installed(m["name"]), "active": m["name"] == active,
            "note": m.get("note", ""),
            "requires": list(m.get("requires", [])),
        } for m in L["models"]]
        out.append({"code": L["code"], "label": L["label"], "note": L["note"],
                    "ocr": list(L["ocr"]), "ocr_size": L["ocr_size"],
                    "active": active, "models": models})
    return out


# ---- install / download -------------------------------------------------------
def download_model(model: str) -> tuple[bool, str]:
    """pip-install one spaCy model wheel (plus any extra deps it needs) into
    this Python. Needs internet. Returns (ok, log_tail)."""
    _lang, m = _find_model(model)
    if m is None:
        return False, f"Unknown model: {model}"
    if m.get("builtin"):
        return True, "Built-in."
    if is_installed(model):
        return True, "Already installed."
    cmd = [sys.executable, "-m", "pip", "install", "--no-warn-script-location",
           "--disable-pip-version-check"]
    # Transformer models need their runtime on top of the wheel.
    cmd += m.get("requires", [])
    cmd.append(_wheel_url(m))
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    except Exception as exc:  # noqa: BLE001
        return False, f"Download failed: {exc}"
    importlib.invalidate_caches()
    ok = proc.returncode == 0
    if ok:
        _analyzer.cache_clear()
        _spacy_model.cache_clear()
    log = (proc.stdout + "\n" + proc.stderr).strip()
    return ok, log[-1500:]


def remove_model(model: str) -> tuple[bool, str]:
    """Uninstall a downloaded model. Built-in (bundled) models can't be
    removed. If the removed model was the active one, the language falls back
    to its default model. Returns (ok, log_tail)."""
    _lang, m = _find_model(model)
    if m is None:
        return False, f"Unknown model: {model}"
    if m.get("builtin"):
        return False, "A built-in model can't be removed."
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pip", "uninstall", "-y", "-q", model],
            capture_output=True, text=True, timeout=300)
    except Exception as exc:  # noqa: BLE001
        return False, f"Remove failed: {exc}"
    importlib.invalidate_caches()
    # find_spec() consults sys.modules first: a model that was loaded this
    # session would otherwise still report "installed" with its files gone.
    sys.modules.pop(model, None)
    _reset_selection()
    _analyzer.cache_clear()
    _spacy_model.cache_clear()
    ok = proc.returncode == 0
    return ok, (proc.stdout + "\n" + proc.stderr).strip()[-1500:]


# ---- detection ---------------------------------------------------------------
@lru_cache(maxsize=16)
def _analyzer(lang_code: str, model: str):
    """A Presidio AnalyzerEngine for one language running one spaCy model,
    plus any language-specific recognizer rules."""
    from presidio_analyzer import AnalyzerEngine, EntityRecognizer
    from presidio_analyzer.nlp_engine import NlpEngineProvider
    from presidio_analyzer.recognizer_result import RecognizerResult

    config = {"nlp_engine_name": "spacy",
              "models": [{"lang_code": lang_code, "model_name": model}],
              "ner_model_configuration": _NER_CONFIG["ner_model_configuration"]}
    engine = NlpEngineProvider(nlp_configuration=config).create_engine()
    analyzer = AnalyzerEngine(nlp_engine=engine, supported_languages=[lang_code])

    # Chinese-name rules. spaCy's zh models are trained on news corpora and
    # often miss short names in form-like text ("联系人：张三"), so a
    # context-anchored rule layer broadens coverage. Surname-anchored so we
    # don't flag arbitrary 2-4-char CJK runs (brands, place names, offices).
    if lang_code == "zh":

        class ChineseNameRecognizer(EntityRecognizer):
            def __init__(self):
                super().__init__(supported_entities=["PERSON"],
                                 name="ChineseNameRecognizer",
                                 supported_language="zh", version="1.0.0")

            def load(self):  # noqa: D401 — nothing to load
                pass

            def get_supported_entities(self):
                return ["PERSON"]

            def analyze(self, text, entities, nlp_artifacts=None):
                if "PERSON" not in (entities or []):
                    return []
                out = []
                for m in _ZH_NAME_RE.finditer(text):
                    g = 1 if m.group(1) else 2
                    out.append(RecognizerResult(entity_type="PERSON", start=m.start(g),
                                                end=m.end(g), score=0.85))
                return out

        analyzer.registry.add_recognizer(ChineseNameRecognizer())

    return analyzer


@lru_cache(maxsize=4)
def _spacy_model(model: str):
    import spacy
    return spacy.load(model)


# Chinese-name rule: a name is anchored on a common surname and must sit either
# right before a title/honorific ("张三先生") or right after a form/contact label
# ("联系人：张三") — anchoring on a surname *and* on one of those two contexts keeps
# arbitrary 2-4-char CJK runs (brands, place names, job titles) out of the
# suggestion lane. "_ZH_SURNAMES" is the ~100 most common Chinese surnames
# (~85% of the population). A trailing title can end up inside a label-prefixed
# span ("联系人：王先生"); that is left to the reviewer, who sees the highlight.
_ZH_SURNAMES = ("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜"
                "戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐"
                "费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和"
                "穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮"
                "蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯"
                "昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴")
_ZH_TITLE = ("先生|女士|小姐|老师|经理|总监|董事长|总裁|总经理|副经理|主任|教授|博士|"
             "律师|医师|会计|工程师|代表|同志|局长|部长|院长|校长")
_ZH_PREFIX = ("姓名|名字|联系人|联络人|负责人|签署人|签字人|授权代表|法定代表人|委托代表|"
              "甲方|乙方|丙方|由|致|尊敬的|给")
_ZH_NAME = rf"[{_ZH_SURNAMES}][\u4e00-\u9fff]{{1,2}}"
_ZH_NAME_RE = re.compile(
    rf"({_ZH_NAME})(?=(?:{_ZH_TITLE}))"                        # 张三先生 / 王女士
    rf"|(?:(?:{_ZH_PREFIX})[：: \u3000]{{0,2}})({_ZH_NAME})(?![\u4e00-\u9fff])")


def _analyze(lang_code: str, model: str, text: str, min_score: float) -> list[tuple[int, int, str]]:
    """Run one language through its Presidio analyzer; falls back to a bare
    spaCy pass if Presidio can't analyse the language."""
    try:
        results = _analyzer(lang_code, model).analyze(
            text=text, language=lang_code, entities=["PERSON", "ORGANIZATION"],
            score_threshold=min_score)
        out = []
        for r in results:
            t = _PRESIDIO_TO_TYPE.get(r.entity_type)
            if t:
                out.append((r.start, r.end, t))
        return out
    except Exception:  # noqa: BLE001 — fall back to raw spaCy for this language
        return _spacy_lang(text, model)


def _spacy_lang(text: str, model: str) -> list[tuple[int, int, str]]:
    try:
        nlp = _spacy_model(model)
    except Exception:
        return []
    out = []
    for ent in nlp(text).ents:
        lab = ent.label_.upper()
        if "PER" in lab:
            t = "PERSON"
        elif "ORG" in lab or "COMP" in lab or lab == "FAC":
            t = "COUNTERPARTY"
        else:
            continue
        out.append((ent.start_char, ent.end_char, t))
    return out


def suggest(text: str, min_score: float = 0.40) -> list[tuple[int, int, str]]:
    """Return [(start, end, internal_type)] candidate people/organisations,
    across English plus any installed language whose script is present, each
    with the user's currently selected model for that language."""
    if not text.strip():
        return []
    spans: list[tuple[int, int, str]] = []
    for L in LANGUAGES:
        model = active_model(L["code"])
        if not model:
            continue
        if L["_re"] is not None and not L["_re"].search(text):
            continue
        spans += _analyze(L["code"], model, text, min_score)
    # de-duplicate identical spans (different languages/models may agree)
    seen, out = set(), []
    for s, e, t in spans:
        if (s, e) not in seen:
            seen.add((s, e))
            out.append((s, e, t))
    return out
