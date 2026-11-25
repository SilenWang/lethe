#!/usr/bin/env python3
"""P0 guard: no direct archive serialisation in product code.

The v2 contract is "a document leaves the engine only through
``lethe.postprocess.postprocess()``".  That function owns the source-package
priority rule, so any direct ``Save``/``toBytes()`` call elsewhere silently
throws away the fidelity guarantee.  This guard turns that rule into a test.

Scope (job name: ``guard``):

* ``web/**``             — the v2 front end (JS/TS/Python, if any)
* ``lethe/**``           — engine code, excluding tests and vendored assets

Exemptions:

* test files (``tests/``, ``test_*.py``, ``conftest.py``, ``*.test.js``)
* third-party bundles (``*/assets/vendor/**``, ``node_modules``)

Every violation is printed as::

    <file>:<line>: P0-GUARD-SAVE bare 'save(' in product code
        job=guard api='save(' file=<file> line=<line>
        fix: route the write through postprocess() ...

so the CI log names the job, the file/line and the exact API.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

JOB = "guard"
RULE_SAVE = "P0-GUARD-SAVE"
RULE_TOBYTES = "P0-GUARD-TOBYTES"

SKIP_DIR_PARTS = {
    ".git",
    "__pycache__",
    ".pixi",
    "node_modules",
    "dist",
    "build",
    "corpus",
    "assets/vendor",
}
SKIP_FILE_SUFFIXES = {
    ".wasm",
    ".zip",
    ".whl",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".svg",
    ".bin",
    ".woff",
    ".woff2",
    ".ttf",
    ".map",
}
SOURCE_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"}
PRAGMA = re.compile(r"(?:#|//|/\*)\s*bare-save-ok:\s*\S+")
JS_CALL = re.compile(r"(?<![\w$])(?:\.(?P<attr>save|toBytes)\s*\(|(?P<bare>toBytes)\s*\()")


@dataclass(frozen=True)
class Violation:
    rule: str
    api: str
    path: str
    line: int
    snippet: str

    def render(self) -> str:
        return (
            f"{self.path}:{self.line}: {self.rule} bare {self.api!r} in product code\n"
            f"    job={JOB} api={self.api!r} file={self.path} line={self.line}\n"
            f"    code: {self.snippet.strip()}\n"
            "    fix: route the write through postprocess() "
            "(lethe/postprocess.py, P1); see docs/p0/branch-and-ci.md#guard"
        )


def _is_test_file(path: Path) -> bool:
    name = path.name
    return (
        name.startswith("test_")
        or name == "conftest.py"
        or name.endswith((".test.js", ".test.ts", ".spec.js", ".spec.ts"))
        or "tests" in path.parts
        or "__tests__" in path.parts
    )


def _skipped(path: Path, root: Path) -> bool:
    rel = path.relative_to(root).as_posix()
    parts = set(path.parts)
    if parts & SKIP_DIR_PARTS:
        return True
    if "assets/vendor" in rel:
        return True
    if path.suffix.lower() in SKIP_FILE_SUFFIXES:
        return True
    return _is_test_file(path)


def _has_pragma(lines: list[str], lineno: int) -> bool:
    # 1-based lineno; allow the pragma on the call line or the line above.
    for idx in (lineno - 1, lineno - 2):
        if 0 <= idx < len(lines) and PRAGMA.search(lines[idx]):
            return True
    return False


def scan_python(path: Path, root: Path) -> list[Violation]:
    source = path.read_text(encoding="utf-8", errors="replace")
    lines = source.splitlines()
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:  # a broken file is not a guard pass
        return [
            Violation(
                rule="P0-GUARD-PARSE",
                api="<syntax>",
                path=path.relative_to(root).as_posix(),
                line=exc.lineno or 0,
                snippet=exc.msg,
            )
        ]
    out: list[Violation] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute):
            attr = func.attr
        elif isinstance(func, ast.Name):
            attr = func.id
        else:
            continue
        if attr not in {"save", "to_bytes", "toBytes"}:
            continue
        if _has_pragma(lines, node.lineno):
            continue
        api = "save(" if attr == "save" else "toBytes()"
        rule = RULE_SAVE if attr == "save" else RULE_TOBYTES
        snippet = lines[node.lineno - 1] if node.lineno - 1 < len(lines) else ""
        out.append(Violation(rule, api, path.relative_to(root).as_posix(), node.lineno, snippet))
    return out


def scan_js(path: Path, root: Path) -> list[Violation]:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    out: list[Violation] = []
    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith(("//", "*", "/*")):
            continue
        for match in JS_CALL.finditer(line):
            if _has_pragma(lines, lineno):
                continue
            attr = match.group("attr") or match.group("bare")
            api = "save(" if attr == "save" else "toBytes()"
            rule = RULE_SAVE if attr == "save" else RULE_TOBYTES
            out.append(Violation(rule, api, path.relative_to(root).as_posix(), lineno, line))
    return out


def scan(paths: list[str], root: Path) -> list[Violation]:
    violations: list[Violation] = []
    for entry in paths:
        base = (root / entry).resolve()
        if not base.exists():
            continue
        files = [base] if base.is_file() else sorted(base.rglob("*"))
        for path in files:
            if not path.is_file() or _skipped(path, root):
                continue
            if path.suffix.lower() not in SOURCE_SUFFIXES:
                continue
            found = scan_python(path, root) if path.suffix == ".py" else scan_js(path, root)
            violations.extend(found)
    return violations


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paths", nargs="+", default=["web", "lethe"])
    parser.add_argument("--root", default=".", help="repository root")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    violations = scan(args.paths, root)
    for violation in violations:
        print(violation.render(), file=sys.stderr)
    if violations:
        print(
            f"{JOB}: {len(violations)} violation(s); the only sanctioned exit is postprocess()",
            file=sys.stderr,
        )
        return 1
    print(f"{JOB}: clean ({', '.join(args.paths)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
