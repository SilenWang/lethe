"""Fail if deleted v1 server/NLP/PDF/email paths reappear in active code."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN_PATHS = [
    ROOT / "lethe",
    ROOT / "web",
    ROOT / "tools",
    ROOT / "tests",
    ROOT / ".github" / "workflows",
    ROOT / "pyproject.toml",
    ROOT / "pixi.toml",
    ROOT / "README.md",
    ROOT / "CONTRIBUTING.md",
    ROOT / "ROADMAP.md",
    ROOT / "CLAUDE.md",
]
EXCLUDED = {
    ROOT / "tools" / "cutover_guard.py",
    ROOT / "tests" / "test_cutover.py",
}
TEXT_SUFFIXES = {".py", ".js", ".mjs", ".json", ".toml", ".yml", ".yaml", ".md"}

# Build the terms at runtime so this guard's own source does not match the
# cleanup command it enforces.
FORBIDDEN_FILES = [
    "app" + ".py",
    "Launch " + "De-identifier.bat",
    "build_" + "portable.ps1",
    "installer" + ".iss",
    "lethe/" + "docio.py",
    "lethe/" + "nlp_" + "suggester.py",
    "lethe/" + "runtime.py",
    "lethe/web_static/" + "sw.js",
    "requirements" + ".txt",
    "requirements" + "-nlp.txt",
    "tools/" + "compare_" + "nlp_models.py",
    "tools/" + "verify_" + "ttl.py",
    "dist/_assets/" + "Launch De-identifier.bat",
]
FORBIDDEN_TERMS = [
    "nice" + "gui",
    "presid" + "io",
    "spa" + "cy",
    "extract" + "_msg",
    "extract" + "-msg",
    "lite" + "parse",
    "pdf" + "plumber",
    "from py" + "pdf",
    "import py" + "pdf",
    "Runtime" + "Store",
    "JOB_" + "TTL",
    "LEGACY_" + "FROZEN_COUNTS",
    "/api/" + "migrate",
]


def _files() -> list[Path]:
    out: list[Path] = []
    for path in SCAN_PATHS:
        if path.is_file():
            out.append(path)
        elif path.is_dir():
            out.extend(
                item
                for item in path.rglob("*")
                if item.is_file()
                and item.suffix.lower() in TEXT_SUFFIXES
                and item not in EXCLUDED
                and "assets/vendor" not in item.as_posix()
            )
    return sorted(set(out))


def scan() -> list[str]:
    problems: list[str] = []
    for relative in FORBIDDEN_FILES:
        if (ROOT / relative).exists():
            problems.append(f"forbidden path still exists: {relative}")
    for path in _files():
        text = path.read_text(encoding="utf-8", errors="replace").lower()
        for term in FORBIDDEN_TERMS:
            if term.lower() in text:
                problems.append(f"{path.relative_to(ROOT)}: contains {term}")
    return problems


def main() -> int:
    problems = scan()
    if problems:
        for problem in problems:
            print(f"cutover: {problem}", file=sys.stderr)
        return 1
    print("cutover-check: removed v1 surfaces have zero active-code hits")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
