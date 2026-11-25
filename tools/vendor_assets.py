#!/usr/bin/env python3
"""Vendor and verify the pinned browser runtime assets.

Nothing here is loaded from a CDN in production.  ``--fetch`` is a build-time
step; ``--verify-only`` is what CI runs and what proves the offline promise:

* Pyodide **0.29.5** (Python 3.13.2): core loader/wasm/stdlib + the lxml 6.0.2
  and cryptography 46.0.3 wheels (+ cffi/pycparser/six).
* BetterOffice **0.5.1**: the docx bundle, extracted from the npm tarball.
  XLSX and PPTX are part-direct since P2, so their unused bundles are not
  vendored or precached.

``web/assets/vendor/manifest.json`` records every file's sha256 and byte size;
``VERSIONS.json`` is the version lock.  A version change means a new manifest,
which fails ``pixi run fidelity-corpus`` until the gates and corpus are rerun.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import tarfile
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
VENDOR = REPO / "web" / "assets" / "vendor"
MANIFEST = VENDOR / "manifest.json"
VERSIONS = VENDOR / "VERSIONS.json"

PYODIDE_VERSION = "0.29.5"
PYODIDE_BASE = f"https://cdn.jsdelivr.net/pyodide/v{PYODIDE_VERSION}/full/"
PYODIDE_CORE = [
    "pyodide.mjs",
    "pyodide.js",
    "pyodide.asm.js",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
]
PYODIDE_WHEELS = ["lxml", "cryptography", "cffi", "pycparser", "six"]
BETTEROFFICE_VERSION = "0.5.1"
BETTEROFFICE_PACKAGES = ["docx"]
BETTEROFFICE_TARBALL = "https://registry.npmjs.org/@betteroffice/{pkg}/-/{pkg}-" + f"{BETTEROFFICE_VERSION}.tgz"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _fetch(url: str) -> bytes:
    print(f"  GET {url}")
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def _write(rel: str, data: bytes, source: str, files: list[dict[str, object]]) -> None:
    target = VENDOR / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    files.append(
        {
            "path": rel,
            "sha256": sha256_bytes(data),
            "bytes": len(data),
            "source": source,
        }
    )


def fetch() -> None:
    VENDOR.mkdir(parents=True, exist_ok=True)
    files: list[dict[str, object]] = []
    sources: dict[str, object] = {}

    print(f"Pyodide {PYODIDE_VERSION}")
    lock_bytes = _fetch(PYODIDE_BASE + "pyodide-lock.json")
    lock = json.loads(lock_bytes)
    if lock.get("info", {}).get("python") != "3.13.2":
        raise SystemExit(f"unexpected Pyodide python version: {lock.get('info')}")
    for name in PYODIDE_CORE:
        if name == "pyodide-lock.json":
            data = lock_bytes
        else:
            data = _fetch(PYODIDE_BASE + name)
        _write(f"pyodide/{name}", data, PYODIDE_BASE + name, files)
    for package in PYODIDE_WHEELS:
        entry = lock["packages"][package]
        filename = entry["file_name"]
        data = _fetch(PYODIDE_BASE + filename)
        if sha256_bytes(data) != entry["sha256"]:
            raise SystemExit(f"{filename}: sha256 mismatch against pyodide-lock.json")
        _write(f"pyodide/{filename}", data, PYODIDE_BASE + filename, files)
    sources["pyodide"] = {
        "version": PYODIDE_VERSION,
        "python": lock["info"]["python"],
        "base_url": PYODIDE_BASE,
        "lock_sha256": sha256_bytes(lock_bytes),
        "wheels": {
            name: {
                "version": lock["packages"][name]["version"],
                "file": lock["packages"][name]["file_name"],
                "sha256": lock["packages"][name]["sha256"],
            }
            for name in PYODIDE_WHEELS
        },
    }

    print(f"BetterOffice {BETTEROFFICE_VERSION}")
    sources["betteroffice"] = {}
    for package in BETTEROFFICE_PACKAGES:
        url = BETTEROFFICE_TARBALL.format(pkg=package)
        data = _fetch(url)
        tarball_sha = sha256_bytes(data)
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            members = [m for m in tar.getmembers() if m.name.startswith("package/dist/") and m.isfile()]
            members += [
                m
                for m in tar.getmembers()
                if m.name in {"package/package.json", "package/LICENSE", "package/README.md"}
            ]
            for member in members:
                rel = member.name.removeprefix("package/")
                payload = tar.extractfile(member)
                assert payload is not None
                _write(
                    f"betteroffice/{package}/{rel}",
                    payload.read(),
                    url + "::" + member.name,
                    files,
                )
        sources["betteroffice"][package] = {
            "version": BETTEROFFICE_VERSION,
            "tarball": url,
            "tarball_sha256": tarball_sha,
        }

    files.sort(key=lambda item: str(item["path"]))
    manifest = {
        "format": 1,
        "policy": {
            "cdn": False,
            "micropip": False,
            "same_origin": True,
            "note": "all files below are served from this repository; no runtime downloads",
        },
        "versions": {"pyodide": PYODIDE_VERSION, "betteroffice": BETTEROFFICE_VERSION},
        "sources": sources,
        "files": files,
        "totals": {"files": len(files), "bytes": sum(int(f["bytes"]) for f in files)},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    VERSIONS.write_text(
        json.dumps(
            {
                "format": 1,
                "pyodide": PYODIDE_VERSION,
                "python": "3.13.2",
                "betteroffice": BETTEROFFICE_VERSION,
                "manifest": "manifest.json",
                "policy": {"cdn": False, "micropip": False, "same_origin": True},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"vendored {len(files)} files, {manifest['totals']['bytes'] / 1024 / 1024:.1f} MB")


def verify() -> list[str]:
    errors: list[str] = []
    if not MANIFEST.exists() or not VERSIONS.exists():
        return [f"{MANIFEST.relative_to(REPO)} or VERSIONS.json is missing; run `pixi run assets-fetch`"]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    versions = json.loads(VERSIONS.read_text(encoding="utf-8"))
    if manifest.get("versions") != {"pyodide": versions["pyodide"], "betteroffice": versions["betteroffice"]}:
        errors.append("VERSIONS.json and manifest.json disagree; rerun the full corpus + gates")
    if versions["pyodide"] != PYODIDE_VERSION:
        errors.append(
            f"pyodide pin drifted: VERSIONS={versions['pyodide']} code={PYODIDE_VERSION}; "
            "bump PYODIDE_VERSION and rerun the full gates"
        )
    if versions["betteroffice"] != BETTEROFFICE_VERSION:
        errors.append(
            f"betteroffice pin drifted: VERSIONS={versions['betteroffice']} code={BETTEROFFICE_VERSION}; "
            "bump BETTEROFFICE_VERSION and rerun the full gates"
        )
    listed = {str(item["path"]) for item in manifest["files"]}
    on_disk = {
        p.relative_to(VENDOR).as_posix()
        for p in VENDOR.rglob("*")
        if p.is_file() and p.name not in {"manifest.json", "VERSIONS.json"}
    }
    for extra in sorted(on_disk - listed):
        errors.append(f"{extra}: present on disk but not in manifest (unpinned asset)")
    total = 0
    for item in manifest["files"]:
        path = VENDOR / str(item["path"])
        if not path.exists():
            errors.append(f"{item['path']}: listed in manifest but missing on disk")
            continue
        size = path.stat().st_size
        total += size
        if size != int(item["bytes"]):
            errors.append(f"{item['path']}: {size} bytes != manifest {item['bytes']}")
        digest = sha256_file(path)
        if digest != item["sha256"]:
            errors.append(f"{item['path']}: sha256 {digest[:12]}… != manifest {item['sha256'][:12]}…")
    if total != int(manifest["totals"]["bytes"]):
        errors.append(f"total bytes {total} != manifest {manifest['totals']['bytes']}")
    for required in ("pyodide/pyodide.asm.wasm", "pyodide/python_stdlib.zip", "pyodide/pyodide.mjs"):
        if required not in listed:
            errors.append(f"{required}: required Pyodide file is not vendored")
    for package in BETTEROFFICE_PACKAGES:
        if not any(str(f["path"]).startswith(f"betteroffice/{package}/dist/") for f in manifest["files"]):
            errors.append(f"betteroffice/{package}: no dist files vendored")
    if not errors:
        print(
            f"assets: OK — Pyodide {versions['pyodide']} + BetterOffice "
            f"{versions['betteroffice']}, {len(listed)} files, {total / 1024 / 1024:.1f} MB, all sha256 verified"
        )
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--fetch", action="store_true", help="download pinned assets (build time)")
    group.add_argument("--verify-only", action="store_true", help="verify the vendored manifest")
    args = parser.parse_args(argv)
    if args.fetch:
        fetch()
        errors = verify()
    else:
        errors = verify()
    for error in errors:
        print(error, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
