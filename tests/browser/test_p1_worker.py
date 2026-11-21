"""P1 worker: one worker, Pyodide + BetterOffice, gates before the library."""

from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest
from _server import StaticServer

REPO = Path(__file__).resolve().parents[2]

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - browser CI installs playwright
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]

START_WORKER = """async () => {
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
    const timer = setTimeout(() => reject(new Error("timed out waiting for message")), ms);
    waiters.push(check);
    check();
  });
  window.__worker = worker;
  window.__waitFor = waitFor;
  return waitFor((message) => message.type === "ready");
}"""


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("p1worker") / "web"
    subprocess.run(
        [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(out)],
        check=True,
        cwd=REPO,
    )
    samples = out / "samples"
    samples.mkdir()
    shutil.copy2(REPO / "corpus" / "docx" / "docx-001.docx", samples / "docx-001.docx")
    (samples / "not-a-zip.bin").write_bytes(b"this is not a zip package")
    with zipfile.ZipFile(samples / "bomb.docx", "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", b"\0" * (2 * 1024 * 1024))
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


def _run_raw(page, op: str, sample: str):
    page.evaluate(START_WORKER)
    return page.evaluate(
        """async ({op, sample}) => {
            const buf = await (await fetch(`/samples/${sample}`)).arrayBuffer();
            window.__worker.postMessage(
                {type: "run", id: "r1", op, fileName: sample, options: {}, bytes: buf},
                [buf],
            );
            const message = await window.__waitFor(
                (item) => item.id === "r1" && (item.type === "result" || item.type === "error"),
            );
            window.__worker.terminate();
            return message;
        }""",
        {"op": op, "sample": sample},
    )


def test_worker_ready_message(page) -> None:
    ready = page.evaluate(START_WORKER)
    page.evaluate("window.__worker.terminate()")
    assert ready["protocol"] == 1
    assert ready["pyodide"] == "0.29.5"
    assert "inspect" in ready["ops"]


def test_echo_runs_python(page) -> None:
    page.evaluate(START_WORKER)
    echo = page.evaluate(
        """async () => {
            const bytes = new TextEncoder().encode("x");
            window.__worker.postMessage(
                {type: "run", id: "e1", op: "echo", options: {payload: "pong"}, bytes},
                [bytes.buffer],
            );
            return window.__waitFor((item) => item.id === "e1");
        }"""
    )
    page.evaluate("window.__worker.terminate()")
    assert echo["type"] == "result"
    assert echo["result"]["payload"] == "pong"


def test_inspect_runs_gates_then_both_runtimes(page) -> None:
    message = _run_raw(page, "inspect", "docx-001.docx")
    assert message["type"] == "result", message
    result = message["result"]
    assert result["parts"] > 10
    assert result["paragraphs"] > 0
    assert result["status"] == "ok"


def test_bad_package_is_parse_failed(page) -> None:
    message = _run_raw(page, "inspect", "not-a-zip.bin")
    assert message["type"] == "error"
    assert message["code"] == "PARSE_FAILED"
    assert message["detail"]["gate"] == "G0:zip.invalid"


def test_gate_rejection_is_too_large(page) -> None:
    message = _run_raw(page, "inspect", "bomb.docx")
    assert message["type"] == "error"
    assert message["code"] == "TOO_LARGE"
    assert message["detail"]["gate"] == "G4c:zip.ratio"
