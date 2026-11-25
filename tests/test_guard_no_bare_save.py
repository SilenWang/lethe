"""The P0 naked-save guard must be red on purpose and green on the repo.

The guard job runs this file plus
``python tools/guard_no_bare_save.py --paths lethe web``.  These tests prove the
deliberately bad fixtures fail with a message that names the job, file, line and
the offending API (``save(`` vs ``toBytes()``), and that the real product paths
are clean.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from tools import guard_no_bare_save as guard

FIXTURES = REPO / "tools" / "guard_fixtures"


def _scan(paths: list[str], **kwargs) -> list[guard.Violation]:
    return guard.scan(paths, REPO, **kwargs)


def test_violation_save_reports_job_file_line_and_api() -> None:
    violations = _scan(["tools/guard_fixtures/violation_save.py"])
    assert len(violations) == 1, [v.render() for v in violations]
    v = violations[0]
    assert v.rule == guard.RULE_SAVE
    assert v.api == "save("
    assert v.line == 8
    rendered = v.render()
    assert "job=guard" in rendered
    assert "file=tools/guard_fixtures/violation_save.py line=8" in rendered
    assert "api='save('" in rendered
    assert "postprocess()" in rendered


def test_violation_tobytes_reports_tobytes_api() -> None:
    violations = _scan(["tools/guard_fixtures/violation_tobytes.js"])
    assert len(violations) == 1, [v.render() for v in violations]
    v = violations[0]
    assert v.rule == guard.RULE_TOBYTES
    assert v.api == "toBytes()"
    assert v.line == 3
    assert "job=guard" in v.render()
    assert "file=tools/guard_fixtures/violation_tobytes.js line=3" in v.render()


def test_clean_postprocess_fixture_passes() -> None:
    assert _scan(["tools/guard_fixtures/clean_postprocess.py"]) == []


def test_reviewed_pragma_is_the_only_exemption() -> None:
    assert _scan(["tools/guard_fixtures/pragma_save.py"]) == []


def test_cli_exits_nonzero_and_names_the_gate() -> None:
    proc = subprocess.run(
        [
            sys.executable,
            str(REPO / "tools" / "guard_no_bare_save.py"),
            "--paths",
            "tools/guard_fixtures/violation_save.py",
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 1, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "P0-GUARD-SAVE" in combined
    assert "job=guard" in combined
    assert "violation_save.py:8" in combined
    assert "api='save('" in combined


def test_repo_product_paths_are_clean() -> None:
    violations = _scan(["web", "lethe"])
    assert violations == [], "\n".join(v.render() for v in violations)


def test_scan_ignores_tests_and_vendor_bundles() -> None:
    assert _scan(["tests"]) == []
    assert _scan(["web/assets/vendor"]) == []
