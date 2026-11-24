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
    # Python and the wheels are eager; both BetterOffice modules/wasms are not.
    assert "loadDocx()" not in init
    assert "loadPptx()" not in init
    assert "cryptography" not in init
    assert "pptx.initWasm" not in init
    crypto = _function_body(source, "async function ensureCrypto", "async function loadPptx")
    assert "loadPackage(DEFERRED_PYODIDE_PACKAGES)" in crypto
    assert "cryptoReady" in source
    assert 'message?.type === "vault"' in source
    inspect = _function_body(source, "async function runInspect", "async function runWrite")
    assert "loadDocx()" in inspect
    write = _function_body(source, "async function runWrite", "async function runPptxWrite")
    assert "loadDocx()" in write
    run = _function_body(source, "async function runPptxWrite", "function cleanupTemp")
    assert "pptx.initWasm" in run
