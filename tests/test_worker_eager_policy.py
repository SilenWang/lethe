"""Guard the eager-preload memory decision on the worker source."""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def _function_body(source: str, start_name: str, end_name: str) -> str:
    start = source.index(start_name)
    end = source.index(end_name, start)
    return source[start:end]


def test_pptx_wasm_is_deferred_until_first_pptx_run() -> None:
    source = (REPO / "web" / "worker" / "pyodide_worker.js").read_text(encoding="utf-8")
    init = _function_body(source, "async function initRuntime", "async function loadDocx")
    # The module/chunks are eager; the large wasm is not.
    assert "await loadPptx()" in init
    assert "pptx.initWasm" not in init
    run = _function_body(source, "async function runPptxWrite", "function cleanupTemp")
    assert "pptx.initWasm" in run
