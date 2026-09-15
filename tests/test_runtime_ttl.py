"""TTL tests for the server-side runtime workspace (§7 of the architecture doc).

Covers the full job lifecycle with an injectable clock: create → untouched
within TTL → sliding touch extends → expiry deletes → hard lifetime cap →
startup sweep → shutdown purge → immediate result cleanup → purge log
whitelist (no file names / document content in any log line).

Runs under pytest (`pytest tests/test_runtime_ttl.py`) or directly
(`python tests/test_runtime_ttl.py`).
"""
import json
import logging
import os
import re
import sys
import tempfile
import contextlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lethe.runtime import RuntimeStore  # noqa: E402


@contextlib.contextmanager
def _capture_logs(logger: str = "lethe.runtime"):
    """Capture formatted log lines from a logger, test-style (works both under
    pytest and as a plain script — no pytest fixtures)."""
    buf: list[str] = []
    h = logging.Handler()
    h.setFormatter(logging.Formatter("%(message)s"))

    def emit(record: logging.LogRecord) -> None:
        buf.append(h.format(record))

    h.emit = emit
    target = logging.getLogger(logger)
    old_level = target.level
    target.setLevel(logging.INFO)
    target.addHandler(h)
    try:
        yield buf
    finally:
        target.removeHandler(h)
        target.setLevel(old_level)


def _mk(root: str, **kw) -> RuntimeStore:
    """A store on a fresh temp root with an injectable second-based clock."""
    clock = kw.pop("clock", None) or iter_clock(1000.0)
    return RuntimeStore(os.path.join(root, "runtime"), **kw, clock=clock)


class iter_clock:
    """A tiny fake clock: each call returns the current value; ``advance`` moves
    it forward so tests don't sleep."""

    def __init__(self, start: float = 1000.0):
        self.now = float(start)

    def __call__(self) -> float:
        return self.now

    def advance(self, delta: float) -> None:
        self.now += delta


def _list_files(root: str) -> list[str]:
    out = []
    for dirpath, _dirs, names in os.walk(root):
        for name in names:
            out.append(os.path.relpath(os.path.join(dirpath, name), root))
    return sorted(out)


def _populate(store: RuntimeStore, jid: str) -> None:
    store.put_source(jid, 0, "memo.txt", b"Dear John Smith, regards.")
    store.put_text(jid, 0, "Dear John Smith, regards.")
    store.put_out(jid, "memo__deidentified.txt", b"Dear [PERSON_001].")


def test_create_job_layout_and_private_perms():
    with tempfile.TemporaryDirectory() as tmp:
        store = _mk(tmp)
        jid = store.create_job()
        job_dir = store.job_dir(jid)
        for sub in ("", "source", "text", "out"):
            assert os.path.isdir(os.path.join(job_dir, sub)), f"missing {sub or '<root>'}"
        assert os.path.exists(os.path.join(job_dir, "job.json"))
        snapshot = json.load(open(os.path.join(job_dir, "job.json"), encoding="utf-8"))
        assert snapshot["job_id"] == jid
        assert snapshot["files"] == {}
        assert snapshot["bytes"] == 0
        if os.name != "nt":
            assert os.stat(job_dir).st_mode & 0o777 == 0o700


def test_not_expired_within_ttl():
    with tempfile.TemporaryDirectory() as tmp:
        clock = iter_clock(1000.0)
        store = RuntimeStore(os.path.join(tmp, "runtime"), ttl=5, max_lifetime=60, clock=clock)
        jid = store.create_job()
        _populate(store, jid)
        store.purge_expired(now=1004.9)
        assert store.has_job(jid)
        assert os.path.isdir(store.job_dir(jid))


def test_expired_is_deleted_and_logged():
    with tempfile.TemporaryDirectory() as tmp:
        clock = iter_clock(1000.0)
        store = RuntimeStore(os.path.join(tmp, "runtime"), ttl=5, max_lifetime=60, clock=clock)
        with _capture_logs() as captured:
            jid = store.create_job()
            _populate(store, jid)
            purged = store.purge_expired(now=1005.0)
        assert purged == [jid]
        assert not store.has_job(jid)
        assert not os.path.isdir(store.job_dir(jid))
        purge_lines = [m for m in captured if m.startswith("ttl-purge")]
        assert len(purge_lines) == 1
        assert re.fullmatch(r"ttl-purge job=\S+ reason=expired files=\d+ bytes=\d+",
                            purge_lines[0]), purge_lines


def test_sliding_ttl_touch_extends():
    with tempfile.TemporaryDirectory() as tmp:
        clock = iter_clock(1000.0)
        store = RuntimeStore(os.path.join(tmp, "runtime"), ttl=5, max_lifetime=60, clock=clock)
        jid = store.create_job()
        _populate(store, jid)
        clock.advance(4.0)
        assert store.touch(jid) is True
        # Without the touch the job would expire at 1005; it now expires at 1009.
        store.purge_expired(now=1008.0)
        assert store.has_job(jid)
        store.purge_expired(now=1009.0)
        assert not store.has_job(jid)


def test_max_lifetime_is_a_hard_cap():
    with tempfile.TemporaryDirectory() as tmp:
        clock = iter_clock(1000.0)
        store = RuntimeStore(os.path.join(tmp, "runtime"), ttl=30, max_lifetime=10, clock=clock)
        jid = store.create_job()
        _populate(store, jid)
        clock.advance(9.0)
        assert store.touch(jid) is True  # would expire at 1039 — but the cap is 1010
        store.purge_expired(now=1012.0)
        assert not store.has_job(jid)


def test_startup_sweep_clears_residuals():
    with tempfile.TemporaryDirectory() as tmp:
        clock = iter_clock(1000.0)
        store = RuntimeStore(os.path.join(tmp, "runtime"), ttl=5, max_lifetime=60, clock=clock)
        jid = store.create_job()
        _populate(store, jid)
        # A stray directory a previous process left behind (no registry entry).
        stray = os.path.join(store.root, "rt-crashed-job")
        os.makedirs(os.path.join(stray, "source"))
        with open(os.path.join(stray, "source", "0.pdf"), "wb") as fh:
            fh.write(b"%PDF-1.4 fake")
        purged = store.startup_sweep()
        assert sorted(purged) == sorted([jid, "rt-crashed-job"])
        assert not os.path.exists(store.job_dir(jid))
        assert not os.path.exists(stray)
        # The sweep only leaves the (now empty) runtime root.
        assert _list_files(store.root) == []


def test_finish_job_done_and_clear_out():
    with tempfile.TemporaryDirectory() as tmp:
        clock = iter_clock(1000.0)
        store = RuntimeStore(os.path.join(tmp, "runtime"), ttl=5, max_lifetime=60, clock=clock)
        jid = store.create_job()
        _populate(store, jid)
        # Results are deleted right after the response is built (§7.3)…
        assert store.clear_out(jid) == 1
        assert _list_files(store.job_dir(jid)) == [
            "job.json", "source/0.txt", "text/0.txt"]
        # …and the rest of the job goes when the run is finished.
        assert store.finish_job(jid, "done") is True
        assert not store.has_job(jid)
        assert not os.path.exists(store.job_dir(jid))


def test_purge_all_on_shutdown():
    with tempfile.TemporaryDirectory() as tmp:
        clock = iter_clock(1000.0)
        store = RuntimeStore(os.path.join(tmp, "runtime"), ttl=5, max_lifetime=60, clock=clock)
        a, b = store.create_job(), store.create_job()
        _populate(store, a)
        _populate(store, b)
        assert sorted(store.purge_all("shutdown")) == sorted([a, b])
        assert store.active_jobs() == []
        assert _list_files(store.root) == []


def test_files_tracked_in_registry_and_readable():
    with tempfile.TemporaryDirectory() as tmp:
        store = _mk(tmp)
        jid = store.create_job()
        _populate(store, jid)
        rec = store.active_jobs()[0]
        assert rec["files"] == {
            "out/memo__deidentified.txt": 18,
            "source/0.txt": 25,
            "text/0.txt": 25,
        }
        assert rec["bytes"] == sum(rec["files"].values())
        assert store.read(jid, "source/0.txt") == b"Dear John Smith, regards."
        assert store.read(jid, "out/memo__deidentified.txt") == b"Dear [PERSON_001]."
        assert store.read(jid, "source/nope.txt") is None


def test_purge_logs_never_contain_filenames_or_content():
    with tempfile.TemporaryDirectory() as tmp:
        clock = iter_clock(1000.0)
        store = RuntimeStore(os.path.join(tmp, "runtime"), ttl=5, max_lifetime=60, clock=clock)
        with _capture_logs() as captured:
            jid = store.create_job()
            store.put_source(jid, 0, "Alice Smith - board memo.docx", b"Alice Smith content")
            store.put_text(jid, 0, "Alice Smith content")
            store.put_out(jid, "Alice Smith - board memo__deidentified.docx", b"[PERSON_001]")
            store.finish_job(jid, "done")
            store.purge_all("shutdown")  # must be a no-op, and stay clean
        for msg in captured:
            assert "Alice" not in msg and "Smith" not in msg
            assert "memo" not in msg and "board" not in msg
            assert "content" not in msg and "PERSON_001" not in msg
            if msg.startswith("ttl-purge"):
                assert re.fullmatch(r"ttl-purge job=\S+ reason=done files=\d+ bytes=\d+", msg), msg


def test_source_extension_is_sanitised():
    with tempfile.TemporaryDirectory() as tmp:
        store = _mk(tmp)
        jid = store.create_job()
        rel = store.put_source(jid, 3, "weird..Name.DOCX", b"x")
        assert rel == "source/3.docx"
        assert store.read(jid, rel) == b"x"


def test_api_middleware_sweeps_before_every_api_request():
    """§7.4 layer 2 — the /api/* pre-request sweep is wired in app.py."""
    import asyncio
    import app as app_module

    sweeps: list[str] = []
    calls: list[str] = []

    class FakeURL:
        def __init__(self, path: str):
            self.path = path

    class FakeRequest:
        def __init__(self, path: str):
            self.url = FakeURL(path)

    class SpyStore:
        def purge_expired(self):
            sweeps.append("purge")
            return []

    async def call_next(_):
        calls.append("next")
        return "response"

    original = app_module.runtime.RUNTIME
    app_module.runtime.RUNTIME = SpyStore()
    try:
        assert asyncio.run(app_module._ttl_pre_request(FakeRequest("/api/migrate/status"), call_next)) \
            == "response"
        assert sweeps == ["purge"]
        asyncio.run(app_module._ttl_pre_request(FakeRequest("/static/client-store.js"), call_next))
        assert sweeps == ["purge"], "non-API requests must not sweep"
    finally:
        app_module.runtime.RUNTIME = original


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"RUNTIME-TTL OK — {len(fns)} tests passed")
