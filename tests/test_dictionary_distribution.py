"""Preset dictionary pack: deterministic build, limits and signature checks."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest
import yaml
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from tools import build_dictionary

REPO = Path(__file__).resolve().parents[1]

SOURCE_ROWS = [
    {
        "aliases": ["ALPHA"],
        "canonical": "Alpha Holdings",
        "shard": "counterparties",
        "tier": "core",
        "type": "COUNTERPARTY",
    },
    {
        "canonical": "Beta Person",
        "shard": "people",
        "tier": "full",
        "type": "PERSON",
    },
]


@pytest.fixture()
def signing_keys(tmp_path: Path) -> tuple[Path, Path, Path]:
    private = Ed25519PrivateKey.generate()
    private_path = tmp_path / "signing-key.pem"
    private_path.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    public_path = tmp_path / "public-key.pem"
    config_path = tmp_path / "dictionary-config.js"
    config_path.write_text(
        'export const DICTIONARY_PUBLIC_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";\n',
        encoding="utf-8",
    )
    return private_path, public_path, config_path


def _source(path: Path, rows: list[dict[str, object]]) -> Path:
    path.write_text(
        yaml.safe_dump(
            {"schemaVersion": 1, "entities": rows},
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    return path


def _build(
    tmp_path: Path,
    signing_keys: tuple[Path, Path, Path],
    rows: list[dict[str, object]] | None = None,
) -> tuple[Path, tuple[Path, Path, Path]]:
    signing_key, public_key, config = signing_keys
    source = _source(tmp_path / "entities.yaml", rows or SOURCE_ROWS)
    out = tmp_path / "web" / "dictionary"
    build_dictionary.build_dictionary(
        source,
        out,
        signing_key,
        "2026.11.25.1",
        "2026-11-25T00:00:00Z",
        public_key,
        config,
    )
    return out, signing_keys


def test_build_is_signed_sharded_and_reproducible(
    tmp_path: Path, signing_keys: tuple[Path, Path, Path]
) -> None:
    out, _ = _build(tmp_path, signing_keys)
    manifest_bytes = (out / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    public = serialization.load_pem_public_key(signing_keys[1].read_bytes())
    public.verify((out / "manifest.sig").read_bytes(), manifest_bytes)

    assert manifest["layer"] == "preset"
    assert manifest["coreShards"] == ["core"]
    assert [shard["id"] for shard in manifest["shards"]] == [
        "core",
        "counterparties",
        "people",
    ]
    assert manifest["coreGzipBytes"] <= build_dictionary.CORE_LIMIT
    assert manifest["totalGzipBytes"] <= build_dictionary.TOTAL_LIMIT
    for shard in manifest["shards"]:
        packed = (out / shard["path"]).read_bytes()
        assert len(packed) == shard["bytes"]
        assert build_dictionary._sha256(packed) == shard["sha256"]

    first = manifest_bytes
    _build(tmp_path, signing_keys)
    assert (out / "manifest.json").read_bytes() == first


def test_shipped_pack_verifies_and_core_is_bounded() -> None:
    out = REPO / "web" / "dictionary"
    build_dictionary.verify_dictionary(
        out,
        REPO / "dictionary" / "public-key.pem",
        REPO / "web" / "lib" / "dictionary-config.js",
    )
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    entities = build_dictionary._load_entities(build_dictionary.DEFAULT_SOURCE)
    rebuilt, payloads = build_dictionary._manifest_from_entities(
        entities, manifest["packVersion"], manifest["createdAt"]
    )
    assert rebuilt == manifest
    for relative, payload in payloads.items():
        assert (out / relative).read_bytes() == payload
    assert manifest["coreGzipBytes"] <= 150 * 1024
    assert manifest["totalGzipBytes"] <= 8 * 1024 * 1024


def test_editing_yaml_changes_the_built_preset_entities(
    tmp_path: Path, signing_keys: tuple[Path, Path, Path]
) -> None:
    signing_key, public_key, config = signing_keys
    source = _source(tmp_path / "entities.yaml", SOURCE_ROWS)
    out = tmp_path / "web" / "dictionary"

    build_dictionary.build_dictionary(
        source,
        out,
        signing_key,
        "2026.11.25.1",
        "2026-11-25T00:00:00Z",
        public_key,
        config,
    )
    before = [
        json.loads(line)
        for path in sorted((out / "packs").rglob("*.jsonl.gz"))
        for line in gzip.decompress(path.read_bytes()).splitlines()
    ]
    assert {row["canonical"] for row in before} == {
        "Alpha Holdings",
        "Beta Person",
    }

    _source(
        source,
        [
            *SOURCE_ROWS,
            {
                "canonical": "Gamma Project",
                "shard": "projects",
                "tier": "full",
                "type": "PROJECT",
            },
        ],
    )
    build_dictionary.build_dictionary(
        source,
        out,
        signing_key,
        "2026.11.25.2",
        "2026-11-25T01:00:00Z",
        public_key,
        config,
    )
    after = [
        json.loads(line)
        for path in sorted((out / "packs").rglob("*.jsonl.gz"))
        for line in gzip.decompress(path.read_bytes()).splitlines()
    ]
    assert {row["canonical"] for row in after} == {
        "Alpha Holdings",
        "Beta Person",
        "Gamma Project",
    }


def test_minimal_example_yaml_loads() -> None:
    entities = build_dictionary._load_entities(
        REPO / "dictionary" / "entities.example.yaml"
    )
    assert entities == [
        {
            "aliases": ["Example P."],
            "canonical": "Example Person",
            "shard": "people",
            "tier": "full",
            "type": "PERSON",
        }
    ]


def test_missing_yaml_source_reports_the_path(tmp_path: Path) -> None:
    missing = tmp_path / "missing.yaml"
    with pytest.raises(
        build_dictionary.DictionaryError,
        match=r"cannot read glossary source .*missing\.yaml",
    ):
        build_dictionary._load_entities(missing)


def test_malformed_yaml_reports_line_and_column(tmp_path: Path) -> None:
    source = tmp_path / "entities.yaml"
    source.write_text("schemaVersion: 1\nentities: [\n", encoding="utf-8")
    with pytest.raises(
        build_dictionary.DictionaryError,
        match=r"invalid YAML in .*line \d+, column \d+",
    ):
        build_dictionary._load_entities(source)


def test_invalid_entity_reports_its_index(tmp_path: Path) -> None:
    source = _source(
        tmp_path / "entities.yaml",
        [{"canonical": "", "type": "PERSON"}],
    )
    with pytest.raises(
        build_dictionary.DictionaryError,
        match=r"entities\[0\]: canonical must be a non-empty string",
    ):
        build_dictionary._load_entities(source)


def _write(path: Path, text: str, encoding: str = "utf-8") -> Path:
    path.write_bytes(text.encode(encoding))
    return path


def test_duplicate_yaml_key_is_rejected_with_its_position(tmp_path: Path) -> None:
    source = _write(
        tmp_path / "entities.yaml",
        "schemaVersion: 1\n"
        "entities:\n"
        "  - canonical: Alpha\n"
        "    canonical: Omega\n"
        "    type: PERSON\n",
    )
    with pytest.raises(
        build_dictionary.DictionaryError,
        match=r"duplicate key 'canonical' at line 4, column \d+",
    ):
        build_dictionary._load_entities(source)


def test_duplicate_top_level_key_is_rejected(tmp_path: Path) -> None:
    source = _write(
        tmp_path / "entities.yaml",
        "schemaVersion: 1\n"
        "entities:\n"
        "  - canonical: Alpha\n"
        "    type: PERSON\n"
        "entities:\n"
        "  - canonical: Beta\n"
        "    type: PERSON\n",
    )
    with pytest.raises(build_dictionary.DictionaryError, match="duplicate key 'entities'"):
        build_dictionary._load_entities(source)


def test_utf8_bom_is_tolerated(tmp_path: Path) -> None:
    source = _write(
        tmp_path / "entities.yaml",
        "\ufeffschemaVersion: 1\nentities:\n  - canonical: Alpha\n    type: PERSON\n",
    )
    assert build_dictionary._load_entities(source)[0]["canonical"] == "Alpha"


def test_non_utf8_source_reports_the_offending_byte(tmp_path: Path) -> None:
    source = tmp_path / "entities.yaml"
    source.write_bytes(
        "schemaVersion: 1\nentities:\n  - canonical: 张三\n    type: PERSON\n".encode("gbk")
    )
    with pytest.raises(
        build_dictionary.DictionaryError,
        match=r"must be UTF-8; byte 0x[0-9a-f]{2} at offset \d+",
    ):
        build_dictionary._load_entities(source)


def test_verify_rejects_a_source_edited_without_rebuilding(
    tmp_path: Path, signing_keys: tuple[Path, Path, Path]
) -> None:
    out, keys = _build(tmp_path, signing_keys)
    source = tmp_path / "entities.yaml"
    build_dictionary.verify_dictionary(out, keys[1], keys[2], source=source)

    _source(
        source,
        [
            *SOURCE_ROWS,
            {
                "canonical": "Gamma Project",
                "shard": "projects",
                "tier": "full",
                "type": "PROJECT",
            },
        ],
    )
    with pytest.raises(
        build_dictionary.DictionaryError,
        match=r"does not match the signed pack .*run .*dictionary-build",
    ):
        build_dictionary.verify_dictionary(out, keys[1], keys[2], source=source)


def test_verify_rejects_an_invalid_source_before_the_pack(
    tmp_path: Path, signing_keys: tuple[Path, Path, Path]
) -> None:
    out, keys = _build(tmp_path, signing_keys)
    _write(
        tmp_path / "entities.yaml",
        "schemaVersion: 1\nentities:\n  - canonical: Alpha\n    canonical: Beta\n"
        "    type: PERSON\n",
    )
    with pytest.raises(build_dictionary.DictionaryError, match="duplicate key"):
        build_dictionary.verify_dictionary(
            out, keys[1], keys[2], source=tmp_path / "entities.yaml"
        )


def test_shipped_pack_matches_the_editable_source() -> None:
    build_dictionary.verify_source_matches_pack()


def test_tampered_shard_is_rejected(
    tmp_path: Path, signing_keys: tuple[Path, Path, Path]
) -> None:
    out, _ = _build(tmp_path, signing_keys)
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    shard = out / manifest["shards"][0]["path"]
    packed = bytearray(shard.read_bytes())
    packed[-1] ^= 0x01
    shard.write_bytes(packed)
    with pytest.raises(build_dictionary.DictionaryError, match="sha256"):
        build_dictionary.verify_dictionary(out, signing_keys[1], signing_keys[2])


def test_manifest_signature_is_required(
    tmp_path: Path, signing_keys: tuple[Path, Path, Path]
) -> None:
    out, _ = _build(tmp_path, signing_keys)
    signature = out / "manifest.sig"
    tampered = bytearray(signature.read_bytes())
    tampered[0] ^= 0x01
    signature.write_bytes(tampered)
    with pytest.raises(build_dictionary.DictionaryError, match="signature"):
        build_dictionary.verify_dictionary(out, signing_keys[1], signing_keys[2])


def test_core_size_limit_is_a_build_gate(
    tmp_path: Path,
    signing_keys: tuple[Path, Path, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(build_dictionary, "CORE_LIMIT", 20)
    with pytest.raises(build_dictionary.DictionaryError, match="core package"):
        _build(tmp_path, signing_keys)


def test_non_preset_layer_is_rejected_on_verification(
    tmp_path: Path, signing_keys: tuple[Path, Path, Path]
) -> None:
    out, _ = _build(tmp_path, signing_keys)
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["layer"] = "user"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(build_dictionary.DictionaryError, match="signature|preset"):
        build_dictionary.verify_dictionary(out, signing_keys[1], signing_keys[2])
