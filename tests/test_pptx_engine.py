"""PPTX engine: all text parts are edited directly (no presentation model)."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from lethe import Entity, pptx_engine

REPO = Path(__file__).resolve().parents[1]
SEED = REPO / "corpus" / "seeds" / "pptx-02-enhanced.pptx"
JOHN = Entity("John Smith", "PERSON")
ALICE = Entity("Alice Chen", "PERSON")


def _parts(raw: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


def _zip(parts: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def test_extract_covers_every_gap_part() -> None:
    parts = pptx_engine.extract_all_text_parts(SEED.read_bytes())
    for name in (
        "ppt/slides/slide2.xml",
        "ppt/notesSlides/notesSlide1.xml",
        "ppt/slideMasters/slideMaster1.xml",
        "ppt/slideLayouts/slideLayout1.xml",
        "ppt/comments/comment1.xml",
        "ppt/commentAuthors.xml",
        "docProps/core.xml",
    ):
        assert name in parts, name
    assert "John Smith" in "".join(parts.values())


def test_all_text_parts_are_patched() -> None:
    result = pptx_engine.redact(SEED.read_bytes(), [JOHN, ALICE])
    assert result.hits > 0
    assert set(result.updates) >= {
        "ppt/slides/slide2.xml",
        "ppt/slides/slide3.xml",
        "ppt/slides/slide4.xml",
        "docProps/core.xml",
        "ppt/commentAuthors.xml",
        "ppt/comments/comment1.xml",
        "ppt/notesSlides/notesSlide1.xml",
        "ppt/slideLayouts/slideLayout1.xml",
        "ppt/slideMasters/slideMaster1.xml",
    }
    for name, xml in result.updates.items():
        assert "[PERSON_" in xml, name
    assert "John Smith" not in result.updates["ppt/notesSlides/notesSlide1.xml"]
    assert "John Smith" not in result.updates["docProps/core.xml"]
    assert "Alice Chen" not in result.updates["ppt/commentAuthors.xml"]


def test_output_is_leak_free_and_only_touches_expected_parts() -> None:
    source = SEED.read_bytes()
    result = pptx_engine.redact(source, [JOHN, ALICE])
    final = result.output
    assert final is not None
    assert pptx_engine.scan_leaks(final, result.surfaces) == []
    before, after = _parts(source), _parts(final)
    assert list(before) == list(after)
    changed = {name for name in before if before[name] != after[name]}
    assert changed <= {
        "ppt/slides/slide2.xml",
        "ppt/slides/slide3.xml",
        "ppt/slides/slide4.xml",
        "ppt/notesSlides/notesSlide1.xml",
        "ppt/slideMasters/slideMaster1.xml",
        "ppt/slideLayouts/slideLayout1.xml",
        "ppt/comments/comment1.xml",
        "ppt/commentAuthors.xml",
        "docProps/core.xml",
    }
    assert "[Content_Types].xml" not in changed
    assert "ppt/presentation.xml" not in changed


def test_restore_roundtrip_is_char_for_char() -> None:
    source = SEED.read_bytes()
    result = pptx_engine.redact(source, [JOHN, ALICE])
    redacted = result.output
    assert redacted is not None
    token_map = {
        str(item["token"]): str(item["canonical"])
        for item in result.items
        if item.get("token")
    }
    restored = pptx_engine.restore(redacted, token_map)
    assert restored.output is not None
    assert pptx_engine.extract_all_text_parts(restored.output) == pptx_engine.extract_all_text_parts(source)


def test_split_runs_in_a_notes_paragraph_are_replaced() -> None:
    parts = _parts(SEED.read_bytes())
    notes = parts["ppt/notesSlides/notesSlide1.xml"].decode()
    notes = notes.replace("<a:t>John Smith", "<a:t>John</a:t></a:r><a:r><a:t> Smith", 1)
    parts["ppt/notesSlides/notesSlide1.xml"] = notes.encode()
    raw = _zip(parts)
    result = pptx_engine.redact(raw, [JOHN])
    out = result.updates["ppt/notesSlides/notesSlide1.xml"]
    assert "John Smith" not in out
    assert "[PERSON_" in out


def test_case_variant_in_a_slide_is_a_replacement_and_leak_surface() -> None:
    parts = _parts(SEED.read_bytes())
    slide = parts["ppt/slides/slide2.xml"].decode().replace("John Smith", "JOHN SMITH")
    parts["ppt/slides/slide2.xml"] = slide.encode()
    raw = _zip(parts)
    result = pptx_engine.redact(raw, [JOHN])
    assert "JOHN SMITH" not in pptx_engine.extract_all_text_parts(result.output)[
        "ppt/slides/slide2.xml"
    ]
    final = result.output
    assert final is not None
    assert pptx_engine.scan_leaks(final, result.surfaces) == []


def test_raw_parts_without_gaps_are_still_valid() -> None:
    result = pptx_engine.redact((REPO / "corpus" / "pptx" / "pptx-001.pptx").read_bytes(), [ALICE])
    assert result.hits > 0
    assert "ppt/commentAuthors.xml" in result.updates
    assert result.output is not None


def test_corpus_pptx_roundtrip() -> None:
    for name in ("pptx-001.pptx", "pptx-015.pptx", "pptx-030.pptx"):
        source = (REPO / "corpus" / "pptx" / name).read_bytes()
        result = pptx_engine.redact(source, [JOHN, ALICE])
        assert result.hits > 0, name
        redacted = result.output
        assert redacted is not None
        assert pptx_engine.scan_leaks(redacted, result.surfaces) == [], name
        token_map = {
            str(item["token"]): str(item["canonical"])
            for item in result.items
            if item.get("token")
        }
        restored = pptx_engine.restore(redacted, token_map)
        assert restored.output is not None
        assert pptx_engine.extract_all_text_parts(restored.output) == pptx_engine.extract_all_text_parts(source), name
