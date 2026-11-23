"""P2 worker path: xlsx part-direct redact / restore (SST and inline forms)."""

from __future__ import annotations

import base64
import io
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest
from _server import StaticServer

from lethe.xlsx_engine import extract_all_text_parts, scan_leaks

REPO = Path(__file__).resolve().parents[2]

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - browser CI installs playwright
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]

START = """async () => {
  const worker = new Worker("/worker/pyodide_worker.js", {type: "module"});
  let inbox = [];
  let waiters = [];
  worker.addEventListener("message", (event) => {
    inbox.push(event.data);
    for (const waiter of [...waiters]) waiter();
  });
  const waitFor = (match, ms = 120000) => new Promise((resolve, reject) => {
    const check = () => {
      const index = inbox.findIndex(match);
      if (index < 0) return;
      const [message] = inbox.splice(index, 1);
      clearTimeout(timer);
      waiters = waiters.filter((item) => item !== check);
      resolve(message);
    };
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    waiters.push(check);
    check();
  });
  window.__w = worker;
  window.__wait = waitFor;
  return waitFor((message) => message.type === "ready");
}"""

ROUNDTRIP = """async ({sample}) => {
  const buf = await (await fetch(`/samples/${sample}`)).arrayBuffer();
  window.__w.postMessage({
    type: "run", id: "r1", op: "redact", fileName: sample,
    options: {entities: [{canonical: "John Smith", type: "PERSON", aliases: []}]},
    bytes: buf,
  }, [buf]);
  const red = await window.__wait(
    (m) => m.id === "r1" && (m.type === "result" || m.type === "error"),
  );
  if (red.type !== "result") return {error: red};
  const tokenMap = Object.fromEntries(
    red.result.items.filter((item) => item.token).map((item) => [item.token, item.canonical]),
  );
  const b64 = (u8) => {
    let text = "";
    for (let i = 0; i < u8.length; i += 0x8000) {
      text += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(text);
  };
  const redB64 = b64(red.result.bytes);
  const redBytes = red.result.bytes.slice();
  window.__w.postMessage({
    type: "run", id: "r2", op: "restore", fileName: sample,
    options: {token_map: tokenMap}, bytes: redBytes.buffer,
  }, [redBytes.buffer]);
  const restored = await window.__wait(
    (m) => m.id === "r2" && (m.type === "result" || m.type === "error"),
  );
  window.__w.terminate();
  return {
    redHits: red.result.hits,
    tokens: red.result.tokens,
    warnings: red.result.warnings,
    redBytes: redB64,
    restoredBytes: restored.type === "result" ? b64(restored.result.bytes) : null,
    restoreError: restored.type === "error" ? restored : null,
  };
}"""


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("p2xlsx") / "web"
    subprocess.run(
        [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(out)],
        check=True,
        cwd=REPO,
    )
    samples = out / "samples"
    samples.mkdir()
    shutil.copy2(REPO / "corpus" / "xlsx" / "xlsx-001.xlsx", samples / "inline.xlsx")
    shutil.copy2(
        REPO / "corpus" / "seeds" / "xlsx-02-enhanced.xlsx", samples / "sst.xlsx"
    )
    return out


@pytest.fixture()
def page(built: Path):
    assert sync_playwright is not None
    with StaticServer(built) as server, sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(180_000)
        page.goto(f"{server.base_url}/p1/harness.html")
        page.wait_for_function("window.p1 && window.p1.state === 'ready'")
        yield page
        browser.close()


@pytest.mark.parametrize("sample", ["inline.xlsx", "sst.xlsx"])
def test_xlsx_worker_roundtrip(page, sample: str) -> None:
    page.evaluate(START)
    result = page.evaluate(ROUNDTRIP, {"sample": sample})
    assert "error" not in result, result
    assert result["restoreError"] is None, result["restoreError"]
    assert result["redHits"] > 0
    redacted = base64.b64decode(result["redBytes"])
    restored = base64.b64decode(result["restoredBytes"])
    # compare against the same sample on disk
    disk = REPO / "corpus" / ("xlsx" if sample == "inline.xlsx" else "seeds") / (
        "xlsx-001.xlsx" if sample == "inline.xlsx" else "xlsx-02-enhanced.xlsx"
    )
    original = disk.read_bytes()
    assert scan_leaks(redacted, ["John Smith"]) == []
    assert extract_all_text_parts(restored) == extract_all_text_parts(original)
    with zipfile.ZipFile(io.BytesIO(original)) as before, zipfile.ZipFile(
        io.BytesIO(redacted)
    ) as after:
        assert before.namelist() == after.namelist()
