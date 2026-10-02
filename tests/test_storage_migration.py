"""Client-side storage migration: the pure dictionary logic that mirrors the
browser store, and the one-time legacy DATA_DIR export/archive path.

The browser side itself (IndexedDB + WebCrypto) is exercised by the Playwright
suite in tests/browser/ — this file covers everything that can run in Python.
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lethe import Entity, entities_to_dicts, merge_entities, rows_to_entities, store, vault


# ---- dictionary rows <-> Entity objects -------------------------------------
def test_rows_to_entities_and_back():
    rows = [
        {"canonical": "Acme Capital Partners", "type": "COUNTERPARTY",
         "aliases": ["Acme", "ACP"]},
        {"canonical": "  John Smith  ", "type": "PERSON", "aliases": "Smith, Mr Smith"},
        {"canonical": "", "type": "PERSON", "aliases": []},            # dropped
        {"canonical": "Acme capital partners", "type": "PERSON"},      # duplicate
    ]
    ents = rows_to_entities(rows)
    assert [e.canonical for e in ents] == ["Acme Capital Partners", "John Smith"]
    assert ents[1].aliases == ["Smith", "Mr Smith"]
    assert entities_to_dicts(ents)[0] == {
        "canonical": "Acme Capital Partners", "type": "COUNTERPARTY",
        "aliases": ["Acme", "ACP"]}


def test_merge_entities_dedups_and_merges_aliases():
    ents = [Entity("Acme", "COUNTERPARTY", ["ACP"])]
    added = merge_entities(ents, [
        Entity("acme", "COUNTERPARTY", ["Acme Capital Partners"]),   # existing
        Entity("John Smith", "PERSON", ["Smith"]),                   # new
        Entity("", "PERSON", []),                                    # ignored
    ])
    assert added == 1
    assert len(ents) == 2
    assert ents[0].aliases == ["ACP", "Acme Capital Partners"]


# ---- legacy DATA_DIR export --------------------------------------------------
def _make_legacy_dir(tmp: str, passphrase: str = "old-pw") -> str:
    with open(os.path.join(tmp, "entities.json"), "w", encoding="utf-8") as fh:
        json.dump([{"canonical": "Acme", "type": "COUNTERPARTY", "aliases": ["ACP"]}], fh)
    with open(os.path.join(tmp, "token_types.json"), "w", encoding="utf-8") as fh:
        json.dump(["PROJECT"], fh)
    vault_dir = os.path.join(tmp, "vault")
    os.makedirs(vault_dir, exist_ok=True)
    mapping = {"[PERSON_001]": "John Smith"}
    record = vault.encrypt_record("20260101-000000-abcd", mapping, passphrase,
                                  meta={"source_file": "memo.docx", "replacements": 3})
    with open(os.path.join(vault_dir, "20260101-000000-abcd.vault.json"), "w", encoding="utf-8") as fh:
        json.dump(record, fh)
    with open(os.path.join(vault_dir, "index.json"), "w", encoding="utf-8") as fh:
        json.dump([{"job_id": "20260101-000000-abcd", "created": "2026-01-01T00:00:00Z",
                    "source_file": "memo.docx", "replacements": 3}], fh)
    os.makedirs(os.path.join(tmp, "tessdata"), exist_ok=True)   # program resource
    return tmp


def test_legacy_export_decrypts_jobs():
    with tempfile.TemporaryDirectory() as tmp:
        _make_legacy_dir(tmp)
        assert store.legacy_user_data_present(tmp)
        assert [e.canonical for e in store.legacy_load_entities(tmp)] == ["Acme"]
        assert store.legacy_load_token_types(tmp) == ["PROJECT"]
        jobs, errors = vault.legacy_export(tmp, "old-pw")
        assert errors == []
        assert jobs[0]["job_id"] == "20260101-000000-abcd"
        assert jobs[0]["mapping"] == {"[PERSON_001]": "John Smith"}
        assert jobs[0]["source_files"] == ["memo.docx"]


def test_legacy_export_reports_wrong_passphrase_per_job():
    with tempfile.TemporaryDirectory() as tmp:
        _make_legacy_dir(tmp)
        jobs, errors = vault.legacy_export(tmp, "not-the-pw")
        assert jobs == []
        assert len(errors) == 1 and errors[0]["job_id"] == "20260101-000000-abcd"


def test_legacy_archive_moves_only_user_data():
    with tempfile.TemporaryDirectory() as tmp:
        _make_legacy_dir(tmp)
        archive = vault.legacy_archive(tmp, timestamp="20260101-000000")
        assert archive and os.path.isdir(archive)
        # user data moved out of the live data dir ...
        assert not store.legacy_user_data_present(tmp)
        assert os.path.exists(os.path.join(archive, "entities.json"))
        assert os.path.exists(os.path.join(archive, "vault", "index.json"))
        assert os.path.exists(os.path.join(archive, "migrated.flag"))
        # ... program resources (OCR models) untouched
        assert os.path.isdir(os.path.join(tmp, "tessdata"))
        # archiving is idempotent / safe when there is nothing left to move
        assert vault.legacy_archive(tmp, timestamp="20260101-000001") is None
