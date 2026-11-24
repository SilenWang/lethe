"""Guard the eager-preload memory decision on the worker source."""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def _function_body(source: str, start_name: str, end_name: str) -> str:
    start = source.index(start_name)
    end = source.index(end_name, start)
    return source[start:end]


def test_docx_wasm_is_deferred_until_first_docx_run() -> None:
    source = (REPO / "web" / "worker" / "pyodide_worker.js").read_text(encoding="utf-8")
    init = _function_body(source, "async function initRuntime", "async function loadDocx")
    assert "loadDocx()" not in init
    inspect = _function_body(source, "async function runInspect", "async function runWrite")
    assert "loadDocx()" in inspect
    write = _function_body(source, "async function runWrite", "function cleanupTemp")
    assert "loadDocx()" in write
