"""P1 DoD measurements on the real UI path.

Sampling: ``HEAPU8.byteLength`` from the worker (WASM memory only grows, so
the value read after a phase is that run's high-water mark), plus
``performance.memory.usedJSHeapSize`` sampled every 50ms on the main thread.
"""

from __future__ import annotations

import base64
import io
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest
from _server import StaticServer

from lethe.docx_engine import extract_all_text_parts, scan_leaks
from lethe.xlsx_engine import extract_all_text_parts as xlsx_extract
from lethe.xlsx_engine import scan_leaks as xlsx_leaks

REPO = Path(__file__).resolve().parents[2]
MIB = 1024 * 1024

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - browser CI installs playwright
    pytestmark = pytest.mark.skip(reason="playwright not installed")
    sync_playwright = None  # type: ignore[assignment]

RUN_REDACT = """async ({name, entities}) => {
  const bridge = window.__letheBridge;
  const buf = window.__sampleBytes
    ? window.__sampleBytes.buffer
    : await (await fetch(`/samples/${name}`)).arrayBuffer();
  let maxJs = 0;
  const sampler = setInterval(() => {
    if (performance.memory) maxJs = Math.max(maxJs, performance.memory.usedJSHeapSize);
  }, 50);
  const started = performance.now();
  try {
    const result = await bridge.run({
      op: "redact",
      bytes: new Uint8Array(buf),
      fileName: name,
      options: {entities},
    });
    return {
      ok: true,
      ms: Math.round(performance.now() - started),
      heapBytes: result.heapBytes,
      size: result.size,
      hits: result.hits,
      maxJs,
    };
  } catch (error) {
    return {ok: false, code: error.code, message: error.message};
  } finally {
    clearInterval(sampler);
  }
}"""

ENTITIES = [{"canonical": "John Smith", "type": "PERSON", "aliases": []}]

RUN_ROUNDTRIP = """async ({entities, fileName}) => {
  const bridge = window.__letheBridge;
  const bytes = window.__sampleBytes;
  const b64 = (u8) => {
    let text = "";
    for (let i = 0; i < u8.length; i += 0x8000) {
      text += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(text);
  };
  try {
    const red = await bridge.run({
      op: "redact", bytes, fileName: fileName || "offline.docx", options: {entities},
    });
    const tokenMap = Object.fromEntries(
      red.items.filter((item) => item.token).map((item) => [item.token, item.canonical]),
    );
    // Encode before the restore call: that call transfers (detaches) red.bytes.
    const redB64 = b64(red.bytes);
    const restored = await bridge.run({
      op: "restore", bytes: red.bytes, fileName: fileName || "offline.docx",
      options: {token_map: tokenMap},
    });
    return {
      ok: true, hits: red.hits, restoreHits: restored.hits,
      restoredSize: restored.size, heapBytes: red.heapBytes,
      redB64, resB64: b64(restored.bytes),
    };
  } catch (error) {
    return {ok: false, code: error.code, message: error.message};
  }
}"""


def _padded_docx(target_bytes: int) -> bytes:
    """A valid corpus docx padded with an incompressible stored media part."""
    base = (REPO / "corpus" / "docx" / "docx-001.docx").read_bytes()
    with zipfile.ZipFile(io.BytesIO(base)) as archive:
        parts = [(item.filename, archive.read(item.filename)) for item in archive.infolist()]
    content_types = dict(parts)["[Content_Types].xml"]
    if b'Extension="bin"' not in content_types:
        content_types = content_types.replace(
            b"</Types>",
            b'<Default Extension="bin" ContentType="application/octet-stream"/></Types>',
        )
    parts = [(name, content_types if name == "[Content_Types].xml" else data) for name, data in parts]
    overhead = sum(30 + len(name.encode()) + len(data) for name, data in parts) + 4096
    parts.append(("word/media/pad.bin", os.urandom(max(target_bytes - len(base) - overhead, 1024))))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, data in parts:
            item = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            item.compress_type = (
                zipfile.ZIP_STORED if name.endswith(".bin") else zipfile.ZIP_DEFLATED
            )
            archive.writestr(item, data)
    return buffer.getvalue()


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("p1dod") / "web"
    subprocess.run(
        [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(out)],
        check=True,
        cwd=REPO,
    )
    samples = out / "samples"
    samples.mkdir()
    for name, size in (
        ("docx-001.docx", None),
        ("docx-20mb.docx", 20 * MIB),
        ("docx-49mb.docx", 49 * MIB),
        ("docx-36mb.docx", 36 * MIB),
    ):
        data = (REPO / "corpus" / "docx" / "docx-001.docx").read_bytes() if size is None else _padded_docx(size)
        (samples / name).write_bytes(data)
    shutil.copy2(REPO / "corpus" / "xlsx" / "xlsx-001.xlsx", samples / "xlsx-001.xlsx")
    return out


def _page(server: StaticServer, browser):
    page = browser.new_page()
    page.set_default_timeout(600_000)
    page.goto(f"{server.base_url}/")
    page.wait_for_function(
        "window.__letheBridge && window.__letheBridge.state() === 'ready'"
    )
    return page


@pytest.fixture(scope="module")
def server(built: Path):
    with StaticServer(built) as running:
        yield running


def test_offline_install_and_docx_xlsx_roundtrip(server: StaticServer, built: Path) -> None:
    assert sync_playwright is not None
    external: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(service_workers="allow")
        page = context.new_page()
        page.set_default_timeout(600_000)

        def route(route_obj) -> None:
            url = route_obj.request.url
            if url.startswith((server.base_url, "data:", "blob:")):
                route_obj.continue_()
            else:
                external.append(url)
                route_obj.abort()

        page.route("**/*", route)
        page.goto(f"{server.base_url}/")
        page.wait_for_function(
            "window.__letheBridge && window.__letheBridge.state() === 'ready'"
        )
        page.wait_for_function("navigator.serviceWorker.ready.then(() => true)")

        manifest = page.evaluate("fetch('/manifest.webmanifest').then(r => r.json())")
        assert manifest["start_url"] == "/"
        assert manifest["display"] in {"standalone", "minimal-ui"}
        assert {icon["sizes"] for icon in manifest["icons"]} >= {"192x192", "512x512"}
        for icon in manifest["icons"]:
            status = page.evaluate(f"fetch('{icon['src']}').then(r => r.status)")
            assert status == 200, icon["src"]
        assert page.evaluate("window.isSecureContext") is True

        # Eager preload: the first online visit caches Pyodide, the wheels, the
        # docx bundle and the Python engine (xlsx is part-direct). The next
        # visit is only a cold-start check, then the network is cut.
        page.reload()
        page.wait_for_function(
            "window.__letheBridge && window.__letheBridge.state() === 'ready'"
        )
        runtime_cached = page.evaluate(
            """async () => {
                for (const name of await caches.keys()) {
                    const paths = (await (await caches.open(name)).keys()).map(
                        (request) => new URL(request.url).pathname,
                    );
                    if (
                        paths.includes("/assets/vendor/pyodide/pyodide.asm.wasm") &&
                        paths.includes("/assets/vendor/betteroffice/docx/dist/docx/index.mjs") &&
                        paths.includes("/py/lethe/xlsx_engine.py")
                    ) return true;
                }
                return false;
            }"""
        )
        assert runtime_cached is True, "runtime assets were not cached on the controlled visit"

        context.set_offline(True)
        page.reload()
        page.wait_for_function(
            "window.__letheBridge && window.__letheBridge.state() === 'ready'"
        )
        assert page.evaluate("navigator.serviceWorker.controller !== null") is True
        sample = (built / "samples" / "docx-001.docx").read_bytes()
        page.evaluate("(bytes) => { window.__sampleBytes = new Uint8Array(bytes); }", list(sample))
        outcome = page.evaluate(
            RUN_ROUNDTRIP, {"entities": ENTITIES, "fileName": "offline.docx"}
        )
        assert outcome["ok"], outcome
        assert outcome["hits"] > 0
        assert outcome["restoreHits"] > 0
        assert outcome["restoredSize"] > 0
        redacted_bytes = base64.b64decode(outcome["redB64"])
        restored_bytes = base64.b64decode(outcome["resB64"])
        assert extract_all_text_parts(restored_bytes) == extract_all_text_parts(sample)
        assert scan_leaks(redacted_bytes, ["John Smith", "john.smith@example.com"]) == []

        xlsx_sample = (built / "samples" / "xlsx-001.xlsx").read_bytes()
        page.evaluate(
            "(bytes) => { window.__sampleBytes = new Uint8Array(bytes); }",
            list(xlsx_sample),
        )
        xlsx_outcome = page.evaluate(
            RUN_ROUNDTRIP,
            {
                "entities": [
                    {"canonical": "John Smith", "type": "PERSON", "aliases": []},
                    {"canonical": "Alice Chen", "type": "PERSON", "aliases": []},
                ],
                "fileName": "offline.xlsx",
            },
        )
        assert xlsx_outcome["ok"], xlsx_outcome
        assert xlsx_outcome["hits"] > 0
        assert xlsx_outcome["restoreHits"] > 0
        xlsx_redacted = base64.b64decode(xlsx_outcome["redB64"])
        xlsx_restored = base64.b64decode(xlsx_outcome["resB64"])
        assert xlsx_leaks(xlsx_redacted, ["John Smith", "Alice Chen"]) == []
        assert xlsx_extract(xlsx_restored) == xlsx_extract(xlsx_sample)
        context.set_offline(False)
        browser.close()
    assert external == [], f"offline run reached the network: {external}"
    print(
        f"offline cold start: ok, docx redact hits={outcome['hits']}, "
        f"restore hits={outcome['restoreHits']}, restored={outcome['restoredSize']}B, "
        f"heap={outcome['heapBytes'] / MIB:.1f}MiB"
    )


def test_peak_memory_20mb_and_50mb(server: StaticServer) -> None:
    assert sync_playwright is not None
    results: dict[str, dict[str, object]] = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = _page(server, browser)
        for name in ("docx-20mb.docx", "docx-49mb.docx"):
            outcome = page.evaluate(RUN_REDACT, {"name": name, "entities": ENTITIES})
            assert outcome["ok"], outcome
            results[name] = outcome
        browser.close()
    peak20 = int(results["docx-20mb.docx"]["heapBytes"])
    peak50 = int(results["docx-49mb.docx"]["heapBytes"])
    assert peak20 < 1.5 * 1024 * MIB, results
    assert peak50 <= 2.5 * 1024 * MIB, results
    print(
        f"20MB: heap={peak20 / MIB:.1f}MiB ms={results['docx-20mb.docx']['ms']} "
        f"jsMax={int(results['docx-20mb.docx']['maxJs']) / MIB:.1f}MiB"
    )
    print(
        f"50MB(49MiB): heap={peak50 / MIB:.1f}MiB ms={results['docx-49mb.docx']['ms']} "
        f"jsMax={int(results['docx-49mb.docx']['maxJs']) / MIB:.1f}MiB"
    )


def test_three_35mb_runs_recycle_and_return_to_baseline(server: StaticServer) -> None:
    assert sync_playwright is not None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = _page(server, browser)
        baseline = page.evaluate("window.__letheBridge.heapBytes()")
        peaks: list[int] = []
        idle: list[int] = []
        recycles: list[int] = []
        for _ in range(3):
            outcome = page.evaluate(
                RUN_REDACT, {"name": "docx-36mb.docx", "entities": ENTITIES}
            )
            assert outcome["ok"], outcome
            peaks.append(int(outcome["heapBytes"]))
            recycles.append(int(page.evaluate("window.__letheBridge.stats().recycles")))
            page.wait_for_function(
                "window.__letheBridge && window.__letheBridge.state() === 'ready'"
            )
            idle.append(int(page.evaluate("window.__letheBridge.heapBytes()")))
        browser.close()
    assert recycles == [1, 2, 3], recycles
    assert idle[-1] <= baseline * 1.1 + 32 * MIB, (baseline, idle)
    print(
        f"35MB x3: baseline={baseline / MIB:.1f}MiB peaks={[round(p / MIB, 1) for p in peaks]} "
        f"idle_after_recycle={[round(i / MIB, 1) for i in idle]} recycles={recycles}"
    )
