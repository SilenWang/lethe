"""P0 four hard gates (file size + three XML/zip gates).

Each test asserts the *gate id* and, where one exists, the *part name*, so a
failure in CI never reads as a bare ``assert failed``.  Thresholds match the v4
plan; the two very large synthetic cases stay under 200MB of RAM by using
highly compressible XML.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest

from lethe.gates import (
    GATE_FILE_SIZE,
    GATE_XML_PART,
    GATE_XML_TOTAL,
    GATE_ZIP_ENTRIES,
    GATE_ZIP_RATIO,
    GATE_ZIP_TOTAL,
    GateLimits,
    GateRejected,
    gate_tips,
    inspect_package,
    require_pass,
)

MiB = 1024 * 1024
REPO = Path(__file__).resolve().parent.parent
NO_RATIO = GateLimits(max_ratio=float("inf"))


def _zip(entries: dict[str, bytes], compression: int = zipfile.ZIP_DEFLATED) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    buf.seek(0)
    return buf


def test_limits_match_the_v4_plan() -> None:
    limits = GateLimits()
    assert limits.file_warn_bytes == 35 * MiB
    assert limits.file_max_bytes == 50 * MiB
    assert limits.xml_part_max_bytes == 40 * MiB
    assert limits.xml_total_max_bytes == 150 * MiB
    assert limits.total_max_bytes == 500 * MiB
    assert limits.max_entries == 10_000
    assert limits.max_ratio == 100


def test_g1_warns_between_35_and_50_mb() -> None:
    report = inspect_package(_zip({"word/media/video1.bin": b"\0" * (36 * MiB)}, zipfile.ZIP_STORED))
    assert report.status == "warn"
    assert [f.gate for f in report.findings] == [GATE_FILE_SIZE]
    assert not report.rejected
    assert "gate.file_warn" in report.render()


def test_g1_rejects_over_50_mb_and_names_the_gate() -> None:
    report = inspect_package(_zip({"word/media/video1.bin": b"\0" * (51 * MiB)}, zipfile.ZIP_STORED))
    assert report.status == "reject"
    first = report.rejections()[0]
    assert first.gate == GATE_FILE_SIZE
    assert first.actual > 50 * MiB
    assert "G1:file.size" in report.render()
    with pytest.raises(GateRejected) as excinfo:
        require_pass(report)
    assert excinfo.value.gate == GATE_FILE_SIZE


def test_g2_rejects_a_41mb_xml_part_and_names_the_part() -> None:
    payload = b"<w:document>" + b"x" * (41 * MiB) + b"</w:document>"
    report = inspect_package(_zip({"word/document.xml": payload}), NO_RATIO)
    assert report.status == "reject"
    first = report.rejections()[0]
    assert first.gate == GATE_XML_PART
    assert first.part == "word/document.xml"
    assert "word/document.xml" in report.render()
    assert "G2:xml.part" in report.render()


def test_g3_rejects_when_xml_parts_add_up() -> None:
    payload = b"x" * (40 * MiB)
    entries = {f"word/parts/part{i}.xml": payload for i in range(4)}
    report = inspect_package(_zip(entries), NO_RATIO)
    assert report.status == "reject"
    gates = [f.gate for f in report.rejections()]
    assert gates == [GATE_XML_TOTAL], gates
    assert report.stats.xml_bytes == 160 * MiB
    assert "G3:xml.total" in report.render()


def test_g4a_rejects_oversized_uncompressed_payload() -> None:
    limits = GateLimits(total_max_bytes=2 * MiB, max_ratio=float("inf"))
    report = inspect_package(
        _zip({"word/media/movie.mp4": b"\0" * (3 * MiB)}, zipfile.ZIP_STORED), limits
    )
    assert report.rejections()[0].gate == GATE_ZIP_TOTAL
    assert "G4a:zip.total" in report.render()


def test_g4b_rejects_more_than_10000_entries() -> None:
    entries = {f"xl/cells/c{i}.bin": b"x" for i in range(10_001)}
    report = inspect_package(_zip(entries, zipfile.ZIP_STORED))
    assert report.rejections()[0].gate == GATE_ZIP_ENTRIES
    assert report.stats.entry_count == 10_001
    assert "G4b:zip.entries" in report.render()


def test_g4c_rejects_zip_bomb_ratio() -> None:
    report = inspect_package(_zip({"xl/worksheets/sheet1.xml": b"\0" * (5 * MiB)}))
    first = report.rejections()[0]
    assert first.gate == GATE_ZIP_RATIO
    assert first.part == "xl/worksheets/sheet1.xml"
    assert "xl/worksheets/sheet1.xml" in report.render()
    assert "G4c:zip.ratio" in report.render()


def test_media_does_not_count_as_xml() -> None:
    report = inspect_package(
        _zip(
            {
                "word/media/movie.mp4": b"\1" * (2 * MiB),
                "word/document.xml": b"<w:document/>",
            },
            zipfile.ZIP_STORED,
        )
    )
    assert report.status == "ok", report.render()
    assert report.stats.xml_bytes == len(b"<w:document/>")
    assert report.stats.uncompressed_bytes > 2 * MiB


def test_real_seed_passes_all_gates() -> None:
    seed = REPO / "corpus" / "seeds" / "docx-02-enhanced.docx"
    report = inspect_package(seed)
    assert report.status == "ok", report.render()
    assert report.stats.entry_count == 23


def test_gate_messages_exist_in_both_locales_with_tips() -> None:
    keys = {
        "gate.file_warn",
        "gate.file_reject",
        "gate.xml_part_reject",
        "gate.xml_total_reject",
        "gate.zip_total_reject",
        "gate.zip_entries_reject",
        "gate.zip_ratio_reject",
        "gate.encrypted_reject",
        "gate.invalid_zip",
        *gate_tips(),
    }
    for lang in ("zh", "en"):
        data = json.loads((REPO / "lethe" / "locales" / f"{lang}.json").read_text(encoding="utf-8"))
        missing = keys - data.keys()
        assert not missing, f"{lang}.json is missing gate copy: {sorted(missing)}"


def test_rejection_message_can_be_formatted_per_locale() -> None:
    payload = b"<w:document>" + b"x" * (41 * MiB) + b"</w:document>"
    report = inspect_package(_zip({"word/document.xml": payload}), NO_RATIO)
    finding = report.rejections()[0]
    for lang in ("zh", "en"):
        data = json.loads((REPO / "lethe" / "locales" / f"{lang}.json").read_text(encoding="utf-8"))
        text = data[finding.message_key].format(**finding.values)
        assert "word/document.xml" in text
        assert "40" in text
