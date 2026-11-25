"""Cutover guard: deleted v1 surfaces stay deleted."""

from __future__ import annotations

from tools import cutover_guard


def test_active_surfaces_have_no_removed_v1_paths() -> None:
    assert cutover_guard.scan() == []
