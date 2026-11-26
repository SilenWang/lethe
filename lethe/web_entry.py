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

from lethe import core, docx_engine, gates, postprocess, pptx_engine, xlsx_engine

PROTOCOL = 1
PREVIEW_MAX_CHARS = 250_000


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
                # `findings` is the English diagnostic line (CI logs, tests);
                # `findings_detail` carries the locale key and its format
                # values so the browser can render the rejection in the
                # interface language instead of leaking English into a
                # translated UI.
                "findings": [finding.render() for finding in report.rejections()],
                "findings_detail": [finding.as_dict() for finding in report.rejections()],
            },
        )
    try:
        with zipfile.ZipFile(path) as archive:
            parts = [name for name in archive.namelist() if not name.endswith("/")]
    except zipfile.BadZipFile as exc:
        return _err("PARSE_FAILED", str(exc), {"file": file_name})
    raw = Path(path).read_bytes()
    lower = file_name.lower()
    if lower.endswith(".pptx"):
        text_parts = pptx_engine.extract_all_text_parts(raw)
    elif lower.endswith(".xlsx"):
        text_parts = xlsx_engine.extract_all_text_parts(raw)
    else:
        text_parts = docx_engine.extract_all_text_parts(raw)
    preview = "\n\n".join(
        f"[{name}]\n{text}" for name, text in text_parts.items() if text.strip()
    )
    return _ok(
        protocol=PROTOCOL,
        parts=len(parts),
        status=report.status,
        warnings=[finding.render() for finding in report.warnings()],
        preview_text=preview[:PREVIEW_MAX_CHARS],
        preview_truncated=len(preview) > PREVIEW_MAX_CHARS,
    )


def _entities(raw_entities: list[dict[str, object]]) -> list[core.Entity]:
    entities: list[core.Entity] = []
    for item in raw_entities:
        raw_aliases = item.get("aliases")
        aliases = [str(alias) for alias in raw_aliases] if isinstance(raw_aliases, list) else []
        entities.append(
            core.Entity(
                canonical=str(item["canonical"]),
                type=str(item.get("type", "PERSON")),
                aliases=aliases,
            )
        )
    return entities


def _redact(
    path: str, raw_entities: list[dict[str, object]], file_name: str
) -> str:
    raw = Path(path).read_bytes()
    if file_name.lower().endswith(".pptx"):
        pptx_result = pptx_engine.redact(raw, _entities(raw_entities))
        Path("/tmp/final.pptx").write_bytes(pptx_result.output or raw)
        return _ok(
            final_path="/tmp/final.pptx",
            tokens=pptx_result.tokens,
            items=pptx_result.items,
            counts=pptx_result.counts,
            hits=pptx_result.hits,
            warnings=pptx_result.warnings,
            surfaces=pptx_result.surfaces,
        )
    if file_name.lower().endswith(".xlsx"):
        xlsx_result = xlsx_engine.redact(raw, _entities(raw_entities))
        Path("/tmp/final.xlsx").write_bytes(xlsx_result.output)
        return _ok(
            final_path="/tmp/final.xlsx",
            tokens=xlsx_result.tokens,
            items=xlsx_result.items,
            counts=xlsx_result.counts,
            hits=xlsx_result.hits,
            warnings=xlsx_result.warnings,
        )
    result = docx_engine.redact(raw, _entities(raw_entities))
    return _ok(
        updates=result.updates,
        tokens=result.tokens,
        items=result.items,
        counts=result.counts,
        hits=result.hits,
    )


def _restore(path: str, token_map: dict[str, str], file_name: str) -> str:
    raw = Path(path).read_bytes()
    if file_name.lower().endswith(".pptx"):
        pptx_result = pptx_engine.restore(raw, token_map)
        Path("/tmp/final.pptx").write_bytes(pptx_result.output or raw)
        return _ok(
            final_path="/tmp/final.pptx",
            tokens=pptx_result.tokens,
            counts=pptx_result.counts,
            hits=pptx_result.hits,
            warnings=pptx_result.warnings,
        )
    if file_name.lower().endswith(".xlsx"):
        xlsx_result = xlsx_engine.restore(raw, token_map)
        Path("/tmp/final.xlsx").write_bytes(xlsx_result.output)
        return _ok(
            final_path="/tmp/final.xlsx",
            tokens=xlsx_result.tokens,
            counts=xlsx_result.counts,
            hits=xlsx_result.hits,
            warnings=xlsx_result.warnings,
        )
    result = docx_engine.restore(raw, token_map)
    return _ok(updates=result.updates, tokens=result.tokens, counts=result.counts,
               hits=result.hits)


def _finish(source: str, library: str, tokens: list[str]) -> str:
    """Route the library output through postprocess and write the final file."""
    final = postprocess.postprocess(
        Path(source).read_bytes(), Path(library).read_bytes(), tokens
    )
    Path("/tmp/final.docx").write_bytes(final)
    return _ok(path="/tmp/final.docx", size=len(final))


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
        if op == "redact":
            return _redact(
                str(request["path"]),
                list(request.get("entities") or []),
                str(request.get("file_name", "upload.docx")),
            )
        if op == "restore":
            return _restore(
                str(request["path"]),
                dict(request.get("token_map") or {}),
                str(request.get("file_name", "upload.docx")),
            )
        if op == "finish":
            return _finish(
                str(request["source"]),
                str(request["library"]),
                [str(token) for token in request.get("tokens") or []],
            )
        return _err("INTERNAL", f"unknown op {op!r}")
    except Exception as exc:  # noqa: BLE001 - a malformed request must not kill the worker
        return _err("INTERNAL", f"{type(exc).__name__}: {exc}")
