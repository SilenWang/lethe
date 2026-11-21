"""Assemble the locally hosted v2 web app into ``dist/web``.

The v2 app is plain ES modules served from the same origin as the vendored
Pyodide/BetterOffice assets.  There is no bundler and no npm step: this script
copies the allow-listed source tree and hard-links the 65MB vendor directory so
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
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WEB = REPO / "web"
VENDOR = WEB / "assets" / "vendor"
TEXT_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json"}
PY_MODULES = ("gates.py", "web_entry.py")


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
    py_out = out / "py" / "lethe"
    py_out.mkdir(parents=True, exist_ok=True)
    shutil.copy2(WEB / "py" / "lethe" / "__init__.py", py_out / "__init__.py")
    for module in PY_MODULES:
        shutil.copy2(REPO / "lethe" / module, py_out / module)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(REPO / "dist" / "web"))
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args(argv)

    problems = check_sources() + check_versions()
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
