"""DOCX read/write: every text container, leak scan, restore round-trip."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

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
