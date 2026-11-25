"""Verify the P0 fidelity corpus: 30 docx + 30 xlsx + 30 pptx.

The manifest is the auditable record the lead asked for: sha256, part count,
the element checklist and the generator version.  This verifier re-opens every
file and proves each applicable element is *actually present* in the OOXML —
an empty file that merely has the right name or size fails.

Run ``pixi run fidelity-corpus`` (CI job ``fidelity-corpus``).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import re
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

from lxml import etree

REPO = Path(__file__).resolve().parent.parent
CORPUS = REPO / "corpus"
MANIFEST = CORPUS / "manifest.csv"
COVERAGE = CORPUS / "COVERAGE.md"
MIN_PER_FORMAT = 30
GENERATOR_VERSION = "1.0.0"

# Features that must be present in every file of a format (n/a elements are not
# listed).  ``hidden_table`` is the xlsx hidden worksheet; ``hidden_page`` is the
# pptx hidden slide.
REQUIRED = {
    "docx": [
        "comment_with_author",
        "header_footer",
        "footnote_endnote",
        "textbox",
        "content_control",
        "hyperlink",
        "revision",
        "merged_cell",
        "media",
        "chart",
        "unique_marker",
    ],
    "xlsx": [
        "comment_with_author",
        "header_footer",
        "textbox",
        "hyperlink",
        "hidden_sheet",
        "merged_cell",
        "media",
        "chart",
        "persons",
        "threaded_comments",
        "custom_xml",
        "doc_props",
        "unique_marker",
    ],
    "pptx": [
        "comment_with_author",
        "header_footer",
        "textbox",
        "hyperlink",
        "hidden_slide",
        "merged_cell",
        "media",
        "chart",
        "speaker_notes",
        "unique_marker",
    ],
}

# Storage forms are mutually exclusive per file, so they are tracked for
# coverage (at least one file each) instead of required in every file.
TRACKED = {
    "xlsx": ["shared_strings", "inline_strings", "mixed_strings"],
}


@dataclass
class CorpusError(Exception):
    path: str
    detail: str

    def __str__(self) -> str:
        return f"{self.path}: {self.detail}"


def _text(xml: bytes) -> str:
    return xml.decode("utf-8", errors="replace")


def _has_text(xml: str) -> bool:
    return bool(re.search(r"<(?:w|a|p):(?:t|text)(?: [^>]*)?>[^<]+<", xml))


def docx_features(data: bytes) -> set[str]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        doc = _text(archive.read("word/document.xml"))
        rels = _text(archive.read("word/_rels/document.xml.rels")) if "word/_rels/document.xml.rels" in names else ""
        features: set[str] = set()
        comments = [n for n in names if re.fullmatch(r"word/comments\d*\.xml", n)]
        if comments:
            xml = _text(archive.read(comments[0]))
            if re.search(r"<w:comment\b[^>]*w:author=\"[^\"]+\"", xml) and _has_text(xml):
                features.add("comment_with_author")
        if (
            any(re.fullmatch(r"word/header\d*\.xml", n) for n in names)
            and any(re.fullmatch(r"word/footer\d*\.xml", n) for n in names)
            and _has_text(_text(archive.read(next(n for n in names if re.fullmatch(r"word/header\d*\.xml", n)))))
            and _has_text(_text(archive.read(next(n for n in names if re.fullmatch(r"word/footer\d*\.xml", n)))))
        ):
            features.add("header_footer")
        if "word/footnotes.xml" in names and "word/endnotes.xml" in names:
            fn = _text(archive.read("word/footnotes.xml"))
            en = _text(archive.read("word/endnotes.xml"))
            if re.search(r"<w:footnote\b(?![^>]*w:id=\"(?:0|-1)\")", fn) and _has_text(fn) and re.search(
                r"<w:endnote\b(?![^>]*w:id=\"(?:0|-1)\")", en
            ) and _has_text(en):
                features.add("footnote_endnote")
        if "w:txbxContent" in doc and _has_text(doc):
            features.add("textbox")
        if "<w:sdt>" in doc and "<w:sdtContent>" in doc:
            features.add("content_control")
        if "<w:hyperlink " in doc and "r:id=" in doc and "hyperlink" in rels:
            features.add("hyperlink")
        if re.search(r"<w:ins\b[^>]*w:author=", doc) and re.search(r"<w:del\b[^>]*w:author=", doc) and "<w:delText" in doc:
            features.add("revision")
        if "<w:gridSpan" in doc or "<w:vMerge" in doc:
            features.add("merged_cell")
        if any(n.startswith("word/media/") and archive.getinfo(n).file_size > 100 for n in names):
            features.add("media")
        if any(re.fullmatch(r"word/charts/chart\d*\.xml", n) for n in names):
            features.add("chart")
        return features


def xlsx_features(data: bytes) -> set[str]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        features: set[str] = set()
        comments = [n for n in names if re.fullmatch(r"xl/comments(?:/\w+)?\.xml", n)]
        if comments:
            xml = _text(archive.read(comments[0]))
            if re.search(r"<author>[^<]+</author>", xml) and "<comment " in xml:
                features.add("comment_with_author")
        if any(re.fullmatch(r"xl/threadedComments/threadedComment\d*\.xml", n) for n in names):
            xml = _text(archive.read(next(n for n in names if re.fullmatch(r"xl/threadedComments/threadedComment\d*\.xml", n))))
            if "personId=" in xml and re.search(r"<text[^>]*>[^<]+</text>", xml):
                features.add("threaded_comments")
        if any(re.fullmatch(r"xl/persons/person\d*\.xml", n) for n in names):
            xml = _text(archive.read(next(n for n in names if re.fullmatch(r"xl/persons/person\d*\.xml", n))))
            if 'displayName="' in xml:
                features.add("persons")
        custom = [
            n
            for n in names
            if n.startswith("customXml/item") and n.endswith(".xml") and "itemProps" not in n
        ]
        if custom and any(re.search(r">[^<>]+<", _text(archive.read(n))) for n in custom):
            features.add("custom_xml")
        if "docProps/core.xml" in names:
            core = _text(archive.read("docProps/core.xml"))
            if re.search(r"<dc:creator>[^<]+</dc:creator>", core) or "lastModifiedBy" in core:
                features.add("doc_props")
        if "xl/sharedStrings.xml" in names and re.search(
            r"<t[^>]*>[^<]+</t>", _text(archive.read("xl/sharedStrings.xml"))
        ):
            features.add("shared_strings")
        sheet_xmls = [_text(archive.read(n)) for n in names if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)]
        if any(
            't="inlineStr"' in x and re.search(r"<t[^>]*>[^<]+</t>", x)
            for x in sheet_xmls
        ):
            features.add("inline_strings")
        if "shared_strings" in features and "inline_strings" in features:
            features.add("mixed_strings")
        if any("<headerFooter" in x and "<oddHeader" in x for x in sheet_xmls):
            features.add("header_footer")
        drawings = [
            etree.fromstring(archive.read(n))
            for n in names
            if re.fullmatch(r"xl/drawings/drawing\d+\.xml", n)
        ]
        for root in drawings:
            sp = root.find(
                ".//{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}sp"
            )
            tx = root.find(
                ".//{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}txBody"
            )
            if sp is None or tx is None:
                continue
            if any(
                (el.text or "").strip()
                for el in tx.iter()
                if isinstance(el.tag, str)
                and etree.QName(el).localname == "t"
            ):
                features.add("textbox")
                break
        if any("<hyperlink " in x for x in sheet_xmls) and any(
            'TargetMode="External"' in _text(archive.read(n))
            for n in names
            if n.startswith("xl/worksheets/_rels/")
        ):
            features.add("hyperlink")
        workbook = _text(archive.read("xl/workbook.xml"))
        if 'state="hidden"' in workbook or 'state="veryHidden"' in workbook:
            features.add("hidden_sheet")
        if any("<mergeCell " in x for x in sheet_xmls):
            features.add("merged_cell")
        if any(n.startswith("xl/media/") and archive.getinfo(n).file_size > 100 for n in names):
            features.add("media")
        if any(re.fullmatch(r"xl/charts/chart\d*\.xml", n) for n in names):
            features.add("chart")
        return features


def pptx_features(data: bytes) -> set[str]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        features: set[str] = set()
        comments = [n for n in names if re.fullmatch(r"ppt/comments/comment\d*\.xml", n)]
        authors = "ppt/commentAuthors.xml" in names and _text(archive.read("ppt/commentAuthors.xml"))
        if comments and authors and re.search(r"name=\"[^\"]+\"", authors):
            xml = _text(archive.read(comments[0]))
            if "<p:cm " in xml and _has_text(xml):
                features.add("comment_with_author")
        slide_names = [n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
        slides = [_text(archive.read(n)) for n in slide_names]
        if any('type="ftr"' in x and _has_text(x) for x in slides):
            features.add("header_footer")
        if any('txBox="1"' in x and _has_text(x) for x in slides):
            features.add("textbox")
        slide_rels = [
            _text(archive.read(n)) for n in names if re.fullmatch(r"ppt/slides/_rels/slide\d+\.xml\.rels", n)
        ]
        if any("a:hlinkClick" in x for x in slides) and any('TargetMode="External"' in r for r in slide_rels):
            features.add("hyperlink")
        if any('show="0"' in x for x in slides):
            features.add("hidden_slide")
        if any("gridSpan" in x or "rowSpan" in x for x in slides):
            features.add("merged_cell")
        if any(n.startswith("ppt/media/") and archive.getinfo(n).file_size > 100 for n in names):
            features.add("media")
        if any(re.fullmatch(r"ppt/charts/chart\d*\.xml", n) for n in names):
            features.add("chart")
        notes = [n for n in names if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", n)]
        if notes and any(_has_text(_text(archive.read(n))) for n in notes):
            features.add("speaker_notes")
        return features


EXTRACTORS = {"docx": docx_features, "xlsx": xlsx_features, "pptx": pptx_features}


def actual_features(path: Path) -> set[str]:
    data = path.read_bytes()
    features = EXTRACTORS[path.suffix.lstrip(".")](data)
    marker = f"CASE-{path.suffix.lstrip('.').upper()}-{path.stem.split('-')[-1]}"
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        blob = b"".join(archive.read(n) for n in archive.namelist() if n.endswith(".xml"))
    if marker.encode() in blob:
        features.add("unique_marker")
    return features


def read_manifest() -> list[dict[str, str]]:
    if not MANIFEST.exists():
        raise CorpusError(str(MANIFEST), "manifest.csv is missing; run `pixi run corpus`")
    with MANIFEST.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def verify(strict: bool = True) -> list[str]:
    errors: list[str] = []
    rows = read_manifest()
    seen: dict[str, int] = {fmt: 0 for fmt in REQUIRED}
    coverage: dict[str, dict[str, int]] = {
        fmt: {feature: 0 for feature in REQUIRED[fmt]} for fmt in REQUIRED
    }
    for row in rows:
        rel = row["path"]
        path = REPO / rel
        fmt = row["format"]
        seen[fmt] = seen.get(fmt, 0) + 1
        if not path.exists():
            errors.append(f"{rel}: missing file")
            continue
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != row["sha256"]:
            errors.append(f"{rel}: sha256 {digest[:12]}… != manifest {row['sha256'][:12]}…")
        try:
            features = actual_features(path)
        except (zipfile.BadZipFile, KeyError) as exc:
            errors.append(f"{rel}: unreadable OOXML ({exc})")
            continue
        missing = [f for f in REQUIRED[fmt] if f not in features]
        if missing:
            errors.append(f"{rel}: missing element(s) {', '.join(missing)}")
        for feature in features & set(REQUIRED[fmt]):
            coverage[fmt][feature] += 1
        declared = {f for f in row["features"].split(";") if f}
        if declared != features:
            errors.append(f"{rel}: manifest features {sorted(declared)} != actual {sorted(features)}")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            parts = len(archive.infolist())
        if str(parts) != row["parts"]:
            errors.append(f"{rel}: {parts} parts != manifest {row['parts']}")
    for fmt, count in seen.items():
        if count < MIN_PER_FORMAT:
            errors.append(f"{fmt}: only {count} files, need >= {MIN_PER_FORMAT}")
    if strict:
        for fmt, feature_counts in coverage.items():
            for feature, count in feature_counts.items():
                if count < MIN_PER_FORMAT:
                    errors.append(f"{fmt}: feature {feature} covered by {count} files, need {MIN_PER_FORMAT}")
        for fmt, tracked in TRACKED.items():
            for feature in tracked:
                count = sum(
                    1
                    for row in rows
                    if row["format"] == fmt and feature in row["features"].split(";")
                )
                if count < 1:
                    errors.append(f"{fmt}: tracked feature {feature} has no corpus file")
    return errors


def coverage_table() -> str:
    rows = read_manifest()
    features: dict[str, dict[str, int]] = {fmt: {} for fmt in REQUIRED}
    counts = {fmt: 0 for fmt in REQUIRED}
    for row in rows:
        fmt = row["format"]
        counts[fmt] = counts.get(fmt, 0) + 1
        for feature in row["features"].split(";"):
            if feature:
                features[fmt][feature] = features[fmt].get(feature, 0) + 1
    per_format = ", ".join(f"{fmt} {counts[fmt]}" for fmt in REQUIRED)
    lines = [
        "<!-- generated by tools/make_corpus.py; do not edit -->",
        "# P0 fidelity corpus coverage",
        "",
        f"Generator version: `{GENERATOR_VERSION}` · files: {len(rows)} ({per_format})",
        "",
        "| format | element | files with element |",
        "|---|---|---:|",
    ]
    for fmt, required in REQUIRED.items():
        for feature in required:
            lines.append(f"| {fmt} | {feature} | {features[fmt].get(feature, 0)}/{MIN_PER_FORMAT} |")
        for feature in TRACKED.get(fmt, []):
            lines.append(f"| {fmt} | {feature} | {features[fmt].get(feature, 0)}/{counts[fmt]} |")
    lines.append("")
    return "\n".join(lines)

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--write-coverage", action="store_true")
    args = parser.parse_args(argv)
    errors = verify(strict=args.strict)
    if args.write_coverage:
        COVERAGE.write_text(coverage_table(), encoding="utf-8")
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        print(f"fidelity-corpus: {len(errors)} problem(s)", file=sys.stderr)
        return 1
    print(f"fidelity-corpus: OK — {len(read_manifest())} files, all applicable elements present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
