"""P0 skeleton of the three post-processing contract assertions.

P1 implements ``lethe.postprocess.postprocess()``; this module is the executable
spec it must satisfy, and it already runs in CI.  Each assertion names the rule,
the offending part and the numbers — never a bare ``assert failed``:

* ``C1:source-priority``  parts the library did not edit must come from the
  source package, and redaction must not add or drop parts.
* ``C2:part-sha256``      decompressed sha256 of every unedited part equals the
  source's.
* ``C3:compressed-stream`` the raw compressed stream (method, bytes, CRC) of
  every unedited part is copied verbatim from the source package.

C3 is the extra notch the v4 plan added: recompressing an unchanged part is a
fidelity regression even when the decompressed bytes match.
"""

from __future__ import annotations

import hashlib
import io
import struct
import zipfile
from collections.abc import Iterable
from dataclasses import dataclass

RULE_SOURCE_PRIORITY = "C1:source-priority"
RULE_PART_SHA256 = "C2:part-sha256"
RULE_COMPRESSED_STREAM = "C3:compressed-stream"


@dataclass(eq=False)
class ContractViolation(AssertionError):
    rule: str
    part: str | None
    detail: str

    def __str__(self) -> str:
        where = f" part={self.part!r}" if self.part else ""
        return f"{self.rule} FAILED{where}: {self.detail}"


def _open(source: bytes | str | io.BytesIO) -> zipfile.ZipFile:
    if isinstance(source, bytes):
        return zipfile.ZipFile(io.BytesIO(source))
    return zipfile.ZipFile(source)


def _raw_compressed(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    """The entry's compressed payload straight out of the local file header."""
    if archive.fp is None:
        raise ContractViolation(RULE_COMPRESSED_STREAM, info.filename, "archive has no file handle")
    archive.fp.seek(info.header_offset)
    header = archive.fp.read(30)
    if len(header) < 30 or header[:4] != b"PK\x03\x04":
        raise ContractViolation(
            RULE_COMPRESSED_STREAM, info.filename, "local file header is missing or corrupt"
        )
    name_len, extra_len = struct.unpack("<HH", header[26:30])
    archive.fp.seek(info.header_offset + 30 + name_len + extra_len)
    return archive.fp.read(info.compress_size)


def _edited(edited_parts: Iterable[str]) -> set[str]:
    return {part.strip("/") for part in edited_parts}


def assert_source_priority(
    source: bytes | str | io.BytesIO,
    output: bytes | str | io.BytesIO,
    edited_parts: Iterable[str] = (),
) -> None:
    """C1: unedited parts exist byte-for-byte; the part set is unchanged."""
    edited = _edited(edited_parts)
    with _open(source) as src, _open(output) as out:
        src_names = {n for n in src.namelist() if not n.endswith("/")}
        out_names = {n for n in out.namelist() if not n.endswith("/")}
        for name in sorted(out_names - src_names - edited):
            raise ContractViolation(
                RULE_SOURCE_PRIORITY, name, "part appeared in the output but not in the source"
            )
        for name in sorted(src_names - out_names):
            raise ContractViolation(
                RULE_SOURCE_PRIORITY, name, "part disappeared from the output"
            )
        for name in sorted(src_names - edited):
            if src.read(name) != out.read(name):
                raise ContractViolation(
                    RULE_SOURCE_PRIORITY,
                    name,
                    "unedited part differs from the source package",
                )


def assert_unedited_part_sha256(
    source: bytes | str | io.BytesIO,
    output: bytes | str | io.BytesIO,
    edited_parts: Iterable[str] = (),
) -> None:
    """C2: decompressed sha256 is identical for every unedited part."""
    edited = _edited(edited_parts)
    with _open(source) as src, _open(output) as out:
        for name in sorted(set(src.namelist()) - edited):
            if name not in out.namelist():
                raise ContractViolation(
                    RULE_PART_SHA256, name, "part is missing from the output"
                )
            expected = hashlib.sha256(src.read(name)).hexdigest()
            actual = hashlib.sha256(out.read(name)).hexdigest()
            if expected != actual:
                raise ContractViolation(
                    RULE_PART_SHA256,
                    name,
                    f"sha256 {actual[:12]}… != source {expected[:12]}…",
                )


def assert_unedited_compressed_stream(
    source: bytes | str | io.BytesIO,
    output: bytes | str | io.BytesIO,
    edited_parts: Iterable[str] = (),
) -> None:
    """C3: the stored/compressed stream is copied verbatim (no recompression)."""
    edited = _edited(edited_parts)
    with _open(source) as src, _open(output) as out:
        for name in sorted(set(src.namelist()) - edited):
            if name not in out.namelist():
                raise ContractViolation(
                    RULE_COMPRESSED_STREAM, name, "part is missing from the output"
                )
            s_info = src.getinfo(name)
            o_info = out.getinfo(name)
            if s_info.compress_type != o_info.compress_type:
                raise ContractViolation(
                    RULE_COMPRESSED_STREAM,
                    name,
                    f"compress_type {o_info.compress_type} != source {s_info.compress_type}",
                )
            if s_info.CRC != o_info.CRC:
                raise ContractViolation(
                    RULE_COMPRESSED_STREAM, name, f"CRC {o_info.CRC:08x} != source {s_info.CRC:08x}"
                )
            if _raw_compressed(src, s_info) != _raw_compressed(out, o_info):
                raise ContractViolation(
                    RULE_COMPRESSED_STREAM,
                    name,
                    "compressed bytes differ from the source (entry was recompressed)",
                )


ALL_ASSERTIONS = (
    assert_source_priority,
    assert_unedited_part_sha256,
    assert_unedited_compressed_stream,
)
