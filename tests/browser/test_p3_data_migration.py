"""v1 migrate/export compatibility and no-overwrite behavior."""

from __future__ import annotations

import os
import shutil
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


@pytest.fixture()
def page(tmp_path: Path):
    assert sync_playwright is not None
    (tmp_path / "index.html").write_text(PAGE, encoding="utf-8")
    for name in ("client-store.js", "migration.js"):
        shutil.copy2(
            REPO / "lethe" / "web_static" / name,
            tmp_path / name,
        )
    with StaticServer(tmp_path) as server, sync_playwright() as playwright:
        launch = {}
        if os.environ.get("LETHE_CHROMIUM_PATH"):
            launch["executable_path"] = os.environ["LETHE_CHROMIUM_PATH"]
        browser = playwright.chromium.launch(**launch)
        page = browser.new_page()
        page.goto(f"{server.base_url}/")
        yield page
        browser.close()


def _run(page, expression: str):
    return page.evaluate(
        f"""async () => {{
            try {{ return {{ok: true, value: await ({expression})}}; }}
            catch (error) {{ return {{ok: false, message: error.message}}; }}
        }}"""
    )


def test_v1_export_shape_direct_imports_entities_types_and_jobs(page) -> None:
    assert page.evaluate("window.lethStore.init()")["ok"]
    page.evaluate("window.lethStore.saveTokenTypes(['PROJECT'])")

    result = _run(
        page,
        """window.lethMigration.importExport({
          entities: [{canonical:'Legacy Co', type:'COUNTERPARTY', aliases:['LC']}],
          token_types: ['PROJECT', 'FUND'],
          jobs: [{
            job_id:'20260101-000000-abcd',
            created:'2026-01-01T00:00:00Z',
            source_files:['memo.docx'],
            replacements:3,
            mapping:{'[PERSON_001]':'John Smith'}
          }],
          errors: []
        }, 'import-pass')""",
    )
    assert result["ok"], result
    assert result["value"]["entitiesAdded"] == 1
    assert result["value"]["token_types"] == 2
    assert result["value"]["jobs"] == 1

    entities = page.evaluate("window.lethStore.getEntities()")
    assert entities == [
        {
            "key": "legacy co",
            "canonical": "Legacy Co",
            "type": "COUNTERPARTY",
            "aliases": ["LC"],
            "source": "user",
            "packVersion": None,
            "updatedAt": entities[0]["updatedAt"],
        }
    ]
    assert page.evaluate("window.lethStore.getTokenTypes()") == ["PROJECT", "FUND"]
    jobs = page.evaluate("window.lethStore.listJobs()")
    assert [job["jobId"] for job in jobs] == ["20260101-000000-abcd"]
    assert page.evaluate(
        "window.lethStore.getMapping('20260101-000000-abcd', 'import-pass')"
    ) == {"[PERSON_001]": "John Smith"}


def test_wrong_old_passphrase_does_not_write_any_imported_data(page) -> None:
    assert page.evaluate("window.lethStore.init()")["ok"]
    page.evaluate(
        "Promise.all(["
        "window.lethStore.mergeEntities([{canonical:'Keep Me',type:'PERSON'}]),"
        "window.lethStore.saveTokenTypes(['KEEP']),"
        "window.lethStore.saveJob({jobId:'keep-job',mapping:{'[PERSON_001]':'Keep Me'},passphrase:''})"
        "])"
    )
    before = page.evaluate(
        "Promise.all([window.lethStore.getEntities(),window.lethStore.getTokenTypes(),"
        "window.lethStore.listJobs(),window.lethStore.getMapping('keep-job','')])"
    )
    page.evaluate(
        """() => {
          window.__migrationCalls = [];
          window.fetch = async (url) => {
            window.__migrationCalls.push(String(url));
            return {
              ok: true,
              status: 200,
              json: async () => ({
                entities: [{canonical:'Must Not Import', type:'PERSON'}],
                token_types: ['BAD'],
                jobs: [],
                errors: [{job_id:'20260101-000000-abcd', error:'Wrong passphrase'}]
              })
            };
          };
        }"""
    )

    result = _run(page, "window.lethMigration.run('wrong-pass', 'new-pass')")
    assert result["ok"] is False
    assert "Nothing was imported" in result["message"]
    after = page.evaluate(
        "Promise.all([window.lethStore.getEntities(),window.lethStore.getTokenTypes(),"
        "window.lethStore.listJobs(),window.lethStore.getMapping('keep-job','')])"
    )
    assert after == before
    assert page.evaluate("window.__migrationCalls") == ["/api/migrate/export"]


def test_v1_endpoint_success_imports_then_archives(page) -> None:
    assert page.evaluate("window.lethStore.init()")["ok"]
    page.evaluate(
        """() => {
          window.__migrationCalls = [];
          window.fetch = async (url) => {
            window.__migrationCalls.push(String(url));
            if (String(url).endsWith('/export')) {
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  entities: [{canonical:'Endpoint Co', type:'COUNTERPARTY'}],
                  token_types: ['PROJECT'],
                  jobs: [{
                    job_id:'20260102-000000-abcd',
                    mapping:{'[PERSON_001]':'John Smith'}
                  }],
                  errors: []
                })
              };
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({archived:true, archived_to:'migrated-test'})
            };
          };
        }"""
    )
    result = _run(page, "window.lethMigration.run('old-pass', 'new-pass')")
    assert result["ok"], result
    assert result["value"]["archivedTo"] == "migrated-test"
    assert page.evaluate("window.__migrationCalls") == [
        "/api/migrate/export",
        "/api/migrate/finalize",
    ]
    assert page.evaluate("window.lethStore.getMapping('20260102-000000-abcd', 'new-pass')") == {
        "[PERSON_001]": "John Smith"
    }
