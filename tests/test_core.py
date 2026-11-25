"""Deterministic detection, tokenisation, restore and legacy-vault codec."""

from __future__ import annotations

from lethe import (
    Entity,
    assign_tokens,
    build_replacer,
    build_restorer,
    detect,
    vault,
)


def _redact(text, entities, **kwargs):
    items = assign_tokens(detect(text, entities, **kwargs))
    replacer, token_map = build_replacer(items)
    output, _ = replacer(text)
    return output, items, token_map


def test_overlapping_aliases():
    entities = [Entity("Acme Capital Partners", "COUNTERPARTY", ["Acme", "ACP"])]
    text = "Acme Capital Partners (Acme, ACP) closed the deal; Acme led."
    output, items, _ = _redact(text, entities, enable_suggestions=False)
    assert "Acme" not in output and "ACP" not in output
    assert output.count("[COUNTERPARTY_001]") == 4
    assert len(items) == 1


def test_email_name_overlap():
    entities = [Entity("Acme", "COUNTERPARTY", [])]
    output, _, _ = _redact("Acme at info@acme.com today", entities)
    assert "[COUNTERPARTY_001]" in output
    assert "[EMAIL_001]" in output
    assert "acme.com" not in output and "@" not in output


def test_cjk_substring_match():
    entities = [Entity("李伟", "PERSON", []), Entity("明德资本", "COUNTERPARTY", [])]
    output, _, _ = _redact("客户是李伟先生，代表明德资本出席。", entities, enable_suggestions=False)
    assert "李伟" not in output and "明德资本" not in output
    assert "[PERSON_001]" in output and "[COUNTERPARTY_001]" in output


def test_stable_tokens_and_custom_type():
    entities = [
        Entity("John Smith", "PERSON", []),
        Entity("Acme", "COUNTERPARTY", []),
        Entity("Project Atlas", "PROJECT", []),
    ]
    output, _, _ = _redact(
        "John Smith met John Smith from Acme about Project Atlas.",
        entities,
        enable_suggestions=False,
    )
    assert output.count("[PERSON_001]") == 2
    assert "[COUNTERPARTY_001]" in output
    assert "[PROJECT_001]" in output
    assert "Project Atlas" not in output


def test_restore_is_exact():
    restore = build_restorer({"[PERSON_001]": "John Smith"})
    output, count = restore("Summary by [PERSON_001] and again [PERSON_001].")
    assert count == 2 and output.count("John Smith") == 2
    changed, changed_count = restore("Summary by [PERSON 001] / [person_001].")
    assert changed_count == 0 and "John Smith" not in changed


def test_vault_codec_roundtrip_and_wrong_passphrase():
    mapping = {"[PERSON_001]": "John Smith", "[COUNTERPARTY_001]": "Acme Capital Partners"}
    record = vault.encrypt_record(
        "test-job-0001",
        mapping,
        "correct horse",
        meta={"source_file": "x", "replacements": 2},
    )
    assert vault.decrypt_record(record, "correct horse")["mapping"] == mapping
    try:
        vault.decrypt_record(record, "wrong passphrase")
    except ValueError:
        pass
    else:
        raise AssertionError("wrong passphrase must not decrypt the job")
