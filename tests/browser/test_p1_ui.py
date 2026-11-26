"""P1 UI: three independent pages, gates, i18n, storage and the offline shell.

The UI is the last mile of the frozen worker interface: it only calls
``bridge.run`` and never touches document bytes itself. These tests drive the
built static app in Chromium, including one real docx redact→restore round trip.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from _server import StaticServer

REPO = Path(__file__).resolve().parents[2]

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - browser CI installs playwright
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]


def stage_ui_assets(out: Path) -> None:
    """Copy the UI-line sources the build script does not own yet.

    Temporary: tools/build_web.py belongs to the runtime line, which will add
    these four copies (web/ui, web_static shell files, static/icons, locales).
    Until then the test stages exactly what that build step will do.
    """
    shutil.copytree(REPO / "web" / "ui", out / "ui", dirs_exist_ok=True)
    shutil.copy2(REPO / "web" / "sw.js", out / "sw.js")
    for name in ("client-store.js", "manifest.webmanifest"):
        shutil.copy2(REPO / "lethe" / "web_static" / name, out / name)
    shutil.copytree(
        REPO / "lethe" / "web_static" / "icons", out / "static" / "icons", dirs_exist_ok=True
    )
    shutil.copytree(REPO / "lethe" / "locales", out / "locales", dirs_exist_ok=True)


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("p1ui") / "web"
    subprocess.run(
        [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(out)],
        check=True,
        cwd=REPO,
    )
    stage_ui_assets(out)
    samples = out / "samples"
    samples.mkdir()
    shutil.copy2(REPO / "corpus" / "docx" / "docx-001.docx", samples / "docx-001.docx")
    shutil.copy2(REPO / "corpus" / "xlsx" / "xlsx-001.xlsx", samples / "xlsx-001.xlsx")
    shutil.copy2(REPO / "corpus" / "pptx" / "pptx-001.pptx", samples / "pptx-001.pptx")
    return out


@pytest.fixture()
def page(built: Path):
    assert sync_playwright is not None
    with StaticServer(built) as server, sync_playwright() as playwright:
        launch = {}
        if os.environ.get("LETHE_CHROMIUM_PATH"):
            launch["executable_path"] = os.environ["LETHE_CHROMIUM_PATH"]
        browser = playwright.chromium.launch(**launch)
        page = browser.new_page()
        page.set_default_timeout(240_000)
        page.goto(f"{server.base_url}/")
        page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
        page.wait_for_function(
            "window.__letheBridge && window.__letheBridge.state() === 'ready'"
        )
        yield page
        browser.close()


def test_shell_has_three_free_tabs_and_switches_language(page) -> None:
    assert page.locator(".step").count() == 3
    assert page.locator(".step:disabled").count() == 0
    assert page.locator("h1").inner_text() == "Lethe"
    page.select_option("#lang-select", "zh")
    page.wait_for_function(
        "document.querySelector('.step[data-panel=\"deidentify\"]').innerText.includes('脱敏')"
    )
    assert page.locator(".step[data-panel='deidentify']").inner_text().strip() == "脱敏"
    page.click(".step[data-panel='dictionary']")
    page.wait_for_selector("#panel-dictionary:not([hidden])")
    page.click(".step[data-panel='reidentify']")
    page.wait_for_selector("#panel-reidentify:not([hidden])")
    page.click(".step[data-panel='deidentify']")
    page.wait_for_selector("#panel-deidentify:not([hidden])")
    page.select_option("#lang-select", "en")
    page.wait_for_function(
        "document.querySelector('.step[data-panel=\"deidentify\"]').innerText.includes('De-identify')"
    )


def test_file_gates_warn_at_35mb_and_reject_over_50mb(page, built: Path, tmp_path: Path) -> None:
    warn = tmp_path / "warn.docx"
    with warn.open("wb") as handle:
        handle.truncate(36 * 1024 * 1024)
    page.set_input_files("#upload-input", str(warn))
    page.wait_for_selector("#upload-note:not([hidden])")
    assert "35" in page.locator("#upload-note").inner_text()
    assert page.locator("#detect-btn").is_enabled()

    reject = tmp_path / "reject.docx"
    with reject.open("wb") as handle:
        handle.truncate(51 * 1024 * 1024)
    # A refused pick is skipped, it does not evict what the task already holds,
    # so clear the task first: the over-limit file is then refused and nothing
    # is left to run.
    page.click("#clear-btn")
    page.wait_for_function("document.querySelector('#detect-btn').disabled === true")
    page.set_input_files("#upload-input", str(reject))
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('50')"
    )
    assert page.locator("#detect-btn").is_disabled()


def _switch_language(page, lang: str) -> None:
    page.select_option("#lang-select", lang)
    page.wait_for_function("lang => document.documentElement.lang === lang", arg=lang)


def test_visible_toast_repaints_on_language_switch(page, tmp_path: Path) -> None:
    _switch_language(page, "en")
    wrong = tmp_path / "wrong.txt"
    wrong.write_text("not a document", encoding="utf-8")
    page.set_input_files("#upload-input", str(wrong))
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('accepts .docx')"
    )

    _switch_language(page, "zh")
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('本版本接受')"
    )
    _switch_language(page, "en")
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('accepts .docx')"
    )


def test_hidden_and_suppressed_toasts_stay_hidden(page, tmp_path: Path) -> None:
    _switch_language(page, "en")
    wrong = tmp_path / "wrong.txt"
    wrong.write_text("not a document", encoding="utf-8")
    page.set_input_files("#upload-input", str(wrong))
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('accepts .docx')"
    )

    # Informational copy must not replace an error that is still on screen.
    page.evaluate("document.getElementById('cancel-btn').click()")
    assert "accepts .docx" in page.locator("#toast").inner_text()
    _switch_language(page, "zh")
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('本版本接受')"
    )

    # Once dismissed, language changes must not resurrect it.
    page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_selector("#toast", state="hidden")
    _switch_language(page, "en")
    _switch_language(page, "zh")
    assert page.locator("#toast").is_hidden()
    assert page.locator("#toast").inner_text() == ""


def test_completed_preload_panel_stays_hidden_on_language_switch(page) -> None:
    _switch_language(page, "en")
    # Start the same preload path through its retry control, then complete it
    # deterministically instead of depending on service-worker network caching.
    page.evaluate(
        """() => {
            Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
            document.getElementById('preload-retry').click();
        }"""
    )
    page.wait_for_selector("#preload-panel:not([hidden])")
    page.evaluate(
        "navigator.serviceWorker.dispatchEvent(new MessageEvent('message', "
        "{data: {type: 'precache-done'}}))"
    )
    page.wait_for_selector("#preload-panel", state="hidden")
    _switch_language(page, "zh")
    _switch_language(page, "en")
    assert page.locator("#preload-panel").is_hidden()


def test_save_failure_uses_localized_store_error(page, built: Path) -> None:
    _switch_language(page, "zh")
    page.evaluate(
        """() => {
            window.lethStore.saveJob = async () => {
                throw new Error('Browser storage is unavailable.');
            };
        }"""
    )
    page.set_input_files("#upload-input", str(built / "samples" / "docx-001.docx"))
    page.click("#detect-btn")
    page.wait_for_selector("#review-card:not([hidden])")
    page.click("#generate-btn")
    page.wait_for_selector("#generate-card:not([hidden])")
    page.wait_for_function(
        "document.querySelector('#generate-saved').innerText.includes('浏览器存储不可用')"
    )
    assert "Browser storage is unavailable" not in page.locator("#generate-saved").inner_text()

    _switch_language(page, "en")
    page.wait_for_function(
        "document.querySelector('#generate-saved').innerText.includes('Browser storage is unavailable')"
    )


def test_docx_roundtrip_review_generate_restore_and_cache_privacy(
    page, built: Path, tmp_path: Path
) -> None:
    # A dictionary seeded in the browser, exactly as the v3 store keeps it.
    page.evaluate(
        "window.lethStore.mergeEntities([{canonical:'John Smith',"
        "type:'PERSON',aliases:['J. Smith']}])"
    )
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    assert page.evaluate(
        "window.lethStore.getEntities().then(rows => rows.map(row => row.canonical))"
    ) == ["John Smith"]

    page.set_input_files("#upload-input", str(built / "samples" / "docx-001.docx"))
    page.click("#detect-btn")
    page.wait_for_selector("#review-card:not([hidden])")
    page.wait_for_selector("#panel-deidentify:not([hidden])")
    assert page.locator("#document-preview mark", has_text="John Smith").count() >= 1
    rows = page.locator("#review-rows tr")
    assert rows.count() >= 1
    assert "John Smith" in page.locator("#review-rows").inner_text()

    page.click("#generate-btn")
    page.wait_for_selector("#generate-card:not([hidden])")
    page.wait_for_selector("#panel-deidentify:not([hidden])")
    summary = page.locator("#generate-summary").inner_text()
    assert any(char.isdigit() for char in summary)
    job = page.locator("#generate-job").inner_text()
    assert "job-" in job

    with page.expect_download() as redacted_info:
        page.click("#download-btn")
    # save_as keeps the .docx suffix the UI needs on the way back in.
    redacted = tmp_path / "docx-001-redacted.docx"
    redacted_info.value.save_as(str(redacted))
    assert redacted.stat().st_size > 0
    assert redacted.read_bytes()[:2] == b"PK"

    # The saved history and its token map must still be usable after a reload.
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.click(".step[data-panel='reidentify']")
    page.wait_for_selector("#panel-reidentify:not([hidden])")
    page.wait_for_function("document.querySelectorAll('#history-rows tr').length > 0")
    page.locator("#history-rows input[type=radio]").first.check()
    page.wait_for_function("document.querySelectorAll('#job-dict-rows tr').length > 0")
    page.set_input_files("#restore-input", str(redacted))
    page.wait_for_function("!document.querySelector('#restore-btn').disabled")
    page.click("#restore-btn")
    page.wait_for_selector("#restore-result:not([hidden])")
    assert any(char.isdigit() for char in page.locator("#restore-summary").inner_text())
    with page.expect_download() as restored_info:
        page.click("#restore-download")
    restored = tmp_path / "docx-001-restored.docx"
    restored_info.value.save_as(str(restored))
    assert restored.stat().st_size > 0
    assert restored.read_bytes()[:2] == b"PK"

    # The service worker cached the shell and the runtimes it needed, and
    # nothing that looks like a user document.
    page.wait_for_function("navigator.serviceWorker.controller !== null")
    page.evaluate("fetch('/samples/docx-001.docx').then(r => r.arrayBuffer())")
    cached = page.evaluate(
        """async () => {
            const out = {};
            for (const name of await caches.keys()) {
                const cache = await caches.open(name);
                out[name] = (await cache.keys()).map((r) => new URL(r.url).pathname);
            }
            return out;
        }"""
    )
    paths = [path for entries in cached.values() for path in entries]
    assert not [path for path in paths if "samples" in path or path.endswith(".docx")]
    assert any(path.startswith("/assets/vendor/pyodide/") for path in paths)
    assert "/dictionary/manifest.json" in paths
    assert "/dictionary/manifest.sig" in paths
    assert any(path.startswith("/dictionary/packs/") for path in paths)
    assert "/index.html" in paths


def test_xlsx_roundtrip_and_degradation_list(page, built: Path, tmp_path: Path) -> None:
    page.evaluate(
        "window.lethStore.mergeEntities([{canonical:'John Smith',"
        "type:'PERSON',aliases:['J. Smith']}])"
    )
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )

    page.set_input_files("#upload-input", str(built / "samples" / "xlsx-001.xlsx"))
    page.wait_for_selector("#upload-degradations:not([hidden])")
    page.select_option("#lang-select", "en")
    page.wait_for_function(
        "document.querySelector('#upload-degradations summary').innerText.includes('redaction')"
    )
    page.click("#upload-degradations summary")
    assert "pivot" in page.locator("#upload-degradations").inner_text().lower()
    page.click("#detect-btn")
    page.wait_for_selector("#review-card:not([hidden])")
    assert "John Smith" in page.locator("#review-rows").inner_text()
    page.click("#generate-btn")
    page.wait_for_selector("#generate-card:not([hidden])")

    with page.expect_download() as redacted_info:
        page.click("#download-btn")
    redacted = tmp_path / "xlsx-001-redacted.xlsx"
    redacted_info.value.save_as(str(redacted))
    assert redacted.name.endswith(".xlsx")
    assert redacted.read_bytes()[:2] == b"PK"

    page.click("#goto-restore-btn")
    page.wait_for_selector("#panel-reidentify:not([hidden])")
    page.wait_for_function("document.querySelectorAll('#history-rows tr').length > 0")
    page.locator("#history-rows input[type=radio]").first.check()
    page.wait_for_function("document.querySelectorAll('#job-dict-rows tr').length > 0")
    page.set_input_files("#restore-input", str(redacted))
    page.wait_for_function("!document.querySelector('#restore-btn').disabled")
    page.click("#restore-btn")
    page.wait_for_selector("#restore-result:not([hidden])")
    with page.expect_download() as restored_info:
        page.click("#restore-download")
    restored = tmp_path / "xlsx-001-restored.xlsx"
    restored_info.value.save_as(str(restored))
    assert restored.name.endswith(".xlsx")

    from lethe.xlsx_engine import extract_all_text_parts

    assert extract_all_text_parts(restored.read_bytes()) == extract_all_text_parts(
        (built / "samples" / "xlsx-001.xlsx").read_bytes()
    )


def test_pptx_roundtrip_and_degradation_list(page, built: Path, tmp_path: Path) -> None:
    page.evaluate(
        "window.lethStore.mergeEntities([{canonical:'Alice Chen',"
        "type:'PERSON',aliases:[]}])"
    )
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )

    page.set_input_files("#upload-input", str(built / "samples" / "pptx-001.pptx"))
    page.wait_for_selector("#upload-degradations:not([hidden])")
    page.select_option("#lang-select", "en")
    page.wait_for_function(
        "document.querySelector('#upload-degradations summary').innerText.includes('redaction')"
    )
    page.click("#upload-degradations summary")
    assert "smartart" in page.locator("#upload-degradations").inner_text().lower()
    page.click("#detect-btn")
    page.wait_for_selector("#review-card:not([hidden])")
    assert "Alice Chen" in page.locator("#review-rows").inner_text()
    page.click("#generate-btn")
    page.wait_for_selector("#generate-card:not([hidden])")

    with page.expect_download() as redacted_info:
        page.click("#download-btn")
    redacted = tmp_path / "pptx-001-redacted.pptx"
    redacted_info.value.save_as(str(redacted))
    assert redacted.name.endswith(".pptx")
    assert redacted.read_bytes()[:2] == b"PK"

    page.click("#goto-restore-btn")
    page.wait_for_selector("#panel-reidentify:not([hidden])")
    page.wait_for_function("document.querySelectorAll('#history-rows tr').length > 0")
    page.locator("#history-rows input[type=radio]").first.check()
    page.wait_for_function("document.querySelectorAll('#job-dict-rows tr').length > 0")
    page.set_input_files("#restore-input", str(redacted))
    page.wait_for_function("!document.querySelector('#restore-btn').disabled")
    page.click("#restore-btn")
    page.wait_for_selector("#restore-result:not([hidden])")
    with page.expect_download() as restored_info:
        page.click("#restore-download")
    restored = tmp_path / "pptx-001-restored.pptx"
    restored_info.value.save_as(str(restored))
    assert restored.name.endswith(".pptx")

    from lethe.pptx_engine import extract_all_text_parts

    assert extract_all_text_parts(restored.read_bytes()) == extract_all_text_parts(
        (built / "samples" / "pptx-001.pptx").read_bytes()
    )



def test_run_warnings_are_cleared_when_the_file_changes(page, built: Path) -> None:
    """A run's degradation note belongs to the file that produced it.

    `xlsx-001.xlsx` contains a formula literal, so detecting it records a real
    warning. Picking a different file (or clearing the picker) must hide that
    note immediately — otherwise the next file appears to carry a gap it never
    triggered. The note lives in the upload panel, so this asserts the element's
    own hidden state and text rather than on-screen visibility.
    """
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.select_option("#lang-select", "en")
    page.wait_for_function("document.documentElement.lang === 'en'")

    page.set_input_files("#upload-input", str(built / "samples" / "xlsx-001.xlsx"))
    page.click("#detect-btn")
    page.wait_for_selector("#review-card:not([hidden])")
    page.wait_for_function(
        "() => { const node = document.querySelector('#upload-warnings');"
        " return node.hidden === false && node.textContent.trim().length > 0; }"
    )
    assert "formula" in page.locator("#upload-warnings").text_content().lower()

    # A task can hold several files. The note follows the file being viewed, so
    # adding a second file and switching to it must drop the first file's
    # warning at once — otherwise the new file appears to carry a gap it never
    # triggered.
    page.set_input_files("#upload-input", str(built / "samples" / "docx-001.docx"))
    page.locator(".task-file-name", has_text="docx-001.docx").click()
    page.wait_for_function(
        "() => { const node = document.querySelector('#upload-warnings');"
        " return node.hidden === true && node.textContent.trim() === ''; }"
    )
    assert page.locator("#upload-warnings").text_content().strip() == ""

    # Switching back restores that file's own warning…
    page.locator(".task-file-name", has_text="xlsx-001.xlsx").click()
    page.wait_for_function(
        "() => document.querySelector('#upload-warnings').hidden === false"
    )
    # …and clearing the task must leave nothing behind either. Detection moved
    # to the review panel, so the upload panel and its buttons are hidden —
    # drive them through the DOM, which runs the same handlers a click would.
    page.evaluate("document.getElementById('clear-btn').click()")
    page.wait_for_function(
        "() => { const node = document.querySelector('#upload-warnings');"
        " return node.hidden === true && node.textContent.trim() === ''; }"
    )
    assert page.locator("#upload-warnings").text_content().strip() == ""


def test_unknown_degradation_code_shows_the_generic_note(page, built: Path) -> None:
    """A newer worker may report a gap this build cannot categorise.

    The raw code must never reach the interface, but the privacy warning must
    still appear once — silently dropping it could hide content the writer left
    untouched.
    """
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.select_option("#lang-select", "en")
    page.wait_for_function("document.documentElement.lang === 'en'")

    page.evaluate(
        """() => {
            const bridge = window.__letheBridge;
            const original = bridge.run.bind(bridge);
            bridge.run = async (request) => {
                const result = await original(request);
                if (request.op === "redact") {
                    result.warnings = ["xlsx.new_untouched_content"];
                }
                return result;
            };
        }"""
    )
    page.set_input_files("#upload-input", str(built / "samples" / "xlsx-001.xlsx"))
    page.click("#detect-btn")
    page.wait_for_selector("#review-card:not([hidden])")
    page.wait_for_function(
        "() => { const node = document.querySelector('#upload-warnings');"
        " return node.hidden === false && node.textContent.trim().length > 0; }"
    )
    note = page.locator("#upload-warnings").text_content()
    lowered = note.lower()
    assert "left untouched" in lowered
    assert "xlsx.new_untouched_content" not in note
    # one generic note regardless of how many unknown codes arrive
    assert lowered.count("left untouched") == 1


def test_tabs_keep_independent_state_and_dictionary_switch_survives_reload(
    page, built: Path
) -> None:
    """Every page can be used in any order; a disabled default stays off.

    John Smith is in the signed preset pack, so disabling it proves the page
    can override a preset for matching without copying or deleting that preset
    row. The manual-gap field can then opt the same term back in for one run.
    """
    page.evaluate(
        "window.lethStore.mergeEntities([{canonical:'Task Added Person',"
        "type:'PERSON',aliases:['TAP']}])"
    )
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.select_option("#lang-select", "en")
    page.wait_for_function("document.documentElement.lang === 'en'")
    user_before = page.evaluate("window.lethStore.getEntities()")

    page.click(".step[data-panel='dictionary']")
    page.wait_for_selector("#panel-dictionary:not([hidden])")
    page.wait_for_function("document.querySelectorAll('#dict-rows tr').length > 0")
    body = page.locator("#dict-rows").inner_text()
    assert "Server preset" in body
    assert "User" in body
    page.fill("#dict-search", "John Smith")
    page.wait_for_function(
        "document.querySelectorAll('#dict-rows tr').length === 1"
    )
    john = page.locator("#dict-rows tr", has_text="John Smith")
    assert john.locator("input[type=checkbox]").is_checked()
    john.locator("input[type=checkbox]").uncheck()

    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.select_option("#lang-select", "en")
    page.wait_for_function("document.documentElement.lang === 'en'")
    page.click(".step[data-panel='dictionary']")
    page.fill("#dict-search", "John Smith")
    page.wait_for_function(
        "document.querySelectorAll('#dict-rows tr').length === 1"
    )
    assert not page.locator("#dict-rows input[type=checkbox]").is_checked()

    page.click(".step[data-panel='deidentify']")
    page.set_input_files("#upload-input", str(built / "samples" / "docx-001.docx"))
    page.click("#detect-btn")
    page.wait_for_selector("#review-card:not([hidden])")
    assert "John Smith" not in page.locator("#review-rows").inner_text()

    page.fill("#manual-entity", "John Smith")
    page.select_option("#manual-type", "PERSON")
    page.click("#manual-add-btn")
    page.wait_for_function(
        "document.querySelector('#review-rows').innerText.includes('John Smith')"
    )
    assert page.locator("#review-rows").inner_text().count("John Smith") == 1
    john_row = page.locator("#review-rows tr", has_text="John Smith")
    assert john_row.locator("input[type=checkbox]").is_checked()
    john_row.locator("select.row-type").select_option("COUNTERPARTY")
    assert page.locator("#document-preview mark", has_text="John Smith").count() >= 1

    rows_before = page.locator("#review-rows tr").count()
    page.click(".step[data-panel='dictionary']")
    page.click(".step[data-panel='deidentify']")
    page.wait_for_selector("#review-card:not([hidden])")
    assert page.locator("#review-rows tr").count() == rows_before
    john_row = page.locator("#review-rows tr", has_text="John Smith")
    assert john_row.locator("input[type=checkbox]").is_checked()
    assert john_row.locator("select.row-type").input_value() == "COUNTERPARTY"
    assert page.locator("#document-preview mark", has_text="John Smith").count() >= 1
    assert page.evaluate("window.lethStore.getEntities()") == user_before


def test_detection_snapshot_cannot_cross_files_and_generate_state_survives_tabs(
    page, built: Path
) -> None:
    """A queued file change cannot retarget an in-flight detection or output."""
    page.evaluate(
        "window.lethStore.mergeEntities([{canonical:'John Smith',"
        "type:'PERSON',aliases:['J. Smith']}])"
    )
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.evaluate(
        """() => {
            const bridge = window.__letheBridge;
            const original = bridge.run.bind(bridge);
            let delayed = false;
            bridge.run = async (request) => {
                if (!delayed && request.op === "inspect") {
                    delayed = true;
                    window.__inspectStarted = true;
                    await new Promise((resolve) => setTimeout(resolve, 750));
                }
                return original(request);
            };
        }"""
    )

    page.set_input_files("#upload-input", str(built / "samples" / "docx-001.docx"))
    page.evaluate("document.getElementById('detect-btn').click()")
    page.wait_for_function("window.__inspectStarted === true")

    # Simulate a stale UI / programmatic event that somehow gets past the
    # disabled control. The handler must still reject it while the run is busy.
    page.evaluate("document.getElementById('upload-input').disabled = false")
    page.set_input_files("#upload-input", str(built / "samples" / "xlsx-001.xlsx"))
    assert "docx-001.docx" in page.locator("#upload-file").inner_text()

    page.wait_for_selector("#review-card:not([hidden])")
    assert page.locator("#document-preview mark", has_text="John Smith").count() >= 1
    page.click("#generate-btn")
    page.wait_for_selector("#generate-card:not([hidden])")
    job_before = page.locator("#generate-job").inner_text()

    page.click(".step[data-panel='dictionary']")
    page.click(".step[data-panel='deidentify']")
    page.wait_for_selector("#generate-card:not([hidden])")
    assert page.locator("#generate-job").inner_text() == job_before
    with page.expect_download() as redacted_info:
        page.click("#download-btn")
    assert redacted_info.value.suggested_filename == "docx-001-redacted.docx"


def _seed_restore_jobs(page) -> None:
    page.evaluate(
        """async () => {
            await window.lethStore.saveJob({
                jobId: 'job-a',
                createdAt: '2026-11-25T10:00:00Z',
                sourceFiles: ['a.docx'],
                replacements: 1,
                mapping: {'[PERSON_001]': 'Alpha From A'},
                passphrase: ''
            });
            await window.lethStore.saveJob({
                jobId: 'job-b',
                createdAt: '2026-11-25T11:00:00Z',
                sourceFiles: ['b.docx'],
                replacements: 1,
                mapping: {'[PERSON_001]': 'Beta From B'},
                passphrase: ''
            });
        }"""
    )


def _open_restore_jobs(page) -> None:
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.click(".step[data-panel='reidentify']")
    page.wait_for_function("document.querySelectorAll('#history-rows tr').length === 2")


def _token_reply(tmp_path: Path) -> Path:
    from docx import Document

    path = tmp_path / "restore-race.docx"
    document = Document()
    document.add_paragraph("Reply for [PERSON_001].")
    document.save(path)
    return path


def test_restore_discards_old_job_success_after_switching(page, tmp_path: Path) -> None:
    """A slow successful job-a map cannot produce a result for selected job-b."""
    _seed_restore_jobs(page)
    _open_restore_jobs(page)
    token_doc = _token_reply(tmp_path)

    page.locator("input[value='job-a']").check()
    page.wait_for_function(
        "document.querySelector('#job-dict-rows').innerText.includes('Alpha From A')"
    )
    page.set_input_files("#restore-input", str(token_doc))
    page.evaluate(
        """() => {
            const original = window.lethStore.getMapping.bind(window.lethStore);
            window.lethStore.getMapping = async (jobId, passphrase) => {
                if (jobId === 'job-a') {
                    window.__slowRestoreStarted = true;
                    await new Promise((resolve) => setTimeout(resolve, 750));
                    const value = await original(jobId, passphrase);
                    window.__slowRestoreFinished = true;
                    return value;
                }
                return original(jobId, passphrase);
            };
        }"""
    )

    page.evaluate("document.getElementById('restore-btn').click()")
    page.wait_for_function("window.__slowRestoreStarted === true")
    page.locator("input[value='job-b']").check()
    page.wait_for_function("window.__slowRestoreFinished === true")
    page.wait_for_timeout(50)
    page.wait_for_function("!document.querySelector('#restore-btn').disabled")
    assert "job-b" in page.locator("#selected-job").inner_text()
    assert page.locator("#restore-result").is_hidden()

    page.click("#restore-btn")
    page.wait_for_selector("#restore-result:not([hidden])")
    with page.expect_download() as restored_info:
        page.click("#restore-download")
    restored_path = tmp_path / "restore-race-success.docx"
    restored_info.value.save_as(str(restored_path))
    from docx import Document

    text = "\n".join(paragraph.text for paragraph in Document(restored_path).paragraphs)
    assert "Beta From B" in text
    assert "Alpha From A" not in text


def test_restore_discards_old_job_failure_after_switching(page, tmp_path: Path) -> None:
    """A delayed job-a failure cannot show an error under selected job-b."""
    _seed_restore_jobs(page)
    _open_restore_jobs(page)
    token_doc = _token_reply(tmp_path)

    page.locator("input[value='job-a']").check()
    page.wait_for_function(
        "document.querySelector('#job-dict-rows').innerText.includes('Alpha From A')"
    )
    page.set_input_files("#restore-input", str(token_doc))
    page.evaluate(
        """() => {
            const original = window.lethStore.getMapping.bind(window.lethStore);
            window.lethStore.getMapping = async (jobId, passphrase) => {
                if (jobId === 'job-a') {
                    window.__slowFailureStarted = true;
                    try {
                        await new Promise((resolve) => setTimeout(resolve, 750));
                        throw new Error('STALE JOB-A FAILURE');
                    } finally {
                        window.__slowFailureFinished = true;
                    }
                }
                return original(jobId, passphrase);
            };
        }"""
    )

    page.evaluate("document.getElementById('restore-btn').click()")
    page.wait_for_function("window.__slowFailureStarted === true")
    page.locator("input[value='job-b']").check()
    page.wait_for_function("window.__slowFailureFinished === true")
    page.wait_for_timeout(50)
    page.wait_for_function("!document.querySelector('#restore-btn').disabled")
    assert "job-b" in page.locator("#selected-job").inner_text()
    assert page.locator("#restore-result").is_hidden()
    assert "STALE JOB-A FAILURE" not in page.locator("#toast").text_content()


def test_history_mapping_races_are_discarded_by_job_id(page) -> None:
    """A slow older mapping must not overwrite the later selected job."""
    page.evaluate(
        """async () => {
            await window.lethStore.saveJob({
                jobId: 'job-old-slow',
                createdAt: '2026-11-25T10:00:00Z',
                sourceFiles: ['old.docx'],
                replacements: 1,
                mapping: {'[PERSON_001]': 'Old Alpha'},
                passphrase: ''
            });
            await window.lethStore.saveJob({
                jobId: 'job-new-fast',
                createdAt: '2026-11-25T11:00:00Z',
                sourceFiles: ['new.docx'],
                replacements: 2,
                mapping: {'[PERSON_001]': 'New Beta'},
                passphrase: ''
            });
        }"""
    )
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.click(".step[data-panel='reidentify']")
    page.wait_for_function("document.querySelectorAll('#history-rows tr').length === 2")
    page.evaluate(
        """() => {
            const original = window.lethStore.getMapping.bind(window.lethStore);
            window.lethStore.getMapping = async (jobId, passphrase) => {
                if (jobId === 'job-old-slow') {
                    window.__slowMappingStarted = true;
                    await new Promise((resolve) => setTimeout(resolve, 750));
                    const value = await original(jobId, passphrase);
                    window.__slowMappingFinished = true;
                    return value;
                }
                return original(jobId, passphrase);
            };
        }"""
    )

    page.locator("input[value='job-old-slow']").check()
    page.wait_for_function("window.__slowMappingStarted === true")
    page.locator("input[value='job-new-fast']").check()
    page.wait_for_function("window.__slowMappingFinished === true")
    page.wait_for_function(
        "document.querySelector('#job-dict-rows').innerText.includes('New Beta')"
    )
    selected = page.locator("#selected-job").inner_text()
    rows = page.locator("#job-dict-rows").inner_text()
    assert "job-new-fast" in selected
    assert "New Beta" in rows
    assert "Old Alpha" not in rows


def test_restore_uses_the_selected_historical_mapping_and_keeps_reid_state(
    page, tmp_path: Path
) -> None:
    """The token is restored from the job map, not the current dictionary."""
    from docx import Document

    token_doc = tmp_path / "token-reply.docx"
    document = Document()
    document.add_paragraph("Reply for [PERSON_001].")
    document.save(token_doc)
    page.evaluate(
        """async () => {
            await window.lethStore.saveJob({
                jobId: 'job-historic-alpha',
                createdAt: '2026-11-24T09:00:00Z',
                sourceFiles: ['historic-source.docx'],
                replacements: 1,
                mapping: {'[PERSON_001]': 'Historic Alpha'},
                passphrase: ''
            });
            await window.lethStore.saveJob({
                jobId: 'job-other-mapping',
                createdAt: '2026-11-24T10:00:00Z',
                sourceFiles: ['other-source.docx'],
                replacements: 1,
                mapping: {'[PERSON_001]': 'Different Beta'},
                passphrase: ''
            });
        }"""
    )
    page.reload()
    page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    page.click(".step[data-panel='reidentify']")
    page.wait_for_function("document.querySelectorAll('#history-rows tr').length === 2")
    page.locator("input[value='job-historic-alpha']").check()
    page.wait_for_function(
        "document.querySelector('#job-dict-rows').innerText.includes('Historic Alpha')"
    )
    page.set_input_files("#restore-input", str(token_doc))
    page.wait_for_function("!document.querySelector('#restore-btn').disabled")

    page.click(".step[data-panel='dictionary']")
    page.click(".step[data-panel='reidentify']")
    page.wait_for_selector("#panel-reidentify:not([hidden])")
    assert page.locator("input[value='job-historic-alpha']").is_checked()
    assert "Historic Alpha" in page.locator("#job-dict-rows").inner_text()
    assert "token-reply.docx" in page.locator("#restore-file").inner_text()
    assert page.locator("#restore-btn").is_enabled()

    page.click("#restore-btn")
    page.wait_for_selector("#restore-result:not([hidden])")
    with page.expect_download() as restored_info:
        page.click("#restore-download")
    restored_path = tmp_path / "historic-restored.docx"
    restored_info.value.save_as(str(restored_path))
    restored = Document(restored_path)
    text = "\n".join(paragraph.text for paragraph in restored.paragraphs)
    assert "Historic Alpha" in text
    assert "Different Beta" not in text
    assert "[PERSON_001]" not in text
