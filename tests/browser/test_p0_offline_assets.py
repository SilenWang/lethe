"""P0 browser job: vendor assets load with the network cut off.

Chromium is pointed at a local static server, every non-localhost request is
aborted, and the page then:

1. imports ``pyodide.mjs`` from ``web/assets/vendor`` and loads Pyodide 0.29.5;
2. imports lxml and cryptography from the vendored wheels;
3. recomputes SHA-256 for every vendored file in the browser and compares it
   with ``manifest.json``;
4. compiles every wasm bundle with ``WebAssembly.compile`` (Pyodide + the four
   BetterOffice modules).

If anything still points at a CDN, the aborted-request list is non-empty and
the test fails with the URLs named.
"""

from __future__ import annotations

import functools
import json
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

# The pip Playwright driver spawns Node, which needs libatomic on slim Linux
# images. Pixi's libgcc ships it in $CONDA_PREFIX/lib; make it visible before
# Playwright starts its driver.
_libatomic = Path(sys.prefix) / "lib" / "libatomic.so.1"
if _libatomic.exists():
    os.environ["LD_LIBRARY_PATH"] = (
        f"{_libatomic.parent}:" + os.environ.get("LD_LIBRARY_PATH", "")
    ).rstrip(":")

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - CI installs playwright in the browser job
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]

REPO = Path(__file__).resolve().parents[2]
VENDOR = REPO / "web" / "assets" / "vendor"


class _Handler(SimpleHTTPRequestHandler):
    extensions_map = {  # noqa: RUF012 - SimpleHTTPRequestHandler class attribute
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".whl": "application/octet-stream",
        ".zip": "application/zip",
    }

    def log_message(self, *args: object) -> None:  # keep CI output clean
        pass


@pytest.fixture()
def server() -> str:
    handler = functools.partial(_Handler, directory=str(REPO))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_address[1]}"
    finally:
        httpd.shutdown()
        thread.join(timeout=5)


def _manifest_files() -> list[dict[str, object]]:
    manifest = json.loads((VENDOR / "manifest.json").read_text(encoding="utf-8"))
    return [
        item
        for item in manifest["files"]
        if str(item["path"]).endswith((".wasm", ".mjs", ".js", ".whl", ".zip", ".json"))
    ]


def test_assets_load_offline_and_hashes_match(server: str) -> None:
    assert sync_playwright is not None
    external: list[str] = []
    files = _manifest_files()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(180_000)

        def route(route_obj) -> None:
            url = route_obj.request.url
            if url.startswith((server, "data:", "blob:")):
                route_obj.continue_()
            else:
                external.append(url)
                route_obj.abort()

        page.route("**/*", route)
        page.goto(f"{server}/web/p0/harness.html")
        page.wait_for_function("window.p0 && window.p0.ready === true")

        python_result = page.evaluate(
            """async () => {
                const py = await window.p0.load();
                await py.loadPackage(["lxml", "cryptography"]);
                return py.runPython(`
import lxml.etree as ET
from cryptography.fernet import Fernet
root = ET.fromstring("<a><b>ok</b></a>")
token = Fernet(Fernet.generate_key()).encrypt(b"p0")
root.find("b").text + ":" + str(len(token))
`);
            }"""
        )
        assert python_result.startswith("ok:"), python_result

        hash_results = page.evaluate(
            """async (files) => {
                const out = [];
                for (const f of files) {
                    const buf = await (await fetch("/web/assets/vendor/" + f.path)).arrayBuffer();
                    const digest = await crypto.subtle.digest("SHA-256", buf);
                    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
                    let compiled = true;
                    if (f.path.endsWith(".wasm")) {
                        try { await WebAssembly.compile(buf); } catch (e) { compiled = String(e); }
                    }
                    out.push({path: f.path, sha256: hex, expected: f.sha256, compiled});
                }
                return out;
            }""",
            files,
        )
        browser.close()

    assert external == [], f"offline test attempted external requests: {external}"
    mismatched = [item["path"] for item in hash_results if item["sha256"] != item["expected"]]
    assert mismatched == [], f"sha256 mismatch for {mismatched}"
    broken = [item["path"] for item in hash_results if item["compiled"] is not True]
    assert broken == [], f"wasm failed to compile: {broken}"
    assert any(str(item["path"]).endswith("pyodide.asm.wasm") for item in hash_results)
    for package in ("docx", "pptx"):
        assert any(str(item["path"]).startswith(f"betteroffice/{package}/") for item in hash_results)
