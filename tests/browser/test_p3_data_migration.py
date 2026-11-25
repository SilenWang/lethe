"""Pure-browser v1 export import, including the real release page."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from _server import StaticServer

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - browser CI installs playwright
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]

REPO = Path(__file__).resolve().parents[2]
PAGE = (
    "<!doctype html><meta charset=utf-8>"
    "<script src='/client-store.js'></script>"
    "<script src='/migration.js'></script>"
)


def _launch(playwright):
    launch = {}
    if os.environ.get("LETHE_CHROMIUM_PATH"):
        launch["executable_path"] = os.environ["LETHE_CHROMIUM_PATH"]
    return playwright.chromium.launch(**launch)


@pytest.fixture()
def page(tmp_path: Path):
    assert sync_playwright is not None
    (tmp_path / "index.html").write_text(PAGE, encoding="utf-8")
    for name in ("client-store.js", "migration.js"):
        shutil.copy2(REPO / "lethe" / "web_static" / name, tmp_path / name)
    with StaticServer(tmp_path) as server, sync_playwright() as playwright:
        browser = _launch(playwright)
        page = browser.new_page()
        page.goto(f"{server.base_url}/")
        yield page
        browser.close()


@pytest.fixture(scope="module")
def release(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("release-import") / "web"
    subprocess.run(
        [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(out)],
        cwd=REPO,
        check=True,
    )
    return out


def _run(page, expression: str):
    return page.evaluate(
        f"""async () => {{
            try {{ return {{ok: true, value: await ({expression})}}; }}
            catch (error) {{ return {{ok: false, message: error.message}}; }}
        }}"""
    )


def test_v1_export_shape_imports_entities_types_and_jobs(page) -> None:
    assert page.evaluate("window.lethStore.init()")["ok"]
    page.evaluate("window.lethStore.saveTokenTypes(['PROJECT'])")
    result = _run(
        page,
        """window.lethMigration.importExport({
          entities: [{canonical:'Legacy Co', type:'COUNTERPARTY', aliases:['LC']}],
          token_types:['PROJECT','FUND'],
          jobs:[{
            job_id:'20260101-000000-abcd',
            created:'2026-01-01T00:00:00Z',
            source_files:['memo.docx'],
            replacements:3,
            mapping:{'[PERSON_001]':'John Smith'}
          }],
          errors:[]
        }, '')""",
    )
    assert result["ok"], result
    assert result["value"]["entitiesAdded"] == 1
    assert result["value"]["jobs"] == 1
    assert page.evaluate("window.lethStore.getTokenTypes()") == ["PROJECT", "FUND"]
    assert page.evaluate(
        "window.lethStore.getMapping('20260101-000000-abcd', '')"
    ) == {"[PERSON_001]": "John Smith"}


def test_export_with_errors_writes_nothing(page) -> None:
    assert page.evaluate("window.lethStore.init()")["ok"]
    page.evaluate(
        "Promise.all(["
        "window.lethStore.mergeEntities([{canonical:'Keep Me',type:'PERSON'}]),"
        "window.lethStore.saveTokenTypes(['KEEP'])"
        "])"
    )
    before = page.evaluate(
        "Promise.all([window.lethStore.getEntities(),window.lethStore.getTokenTypes()])"
    )
    result = _run(
        page,
        """window.lethMigration.importExport({
          entities:[{canonical:'Must Not Import',type:'PERSON'}],
          token_types:['BAD'],
          jobs:[],
          errors:[{job_id:'bad',error:'Wrong passphrase'}]
        }, '')""",
    )
    assert result["ok"] is False
    assert "Nothing was imported" in result["message"]
    after = page.evaluate(
        "Promise.all([window.lethStore.getEntities(),window.lethStore.getTokenTypes()])"
    )
    assert after == before


def test_release_page_imports_real_v1_json_file(release: Path, tmp_path: Path) -> None:
    assert (release / "migration.js").is_file()
    html = (release / "index.html").read_text(encoding="utf-8")
    assert '<script src="./migration.js"></script>' in html
    assert 'id="migration-import-input"' in html

    backup = {
        "entities": [{"canonical": "Release Co", "type": "COUNTERPARTY", "aliases": ["RC"]}],
        "token_types": ["PROJECT"],
        "jobs": [{
            "job_id": "20260104-000000-abcd",
            "created": "2026-01-04T00:00:00Z",
            "source_files": ["release.docx"],
            "replacements": 2,
            "mapping": {"[PERSON_001]": "Release Person"},
        }],
        "errors": [],
    }
    backup_path = tmp_path / "legacy-export.json"
    backup_path.write_text(json.dumps(backup), encoding="utf-8")

    with StaticServer(release) as server, sync_playwright() as playwright:
        browser = _launch(playwright)
        page = browser.new_page()
        page.set_default_timeout(240_000)
        page.goto(f"{server.base_url}/")
        page.wait_for_function(
            "window.lethMigration && document.querySelector('#migration-import-input')"
        )
        page.set_input_files("#migration-import-input", str(backup_path))
        page.wait_for_function(
            "document.querySelector('#toast').innerText.includes('Backup imported') || "
            "document.querySelector('#toast').innerText.includes('备份已导入')"
        )
        assert page.evaluate(
            "window.lethStore.getEntities().then(rows => rows.map(row => row.canonical))"
        ) == ["Release Co"]
        assert page.evaluate(
            "window.lethStore.getMapping('20260104-000000-abcd', '')"
        ) == {"[PERSON_001]": "Release Person"}
        browser.close()
