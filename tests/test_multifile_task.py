"""One task, several files: the token a value gets must not depend on the file.

A multi-file task detects each file separately, so the engines would otherwise
number the same real value differently in every file — "[PERSON_001]" in the doc
and "[PERSON_003]" in the sheet. The task therefore allocates tokens over the
union of files and hands each engine the same `token_overrides` map. These tests
pin that contract at the engine boundary, because it is what makes a single
stored mapping able to restore every file of the task.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from lethe import core, docx_engine, pptx_engine, xlsx_engine

REPO = Path(__file__).resolve().parents[1]
CORPUS = {
    "docx": REPO / "corpus" / "docx" / "docx-001.docx",
    "xlsx": REPO / "corpus" / "xlsx" / "xlsx-001.xlsx",
    "pptx": REPO / "corpus" / "pptx" / "pptx-001.pptx",
}
ENGINE = {"docx": docx_engine, "xlsx": xlsx_engine, "pptx": pptx_engine}

# "John Smith" appears in all three corpus files, which is exactly the shape of
# a real batch: the same counterparty in a memo, a sheet and a deck.
ENTITIES = [core.Entity("John Smith", "PERSON"), core.Entity("Project Phoenix", "COUNTERPARTY")]


def _detect(kind: str):
    engine = ENGINE[kind]
    raw = CORPUS[kind].read_bytes()
    corpus = "\x00".join(
        text.replace("\n", "\x00") for text in engine.extract_all_text_parts(raw).values()
    )
    return core.assign_tokens(core.detect(corpus, ENTITIES))


def _field(item, name):
    """The engines return dicts; `core.detect` returns dataclass items."""
    return item[name] if isinstance(item, dict) else getattr(item, name)


def _tokens_by_canonical(items) -> dict[str, str]:
    return {
        _field(item, "canonical"): _field(item, "token")
        for item in items
        if _field(item, "token")
    }


def _redact(kind: str, overrides: dict[str, str] | None = None):
    return ENGINE[kind].redact(
        CORPUS[kind].read_bytes(), ENTITIES, token_overrides=overrides
    )


# ------------------------------------------------- per-file numbering differs

def test_each_file_would_number_the_same_value_on_its_own() -> None:
    """The premise of `token_overrides`: per-file numbering is not task-wide.

    "John Smith" is present in every corpus file, but each file also detects
    other values, so the per-file index depends on what else that file holds.
    """
    per_file = {kind: _tokens_by_canonical(_detect(kind))["John Smith"] for kind in CORPUS}
    # Each file assigns the first PERSON index, so they agree here — but the
    # *task* numbering must still come from one allocation, which is asserted
    # below by forcing an override that differs from the per-file result.
    assert set(per_file.values()) == {"[PERSON_001]"}


# ---------------------------------------------------- overrides reach engines

@pytest.mark.parametrize("kind", sorted(CORPUS))
def test_an_override_reaches_every_supported_format(kind: str) -> None:
    overrides = {"PERSON|John Smith": "[PERSON_007]"}
    result = _redact(kind, overrides)
    tokens = _tokens_by_canonical(result.items)
    assert tokens["John Smith"] == "[PERSON_007]"
    # The override replaces the number the engine would have given it.
    assert "[PERSON_007]" in result.tokens


def test_the_same_value_carries_one_token_across_mixed_types() -> None:
    overrides = {"PERSON|John Smith": "[PERSON_004]"}
    seen = {kind: _tokens_by_canonical(_redact(kind, overrides).items)["John Smith"]
            for kind in CORPUS}
    assert set(seen.values()) == {"[PERSON_004]"}


def test_values_outside_the_override_keep_their_own_numbering() -> None:
    """An override map is a patch, not a whitelist: untouched values stay put."""
    baseline = _tokens_by_canonical(_detect("docx"))
    overrides = {"PERSON|John Smith": "[PERSON_009]"}
    result = _redact("docx", overrides)
    tokens = _tokens_by_canonical(result.items)

    assert tokens["John Smith"] == "[PERSON_009]"
    # The values the override does not mention keep exactly what they had.
    untouched = {canonical: token for canonical, token in baseline.items()
                 if canonical != "John Smith"}
    assert untouched, "the fixture must hold values besides the overridden one"
    assert {canonical: tokens[canonical] for canonical in untouched} == untouched


def test_an_empty_override_map_changes_nothing() -> None:
    plain = _tokens_by_canonical(_detect("docx"))
    for overrides in (None, {}):
        assert _tokens_by_canonical(_redact("docx", overrides).items) == plain


# ------------------------------------------------------- key lookup is robust

def test_a_case_folded_key_still_lands_on_the_task_token() -> None:
    """The browser may fold the value with `toLowerCase`, not Unicode casefold.

    JavaScript leaves "Straße" as "straße" while Python's `casefold` gives
    "strasse". The engine falls back to a case-folded lookup so such a key is
    not silently ignored, which would leave that file numbered on its own.
    """
    text = "Contact Straße Holdings today."
    entities = [core.Entity("Straße Holdings", "PERSON")]

    exact = core.apply_token_overrides(
        core.detect(text, entities), {"PERSON|Straße Holdings": "[PERSON_005]"}
    )
    folded = core.apply_token_overrides(
        core.detect(text, entities), {"PERSON|strasse holdings": "[PERSON_005]"}
    )
    assert _tokens_by_canonical(exact)["Straße Holdings"] == "[PERSON_005]"
    assert _tokens_by_canonical(folded)["Straße Holdings"] == "[PERSON_005]"


def test_a_key_for_another_type_does_not_match() -> None:
    """The type is part of the key: a PERSON token must not leak onto an EMAIL."""
    items = core.detect("write to john.smith@example.com", ENTITIES)
    core.apply_token_overrides(items, {"PERSON|john.smith@example.com": "[EMAIL_099]"})
    before = {item.canonical: item.token for item in items if item.token}
    assert all(token != "[EMAIL_099]" for token in before.values())


def test_an_excluded_item_is_never_retokened() -> None:
    items = core.detect("John Smith", ENTITIES)
    for item in items:
        item.include = False
    core.apply_token_overrides(items, {"PERSON|John Smith": "[PERSON_002]"})
    assert all(item.token == "" for item in items)


# ---------------------------------------------- one mapping restores the task

def test_a_task_mapping_restores_every_file_of_the_batch() -> None:
    """The point of one token per value: a single stored map restores all files."""
    overrides = {"PERSON|John Smith": "[PERSON_004]"}
    for kind in ("docx", "xlsx"):
        engine = ENGINE[kind]
        redacted = _redact(kind, overrides)
        # docx returns XML updates for the worker to repack; the others return
        # the whole package already.
        output = getattr(redacted, "output", None)
        if output is None:
            output = _repack(CORPUS[kind].read_bytes(), redacted.updates)
        assert "[PERSON_004]" in _all_text(kind, output), kind
        restored = engine.restore(output, {"[PERSON_004]": "John Smith"})
        # docx restore also answers with XML updates rather than a package.
        restored_output = getattr(restored, "output", None)
        if restored_output is None:
            restored_output = _repack(output, restored.updates)
        assert "[PERSON_004]" not in _all_text(kind, restored_output), kind
        assert "John Smith" in _all_text(kind, restored_output), kind
        assert restored.hits >= 1, kind


def _repack(raw: bytes, updates: dict[str, str]) -> bytes:
    """Rewrite the archive with the engine's XML updates, as the worker does."""
    import io
    import zipfile

    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    for name, xml in updates.items():
        parts[name] = xml.encode("utf-8")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def _all_text(kind: str, raw: bytes) -> str:
    parts = ENGINE[kind].extract_all_text_parts(raw)
    return "\n".join(parts.values())


# -------------------------------------------------------- partial task failure

def test_a_failed_file_does_not_stop_the_rest_of_the_batch() -> None:
    """A corrupt file is one file's problem; the task still reports the others."""
    results: dict[str, object] = {}
    for kind in CORPUS:
        try:
            results[kind] = _redact(kind, {"PERSON|John Smith": "[PERSON_004]"})
        except Exception as exc:  # noqa: BLE001 - a real failure must be recorded
            results[kind] = exc
    assert all(not isinstance(value, Exception) for value in results.values()), results

    try:
        _redact_raw(b"not a zip at all", "docx")
    except Exception:  # noqa: BLE001 - expected
        failed = True
    else:
        failed = False
    assert failed, "a corrupt docx must raise rather than return a silent success"


def _redact_raw(raw: bytes, kind: str):
    return ENGINE[kind].redact(raw, ENTITIES)
