"""P1 postprocess: source package first, only token-bearing edits survive."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest

from lethe.postprocess import postprocess
from tools.postprocess_contract import (
    assert_source_priority,
    assert_unedited_compressed_stream,
    assert_unedited_part_sha256,
)

DOC = "<w:document><w:p><w:r><w:t>{}</w:t></w:r></w:p></w:document>"
REPO = Path(__file__).resolve().parents[1]


def _zip(parts: dict[str, bytes], method: int = zipfile.ZIP_DEFLATED) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", method) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def _source() -> bytes:
    return _zip(
        {
            "[Content_Types].xml": b"<Types><Default Extension=\"xml\"/></Types>",
            "_rels/.rels": b"<Relationships/>",
            "word/document.xml": DOC.format("Contact Alice Tan").encode(),
            "word/styles.xml": b"<w:styles/>" * 40,
            "docProps/core.xml": b"<cp:coreProperties><dc:creator>Alice Tan</dc:creator></cp:coreProperties>",
        }
    )


def _library_output(source: bytes) -> bytes:
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    parts["word/document.xml"] = DOC.format("Contact [PERSON_001]").encode()
    parts["docProps/core.xml"] = (
        b"<cp:coreProperties><dc:creator>[PERSON_001]</dc:creator></cp:coreProperties>"
    )
    # Library rewrote a part nobody asked it to touch (no token):
    parts["word/styles.xml"] = b"<w:styles/>" * 40 + b"<!-- reformatted -->"
    # Library added an unattached part:
    parts["word/extra.xml"] = b"<extra/>"
    return _zip(parts)


def test_only_token_bearing_changed_parts_survive() -> None:
    source = _source()
    output = _library_output(source)
    final = postprocess(source, output, ["[PERSON_001]"])

    with zipfile.ZipFile(io.BytesIO(final)) as archive:
        assert archive.testzip() is None
        assert archive.read("word/document.xml") == DOC.format("Contact [PERSON_001]").encode()
        assert archive.read("docProps/core.xml").count(b"[PERSON_001]") == 1
        assert archive.read("word/styles.xml") == b"<w:styles/>" * 40
        assert "word/extra.xml" not in archive.namelist()
        assert set(archive.namelist()) == {
            "[Content_Types].xml",
            "_rels/.rels",
            "word/document.xml",
            "word/styles.xml",
            "docProps/core.xml",
        }


def test_unedited_entries_keep_their_raw_stream() -> None:
    source = _source()
    final = postprocess(source, _library_output(source), ["[PERSON_001]"])
    edited = {"word/document.xml", "docProps/core.xml"}
    assert_source_priority(io.BytesIO(source), io.BytesIO(final), edited)
    assert_unedited_part_sha256(io.BytesIO(source), io.BytesIO(final), edited)
    assert_unedited_compressed_stream(io.BytesIO(source), io.BytesIO(final), edited)


def test_content_types_and_rels_are_byte_identical() -> None:
    source = _source()
    final = postprocess(source, _library_output(source), ["[PERSON_001]"])
    with zipfile.ZipFile(io.BytesIO(source)) as src, zipfile.ZipFile(io.BytesIO(final)) as out:
        for name in ("[Content_Types].xml", "_rels/.rels"):
            assert out.read(name) == src.read(name)


def test_explicit_edited_part_without_token_is_kept() -> None:
    source = _source()
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    parts["docProps/core.xml"] = b"<cp:coreProperties><dc:title>x</dc:title></cp:coreProperties>"
    final = postprocess(
        source,
        _zip(parts),
        [],
        edited_parts={"word/document.xml", "docProps/core.xml"},
    )
    with zipfile.ZipFile(io.BytesIO(final)) as archive:
        assert b"dc:title" in archive.read("docProps/core.xml")


def test_missing_library_part_is_restored_from_source() -> None:
    source = _source()
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    parts.pop("word/styles.xml")
    final = postprocess(source, _zip(parts), ["[PERSON_001]"])
    with zipfile.ZipFile(io.BytesIO(final)) as archive:
        assert archive.read("word/styles.xml") == b"<w:styles/>" * 40


def test_restore_direction_keeps_parts_whose_source_had_tokens() -> None:
    """Restore moves a part from token text back to real text."""
    source = _zip(
        {
            "[Content_Types].xml": b"<Types/>",
            "word/document.xml": DOC.format("Contact [PERSON_001]").encode(),
            "word/styles.xml": b"<w:styles/>",
        }
    )
    output = _zip(
        {
            "[Content_Types].xml": b"<Types/>",
            "word/document.xml": DOC.format("Contact Alice Tan").encode(),
            "word/styles.xml": b"<w:styles/>",
        }
    )
    final = postprocess(source, output, ["[PERSON_001]"])
    with zipfile.ZipFile(io.BytesIO(final)) as archive:
        assert b"Alice Tan" in archive.read("word/document.xml")
        assert b"[PERSON_001]" not in archive.read("word/document.xml")
    edited = {"word/document.xml"}
    assert_source_priority(io.BytesIO(source), io.BytesIO(final), edited)
    assert_unedited_part_sha256(io.BytesIO(source), io.BytesIO(final), edited)
    assert_unedited_compressed_stream(io.BytesIO(source), io.BytesIO(final), edited)


def test_rebuild_is_deterministic() -> None:
    source = _source()
    output = _library_output(source)
    first = postprocess(source, output, ["[PERSON_001]"])
    second = postprocess(source, output, ["[PERSON_001]"])
    assert first == second


def test_bad_source_package_is_named() -> None:
    with pytest.raises(zipfile.BadZipFile):
        postprocess(b"not a zip", b"not a zip", [])


def test_real_corpus_package_passes_all_three_contracts() -> None:
    source = (REPO / "corpus" / "docx" / "docx-001.docx").read_bytes()
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    parts["word/document.xml"] += b"<!-- [PERSON_001] -->"
    final = postprocess(source, _zip(parts), ["[PERSON_001]"])
    edited = {"word/document.xml"}
    assert_source_priority(io.BytesIO(source), io.BytesIO(final), edited)
    assert_unedited_part_sha256(io.BytesIO(source), io.BytesIO(final), edited)
    assert_unedited_compressed_stream(io.BytesIO(source), io.BytesIO(final), edited)
    with zipfile.ZipFile(io.BytesIO(final)) as archive:
        assert archive.testzip() is None
        assert archive.read("[Content_Types].xml") == parts["[Content_Types].xml"]
