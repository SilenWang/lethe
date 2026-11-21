"""P0 skeleton for the post-processing contract (implementation lands in P1).

These tests pin the three assertions and — more importantly — the failure
message.  Every failure must name the contract rule and the part, because P1
will run them against real BetterOffice output where "assert failed" is useless.
"""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from tools.postprocess_contract import (
    RULE_COMPRESSED_STREAM,
    RULE_PART_SHA256,
    RULE_SOURCE_PRIORITY,
    ContractViolation,
    assert_source_priority,
    assert_unedited_compressed_stream,
    assert_unedited_part_sha256,
)

PARTS = {
    "[Content_Types].xml": b"<Types/>",
    "word/document.xml": b"<w:document><w:t>Alice</w:t></w:document>",
    "word/styles.xml": b"<w:styles/>",
    "word/media/image1.png": b"\x89PNG\r\n\x1a\n" + b"\0" * 512,
}


def _zip(parts: dict[str, bytes], level: int = 6) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=level) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)
    buf.seek(0)
    return buf


def _assert_raises(rule: str, part: str, func, *args) -> ContractViolation:
    with pytest.raises(ContractViolation) as excinfo:
        func(*args)
    violation = excinfo.value
    assert violation.rule == rule
    assert violation.part == part
    text = str(violation)
    assert rule in text
    assert part in text
    return violation


def test_c1_passes_on_identity_and_skips_edited_parts() -> None:
    source = _zip(PARTS)
    edited = dict(PARTS)
    edited["word/document.xml"] = b"<w:document><w:t>[PERSON_001]</w:t></w:document>"
    assert_source_priority(source, _zip(PARTS), edited_parts=[])
    assert_source_priority(source, _zip(edited), edited_parts=["word/document.xml"])


def test_c1_detects_a_changed_unedited_part_and_names_it() -> None:
    tampered = dict(PARTS)
    tampered["word/styles.xml"] = b"<w:styles/>\n"
    _assert_raises(
        RULE_SOURCE_PRIORITY,
        "word/styles.xml",
        assert_source_priority,
        _zip(PARTS),
        _zip(tampered),
    )


def test_c1_detects_a_part_the_library_added() -> None:
    tampered = dict(PARTS)
    tampered["word/extra.xml"] = b"<x/>"
    _assert_raises(
        RULE_SOURCE_PRIORITY,
        "word/extra.xml",
        assert_source_priority,
        _zip(PARTS),
        _zip(tampered),
    )


def test_c1_detects_a_dropped_part() -> None:
    tampered = dict(PARTS)
    del tampered["word/styles.xml"]
    _assert_raises(
        RULE_SOURCE_PRIORITY,
        "word/styles.xml",
        assert_source_priority,
        _zip(PARTS),
        _zip(tampered),
    )


def test_c2_passes_and_skips_the_edited_part() -> None:
    edited = dict(PARTS)
    edited["word/document.xml"] = b"<w:document><w:t>[PERSON_001]</w:t></w:document>"
    assert_unedited_part_sha256(_zip(PARTS), _zip(PARTS))
    assert_unedited_part_sha256(_zip(PARTS), _zip(edited), edited_parts=["word/document.xml"])


def test_c2_names_the_part_on_sha_mismatch() -> None:
    tampered = dict(PARTS)
    tampered["word/styles.xml"] = b"<w:styles>changed</w:styles>"
    violation = _assert_raises(
        RULE_PART_SHA256,
        "word/styles.xml",
        assert_unedited_part_sha256,
        _zip(PARTS),
        _zip(tampered),
    )
    assert "sha256" in str(violation)


def test_c3_passes_when_the_stream_is_copied_verbatim() -> None:
    assert_unedited_compressed_stream(_zip(PARTS), _zip(PARTS))


def test_c3_detects_recompression_even_when_bytes_match() -> None:
    """Same decompressed content, different stream: C2 passes, C3 fails."""
    source = _zip(PARTS, level=1)
    recompressed = io.BytesIO()
    with zipfile.ZipFile(recompressed, "w") as archive:
        for name, data in PARTS.items():
            method = zipfile.ZIP_STORED if name == "word/document.xml" else zipfile.ZIP_DEFLATED
            archive.writestr(name, data, compress_type=method, compresslevel=1)
    recompressed.seek(0)
    assert_unedited_part_sha256(source, recompressed)
    _assert_raises(
        RULE_COMPRESSED_STREAM,
        "word/document.xml",
        assert_unedited_compressed_stream,
        source,
        recompressed,
    )


def test_c3_skips_a_part_the_library_edited() -> None:
    edited = dict(PARTS)
    edited["word/document.xml"] = b"<w:document><w:t>[PERSON_001]</w:t></w:document>"
    assert_unedited_compressed_stream(
        _zip(PARTS, level=1), _zip(edited, level=1), edited_parts=["word/document.xml"]
    )
