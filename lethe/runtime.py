"""Server-side runtime workspace for one computation run, with a sliding TTL.

Task VYB-359 (VYB-354 T4). Design: ``docs/architecture-client-side-storage.md``
§7. The server keeps only what a single run needs — the uploaded source
documents, the extracted text and any scratch/output files — under
``runtime/<job_id>/``:

    runtime/<job_id>/source/<n>.<ext>   uploaded originals
    runtime/<job_id>/text/<n>.txt       extracted text
    runtime/<job_id>/out/<name>         redaction / restore results
    runtime/<job_id>/job.json           registry snapshot

Timing (§7.2) is a **sliding** TTL: ``expires_at = last_touch_at + ttl``, with
``max_lifetime`` as a hard cap so a job can't be kept alive forever. Only
server-side actions touch a job (create, extract, detect, redact, restore,
download); pure front-end activity does not.

Cleanup (§7.4) runs in three independent layers so one failure can't leave data
behind:

1. **periodic** — an asyncio task sweeps every ``SWEEP_INTERVAL_SECONDS`` (30 s);
2. **opportunistic** — every ``/api/*`` request sweeps first (wired in ``app.py``);
3. **process boundaries** — a startup sweep clears leftovers from a crash, and a
   shutdown/``atexit`` purge removes whatever is left. If the filesystem refuses
   a deletion the job stays registered and the next sweep retries it.

Every purge writes exactly one structured line, counts only — never file names,
document text or token→name mappings (see ``_log_purge``).
"""
from __future__ import annotations

import asyncio
import atexit
import json
import logging
import os
import re
import secrets
import shutil
import threading
import time

from . import DATA_DIR

log = logging.getLogger("lethe.runtime")


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        log.warning("Ignoring invalid %s=%r (expected a number)", name, raw)
        return default


# §7.1 — the runtime area lives next to the other program data. $LETHE_RUNTIME_DIR
# overrides it (used by the verification script and the tests).
RUNTIME_DIR = os.environ.get("LETHE_RUNTIME_DIR") or os.path.join(DATA_DIR, "runtime")
# §7.2 — sliding TTL, 5 minutes by default; the hard cap stops a job that keeps
# being touched from occupying the server forever.
JOB_TTL_SECONDS = _env_float("LETHE_JOB_TTL_SECONDS", 300.0)
JOB_MAX_LIFETIME_SECONDS = _env_float("LETHE_JOB_MAX_LIFETIME_SECONDS", 3600.0)
SWEEP_INTERVAL_SECONDS = _env_float("LETHE_SWEEP_INTERVAL_SECONDS", 30.0)

_JOB_ID_RE = re.compile(r"[^A-Za-z0-9._-]")
_EXT_RE = re.compile(r"[^A-Za-z0-9.]")
_LEAF_RE = re.compile(r"[^A-Za-z0-9._-]")


def _safe_job_id(job_id: str) -> str:
    """A job id is always a single, safe path component."""
    return _JOB_ID_RE.sub("", str(job_id)) or "job"


def _safe_ext(name: str) -> str:
    ext = os.path.splitext(str(name or ""))[1].lower()
    ext = _EXT_RE.sub("", ext)
    return ext if 2 <= len(ext) <= 11 else ""


def _safe_leaf(name: str) -> str:
    """A single, safe path component for a result file (no separators/..)."""
    leaf = os.path.basename(str(name or "")).strip()
    leaf = _LEAF_RE.sub("_", leaf)
    return leaf or "output.bin"


def _chmod_private(path: str, mode: int = 0o700) -> None:
    try:
        os.chmod(path, mode)
    except OSError:
        pass  # Windows / non-POSIX filesystems: best effort (§7.1)


def _dir_stats(path: str) -> tuple[int, int]:
    """(files, bytes) under ``path``, ignoring job.json itself."""
    files = total = 0
    for dirpath, _dirs, names in os.walk(path):
        for name in names:
            if dirpath == path and name == "job.json":
                continue
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
                files += 1
            except OSError:
                pass
    return files, total


class RuntimeStore:
    """The job registry plus the on-disk ``runtime/<job_id>/`` layout.

    ``clock`` is injectable so the TTL can be tested without sleeping. All
    mutations take one re-entrant lock: the NiceGUI handlers that call this run
    on the event loop and inside ``run.io_bound`` worker threads alike.
    """

    def __init__(self, root: str = RUNTIME_DIR, ttl: float = JOB_TTL_SECONDS,
                 max_lifetime: float = JOB_MAX_LIFETIME_SECONDS, *,
                 clock=time.time, logger: logging.Logger = log) -> None:
        self.root = os.path.abspath(root)
        self.ttl = float(ttl)
        self.max_lifetime = float(max_lifetime or 0.0)
        self._clock = clock
        self.log = logger
        self._lock = threading.RLock()
        self._jobs: dict[str, dict] = {}
        os.makedirs(self.root, mode=0o700, exist_ok=True)
        _chmod_private(self.root)

    # ---- registry --------------------------------------------------------
    def _now(self) -> float:
        return float(self._clock())

    def job_dir(self, job_id: str) -> str:
        return os.path.join(self.root, _safe_job_id(job_id))

    def has_job(self, job_id: str | None) -> bool:
        with self._lock:
            return bool(job_id) and job_id in self._jobs

    def expires_at(self, job_id: str) -> float | None:
        with self._lock:
            rec = self._jobs.get(job_id)
            return self._expires_at(rec) if rec else None

    def active_jobs(self) -> list[dict]:
        """A snapshot of the registry (used by tests and the verify script)."""
        with self._lock:
            return [{"job_id": jid, "created_at": rec["created_at"],
                     "last_touch_at": rec["last_touch_at"], "expires_at": self._expires_at(rec),
                     "files": dict(rec["files"]), "bytes": rec["bytes"]}
                    for jid, rec in self._jobs.items()]

    def _expires_at(self, rec: dict) -> float:
        exp = rec["last_touch_at"] + self.ttl
        if self.max_lifetime > 0:
            exp = min(exp, rec["created_at"] + self.max_lifetime)
        return exp

    def _is_expired(self, rec: dict, now: float) -> bool:
        return now >= self._expires_at(rec)

    def _write_record(self, job_id: str) -> None:
        """Keep ``job.json`` in step with the in-process registry (§7.1)."""
        rec = self._jobs.get(job_id)
        if rec is None:
            return
        snapshot = {"job_id": job_id, "created_at": rec["created_at"],
                    "last_touch_at": rec["last_touch_at"], "dir": rec["dir"],
                    "files": dict(rec["files"]), "bytes": rec["bytes"]}
        path = os.path.join(rec["dir"], "job.json")
        try:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(snapshot, fh, indent=2)
            _chmod_private(path, 0o600)
        except OSError:
            pass

    # ---- job lifecycle ---------------------------------------------------
    def create_job(self, job_id: str | None = None) -> str:
        with self._lock:
            jid = _safe_job_id(job_id) if job_id else f"rt-{secrets.token_hex(6)}"
            directory = self.job_dir(jid)
            for sub in ("source", "text", "out"):
                os.makedirs(os.path.join(directory, sub), mode=0o700, exist_ok=True)
                _chmod_private(os.path.join(directory, sub))
            _chmod_private(directory)
            now = self._now()
            self._jobs[jid] = {"created_at": now, "last_touch_at": now, "dir": directory,
                               "files": {}, "bytes": 0}
            self._write_record(jid)
            return jid

    def touch(self, job_id: str | None) -> bool:
        """Slide the TTL forward — called by every server-side action on a job."""
        if not job_id:
            return False
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None:
                return False
            rec["last_touch_at"] = self._now()
            self._write_record(job_id)
            return True

    # ---- files -----------------------------------------------------------
    def _store(self, job_id: str, rel: str, data: bytes) -> str | None:
        """Write ``data`` at ``rel`` inside the job dir and return ``rel`` (the
        registry key) — callers store that and pass it back to ``read``."""
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None:
                return None
            path = os.path.join(rec["dir"], rel)
            os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
            with open(path, "wb") as fh:
                fh.write(data)
            _chmod_private(path, 0o600)
            rec["files"][rel] = len(data)
            rec["bytes"] = sum(rec["files"].values())
            rec["last_touch_at"] = self._now()
            self._write_record(job_id)
            return rel

    def put_source(self, job_id: str, index: int, name: str, data: bytes) -> str | None:
        """Store one uploaded original as ``source/<index>.<ext>`` (the original
        file *name* is deliberately not used — only its extension)."""
        return self._store(job_id, f"source/{int(index)}{_safe_ext(name)}", data)

    def put_text(self, job_id: str, index: int, text: str) -> str | None:
        return self._store(job_id, f"text/{int(index)}.txt", text.encode("utf-8"))

    def put_out(self, job_id: str, name: str, data: bytes) -> str | None:
        return self._store(job_id, f"out/{_safe_leaf(name)}", data)

    def read(self, job_id: str, rel: str) -> bytes | None:
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None or rel not in rec["files"]:
                return None
            path = os.path.join(rec["dir"], rel)
        try:
            with open(path, "rb") as fh:
                return fh.read()
        except OSError:
            return None

    def drop_file(self, job_id: str, rel: str) -> bool:
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None or rel not in rec["files"]:
                return False
            try:
                os.remove(os.path.join(rec["dir"], rel))
            except OSError:
                pass
            rec["files"].pop(rel, None)
            rec["bytes"] = sum(rec["files"].values())
            self._write_record(job_id)
            return True

    def clear_out(self, job_id: str) -> int:
        """Delete a job's result files once their response has been served
        (§7.3). The TTL sweeper is the fallback if this never runs."""
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None:
                return 0
            removed = 0
            for rel in [r for r in rec["files"] if r.startswith("out/")]:
                try:
                    os.remove(os.path.join(rec["dir"], rel))
                except OSError:
                    continue
                rec["files"].pop(rel, None)
                removed += 1
            rec["bytes"] = sum(rec["files"].values())
            self._write_record(job_id)
            return removed

    # ---- cleanup ---------------------------------------------------------
    def finish_job(self, job_id: str, reason: str = "done") -> bool:
        """Delete a whole job directory and drop it from the registry."""
        with self._lock:
            return self._remove_job(job_id, reason, self._jobs.get(job_id))

    def purge_expired(self, *, now: float | None = None) -> list[str]:
        """Delete every job whose sliding TTL (or hard cap) has passed."""
        now = self._now() if now is None else float(now)
        purged: list[str] = []
        with self._lock:
            for jid in list(self._jobs):
                rec = self._jobs.get(jid)
                if rec is not None and self._is_expired(rec, now) and self.finish_job(jid, "expired"):
                    purged.append(jid)
        return purged

    def purge_all(self, reason: str = "shutdown") -> list[str]:
        """Delete every registered job (shutdown / atexit)."""
        with self._lock:
            return [jid for jid in list(self._jobs) if self.finish_job(jid, reason)]

    def startup_sweep(self) -> list[str]:
        """Clear whatever is under ``runtime/`` from a previous process (§7.4.3),
        including directories with no registry entry (crash / power loss)."""
        purged: list[str] = []
        with self._lock:
            for jid in self._scan_disk():
                if jid not in self._jobs:
                    self._recover(jid)
                if self.finish_job(jid, "startup"):
                    purged.append(jid)
        return purged

    def _remove_job(self, job_id: str, reason: str, rec: dict | None) -> bool:
        directory = (rec or {}).get("dir") or self.job_dir(job_id)
        if rec is not None:
            files, total = len(rec.get("files") or {}), int(rec.get("bytes") or 0)
        else:
            files, total = _dir_stats(directory)
        if files == 0:
            # Stray directories (crash before job.json) have no registry counts —
            # measure them from disk so the purge log says something truthful.
            files, total = _dir_stats(directory)
        try:
            shutil.rmtree(directory)
        except FileNotFoundError:
            pass
        except OSError as exc:
            # Keep the job registered so the next sweep retries it (§7.4).
            self.log.warning("ttl-error job=%s reason=%s error=%s",
                             job_id, reason, type(exc).__name__)
            return False
        self._jobs.pop(job_id, None)
        self._log_purge(job_id, reason, files, total)
        return True

    def _log_purge(self, job_id: str, reason: str, files: int, total: int) -> None:
        # §7.4 — counts only; never file names, document text or mappings.
        self.log.info("ttl-purge job=%s reason=%s files=%s bytes=%s",
                      job_id, reason, files, total)

    def _scan_disk(self) -> list[str]:
        try:
            entries = os.listdir(self.root)
        except OSError:
            return []
        return sorted(e for e in entries
                      if os.path.isdir(os.path.join(self.root, e)))

    def _recover(self, job_id: str) -> dict:
        """Rebuild a registry entry from ``job.json`` so a leftover directory can
        be reported and removed with real counts (best effort)."""
        directory = self.job_dir(job_id)
        rec = {"created_at": 0.0, "last_touch_at": 0.0, "dir": directory,
               "files": {}, "bytes": 0}
        try:
            with open(os.path.join(directory, "job.json"), encoding="utf-8") as fh:
                data = json.load(fh)
            rec["created_at"] = float(data.get("created_at") or 0.0)
            rec["last_touch_at"] = float(data.get("last_touch_at") or 0.0)
            files = data.get("files")
            if isinstance(files, dict):
                rec["files"] = {str(k): int(v or 0) for k, v in files.items()}
                rec["bytes"] = sum(rec["files"].values())
        except (OSError, TypeError, ValueError):
            pass
        self._jobs[job_id] = rec
        return rec


# The process-wide store. app.py drives it; tests build their own instances.
RUNTIME = RuntimeStore()

_scheduler_installed = False


def _atexit_purge() -> None:
    try:
        RUNTIME.purge_all("shutdown")
    except Exception:  # noqa: BLE001 — never raise from an interpreter-exit hook
        pass


def install_scheduler(app, *, interval: float = SWEEP_INTERVAL_SECONDS) -> None:
    """Wire cleanup layers 1 and 3 onto a NiceGUI/FastAPI app (§7.4): a startup
    sweep + periodic sweeper, a shutdown purge and an ``atexit`` fallback.
    Safe to call more than once (the hooks are registered only once)."""
    global _scheduler_installed
    if _scheduler_installed:
        return
    _scheduler_installed = True
    state: dict = {"task": None}

    async def _sweep_loop() -> None:
        while True:
            try:
                RUNTIME.purge_expired()
            except Exception:  # noqa: BLE001 — a sweep failure must not kill the loop
                log.exception("TTL sweep failed")
            await asyncio.sleep(interval)

    async def _on_startup() -> None:
        RUNTIME.startup_sweep()
        state["task"] = asyncio.create_task(_sweep_loop())

    async def _on_shutdown() -> None:
        task = state["task"]
        if task is not None:
            task.cancel()
            state["task"] = None
        RUNTIME.purge_all("shutdown")

    app.on_startup(_on_startup)
    app.on_shutdown(_on_shutdown)
    atexit.register(_atexit_purge)
