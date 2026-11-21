#!/usr/bin/env python3
"""P0 asset lock guard: pinned versions, same-origin only, no micropip.

Runs inside ``pixi run fidelity-corpus``.  Any version bump changes the vendored
manifest, and this guard fails until the manifest, ``VERSIONS.json``, the runtime
config and the full gates/corpus run agree again.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
VENDOR = REPO / "web" / "assets" / "vendor"
RUNTIME_CONFIG = REPO / "web" / "assets" / "runtime-config.json"
PIXI = REPO / "pixi.toml"

FORBIDDEN = {
    "cdn": re.compile(r"cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com", re.IGNORECASE),
    "micropip": re.compile(r"\bmicropip\s*\.\s*install|import\s+micropip|from\s+micropip"),
}


def main() -> int:
    errors: list[str] = []
    versions_path = VENDOR / "VERSIONS.json"
    manifest_path = VENDOR / "manifest.json"
    if not versions_path.exists() or not manifest_path.exists():
        print("asset-version-guard: run `pixi run assets-fetch` first", file=sys.stderr)
        return 1
    versions = json.loads(versions_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    config = json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8"))

    if manifest.get("versions") != {"pyodide": versions["pyodide"], "betteroffice": versions["betteroffice"]}:
        errors.append("manifest.json versions != VERSIONS.json")
    if config["pyodide"]["version"] != versions["pyodide"]:
        errors.append("runtime-config pyodide version != VERSIONS.json")
    if config["betteroffice"]["version"] != versions["betteroffice"]:
        errors.append("runtime-config betteroffice version != VERSIONS.json")
    if config["policy"].get("cdn") is not False or config["policy"].get("micropip") is not False:
        errors.append("runtime-config policy must keep cdn=false and micropip=false")
    if config["policy"].get("sameOrigin") is not True:
        errors.append("runtime-config policy must keep sameOrigin=true")
    if re.match(r"^[a-z]+://", config["assetBase"], re.IGNORECASE):
        errors.append(f"assetBase must be a same-origin path, got {config['assetBase']!r}")

    lock = json.loads((VENDOR / "pyodide" / "pyodide-lock.json").read_text(encoding="utf-8"))
    sources = manifest["sources"]["pyodide"]
    if sources["version"] != versions["pyodide"]:
        errors.append("pyodide-lock provenance version != VERSIONS.json")
    for package, info in sources["wheels"].items():
        if lock["packages"].get(package, {}).get("version") != info["version"]:
            errors.append(f"pyodide-lock {package} version != manifest")

    for path in sorted((REPO / "web").rglob("*")):
        if not path.is_file() or "vendor" in path.parts:
            continue
        if path.suffix.lower() not in {".js", ".mjs", ".ts", ".html", ".py", ".json"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for name, pattern in FORBIDDEN.items():
            if pattern.search(text):
                errors.append(f"{path.relative_to(REPO)}: forbidden {name} reference")

    pixi_text = PIXI.read_text(encoding="utf-8")
    fidelity_line = next(
        (line for line in pixi_text.splitlines() if line.startswith("fidelity-corpus")), ""
    )
    for script in ("verify_corpus.py", "vendor_assets.py", "asset_version_guard.py"):
        if script not in fidelity_line:
            errors.append(f"pixi.toml fidelity-corpus task must run {script}")

    for error in errors:
        print(f"asset-version-guard: {error}", file=sys.stderr)
    if errors:
        return 1
    print(
        f"asset-version-guard: OK — Pyodide {versions['pyodide']} / "
        f"BetterOffice {versions['betteroffice']}, same-origin, no CDN, no micropip"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
