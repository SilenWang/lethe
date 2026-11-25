"""P1 build chain: ``pixi run web-build`` produces a same-origin static app."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from _server import StaticServer

REPO = Path(__file__).resolve().parents[2]

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - browser CI installs playwright
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]


def test_build_is_self_contained(tmp_path: Path) -> None:
    out = tmp_path / "web"
    subprocess.run(
        [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(out)],
        check=True,
        cwd=REPO,
    )
    assert (out / "p1" / "harness.html").is_file()
    assert (out / "assets" / "vendor" / "pyodide" / "pyodide.mjs").is_file()
    assert (out / "dictionary" / "manifest.json").is_file()
    assert (out / "dictionary" / "manifest.sig").is_file()
    vendor = out / "assets" / "vendor"
    for path in out.rglob("*"):
        if vendor in path.parents:
            continue
        if path.suffix in {".html", ".js", ".mjs"}:
            text = path.read_text(encoding="utf-8")
            assert "https://" not in text, f"{path} still references a remote origin"


def test_built_harness_loads_pyodide_offline(tmp_path: Path) -> None:
    assert sync_playwright is not None
    out = tmp_path / "web"
    subprocess.run(
        [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(out)],
        check=True,
        cwd=REPO,
    )
    external: list[str] = []
    with StaticServer(out) as server, sync_playwright() as playwright:
        launch = {}
        if os.environ.get("LETHE_CHROMIUM_PATH"):
            launch["executable_path"] = os.environ["LETHE_CHROMIUM_PATH"]
        browser = playwright.chromium.launch(**launch)
        page = browser.new_page()
        page.set_default_timeout(180_000)

        def route(route_obj) -> None:
            url = route_obj.request.url
            if url.startswith((server.base_url, "data:", "blob:")):
                route_obj.continue_()
            else:
                external.append(url)
                route_obj.abort()

        page.route("**/*", route)
        page.goto(f"{server.base_url}/p1/harness.html")
        page.wait_for_function("window.p1 && window.p1.state === 'ready'")
        assert page.evaluate("window.p1.runtime.pyodide") == "0.29.5"
        browser.close()
    assert external == [], f"build pulled remote assets: {external}"
