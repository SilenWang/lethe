r"""
Document De-identifier -- a local, reversible PII de-identification gate.

NiceGUI desktop UI. Everything runs on this machine; nothing is sent anywhere.
The engine lives in core / docio / vault / store / nlp_suggester -- this file is
purely the interface.

Run:  .venv313\Scripts\python.exe app.py   (or use the launcher)
"""
from __future__ import annotations

import os
import sys

# The Windows portable bundle runs on an embeddable Python whose path is fixed by
# a ._pth file and does NOT auto-add the script's directory, so add it explicitly
# here. Harmless for a normal checkout or a pip/pipx install (already importable).
# Paths to assets and user data are resolved absolutely (see lethe.WEB_STATIC /
# lethe.DATA_DIR), so no chdir is needed.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import html as _html
import io
import json
import re
import secrets
import urllib.parse
import zipfile
from datetime import datetime, timezone

from nicegui import app, run, ui

from lethe import (
    DATA_DIR,
    WEB_STATIC,
    Entity,
    _whole_word_regex,
    assign_tokens,
    build_replacer,
    build_restorer,
    clear_pdf_cache,
    detect,
    docio,
    extract_text,
    file_kind,
    i18n,
    load_entities,
    load_token_types,
    merge_entities,
    nlp_suggester,
    pdf_warnings,
    read_xlsx_grid,
    redact_document,
    save_entities,
    save_token_types,
    vault,
)

# ---- look & feel — "Lethe · the river of oblivion" theme --------------------
# A classical reskin in the same family as Argus ("The Watcher's Codex") and
# Pythia ("Oracle's Manuscript"): warm parchment neutrals, a Cinzel inscription
# wordmark, bronze-gold ornament and a Greek-key meander — with Lethe's own
# dusk-amethyst accent (sleep, poppies, forgetting). The same design tokens
# invert under dark mode (`body.body--dark`, toggled from the header) with no
# markup changes — exactly the token architecture the two sibling apps use.
PRIMARY = "#6a4690"  # dusk amethyst — Lethe's accent within the family
APP_VERSION = "1.3.1"
REPO_URL = "https://github.com/moonlight-lupin/lethe"

# Quasar brand palette — applied per page inside _build_index() (NiceGUI forbids
# UI calls in the global scope once an explicit @ui.page is used).
_BRAND_COLORS = dict(primary=PRIMARY, secondary="#4a3066", accent="#7d56a6",
                     positive="#3f7d4e", negative="#a83a2c", warning="#9b6f16", dark="#14110b")

# Review-table badge colours, kept in the amethyst/gold family.
TYPE_COLOR = {"PERSON": "deep-purple-6", "COUNTERPARTY": "amber-8", "OTHER": "pink-7",
              "EMAIL": "blue-grey-6", "PHONE": "blue-grey-6", "ACCOUNT": "blue-grey-6"}

# Editable, name-like types (vs. pattern types, which are read-only badges).
NAME_TYPES = ["PERSON", "COUNTERPARTY", "OTHER"]
# Reserved — users can't redefine these as custom types.
BUILTIN_TYPES = {"PERSON", "COUNTERPARTY", "OTHER", "EMAIL", "PHONE", "ACCOUNT"}


def _sanitize_type(s: str) -> str:
    """Normalise a user type name to a token-safe identifier, e.g.
    'Fund name' -> 'FUND_NAME' (tokens become [FUND_NAME_001])."""
    return re.sub(r"[^A-Za-z0-9]+", "_", (s or "").strip()).strip("_").upper()
# Source badges: label (a locale key — translated when a row is rendered)
# plus the Quasar colour for the review table.
SOURCE_BADGE = {"dictionary": ("badge.known", "deep-purple-6"),
                "pattern": ("badge.pattern", "blue-grey-6"),
                "suggestion": ("badge.suggested", "amber-8"),
                "manual": ("badge.manual", "pink-7")}


# The Settings → "Detection & OCR languages" list is built from the engine's
# nlp_suggester.LANGUAGES, whose labels ("English", "Chinese", …) are English.
# The UI maps each language to a locale key so the list follows the interface
# language; an unknown code falls back to the engine's own label, so a language
# added to the engine later still renders (just untranslated).
LANG_LABEL_KEYS = {"en": "lang.en", "zh": "lang.zh", "ja": "lang.ja", "ko": "lang.ko"}
# Engine annotations that are prose rather than a number + unit ("~72 MB" reads
# the same in both languages, "built-in" does not).
LANG_SIZE_KEYS = {"built-in": "settings.size_builtin"}


def _lang_name(tr, code: str, fallback: str) -> str:
    """Localised display name for a detection / OCR language."""
    key = LANG_LABEL_KEYS.get(code)
    return tr(key) if key and i18n.has_key(key) else fallback


def _lang_size(tr, size: str) -> str:
    """Localised download size annotation (numbers stay as they are)."""
    key = LANG_SIZE_KEYS.get(size)
    return tr(key) if key and i18n.has_key(key) else size


def _svg_uri(svg: str) -> str:
    return "data:image/svg+xml," + urllib.parse.quote(svg, safe="")


def _river_mark(gold: str, amethyst: str) -> str:
    """Lethe's emblem — three flowing currents, a dusk-amethyst middle stream."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
        f'<path d="M2 7.5 q3 -3 6 0 t6 0 t6 0" fill="none" stroke="{gold}" stroke-width="1.9" stroke-linecap="round"/>'
        f'<path d="M2 12.5 q3 -3 6 0 t6 0 t6 0" fill="none" stroke="{amethyst}" stroke-width="1.9" stroke-linecap="round"/>'
        f'<path d="M2 17.5 q3 -3 6 0 t6 0 t6 0" fill="none" stroke="{gold}" stroke-width="1.9" stroke-linecap="round"/>'
        '</svg>')


def _meander(stroke: str) -> str:
    """A Greek-key meander tile — the family's restrained classical divider."""
    return ("<svg xmlns='http://www.w3.org/2000/svg' width='20' height='13'>"
            f"<path d='M2 11 V2 H15 V11 H6 V5.5 H11 V8.5' fill='none' stroke='{stroke}' stroke-width='1.2'/></svg>")


_MARK_LIGHT = _svg_uri(_river_mark("#9a6a1d", "#6a4690"))
_MARK_DARK = _svg_uri(_river_mark("#d8a945", "#b79be0"))
_MEANDER_LIGHT = _svg_uri(_meander("#9a6a1d"))
_MEANDER_DARK = _svg_uri(_meander("#d8a945"))

THEME_CSS = """
<style>
/* Cinzel — Roman-inscription capitals, self-hosted (OFL) so the app stays
   fully offline. Used only for the wordmark. */
@font-face{font-family:"Cinzel";font-style:normal;font-weight:400 700;font-display:swap;
  src:url("/static/fonts/cinzel-latin.woff2") format("woff2");}

:root{
  /* Neutrals — warm parchment / stone (shared with Argus + Pythia) */
  --bg:#efe6d4; --panel:#fdfbf6; --panel2:#f4ecda; --border:#e3d9c2;
  --text:#3a332a; --muted:#877a61; --chip:#ece2cd;
  /* Accent — dusk amethyst (Lethe's own hue in the family) */
  --accent:#6a4690; --accent-ink:#fdfbf6; --accent2:#7d56a6;
  /* Ornament — bronze / antique gold */
  --gold:#9a6a1d; --gold-2:#c4953f;
  --danger:#a83a2c; --warn:#9b6f16; --ok:#3f7d4e;
  /* Warm-tinted elevation (shadows on parchment read brown, not grey) */
  --e1:0 1px 2px rgba(58,42,16,.06),0 1px 3px rgba(58,42,16,.05);
  --e2:0 2px 8px -2px rgba(58,42,16,.12),0 2px 5px -3px rgba(58,42,16,.08);
  --e3:0 14px 34px -10px rgba(58,42,16,.26),0 8px 14px -10px rgba(58,42,16,.16);
  --r:12px; --r-sm:8px;
  --font-display:"Cinzel","Trajan Pro",Georgia,serif;
  --font-serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,Cambria,serif;
}
/* Dark "still water" mode — obsidian ground, glowing amethyst + gold */
body.body--dark{
  --bg:#14110b; --panel:#1f1810; --panel2:#2a2216; --border:#3a2f1e;
  --text:#e8dec7; --muted:#a4967b; --chip:#2a2216;
  --accent:#b79be0; --accent-ink:#1c1330; --accent2:#cdb6f0;
  --gold:#d8a945; --gold-2:#f0cd80;
  --danger:#f0a0a0; --warn:#f0c869; --ok:#7fcfa6;
  --e1:0 1px 2px rgba(0,0,0,.4); --e2:0 2px 10px -2px rgba(0,0,0,.5); --e3:0 16px 40px -10px rgba(0,0,0,.65);
}

html,body{background:var(--bg)!important;}
body{color:var(--text);min-height:100vh;
  transition:background-color .25s cubic-bezier(.2,.8,.2,1),color .25s cubic-bezier(.2,.8,.2,1);}
.nicegui-content,.q-page,.q-tab-panel,.q-tab-panels{background:transparent!important;}

/* tailwind neutrals used in markup, remapped onto the palette */
.text-slate-500,.text-slate-400,.text-gray-500,.text-gray-400{color:var(--muted)!important;}
.text-teal-700{color:var(--accent2)!important;}
.text-amber-700{color:var(--warn)!important;}
.bg-gray-100,.bg-gray-200{background:var(--chip)!important;}

/* ── header / wordmark ─────────────────────────────────────────────── */
.q-header{background:var(--panel)!important;color:var(--text)!important;
  border-bottom:1px solid var(--border);box-shadow:var(--e1);}
/* Header accent elements (Guide, chip, theme toggle) also default to Quasar's
   fixed `primary`; pin them to --accent too so they brighten in dark mode in
   lockstep with the active tab — one uniform amethyst across the whole accent. */
.q-header .q-btn,.q-header .q-btn__content,.q-header .q-chip.q-chip,.q-header .q-chip__content,.q-header .q-chip .q-icon{color:var(--accent)!important;}
.wordmark{font-family:var(--font-display);font-weight:700;letter-spacing:.18em;font-size:21px;
  text-transform:uppercase;line-height:1.05;
  background:linear-gradient(180deg,var(--gold-2) 0%,var(--gold) 64%,#6f4c14 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;}
body.body--dark .wordmark{background:linear-gradient(180deg,#f0d488 0%,var(--gold) 70%,#a4842f 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;}
.wordmark-sub{color:var(--muted);font-size:11px;letter-spacing:.02em;}
.lethe-mark{height:26px;width:28px;background-repeat:no-repeat;background-position:center;
  background-size:contain;background-image:url("__MARK_LIGHT__");}
body.body--dark .lethe-mark{background-image:url("__MARK_DARK__");}

/* ── Greek-key meander divider ─────────────────────────────────────── */
.meander{height:13px;background-repeat:repeat-x;background-position:center;opacity:.5;
  background-image:url("__MEANDER_LIGHT__");}
body.body--dark .meander{opacity:.45;background-image:url("__MEANDER_DARK__");}

/* ── cards / panels ────────────────────────────────────────────────── */
.q-card{background:var(--panel)!important;color:var(--text)!important;
  border:1px solid var(--border)!important;border-radius:var(--r)!important;box-shadow:var(--e1)!important;}
.q-card .text-base.font-medium,.q-card .text-lg{font-family:var(--font-serif);font-weight:600;
  color:var(--text)!important;letter-spacing:.01em;}

/* ── inputs ────────────────────────────────────────────────────────── */
.q-field--outlined .q-field__control{background:var(--panel2)!important;border-radius:var(--r-sm)!important;}
.q-field--outlined .q-field__control:before{border-color:var(--border)!important;}
.q-field--outlined .q-field__control:hover:before{border-color:var(--accent)!important;}
.q-field--outlined.q-field--focused .q-field__control:after{border-color:var(--accent)!important;}
.q-field__native,.q-field__input,.q-field__native textarea,textarea.q-field__native{color:var(--text)!important;}
.q-field__label,.q-field__marginal,.q-field__messages{color:var(--muted)!important;}

/* ── popup menus / dropdowns ───────────────────────────────────────── */
.q-menu{background:var(--panel)!important;color:var(--text)!important;border:1px solid var(--border);
  border-radius:var(--r-sm)!important;box-shadow:var(--e3)!important;}
.q-menu .q-item,.q-menu .q-item__label{color:var(--text)!important;}
.q-menu .q-item:hover{background:var(--chip)!important;}

/* ── tables ────────────────────────────────────────────────────────── */
.q-table__card,.q-table{background:transparent!important;color:var(--text)!important;box-shadow:none!important;}
.q-table thead th{color:var(--muted)!important;font-weight:700;text-transform:uppercase;
  font-size:11px;letter-spacing:.05em;border-bottom:1px solid var(--border)!important;}
.q-table tbody td{border-bottom:1px solid var(--border)!important;color:var(--text)!important;}
.q-table tbody tr:hover{background:var(--chip)!important;}

/* ── tabs ──────────────────────────────────────────────────────────── */
.q-tabs{color:var(--muted)!important;border-bottom:1px solid var(--border);}
.q-tab{color:var(--muted)!important;}
/* Quasar pins active-color/indicator to its fixed `primary`, which never flips
   for dark mode. Drive both from the mode-aware --accent (bright amethyst in
   dark, deep amethyst in light) with enough specificity to beat Quasar's
   `.text-primary !important`, so the active tab reads as light as the header. */
.q-tabs .q-tab--active,.q-tabs .q-tab--active .q-tab__label{color:var(--accent)!important;}
.q-tabs .q-tab__indicator{background-color:var(--accent)!important;}
.q-tab__label{font-weight:600;}

/* ── chips / uploader / expansion ──────────────────────────────────── */
.q-chip{background:var(--chip)!important;color:var(--muted)!important;border-radius:999px;}
.q-btn{border-radius:var(--r-sm)!important;}
.q-uploader{background:var(--panel2)!important;border:1px dashed var(--border)!important;
  border-radius:var(--r-sm)!important;color:var(--text)!important;box-shadow:none!important;}
.q-uploader__header{background:var(--accent)!important;color:var(--accent-ink)!important;}
.q-expansion-item .q-item{border-radius:var(--r-sm);}

/* ── document preview ──────────────────────────────────────────────── */
.doc-preview{white-space:pre-wrap;word-break:break-word;font-size:13.5px;line-height:1.75;
  max-height:62vh;overflow:auto;background:var(--panel)!important;border:1px solid var(--border);
  border-radius:var(--r);padding:16px 18px;color:var(--text);font-family:var(--font-serif);}
.pdf-warn{background:color-mix(in srgb,var(--warn) 14%,var(--panel));
  border:1px solid color-mix(in srgb,var(--warn) 45%,transparent);color:var(--warn);
  border-radius:var(--r-sm);padding:9px 13px;margin-bottom:10px;font-size:12.5px;line-height:1.5;}
.pdf-warn b{color:var(--warn);}
.pdf-ocr{background:color-mix(in srgb,var(--accent) 10%,var(--panel));
  border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--accent2);
  border-radius:var(--r-sm);padding:9px 13px;margin-bottom:10px;font-size:12.5px;line-height:1.5;}
.pdf-ocr b{color:var(--accent2);}
/* spreadsheet preview — real tables per sheet */
.xlsx-preview{max-height:62vh;overflow:auto;background:var(--panel);border:1px solid var(--border);
  border-radius:var(--r);padding:14px 16px;color:var(--text);}
.xlsx-sheet{margin-bottom:16px;}
.xlsx-sheet:last-child{margin-bottom:0;}
.xlsx-sheet-name{font-family:var(--font-serif);font-weight:600;font-size:12px;color:var(--muted);
  text-transform:uppercase;letter-spacing:.05em;margin:0 0 5px;}
.xlsx-preview table{border-collapse:collapse;font-size:12px;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
.xlsx-preview th,.xlsx-preview td{border:1px solid var(--border);padding:3px 8px;text-align:left;
  vertical-align:top;white-space:nowrap;max-width:340px;overflow:hidden;text-overflow:ellipsis;}
.xlsx-preview th{background:var(--panel2);font-weight:600;position:sticky;top:0;z-index:1;}
.xlsx-trunc{color:var(--muted);font-size:11px;font-style:italic;margin-top:5px;}
mark.hl{border-radius:3px;padding:0 1px;color:inherit;background:#dbe8d8;}
mark.hl-PERSON{background:#e7dcf2;}
mark.hl-COUNTERPARTY{background:#f0e2c4;}
mark.hl-OTHER{background:#f3dcdf;}
mark.hl-EMAIL,mark.hl-PHONE,mark.hl-ACCOUNT{background:#e6ddc9;}
mark.hl.active{outline:2px solid var(--accent);background:#f7e7a8;}
body.body--dark mark.hl{color:#1c1408;background:#8fb89a;}
body.body--dark mark.hl-PERSON{background:#b79be0;}
body.body--dark mark.hl-COUNTERPARTY{background:#d8a945;}
body.body--dark mark.hl-OTHER{background:#e0a3ad;}
body.body--dark mark.hl-EMAIL,body.body--dark mark.hl-PHONE,body.body--dark mark.hl-ACCOUNT{background:#b6a886;}
body.body--dark mark.hl.active{outline:2px solid var(--accent);background:#f0cd80;}
::selection{background:#e7dcf2;}
body.body--dark ::selection{background:#5a467e;color:#fdfbf6;}

/* ── guide markdown ────────────────────────────────────────────────── */
.guide-md{font-size:.9rem;line-height:1.6;color:var(--text);}
.guide-md h1,.guide-md h2,.guide-md h3{font-family:var(--font-serif);font-weight:600;
  color:var(--accent2);margin:.9rem 0 .25rem;}
.guide-md h1{font-size:1.15rem}.guide-md h2{font-size:1.05rem}.guide-md h3{font-size:1rem}
.guide-md p{margin:.35rem 0}.guide-md ul{margin:.2rem 0 .2rem 1.1rem;list-style:disc}
.guide-md li{margin:.12rem 0}
.guide-md code{background:var(--panel2);padding:0 3px;border-radius:3px;font-size:.85em}

/* ── About section (mirrors Pythia's AboutPage; two columns fill the card) ── */
.about{font-size:13.5px;line-height:1.6;color:var(--text);}
.about p{margin:.5rem 0;}
.about a{color:var(--accent2);text-decoration:none;}
.about a:hover{text-decoration:underline;}
.about h4{font-family:var(--font-serif);font-weight:600;color:var(--text);
  margin:1rem 0 .25rem;font-size:14px;}
.about ul{margin:.3rem 0 .3rem 1.2rem;list-style:disc;}
.about li{margin:.2rem 0;}
.about code{background:var(--panel2);padding:0 4px;border-radius:3px;font-size:.85em;}
.about .meta{display:flex;align-items:center;gap:12px;margin:.2rem 0 .6rem;}
.about .pill{background:var(--chip);color:var(--muted);border-radius:999px;
  padding:2px 10px;font-size:11px;font-weight:600;}
.about .gh{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);
  border-radius:var(--r-sm);padding:4px 10px;font-size:12px;font-weight:600;color:var(--text);}
.about .gh:hover{border-color:var(--accent);text-decoration:none;}
.about .gh svg{width:18px;height:18px;}
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 44px;align-items:start;}
.about-col>:first-child{margin-top:0;}
@media(max-width:860px){.about-grid{grid-template-columns:1fr;}}
.about .stack{color:var(--muted);font-size:11.5px;margin-top:1rem;
  padding-top:.6rem;border-top:1px solid var(--border);}
</style>
""".replace("__MARK_LIGHT__", _MARK_LIGHT).replace("__MARK_DARK__", _MARK_DARK) \
   .replace("__MEANDER_LIGHT__", _MEANDER_LIGHT).replace("__MEANDER_DARK__", _MEANDER_DARK)

# GitHub "Octocat" mark (same glyph Pythia's AboutPage uses).
_GH_SVG = ('<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 '
           '3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53'
           '-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 '
           '1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15'
           '-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53'
           '-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 '
           '3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0'
           '-4.42-3.58-8-8-8Z"/></svg>')

# About card — mirrors Pythia's AboutPage layout (version pill + GitHub link,
# intro, mythology note, engine bullets, license, tech-stack line).
SAMPLE = (
    "Dear Mr John Smith,\n\n"
    "Acme Capital Partners (\"Acme\") confirms the secondary transaction with "
    "Meridian Holdings Pte Ltd. The mandate was led by Priya Raman and "
    "counter-signed by Wibowo Santoso of Garuda Ventures.\n\n"
    "Please remit to the DBS Bank account. Queries: john.smith@acme.com or "
    "+65 6789 1234. Reference account 1234-5678-9012.\n\n"
    "Kind regards,\nJane Doe"
)


def _zip_bytes(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def _reference_text(tr, job_id: str, created: str, sources: list[str],
                    token_to_real: dict) -> bytes:
    """The token → real-value reference file. The first column is sized from the
    translated token header so the table lines up in both languages."""
    w = max(24, len(tr("ref.token")) + 2)
    lines = [tr("ref.title"),
             f"{tr('ref.job_id')}{job_id}",
             f"{tr('ref.created')}{created.replace('T', ' ')[:19]}{tr('ref.utc')}",
             f"{tr('ref.sources')}{', '.join(sources)}", "",
             f"{tr('ref.token'):<{w}}{tr('ref.real_value')}", f"{'-' * w}{'-' * 30}"]
    for t, v in token_to_real.items():
        lines.append(f"{t:<{w}}{v}")
    lines += ["", tr("ref.secure")]
    return "\n".join(lines).encode("utf-8")


def _mark_html(text: str, items: list) -> str:
    """Wrap every detected item surface in a <mark> (data-iid = item index),
    longest-match-wins, with the in-between text HTML-escaped."""
    if not text:
        return ""
    spans = []
    for i, it in enumerate(items):
        for s in it.surfaces:
            for m in _whole_word_regex(s).finditer(text):
                spans.append((m.start(), m.end(), i, it.type))
    spans.sort(key=lambda x: x[1] - x[0], reverse=True)  # longest wins
    taken, acc = [], []
    for sp in spans:
        if any(sp[0] < e and s < sp[1] for s, e, _, _ in taken):
            continue
        acc.append(sp)
        taken.append(sp)
    acc.sort(key=lambda x: x[0])
    out, pos = [], 0
    for s, e, i, t in acc:
        out.append(_html.escape(text[pos:s]))
        out.append(f'<mark class="hl hl-{t}" data-iid="{i}">{_html.escape(text[s:e])}</mark>')
        pos = e
    out.append(_html.escape(text[pos:]))
    return "".join(out)


def _preview_html(text: str, items: list) -> str:
    """Document text with detected items highlighted, in a scrollable card."""
    return '<div class="doc-preview">' + _mark_html(text, items) + "</div>"


def _xlsx_preview_html(data: bytes, items: list, tr) -> str:
    """Render a workbook as real tables (one per sheet) with detected names
    highlighted in their cells — far more legible than a flat text dump."""
    out = ['<div class="xlsx-preview">']
    for name, rows, truncated in read_xlsx_grid(data):
        out.append('<div class="xlsx-sheet">')
        out.append(f'<div class="xlsx-sheet-name">{_html.escape(name)}</div>')
        if not rows:
            out.append('<div class="muted" style="padding:6px 2px">' + tr("xlsx.empty_sheet") + "</div>")
        else:
            out.append("<table>")
            for ri, row in enumerate(rows):
                tag = "th" if ri == 0 else "td"
                cells = "".join(f"<{tag}>{_mark_html(c, items)}</{tag}>" for c in row)
                out.append(f"<tr>{cells}</tr>")
            out.append("</table>")
        if truncated:
            out.append(tr("xlsx.truncated"))
        out.append("</div>")
    out.append("</div>")
    return "".join(out)


def _extract_and_warn(data: bytes, kind: str):
    """Heavy file I/O for one document — extracted text plus (for PDFs) the
    image-based-page warnings. Runs in a worker thread so the UI stays live."""
    text = extract_text(data, kind)
    warnings = pdf_warnings(data) if kind == "pdf" else []
    return text, warnings


def _detect_text(text: str, entities: list):
    """CPU-heavy detection — runs in a worker thread."""
    return assign_tokens(detect(text, entities))


def _redact_files(payloads, replace_fn):
    """Redact each (name, data, kind) -> de-identified bytes. Runs in a worker
    thread (PDF rebuild / xlsx surgery is heavy on large files)."""
    outputs: dict[str, bytes] = {}
    total = 0
    for name, data, kind in payloads:
        out_bytes, ext, hits = redact_document(data, kind, replace_fn)
        base = name.rsplit(".", 1)[0]
        outputs[f"{base}__deidentified{ext}"] = out_bytes
        total += hits
    return outputs, total


def _guide_dialog(tr):
    with ui.dialog() as dlg, ui.card().classes("max-w-2xl").style("max-height:85vh;overflow:auto"):
        with ui.row().classes("items-center justify-between w-full"):
            ui.label(tr("guide.title")).classes("text-lg font-semibold").style(f"color:{PRIMARY}")
            ui.button(icon="close", on_click=dlg.close).props("flat round dense")
        ui.markdown(tr("guide.md")).classes("guide-md")
        ui.button(tr("guide.got_it"), on_click=dlg.close).props("unelevated no-caps").classes("self-end")
    return dlg


def main() -> None:
    """Register routes + the index page. Call once before ui.run(). Defining the
    index as an explicit @ui.page (rather than relying on top-level auto-index
    elements) means it is served correctly whether Lethe is launched as a script
    or via the `lethe` console entry point."""
    app.add_static_files("/static", WEB_STATIC)
    ui.page("/")(_build_index)


def _resolve_language() -> str:
    """Language for this page load, in priority order: a ?lang= parameter, the
    lethe_lang cookie (mirrored from localStorage by the switcher), the browser's
    Accept-Language header, then the default (zh)."""
    lang_param = cookie = accept = None
    try:
        request = ui.context.client.request
        lang_param = request.query_params.get("lang")
        cookie = request.cookies.get(i18n.COOKIE_NAME)
        accept = request.headers.get("accept-language")
    except Exception:  # noqa: BLE001 — no request in scope simply means "use the default"
        pass
    return i18n.resolve(lang_param, cookie, accept)


def _switch_language(code: str) -> None:
    """Persist the choice in the browser — localStorage (the source of truth)
    plus a cookie mirror so the server can read it synchronously at page-build
    time — then reload, which re-renders the whole UI in the new language."""
    ui.run_javascript(
        f"localStorage.setItem({json.dumps(i18n.STORAGE_KEY)}, {json.dumps(code)});"
        "document.cookie=" + json.dumps(
            f"{i18n.COOKIE_NAME}={code}; path=/; max-age=315360000; SameSite=Lax") + ";"
        "location.reload();")


def _build_index() -> None:
    """Build the single-page UI for one client connection, in that client's language."""
    lang = _resolve_language()
    tr = i18n.Translator(lang)
    ui.colors(**_BRAND_COLORS)
    ui.add_head_html(THEME_CSS)
    # ui.run()'s title is language-neutral; each page sets its own localised one
    ui.add_head_html("<script>document.title=" + json.dumps(tr("app.title")) + ";</script>")
    # remember the last text selection inside the preview, even after a click
    ui.add_body_html("<script>document.addEventListener('mouseup',function(){"
                     "try{var s=window.getSelection().toString();"
                     "if(s&&s.trim())window.__deidSel=s;}catch(e){}});</script>")

    guide = _guide_dialog(tr)
    dark = ui.dark_mode(value=False)

    with ui.header(elevated=False).classes("items-center justify-between px-6 py-2"):
        with ui.row().classes("items-center gap-3 no-wrap"):
            ui.html('<div class="lethe-mark"></div>')
            with ui.column().classes("gap-0"):
                ui.html('<span class="wordmark">Lethe</span>')
                ui.html(tr("hdr.subtitle"))
        with ui.row().classes("items-center gap-2 no-wrap"):
            ui.button(tr("hdr.guide"), icon="help_outline", on_click=guide.open).props("flat no-caps")
            ui.chip(tr("hdr.local"), icon="lock").props("outline")
            theme_btn = ui.button(icon="dark_mode").props("flat round dense").tooltip(tr("hdr.toggle_theme"))

            def _toggle_theme():
                dark.toggle()
                theme_btn.props(f'icon={"light_mode" if dark.value else "dark_mode"}')

            theme_btn.on("click", _toggle_theme)

            with ui.button(icon="translate").props("flat round dense").tooltip(
                    tr("hdr.language")):
                with ui.menu().props("auto-close"):
                    for code in i18n.SUPPORTED_LANGS:
                        ui.menu_item(("✓ " if code == lang else "") + i18n.LANG_LABELS[code],
                                     on_click=lambda c=code: _switch_language(c))

    ui.html('<div class="meander w-full"></div>')

    with ui.tabs().classes("w-full max-w-6xl mx-auto").props(
            "align=left active-color=primary indicator-color=primary no-caps") as tabs:
        t_deid = ui.tab(tr("tab.deidentify"), icon="lock")
        t_reid = ui.tab(tr("tab.reidentify"), icon="lock_open")
        t_restore = ui.tab(tr("tab.restore"), icon="auto_fix_high")
        t_dict = ui.tab(tr("tab.dictionary"), icon="menu_book")
        t_set = ui.tab(tr("tab.settings"), icon="settings")

    with ui.tab_panels(tabs, value=t_deid).classes("w-full max-w-6xl mx-auto bg-transparent"):
        with ui.tab_panel(t_deid).classes("p-0"):
            build_deidentify_panel(tr)
        with ui.tab_panel(t_reid).classes("p-0"):
            build_reidentify_panel(tr)
        with ui.tab_panel(t_restore).classes("p-0"):
            build_restore_panel(tr)
        with ui.tab_panel(t_dict).classes("p-0"):
            build_dictionary_panel(tr)
        with ui.tab_panel(t_set).classes("p-0"):
            build_settings_panel(tr)


# ============================================================================
# 1 · DE-IDENTIFY
# ============================================================================
def build_deidentify_panel(tr):
    files: list[dict] = []          # [{name, kind, data}]
    manual_entities: list[Entity] = []
    state: dict = {"items": [], "preview_idx": 0}

    # Built-in name types + any user-defined ones (Settings → Token types).
    name_types = NAME_TYPES + load_token_types()
    opts_js = "[" + ",".join(f"'{t}'" for t in name_types) + "]"

    with ui.column().classes("w-full gap-5 pt-5"):
        # ---- add documents ----
        with ui.card().classes("w-full rounded-xl shadow-sm"):
            with ui.row().classes("items-center justify-between w-full"):
                ui.label(tr("deid.add_documents")).classes("text-base font-medium")
                ui.button(tr("deid.start_over"), icon="restart_alt", on_click=lambda: reset_all()).props(
                    "flat no-caps dense").tooltip(
                    tr("deid.start_over_tip"))
            ui.label(tr("deid.formats_hint")).classes(
                "text-sm text-slate-500")
            with ui.row().classes("items-center gap-4 mt-2 w-full"):
                uploader = ui.upload(label=tr("deid.drop_or_browse"), multiple=True, auto_upload=True,
                                     on_upload=lambda e: on_file(e)).props(
                    'accept=".docx,.pptx,.pdf,.xlsx,.txt,.eml,.msg,.html,.htm" flat bordered').classes("flex-1")
                ui.button(tr("deid.try_sample"), icon="description",
                          on_click=lambda: on_sample()).props("outline no-caps")
            files_row = ui.row().classes("gap-2 flex-wrap mt-1")

            @ui.refreshable
            def render_files():
                files_row.clear()
                with files_row:
                    for i, f in enumerate(files):
                        with ui.row().classes("items-center gap-1 bg-gray-100 rounded-lg px-2 py-1"):
                            ui.icon("description", size="16px").classes("text-slate-500")
                            ui.label(f["name"]).classes("text-xs")
                            ui.button(icon="close", on_click=lambda i=i: remove_file(i)).props(
                                "flat round dense size=xs color=grey-7")
                    if len(files) > 1:
                        ui.button(tr("deid.clear_all"), icon="clear_all", on_click=lambda: clear_files()).props(
                            "flat dense no-caps size=sm")

        # ---- work area: review (left) + document preview (right) ----
        # CSS grid so the two panes sit side-by-side from the md breakpoint up
        # (and the column gap never causes wrap, unlike summed flex widths).
        work = ui.element("div").classes("w-full grid grid-cols-1 md:grid-cols-12 gap-4 items-start")
        with work:
            # LEFT: review table
            with ui.element("div").classes("md:col-span-5 min-w-0"):
                with ui.card().classes("w-full rounded-xl shadow-sm"):
                    with ui.row().classes("items-center justify-between w-full"):
                        ui.label(tr("deid.review")).classes("text-base font-medium")
                        with ui.row().classes("items-center gap-1"):
                            summary = ui.label("").classes("text-sm font-medium").style(f"color:{PRIMARY}")
                            ui.button(icon="refresh", on_click=lambda: run_detection()).props(
                                "flat round dense").tooltip(tr("deid.rescan_tip"))
                    ui.label(tr("deid.review_hint")).classes("text-xs text-slate-500")
                    columns = [
                        {"name": "type", "label": tr("col.type"), "field": "type", "align": "left"},
                        {"name": "value", "label": tr("col.detected_value"), "field": "value", "align": "left"},
                        {"name": "count", "label": tr("col.count"), "field": "count", "align": "right"},
                        {"name": "source", "label": tr("col.found_by"), "field": "source", "align": "left"},
                    ]
                    table = ui.table(columns=columns, rows=[], row_key="id",
                                     selection="multiple").classes("w-full").props("flat dense").style(
                        "max-height:60vh")
                    # editable type for name-like items; read-only badge for patterns
                    type_slot = """
                        <q-td :props="props">
                          <q-select v-if="__OPTS__.includes(props.row.type)"
                            dense options-dense borderless v-model="props.row.type"
                            :options="__OPTS__"
                            @update:model-value="() => $parent.$emit('typechange', props.row)"
                            style="min-width:140px" />
                          <q-badge v-else :color="props.row.type_color">{{ props.row.type }}</q-badge>
                        </q-td>""".replace("__OPTS__", opts_js)
                    table.add_slot("body-cell-type", type_slot)
                    table.add_slot("body-cell-source", '''
                        <q-td :props="props">
                          <q-badge outline :color="props.row.source_color">{{ props.row.source_label }}</q-badge>
                        </q-td>''')

            # RIGHT: document preview
            with ui.element("div").classes("md:col-span-7 min-w-0"):
                with ui.card().classes("w-full rounded-xl shadow-sm"):
                    with ui.row().classes("items-center justify-between w-full"):
                        ui.label(tr("deid.document")).classes("text-base font-medium")
                        file_select = ui.select(options=[], on_change=lambda e: on_preview_file(e)).props(
                            "outlined dense").style("min-width:180px")
                        file_select.visible = False
                    with ui.row().classes("items-center gap-2 w-full"):
                        manual_type = ui.select(
                            options=["COUNTERPARTY"] + [t for t in name_types if t != "COUNTERPARTY"],
                            value="COUNTERPARTY").props("outlined dense").style("width:180px")
                        ui.button(tr("deid.redact_selection"), icon="visibility_off",
                                  on_click=lambda: redact_selection()).props("outline no-caps dense")
                    ui.label(tr("deid.select_hint")).classes(
                        "text-xs text-slate-500")
                    preview_html = ui.html("").classes("w-full")
        work.visible = False

        # ---- confirm ----
        confirm_card = ui.card().classes("w-full rounded-xl shadow-sm")
        with confirm_card:
            ui.label(tr("deid.confirm_export")).classes("text-base font-medium")
            with ui.row().classes("items-center gap-4 w-full"):
                pw = ui.input(tr("deid.passphrase_optional"), password=True,
                              password_toggle_button=True).props("outlined dense").classes("flex-1")
                gen = ui.button(tr("deid.generate"), icon="bolt").props("unelevated no-caps")
            add_dict = ui.checkbox(tr("deid.add_to_dict"), value=True)
            ui.label(tr("deid.passphrase_hint")).classes("text-xs text-slate-500")
            result = ui.column().classes("w-full mt-1")
        confirm_card.visible = False

        # ---- handlers ----
        def refresh_table():
            items = state["items"]
            rows = []
            for i, it in enumerate(items):
                lbl, scol = SOURCE_BADGE.get(it.source, (it.source, "grey"))
                rows.append({"id": i, "type": it.type, "type_color": TYPE_COLOR.get(it.type, "grey"),
                             "value": it.canonical, "count": it.count, "source": it.source,
                             "source_label": tr(lbl), "source_color": scol})
            table.rows = rows
            table.selected = [r for r in rows if items[r["id"]].include]
            table.update()
            has = bool(items)
            work.visible = has
            confirm_card.visible = has
            update_summary()
            render_preview()

        def update_summary():
            summary.text = tr("deid.summary", count=len(table.selected))

        table.on("selection", lambda e: update_summary())

        def on_row_click(e):
            try:
                iid = e.args[1]["id"]
            except (KeyError, IndexError, TypeError):
                return
            ui.run_javascript(
                "document.querySelectorAll('mark.hl.active').forEach(m=>m.classList.remove('active'));"
                f"var ms=document.querySelectorAll('mark.hl[data-iid=\"{iid}\"]');"
                "ms.forEach(m=>m.classList.add('active'));"
                "if(ms.length)ms[0].scrollIntoView({behavior:'smooth',block:'center'});")

        table.on("rowClick", on_row_click)

        def on_type_change(e):
            row = e.args[0] if isinstance(e.args, list) else e.args
            if not isinstance(row, dict):
                return
            iid, newtype = row.get("id"), row.get("type")
            items = state["items"]
            if iid is not None and 0 <= iid < len(items) and newtype:
                items[iid].type = newtype
                assign_tokens(items)
                refresh_table()

        table.on("typechange", on_type_change)

        def render_preview():
            if not files:
                preview_html.content = ""
                file_select.visible = False
                return
            names = [f["name"] for f in files]
            file_select.options = names
            file_select.visible = len(files) > 1
            idx = state["preview_idx"] if state["preview_idx"] < len(files) else 0
            state["preview_idx"] = idx
            if not file_select.value or file_select.value not in names:
                file_select.value = names[idx]
            f = files[idx]
            banner = ""
            warns = f.get("warnings") or []
            hard = [w for w in warns if not w.get("ocr")]
            soft = [w for w in warns if w.get("ocr")]
            if hard:
                pages = ", ".join(str(w["page"]) for w in hard)
                banner += (tr("deid.pdf_warn", pages=_html.escape(pages)))
            if soft:
                pages = ", ".join(str(w["page"]) for w in soft)
                banner += (tr("deid.pdf_ocr", pages=_html.escape(pages)))
            if f["kind"] == "xlsx":
                preview_html.content = banner + _xlsx_preview_html(f["data"], state["items"], tr)
            else:
                preview_html.content = banner + _preview_html(f.get("text", ""), state["items"])

        def on_preview_file(e):
            if e.value in [f["name"] for f in files]:
                state["preview_idx"] = [f["name"] for f in files].index(e.value)
                render_preview()

        async def run_detection():
            # Detection (spaCy/Presidio) is CPU-heavy and would freeze the UI on a
            # big document, so it runs in a worker thread with a spinner. Uses the
            # text cached on each file (extracted once on upload).
            result.clear()
            if not files:
                state["items"] = []
                refresh_table()
                return
            combined = "\n\n".join(f.get("text", "") for f in files)
            ents = load_entities() + manual_entities
            note = ui.notification(tr("deid.scanning"),
                                   spinner=True, timeout=None)
            try:
                items = await run.io_bound(_detect_text, combined, ents)
            except Exception as exc:  # noqa: BLE001
                note.dismiss()
                ui.notify(tr("deid.cant_scan", error=exc), color="negative")
                return
            note.dismiss()
            manual_set = {e.canonical.lower() for e in manual_entities}
            for it in items:
                if it.source == "dictionary" and it.canonical.lower() in manual_set:
                    it.source = "manual"
            state["items"] = items
            refresh_table()

        async def on_file(e):
            f = e.file
            data = await f.read()
            kind = file_kind(f.name) or "txt"
            entry = {"name": f.name, "kind": kind, "data": data, "text": "", "warnings": []}
            files.append(entry)
            render_files.refresh()
            note = ui.notification(tr("deid.reading", name=f.name), spinner=True, timeout=None)
            try:
                entry["text"], entry["warnings"] = await run.io_bound(_extract_and_warn, data, kind)
            except Exception as exc:  # noqa: BLE001
                note.dismiss()
                ui.notify(tr("deid.cant_read", name=f.name, error=exc), color="negative")
                return
            note.dismiss()
            await run_detection()
            warns = entry.get("warnings") or []
            hard = [w for w in warns if not w.get("ocr")]
            soft = [w for w in warns if w.get("ocr")]
            if hard:
                pages = ", ".join(str(w["page"]) for w in hard)
                ui.notify(tr("deid.pdf_warn_notify", name=f.name, pages=pages),
                          type="warning", multi_line=True, timeout=10000)
            elif soft:
                pages = ", ".join(str(w["page"]) for w in soft)
                ui.notify(tr("deid.pdf_ocr_notify", name=f.name, pages=pages),
                          color="primary", multi_line=True, timeout=8000)
            else:
                ui.notify(tr("deid.added_file", name=f.name), color="primary")

        async def on_sample():
            files.clear()
            manual_entities.clear()
            files.append({"name": "sample-memo.txt", "kind": "txt",
                          "data": SAMPLE.encode("utf-8"), "text": SAMPLE, "warnings": []})
            render_files.refresh()
            await run_detection()
            ui.notify(tr("deid.sample_loaded"), color="primary")

        async def remove_file(i):
            del files[i]
            state["preview_idx"] = 0
            render_files.refresh()
            await run_detection()

        async def clear_files():
            files.clear()
            manual_entities.clear()
            state["preview_idx"] = 0
            clear_pdf_cache()   # don't retain any parsed PDF once files are cleared
            render_files.refresh()
            await run_detection()

        async def reset_all():
            """Full reset of the De-identify tab: files, manual redactions, the
            review list, passphrase and the export result — back to a clean slate."""
            await clear_files()
            pw.value = ""
            add_dict.value = True
            result.clear()
            try:
                uploader.reset()          # also clear the upload widget's file list
            except Exception:
                pass
            ui.notify(tr("deid.started_over"), color="primary")

        async def redact_selection():
            sel = await ui.run_javascript(
                'window.__deidSel || (window.getSelection?window.getSelection().toString():"")', timeout=5)
            sel = (sel or "").strip()
            if not sel:
                ui.notify(tr("deid.select_first"), color="warning")
                return
            if sel.lower() in {e.canonical.lower() for e in manual_entities}:
                ui.notify(tr("deid.already_added"), color="warning")
                return
            manual_entities.append(Entity(canonical=sel, type=manual_type.value, aliases=[]))
            await ui.run_javascript('window.__deidSel="";if(window.getSelection)window.getSelection().removeAllRanges();')
            await run_detection()
            ui.notify(tr("deid.redacting", text=sel[:40]), color="primary")

        async def on_generate():
            if not files:
                ui.notify(tr("deid.add_doc_first"), color="warning")
                return
            items = state["items"]
            selected_ids = {r["id"] for r in table.selected}
            for i, it in enumerate(items):
                it.include = i in selected_ids
            assign_tokens(items)
            replace_fn, token_to_real = build_replacer(items)
            if not token_to_real:
                ui.notify(tr("deid.nothing_selected"), color="warning")
                return

            passphrase = pw.value or ""
            job_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(2)
            created = datetime.now(timezone.utc).isoformat()
            sources = [f["name"] for f in files]
            note = ui.notification(tr("deid.generating"), spinner=True, timeout=None)
            try:
                outputs, total_hits = await run.io_bound(
                    _redact_files, [(f["name"], f["data"], f["kind"]) for f in files], replace_fn)
            except Exception as exc:  # noqa: BLE001
                note.dismiss()
                ui.notify(tr("deid.cant_generate", error=exc), color="negative")
                return
            finally:
                # The de-identified output is built; drop the parsed source PDF(s)
                # from memory rather than retaining sensitive content between jobs.
                clear_pdf_cache()
            note.dismiss()
            ref_bytes = _reference_text(tr, job_id, created, sources, token_to_real)

            vault.save_job(job_id, token_to_real, passphrase,
                           meta={"source_file": ", ".join(sources), "replacements": total_hits})

            added = 0
            if add_dict.value:
                new_ents = [Entity(canonical=it.canonical, type=it.type,
                                   aliases=[s for s in it.surfaces if s != it.canonical])
                            for it in items
                            if it.include and it.source in ("suggestion", "manual")
                            and it.type in ("PERSON", "COUNTERPARTY")]
                if new_ents:
                    added = merge_entities(new_ents)

            result.clear()
            with result:
                with ui.row().classes("items-center gap-2 flex-wrap"):
                    ui.icon("check_circle", color="positive")
                    ui.label(tr("deid.replacement_summary", count=total_hits, files=len(files))).classes(
                        "text-sm")
                    ui.badge(job_id).props("color=primary")
                    if added:
                        ui.badge(tr("deid.to_dict", count=added)).props("color=teal-7")
                with ui.row().classes("items-center gap-2 flex-wrap"):
                    if len(outputs) == 1:
                        name, data = next(iter(outputs.items()))
                        ui.button(tr("deid.download_one"), icon="download",
                                  on_click=lambda d=data, n=name: ui.download(d, n)).props("unelevated no-caps")
                        ui.button(tr("deid.download_ref"), icon="description",
                                  on_click=lambda: ui.download(ref_bytes, f"{job_id}__reference.txt")).props(
                            "outline no-caps")
                    else:
                        bundle = dict(outputs)
                        bundle[f"{job_id}__reference.txt"] = ref_bytes
                        zipb = _zip_bytes(bundle)
                        ui.button(tr("deid.download_all", count=len(outputs)), icon="download",
                                  on_click=lambda z=zipb: ui.download(z, f"deidentified_{job_id}.zip")).props(
                            "unelevated no-caps")
                with ui.expansion(tr("deid.show_mapping")).classes("w-full"):
                    mcols = [{"name": "t", "label": tr("col.token"), "field": "t", "align": "left"},
                             {"name": "v", "label": tr("col.real_value"), "field": "v", "align": "left"}]
                    ui.table(columns=mcols, rows=[{"t": t, "v": v} for t, v in token_to_real.items()]).props(
                        "flat dense").classes("w-full")
            ui.notify(tr("deid.ready"), color="positive")

        gen.on("click", on_generate)


# ============================================================================
# 2 · RE-IDENTIFY
# ============================================================================
def build_reidentify_panel(tr):
    sel: dict = {"job_id": None}
    upload: dict = {"data": None, "kind": None, "name": None}

    with ui.column().classes("w-full gap-5 pt-5"):
        with ui.card().classes("w-full rounded-xl shadow-sm"):
            with ui.row().classes("items-center justify-between w-full"):
                ui.label(tr("reid.past")).classes("text-base font-medium")
                ui.button(icon="refresh", on_click=lambda: render_history.refresh()).props(
                    "flat round dense").tooltip(tr("reid.refresh"))
            ui.label(tr("reid.pick_hint")).classes("text-sm text-slate-500")
            hcols = [
                {"name": "created", "label": tr("col.when"), "field": "created", "align": "left"},
                {"name": "source_file", "label": tr("col.source_files"), "field": "source_file", "align": "left"},
                {"name": "replacements", "label": tr("col.redactions"), "field": "replacements", "align": "right"},
                {"name": "job_id", "label": tr("col.job_id"), "field": "job_id", "align": "left"},
                {"name": "actions", "label": "", "field": "actions", "align": "right"},
            ]
            htable = ui.table(columns=hcols, rows=[], row_key="job_id",
                              selection="single").classes("w-full").props("flat dense")
            htable.add_slot("body-cell-actions", '''
                <q-td :props="props" auto-width>
                  <q-btn flat round dense size="sm" icon="delete" color="grey-7"
                    @click.stop="() => $parent.$emit('deletejob', props.row)">
                    <q-tooltip>__DELETE_TIP__</q-tooltip>
                  </q-btn>
                </q-td>'''.replace("__DELETE_TIP__", tr("reid.delete_tip")))

            @ui.refreshable
            def render_history():
                rows = []
                for h in vault.history():
                    rows.append({"job_id": h["job_id"],
                                 "created": (h["created"] or "").replace("T", " ")[:16],
                                 "source_file": h["source_file"] or "—",
                                 "replacements": h["replacements"]})
                htable.rows = rows
                htable.selected = [r for r in rows if r["job_id"] == sel["job_id"]]
                htable.update()

            def on_select(_):
                sel["job_id"] = htable.selected[0]["job_id"] if htable.selected else None
                selected_label.text = tr("reid.selected", job=sel["job_id"]) if sel["job_id"] else \
                    tr("reid.selected_none")

            htable.on("selection", on_select)

            async def on_delete(e):
                row = e.args[0] if isinstance(e.args, list) else e.args
                jid = row.get("job_id") if isinstance(row, dict) else None
                if not jid:
                    return
                with ui.dialog() as dlg, ui.card():
                    ui.label(tr("reid.delete_question")).classes("text-base font-medium")
                    ui.label(tr("reid.delete_warn", job=jid)).classes(
                        "text-sm text-slate-600")
                    with ui.row().classes("justify-end gap-2 w-full"):
                        ui.button(tr("reid.cancel"), on_click=lambda: dlg.submit(False)).props("flat no-caps")
                        ui.button(tr("reid.delete"), color="negative",
                                  on_click=lambda: dlg.submit(True)).props("unelevated no-caps")
                if await dlg:
                    vault.delete_job(jid)
                    if sel["job_id"] == jid:
                        sel["job_id"] = None
                        selected_label.text = tr("reid.selected_none")
                    render_history.refresh()
                    ui.notify(tr("reid.deleted", job=jid), color="primary")

            htable.on("deletejob", on_delete)

        with ui.card().classes("w-full rounded-xl shadow-sm"):
            ui.label(tr("reid.bring_back")).classes("text-base font-medium")
            selected_label = ui.label(tr("reid.selected_none")).classes(
                "text-sm").style(f"color:{PRIMARY}")
            pw = ui.input(tr("reid.passphrase"), password=True,
                          password_toggle_button=True).props("outlined dense").classes("w-full")

            ui.label(tr("reid.ai_hint")).classes("text-sm text-slate-500 mt-1")
            with ui.row().classes("items-center gap-2"):
                ui.upload(label=tr("reid.upload_ai"), auto_upload=True,
                          on_upload=lambda e: on_upload_ai(e)).props('accept=".docx,.pptx,.xlsx,.txt" flat bordered')
                upload_note = ui.label("").classes("text-xs text-teal-700")
                clear_btn = ui.button(icon="close", on_click=lambda: clear_upload()).props(
                    "flat round dense color=grey-7").tooltip(tr("reid.clear_upload_tip"))
                clear_btn.visible = False
            ai_text = ui.textarea(tr("reid.paste_ai")).props("outlined").classes(
                "w-full").style("min-height:140px")
            ui.button(tr("tab.reidentify"), icon="lock_open", on_click=lambda: on_restore()).props(
                "unelevated no-caps")
            result = ui.column().classes("w-full")

        async def on_upload_ai(e):
            f = e.file
            upload.update(data=await f.read(), kind=file_kind(f.name) or "txt", name=f.name)
            upload_note.text = tr("reid.will_regenerate", name=f.name)
            clear_btn.visible = True
            ui.notify(tr("reid.loaded_gen", name=f.name), color="primary")

        def clear_upload():
            upload.update(data=None, kind=None, name=None)
            upload_note.text = ""
            clear_btn.visible = False
            ui.notify(tr("reid.cleared"), color="primary")

        def on_restore():
            if not sel["job_id"]:
                ui.notify(tr("reid.select_conversion"), color="warning")
                return
            if upload["data"] is None and not (ai_text.value or "").strip():
                ui.notify(tr("reid.upload_or_paste"), color="warning")
                return
            try:
                job = vault.load_job(sel["job_id"], pw.value or "")
            except ValueError:            # wrong passphrase / corrupted key file
                ui.notify(tr("reid.wrong_passphrase"), color="negative")
                return
            except FileNotFoundError:     # the reversal key is gone
                ui.notify(tr("reid.key_missing"), color="negative")
                return
            except Exception as exc:      # noqa: BLE001 — anything else, keep the detail
                ui.notify(tr("reid.cant_open_job", error=exc), color="negative")
                return
            restore = build_restorer(job["mapping"])
            result.clear()
            if upload["data"] is not None:
                out_bytes, ext, hits = redact_document(upload["data"], upload["kind"], restore)
                base = upload["name"].rsplit(".", 1)[0]
                fname = f"{base}__reidentified{ext}"
                with result:
                    with ui.row().classes("items-center gap-2"):
                        ui.icon("check_circle", color="positive")
                        ui.label(tr("reid.restored_file", count=hits)).classes("text-sm")
                    ui.button(tr("common.download_file", file=fname), icon="download",
                              on_click=lambda b=out_bytes, n=fname: ui.download(b, n)).props("unelevated no-caps")
            else:
                restored, hits = restore(ai_text.value or "")
                with result:
                    with ui.row().classes("items-center gap-2"):
                        ui.icon("check_circle", color="positive")
                        ui.label(tr("reid.restored_paste", count=hits)).classes("text-sm")
                    ui.textarea(tr("reid.output"), value=restored).props("outlined readonly").classes(
                        "w-full").style("min-height:140px")
                    ui.button(tr("common.download_txt"), icon="download",
                              on_click=lambda r=restored: ui.download(r.encode("utf-8"),
                                                                      f"{sel['job_id']}__reidentified.txt")).props(
                        "unelevated no-caps")
            ui.notify(tr("reid.done"), color="positive")

        render_history()


# ============================================================================
# 2½ · RESTORE (manual) — re-identify a tokenised document with no Job ID
# ============================================================================
# When the de-identification happened OUTSIDE Lethe (another tool, a colleague,
# or a hand-made template), there is no vault job to reverse. This tab scans a
# document for [bracketed] tokens, lets the user supply the real value for each,
# and rebuilds the file using the very same restore engine the Re-identify tab
# uses — only the token→value map comes from the user instead of the vault.
_PATTERN_PREFIXES = {"EMAIL", "PHONE", "ACCOUNT"}
# A token to offer for restoring: anything in [ ... ] on one line, length-capped
# so a stray "[" in prose can't swallow a paragraph.
_RESTORE_TOKEN_RE = re.compile(r"\[[^\[\]\r\n]{1,80}\]")
# Lethe-style typed token, e.g. [PERSON_001] / [COUNTERPARTY_012] / [PROJECT_003].
_TYPED_TOKEN_RE = re.compile(r"^\[([A-Za-z][A-Za-z0-9]*)_\d+\]$")


def _restore_defaults(token: str, custom_types: list[str]) -> tuple[str, bool]:
    """Starting points for a scanned token's per-row controls: (dictionary Type
    to pre-select, whether to pre-tick 'Save'). The user can override both — we
    only seed sensible defaults and never silently refuse to offer a token.

    Pattern tokens (emails/phones) and bare footnote markers like [1] start with
    Save un-ticked; anything name-like starts ticked under its best-guess type."""
    inside = token[1:-1].strip()
    if inside.isdigit():                       # [1], [12] — footnote/citation markers
        return "OTHER", False
    m = _TYPED_TOKEN_RE.match(token)
    if m:
        prefix = m.group(1).upper()
        if prefix in _PATTERN_PREFIXES:        # emails/phones aren't dictionary entities
            return "OTHER", False
        if prefix == "PERSON":
            return "PERSON", True
        if prefix in ("COUNTERPARTY", "ORG"):
            return "COUNTERPARTY", True
        if prefix == "OTHER":
            return "OTHER", True
        for t in custom_types:                 # a user-defined type, e.g. [PROJECT_001]
            if t.upper() == prefix:
                return t, True
    # free-form placeholder like [CLIENT A] — almost certainly an entity; default to
    # COUNTERPARTY (the user picks the real type from the dropdown).
    return "COUNTERPARTY", True


def build_restore_panel(tr):
    state: dict = {"data": None, "kind": None, "name": None}
    rows: list[dict] = []   # [{token, count, cb, inp, tsel, save}]
    custom_types = load_token_types()

    with ui.column().classes("w-full gap-5 pt-5"):
        # ---- input: a tokenised document or pasted text ----
        with ui.card().classes("w-full rounded-xl shadow-sm"):
            ui.label(tr("restore.title")).classes(
                "text-base font-medium")
            ui.label(
                tr("restore.intro")).classes("text-sm text-slate-500")
            ui.label(tr("restore.local")).classes(
                "text-xs").style(f"color:{PRIMARY}")
            with ui.row().classes("items-center gap-2 mt-1"):
                ui.upload(label=tr("restore.upload_label"),
                          auto_upload=True, on_upload=lambda e: on_upload(e)).props(
                    'accept=".docx,.pptx,.pdf,.xlsx,.txt,.eml,.msg,.html,.htm" flat bordered')
                up_note = ui.label("").classes("text-xs text-teal-700")
                clear_btn = ui.button(icon="close", on_click=lambda: clear_upload()).props(
                    "flat round dense color=grey-7").tooltip(tr("reid.clear_upload_tip"))
                clear_btn.visible = False
            paste = ui.textarea(tr("restore.paste")).props("outlined").classes(
                "w-full").style("min-height:120px")
            ui.button(tr("restore.scan"), icon="search", on_click=lambda: on_scan()).props(
                "unelevated no-caps")

        # ---- review: fill in the real value behind each token ----
        token_card = ui.card().classes("w-full rounded-xl shadow-sm")
        token_card.visible = False
        with token_card:
            ui.label(tr("restore.tokens_found")).classes("text-base font-medium")
            ui.label(tr("restore.tokens_hint")).classes(
                "text-sm text-slate-500")
            tokens_box = ui.column().classes("w-full gap-2 mt-2")
            ui.button(tr("restore.restore_doc"), icon="lock_open", on_click=lambda: on_restore()).props(
                "unelevated no-caps mt-1")
            result = ui.column().classes("w-full")

        def _read_text() -> str | None:
            if state["data"] is not None:
                try:
                    return extract_text(state["data"], state["kind"])
                except Exception as exc:  # noqa: BLE001 — surface any read failure to the user
                    ui.notify(tr("restore.cant_read", error=exc), color="negative")
                    return None
            return (paste.value or "").strip() or None

        async def on_upload(e):
            f = e.file
            state.update(data=await f.read(), kind=file_kind(f.name) or "txt", name=f.name)
            up_note.text = tr("restore.loaded", name=f.name)
            clear_btn.visible = True

        def clear_upload():
            state.update(data=None, kind=None, name=None)
            up_note.text = ""
            clear_btn.visible = False

        def on_scan():
            text = _read_text()
            if not text:
                ui.notify(tr("restore.upload_first"), color="warning")
                return
            counts: dict[str, int] = {}
            for m in _RESTORE_TOKEN_RE.finditer(text):
                counts[m.group(0)] = counts.get(m.group(0), 0) + 1
            if not counts:
                ui.notify(tr("restore.no_tokens"), color="warning")
                token_card.visible = False
                return
            rows.clear()
            tokens_box.clear()
            type_options = ["PERSON", "COUNTERPARTY", "OTHER"] + custom_types
            # most-frequent first; typed Lethe-style tokens ahead of free-form ones
            ordered = sorted(counts.items(),
                             key=lambda kv: (_TYPED_TOKEN_RE.match(kv[0]) is None, -kv[1], kv[0]))
            with tokens_box:
                with ui.row().classes("w-full items-center text-xs text-slate-400 px-1"):
                    ui.label("").style("width:34px")
                    ui.label(tr("col.token")).style("width:190px")
                    ui.label(tr("col.count")).style("width:44px")
                    ui.label(tr("col.real_name")).classes("flex-1")
                    ui.label(tr("col.type")).style("width:150px")
                    ui.label(tr("col.save")).style("width:50px")
                for tok, n in ordered:
                    default_type, default_save = _restore_defaults(tok, custom_types)
                    # the left "include" box defaults off only for footnote-like [1]
                    include_on = not tok[1:-1].strip().isdigit()
                    with ui.row().classes("w-full items-center gap-2"):
                        cb = ui.checkbox(value=include_on).props("dense").tooltip(
                            tr("restore.include_tip"))
                        ui.label(tok).classes("font-mono text-sm").style("width:190px")
                        ui.label(f"×{n}").classes("text-xs text-slate-400").style("width:44px")
                        inp = ui.input(placeholder=tr("restore.placeholder")).props(
                            "outlined dense").classes("flex-1")
                        tsel = ui.select(options=type_options, value=default_type).props(
                            "outlined dense options-dense").style("width:150px")
                        save_cb = ui.checkbox(value=default_save).props("dense").style(
                            "width:50px").tooltip(tr("restore.save_tip"))
                    rows.append({"token": tok, "count": n, "cb": cb, "inp": inp,
                                 "tsel": tsel, "save": save_cb})
            result.clear()
            token_card.visible = True
            ui.notify(tr("restore.found", count=len(ordered)), color="primary")

        def on_restore():
            mapping = {r["token"]: (r["inp"].value or "").strip()
                       for r in rows if r["cb"].value and (r["inp"].value or "").strip()}
            if not mapping:
                ui.notify(tr("restore.fill_first"),
                          color="warning")
                return
            restore = build_restorer(mapping)
            result.clear()
            if state["data"] is not None:
                out_bytes, ext, hits = redact_document(state["data"], state["kind"], restore)
                if state["kind"] == "pdf":
                    clear_pdf_cache()   # don't retain the parsed PDF after rebuilding
                base = state["name"].rsplit(".", 1)[0]
                fname = f"{base}__restored{ext}"
                with result:
                    with ui.row().classes("items-center gap-2"):
                        ui.icon("check_circle", color="positive")
                        ui.label(tr("restore.file_rebuilt", count=hits)).classes(
                            "text-sm")
                    if state["kind"] == "pdf":
                        ui.label(tr("restore.pdf_as_word")).classes(
                            "text-xs text-slate-400")
                    ui.button(tr("common.download_file", file=fname), icon="download",
                              on_click=lambda b=out_bytes, n=fname: ui.download(b, n)).props(
                        "unelevated no-caps")
            else:
                restored, hits = restore(paste.value or "")
                with result:
                    with ui.row().classes("items-center gap-2"):
                        ui.icon("check_circle", color="positive")
                        ui.label(tr("restore.paste_rebuilt", count=hits)).classes("text-sm")
                    ui.textarea(tr("restore.output"), value=restored).props("outlined readonly").classes(
                        "w-full").style("min-height:140px")
                    ui.button(tr("common.download_txt"), icon="download",
                              on_click=lambda r=restored: ui.download(r.encode("utf-8"),
                                                                      "restored.txt")).props(
                        "unelevated no-caps")
            # bootstrap the dictionary from the rows the user ticked "Save" on
            new_ents = [Entity(canonical=(r["inp"].value or "").strip(),
                               type=r["tsel"].value or "OTHER", aliases=[])
                        for r in rows
                        if r["save"].value and (r["inp"].value or "").strip()]
            if new_ents:
                added = merge_entities(new_ents)
                dup = len(new_ents) - added
                msg = tr("restore.saved_to_dict", count=added)
                if dup:
                    msg += tr("restore.dupes", count=dup)
                ui.notify(msg, color="primary")
            ui.notify(tr("restore.done"), color="positive")


# ============================================================================
# 3 · ENTITY DICTIONARY
# ============================================================================
def build_dictionary_panel(tr):
    rows: list[dict] = [{"canonical": e.canonical, "type": e.type, "aliases": ", ".join(e.aliases)}
                        for e in load_entities()]
    dict_types = ["PERSON", "COUNTERPARTY"] + load_token_types()

    with ui.column().classes("w-full gap-5 pt-5"):
        with ui.card().classes("w-full rounded-xl shadow-sm"):
            ui.label(tr("dict.title")).classes("text-base font-medium")
            ui.label(tr("dict.intro")).classes("text-sm text-slate-500")
            editor = ui.column().classes("w-full gap-2 mt-2")

            @ui.refreshable
            def render_rows():
                editor.clear()
                with editor:
                    with ui.row().classes("w-full items-center text-xs text-slate-400 px-1"):
                        ui.label(tr("col.canonical_name")).classes("flex-1")
                        ui.label(tr("col.type")).style("width:170px")
                        ui.label(tr("col.aliases")).classes("flex-1")
                        ui.label("").style("width:40px")
                    if not rows:
                        ui.label(tr("dict.empty")).classes(
                            "text-sm text-slate-400 px-1 py-2")
                    for r in rows:
                        with ui.row().classes("w-full items-center gap-2"):
                            ui.input(value=r["canonical"],
                                     on_change=lambda e, r=r: r.update(canonical=e.value)).props(
                                "outlined dense").classes("flex-1")
                            ui.select(options=(dict_types if r["type"] in dict_types
                                               else dict_types + [r["type"]]),
                                      value=r["type"],
                                      on_change=lambda e, r=r: r.update(type=e.value)).props(
                                "outlined dense").style("width:190px")
                            ui.input(value=r["aliases"],
                                     on_change=lambda e, r=r: r.update(aliases=e.value)).props(
                                "outlined dense").classes("flex-1")
                            ui.button(icon="delete", on_click=lambda r=r: remove_row(r)).props(
                                "flat round dense color=grey-7").style("width:40px")

            def remove_row(r):
                rows.remove(r)
                render_rows.refresh()

            def add_row():
                rows.append({"canonical": "", "type": "COUNTERPARTY", "aliases": ""})
                render_rows.refresh()

            def save():
                ents, seen = [], set()
                for r in rows:
                    name = (r["canonical"] or "").strip()
                    if not name or name.lower() in seen:
                        continue
                    seen.add(name.lower())
                    aliases = [a.strip() for a in (r["aliases"] or "").split(",") if a.strip()]
                    ents.append(Entity(canonical=name, type=(r["type"] or "COUNTERPARTY"), aliases=aliases))
                save_entities(ents)
                ui.notify(tr("dict.saved", count=len(ents)), color="positive")

            def reload_dict():
                rows.clear()
                rows.extend({"canonical": e.canonical, "type": e.type, "aliases": ", ".join(e.aliases)}
                            for e in load_entities())
                render_rows.refresh()
                ui.notify(tr("dict.reloaded"), color="primary")

            render_rows()
            with ui.row().classes("gap-2 mt-2"):
                ui.button(tr("dict.add"), icon="add", on_click=add_row).props("outline no-caps")
                ui.button(tr("dict.save"), icon="save", on_click=save).props("unelevated no-caps")
                ui.button(tr("dict.reload"), icon="refresh", on_click=reload_dict).props("flat no-caps")

            with ui.expansion(tr("dict.bulk_title")).classes("w-full mt-1"):
                ui.label(tr("dict.bulk_hint")).classes(
                    "text-sm text-slate-500")
                bulk = ui.textarea(label=tr("dict.bulk_names")).props("outlined").classes("w-full")
                btype = ui.select(options=["COUNTERPARTY", "PERSON"] + load_token_types(),
                                  value="COUNTERPARTY",
                                  label=tr("dict.bulk_type")).props("outlined dense").style("width:200px")

                def append_bulk():
                    have = {r["canonical"].strip().lower() for r in rows if r["canonical"].strip()}
                    added = 0
                    for line in (bulk.value or "").splitlines():
                        nm = line.strip()
                        if nm and nm.lower() not in have:
                            rows.append({"canonical": nm, "type": btype.value, "aliases": ""})
                            have.add(nm.lower())
                            added += 1
                    bulk.value = ""
                    render_rows.refresh()
                    ui.notify(tr("dict.bulk_added", count=added), color="primary")

                ui.button(tr("dict.append"), icon="playlist_add", on_click=append_bulk).props("outline no-caps")


# ============================================================================
# 4 · SETTINGS  (download detection-language models on demand)
# ============================================================================
def _open_folder(path: str) -> bool:
    """Reveal a folder in the OS file manager. Lethe is a local desktop app, so
    'the server' is the user's own machine. Returns False if it couldn't open."""
    try:
        os.makedirs(path, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(path)  # type: ignore[attr-defined]  # noqa: SLF001
        elif sys.platform == "darwin":
            import subprocess
            subprocess.Popen(["open", path])
        else:
            import subprocess
            subprocess.Popen(["xdg-open", path])
        return True
    except Exception:  # noqa: BLE001 — best-effort; the path is always shown as a fallback
        return False


def build_settings_panel(tr):
    with ui.column().classes("w-full gap-5 pt-5"):
        with ui.card().classes("w-full rounded-xl shadow-sm"):
            ui.label(tr("settings.languages")).classes("text-base font-medium")
            ui.label(tr("settings.languages_hint")).classes(
                "text-sm text-slate-500")
            if not nlp_suggester.available():
                ui.label(tr("settings.nlp_unavailable")).classes("text-sm text-amber-700 mt-1")
            lst = ui.column().classes("w-full gap-0 mt-2")

            @ui.refreshable
            def render():
                lst.clear()
                with lst:
                    for L in nlp_suggester.language_status():
                        with ui.row().classes("items-center gap-3 w-full border-b py-2"):
                            ui.label(_lang_name(tr, L["code"], L["label"])).classes(
                                "font-medium").style("width:110px")
                            ui.label(tr("settings.name_ocr")).classes(
                                "text-xs text-slate-500").style("width:165px")
                            ui.label(_lang_size(tr, L["size"])).classes(
                                "text-xs text-slate-400").style("width:70px")
                            ui.space()
                            if L["builtin"]:
                                ui.badge(tr("settings.builtin"), color="teal-7")
                                # English name detection is bundled, but its OCR model can be
                                # absent on a lean pip install — we never fetch it silently, so
                                # offer an explicit one-off download when OCR is available.
                                if docio.ocr_available() and "eng" not in docio.installed_ocr_languages():
                                    ui.button(tr("settings.add_ocr"), icon="download",
                                              on_click=lambda: do_download_eng_ocr()).props(
                                        "outline no-caps dense").tooltip(
                                        tr("settings.add_ocr_tip"))
                            elif L["installed"]:
                                ui.badge(tr("settings.installed"), color="teal-7")
                                ui.button(tr("settings.remove"), icon="delete",
                                          on_click=lambda c=L["code"],
                                          n=_lang_name(tr, L["code"], L["label"]),
                                          o=L["ocr"]: do_remove(c, n, o)).props("flat no-caps dense color=grey-7")
                            else:
                                ui.button(tr("settings.download"), icon="download",
                                          on_click=lambda c=L["code"],
                                          n=_lang_name(tr, L["code"], L["label"]),
                                          o=L["ocr"]: do_download(c, n, o)).props("outline no-caps dense")

            async def do_download(code, label, ocr):
                note = ui.notification(tr("settings.downloading", label=label),
                                       spinner=True, timeout=None)
                ok, log = await run.io_bound(nlp_suggester.download_language, code)
                ocr_ok = True
                if ok and ocr:
                    ocr_ok, ocr_log = await run.io_bound(docio.download_ocr_language, ocr)
                    log = f"{log}\n--- OCR ---\n{ocr_log}"
                note.dismiss()
                if ok and ocr_ok:
                    ui.notify(tr("settings.installed_ok", label=label),
                              color="positive")
                elif ok and not ocr_ok:
                    ui.notify(tr("settings.ocr_failed", label=label),
                              color="warning", multi_line=True)
                    print(f"\n[OCR download: {label}] FAILED:\n{log}\n")
                else:
                    ui.notify(tr("settings.download_failed", label=label),
                              color="negative", multi_line=True)
                    print(f"\n[language download: {label}] FAILED:\n{log}\n")
                render.refresh()

            async def do_download_eng_ocr():
                note = ui.notification(tr("settings.eng_ocr_downloading"),
                                       spinner=True, timeout=None)
                ok, log = await run.io_bound(docio.download_ocr_language, ["eng"])
                note.dismiss()
                if ok:
                    ui.notify(tr("settings.eng_ocr_ok"),
                              color="positive")
                else:
                    ui.notify(tr("settings.eng_ocr_failed"), color="negative", multi_line=True)
                    print(f"\n[English OCR download] FAILED:\n{log}\n")
                render.refresh()

            async def do_remove(code, label, ocr):
                note = ui.notification(tr("settings.removing", label=label), spinner=True, timeout=None)
                ok, log = await run.io_bound(nlp_suggester.remove_language, code)
                if ocr:
                    await run.io_bound(docio.remove_ocr_language, ocr)
                note.dismiss()
                ui.notify(tr("settings.removed", label=label) if ok else tr("settings.remove_failed", label=label),
                          color="positive" if ok else "negative")
                if not ok:
                    print(f"\n[language remove: {label}] FAILED:\n{log}\n")
                render.refresh()

            render()

        # ---- user-defined token types ----
        with ui.card().classes("w-full rounded-xl shadow-sm"):
            ui.label(tr("settings.token_types")).classes("text-base font-medium")
            ui.label(tr("settings.token_types_hint")).classes(
                "text-sm text-slate-500")
            custom_types = list(load_token_types())
            types_box = ui.column().classes("w-full gap-1 mt-2")
            reload_row = ui.row().classes("items-center gap-2")

            @ui.refreshable
            def render_types():
                types_box.clear()
                with types_box:
                    if not custom_types:
                        ui.label(tr("settings.no_custom_types")).classes("text-sm text-slate-400")
                    for t in custom_types:
                        with ui.row().classes("items-center gap-2"):
                            ui.badge(t).props("color=deep-purple-6")
                            ui.label(f"→ [{t}_001]").classes("text-xs text-slate-500")
                            ui.button(icon="delete", on_click=lambda t=t: remove_type(t)).props(
                                "flat round dense color=grey-7")

            def note_reload():
                reload_row.clear()
                with reload_row:
                    ui.icon("info", size="16px").classes("text-amber-700")
                    ui.label(tr("settings.reload_note")).classes(
                        "text-xs text-amber-700")
                    ui.button(tr("settings.reload_now"), icon="refresh",
                              on_click=lambda: ui.run_javascript("location.reload()")).props(
                        "flat dense no-caps size=sm")

            def add_type():
                t = _sanitize_type(new_type.value)
                new_type.value = ""
                if not t:
                    ui.notify(tr("settings.enter_type"), color="warning")
                    return
                if t in BUILTIN_TYPES:
                    ui.notify(tr("settings.builtin_type", type=t), color="warning")
                    return
                if t in custom_types:
                    ui.notify(tr("settings.type_exists", type=t), color="warning")
                    return
                custom_types.append(t)
                save_token_types(custom_types)
                render_types.refresh()
                note_reload()
                ui.notify(tr("settings.added_type", type=t), color="positive")

            def remove_type(t):
                if t in custom_types:
                    custom_types.remove(t)
                    save_token_types(custom_types)
                    render_types.refresh()
                    note_reload()
                    ui.notify(tr("settings.removed_type", type=t), color="primary")

            render_types()
            with ui.row().classes("items-center gap-2 mt-2"):
                new_type = ui.input(placeholder=tr("settings.new_type")).props(
                    "outlined dense").on("keydown.enter", lambda: add_type())
                ui.button(tr("settings.add_type"), icon="add", on_click=add_type).props("outline no-caps")

        with ui.card().classes("w-full rounded-xl shadow-sm"):
            ui.label(tr("settings.folders")).classes("text-base font-medium")
            ui.label(tr("settings.folders_hint")).classes("text-sm text-slate-500")

            def reveal(p: str):
                if _open_folder(p):
                    ui.notify(tr("settings.opened"), color="primary")
                else:
                    ui.notify(tr("settings.cant_open"),
                              color="warning")

            def folder_row(title: str, desc: str, path: str):
                with ui.column().classes("w-full gap-1 mt-2"):
                    ui.label(title).classes("text-sm font-medium")
                    if desc:
                        ui.label(desc).classes("text-xs text-slate-400")
                    with ui.row().classes("items-center gap-2 w-full no-wrap"):
                        ui.input(value=path).props("outlined dense readonly").classes(
                            "flex-1").style("font-family:monospace;font-size:12px")
                        ui.button(tr("settings.open"), icon="folder_open",
                                  on_click=lambda p=path: reveal(p)).props(
                            "outline no-caps").tooltip(tr("settings.open_tip"))

            folder_row(tr("settings.data_folder_title"),
                       tr("settings.data_folder_desc"),
                       DATA_DIR)
            folder_row(tr("settings.program_folder"), "",
                       os.path.dirname(os.path.abspath(__file__)))

        with ui.card().classes("w-full rounded-xl shadow-sm"):
            ui.label(tr("settings.about")).classes("text-base font-medium")
            ui.html(tr("about.html", version=APP_VERSION, repo=REPO_URL, gh_svg=_GH_SVG))


def run_app() -> None:
    """Console entry point (`lethe`): build the UI and start the local server."""
    main()
    ui.run(title="Lethe", port=8731, reload=False, show=True,
           storage_secret="deident-local", favicon=os.path.join(WEB_STATIC, "favicon.svg"))


if __name__ in {"__main__", "__mp_main__"}:
    run_app()
