"""User dictionary stays physically separate from signed preset packs."""

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


@pytest.fixture()
def page(tmp_path: Path):
    assert sync_playwright is not None
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    public_b64 = base64.b64encode(public).decode("ascii")
    _pack(tmp_path, "v1", V1, "2026.11.25.1", key)
    _pack(tmp_path, "v2", V2, "2026.11.25.2", key)

    (tmp_path / "lib").mkdir()
    for name in ("dictionary-client.js", "dictionary-merge.js"):
        shutil.copy2(REPO / "web" / "lib" / name, tmp_path / "lib" / name)
    (tmp_path / "lib" / "dictionary-config.js").write_text(
        'export const DICTIONARY_BASE_URL = "./dictionary";\n'
        'export const DICTIONARY_PUBLIC_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";\n'
        "export const DICTIONARY_CORE_LIMIT_BYTES = 150 * 1024;\n"
        "export const DICTIONARY_TOTAL_LIMIT_BYTES = 8 * 1024 * 1024;\n",
        encoding="utf-8",
    )
    shutil.copy2(
        REPO / "lethe" / "web_static" / "client-store.js",
        tmp_path / "client-store.js",
    )
    (tmp_path / "index.html").write_text(
        "<!doctype html><meta charset=utf-8>"
        "<script src='./client-store.js'></script>"
        "<script type=module>"
        "import {createDictionaryClient} from './lib/dictionary-client.js';"
        "import {mergeDictionaryLayers} from './lib/dictionary-merge.js';"
        f"window.PUBLIC_KEY={json.dumps(public_b64)};"
        "window.client=(baseUrl)=>createDictionaryClient({baseUrl,publicKey:window.PUBLIC_KEY});"
        "window.mergeLayers=mergeDictionaryLayers;"
        "window.libraryReady=true;"
        "</script>",
        encoding="utf-8",
    )

    with StaticServer(tmp_path) as server, sync_playwright() as playwright:
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


def _user_snapshot(page):
    return _run(
        page,
        "window.lethStore.getEntities()"
        ".then(rows => rows.sort((a,b) => a.canonical.localeCompare(b.canonical)))",
    )


def _merged_rows(page):
    return _run(
        page,
        "Promise.all([window.lethStore.getEntities(), window.shared.loadEntities({tier:'all'})])"
        ".then(([user, preset]) => window.mergeLayers(user, preset))",
    )


def test_read_time_merge_and_preset_switch_do_not_touch_user_layer(page) -> None:
    assert page.evaluate("window.lethStore.init()")["ok"]
    page.evaluate(
        "window.lethStore.mergeEntities(["
        "{canonical:'Alpha Holdings',type:'PERSON',aliases:['Our Alpha']},"
        "{canonical:'Jane User',type:'PERSON',aliases:['JD']}"
        "])"
    )
    page.evaluate(
        "window.shared = window.client('/v1');"
        "window.shared.update()"
    )

    user_before = _user_snapshot(page)
    assert [row["canonical"] for row in user_before["value"]] == [
        "Alpha Holdings",
        "Jane User",
    ]
    assert {row["source"] for row in user_before["value"]} == {"user"}
    assert {row["packVersion"] for row in user_before["value"]} == {None}

    merged_v1 = _merged_rows(page)
    assert merged_v1["ok"], merged_v1
    by_name = {row["canonical"]: row for row in merged_v1["value"]}
    assert by_name["Alpha Holdings"]["source"] == "user"
    assert by_name["Alpha Holdings"]["type"] == "PERSON"
    assert set(by_name["Alpha Holdings"]["aliases"]) == {"ALPHA", "Our Alpha"}
    assert by_name["Jane User"]["source"] == "user"
    assert by_name["Beta Person"]["source"] == "preset"
    assert by_name["Beta Person"]["packVersion"] == "2026.11.25.1"

    page.evaluate("window.shared.baseUrl='/v2'; window.shared.update()")
    user_after_upgrade = _user_snapshot(page)
    assert user_after_upgrade == user_before
    merged_v2 = _merged_rows(page)
    by_name_v2 = {row["canonical"]: row for row in merged_v2["value"]}
    assert by_name_v2["Alpha Holdings"]["source"] == "user"
    assert by_name_v2["Beta Person"]["packVersion"] == "2026.11.25.2"
    assert by_name_v2["Gamma Project"]["source"] == "preset"

    page.evaluate("window.shared.rollback()")
    user_after_rollback = _user_snapshot(page)
    assert user_after_rollback == user_before
    merged_rolled_back = _merged_rows(page)
    by_name_rolled_back = {row["canonical"]: row for row in merged_rolled_back["value"]}
    assert by_name_rolled_back["Beta Person"]["packVersion"] == "2026.11.25.1"
    assert "Gamma Project" not in by_name_rolled_back
    assert by_name_rolled_back["Alpha Holdings"]["source"] == "user"

    stored = page.evaluate("window.lethStore.getEntities()")
    assert [row["canonical"] for row in stored] == ["Alpha Holdings", "Jane User"]


def test_backup_carries_source_and_pack_version_without_importing_preset(page) -> None:
    assert page.evaluate("window.lethStore.init()")["ok"]
    page.evaluate(
        "window.lethStore.mergeEntities(["
        "{canonical:'Backup Person',type:'PERSON',aliases:['BP']}"
        "])"
    )
    backup = page.evaluate("window.lethStore.exportBackup()")
    assert backup["entities"] == backup["user_entities"]
    assert backup["user_entities"] == [
        {
            "key": "backup person",
            "canonical": "Backup Person",
            "type": "PERSON",
            "aliases": ["BP"],
            "source": "user",
            "packVersion": None,
            "updatedAt": backup["user_entities"][0]["updatedAt"],
        }
    ]

    page.evaluate("window.lethStore.saveEntities([])")
    imported = page.evaluate(
        """window.lethStore.importBackup({
          schemaVersion: 3,
          user_entities: [
            {canonical:'Imported User', type:'PERSON', source:'user',
             packVersion:'2026.11.25.2'},
            {canonical:'Preset Copy', type:'PERSON', source:'preset',
             packVersion:'2026.11.25.2'},
            {canonical:'Legacy User', type:'COUNTERPARTY'}
          ],
          token_types: [],
          jobs: []
        })"""
    )
    assert imported["entities"] == 3
    assert imported["added"] == 2
    assert imported["skipped"] == 1
    rows = page.evaluate("window.lethStore.getEntities()")
    by_name = {row["canonical"]: row for row in rows}
    assert set(by_name) == {"Imported User", "Legacy User"}
    assert by_name["Imported User"]["source"] == "user"
    assert by_name["Imported User"]["packVersion"] == "2026.11.25.2"
    assert by_name["Legacy User"]["source"] == "user"
    assert by_name["Legacy User"]["packVersion"] is None
