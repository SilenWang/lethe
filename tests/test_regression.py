"""Full-pipeline regression suite (VYB-354 / T7).

Runs the real engine end to end — extract -> detect -> tokenise -> redact ->
restore — over every supported document format, in both supported languages
(English + Simplified Chinese), plus the cross-cutting behaviour the VYB-354
work touches: pattern detection, custom token types, the interface language
and the spaCy model catalogue / switch.

Unlike the per-feature tests (test_doc.py, test_pptx.py, ...), this module is
deliberately matrix-shaped so a missing format/language combination is a test
failure, not a silent gap. It needs only the base package + pytest, so it runs
in CI on both Linux and Windows.

Runnable two ways::

    python -m pytest tests/test_regression.py -q     # CI
    python tests/test_regression.py                  # printed PASS/FAIL checklist
"""
from __future__ import annotations

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from email.message import EmailMessage  # noqa: E402

from docx import Document  # noqa: E402
from openpyxl import Workbook  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Inches  # noqa: E402

from lethe import (  # noqa: E402
    Entity,
    assign_tokens,
    build_replacer,
    build_restorer,
    detect,
    extract_text,
    file_kind,
    redact_document,
)

SAMPLES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "samples")

# --------------------------------------------------------------------------- #
# Fixtures: one bilingual corpus per language, rendered into every format.
# --------------------------------------------------------------------------- #

EN_LINES = [
    "Dear Mr John Smith,",
    "Acme Capital Partners (Acme) confirms the transaction with Meridian Holdings Pte Ltd.",
    "The mandate was led by Priya Raman and counter-signed by Jane Doe.",
    "Queries: john.smith@acme.com or +65 6789 1234. Reference account 1234-5678-9012.",
    "Kind regards,",
    "Jane Doe",
]

ZH_LINES = [
    "尊敬的张宏伟先生：",
    "上海华信资本管理有限公司（华信资本）与深圳市卓越科技有限公司签署了协议。",
    "本次交易由赵敏女士负责，李明远先生复核。",
    "联系方式：zhang@huaxin.cn 或 +86 21 5555 8888，账号 6222-0000-1234-5678。",
    "此致",
    "王建军",
]

EN_ENTS = [
    Entity("John Smith", "PERSON", ["Smith"]),
    Entity("Jane Doe", "PERSON", []),
    Entity("Priya Raman", "PERSON", []),
    Entity("Acme Capital Partners", "COUNTERPARTY", ["Acme"]),
    Entity("Meridian Holdings Pte Ltd", "COUNTERPARTY", []),
]

ZH_ENTS = [
    Entity("张宏伟", "PERSON", []),
    Entity("赵敏", "PERSON", []),
    Entity("李明远", "PERSON", []),
    Entity("王建军", "PERSON", []),
    Entity("上海华信资本管理有限公司", "COUNTERPARTY", ["华信资本"]),
    Entity("深圳市卓越科技有限公司", "COUNTERPARTY", []),
]

# Names/values that must never survive redaction, per language.
EN_SECRETS = ["John Smith", "Smith", "Jane Doe", "Priya Raman",
              "Acme Capital Partners", "Acme", "Meridian Holdings Pte Ltd",
              "john.smith@acme.com", "1234-5678-9012"]
ZH_SECRETS = ["张宏伟", "赵敏", "李明远", "王建军",
              "上海华信资本管理有限公司", "华信资本", "深圳市卓越科技有限公司",
              "zhang@huaxin.cn", "6222-0000-1234-5678"]

# What restore must bring back (canonicals only — aliases fold into canonicals).
EN_GOLD = ["John Smith", "Jane Doe", "Priya Raman",
           "Acme Capital Partners", "Meridian Holdings Pte Ltd"]
ZH_GOLD = ["张宏伟", "赵敏", "李明远", "王建军",
           "上海华信资本管理有限公司", "深圳市卓越科技有限公司"]


def _corpus(lang: str):
    return (EN_LINES, EN_ENTS, EN_SECRETS, EN_GOLD) if lang == "en" \
        else (ZH_LINES, ZH_ENTS, ZH_SECRETS, ZH_GOLD)


# ---- per-format builders (bytes in, bytes out) ---------------------------- #

def _build_docx(lines):
    doc = Document()
    doc.add_heading("Regression sample", level=1)
    for line in lines:
        doc.add_paragraph(line)
    t = doc.add_table(rows=1, cols=2)
    t.rows[0].cells[0].text = "Counterparty"
    t.rows[0].cells[1].text = "Contact"
    for line in lines[:2]:
        row = t.add_row().cells
        row[0].text, row[1].text = line, lines[0]
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _build_pptx(lines):
    prs = Presentation()
    s1 = prs.slides.add_slide(prs.slide_layouts[1])
    s1.shapes.title.text = lines[0]
    s1.placeholders[1].text = "\n".join(lines[1:])
    s1.notes_slide.notes_text_frame.text = lines[1]
    s2 = prs.slides.add_slide(prs.slide_layouts[5])
    tbl = s2.shapes.add_table(2, 2, Inches(1), Inches(1), Inches(6), Inches(2)).table
    tbl.cell(0, 0).text = "Counterparty"
    tbl.cell(0, 1).text = "Contact"
    tbl.cell(1, 0).text = lines[-1]
    tbl.cell(1, 1).text = lines[0]
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _build_xlsx(lines):
    wb = Workbook()
    ws = wb.active
    ws.title = "Register"
    ws.append(["Party", "Contact", "Email", "Amount"])
    for i, line in enumerate(lines, start=2):
        ws.append([line, lines[0], "x@example.com", i * 100])
    last = len(lines) + 1
    ws[f"D{last + 1}"] = f"=SUM(D2:D{last})"   # a formula that must survive redaction
    ws[f"C{last + 1}"] = "Total"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_txt(lines):
    return ("\n".join(lines) + "\n").encode("utf-8")


def _build_eml(lines):
    m = EmailMessage()
    m["From"] = "Sender <sender@example.com>"
    m["To"] = "Recipient <recipient@example.com>"
    m["Subject"] = lines[0]
    m.set_content("\n".join(lines))
    return m.as_bytes()


def _build_html(lines):
    body = "<br>".join(lines)
    return (f"<html><head><style>.x{{color:red}}</style></head><body>"
            f"<p>{body}</p><script>var x=1;</script></body></html>").encode("utf-8")


BUILDERS = {
    "docx": _build_docx,
    "pptx": _build_pptx,
    "xlsx": _build_xlsx,
    "txt": _build_txt,
    "eml": _build_eml,
    "html": _build_html,
}

# PDF is the one format we cannot synthesise here (the repo generates its
# samples with fpdf, not a runtime dependency): the committed English sample
# covers it, and CJK PDF text needs a font we don't ship — documented below.
FORMATS = ["docx", "pptx", "xlsx", "txt", "eml", "html", "pdf"]
LANGS = ["en", "zh"]


def _read_kind(data: bytes, ext: str) -> str:
    """How to re-extract a redacted output: pdf/eml/html/msg all become .docx."""
    return "docx" if ext == ".docx" else ext.lstrip(".")


# --------------------------------------------------------------------------- #
# The pipeline under test
# --------------------------------------------------------------------------- #

def run_case(fmt: str, lang: str) -> dict:
    """extract -> detect -> tokenise -> redact -> restore for one cell of the
    matrix. Raises AssertionError (with a readable message) on any failure."""
    lines, ents, secrets, gold = _corpus(lang)

    if fmt == "pdf":
        if lang != "en":
            raise AssertionError("zh pdf not synthesised — see FORMATS note")
        data = open(os.path.join(SAMPLES, "sample-memo.pdf"), "rb").read()
        # The committed PDF carries these names (see tools/make_samples.py).
        ents = [Entity("John Smith", "PERSON", ["Smith"]),
                Entity("Jane Doe", "PERSON", []),
                Entity("Priya Raman", "PERSON", []),
                Entity("Wibowo Santoso", "PERSON", []),
                Entity("Acme Capital Partners", "COUNTERPARTY", ["Acme"]),
                Entity("Meridian Holdings Pte Ltd", "COUNTERPARTY", []),
                Entity("Garuda Ventures", "COUNTERPARTY", [])]
        secrets = ["John Smith", "Jane Doe", "Priya Raman", "Wibowo Santoso",
                   "Acme Capital Partners", "Meridian Holdings Pte Ltd", "Garuda Ventures"]
        gold = ["John Smith", "Jane Doe", "Priya Raman", "Wibowo Santoso",
                "Acme Capital Partners", "Meridian Holdings Pte Ltd", "Garuda Ventures"]
    else:
        data = BUILDERS[fmt](lines)

    text = extract_text(data, fmt)
    assert text.strip(), f"{fmt}/{lang}: extraction returned no text"

    items = assign_tokens(detect(text, ents))
    repl, t2r = build_replacer(items)
    assert t2r, f"{fmt}/{lang}: nothing was detected (empty token map)"

    out, ext, hits = redact_document(data, fmt, repl)
    assert hits > 0, f"{fmt}/{lang}: redaction reported 0 hits"
    assert ext in (".docx", ".xlsx", ".pptx", ".txt"), f"{fmt}/{lang}: odd output ext {ext}"

    out_text = extract_text(out, _read_kind(out, ext))

    leaks = [s for s in secrets if s in out_text]
    assert not leaks, f"{fmt}/{lang}: secret(s) leaked into the redacted output: {leaks}"
    assert "[PERSON_" in out_text or "[COUNTERPARTY_" in out_text, \
        f"{fmt}/{lang}: no tokens found in the redacted output"

    restored, rhits = build_restorer(t2r)(out_text)
    missing = [g for g in gold if g not in restored]
    assert not missing, f"{fmt}/{lang}: restore did not bring back {missing}"
    assert rhits > 0, f"{fmt}/{lang}: restore reported 0 hits"

    # And restore back into the *document* (format-preserving), not just text.
    out2, ext2, _ = redact_document(out, _read_kind(out, ext), build_restorer(t2r))
    out2_text = extract_text(out2, _read_kind(out2, ext2))
    missing2 = [g for g in gold if g not in out2_text]
    assert not missing2, f"{fmt}/{lang}: in-document restore missing {missing2}"

    return {"format": fmt, "lang": lang, "chars": len(text), "hits": hits,
            "tokens": len(t2r), "restored": rhits, "output": ext}


# --------------------------------------------------------------------------- #
# pytest cases — the format x language matrix
# --------------------------------------------------------------------------- #

import pytest  # noqa: E402


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("fmt", FORMATS)
def test_format_language_matrix(fmt, lang):
    if fmt == "pdf" and lang == "zh":
        pytest.skip("CJK PDF synthesis needs a font Lethe doesn't ship (see module docstring)")
    run_case(fmt, lang)


def test_committed_samples_round_trip():
    """The repository's own sample files still de-identify and restore."""
    ents = [Entity("John Smith", "PERSON", ["Smith"]),
            Entity("Jane Doe", "PERSON", []),
            Entity("Priya Raman", "PERSON", []),
            Entity("Wibowo Santoso", "PERSON", []),
            Entity("Acme Capital Partners", "COUNTERPARTY", ["Acme"]),
            Entity("Meridian Holdings Pte Ltd", "COUNTERPARTY", []),
            Entity("Garuda Ventures", "COUNTERPARTY", [])]
    for name, kind in (("sample-memo.docx", "docx"),
                       ("sample-memo.pdf", "pdf"),
                       ("sample-counterparties.xlsx", "xlsx")):
        data = open(os.path.join(SAMPLES, name), "rb").read()
        assert file_kind(name) == kind
        text = extract_text(data, kind)
        repl, t2r = build_replacer(assign_tokens(detect(text, ents)))
        out, ext, hits = redact_document(data, kind, repl)
        out_text = extract_text(out, _read_kind(out, ext))
        assert hits > 0, f"{name}: 0 hits"
        assert "John Smith" not in out_text and "Acme" not in out_text, f"{name}: leak"
        restored, _ = build_restorer(t2r)(out_text)
        assert "John Smith" in restored, f"{name}: restore failed"


# --------------------------------------------------------------------------- #
# Cross-cutting regression checks
# --------------------------------------------------------------------------- #

def test_pattern_detection_round_trip():
    """Email / phone / account patterns are detected and reversible."""
    text = ("Reach John Smith at john.smith@acme.com or +65 6789 1234; "
            "account 1234-5678-9012.")
    ents = [Entity("John Smith", "PERSON", [])]
    items = assign_tokens(detect(text, ents))
    kinds = {it.type for it in items if it.source == "pattern"}
    assert {"EMAIL", "PHONE", "ACCOUNT"} <= kinds, f"missing pattern types: {kinds}"
    repl, t2r = build_replacer(items)
    red, hits = repl(text)
    assert hits >= 4
    for secret in ("john.smith@acme.com", "+65 6789 1234", "1234-5678-9012"):
        assert secret not in red, f"pattern value leaked: {secret}"
    back, _ = build_restorer(t2r)(red)
    for secret in ("john.smith@acme.com", "+65 6789 1234", "1234-5678-9012"):
        assert secret in back, f"pattern value not restored: {secret}"


def test_custom_token_types_round_trip():
    """A user-defined token type (e.g. PROJECT) tokenises as [PROJECT_001] and
    restores like any built-in type."""
    text = "Project Atlas is led by John Smith for Acme Capital Partners."
    ents = [Entity("Project Atlas", "PROJECT", []),
            Entity("John Smith", "PERSON", []),
            Entity("Acme Capital Partners", "COUNTERPARTY", [])]
    repl, t2r = build_replacer(assign_tokens(detect(text, ents)))
    red, _ = repl(text)
    assert "[PROJECT_001]" in red, red
    assert "Project Atlas" not in red
    back, _ = build_restorer(t2r)(red)
    assert "Project Atlas" in back and "John Smith" in back


def test_interface_language_switching():
    """Both interface languages render, the switcher changes the strings, and
    the resolver honours ?lang= / cookie / Accept-Language (T5 acceptance)."""
    from lethe import i18n
    from lethe.i18n import Translator

    assert set(i18n.SUPPORTED_LANGS) == {"zh", "en"}
    en, zh = Translator("en"), Translator("zh")
    keys = ["tab.deidentify", "hdr.language"]
    for k in keys:
        assert i18n.has_key(k), f"locale key missing: {k}"
        assert en(k) != zh(k), f"key {k} is identical in both languages"
    assert i18n.resolve("en", None, None) == "en"
    assert i18n.resolve(None, "zh", None) == "zh"
    assert i18n.resolve(None, None, "zh-CN,zh;q=0.9,en;q=0.8") == "zh"
    assert i18n.resolve(None, None, "en-US,en;q=0.9") == "en"
    # Unknown input falls back to the default language rather than raising.
    assert i18n.resolve("fr", "fr", "fr") == i18n.DEFAULT_LANG


def test_xlsx_formula_survives_redaction():
    """Redacting an .xlsx keeps its formulas (a documented invariant)."""
    from openpyxl import load_workbook

    data = _build_xlsx(EN_LINES)
    repl, _ = build_replacer(assign_tokens(detect(extract_text(data, "xlsx"), EN_ENTS)))
    out, ext, _ = redact_document(data, "xlsx", repl)
    assert ext == ".xlsx"
    wb = load_workbook(io.BytesIO(out))
    formulas = [c.value for row in wb.active.iter_rows() for c in row
                if isinstance(c.value, str) and c.value.startswith("=")]
    assert formulas, "formula lost during redaction"


def test_model_catalogue_switch_is_safe():
    """Model switching: the catalogue is well-formed, a not-yet-downloaded model
    is refused with a clear message, and a switch to an installed model takes
    effect (skipped on a lean install with no spaCy models)."""
    from lethe import nlp_suggester as ns

    for L in ns.LANGUAGES:
        assert L["models"]
        assert sum(1 for m in L["models"] if m.get("default")) == 1
    ok, msg = ns.set_active_model("en", "en_core_web_xxl")
    assert not ok and "Unknown model" in msg
    installed = [m["name"] for L in ns.LANGUAGES if L["code"] == "en"
                 for m in L["models"] if ns.is_installed(m["name"])]
    if not installed:
        pytest.skip("no spaCy models installed (lean install)")
    target = installed[0]
    ok, msg = ns.set_active_model("en", target)
    assert ok, msg
    assert ns.active_model("en") == target


# --------------------------------------------------------------------------- #
# Human-readable checklist (python tests/test_regression.py)
# --------------------------------------------------------------------------- #

def _main() -> int:
    rows, failed = [], 0
    for fmt in FORMATS:
        for lang in LANGS:
            if fmt == "pdf" and lang == "zh":
                rows.append((fmt, lang, "SKIP", "CJK PDF needs a bundled font"))
                continue
            try:
                info = run_case(fmt, lang)
                rows.append((fmt, lang, "PASS",
                             f"{info['hits']} hits, {info['tokens']} tokens -> {info['output']}"))
            except AssertionError as exc:  # noqa: PERF203
                failed += 1
                rows.append((fmt, lang, "FAIL", str(exc)))
    for name, fn in (("patterns", test_pattern_detection_round_trip),
                     ("custom token types", test_custom_token_types_round_trip),
                     ("xlsx formula", test_xlsx_formula_survives_redaction),
                     ("interface language", test_interface_language_switching),
                     ("model switch", test_model_catalogue_switch_is_safe)):
        try:
            fn()
            rows.append(("cross-cutting", name, "PASS", ""))
        except Exception as exc:  # noqa: BLE001
            if type(exc).__name__ == "Skipped":
                rows.append(("cross-cutting", name, "SKIP", str(exc)))
            else:
                failed += 1
                rows.append(("cross-cutting", name, "FAIL", str(exc)))

    width = max(len(r[0]) + len(r[1]) for r in rows) + 2
    print(f"{'case'.ljust(width)}result  detail")
    print("-" * 78)
    for fmt, lang, status, detail in rows:
        print(f"{(fmt + ' / ' + lang).ljust(width)}{status:<8}{detail}")
    print("-" * 78)
    print(f"{len(rows)} cases, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_main())