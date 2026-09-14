"""End-to-end verification of the client-side storage migration (VYB-360).

Runs the real NiceGUI app in a subprocess and drives it with Chromium through
Playwright, using two persistent browser profiles to prove:
  * the dictionary / history / mappings live in the browser, per profile;
  * they survive closing and reopening the browser;
  * the server's DATA_DIR never receives entities.json / token_types.json / vault;
  * the de-identify -> re-identify round trip still works;
  * the one-time legacy DATA_DIR migration imports into the browser and archives
    the old files;
  * a cleared browser store shows an explicit warning.

Local run (requires a Python env with the app deps, pytest and playwright):
    python -m pytest tests/browser/test_client_store.py -q
    playwright install chromium   # once

CI skips this file automatically when playwright isn't installed.
"""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time

import pytest

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover — CI without the browser stack
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]


REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _wait_for_port(port: int, proc: subprocess.Popen, timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"server exited early:\n{proc.stdout.read().decode(errors='replace')}")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.3)
    raise TimeoutError("server did not start")


@pytest.fixture()
def server():
    port = 8800 + (os.getpid() % 200)
    data_dir = tempfile.mkdtemp(prefix="lethe-e2e-data-")
    # Strip pytest vars so the child NiceGUI doesn't flip into screen-test mode.
    env = {k: v for k, v in os.environ.items() if not k.startswith("PYTEST")}
    env.update(LETHE_DATA_DIR=data_dir, LETHE_PORT=str(port))
    proc = subprocess.Popen([sys.executable, "app.py"], cwd=REPO, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    _wait_for_port(port, proc)
    try:
        yield {"url": f"http://127.0.0.1:{port}/", "data_dir": data_dir}
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def _open_profile(pw, user_data_dir: str):
    ctx = pw.chromium.launch_persistent_context(user_data_dir, headless=True)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    return ctx, page


def _goto(page, url: str) -> None:
    page.goto(url, wait_until="networkidle")
    page.get_by_text("Lethe", exact=True).first.wait_for(timeout=30000)


def _tab(page, name: str):
    page.locator(".q-tab", has_text=name).click()


def test_browser_storage_isolation_and_roundtrip(server, tmp_path):
    url = server["url"]
    profile_a = str(tmp_path / "profile-a")
    profile_b = str(tmp_path / "profile-b")

    with sync_playwright() as pw:
        errors = []

        # ---- profile A: add a dictionary entity, generate, re-identify ------
        ctx_a, page_a = _open_profile(pw, profile_a)
        page_a.on("pageerror", lambda e: errors.append(str(e)))
        page_a.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        _goto(page_a, url)

        _tab(page_a, "Entity dictionary")
        page_a.get_by_text("Your known people & counterparties").wait_for(timeout=20000)
        page_a.get_by_role("button", name="Add entity").click()
        inputs = page_a.locator(".q-input input")
        inputs.nth(0).fill("Acme Capital Partners")
        inputs.nth(1).fill("Acme")
        page_a.get_by_role("button", name="Save dictionary").click()
        page_a.get_by_text("Saved 1 entit(ies) in this browser").wait_for(timeout=20000)

        # ---- de-identify the sample memo ------------------------------------
        _tab(page_a, "De-identify")
        page_a.get_by_role("button", name="Try a sample memo").click()
        page_a.get_by_text("will be tokenised").wait_for(timeout=60000)
        page_a.get_by_role("button", name="Generate de-identified file(s)").click()
        page_a.get_by_text("Saved in this browser").wait_for(timeout=60000)
        job_id = page_a.locator(".q-badge", has_text="-").first.inner_text().strip()
        assert job_id, "no Job ID badge found"

        # ---- re-identify: paste the AI reply and restore --------------------
        _tab(page_a, "Re-identify")
        page_a.get_by_text("Past conversions").wait_for(timeout=20000)
        row = page_a.locator(".q-table tbody tr", has_text=job_id).first
        row.locator("td").first.click()          # Quasar selection column
        page_a.get_by_text(f"Selected: {job_id}").wait_for(timeout=20000)
        page_a.locator("textarea").first.fill("Summary: [COUNTERPARTY_001] signed the deal.")
        page_a.get_by_role("button", name="Re-identify").click()
        page_a.get_by_text("Restored 1 token(s).").wait_for(timeout=30000)
        restored = page_a.locator("textarea").nth(1).input_value()
        assert "Acme Capital Partners" in restored, restored

        # data is really in IndexedDB, not in server memory
        assert page_a.evaluate("window.lethStore.getEntities().then(e => e.length)") == 1
        assert page_a.evaluate("window.lethStore.listJobs().then(j => j.length)") == 1
        ctx_a.close()

        # ---- reopen profile A: data survived closing the browser ------------
        ctx_a2, page_a2 = _open_profile(pw, profile_a)
        _goto(page_a2, url)
        assert page_a2.evaluate("window.lethStore.getEntities().then(e => e.length)") == 1
        assert page_a2.evaluate("window.lethStore.listJobs().then(j => j.length)") == 1
        _tab(page_a2, "Entity dictionary")
        page_a2.get_by_text("Your known people & counterparties").wait_for(timeout=20000)
        page_a2.locator(".q-input input").nth(0).wait_for(timeout=20000)
        assert page_a2.locator(".q-input input").nth(0).input_value() == "Acme Capital Partners"

        # ---- profile B: same server, completely different data --------------
        ctx_b, page_b = _open_profile(pw, profile_b)
        _goto(page_b, url)
        assert page_b.evaluate("window.lethStore.getEntities().then(e => e.length)") == 0
        assert page_b.evaluate("window.lethStore.listJobs().then(j => j.length)") == 0
        _tab(page_b, "Entity dictionary")
        page_b.get_by_text("No entities yet").wait_for(timeout=20000)
        _tab(page_b, "Re-identify")
        page_b.get_by_text("Past conversions").wait_for(timeout=20000)
        assert page_b.locator(".q-table tbody tr").count() == 0

        # both profiles are open against the same server at the same time
        assert page_a2.evaluate("window.lethStore.getEntities().then(e => e.length)") == 1
        assert page_b.evaluate("window.lethStore.getEntities().then(e => e.length)") == 0
        ctx_a2.close()
        ctx_b.close()

        assert errors == [], f"browser console/page errors: {errors}"

    # ---- the server's DATA_DIR holds no user data ---------------------------
    data_dir = server["data_dir"]
    assert not os.path.exists(os.path.join(data_dir, "entities.json"))
    assert not os.path.exists(os.path.join(data_dir, "token_types.json"))
    assert not os.path.exists(os.path.join(data_dir, "vault"))


def test_legacy_data_migration(server, tmp_path):
    """Seed an old server-side DATA_DIR and migrate it into the browser once."""
    sys.path.insert(0, REPO)
    from lethe import vault as lethe_vault

    data_dir = server["data_dir"]
    jid = "20250101-000000-abcd"
    mapping = {"[PERSON_001]": "Jane Doe"}
    record = lethe_vault.encrypt_record(jid, mapping, "old-pw",
                                        meta={"source_file": "letter.docx", "replacements": 1})
    with open(os.path.join(data_dir, "entities.json"), "w", encoding="utf-8") as fh:
        json.dump([{"canonical": "Jane Doe", "type": "PERSON", "aliases": []}], fh)
    with open(os.path.join(data_dir, "token_types.json"), "w", encoding="utf-8") as fh:
        json.dump(["PROJECT"], fh)
    os.makedirs(os.path.join(data_dir, "vault"), exist_ok=True)
    with open(os.path.join(data_dir, "vault", f"{jid}.vault.json"), "w", encoding="utf-8") as fh:
        json.dump(record, fh)
    with open(os.path.join(data_dir, "vault", "index.json"), "w", encoding="utf-8") as fh:
        json.dump([{"job_id": jid, "created": "2025-01-01T00:00:00Z",
                    "source_file": "letter.docx", "replacements": 1}], fh)

    profile = str(tmp_path / "profile-migrate")
    with sync_playwright() as pw:
        ctx, page = _open_profile(pw, profile)
        page.on("pageerror", lambda e: pytest.fail(f"page error: {e}"))
        _goto(page, server["url"])

        _tab(page, "Settings")
        page.get_by_text("Migrate old server-side data").wait_for(timeout=20000)
        page.get_by_text("Found 1 entit(ies), 1 custom type(s) and 1 conversion(s)").wait_for(
            timeout=20000)
        page.get_by_role("button", name="Migrate old data into this browser").click()
        dlg = page.locator(".q-dialog")
        dlg.locator("input").first.fill("old-pw")
        dlg.locator("input").nth(1).fill("new-pw")
        dlg.get_by_role("button", name="Import").click()
        page.get_by_text("Migrated 1 entit(ies), 1 type(s), 1 conversion(s)").wait_for(
            timeout=30000)
        page.wait_for_timeout(3500)          # auto reload after the summary
        _goto(page, server["url"])

        assert page.evaluate("window.lethStore.getEntities().then(e => e.length)") == 1
        assert page.evaluate("window.lethStore.getTokenTypes().then(t => t.indexOf('PROJECT') > -1)")
        assert page.evaluate("window.lethStore.listJobs().then(j => j.length)") == 1
        got = page.evaluate(
            f"window.lethStore.getMapping({json.dumps(jid)}, 'new-pw')"
            ".then(x => JSON.stringify(x))")
        assert json.loads(got) == mapping
        wrong = page.evaluate(
            f"window.lethStore.getMapping({json.dumps(jid)}, 'wrong')"
            ".then(() => false, () => true)")
        assert wrong, "wrong passphrase must not decrypt the migrated mapping"
        ctx.close()

    assert not os.path.exists(os.path.join(data_dir, "entities.json"))
    assert not os.path.exists(os.path.join(data_dir, "token_types.json"))
    assert not os.path.exists(os.path.join(data_dir, "vault"))
    archived = [d for d in os.listdir(data_dir) if d.startswith("migrated-")]
    assert archived, "legacy data should be archived, not deleted"


def test_cleared_storage_banner(server, tmp_path):
    """A cleared/evicted browser store shows a clear warning instead of failing
    silently."""
    profile = str(tmp_path / "profile-cleared")
    with sync_playwright() as pw:
        ctx, page = _open_profile(pw, profile)
        _goto(page, server["url"])
        # simulate a browser-side eviction: the store is empty, the marker stays
        page.evaluate(
            "new Promise(resolve => {"
            "  const req = indexedDB.open('lethe', 1);"
            "  req.onsuccess = () => {"
            "    const db = req.result;"
            "    const tx = db.transaction('meta', 'readwrite');"
            "    tx.objectStore('meta').delete('lethe.installed.v1');"
            "    tx.oncomplete = () => { db.close(); resolve(true); };"
            "  };"
            "  req.onerror = () => resolve(false);"
            "})")
        page.reload(wait_until="networkidle")
        page.get_by_text("looks cleared", exact=False).wait_for(timeout=20000)
        ctx.close()


def test_backup_export_import_roundtrip(server, tmp_path):
    """Export a JSON backup, erase the browser data, import it back — the
    documented recovery path when a browser store is cleared."""
    profile = str(tmp_path / "profile-backup")
    with sync_playwright() as pw:
        ctx, page = _open_profile(pw, profile)
        _goto(page, server["url"])
        page.evaluate(
            "window.lethStore.saveEntities([{canonical:'Jane Doe', type:'PERSON', aliases:['JD']}])"
            ".then(() => window.lethStore.saveJob({jobId:'job-backup-1',"
            "  createdAt:new Date().toISOString(), sourceFiles:['letter.docx'], replacements:2,"
            "  mapping:{'[PERSON_001]':'Jane Doe'}, passphrase:'pw'}))")
        backup = page.evaluate("window.lethStore.exportBackup().then(b => JSON.stringify(b))")
        backup_path = tmp_path / "backup.json"
        backup_path.write_text(backup, encoding="utf-8")

        page.evaluate("window.lethStore.clearAll()")
        assert page.evaluate("window.lethStore.getEntities().then(e => e.length)") == 0

        _tab(page, "Settings")
        page.get_by_text("Browser data (IndexedDB)").wait_for(timeout=20000)
        with page.expect_file_chooser() as chooser:
            page.get_by_role("button", name="Import backup (.json)").click()
        chooser.value.set_files(str(backup_path))
        page.get_by_text("Backup imported").wait_for(timeout=20000)

        assert page.evaluate("window.lethStore.getEntities().then(e => e.length)") == 1
        assert page.evaluate("window.lethStore.listJobs().then(j => j.length)") == 1
        got = page.evaluate("window.lethStore.getMapping('job-backup-1', 'pw')"
                            ".then(m => JSON.stringify(m))")
        assert json.loads(got) == {"[PERSON_001]": "Jane Doe"}
        ctx.close()


def test_custom_token_types_persist(server, tmp_path):
    """Custom token types are stored in the browser and survive a reload."""
    profile = str(tmp_path / "profile-types")
    with sync_playwright() as pw:
        ctx, page = _open_profile(pw, profile)
        _goto(page, server["url"])
        _tab(page, "Settings")
        page.get_by_text("Token types", exact=True).wait_for(timeout=20000)
        page.get_by_placeholder("New type, e.g. PROJECT").fill("PROJECT")
        page.get_by_role("button", name="Add type").click()
        page.get_by_text("Added type PROJECT").wait_for(timeout=20000)
        page.reload(wait_until="networkidle")
        page.get_by_text("Lethe", exact=True).first.wait_for(timeout=30000)
        assert page.evaluate("window.lethStore.getTokenTypes().then(t => t.indexOf('PROJECT') > -1)")
        ctx.close()
