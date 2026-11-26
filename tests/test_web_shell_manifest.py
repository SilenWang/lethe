"""The P1 service worker's shell list must cover every module the app imports.

Online, a missing entry is invisible: the fetch handler cache-fills whatever it
is asked for. Offline it is fatal — `ui/app.js` imports its siblings
statically, so a module that is not in `SHELL_PATHS` fails to load and the
bridge never leaves `initializing`. That is exactly what happened when the
multi-file task split its rules into `ui/task-model.js`, so this test pins the
list against the imports it must satisfy.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WEB = REPO / "web"
SW = WEB / "sw.js"

# Relative imports only: a bare specifier is not a file this list can hold.
RELATIVE_IMPORT = re.compile(r"""from\s+["'](\.{1,2}/[^"']+\.js)["']""")


def _shell_paths() -> list[str]:
    block = re.search(r"var SHELL_PATHS = \[(.*?)\];", SW.read_text(encoding="utf-8"), re.DOTALL)
    assert block, "sw.js has no SHELL_PATHS list"
    return re.findall(r"'([^']+)'", block.group(1))


def test_every_module_app_js_imports_is_pre_cached() -> None:
    shell = set(_shell_paths())
    src = WEB / "ui" / "app.js"
    missing = []
    for target in RELATIVE_IMPORT.findall(src.read_text(encoding="utf-8")):
        path = (src.parent / target).resolve()
        url = "/" + path.relative_to(WEB).as_posix()
        if url not in shell:
            missing.append(url)
    assert not missing, f"pre-cache misses modules app.js imports: {missing}"


# Where a shell entry may come from: `web/` itself, or one of the directories
# the build script copies into the bundle. The build maps `web_static/icons`
# to `/static/`, so that prefix is translated before looking.
SOURCE_ROOTS = (WEB, REPO / "lethe" / "web_static", REPO / "lethe" / "locales")


def _source_exists(entry: str) -> bool:
    """Map a shell URL back to the source file the build copies it from."""
    path = entry.lstrip("/")
    candidates: list[tuple[Path, str]] = [(WEB, path)]
    if path.startswith("static/"):
        candidates.append((REPO / "lethe" / "web_static", path[len("static/"):]))
    if path.startswith("locales/"):
        candidates.append((REPO / "lethe" / "locales", path[len("locales/"):]))
    candidates.append((REPO / "lethe" / "web_static", path))
    return any((root / candidate).is_file() for root, candidate in candidates)


def test_every_shell_entry_exists() -> None:
    """A stale entry makes the pre-cache step reject and the app never starts."""
    missing = [entry for entry in _shell_paths()
               if entry != "/" and not _source_exists(entry)]
    assert not missing, f"SHELL_PATHS entries with no source file: {missing}"


def test_the_ui_rules_module_is_listed() -> None:
    assert "/ui/task-model.js" in _shell_paths()
