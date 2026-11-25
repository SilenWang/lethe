"""P2 worker path: pptx redact / restore through BetterOffice + gap patches."""

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

from lethe.pptx_engine import extract_all_text_parts, scan_leaks

REPO = Path(__file__).resolve().parents[2]

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
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
  const waitFor = (match, ms = 180000) => new Promise((resolve, reject) => {
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
  const b64 = (u8) => {
    let text = "";
    for (let i = 0; i < u8.length; i += 0x8000) {
      text += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(text);
  };
  const buf = await (await fetch(`/samples/${sample}`)).arrayBuffer();
  window.__w.postMessage({
    type: "run", id: "i1", op: "inspect", fileName: sample, bytes: buf.slice(0),
  });
  const inspected = await window.__wait(
    (m) => m.id === "i1" && (m.type === "result" || m.type === "error"),
  );
  window.__w.postMessage({
    type: "run", id: "r1", op: "redact", fileName: sample,
    options: {entities: [
      {canonical: "John Smith", type: "PERSON", aliases: []},
      {canonical: "Alice Chen", type: "PERSON", aliases: []},
    ]},
    bytes: buf,
  }, [buf]);
  const red = await window.__wait(
    (m) => m.id === "r1" && (m.type === "result" || m.type === "error"),
  );
  if (red.type !== "result") return {error: red, inspected};
  const redB64 = b64(red.result.bytes);
  const tokenMap = Object.fromEntries(
    red.result.items.filter((item) => item.token).map((item) => [item.token, item.canonical]),
  );
  const copy = red.result.bytes.slice();
  window.__w.postMessage({
    type: "run", id: "r2", op: "restore", fileName: sample,
    options: {token_map: tokenMap}, bytes: copy.buffer,
  }, [copy.buffer]);
  const restored = await window.__wait(
    (m) => m.id === "r2" && (m.type === "result" || m.type === "error"),
  );
  window.__w.terminate();
  return {
    inspected,
    redHits: red.result.hits,
    redWarnings: red.result.warnings,
    pptxPartDirect: red.result.pptxPartDirect,
    redBytes: redB64,
    restoredType: restored.type,
    restoredBytes: restored.type === "result" ? b64(restored.result.bytes) : null,
    restoreError: restored.type === "error" ? restored : null,
  };
}"""

DOCX_PROBE = """async () => {
  const buf = await (await fetch('/samples/docx-001.docx')).arrayBuffer();
  window.__w.postMessage({
    type: "run", id: "d1", op: "redact", fileName: "docx-001.docx",
    options: {entities: [{canonical: "John Smith", type: "PERSON", aliases: []}]},
    bytes: buf,
  }, [buf]);
  const result = await window.__wait(
    (m) => m.id === "d1" && (m.type === "result" || m.type === "error"),
  );
  return result.type === "result"
    ? {ok: true, docxWasm: result.result.docxWasm, hits: result.result.hits}
    : {ok: false, error: result};
}"""

VAULT_PROBE = """async () => {
  window.__w.postMessage({type: "vault", id: "v1"});
  const result = await window.__wait(
    (m) => m.id === "v1" && (m.type === "vault-ready" || m.type === "vault-error"),
  );
  return result.type === "vault-ready"
    ? {ok: true, cryptoReady: result.cryptoReady}
    : {ok: false, error: result};
}"""


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("p2pptx") / "web"
    subprocess.run(
        [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(out)],
        check=True,
        cwd=REPO,
    )
    samples = out / "samples"
    samples.mkdir()
    shutil.copy2(
        REPO / "corpus" / "seeds" / "pptx-02-enhanced.pptx", samples / "enhanced.pptx"
    )
    shutil.copy2(REPO / "corpus" / "docx" / "docx-001.docx", samples / "docx-001.docx")
    return out


@pytest.fixture()
def page(built: Path):
    assert sync_playwright is not None
    with StaticServer(built) as server, sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(240_000)
        page.goto(f"{server.base_url}/p1/harness.html")
        page.wait_for_function("window.p1 && window.p1.state === 'ready'")
        yield page
        browser.close()


def test_pptx_worker_roundtrip(page, built: Path) -> None:
    ready = page.evaluate(START)
    assert ready["cryptoReady"] is False
    assert ready["docxWasm"] is False
    assert ready["pptxPartDirect"] is True
    docx = page.evaluate(DOCX_PROBE)
    assert docx["ok"], docx
    assert docx["docxWasm"] is True
    assert docx["hits"] > 0
    vault = page.evaluate(VAULT_PROBE)
    assert vault["ok"], vault
    assert vault["cryptoReady"] is True
    result = page.evaluate(ROUNDTRIP, {"sample": "enhanced.pptx"})
    assert "error" not in result, result
    assert result["inspected"]["type"] == "result"
    assert result["inspected"]["result"]["parts"] == 52
    assert result["redHits"] > 0
    assert result["pptxPartDirect"] is True
    assert result["restoreError"] is None, result["restoreError"]
    redacted = base64.b64decode(result["redBytes"])
    restored = base64.b64decode(result["restoredBytes"])
    source = (built / "samples" / "enhanced.pptx").read_bytes()
    assert scan_leaks(redacted, ["John Smith", "Alice Chen"]) == []
    assert extract_all_text_parts(restored) == extract_all_text_parts(source)
    with zipfile.ZipFile(io.BytesIO(source)) as before, zipfile.ZipFile(
        io.BytesIO(redacted)
    ) as after:
        assert before.namelist() == after.namelist()
    assert result["redWarnings"] == []
