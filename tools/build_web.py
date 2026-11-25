"""Assemble the locally hosted v2 web app into ``dist/web``.

The v2 app is plain ES modules served from the same origin as the vendored
Pyodide/BetterOffice assets.  There is no bundler and no npm step: this script
copies the allow-listed source tree and hard-links the 58MB vendor directory so
the build stays cheap and reproducible.

Two invariants are checked on every build:

* no ``http://`` / ``https://`` reference in product sources (no CDN), and
* the runtime config pins the same Pyodide/BetterOffice versions as
  ``web/assets/vendor/VERSIONS.json``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WEB = REPO / "web"
VENDOR = WEB / "assets" / "vendor"
TEXT_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json"}
PY_MODULES = (
    "core.py",
    "docx_engine.py",
    "gates.py",
    "postprocess.py",
    "pptx_engine.py",
    "xlsx_engine.py",
    "web_entry.py",
)
TOOL_MODULES = ("__init__.py", "postprocess_contract.py")


def _link_or_copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def _copy_tree(src: Path, dst: Path) -> None:
    for path in sorted(src.rglob("*")):
        if path.is_dir() or "__pycache__" in path.parts:
            continue
        _link_or_copy(path, dst / path.relative_to(src))


def check_sources() -> list[str]:
    """Return the violations found in product sources (empty means clean)."""
    problems: list[str] = []
    for path in sorted(WEB.rglob("*")):
        if path.is_dir() or VENDOR in path.parents:
            continue
        if path.suffix not in TEXT_SUFFIXES or path.name == "runtime-config.json":
            continue
        text = path.read_text(encoding="utf-8")
        for needle in ("http://", "https://"):
            if needle in text:
                problems.append(f"{path.relative_to(REPO)}: contains {needle}")
    return problems


def check_versions() -> list[str]:
    config = json.loads((WEB / "assets" / "runtime-config.json").read_text(encoding="utf-8"))
    versions = json.loads((VENDOR / "VERSIONS.json").read_text(encoding="utf-8"))
    problems: list[str] = []
    if config["pyodide"]["version"] != versions["pyodide"]:
        problems.append("runtime-config Pyodide version differs from VERSIONS.json")
    if config["betteroffice"]["version"] != versions["betteroffice"]:
        problems.append("runtime-config BetterOffice version differs from VERSIONS.json")
    if config["policy"] != {"cdn": False, "micropip": False, "sameOrigin": True}:
        problems.append("runtime-config policy must stay offline-only")
    return problems


def _js_list(source: str, name: str) -> list[str]:
    match = re.search(
        rf"export const {name} = Object\.freeze\(\[(.*?)\]\)", source, re.DOTALL
    )
    if not match:
        return []
    return re.findall(r'"([^"]+)"', match.group(1))


def check_runtime_config() -> list[str]:
    """The worker and SW share one eager-preload contract."""
    path = WEB / "lib" / "runtime-config.js"
    source = path.read_text(encoding="utf-8")
    formats = _js_list(source, "SUPPORTED_FORMATS")
    packages = _js_list(source, "BETTEROFFICE_PACKAGES")
    pys = _js_list(source, "PY_SOURCES")
    pyodide = _js_list(source, "PYODIDE_PACKAGES")
    deferred = _js_list(source, "DEFERRED_PYODIDE_PACKAGES")
    problems: list[str] = []
    if not formats:
        problems.append("runtime-config: SUPPORTED_FORMATS is empty")
    if "xlsx" in packages:
        problems.append("runtime-config: BetterOffice xlsx must not be preloaded (part-direct)")
    for package in packages:
        if not (VENDOR / "betteroffice" / package).is_dir():
            problems.append(f"runtime-config: BetterOffice package {package} is not vendored")
    if "xlsx" in formats and "xlsx_engine.py" not in pys:
        problems.append("runtime-config: xlsx format requires xlsx_engine.py")
    if "pptx" in formats and "pptx_engine.py" not in pys:
        problems.append("runtime-config: pptx format requires pptx_engine.py")
    if "lxml" not in pyodide:
        problems.append("runtime-config: Pyodide package lxml is not eagerly loaded")
    if "cryptography" not in deferred:
        problems.append("runtime-config: cryptography must be deferred to a vault op")
    return problems


def build(out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for entry in ("index.html",):
        if (WEB / entry).is_file():
            shutil.copy2(WEB / entry, out / entry)
    for entry in ("p1", "lib", "worker", "assets"):
        source = WEB / entry
        if source.is_dir():
            _copy_tree(source, out / entry)
    # The P1 UI shell arrives in next/p1-ui; the build stays usable before it.
    if (WEB / "sw.js").is_file():
        shutil.copy2(WEB / "sw.js", out / "sw.js")
    if (WEB / "ui").is_dir():
        # Plain copies (not hard links): the UI test re-stages these files over
        # the build output, and copytree must not collide with the repo inode.
        shutil.copytree(WEB / "ui", out / "ui", dirs_exist_ok=True)
    for entry in ("client-store.js", "manifest.webmanifest"):
        shutil.copy2(REPO / "lethe" / "web_static" / entry, out / entry)
    shutil.copytree(
        REPO / "lethe" / "web_static" / "icons", out / "static" / "icons", dirs_exist_ok=True
    )
    shutil.copytree(REPO / "lethe" / "locales", out / "locales", dirs_exist_ok=True)
    py_out = out / "py" / "lethe"
    py_out.mkdir(parents=True, exist_ok=True)
    shutil.copy2(WEB / "py" / "lethe" / "__init__.py", py_out / "__init__.py")
    for module in PY_MODULES:
        shutil.copy2(REPO / "lethe" / module, py_out / module)
    tools_out = out / "py" / "tools"
    tools_out.mkdir(parents=True, exist_ok=True)
    for module in TOOL_MODULES:
        shutil.copy2(REPO / "tools" / module, tools_out / module)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(REPO / "dist" / "web"))
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args(argv)

    problems = check_sources() + check_versions() + check_runtime_config()
    if problems:
        for problem in problems:
            print(f"web-build: {problem}", file=sys.stderr)
        return 1
    if args.check_only:
        print("web-build: sources OK")
        return 0
    out = Path(args.out)
    build(out)
    files = sum(1 for path in out.rglob("*") if path.is_file())
    print(f"web-build: {files} files -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
