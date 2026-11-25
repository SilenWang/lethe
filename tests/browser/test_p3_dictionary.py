"""Signed preset-dictionary install, incremental update and OPFS rollback."""

from __future__ import annotations

import base64
import json
import os
import shutil
from pathlib import Path

import pytest
from _server import StaticServer
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from tools import build_dictionary

REPO = Path(__file__).resolve().parents[2]

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - browser CI installs playwright
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]


V1 = [
    {
        "canonical": "Alpha Holdings",
        "type": "COUNTERPARTY",
        "aliases": ["ALPHA"],
        "shard": "counterparties",
        "tier": "core",
    },
    {
        "canonical": "Beta Person",
        "type": "PERSON",
        "aliases": [],
        "shard": "people",
        "tier": "full",
    },
]
V2 = [
    *V1,
    {
        "canonical": "Gamma Project",
        "type": "PROJECT",
        "aliases": [],
        "shard": "projects",
        "tier": "full",
    },
]


def _pack(root: Path, name: str, rows: list[dict[str, object]], version: str, key):
    manifest, payloads = build_dictionary._manifest_from_entities(
        rows, version, "2026-11-25T00:00:00Z"
    )
    out = root / name
    for relative, packed in payloads.items():
        path = out / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(packed)
    manifest_bytes = build_dictionary._json_bytes(manifest)
    out.mkdir(parents=True, exist_ok=True)
    (out / "manifest.json").write_bytes(manifest_bytes)
    (out / "manifest.sig").write_bytes(key.sign(manifest_bytes))
    return manifest


def _fixture_root(tmp_path: Path) -> tuple[Path, str, Ed25519PrivateKey]:
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    public_b64 = base64.b64encode(public).decode("ascii")
    (tmp_path / "lib").mkdir()
    shutil.copy2(
        REPO / "web" / "lib" / "dictionary-client.js",
        tmp_path / "lib" / "dictionary-client.js",
    )
    (tmp_path / "lib" / "dictionary-config.js").write_text(
        'export const DICTIONARY_BASE_URL = "./dictionary";\n'
        'export const DICTIONARY_PUBLIC_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";\n'
        "export const DICTIONARY_CORE_LIMIT_BYTES = 150 * 1024;\n"
        "export const DICTIONARY_TOTAL_LIMIT_BYTES = 8 * 1024 * 1024;\n",
        encoding="utf-8",
    )
    _pack(tmp_path, "v1", V1, "2026.11.25.1", key)
    _pack(tmp_path, "v2", V2, "2026.11.25.2", key)
    shutil.copytree(tmp_path / "v1", tmp_path / "same-version")
    same_manifest = json.loads((tmp_path / "same-version" / "manifest.json").read_text())
    same_manifest["shards"][0]["sha256"] = "0" * 64
    same_bytes = build_dictionary._json_bytes(same_manifest)
    (tmp_path / "same-version" / "manifest.json").write_bytes(same_bytes)
    (tmp_path / "same-version" / "manifest.sig").write_bytes(key.sign(same_bytes))
    shutil.copytree(tmp_path / "v1", tmp_path / "bad-signature")
    signature = bytearray((tmp_path / "bad-signature" / "manifest.sig").read_bytes())
    signature[0] ^= 0x01
    (tmp_path / "bad-signature" / "manifest.sig").write_bytes(signature)
    shutil.copytree(tmp_path / "v2", tmp_path / "bad-shard")
    shard = next((tmp_path / "bad-shard" / "packs").rglob("projects.jsonl.gz"))
    packed = bytearray(shard.read_bytes())
    packed[-1] ^= 0x01
    shard.write_bytes(packed)
    page = (
        "<!doctype html><meta charset=utf-8><script type=module>"
        "import {createDictionaryClient} from './lib/dictionary-client.js';"
        f"window.PUBLIC_KEY={json.dumps(public_b64)};"
        "window.client=(baseUrl)=>createDictionaryClient({baseUrl,publicKey:window.PUBLIC_KEY});"
        "window.libraryReady=true;"
        "</script>"
    )
    (tmp_path / "index.html").write_text(page, encoding="utf-8")
    return tmp_path, public_b64, key


@pytest.fixture()
def page(tmp_path: Path):
    assert sync_playwright is not None
    root, _, _ = _fixture_root(tmp_path)
    with StaticServer(root) as server, sync_playwright() as playwright:
        launch = {}
        if os.environ.get("LETHE_CHROMIUM_PATH"):
            launch["executable_path"] = os.environ["LETHE_CHROMIUM_PATH"]
        browser = playwright.chromium.launch(**launch)
        page = browser.new_page()
        page.goto(f"{server.base_url}/")
        page.wait_for_function("window.libraryReady === true")
        yield page
        browser.close()


def _run(page, expression: str):
    return page.evaluate(
        f"""async () => {{
            try {{ return {{ok: true, value: await ({expression})}}; }}
            catch (error) {{ return {{ok: false, code: error.code, message: error.message}}; }}
        }}"""
    )


def test_install_update_reuses_unchanged_shards_and_rolls_back(page) -> None:
    first = _run(page, "window.client('/v1').update()")
    assert first["ok"], first
    assert first["value"]["currentVersion"] == "2026.11.25.1"
    assert first["value"]["previousVersion"] is None
    assert first["value"]["downloadedShards"] == 2

    second = _run(page, "window.client('/v2').update()")
    assert second["ok"], second
    assert second["value"]["currentVersion"] == "2026.11.25.2"
    assert second["value"]["previousVersion"] == "2026.11.25.1"
    assert second["value"]["downloadedShards"] == 1
    assert second["value"]["reusedShards"] == 3

    entities = _run(
        page,
        "window.client('/v2').loadEntities({tier:'all'})"
        ".then(rows => rows.map(row => row.canonical))",
    )
    assert entities == {
        "ok": True,
        "value": ["Alpha Holdings", "Beta Person", "Gamma Project"],
    }

    rollback = _run(page, "window.client('/v2').rollback()")
    assert rollback["ok"], rollback
    assert rollback["value"] == {
        "currentVersion": "2026.11.25.1",
        "previousVersion": "2026.11.25.2",
    }
    core = _run(
        page,
        "window.client('/v2').loadEntities({tier:'core'})"
        ".then(rows => rows.map(row => row.canonical))",
    )
    assert core == {"ok": True, "value": ["Alpha Holdings"]}

    layout = page.evaluate(
        """async () => {
          const origin = await navigator.storage.getDirectory();
          const root = await origin.getDirectoryHandle('lethe-dictionaries');
          const names = [];
          for await (const [name] of root.entries()) names.push(name);
          return names.sort();
        }"""
    )
    assert layout == ["active-0.json", "active-1.json", "packs", "shards"]


def test_damaged_inactive_pointer_leaves_previous_pack_active(page) -> None:
    assert _run(page, "window.client('/v1').update()")["ok"]
    assert _run(page, "window.client('/v2').update()")["ok"]
    damaged = page.evaluate(
        """async () => {
          const origin = await navigator.storage.getDirectory();
          const root = await origin.getDirectoryHandle('lethe-dictionaries');
          const slots = [];
          for (let i = 0; i < 2; i++) {
            const file = await (await root.getFileHandle(`active-${i}.json`)).getFile();
            slots.push(JSON.parse(await file.text()).sequence);
          }
          const newest = slots[0] > slots[1] ? 0 : 1;
          const handle = await root.getFileHandle(`active-${newest}.json`);
          const writable = await handle.createWritable();
          await writable.write(new TextEncoder().encode('{"broken"'));
          await writable.close();
          return true;
        }"""
    )
    assert damaged
    status = _run(page, "window.client('/v2').status()")
    assert status["ok"], status
    assert status["value"]["currentVersion"] == "2026.11.25.1"
    assert status["value"]["previousVersion"] is None


def test_bad_signature_leaves_active_pack_untouched(page) -> None:
    assert _run(page, "window.client('/v1').update()")["ok"]
    result = _run(page, "window.client('/bad-signature').update()")
    assert result["ok"] is False
    assert result["code"] == "SIGNATURE_INVALID"
    status = _run(page, "window.client('/v1').status()")
    assert status["value"]["currentVersion"] == "2026.11.25.1"


def test_bad_shard_hash_never_activates(page) -> None:
    assert _run(page, "window.client('/v1').update()")["ok"]
    result = _run(page, "window.client('/bad-shard').update()")
    assert result["ok"] is False
    assert result["code"] == "SHARD_INVALID"
    status = _run(page, "window.client('/v1').status()")
    assert status["value"]["currentVersion"] == "2026.11.25.1"


def test_same_version_with_different_manifest_is_rejected(page) -> None:
    assert _run(page, "window.client('/v1').update()")["ok"]
    result = _run(page, "window.client('/same-version').update()")
    assert result["ok"] is False
    assert result["code"] == "VERSION_CONFLICT"
