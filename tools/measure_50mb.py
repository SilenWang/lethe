#!/usr/bin/env python3
"""Measure the merged three-format 50 MB path in the real browser worker.

The output is absolute process-tree RSS, sampled every 100 ms.  It is the
evidence consumed by ``tools/fidelity_regression.py``; no memory gate is
weakened here.
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import io
import json
import os
import random
import string
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches

REPO = Path(__file__).resolve().parent.parent
MIB = 1024 * 1024
ROWS = 250_000
_libatomic = Path(sys.prefix) / "lib" / "libatomic.so.1"
if _libatomic.exists():
    os.environ["LD_LIBRARY_PATH"] = (
        f"{_libatomic.parent}:" + os.environ.get("LD_LIBRARY_PATH", "")
    ).rstrip(":")
ENTITIES = [
    {"canonical": "John Smith", "type": "PERSON", "aliases": []},
    {"canonical": "Alice Chen", "type": "PERSON", "aliases": []},
]

RUN = """async ({name, entities}) => {
  const bridge = window.p1.bridge;
  const buf = await (await fetch(`/samples/${name}`)).arrayBuffer();
  const inputBytes = buf.byteLength;
  const digest = async (u8) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", u8))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  let maxHeap = 0;
  const track = (progress) => { maxHeap = Math.max(maxHeap, progress.heapBytes || 0); };
  try {
    const inputSha256 = await digest(new Uint8Array(buf));
    const started = performance.now();
    const red = await bridge.run({
      op: "redact", bytes: new Uint8Array(buf), fileName: name,
      options: {entities}, onProgress: track,
    });
    const redactMs = Math.round(performance.now() - started);
    const tokenMap = Object.fromEntries(
      red.items.filter((item) => item.token).map((item) => [item.token, item.canonical]),
    );
    const restoreStarted = performance.now();
    const restored = await bridge.run({
      op: "restore", bytes: red.bytes, fileName: name,
      options: {token_map: tokenMap}, onProgress: track,
    });
    return {
      ok: true,
      inputBytes,
      inputSha256,
      redactMs,
      restoreMs: Math.round(performance.now() - restoreStarted),
      redactHits: red.hits,
      restoreHits: restored.hits,
      maxPyodideHeapMB: Math.round(maxHeap / 1048576 * 10) / 10,
    };
  } catch (error) {
    return {ok: false, code: error.code, message: error.message, detail: error.detail};
  }
}"""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(MIB), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _padded_docx(path: Path) -> None:
    source = (REPO / "corpus" / "docx" / "docx-001.docx").read_bytes()
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        parts = [(item.filename, archive.read(item.filename)) for item in archive.infolist()]
    content_types = dict(parts)["[Content_Types].xml"]
    if b'Extension="bin"' not in content_types:
        content_types = content_types.replace(
            b"</Types>",
            b'<Default Extension="bin" ContentType="application/octet-stream"/></Types>',
        )
    parts = [
        (name, content_types if name == "[Content_Types].xml" else data)
        for name, data in parts
    ]
    parts.append(("word/media/pad.bin", os.urandom(49 * MIB)))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as archive:
        for name, data in parts:
            archive.writestr(name, data)


def _xlsx(path: Path) -> None:
    randomizer = random.Random(20261123)
    alphabet = string.ascii_letters + string.digits
    strings = [
        "John Smith case "
        f"{index:06d} "
        + "".join(randomizer.choice(alphabet) for _ in range(90))
        for index in range(ROWS)
    ]
    sst = "".join(f"<si><t>{value}</t></si>" for value in strings)
    shared = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        f'count="{ROWS}" uniqueCount="{ROWS}">{sst}</sst>'
    ).encode()
    rows = "".join(
        f'<row r="{index + 1}"><c r="A{index + 1}" t="s"><v>{index}</v></c>'
        f'<c r="B{index + 1}"><v>{index}</v></c>'
        f'<c r="C{index + 1}" t="inlineStr"><is><t>Row {index:06d}</t></is></c></row>'
        for index in range(ROWS)
    )
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<dimension ref="A1:C{ROWS}"/><sheetData>{rows}</sheetData></worksheet>'
    ).encode()
    parts = {
        "[Content_Types].xml": (
            b'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            b'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            b'<Default Extension="xml" ContentType="application/xml"/>'
            b'<Default Extension="bin" ContentType="application/octet-stream"/>'
            b'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            b'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            b'<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            b'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            b"</Types>"
        ),
        "_rels/.rels": (
            b'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            b'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            b"</Relationships>"
        ),
        "xl/workbook.xml": (
            b'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            b'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            b'<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            b'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            b'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            b'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            b"</Relationships>"
        ),
        "xl/worksheets/sheet1.xml": sheet,
        "xl/sharedStrings.xml": shared,
        "xl/media/blob.bin": os.urandom(28 * MIB),
        "docProps/core.xml": (
            b'<?xml version="1.0"?><cp:coreProperties '
            b'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            b'xmlns:dc="http://purl.org/dc/elements/1.1/">'
            b"<dc:creator>John Smith</dc:creator></cp:coreProperties>"
        ),
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)


def _pptx(path: Path) -> None:
    presentation = Presentation()
    blank = presentation.slide_layouts[6]
    for slide_index in range(5):
        slide = presentation.slides.add_slide(blank)
        box = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(9), Inches(6))
        frame = box.text_frame
        frame.text = "John Smith 000"
        for index in range(1, 100):
            frame.add_paragraph().text = f"John Smith {index:03d} slide {slide_index:03d}"
        slide.notes_slide.notes_text_frame.text = f"John Smith notes {slide_index:03d}"
    presentation.core_properties.creator = "John Smith"
    presentation.core_properties.last_modified_by = "Alice Chen"
    buffer = io.BytesIO()
    presentation.save(buffer)
    with zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    parts["ppt/media/blob.bin"] = os.urandom(49 * MIB)
    content_types = parts["[Content_Types].xml"].decode()
    if 'Extension="bin"' not in content_types:
        content_types = content_types.replace(
            "</Types>",
            '<Default Extension="bin" ContentType="application/octet-stream"/></Types>',
        )
        parts["[Content_Types].xml"] = content_types.encode()
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)


def _ppid(pid: int) -> int:
    try:
        return int(Path(f"/proc/{pid}/stat").read_text().split()[3])
    except (OSError, IndexError, ValueError):
        return 0


def _rss_kb(pid: int) -> int:
    try:
        for line in Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    except OSError:
        pass
    return 0


def _descendants(root: int) -> list[int]:
    children: dict[int, list[int]] = {}
    for entry in Path("/proc").iterdir():
        if entry.name.isdigit():
            children.setdefault(_ppid(int(entry.name)), []).append(int(entry.name))
    result: list[int] = []
    stack = [root]
    while stack:
        pid = stack.pop()
        result.append(pid)
        stack.extend(children.get(pid, []))
    return result


def _browser_pid() -> int | None:
    candidates: list[tuple[float, int]] = []
    own_processes = set(_descendants(os.getpid()))
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        if pid not in own_processes:
            continue
        try:
            command = entry.joinpath("cmdline").read_bytes().replace(b"\0", b" ").decode()
            started = entry.stat().st_mtime
        except OSError:
            continue
        if (
            "chrom" in command
            and "--remote-debugging-pipe" in command
            and "--type=" not in command
        ):
            candidates.append((started, pid))
    return max(candidates)[1] if candidates else None


def _measure(browser, base_url: str, sample: Path, name: str) -> dict[str, object]:
    page = browser.new_page()
    page.set_default_timeout(600_000)
    page.goto(f"{base_url}/p1/harness.html")
    page.wait_for_function("window.p1 && window.p1.state === 'ready'", timeout=300_000)
    pid = _browser_pid()
    if pid is None:
        raise RuntimeError("cannot locate the Chromium process")
    baseline = sum(_rss_kb(child) for child in _descendants(pid)) / 1024
    peak = {"rss": baseline}
    stop = threading.Event()

    def sample_rss() -> None:
        while not stop.is_set():
            total = sum(_rss_kb(child) for child in _descendants(pid)) / 1024
            peak["rss"] = max(peak["rss"], total)
            time.sleep(0.1)

    thread = threading.Thread(target=sample_rss, daemon=True)
    thread.start()
    try:
        result = page.evaluate(RUN, {"name": name, "entities": ENTITIES})
    finally:
        stop.set()
        thread.join(timeout=2)
        page.close()
    if not result.get("ok"):
        raise RuntimeError(f"{name}: {result}")
    result.update(
        {
            "fixtureBytes": sample.stat().st_size,
            "fixtureSha256": _sha256(sample),
            "baselineRssMB": round(baseline, 1),
            "peakRssMB": round(peak["rss"], 1),
            "deltaRssMB": round(peak["rss"] - baseline, 1),
        }
    )
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=REPO / "docs" / "p3" / "runtime-50mb.json")
    args = parser.parse_args(argv)
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

    from playwright.sync_api import sync_playwright

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args: object) -> None:
            pass

    class Server(ThreadingHTTPServer):
        def handle_error(self, _request: object, _client_address: object) -> None:
            pass

    with tempfile.TemporaryDirectory(prefix="lethe-50mb-") as temp_name:
        temp = Path(temp_name)
        web = temp / "web"
        subprocess.run(
            [sys.executable, str(REPO / "tools" / "build_web.py"), "--out", str(web)],
            check=True,
            cwd=REPO,
        )
        samples = web / "samples"
        samples.mkdir()
        _padded_docx(samples / "docx-50mb.docx")
        _xlsx(samples / "xlsx-50mb.xlsx")
        _pptx(samples / "pptx-50mb.pptx")
        handler = functools.partial(Handler, directory=str(web))
        server = Server(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    args=["--js-flags=--max-old-space-size=4096"]
                )
                formats: dict[str, object] = {}
                try:
                    for name, fmt in (
                        ("docx-50mb.docx", "docx"),
                        ("xlsx-50mb.xlsx", "xlsx"),
                        ("pptx-50mb.pptx", "pptx"),
                    ):
                        formats[fmt] = _measure(
                            browser, base_url, samples / name, name
                        )
                finally:
                    browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
    output = {
        "measurement": "Chromium headless, real worker, process-tree VmRSS sampled every 100 ms",
        "gateMiB": {"docx": 2560, "xlsx": 2048, "pptx": 2560},
        "formats": formats,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
