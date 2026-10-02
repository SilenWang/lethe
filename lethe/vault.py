"""
Token -> real value mapping: cryptography helpers and legacy migration.

Each de-identification "job" produces a mapping of token -> real value — the
only way to re-identify the AI's output later. Since the client-side storage
migration that mapping lives in the user's browser, encrypted there with
WebCrypto (PBKDF2-SHA-256 480k -> AES-GCM-256; see
``web_static/client-store.js``). The server no longer writes a ``vault/`` folder.

What remains here is the legacy Fernet codec, kept only so the one-time
migration can decrypt a pre-migration server-side ``DATA_DIR`` and hand the
mappings to the browser, where they are re-encrypted with the user's current
passphrase. Lose the passphrase and the mapping is unrecoverable by design.
"""
from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

VAULT_DIRNAME = "vault"
INDEX_FILENAME = "index.json"


def _key_from_passphrase(passphrase: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=480_000)
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8")))


def encrypt_record(job_id: str, mapping: dict, passphrase: str,
                   meta: dict | None = None, created: str | None = None) -> dict:
    """Encrypt a token -> real value mapping into a legacy vault record dict
    (salt + Fernet ciphertext). Pure: nothing is written to disk."""
    salt = os.urandom(16)
    fernet = Fernet(_key_from_passphrase(passphrase, salt))
    payload = {
        "job_id": job_id,
        "created": created or datetime.now(timezone.utc).isoformat(),
        "meta": meta or {},
        "mapping": mapping,
    }
    token = fernet.encrypt(json.dumps(payload).encode("utf-8"))
    return {"salt": base64.b64encode(salt).decode("ascii"),
            "ciphertext": token.decode("ascii")}


def decrypt_record(record: dict, passphrase: str) -> dict:
    """Decrypt a legacy vault record. Raises ValueError on a wrong passphrase."""
    salt = base64.b64decode(record["salt"])
    fernet = Fernet(_key_from_passphrase(passphrase, salt))
    try:
        plain = fernet.decrypt(record["ciphertext"].encode("ascii"))
    except InvalidToken as exc:
        raise ValueError("Wrong passphrase, or the vault file is corrupted.") from exc
    return json.loads(plain.decode("utf-8"))


# ---- legacy DATA_DIR migration (read-only) ---------------------------------

def legacy_vault_dir(data_dir: str) -> str:
    return os.path.join(data_dir, VAULT_DIRNAME)


def legacy_list_jobs(data_dir: str) -> list[str]:
    vault_dir = legacy_vault_dir(data_dir)
    if not os.path.isdir(vault_dir):
        return []
    return sorted(f[: -len(".vault.json")] for f in os.listdir(vault_dir)
                  if f.endswith(".vault.json"))


def legacy_read_index(data_dir: str) -> list[dict]:
    """The old, UNENCRYPTED history index (job id, date, source filename,
    count) — never contains real names."""
    path = os.path.join(legacy_vault_dir(data_dir), INDEX_FILENAME)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (ValueError, OSError):
        return []


def legacy_read_job(data_dir: str, job_id: str) -> dict:
    """Read one legacy .vault.json record (still encrypted)."""
    path = os.path.join(legacy_vault_dir(data_dir), f"{job_id}.vault.json")
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def legacy_history(data_dir: str) -> list[dict]:
    """Every legacy job, newest first, enriched with index metadata where
    present. Jobs created before the index existed still appear."""
    idx = {e.get("job_id"): e for e in legacy_read_index(data_dir)}
    out = []
    for jid in legacy_list_jobs(data_dir):
        e = idx.get(jid, {})
        created = e.get("created", "")
        if not created and len(jid) >= 15 and jid[8] == "-":  # YYYYMMDD-HHMMSS-xxxx
            created = f"{jid[0:4]}-{jid[4:6]}-{jid[6:8]} {jid[9:11]}:{jid[11:13]}"
        out.append({"job_id": jid, "created": created,
                    "source_file": e.get("source_file", ""),
                    "replacements": e.get("replacements", "")})
    return sorted(out, key=lambda r: r["job_id"], reverse=True)


def legacy_export(data_dir: str, passphrase: str = "") -> tuple[list[dict], list[dict]]:
    """Decrypt every legacy vault record for the one-time migration.

    Returns ``(jobs, errors)``. Each job is
    ``{job_id, created, source_files, replacements, mapping}``; each error is
    ``{job_id, error}`` so the UI can tell the user which jobs need a different
    (older) passphrase. Nothing is written to disk and the passphrase is never
    logged."""
    jobs: list[dict] = []
    errors: list[dict] = []
    for entry in legacy_history(data_dir):
        job_id = entry["job_id"]
        try:
            record = legacy_read_job(data_dir, job_id)
            payload = decrypt_record(record, passphrase or "")
        except Exception as exc:  # noqa: BLE001 — reported per job, never fatal
            errors.append({"job_id": job_id, "error": str(exc)})
            continue
        meta = payload.get("meta") or {}
        source = meta.get("source_file") or entry.get("source_file") or ""
        jobs.append({
            "job_id": job_id,
            "created": payload.get("created") or entry.get("created") or "",
            "source_files": [s.strip() for s in str(source).split(",") if s.strip()],
            "replacements": meta.get("replacements", entry.get("replacements", 0)) or 0,
            "mapping": payload.get("mapping") or {},
        })
    return jobs, errors


def legacy_archive(data_dir: str, timestamp: str | None = None) -> str | None:
    """Move the legacy user-data files out of the way after a successful
    migration — into ``<DATA_DIR>/migrated-<ts>/`` — without deleting anything.

    The rest of DATA_DIR (OCR models in ``tessdata/``, the session secret) is
    left untouched so the installed app keeps working. Returns the archive path,
    or None when there was nothing to move."""
    stamp = timestamp or datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    targets = ["entities.json", "token_types.json", VAULT_DIRNAME]
    present = [t for t in targets if os.path.exists(os.path.join(data_dir, t))]
    if not present:
        return None
    archive = os.path.join(data_dir, f"migrated-{stamp}")
    os.makedirs(archive, exist_ok=True)
    for name in present:
        os.replace(os.path.join(data_dir, name), os.path.join(archive, name))
    with open(os.path.join(archive, "migrated.flag"), "w", encoding="utf-8") as fh:
        fh.write(f"Archived by the Lethe client-side storage migration at {stamp} UTC.\n"
                 "The dictionary, custom token types and encrypted mappings in this folder\n"
                 "have been imported into the browser (IndexedDB). Keep this as a backup.\n")
    return archive
