"""Cutover guard: deleted v1 surfaces stay deleted."""

from __future__ import annotations

from pathlib import Path

import tomllib

from tools import cutover_guard

REPO = Path(__file__).resolve().parents[1]


def test_active_surfaces_have_no_removed_v1_paths() -> None:
    assert cutover_guard.scan() == []


def test_release_build_copies_browser_migration() -> None:
    source = (REPO / "tools" / "build_web.py").read_text(encoding="utf-8")
    assert '"migration.js"' in source
    shell = (REPO / "web" / "sw.js").read_text(encoding="utf-8")
    assert "'/migration.js'" in shell


def test_corpus_and_measurement_tools_keep_dev_dependencies() -> None:
    project = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
    dev = set(project["project"]["optional-dependencies"]["dev"])
    assert {"openpyxl", "python-docx", "python-pptx"} <= dev


def test_manual_release_uses_the_selected_tag() -> None:
    workflow = (REPO / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
    assert "RELEASE_TAG: ${{ inputs.tag || github.ref_name }}" in workflow
    assert "ref: ${{ env.RELEASE_TAG }}" in workflow
    assert 'gh release create "$RELEASE_TAG"' in workflow
