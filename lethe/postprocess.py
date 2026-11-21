"""The only sanctioned exit for a redacted document package.

BetterOffice rewrites the whole archive when it saves: every part is
recompressed and parts nobody edited can change bytes.  ``postprocess()``
starts from the *source* package instead and keeps only the parts the library
actually changed **and** that carry a token.  Everything else — including the
raw compressed stream — is copied from the source entry, so ``zipfile`` never
recompresses it.

Two rules only:

1. source package first: the output part set is the source part set;
2. keep a library part only if its bytes changed and it contains a token.

The result is then checked against the P0 contract assertions (C1/C2/C3) before
it is returned; a violation raises instead of silently shipping a lossy file.
"""

from __future__ import annotations

import hashlib
import io
import re
import struct
import sys
import zipfile
import zlib
from collections.abc import Iterable, Mapping
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:  # `tools/` is a dev tree, not an installed package
    sys.path.insert(0, str(_ROOT))

from tools.postprocess_contract import (
    assert_source_priority,
    assert_unedited_compressed_stream,
    assert_unedited_part_sha256,
)

TOKEN_RE = re.compile(r"\[[A-Z][A-Z0-9_]*_\d{3,}\]")
_LOCAL = b"PK\x03\x04"
_CENTRAL = b"PK\x01\x02"
_END = b"PK\x05\x06"
_DATA_DESCRIPTOR = 1 << 3


class PostprocessError(RuntimeError):
    """The package could not be rebuilt without breaking the fidelity contract."""


def _tokens(tokens: Iterable[str] | Mapping[str, str] | None) -> list[str]:
    if not tokens:
        return []
    return [token for token in tokens if token]


def _contains_token(data: bytes, tokens: list[str]) -> bool:
    text = data.decode("utf-8", "ignore")
    return any(token in text for token in tokens) or bool(TOKEN_RE.search(text))


def _raw_entry(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    """Local file header + compressed payload (+ data descriptor), verbatim."""
    if archive.fp is None:
        raise PostprocessError(f"{info.filename}: archive has no file handle")
    archive.fp.seek(info.header_offset)
    header = archive.fp.read(30)
    if len(header) < 30 or header[:4] != _LOCAL:
        raise PostprocessError(f"{info.filename}: local file header is missing")
    name_len, extra_len = struct.unpack("<HH", header[26:30])
    end = 30 + name_len + extra_len + info.compress_size
    if info.flag_bits & _DATA_DESCRIPTOR:
        end += 16 if header[6:8] == b"\x08\x00" else 12
    archive.fp.seek(info.header_offset)
    return archive.fp.read(end)


def _entry_bytes(info: zipfile.ZipInfo, data: bytes) -> tuple[bytes, bytes, int]:
    """Compress one edited part and return (local record, central fields, crc)."""
    method = info.compress_type if info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) else zipfile.ZIP_DEFLATED
    if method == zipfile.ZIP_DEFLATED:
        compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
        payload = compressor.compress(data) + compressor.flush()
    else:
        payload = data
    crc = zlib.crc32(data) & 0xFFFFFFFF
    name = info.filename.encode("utf-8")
    flags = 0x800 if info.filename.isascii() is False else 0
    local = struct.pack(
        "<4s5H3I2H",
        _LOCAL,
        20,
        flags,
        method,
        _dos_time(info),
        _dos_date(info),
        crc,
        len(payload),
        len(data),
        len(name),
        0,
    ) + name + payload
    return local, payload, crc


def _dos_time(info: zipfile.ZipInfo) -> int:
    return (info.date_time[3] << 11) | (info.date_time[4] << 5) | (info.date_time[5] // 2)


def _dos_date(info: zipfile.ZipInfo) -> int:
    return ((info.date_time[0] - 1980) << 9) | (info.date_time[1] << 5) | info.date_time[2]


def _central(
    info: zipfile.ZipInfo,
    *,
    crc: int,
    csize: int,
    usize: int,
    offset: int,
    method: int,
    flags: int | None = None,
) -> bytes:
    name = info.filename.encode("utf-8")
    if flags is None:
        flags = 0x800 if info.filename.isascii() is False else 0
    return (
        struct.pack(
            "<4s6H3I5H2I",
            _CENTRAL,
            20,
            20,
            flags,
            method,
            _dos_time(info),
            _dos_date(info),
            crc,
            csize,
            usize,
            len(name),
            0,
            0,
            0,
            0,
            info.external_attr,
            offset,
        )
        + name
    )


def _rebuild(
    source: zipfile.ZipFile, output: zipfile.ZipFile, keep: set[str]
) -> bytes:
    body = bytearray()
    directory: list[bytes] = []
    for info in source.infolist():
        if info.is_dir():
            continue
        offset = len(body)
        if info.filename in keep:
            new_bytes = output.read(info.filename)
            local, payload, crc = _entry_bytes(info, new_bytes)
            body += local
            method = info.compress_type if info.compress_type in (0, 8) else 8
            directory.append(
                _central(
                    info,
                    crc=crc,
                    csize=len(payload),
                    usize=len(new_bytes),
                    offset=offset,
                    method=method,
                )
            )
        else:
            body += _raw_entry(source, info)
            directory.append(
                _central(
                    info,
                    crc=info.CRC,
                    csize=info.compress_size,
                    usize=info.file_size,
                    offset=offset,
                    method=info.compress_type,
                    flags=info.flag_bits,
                )
            )
    if len(body) > 0xFFFFFFFF:
        raise PostprocessError("package exceeds 4GB; zip64 output is not supported")
    cd_offset = len(body)
    body += b"".join(directory)
    body += struct.pack(
        "<4s4H2IH",
        _END,
        0,
        0,
        len(directory),
        len(directory),
        len(body) - cd_offset,
        cd_offset,
        0,
    )
    return bytes(body)


def postprocess(
    source: bytes,
    library_output: bytes,
    tokens: Iterable[str] | Mapping[str, str] | None = None,
    *,
    edited_parts: Iterable[str] = (),
) -> bytes:
    """Rebuild a package from ``source`` keeping only token-bearing edits."""
    token_list = _tokens(tokens)
    explicit = {part.strip("/") for part in edited_parts}
    with zipfile.ZipFile(io.BytesIO(source)) as src, zipfile.ZipFile(
        io.BytesIO(library_output)
    ) as out:
        source_names = {info.filename for info in src.infolist() if not info.is_dir()}
        keep: set[str] = set()
        for name in source_names:
            if name not in out.namelist():
                continue
            new_bytes = out.read(name)
            if new_bytes != src.read(name) and (
                name in explicit or _contains_token(new_bytes, token_list)
            ):
                keep.add(name)
        rebuilt = _rebuild(src, out, keep)

    for assertion in (
        assert_source_priority,
        assert_unedited_part_sha256,
        assert_unedited_compressed_stream,
    ):
        assertion(io.BytesIO(source), io.BytesIO(rebuilt), keep)
    return rebuilt


def digest(data: bytes) -> str:
    """Short sha256 helper used by tests and CI logs."""
    return hashlib.sha256(data).hexdigest()
