"""End-to-end verification of the PWA shell (VYB-361).

Runs the real NiceGUI app in a subprocess and drives it with Chromium through
Playwright, proving what the DevTools Application panel shows by hand:

  * Chromium parses the web app manifest with no errors and reports the app as
    installable (Page.getAppManifest / Page.getInstallabilityErrors — the exact
    checks behind the "Install app" address-bar entry);
  * the service worker registers, controls the page and keeps a cache;
  * that cache holds ONLY whitelisted static assets — after a real
    upload -> detect -> de-identify run, no user document, no result and no
    /api/* response is in it;
  * /sw.js and /manifest.webmanifest are served with the headers installation
    depends on.

A headless browser cannot click the OS install dialog, so the "standalone
window" acceptance is evidenced by the manifest's display mode + the worker
controlling the page (see docs/pwa.md for the manual steps).

Local run (requires a Python env with the app deps, pytest and playwright):
    python -m pytest tests/browser/test_pwa.py -q
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

# What the worker is allowed to cache — mirrors STATIC_PATHS in sw.js.
WHITELIST = {
    "/static/client-store.js",
    "/static/migration.js",
    "/static/favicon.svg",
    "/static/fonts/cinzel-latin.woff2",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png",
    "/static/icons/icon-512-maskable.png",
    "/manifest.webmanifest",
}

CACHE_SNAPSHOT_JS = """
(async () => {
  const names = await caches.keys();
  const out = {};
  for (const name of names) {
    const cache = await caches.open(name);
    out[name] = (await cache.keys()).map((r) => new URL(r.url).pathname);
  }
  return out;
})()
"""


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
    port = 9000 + (os.getpid() % 200)
    data_dir = tempfile.mkdtemp(prefix="lethe-pwa-e2e-")
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


def _open(pw, user_data_dir: str):
    ctx = pw.chromium.launch_persistent_context(user_data_dir, headless=True)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    return ctx, page


def _goto(page, url: str) -> None:
    # Pin the interface language to English: these assertions read the English
    # labels, while the app's default interface language is Chinese (VYB-355).
    sep = "&" if "?" in url else "?"
    page.goto(f"{url}{sep}lang=en", wait_until="networkidle")
    page.get_by_text("Lethe", exact=True).first.wait_for(timeout=30000)


def _wait_for_worker(page) -> None:
    """The page registers the worker on load; wait until it controls the page."""
    page.evaluate("navigator.serviceWorker.ready.then((r) => !!(r.active))")
    page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=30000)


def _tab(page, name: str) -> None:
    page.locator(".q-tab", has_text=name).click()


def test_installable_and_cache_boundary(server, tmp_path):
    url = server["url"]
    profile = str(tmp_path / "profile-pwa")
    with sync_playwright() as pw:
        ctx, page = _open(pw, profile)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        _goto(page, url)
        _wait_for_worker(page)

        # ---- 1. installation: the same checks the address-bar entry uses ----
        cdp = ctx.new_cdp_session(page)
        manifest = cdp.send("Page.getAppManifest")
        assert not manifest.get("errors"), f"manifest errors: {manifest.get('errors')}"
        data = json.loads(manifest["data"])
        assert data["name"] and data["start_url"], data
        assert data["display"] == "standalone", data.get("display")
        assert len(data.get("icons", [])) >= 2, data.get("icons")

        installability = cdp.send("Page.getInstallabilityErrors")
        blocking = [e for e in installability.get("installabilityErrors", [])
                    # headless Chromium can't report the main-frame prompt state
                    if e.get("errorId") != "not-in-main-frame"]
        assert not blocking, f"Chromium reports the app as not installable: {blocking}"

        # ---- 2. the worker controls the page (standalone shell) -------------
        controlled = page.evaluate("!!navigator.serviceWorker.controller")
        assert controlled, "the service worker does not control the page"

        snapshot = page.evaluate(CACHE_SNAPSHOT_JS)
        assert snapshot, "the service worker cached nothing"
        for name, paths in snapshot.items():
            assert name.startswith("lethe-static-"), name
            assert set(paths) <= WHITELIST, f"{name} holds non-static entries: {paths}"

        # ---- 3. a real de-identify run leaves the cache untouched -----------
        _tab(page, "De-identify")
        page.get_by_role("button", name="Try a sample memo").click()
        page.get_by_text("will be tokenised").wait_for(timeout=60000)
        page.get_by_role("button", name="Generate de-identified file(s)").click()
        page.get_by_text("Saved in this browser").wait_for(timeout=60000)

        # the migration API is POST / GET-guarded and must never be cached
        page.evaluate("fetch('/api/migrate/status').then((r) => r.json())")

        after = page.evaluate(CACHE_SNAPSHOT_JS)
        for name, paths in after.items():
            assert set(paths) <= WHITELIST, f"a document/result reached the cache: {paths}"
            assert not [p for p in paths if p.startswith("/api/")], paths
        ctx.close()

    assert errors == [], f"browser console/page errors: {errors}"


def test_sw_and_manifest_response_headers(server):
    """Installation depends on these exact responses (scope + media type)."""
    url = server["url"]
    with sync_playwright() as pw:
        ctx, page = _open(pw, str(server["data_dir"] + "/profile-headers"))
        _goto(page, url)

        sw = page.request.get(url + "sw.js")
        assert sw.ok, sw.status
        headers = {k.lower(): v for k, v in sw.headers.items()}
        assert headers.get("service-worker-allowed") == "/"
        assert "no-store" in headers.get("cache-control", "")
        assert "javascript" in headers.get("content-type", "")

        manifest = page.request.get(url + "manifest.webmanifest")
        assert manifest.ok, manifest.status
        headers = {k.lower(): v for k, v in manifest.headers.items()}
        assert "manifest" in headers.get("content-type", "")
        assert json.loads(manifest.text())["short_name"] == "Lethe"
        ctx.close()
