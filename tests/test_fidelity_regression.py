"""Static and deterministic checks for the final P3 fidelity gate."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from tools.fidelity_regression import GATES, _ssim

REPO = Path(__file__).resolve().parents[1]


def test_identical_raster_pages_have_full_ssim(tmp_path: Path) -> None:
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"
    Image.new("RGB", (64, 48), (240, 240, 240)).save(first)
    Image.new("RGB", (64, 48), (240, 240, 240)).save(second)
    assert _ssim(first, second) == 1.0


def test_runtime_memory_matrix_stays_inside_the_unchanged_gates() -> None:
    evidence = json.loads(
        (REPO / "docs" / "p3" / "runtime-50mb.json").read_text(encoding="utf-8")
    )
    assert evidence["gateMiB"] == GATES
    for fmt, limit in GATES.items():
        row = evidence["formats"][fmt]
        assert row["fixtureBytes"] <= 50 * 1024 * 1024
        assert row["peakRssMB"] <= limit
        assert row["redactMs"] > 0


def test_unused_betteroffice_pptx_bundle_is_gone() -> None:
    vendor = REPO / "web" / "assets" / "vendor"
    manifest = json.loads((vendor / "manifest.json").read_text(encoding="utf-8"))
    assert not (vendor / "betteroffice" / "pptx").exists()
    assert "pptx" not in manifest["sources"]["betteroffice"]
    assert not any(
        str(row["path"]).startswith("betteroffice/pptx/")
        for row in manifest["files"]
    )


def test_release_bumped_cache_and_activation_drops_old_entries() -> None:
    source = (REPO / "web" / "sw.js").read_text(encoding="utf-8")
    assert "var CACHE_VERSION = '6';" in source
    assert "key.indexOf('lethe-') === 0" in source
    assert "caches.delete(key)" in source
