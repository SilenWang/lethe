"""Pyodide-side entry point for the single browser document worker.

The worker calls :func:`dispatch` with one JSON string and gets one JSON string
back, so no PyProxy crosses the worker boundary.  ``inspect`` proves the
pipeline (gates before any document library) and is extended by
``next/p1-docx-core`` with ``redact`` / ``restore``.
"""

from __future__ import annotations

import json
import time
import zipfile
from pathlib import Path

from lethe import gates

PROTOCOL = 1
IMPLEMENTED_OPS = ("echo", "inspect")
PENDING_OPS = ("redact", "restore")


def _ok(**payload: object) -> str:
    return json.dumps({"ok": True, **payload})


def _err(code: str, message: str, detail: dict[str, object] | None = None) -> str:
    return json.dumps({"ok": False, "code": code, "message": message, "detail": detail or {}})


def _echo(options: dict[str, object]) -> str:
    raw_sleep = options.get("sleepMs", 0)
    sleep_ms = min(int(raw_sleep), 10_000) if isinstance(raw_sleep, (int, float, str)) else 0
    if sleep_ms:
        time.sleep(sleep_ms / 1000)
    return _ok(payload=options.get("payload", ""), protocol=PROTOCOL)


def _inspect(path: str, file_name: str) -> str:
    """Run the four hard gates, then count package parts."""
    raw = Path(path).read_bytes()
    try:
        report = gates.inspect_package(raw)
    except Exception as exc:  # noqa: BLE001 - report the failure, never crash the worker
        return _err("PARSE_FAILED", str(exc), {"file": file_name})
    if report.rejected:
        first = report.rejections()[0]
        code = (
            "PARSE_FAILED"
            if first.gate in (gates.GATE_ZIP_INVALID, gates.GATE_ZIP_ENCRYPTED)
            else "TOO_LARGE"
        )
        return _err(
            code,
            first.render(),
            {
                "gate": first.gate,
                "part": first.part,
                "findings": [finding.render() for finding in report.rejections()],
            },
        )
    try:
        with zipfile.ZipFile(path) as archive:
            parts = [name for name in archive.namelist() if not name.endswith("/")]
    except zipfile.BadZipFile as exc:
        return _err("PARSE_FAILED", str(exc), {"file": file_name})
    return _ok(
        protocol=PROTOCOL,
        parts=len(parts),
        status=report.status,
        warnings=[finding.render() for finding in report.warnings()],
    )


def dispatch(request_json: str) -> str:
    """Single entry point; always returns JSON, including for unknown ops."""
    try:
        request = json.loads(request_json)
        op = str(request.get("op", ""))
        options = request.get("options") or {}
        if op == "echo":
            return _echo(options)
        if op == "inspect":
            return _inspect(str(request["path"]), str(request.get("file_name", "upload.docx")))
        if op in PENDING_OPS:
            return _err("INTERNAL", f"op {op} arrives with next/p1-docx-core")
        return _err("INTERNAL", f"unknown op {op!r}")
    except Exception as exc:  # noqa: BLE001 - a malformed request must not kill the worker
        return _err("INTERNAL", f"{type(exc).__name__}: {exc}")
