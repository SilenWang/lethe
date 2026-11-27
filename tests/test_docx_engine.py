"""DOCX read/write: every text container, leak scan, restore round-trip."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from lxml import etree

from lethe import Entity, build_restorer
from lethe.docx_engine import extract_all_text_parts, redact, restore, scan_leaks
from lethe.postprocess import postprocess

REPO = Path(__file__).resolve().parents[1]
CORPUS = REPO / "corpus" / "docx" / "docx-001.docx"
ENTITIES = [
    Entity("John Smith", "PERSON"),
    Entity("Alice Chen", "PERSON"),
    Entity("Project Phoenix", "COUNTERPARTY"),
]


def _library_repack(raw: bytes, updates: dict[str, str]) -> bytes:
    """Stand-in for BetterOffice: rewrite the whole archive."""
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    for name, xml in updates.items():
        parts[name] = xml.encode("utf-8")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def test_every_text_container_is_redacted() -> None:
    result = redact(CORPUS.read_bytes(), ENTITIES)
    assert set(result.updates) >= {
        "word/document.xml",
        "word/header1.xml",
        "word/footer1.xml",
        "word/comments.xml",
        "word/footnotes.xml",
        "word/endnotes.xml",
        "docProps/core.xml",
    }
    assert "[PERSON_001]" in result.updates["word/document.xml"]
    assert "[COUNTERPARTY_001]" in result.updates["word/document.xml"]
    assert "john.smith@example.com" not in result.updates["word/document.xml"]


def test_comment_and_revision_authors_are_redacted() -> None:
    result = redact(CORPUS.read_bytes(), ENTITIES)
    comments = result.updates["word/comments.xml"]
    assert 'w:author="John Smith"' not in comments
    assert 'w:author="Alice Chen"' not in comments
    assert "[PERSON_" in comments


def test_leak_scan_is_zero_after_postprocess() -> None:
    source = CORPUS.read_bytes()
    result = redact(source, ENTITIES)
    library = _library_repack(source, result.updates)
    final = postprocess(source, library, result.tokens)
    surfaces = [item["canonical"] for item in result.items if item["include"]]
    surfaces += ["john.smith@example.com"]
    assert scan_leaks(final, [str(surface) for surface in surfaces]) == []


def test_restore_matches_char_for_char() -> None:
    source = CORPUS.read_bytes()
    result = redact(source, ENTITIES)
    token_map = {str(item["token"]): str(item["canonical"]) for item in result.items}
    redacted = restore(_library_repack(source, result.updates), token_map)
    original_parts = extract_all_text_parts(source)
    restored_parts = extract_all_text_parts(_library_repack(source, redacted.updates))
    assert set(restored_parts) == set(original_parts)
    for name, text in original_parts.items():
        assert restored_parts[name] == text, name


def test_restore_accepts_a_tampered_token_stream() -> None:
    token_map = {"[PERSON_001]": "John Smith"}
    replace = build_restorer(token_map)
    assert replace("Dear [PERSON_001],")[0] == "Dear John Smith,"


def test_restore_survives_postprocess() -> None:
    """The worker's finish step must keep a restore, not revert to the source."""
    source = CORPUS.read_bytes()
    redacted = redact(source, ENTITIES)
    redacted_pkg = _library_repack(source, redacted.updates)
    token_map = {str(item["token"]): str(item["canonical"]) for item in redacted.items}
    restored = restore(redacted_pkg, token_map)
    assert restored.hits > 0
    final = postprocess(
        redacted_pkg, _library_repack(redacted_pkg, restored.updates), restored.tokens
    )
    assert extract_all_text_parts(final) == extract_all_text_parts(source)


# ------------------------------------------------------- replacement accounting
# The count the UI shows must equal what the exported file actually contains.
# These tests pin the three ways that used to drift apart: comments in a
# numbered part, a name split across runs, and the body/comment/metadata split.

_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
_W15 = 'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"'
_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'


def _package(parts: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        for name, xml in parts.items():
            archive.writestr(name, xml)
    return buffer.getvalue()


def _document(body: str) -> str:
    return f"{_DECL}<w:document {_W}><w:body>{body}</w:body></w:document>"


def _comment_part(comment: str, name: str = "comments") -> str:
    return f"{_DECL}<w:comments {_W}>{comment}</w:comments>"


def _exported_hits(raw: bytes, result) -> int:
    """Count the tokens the exported package really contains."""
    import re

    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    for name, xml in result.updates.items():
        parts[name] = xml.encode("utf-8")
    tokens = 0
    for name, data in parts.items():
        if name.endswith(".xml"):
            tokens += len(re.findall(r"\[[A-Z][A-Z0-9_]*_\d{3,}\]", data.decode("utf-8")))
    return tokens


def test_counts_split_body_comments_and_metadata() -> None:
    result = redact(CORPUS.read_bytes(), ENTITIES)
    assert result.body_hits == result.counts["word/document.xml"] > 0
    assert result.comment_hits == result.counts["word/comments.xml"] > 0
    assert result.body_hits + result.comment_hits + result.other_hits == result.hits
    # headers, footers, notes and core properties are the "other" bucket
    assert result.other_hits > 0


def test_counts_match_the_exported_package() -> None:
    """The headline number is what lands in the file, not an estimate."""
    source = CORPUS.read_bytes()
    result = redact(source, ENTITIES)
    assert _exported_hits(source, result) == result.hits


def test_numbered_comment_parts_are_counted() -> None:
    """A merged document keeps its comments in ``comments1.xml``."""
    comment = (
        '<w:comment w:id="0" w:author="Alice Chen">'
        "<w:p><w:r><w:t>Alice Chen: confirm with John Smith.</w:t></w:r></w:p>"
        "</w:comment>"
    )
    raw = _package({
        "word/document.xml": _document("<w:p><w:r><w:t>Dear John Smith</w:t></w:r></w:p>"),
        "word/comments1.xml": _comment_part(comment, "comments1"),
    })
    result = redact(raw, ENTITIES)
    assert result.comment_hits == result.counts["word/comments1.xml"] == 3
    assert "Alice Chen" not in result.updates["word/comments1.xml"]
    assert "John Smith" not in result.updates["word/comments1.xml"]
    assert result.hits == _exported_hits(raw, result)


def test_a_name_split_across_runs_is_replaced_and_counted() -> None:
    """Word splits phrases across ``w:r``; the token must reach the file."""
    raw = _package({
        "word/document.xml": _document(
            "<w:p>"
            '<w:r><w:t>Dear John</w:t></w:r>'
            '<w:r><w:t xml:space="preserve"> Smith, please confirm.</w:t></w:r>'
            "</w:p>"
        ),
    })
    result = redact(raw, ENTITIES)
    exported = extract_all_text_parts(_library_repack(raw, result.updates))
    assert "John Smith" not in exported["word/document.xml"]
    assert "[PERSON_" in exported["word/document.xml"]
    assert result.body_hits == 1
    assert _exported_hits(raw, result) == result.hits == 1


def test_single_run_formatting_survives_a_replacement() -> None:
    """The common case must not be flattened just because merging is possible."""
    raw = _package({
        "word/document.xml": _document(
            '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Dear John Smith</w:t></w:r></w:p>'
        ),
    })
    result = redact(raw, ENTITIES)
    xml = result.updates["word/document.xml"]
    assert "<w:b/>" in xml  # inline formatting kept
    assert "John Smith" not in xml


def test_detection_sees_text_the_writer_replaces() -> None:
    """Preview/leak scanning must use the same merged paragraphs as the writer."""
    raw = _package({
        "word/document.xml": _document(
            "<w:p>"
            '<w:r><w:t>Dear John</w:t></w:r>'
            '<w:r><w:t xml:space="preserve"> Smith, please confirm.</w:t></w:r>'
            "</w:p>"
        ),
    })
    assert "John Smith" in extract_all_text_parts(raw)["word/document.xml"]


def test_text_box_paragraphs_are_not_merged_into_the_outer_paragraph() -> None:
    """Nested text-box runs stay in place and do not clear sibling runs."""
    raw = _package({
        "word/document.xml": _document(
            "<w:p>"
            "<w:r><w:t>John Smith</w:t></w:r>"
            "<w:r><w:pict><w:txbxContent><w:p>"
            "<w:r><w:t>John</w:t></w:r>"
            '<w:r><w:t xml:space="preserve"> Smith</w:t></w:r>'
            "</w:p></w:txbxContent></w:pict></w:r>"
            "<w:r><w:t>Tail</w:t></w:r>"
            "</w:p>"
        ),
    })
    result = redact(raw, ENTITIES)
    root = etree.fromstring(result.updates["word/document.xml"].encode("utf-8"))
    namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    body_texts = [
        node.text for node in root.xpath(".//w:body/w:p/w:r/w:t", namespaces=namespaces)
    ]
    box_texts = [
        node.text
        for node in root.xpath(
            ".//w:txbxContent/w:p/w:r/w:t", namespaces=namespaces
        )
    ]

    assert body_texts == ["[PERSON_001]", "Tail"]
    assert box_texts == ["[PERSON_001]", None]
    assert result.body_hits == 2
    assert _exported_hits(raw, result) == result.hits == 2


def test_people_pane_author_is_redacted_and_not_reported_as_a_leak() -> None:
    """The People pane keeps comment authors outside ``comments*.xml``."""
    people = (
        f'{_DECL}<w15:people {_W15}>'
        '<w15:person w15:author="John Smith">'
        '<w15:presenceInfo w15:providerId="None"/>'
        "</w15:person></w15:people>"
    )
    raw = _package({"word/people.xml": people})
    result = redact(raw, ENTITIES)

    assert result.other_hits == result.counts["word/people.xml"] == 1
    assert 'w15:author="John Smith"' not in result.updates["word/people.xml"]
    assert 'w15:author="[PERSON_001]"' in result.updates["word/people.xml"]
    assert scan_leaks(_library_repack(raw, result.updates), ["John Smith"]) == []
