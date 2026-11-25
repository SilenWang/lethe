"""P1 UI: four panels, gates, i18n, IndexedDB v3 and the offline shell.

The UI is the last mile of the frozen worker interface: it only calls
``bridge.run`` and never touches document bytes itself. These tests drive the
built static app in Chromium, including one real docx redact→restore round trip.
"""

from __future__ import annotations

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
    return out


@pytest.fixture()
def page(built: Path):
    assert sync_playwright is not None
    with StaticServer(built) as server, sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(240_000)
        page.goto(f"{server.base_url}/")
        page.wait_for_function("window.lethStore && document.querySelector('#detect-btn')")
        page.wait_for_function(
            "window.__letheBridge && window.__letheBridge.state() === 'ready'"
        )
        yield page
        browser.close()


def test_shell_has_four_panels_and_switches_language(page) -> None:
    assert page.locator(".step").count() == 4
    assert page.locator("h1").inner_text() == "Lethe"
    page.select_option("#lang-select", "zh")
    page.wait_for_function(
        "document.querySelector('.step[data-panel=\"upload\"]').innerText.includes('上传')"
    )
    assert page.locator(".step[data-panel='upload']").inner_text().strip().endswith("上传")
    page.select_option("#lang-select", "en")
    page.wait_for_function(
        "document.querySelector('.step[data-panel=\"upload\"]').innerText.includes('Upload')"
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
    page.set_input_files("#upload-input", str(reject))
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('50')"
    )
    assert page.locator("#detect-btn").is_disabled()


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

    page.set_input_files("#upload-input", str(built / "samples" / "docx-001.docx"))
    page.click("#detect-btn")
    page.wait_for_selector("#panel-review:not([hidden])")
    rows = page.locator("#review-rows tr")
    assert rows.count() >= 1
    assert "John Smith" in page.locator("#review-rows").inner_text()

    page.click("#generate-btn")
    page.wait_for_selector("#panel-generate:not([hidden])")
    summary = page.locator("#generate-summary").inner_text()
    assert "30" in summary and "4" in summary
    job = page.locator("#generate-job").inner_text()
    assert "job-" in job

    with page.expect_download() as redacted_info:
        page.click("#download-btn")
    # save_as keeps the .docx suffix the UI needs on the way back in.
    redacted = tmp_path / "docx-001-redacted.docx"
    redacted_info.value.save_as(str(redacted))
    assert redacted.stat().st_size > 0
    assert redacted.read_bytes()[:2] == b"PK"

    # Restore panel: the saved job supplies the token map; the downloaded
    # de-identified file is the input.
    page.click("#goto-restore-btn")
    page.wait_for_selector("#panel-restore:not([hidden])")
    page.wait_for_function("document.querySelectorAll('#restore-job option').length > 1")
    page.select_option("#restore-job", index=1)
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
        "document.querySelector('#upload-degradations summary').innerText.includes('xlsx')"
    )
    page.click("#upload-degradations summary")
    assert "pivot" in page.locator("#upload-degradations").inner_text().lower()
    page.click("#detect-btn")
    page.wait_for_selector("#panel-review:not([hidden])")
    assert "John Smith" in page.locator("#review-rows").inner_text()
    page.click("#generate-btn")
    page.wait_for_selector("#panel-generate:not([hidden])")

    with page.expect_download() as redacted_info:
        page.click("#download-btn")
    redacted = tmp_path / "xlsx-001-redacted.xlsx"
    redacted_info.value.save_as(str(redacted))
    assert redacted.name.endswith(".xlsx")
    assert redacted.read_bytes()[:2] == b"PK"

    page.click("#goto-restore-btn")
    page.wait_for_selector("#panel-restore:not([hidden])")
    page.wait_for_function("document.querySelectorAll('#restore-job option').length > 1")
    page.select_option("#restore-job", index=1)
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
