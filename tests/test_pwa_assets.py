"""Static checks for the PWA shell (VYB-361).

No browser needed: these validate the manifest, the generated icons, the
service worker's cache boundary and their mutual consistency. The end-to-end
browser behaviour (installability, standalone window, live Cache Storage) lives
in tests/browser/test_pwa.py.
"""
from __future__ import annotations

import json
import os
import re
import struct

import pytest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATIC = os.path.join(REPO, "lethe", "web_static")
MANIFEST_PATH = os.path.join(STATIC, "manifest.webmanifest")
SW_PATH = os.path.join(STATIC, "sw.js")
APP_PATH = os.path.join(REPO, "app.py")


def _manifest() -> dict:
    with open(MANIFEST_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def _png_size(path: str) -> tuple[int, int]:
    """Width/height straight from the PNG IHDR chunk."""
    with open(path, "rb") as fh:
        head = fh.read(24)
    assert head[:8] == b"\x89PNG\r\n\x1a\n", f"{path} is not a PNG"
    assert head[12:16] == b"IHDR", f"{path} has no IHDR"
    return struct.unpack(">II", head[16:24])


def _sw_static_paths() -> list[str]:
    with open(SW_PATH, encoding="utf-8") as fh:
        src = fh.read()
    block = re.search(r"var STATIC_PATHS = \[(.*?)\];", src, re.S)
    assert block, "sw.js has no STATIC_PATHS whitelist"
    return re.findall(r"'([^']+)'", block.group(1))


# ---- manifest -------------------------------------------------------------
def test_manifest_is_installable() -> None:
    m = _manifest()
    assert m["name"] and m["short_name"]
    assert m["start_url"] == "/" and m["scope"] == "/"
    assert m["display"] == "standalone"
    assert re.fullmatch(r"#[0-9a-fA-F]{6}", m["theme_color"])
    assert re.fullmatch(r"#[0-9a-fA-F]{6}", m["background_color"])
    sizes = {i["sizes"] for i in m["icons"]}
    # Chromium wants at least a 192px and a 512px icon to offer installation.
    assert "192x192" in sizes and "512x512" in sizes
    assert any(i.get("purpose") == "maskable" for i in m["icons"])


def test_manifest_icons_exist_and_match_declared_sizes() -> None:
    for icon in _manifest()["icons"]:
        path = os.path.join(STATIC, icon["src"].replace("/static/", "", 1))
        assert os.path.isfile(path), f"missing icon {icon['src']}"
        w, h = _png_size(path)
        assert f"{w}x{h}" == icon["sizes"], f"{icon['src']} is {w}x{h}, declared {icon['sizes']}"
        assert icon["type"] == "image/png"


# ---- service worker -------------------------------------------------------
def test_service_worker_only_caches_the_static_shell() -> None:
    paths = _sw_static_paths()
    assert paths, "the whitelist is empty"
    for path in paths:
        assert path.startswith("/static/") or path == "/manifest.webmanifest", path
        # Nothing user-owned can ever be on the whitelist.
        assert "/api/" not in path
        assert not re.search(r"upload|download|vault|job|document|result", path, re.I)
    # Every manifest icon is pre-cached, so the installed app has its icons.
    for icon in _manifest()["icons"]:
        assert icon["src"] in paths, f"{icon['src']} is not pre-cached"


def test_service_worker_guards_non_get_and_api_requests() -> None:
    with open(SW_PATH, encoding="utf-8") as fh:
        src = fh.read()
    # The privacy boundary must be enforced, not merely documented.
    assert "request.method !== 'GET'" in src
    assert "request.headers.has('range')" in src
    assert "url.origin !== self.location.origin" in src
    # ...and only the whitelist may reach respondWith().
    fetch_handler = src.split("self.addEventListener('fetch'", 1)[1]
    assert "if (!isCacheable(request)) return;" in fetch_handler
    # Old releases are dropped on activation.
    assert "caches.delete" in src and "lethe-static-" in src


# ---- server wiring --------------------------------------------------------
def test_app_registers_manifest_and_service_worker() -> None:
    with open(APP_PATH, encoding="utf-8") as fh:
        src = fh.read()
    assert '@app.get("/sw.js")' in src
    assert "Service-Worker-Allowed" in src
    assert '@app.get("/manifest.webmanifest")' in src
    assert 'rel="manifest"' in src
    assert "serviceWorker.register('/sw.js?v=" in src


def test_sw_script_is_served_with_the_app_version() -> None:
    """The registration URL carries APP_VERSION, which is what rotates the
    worker and its cache on release."""
    with open(APP_PATH, encoding="utf-8") as fh:
        src = fh.read()
    assert "APP_VERSION" in src
    assert "lethe-static-v" in open(SW_PATH, encoding="utf-8").read()