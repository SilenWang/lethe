"""IndexedDB v3: the user dictionary lives in its own store, additively.

v3 adds ``user_entities`` (with a ``source`` field) next to the v1/v2 stores.
An existing v2 database must keep working: its ``entities`` rows are copied
over once, with ``source: "user"``, and nothing else is rewritten.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from _server import StaticServer

REPO = Path(__file__).resolve().parents[2]

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - browser CI installs playwright
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]

PAGE = "<!doctype html><meta charset=utf-8><script src='/client-store.js'></script>"

SEED_V2 = """async () => {
  await new Promise((resolve, reject) => {
    const open = indexedDB.open('lethe', 2);
    open.onupgradeneeded = () => {
      const db = open.result;
      const entities = db.createObjectStore('entities', {keyPath: 'key'});
      entities.createIndex('by_type', 'type');
      db.createObjectStore('token_types', {keyPath: 'id'});
      db.createObjectStore('jobs', {keyPath: 'jobId'});
      db.createObjectStore('outputs', {keyPath: 'jobId'});
      const meta = db.createObjectStore('meta', {keyPath: 'key'});
      entities.put({
        key: 'acme', canonical: 'Acme Ltd', type: 'COUNTERPARTY',
        aliases: ['ACME'], updatedAt: '2026-01-01T00:00:00Z',
      });
      meta.put({key: 'lethe.schema.v2', value: 2});
    };
    open.onsuccess = () => {
      open.result.close();
      resolve(true);
    };
    open.onerror = () => reject(open.error);
  });
  return true;
}"""


@pytest.fixture()
def page(tmp_path: Path):
    assert sync_playwright is not None
    (tmp_path / "index.html").write_text(PAGE, encoding="utf-8")
    shutil.copy2(REPO / "lethe" / "web_static" / "client-store.js", tmp_path / "client-store.js")
    with StaticServer(tmp_path) as server, sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.goto(f"{server.base_url}/")
        yield page
        browser.close()


def test_fresh_store_uses_user_entities_with_source(page) -> None:
    init = page.evaluate("window.lethStore.init()")
    assert init["ok"] and init["schemaVersion"] == 3
    page.evaluate(
        "window.lethStore.saveEntities([{canonical:'Jane Doe', type:'PERSON', aliases:['JD']}])"
    )
    rows = page.evaluate("window.lethStore.getEntities()")
    assert [row["source"] for row in rows] == ["user"]
    stores = page.evaluate(
        """async () => {
            const db = await new Promise((resolve, reject) => {
                const open = indexedDB.open('lethe');
                open.onsuccess = () => resolve(open.result);
                open.onerror = () => reject(open.error);
            });
            const names = Array.from(db.objectStoreNames);
            db.close();
            return names;
        }"""
    )
    assert "user_entities" in stores and "entities" in stores


def test_v2_rows_are_copied_once_with_source(page) -> None:
    page.evaluate(SEED_V2)
    init = page.evaluate("window.lethStore.init()")
    assert init["ok"] and init["schemaVersion"] == 3 and init["upgradedFrom"] == 2
    rows = page.evaluate("window.lethStore.getEntities()")
    assert [row["canonical"] for row in rows] == ["Acme Ltd"]
    assert rows[0]["source"] == "user"
    # The legacy record is left untouched for the frozen v1 build.
    legacy = page.evaluate(
        "window.lethStore.getEntities().then(() => new Promise((r) => {"
        "const open = indexedDB.open('lethe');"
        "open.onsuccess = () => { const db = open.result;"
        "const tx = db.transaction('entities'); const req = tx.objectStore('entities').get('acme');"
        "req.onsuccess = () => { db.close(); r(req.result); }; }; }))"
    )
    assert legacy["canonical"] == "Acme Ltd"
