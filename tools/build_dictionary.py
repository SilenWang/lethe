"""Build and verify the signed preset-dictionary distribution.

The dictionary source is deliberately small and separate from user data. This
tool writes gzip JSONL shards, a versioned manifest and a detached Ed25519
signature. The browser verifies the manifest before reading any shard.

Examples::

    pixi run dictionary-build                  # LETHE_DICTIONARY_SIGNING_KEY=...
    pixi run dictionary-check
"""

from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

REPO = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPO / "dictionary" / "entities.yaml"
DEFAULT_OUT = REPO / "web" / "dictionary"
DEFAULT_PUBLIC_KEY = REPO / "dictionary" / "public-key.pem"
CONFIG = REPO / "web" / "lib" / "dictionary-config.js"

MANIFEST_SCHEMA = "lethe-dictionary-manifest"
MANIFEST_SCHEMA_VERSION = 1
SOURCE_SCHEMA_VERSION = 1
VERSION_RE = re.compile(r"^\d{4}\.\d{2}\.\d{2}\.\d+$")
SHARD_RE = re.compile(r"^[a-z][a-z0-9-]{0,31}$")
CORE_LIMIT = 150 * 1024
TOTAL_LIMIT = 8 * 1024 * 1024
ENTITY_KEYS = {"canonical", "type", "aliases", "shard", "tier"}


class DictionaryError(ValueError):
    """The source tree or built pack violates the distribution contract."""


def _json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _public_raw(public_key: Ed25519PublicKey) -> bytes:
    return public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def _load_public_key(path: Path) -> Ed25519PublicKey:
    try:
        key = serialization.load_pem_public_key(path.read_bytes())
    except (OSError, ValueError) as exc:
        raise DictionaryError(f"cannot read public key {path}: {exc}") from exc
    if not isinstance(key, Ed25519PublicKey):
        raise DictionaryError(f"{path} is not an Ed25519 public key")
    return key


def _load_private_key(path: Path) -> Ed25519PrivateKey:
    try:
        key = serialization.load_pem_private_key(path.read_bytes(), password=None)
    except (OSError, ValueError, TypeError) as exc:
        raise DictionaryError(f"cannot read signing key {path}: {exc}") from exc
    if not isinstance(key, Ed25519PrivateKey):
        raise DictionaryError(f"{path} is not an Ed25519 private key")
    return key


def _read_config_public_key(config_path: Path = CONFIG) -> bytes:
    try:
        source = config_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise DictionaryError(f"cannot read {config_path}: {exc}") from exc
    match = re.search(r'export const DICTIONARY_PUBLIC_KEY = "([A-Za-z0-9+/=]+)";', source)
    if not match:
        raise DictionaryError("dictionary-config.js has no DICTIONARY_PUBLIC_KEY")
    try:
        raw = base64.b64decode(match.group(1), validate=True)
    except ValueError as exc:
        raise DictionaryError("DICTIONARY_PUBLIC_KEY is not valid base64") from exc
    if len(raw) != 32:
        raise DictionaryError("DICTIONARY_PUBLIC_KEY must contain 32 raw Ed25519 bytes")
    return raw


def _write_config_public_key(raw: bytes, config_path: Path = CONFIG) -> None:
    encoded = base64.b64encode(raw).decode("ascii")
    source = (
        "// Trust anchor for the signed preset-dictionary manifest. This public\n"
        "// key is intentionally shipped with the app; the private key is a release\n"
        "// secret and is never written to the repository.\n"
        f'export const DICTIONARY_PUBLIC_KEY = "{encoded}";\n'
        'export const DICTIONARY_BASE_URL = "./dictionary";\n'
        'export const DICTIONARY_MANIFEST_PATH = "/dictionary/manifest.json";\n'
        'export const DICTIONARY_SIGNATURE_PATH = "/dictionary/manifest.sig";\n'
        'export const DICTIONARY_CORE_LIMIT_BYTES = 150 * 1024;\n'
        'export const DICTIONARY_TOTAL_LIMIT_BYTES = 8 * 1024 * 1024;\n'
    )
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(source, encoding="utf-8")


def _normalise_entity(row: Any, location: str) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise DictionaryError(f"{location}: expected a YAML mapping")
    unknown = sorted(str(field) for field in set(row) - ENTITY_KEYS)
    if unknown:
        raise DictionaryError(f"{location}: unknown field(s): {', '.join(unknown)}")
    canonical_value = row.get("canonical")
    if not isinstance(canonical_value, str):
        raise DictionaryError(f"{location}: canonical must be a non-empty string")
    canonical = canonical_value.strip()
    if not canonical:
        raise DictionaryError(f"{location}: canonical must be a non-empty string")
    type_value = row.get("type")
    if not isinstance(type_value, str):
        raise DictionaryError(f"{location}: type must be a non-empty string")
    entity_type = type_value.strip().upper()
    if not entity_type:
        raise DictionaryError(f"{location}: type must be a non-empty string")
    aliases = row.get("aliases") or []
    if not isinstance(aliases, list):
        raise DictionaryError(f"{location}: aliases must be a list")
    clean_aliases: list[str] = []
    seen = {canonical.casefold()}
    for alias in aliases:
        if not isinstance(alias, str):
            raise DictionaryError(f"{location}: aliases must contain only strings")
        value = alias.strip()
        if value and value.casefold() not in seen:
            clean_aliases.append(value)
            seen.add(value.casefold())
    shard_value = row.get("shard", "full")
    if not isinstance(shard_value, str):
        raise DictionaryError(f"{location}: shard must be a string")
    shard = shard_value.strip()
    if not SHARD_RE.fullmatch(shard):
        raise DictionaryError(f"{location}: invalid shard id {shard!r}")
    tier_value = row.get("tier", "full")
    if not isinstance(tier_value, str):
        raise DictionaryError(f"{location}: tier must be core or full")
    tier = tier_value.strip()
    if tier not in {"core", "full"}:
        raise DictionaryError(f"{location}: tier must be core or full")
    return {
        "canonical": canonical,
        "type": entity_type,
        "aliases": clean_aliases,
        "shard": shard,
        "tier": tier,
    }


class _DuplicateKeyError(ValueError):
    """A YAML mapping repeats a key; ``safe_load`` would silently keep the last."""

    def __init__(self, key: str, node: Any) -> None:
        super().__init__(key)
        self.key = key
        self.line = node.start_mark.line + 1
        self.column = node.start_mark.column + 1


class _StrictLoader(yaml.SafeLoader):
    """SafeLoader that rejects duplicate mapping keys instead of dropping one.

    A repeated ``canonical`` or ``tier`` in an edited glossary is almost always
    a mistake, and silently keeping the last value would make the built pack
    disagree with what the editor sees.
    """

    def construct_mapping(self, node: Any, deep: bool = False) -> Any:
        self.flatten_mapping(node)
        seen: set[str] = set()
        for key_node, _value_node in node.value:
            if not isinstance(key_node, yaml.ScalarNode):
                continue
            key = str(key_node.value)
            if key in seen:
                raise _DuplicateKeyError(key, key_node)
            seen.add(key)
        return super().construct_mapping(node, deep=deep)


def _load_entities(path: Path) -> list[dict[str, Any]]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise DictionaryError(f"cannot read glossary source {path}: {exc}") from exc
    try:
        source = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise DictionaryError(
            f"{path}: glossary source must be UTF-8; byte 0x{raw[exc.start]:02x} "
            f"at offset {exc.start} is not valid UTF-8 (re-save the file as UTF-8)"
        ) from exc
    try:
        document = yaml.load(source, Loader=_StrictLoader)
    except _DuplicateKeyError as exc:
        raise DictionaryError(
            f"{path}: duplicate key {exc.key!r} at line {exc.line}, column {exc.column}"
        ) from exc
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        location = ""
        if mark is not None:
            location = f" at line {mark.line + 1}, column {mark.column + 1}"
        problem = getattr(exc, "problem", None) or str(exc)
        raise DictionaryError(f"invalid YAML in {path}{location}: {problem}") from exc
    if not isinstance(document, dict):
        raise DictionaryError(f"{path}: top level must be a YAML mapping")
    unknown = sorted(str(field) for field in set(document) - {"schemaVersion", "entities"})
    if unknown:
        raise DictionaryError(f"{path}: unknown top-level field(s): {', '.join(unknown)}")
    version = document.get("schemaVersion")
    if type(version) is not int or version != SOURCE_SCHEMA_VERSION:
        raise DictionaryError(
            f"{path}: schemaVersion must be {SOURCE_SCHEMA_VERSION}"
        )
    raw_entities = document.get("entities")
    if not isinstance(raw_entities, list):
        raise DictionaryError(f"{path}: entities must be a list")
    if not raw_entities:
        raise DictionaryError(f"{path}: entities must contain at least one entry")
    entities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw in enumerate(raw_entities):
        row = _normalise_entity(raw, f"{path}: entities[{index}]")
        key = row["canonical"].casefold()
        if key in seen:
            raise DictionaryError(
                f"{path}: entities[{index}]: duplicate canonical {row['canonical']!r}"
            )
        seen.add(key)
        entities.append(row)
    return entities


def _gzip_jsonl(rows: list[dict[str, Any]]) -> bytes:
    payload = b"".join(_json_bytes(row) for row in rows)
    return gzip.compress(payload, compresslevel=9, mtime=0)


def _manifest_from_entities(
    entities: list[dict[str, Any]], version: str, created_at: str
) -> tuple[dict[str, Any], dict[str, bytes]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for entity in entities:
        tiers = ["core", "full"] if entity["tier"] == "core" else ["full"]
        for tier in tiers:
            shard = "core" if tier == "core" else entity["shard"]
            row = {
                "aliases": entity["aliases"],
                "canonical": entity["canonical"],
                "source": "preset",
                "type": entity["type"],
            }
            grouped.setdefault(shard, []).append(row)

    shards: list[dict[str, Any]] = []
    payloads: dict[str, bytes] = {}
    core_ids: list[str] = []
    for shard in sorted(grouped):
        rows = sorted(
            grouped[shard],
            key=lambda row: (str(row["type"]), str(row["canonical"]).casefold()),
        )
        packed = _gzip_jsonl(rows)
        relative = f"packs/{version}/{shard}.jsonl.gz"
        payloads[relative] = packed
        shards.append(
            {
                "id": shard,
                "path": relative,
                "bytes": len(packed),
                "sha256": _sha256(packed),
                "entities": len(rows),
            }
        )
        if shard == "core":
            core_ids.append(shard)

    manifest = {
        "schema": MANIFEST_SCHEMA,
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "packVersion": version,
        "createdAt": created_at,
        "layer": "preset",
        "coreShards": core_ids,
        "shards": shards,
        "coreGzipBytes": sum(
            int(item["bytes"]) for item in shards if item["id"] in core_ids
        ),
        "totalGzipBytes": sum(int(item["bytes"]) for item in shards),
    }
    _validate_manifest(manifest)
    return manifest, payloads


def _validate_manifest(manifest: Any) -> None:
    if not isinstance(manifest, dict):
        raise DictionaryError("manifest must be a JSON object")
    if manifest.get("schema") != MANIFEST_SCHEMA:
        raise DictionaryError("manifest schema is not lethe-dictionary-manifest")
    if manifest.get("schemaVersion") != MANIFEST_SCHEMA_VERSION:
        raise DictionaryError("unsupported manifest schema version")
    version = manifest.get("packVersion")
    if not isinstance(version, str) or not VERSION_RE.fullmatch(version):
        raise DictionaryError("packVersion must look like YYYY.MM.DD.N")
    if manifest.get("layer") != "preset":
        raise DictionaryError("dictionary manifests may only contain the preset layer")
    shards = manifest.get("shards")
    if not isinstance(shards, list) or not shards:
        raise DictionaryError("manifest shards must be a non-empty array")
    ids: set[str] = set()
    core_ids = manifest.get("coreShards")
    if not isinstance(core_ids, list) or not core_ids:
        raise DictionaryError("manifest must declare at least one core shard")
    total = 0
    core_total = 0
    for shard in shards:
        if not isinstance(shard, dict):
            raise DictionaryError("each shard must be a JSON object")
        shard_id = shard.get("id")
        if not isinstance(shard_id, str) or not SHARD_RE.fullmatch(shard_id):
            raise DictionaryError(f"invalid shard id {shard_id!r}")
        if shard_id in ids:
            raise DictionaryError(f"duplicate shard id {shard_id!r}")
        ids.add(shard_id)
        path = shard.get("path")
        if (
            not isinstance(path, str)
            or path.startswith("/")
            or ".." in Path(path).parts
            or not path.endswith(".jsonl.gz")
        ):
            raise DictionaryError(f"unsafe shard path for {shard_id!r}")
        if not re.fullmatch(r"[0-9a-f]{64}", str(shard.get("sha256") or "")):
            raise DictionaryError(f"invalid sha256 for shard {shard_id!r}")
        size = shard.get("bytes")
        count = shard.get("entities")
        if not isinstance(size, int) or size <= 0 or not isinstance(count, int) or count <= 0:
            raise DictionaryError(f"invalid size/count for shard {shard_id!r}")
        total += size
        if shard_id in core_ids:
            core_total += size
    if set(core_ids) - ids:
        raise DictionaryError("coreShards references an unknown shard")
    if total != manifest.get("totalGzipBytes"):
        raise DictionaryError("totalGzipBytes does not match shard sizes")
    if core_total != manifest.get("coreGzipBytes"):
        raise DictionaryError("coreGzipBytes does not match core shard sizes")
    if core_total > CORE_LIMIT:
        raise DictionaryError(f"core package is {core_total} bytes; limit is {CORE_LIMIT}")
    if total > TOTAL_LIMIT:
        raise DictionaryError(f"full package is {total} bytes; limit is {TOTAL_LIMIT}")


def _load_manifest_and_signature(out: Path) -> tuple[dict[str, Any], bytes, bytes]:
    manifest_path = out / "manifest.json"
    signature_path = out / "manifest.sig"
    try:
        manifest_bytes = manifest_path.read_bytes()
        signature = signature_path.read_bytes()
    except OSError as exc:
        raise DictionaryError(f"cannot read built manifest/signature: {exc}") from exc
    try:
        manifest = json.loads(manifest_bytes)
    except ValueError as exc:
        raise DictionaryError(f"manifest is not valid JSON: {exc}") from exc
    _validate_manifest(manifest)
    return manifest, manifest_bytes, signature


def verify_source_matches_pack(
    source: Path = DEFAULT_SOURCE,
    out: Path = DEFAULT_OUT,
) -> None:
    """Fail when the checked-in YAML glossary no longer matches the signed pack.

    Editing ``dictionary/entities.yaml`` without rerunning
    ``pixi run dictionary-build`` would ship a pack that disagrees with the
    reviewed source, so the source is rebuilt in memory and compared byte for
    byte with what the repository already contains.
    """
    entities = _load_entities(source)
    manifest, _, _ = _load_manifest_and_signature(out)
    created_at = manifest.get("createdAt")
    if not isinstance(created_at, str) or not created_at:
        raise DictionaryError("manifest has no createdAt timestamp")
    rebuilt, payloads = _manifest_from_entities(
        entities, manifest["packVersion"], created_at
    )
    if rebuilt != manifest:
        raise DictionaryError(
            f"{source} does not match the signed pack in {out}; run "
            "`pixi run dictionary-build` to rebuild it"
        )
    for relative, payload in payloads.items():
        path = out / relative
        try:
            built = path.read_bytes()
        except OSError as exc:
            raise DictionaryError(f"cannot read shard {relative}: {exc}") from exc
        if built != payload:
            raise DictionaryError(
                f"shard {relative} does not match {source}; run "
                "`pixi run dictionary-build` to rebuild it"
            )


def verify_dictionary(
    out: Path = DEFAULT_OUT,
    public_key_path: Path = DEFAULT_PUBLIC_KEY,
    config_path: Path = CONFIG,
    source: Path | None = None,
) -> None:
    """Verify the signed manifest, every shard and the shipped trust anchor.

    Passing ``source`` additionally proves the editable YAML glossary still
    rebuilds to exactly the checked-in pack.
    """
    public_key = _load_public_key(public_key_path)
    manifest, manifest_bytes, signature = _load_manifest_and_signature(out)
    try:
        public_key.verify(signature, manifest_bytes)
    except InvalidSignature as exc:
        raise DictionaryError("manifest Ed25519 signature does not verify") from exc
    if _read_config_public_key(config_path) != _public_raw(public_key):
        raise DictionaryError("dictionary-config.js public key differs from public-key.pem")
    for shard in manifest["shards"]:
        path = out / shard["path"]
        try:
            packed = path.read_bytes()
        except OSError as exc:
            raise DictionaryError(f"cannot read shard {shard['id']}: {exc}") from exc
        if len(packed) != shard["bytes"]:
            raise DictionaryError(f"shard {shard['id']} byte size differs from manifest")
        if _sha256(packed) != shard["sha256"]:
            raise DictionaryError(f"shard {shard['id']} sha256 differs from manifest")
        try:
            payload = gzip.decompress(packed)
        except OSError as exc:
            raise DictionaryError(f"shard {shard['id']} is not gzip: {exc}") from exc
        rows = [json.loads(line) for line in payload.splitlines() if line.strip()]
        if len(rows) != shard["entities"]:
            raise DictionaryError(f"shard {shard['id']} entity count differs from manifest")
        for row in rows:
            if row.get("source") != "preset":
                raise DictionaryError(f"shard {shard['id']} contains non-preset data")
    if source is not None:
        verify_source_matches_pack(source, out)


def build_dictionary(
    source: Path,
    out: Path,
    signing_key_path: Path,
    version: str,
    created_at: str,
    public_key_path: Path = DEFAULT_PUBLIC_KEY,
    config_path: Path = CONFIG,
) -> None:
    entities = _load_entities(source)
    manifest, payloads = _manifest_from_entities(entities, version, created_at)
    manifest_bytes = _json_bytes(manifest)
    private_key = _load_private_key(signing_key_path)
    signature = private_key.sign(manifest_bytes)

    out.mkdir(parents=True, exist_ok=True)
    for relative, packed in payloads.items():
        path = out / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(packed)
    (out / "manifest.json").write_bytes(manifest_bytes)
    (out / "manifest.sig").write_bytes(signature)

    public_key = private_key.public_key()
    public_key_path.parent.mkdir(parents=True, exist_ok=True)
    public_key_path.write_bytes(
        public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    _write_config_public_key(_public_raw(public_key), config_path)
    verify_dictionary(out, public_key_path, config_path, source=source)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--public-key", type=Path, default=DEFAULT_PUBLIC_KEY)
    parser.add_argument("--signing-key", type=Path)
    parser.add_argument("--version")
    parser.add_argument("--created-at")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args(argv)

    try:
        if args.verify_only:
            verify_dictionary(args.out, args.public_key, CONFIG, source=args.source)
            print(
                "dictionary-check: source, signature, sizes and shard hashes OK"
            )
            return 0
        if not args.signing_key:
            parser.error("--signing-key is required unless --verify-only is used")
        version = args.version or datetime.now(timezone.utc).strftime("%Y.%m.%d.1")
        created_at = args.created_at or datetime.now(timezone.utc).replace(
            microsecond=0
        ).isoformat().replace("+00:00", "Z")
        build_dictionary(
            args.source,
            args.out,
            args.signing_key,
            version,
            created_at,
            args.public_key,
            CONFIG,
        )
        print(f"dictionary-build: {version} -> {args.out}")
        return 0
    except DictionaryError as exc:
        print(f"dictionary: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
