"""P0 file and OOXML gates — run *before* any document library sees the file.

The v2 pipeline opens the upload as a ZIP in Pyodide first.  These gates read
only the central directory (no decompression, no XML parsing) so a 15.7MB
spreadsheet whose single sheet expands to 118MB is rejected before BetterOffice
builds its document model.  That ordering is the contract: the library cannot
see part structure, so a check after ``openWorkbook()`` is already too late.

Limits (v4 plan, ``50MB`` hard cap with a ``35MB`` warning):

===========  ==========================================================
gate         rule
===========  ==========================================================
``G1``       file > 35MB warns, > 50MB rejects
``G2``       one XML part (``*.xml`` / ``*.rels``) > 40MB rejects
``G3``       all XML parts summed > 150MB rejects
``G4a``      all entries decompressed > 500MB rejects
``G4b``      more than 10,000 entries rejects
``G4c``      one entry with > 100:1 compression rejects (entries ≥ 1MB)
===========  ==========================================================

Every rejection carries ``gate``, ``part`` and the limit/actual numbers, so the
UI (and the test failure) can point at the exact gate and part instead of a
generic "file too large".
"""

from __future__ import annotations

import io
import os
import zipfile
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import BinaryIO

MiB = 1024 * 1024

GATE_FILE_SIZE = "G1:file.size"
GATE_XML_PART = "G2:xml.part"
GATE_XML_TOTAL = "G3:xml.total"
GATE_ZIP_TOTAL = "G4a:zip.total"
GATE_ZIP_ENTRIES = "G4b:zip.entries"
GATE_ZIP_RATIO = "G4c:zip.ratio"
GATE_ZIP_ENCRYPTED = "G5:zip.encrypted"
GATE_ZIP_INVALID = "G0:zip.invalid"


@dataclass(frozen=True)
class GateLimits:
    file_warn_bytes: int = 35 * MiB
    file_max_bytes: int = 50 * MiB
    xml_part_max_bytes: int = 40 * MiB
    xml_total_max_bytes: int = 150 * MiB
    total_max_bytes: int = 500 * MiB
    max_entries: int = 10_000
    max_ratio: float = 100.0
    # Tiny entries compress to absurd ratios without being dangerous; the
    # zip-bomb ratio only matters for entries that can actually blow up memory.
    ratio_min_bytes: int = 1 * MiB


@dataclass(frozen=True)
class GateFinding:
    gate: str
    severity: str  # "warn" | "reject"
    message_key: str
    values: Mapping[str, object]
    part: str | None = None
    actual: int | float | None = None
    limit: int | float | None = None

    @property
    def rejected(self) -> bool:
        return self.severity == "reject"

    def render(self) -> str:
        """CI/UI line: gate id, part, numbers — never a bare ``assert failed``.

        This is the diagnostic line, always English and always keyed by the
        gate id; the UI localises ``message_key``/``values`` instead of showing
        this text (see :meth:`as_dict`).
        """
        where = f" part={self.part!r}" if self.part else ""
        numbers = ""
        if self.actual is not None and self.limit is not None:
            numbers = f" actual={self.actual} limit={self.limit}"
        return f"{self.gate} {self.severity.upper()}{where}{numbers}: {self.message_key}"

    def as_dict(self) -> dict[str, object]:
        """Structured form for the UI: a locale key plus its format values.

        The worker ships this next to :meth:`render` so the browser can render
        the rejection in the interface language while CI logs and error
        messages keep the English diagnostic line.
        """
        return {
            "gate": self.gate,
            "severity": self.severity,
            "message_key": self.message_key,
            "values": dict(self.values),
            "part": self.part,
            "actual": self.actual,
            "limit": self.limit,
        }


@dataclass
class GateStats:
    file_bytes: int = 0
    entry_count: int = 0
    xml_bytes: int = 0
    uncompressed_bytes: int = 0
    largest_xml_part: str | None = None
    largest_xml_bytes: int = 0


@dataclass
class GateReport:
    stats: GateStats
    findings: list[GateFinding] = field(default_factory=list)

    @property
    def status(self) -> str:
        if any(f.rejected for f in self.findings):
            return "reject"
        if self.findings:
            return "warn"
        return "ok"

    @property
    def rejected(self) -> bool:
        return self.status == "reject"

    def rejections(self) -> list[GateFinding]:
        return [f for f in self.findings if f.rejected]

    def warnings(self) -> list[GateFinding]:
        return [f for f in self.findings if f.severity == "warn"]

    def render(self) -> str:
        if not self.findings:
            return f"gates OK ({self.stats.file_bytes} bytes, {self.stats.entry_count} entries)"
        return "\n".join(f.render() for f in self.findings)


class GateRejected(Exception):
    """Raised by :func:`require_pass` with the first rejection attached."""

    def __init__(self, report: GateReport):
        self.report = report
        first = report.rejections()[0]
        super().__init__(first.render())
        self.gate = first.gate
        self.part = first.part


def is_xml_part(name: str) -> bool:
    lowered = name.lower()
    return lowered.endswith((".xml", ".rels")) or lowered == "[content_types].xml"


def _size_of(source: bytes | bytearray | memoryview | str | os.PathLike[str] | BinaryIO) -> int:
    if isinstance(source, (bytes, bytearray, memoryview)):
        return len(source)
    if isinstance(source, (str, os.PathLike)):
        return os.path.getsize(source)
    pos = source.tell()
    source.seek(0, io.SEEK_END)
    size = source.tell()
    source.seek(pos)
    return size


def _as_zipfile(
    source: bytes | bytearray | memoryview | str | os.PathLike[str] | BinaryIO,
) -> zipfile.ZipFile:
    if isinstance(source, (str, os.PathLike)):
        return zipfile.ZipFile(source)
    if isinstance(source, (bytes, bytearray, memoryview)):
        return zipfile.ZipFile(io.BytesIO(bytes(source)))
    return zipfile.ZipFile(source)


def inspect_package(
    source: bytes | bytearray | memoryview | str | os.PathLike[str] | BinaryIO,
    limits: GateLimits | None = None,
) -> GateReport:
    """Check size/zip-bomb/XML limits using only the ZIP central directory.

    Call this on the uploaded bytes *before* ``openWorkbook()`` /
    ``openDocument()``.  It never decompresses an entry and never parses XML.
    """
    limits = limits or GateLimits()
    stats = GateStats(file_bytes=_size_of(source))
    report = GateReport(stats=stats)
    size_mb = stats.file_bytes / MiB

    if stats.file_bytes > limits.file_max_bytes:
        report.findings.append(
            GateFinding(
                GATE_FILE_SIZE,
                "reject",
                "gate.file_reject",
                {"size_mb": size_mb, "max_mb": limits.file_max_bytes / MiB},
                actual=stats.file_bytes,
                limit=limits.file_max_bytes,
            )
        )
        return report
    if stats.file_bytes > limits.file_warn_bytes:
        report.findings.append(
            GateFinding(
                GATE_FILE_SIZE,
                "warn",
                "gate.file_warn",
                {"size_mb": size_mb, "warn_mb": limits.file_warn_bytes / MiB},
                actual=stats.file_bytes,
                limit=limits.file_warn_bytes,
            )
        )

    try:
        archive = _as_zipfile(source)
    except (zipfile.BadZipFile, OSError) as exc:
        report.findings.append(
            GateFinding(
                GATE_ZIP_INVALID,
                "reject",
                "gate.invalid_zip",
                {"error": str(exc)},
            )
        )
        return report

    with archive:
        infos = archive.infolist()
        stats.entry_count = len(infos)
        for info in infos:
            if info.flag_bits & 0x1:
                report.findings.append(
                    GateFinding(
                        GATE_ZIP_ENCRYPTED,
                        "reject",
                        "gate.encrypted_reject",
                        {"part": info.filename},
                        part=info.filename,
                    )
                )
                continue
            stats.uncompressed_bytes += info.file_size
            if is_xml_part(info.filename):
                stats.xml_bytes += info.file_size
                if info.file_size > stats.largest_xml_bytes:
                    stats.largest_xml_bytes = info.file_size
                    stats.largest_xml_part = info.filename

    if stats.largest_xml_bytes > limits.xml_part_max_bytes:
        report.findings.append(
            GateFinding(
                GATE_XML_PART,
                "reject",
                "gate.xml_part_reject",
                {
                    "part": stats.largest_xml_part,
                    "size_mb": stats.largest_xml_bytes / MiB,
                    "max_mb": limits.xml_part_max_bytes / MiB,
                },
                part=stats.largest_xml_part,
                actual=stats.largest_xml_bytes,
                limit=limits.xml_part_max_bytes,
            )
        )

    if stats.xml_bytes > limits.xml_total_max_bytes:
        report.findings.append(
            GateFinding(
                GATE_XML_TOTAL,
                "reject",
                "gate.xml_total_reject",
                {"size_mb": stats.xml_bytes / MiB, "max_mb": limits.xml_total_max_bytes / MiB},
                actual=stats.xml_bytes,
                limit=limits.xml_total_max_bytes,
            )
        )

    if stats.uncompressed_bytes > limits.total_max_bytes:
        report.findings.append(
            GateFinding(
                GATE_ZIP_TOTAL,
                "reject",
                "gate.zip_total_reject",
                {
                    "size_mb": stats.uncompressed_bytes / MiB,
                    "max_mb": limits.total_max_bytes / MiB,
                },
                actual=stats.uncompressed_bytes,
                limit=limits.total_max_bytes,
            )
        )

    if stats.entry_count > limits.max_entries:
        report.findings.append(
            GateFinding(
                GATE_ZIP_ENTRIES,
                "reject",
                "gate.zip_entries_reject",
                {"count": stats.entry_count, "max": limits.max_entries},
                actual=stats.entry_count,
                limit=limits.max_entries,
            )
        )

    with _as_zipfile(source) as archive:
        for info in archive.infolist():
            if info.file_size < limits.ratio_min_bytes:
                continue
            compressed = max(info.compress_size, 1)
            ratio = info.file_size / compressed
            if ratio > limits.max_ratio:
                report.findings.append(
                    GateFinding(
                        GATE_ZIP_RATIO,
                        "reject",
                        "gate.zip_ratio_reject",
                        {
                            "part": info.filename,
                            "ratio": round(ratio, 1),
                            "max": limits.max_ratio,
                        },
                        part=info.filename,
                        actual=round(ratio, 1),
                        limit=limits.max_ratio,
                    )
                )
    return report


def require_pass(report: GateReport) -> GateReport:
    """Raise :class:`GateRejected` (first finding) or return the report."""
    if report.rejected:
        raise GateRejected(report)
    return report


def gate_tips() -> tuple[str, str, str]:
    """The three actionable fallbacks every rejection shows in the UI."""
    return ("gate.tip.split", "gate.tip.convert", "gate.tip.machine")
