#!/usr/bin/env python3
"""Run the five fidelity layers against the complete OOXML corpus.

Layer 1: source part set, sha256 and compressed-stream integrity.
Layer 2: C14N structure, with only text-bearing values allowed to differ.
Layer 3: zero leaks and character-exact restore.
Layer 4: LibreOffice render SSIM >= 0.999 and no repair/corruption logs.
Layer 5: the recorded 50 MB time/absolute-RSS matrix is inside its gate.

The only structural exception is an xlsx shared-string split: a token ``<si>``
may be appended and hit cells may point at it, while every original ``<si>``
and every non-hit reference stays unchanged.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from lxml import etree
from PIL import Image

from lethe import core, docx_engine, pptx_engine, xlsx_engine
from lethe.postprocess import repack
from tools.postprocess_contract import (
    assert_unedited_compressed_stream,
    assert_unedited_part_sha256,
)

REPO = Path(__file__).resolve().parent.parent
CORPUS = REPO / "corpus"
EVIDENCE = REPO / "docs" / "p3" / "runtime-50mb.json"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
TEXT_ATTRIBUTES = {
    docx_engine.AUTHOR,
    "author",
    "displayName",
    "name",
}
ENTITIES = [
    core.Entity(canonical="John Smith", type="PERSON"),
    core.Entity(canonical="Alice Chen", type="PERSON"),
]
GATES = {"docx": 2560, "xlsx": 2048, "pptx": 2560}
REPAIR_RE = re.compile(
    r"\b(?:repair(?:ed|ing)?|corrupt(?:ed|ion)?|damaged)\b|source file could not be loaded",
    re.IGNORECASE,
)


class FidelityError(AssertionError):
    """A named fidelity layer failed."""


@dataclass
class Run:
    fmt: str
    path: Path
    source: bytes
    redacted: bytes
    restored: bytes
    items: list[dict[str, object]]

    @property
    def surfaces(self) -> list[str]:
        values: set[str] = set()
        for item in self.items:
            if not item.get("include"):
                continue
            surfaces = item.get("surfaces")
            candidates = [item.get("canonical"), item.get("source")]
            if isinstance(surfaces, list):
                candidates.extend(surfaces)
            for value in candidates:
                if isinstance(value, str) and value:
                    values.add(value)
        return sorted(values)


def _fail(layer: str, path: Path, detail: str) -> None:
    raise FidelityError(f"{layer} {path.relative_to(REPO)}: {detail}")


def _parts(data: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return {
            info.filename: archive.read(info.filename)
            for info in archive.infolist()
            if not info.is_dir()
        }


def _apply_docx(raw: bytes, op: str, token_map: dict[str, str] | None = None):
    if op == "redact":
        plan = docx_engine.redact(raw, ENTITIES)
    else:
        plan = docx_engine.restore(raw, token_map or {})
    return repack(raw, plan.updates), plan


def _run_file(fmt: str, path: Path) -> Run:
    source = path.read_bytes()
    if fmt == "docx":
        redacted, redact_plan = _apply_docx(source, "redact")
        token_map = {
            str(item["token"]): str(item["canonical"])
            for item in redact_plan.items
            if item.get("token")
        }
        restored, _ = _apply_docx(redacted, "restore", token_map)
    else:
        engine = xlsx_engine if fmt == "xlsx" else pptx_engine
        redact_plan = engine.redact(source, ENTITIES)
        if redact_plan.output is None:
            _fail("redact", path, "engine returned no output")
        redacted = redact_plan.output
        token_map = {
            str(item["token"]): str(item["canonical"])
            for item in redact_plan.items
            if item.get("token")
        }
        restore_plan = engine.restore(redacted, token_map)
        if restore_plan.output is None:
            _fail("restore", path, "engine returned no output")
        restored = restore_plan.output
    if redact_plan.hits <= 0:
        _fail("redact", path, "fixture produced no hits")
    return Run(fmt, path, source, redacted, restored, redact_plan.items)


def _part_integrity(run: Run) -> None:
    for label, before, output in (
        ("redact", run.source, run.redacted),
        ("restore", run.redacted, run.restored),
    ):
        source_parts = _parts(before)
        output_parts = _parts(output)
        if set(source_parts) != set(output_parts):
            missing = sorted(set(source_parts) - set(output_parts))
            extra = sorted(set(output_parts) - set(source_parts))
            _fail("L1:parts", run.path, f"{label}: missing={missing} extra={extra}")
        changed = {
            name
            for name in source_parts
            if source_parts[name] != output_parts[name]
        }
        forbidden = sorted(
            name
            for name in changed
            if not name.endswith((".xml", ".rels"))
            or name == "[Content_Types].xml"
            or name.endswith(".rels")
        )
        if forbidden:
            _fail("L1:package", run.path, f"{label}: changed {forbidden[:5]}")
        assert_unedited_part_sha256(before, output, changed)
        assert_unedited_compressed_stream(before, output, changed)
    original_parts = _parts(run.source)
    restored_parts = _parts(run.restored)
    for name in ("[Content_Types].xml", *sorted(n for n in original_parts if n.endswith(".rels"))):
        if original_parts[name] != restored_parts[name]:
            _fail("L1:package", run.path, f"restore: {name} changed")


def _strip_text(root: etree._Element) -> None:
    for node in root.iter():
        if not isinstance(node.tag, str):
            continue
        node.text = None
        node.tail = None
        node.attrib.pop(XML_SPACE, None)
        for attr in TEXT_ATTRIBUTES:
            if attr in node.attrib:
                node.attrib[attr] = ""


def _c14n(root: etree._Element) -> bytes:
    _strip_text(root)
    return etree.tostring(root, method="c14n", with_comments=False)


def _shared_strings_match(source: bytes, output: bytes, path: Path) -> None:
    source_root = etree.fromstring(source, docx_engine.parser())
    output_root = etree.fromstring(output, docx_engine.parser())
    source_si = list(source_root)
    output_si = list(output_root)
    if len(output_si) < len(source_si):
        _fail("L2:c14n", path, "shared-string split removed an <si> entry")
    for index, (before, after) in enumerate(zip(source_si, output_si)):
        if _c14n(before) != _c14n(after):
            _fail("L2:c14n", path, f"shared string {index} changed structure")
    for name in ("count", "uniqueCount"):
        source_root.attrib.pop(name, None)
        output_root.attrib.pop(name, None)
    source_root[:] = []
    output_root[:] = []
    if _c14n(source_root) != _c14n(output_root):
        _fail("L2:c14n", path, "sharedStrings root changed outside count attributes")


def _structural_check(run: Run, output: bytes, label: str) -> None:
    source_parts = _parts(run.source)
    output_parts = _parts(output)
    for name, source in source_parts.items():
        current = output_parts[name]
        if source == current or not name.endswith((".xml", ".rels")):
            continue
        if run.fmt == "xlsx" and name == "xl/sharedStrings.xml":
            _shared_strings_match(source, current, run.path)
            continue
        try:
            source_root = etree.fromstring(source, docx_engine.parser())
            output_root = etree.fromstring(current, docx_engine.parser())
        except etree.XMLSyntaxError as exc:
            _fail("L2:c14n", run.path, f"{label}: {name}: {exc}")
        if _c14n(source_root) != _c14n(output_root):
            _fail("L2:c14n", run.path, f"{label}: {name} changed non-text structure")


def _text_layers(run: Run) -> None:
    engine = {
        "docx": docx_engine,
        "xlsx": xlsx_engine,
        "pptx": pptx_engine,
    }[run.fmt]
    leaks = engine.scan_leaks(run.redacted, run.surfaces)
    if leaks:
        _fail("L3:leak", run.path, ", ".join(leaks[:5]))
    before = engine.extract_all_text_parts(run.source)
    after = engine.extract_all_text_parts(run.restored)
    if before != after:
        changed = sorted(name for name in before.keys() | after.keys() if before.get(name) != after.get(name))
        _fail("L3:restore", run.path, f"text differs in {changed[:5]}")


def _tool(name: str) -> list[str]:
    override = os.environ.get(f"LETHE_{name.upper()}")
    if override:
        return shlex.split(override)
    found = shutil.which(name)
    if not found:
        raise FidelityError(f"L4:render: required host tool {name!r} is missing")
    return [found]


def _natural(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", path.name)]


def _rasterize(pdf: Path, prefix: Path) -> list[Path]:
    pdftoppm = _tool("pdftoppm")
    if pdftoppm:
        subprocess.run(
            [*pdftoppm, "-png", "-r", "96", str(pdf), str(prefix)],
            check=True,
            capture_output=True,
            text=True,
        )
    else:
        gs = _tool("gs")
        subprocess.run(
            [
                *gs,
                "-q",
                "-dNOPAUSE",
                "-dBATCH",
                "-sDEVICE=pnggray",
                "-r96",
                f"-sOutputFile={prefix}-%04d.png",
                str(pdf),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    return sorted(prefix.parent.glob(prefix.name + "-*.png"), key=_natural)


def _docker_render(image: str, render: Path, pairs: list[tuple[Run, Path, Path]]) -> str:
    name = f"lethe-fidelity-{uuid.uuid4().hex[:12]}"
    inputs = [
        path
        for _, source, restored in pairs
        for path in (source, restored)
    ]
    soffice = (
        "soffice --headless --nologo --nodefault --nofirststartwizard "
        "-env:UserInstallation=file:///tmp/lo-profile --convert-to pdf "
        "--outdir /tmp/pdf "
        + " ".join(
            shlex.quote(f"/tmp/{path.parent.name}/{path.name}")
            for path in inputs
        )
    )
    rasterize = (
        "for pdf in /tmp/pdf/*.pdf; do "
        'name=${pdf##*/}; name=${name%.pdf}; '
        'pdftoppm -png -r 96 "$pdf" "/tmp/$name-page"; done'
    )
    script = f"set -eu; mkdir -p /tmp/pdf; {soffice}; {rasterize}"
    if os.environ.get("LETHE_FIDELITY_DEBUG"):
        script = "sha256sum /tmp/source/* /tmp/restored/*; " + script
    try:
        created = subprocess.run(
            [
                "docker",
                "create",
                "--name",
                name,
                "--network",
                "none",
                image,
                "sh",
                "-lc",
                script,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if created.returncode:
            raise FidelityError(f"L4:render: docker create failed: {created.stderr}")
        subprocess.run(
            ["docker", "cp", str(render / "source"), f"{name}:/tmp"],
            check=True,
        )
        subprocess.run(
            ["docker", "cp", str(render / "restored"), f"{name}:/tmp"],
            check=True,
        )
        completed = subprocess.run(
            ["docker", "start", "-a", name],
            check=False,
            capture_output=True,
            text=True,
        )
        logs = completed.stdout + "\n" + completed.stderr
        if completed.returncode:
            raise FidelityError(
                f"L4:render: LibreOffice exited {completed.returncode}: {logs[-1000:]}"
            )
        match = REPAIR_RE.search(logs)
        if match:
            raise FidelityError(
                f"L4:repair: LibreOffice reported {match.group(0)!r}: {logs[-1000:]}"
            )
        subprocess.run(
            ["docker", "cp", f"{name}:/tmp/.", str(render)],
            check=True,
        )
        return logs
    finally:
        subprocess.run(
            ["docker", "rm", "-f", name],
            check=False,
            capture_output=True,
            text=True,
        )


def _ssim(left: Path, right: Path) -> float:
    with Image.open(left) as first, Image.open(right) as second:
        left_image = first.convert("L")
        right_image = second.convert("L")
        if left_image.size != right_image.size:
            raise FidelityError(
                f"L4:ssim: page size {left_image.size} != {right_image.size}"
            )
        if left_image.width > 768:
            size = (
                768,
                max(1, round(left_image.height * 768 / left_image.width)),
            )
            left_image = left_image.resize(size)
            right_image = right_image.resize(size)
        width, height = left_image.size
        left_pixels = list(left_image.tobytes())
        right_pixels = list(right_image.tobytes())
    tile = 16
    columns = math.ceil(width / tile)
    rows = math.ceil(height / tile)
    totals = [[0, 0, 0, 0, 0] for _ in range(rows * columns)]
    for y in range(height):
        row = y // tile
        for x in range(width):
            index = row * columns + x // tile
            a = left_pixels[y * width + x]
            b = right_pixels[y * width + x]
            values = totals[index]
            values[0] += a
            values[1] += b
            values[2] += a * a
            values[3] += b * b
            values[4] += a * b
    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    scores: list[float] = []
    for row in range(rows):
        for column in range(columns):
            count = min(tile, height - row * tile) * min(tile, width - column * tile)
            sa, sb, saa, sbb, sab = totals[row * columns + column]
            mean_a = sa / count
            mean_b = sb / count
            var_a = saa / count - mean_a * mean_a
            var_b = sbb / count - mean_b * mean_b
            covariance = sab / count - mean_a * mean_b
            numerator = (2 * mean_a * mean_b + c1) * (2 * covariance + c2)
            denominator = (mean_a * mean_a + mean_b * mean_b + c1) * (var_a + var_b + c2)
            scores.append(numerator / denominator if denominator else 1.0)
    return sum(scores) / len(scores)


def _libreoffice_ssim(runs: Iterable[Run], root: Path) -> tuple[int, float]:
    render = root / "render"
    source_dir = render / "source"
    restored_dir = render / "restored"
    output_dir = render / "pdf"
    for path in (source_dir, restored_dir, output_dir):
        path.mkdir(parents=True, exist_ok=True)
    pairs: list[tuple[Run, Path, Path]] = []
    inputs: list[str] = []
    suffix = {"docx": ".docx", "xlsx": ".xlsx", "pptx": ".pptx"}
    for index, run in enumerate(runs):
        source = source_dir / f"{index:03d}-source{suffix[run.fmt]}"
        restored = restored_dir / f"{index:03d}-restored{suffix[run.fmt]}"
        source.write_bytes(run.source)
        restored.write_bytes(run.restored)
        pairs.append((run, source, restored))
        inputs.extend((str(source), str(restored)))
    image = os.environ.get("LETHE_FIDELITY_DOCKER_IMAGE")
    if image:
        docker_logs = _docker_render(image, render, pairs)
        if os.environ.get("LETHE_FIDELITY_DEBUG"):
            print(docker_logs)
        completed = None
    else:
        soffice = _tool("soffice")
        command = [
            *soffice,
            "--headless",
            "--nologo",
            "--nodefault",
            "--nofirststartwizard",
            f"-env:UserInstallation={(render / 'lo-profile').as_uri()}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(output_dir),
            *inputs,
        ]
        completed = subprocess.run(
            command, cwd=REPO, check=False, capture_output=True, text=True
        )
    if completed is not None:
        logs = completed.stdout + "\n" + completed.stderr
        if completed.returncode:
            raise FidelityError(
                f"L4:render: LibreOffice exited {completed.returncode}: {logs[-1000:]}"
            )
        match = REPAIR_RE.search(logs)
        if match:
            raise FidelityError(
                f"L4:repair: LibreOffice reported {match.group(0)!r}: {logs[-1000:]}"
            )
    minimum = 1.0
    pages = 0
    if not image:
        for _, source, restored in pairs:
            _rasterize(output_dir / f"{source.stem}.pdf", render / f"{source.stem}-page")
            _rasterize(
                output_dir / f"{restored.stem}.pdf", render / f"{restored.stem}-page"
            )
    for run, source, restored in pairs:
        source_pages = sorted(
            render.glob(f"{source.stem}-page-*.png"), key=_natural
        )
        restored_pages = sorted(
            render.glob(f"{restored.stem}-page-*.png"), key=_natural
        )
        if not source_pages or len(source_pages) != len(restored_pages):
            _fail(
                "L4:render",
                run.path,
                f"page count {len(source_pages)} != {len(restored_pages)}",
            )
        for first, second in zip(source_pages, restored_pages):
            score = _ssim(first, second)
            minimum = min(minimum, score)
            pages += 1
            if score < 0.999:
                _fail("L4:ssim", run.path, f"{first.name}: {score:.6f} < 0.999")
    return pages, minimum


def _evidence() -> None:
    if not EVIDENCE.exists():
        raise FidelityError(f"L5:runtime: {EVIDENCE.relative_to(REPO)} is missing")
    data = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    for fmt, limit in GATES.items():
        row = data.get("formats", {}).get(fmt)
        if not row:
            raise FidelityError(f"L5:runtime: {fmt} evidence is missing")
        peak = float(row["peakRssMB"])
        elapsed = int(row["redactMs"])
        if peak > limit:
            raise FidelityError(f"L5:runtime: {fmt} peak {peak} MB > {limit} MB")
        if elapsed <= 0:
            raise FidelityError(f"L5:runtime: {fmt} redact time is not positive")


def _rows() -> list[tuple[str, Path]]:
    manifest = CORPUS / "manifest.csv"
    with manifest.open(newline="", encoding="utf-8") as handle:
        return [(row["format"], REPO / row["path"]) for row in csv.DictReader(handle)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="debug: run only N files")
    parser.add_argument("--skip-render", action="store_true", help="debug: skip LibreOffice")
    args = parser.parse_args(argv)
    rows = _rows()
    if args.limit:
        rows = rows[: args.limit]
    runs: list[Run] = []
    for fmt, path in rows:
        run = _run_file(fmt, path)
        _part_integrity(run)
        _structural_check(run, run.redacted, "redact")
        _structural_check(run, run.restored, "restore")
        _text_layers(run)
        runs.append(run)
    _evidence()
    if args.skip_render:
        print(f"fidelity: {len(runs)} files; L1-L3/L5 OK; L4 skipped for debug")
        return 0
    with tempfile.TemporaryDirectory(prefix=".fidelity-", dir=REPO) as temp:
        pages, minimum = _libreoffice_ssim(runs, Path(temp))
    print(
        f"fidelity: {len(runs)} files; L1-L3/L5 OK; "
        f"LibreOffice {pages} pages, minimum SSIM {minimum:.6f}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FidelityError, subprocess.CalledProcessError) as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1) from exc
