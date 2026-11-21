"""P1 worker: one worker, Pyodide + BetterOffice, gates before the library."""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
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


def test_cancel_during_init_keeps_worker_alive(built: Path) -> None:
    assert sync_playwright is not None
    with StaticServer(built) as server, sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(180_000)
        page.route("**/pyodide.asm.wasm", lambda route: (time.sleep(1.5), route.continue_()))
        page.goto(f"{server.base_url}/p1/harness.html")
        page.wait_for_function("window.p1 && window.p1.state === 'ready'")
        outcome = page.evaluate(
            """async () => {
                const bridge = window.p1.createBridge({});
                const run = bridge.run({op: "echo", bytes: new TextEncoder().encode("x")});
                const cancelled = bridge.cancel();
                const first = await run.then(() => "resolved", (e) => e.code);
                const stateAfterCancel = bridge.state();
                const info = await bridge.ready;
                const echo = await bridge.run({
                    op: "echo", bytes: new TextEncoder().encode("x"), options: {payload: "ok"},
                });
                bridge.dispose();
                return {cancelled, first, stateAfterCancel, pyodide: info.pyodide, echo};
            }"""
        )
        browser.close()
    assert outcome["cancelled"] is True
    assert outcome["first"] == "CANCELLED"
    assert outcome["stateAfterCancel"] == "initializing"
    assert outcome["pyodide"] == "0.29.5"
    assert outcome["echo"]["payload"] == "ok"


def test_watchdog_times_out_and_restarts(page) -> None:
    outcome = page.evaluate(
        """async () => {
            const bridge = window.p1.createBridge({limits: {firstByteMs: 300}});
            await bridge.ready;
            const slow = bridge.run({
                op: "echo", bytes: new TextEncoder().encode("x"), options: {sleepMs: 1500},
            });
            const code = await slow.then(() => "resolved", (e) => e.code);
            await bridge.ready;
            const echo = await bridge.run({
                op: "echo", bytes: new TextEncoder().encode("x"), options: {payload: "after"},
            });
            const recycles = bridge.stats().recycles;
            bridge.dispose();
            return {code, payload: echo.payload, recycles};
        }"""
    )
    assert outcome["code"] == "TIMEOUT"
    assert outcome["payload"] == "after"
    assert outcome["recycles"] >= 1


def test_large_task_recycles_worker(page) -> None:
    outcome = page.evaluate(
        """async () => {
            const bridge = window.p1.createBridge({recycleThresholdBytes: 0});
            await bridge.ready;
            await bridge.run({op: "echo", bytes: new TextEncoder().encode("x")});
            const after = bridge.stats().recycles;
            const state = bridge.state();
            await bridge.ready;
            const echo = await bridge.run({
                op: "echo", bytes: new TextEncoder().encode("x"), options: {payload: "next"},
            });
            bridge.dispose();
            return {after, state, payload: echo.payload};
        }"""
    )
    assert outcome["after"] == 1
    assert outcome["state"] == "initializing"
    assert outcome["payload"] == "next"


def test_second_run_is_busy(page) -> None:
    outcome = page.evaluate(
        """async () => {
            const bridge = window.p1.createBridge({});
            await bridge.ready;
            const first = bridge.run({
                op: "echo", bytes: new TextEncoder().encode("x"), options: {sleepMs: 300},
            });
            const second = await bridge.run({
                op: "echo", bytes: new TextEncoder().encode("x"),
            }).then(() => "resolved", (e) => e.code);
            await first;
            bridge.dispose();
            return second;
        }"""
    )
    assert outcome == "BUSY"


def test_error_classification(page) -> None:
    codes = page.evaluate(
        """() => [
            window.p1.classifyError(new Error("WebAssembly.Memory.grow failed")),
            window.p1.classifyError(new Error("BadZipFile: File is not a zip file")),
            window.p1.classifyError(new Error("worker stopped")),
            window.p1.classifyError({code: "TOO_LARGE", message: "gate"}),
        ]"""
    )
    assert codes == ["OOM", "PARSE_FAILED", "INTERNAL", "TOO_LARGE"]
