"""Shared static server for browser tests."""

from __future__ import annotations

import functools
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Self

# The pip Playwright driver spawns Node, which needs libatomic on slim Linux
# images. Pixi's libgcc ships it in $CONDA_PREFIX/lib; make it visible before
# Playwright starts its driver.
_libatomic = Path(sys.prefix) / "lib" / "libatomic.so.1"
if _libatomic.exists():
    os.environ["LD_LIBRARY_PATH"] = (
        f"{_libatomic.parent}:" + os.environ.get("LD_LIBRARY_PATH", "")
    ).rstrip(":")


class _Handler(SimpleHTTPRequestHandler):
    extensions_map = {  # noqa: RUF012 - class attribute required by http.server
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".whl": "application/octet-stream",
        ".zip": "application/zip",
    }

    def log_message(self, *args: object) -> None:  # keep CI output clean
        pass


class StaticServer:
    def __init__(self, directory: Path) -> None:
        handler = functools.partial(_Handler, directory=str(directory))
        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self.base_url = f"http://127.0.0.1:{self._httpd.server_address[1]}"

    def __enter__(self) -> Self:
        self._thread.start()
        return self

    def __exit__(self, *exc_info: object) -> None:
        self._httpd.shutdown()
        self._thread.join(timeout=5)
