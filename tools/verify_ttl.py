#!/usr/bin/env python3
"""One-shot, repeatable TTL verification for VYB-359 (VYB-354 T4).

Runs a full server-side run through the real engine and the real RuntimeStore
with a short TTL — upload → extract → detect → redact → download — then shows
that after the TTL expires the DATA_DIR has no leftover of that run, and that a
startup sweep clears crash residuals.

Usage:
    pixi run python tools/verify_ttl.py                 # repo's pypi env
    python tools/verify_ttl.py --ttl-seconds 3

Returns non-zero on any failed assertion so it can gate CI.
"""
from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
import tempfile
import time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)


SAMPLE = (
    "Dear Mr John Smith,\n\n"
    "Acme Capital Partners (\"Acme\") confirms the deal with Meridian Holdings.\n"
    "Queries: john.smith@acme.com or +65 6789 1234.\n\n"
    "Kind regards,\nJane Doe"
)


def _tree(root: str) -> list[str]:
    out = []
    for dirpath, _dirs, names in os.walk(root):
        for name in names:
            out.append(os.path.relpath(os.path.join(dirpath, name), root))
    return sorted(out)


def _files_count(root: str) -> int:
    n = 0
    for _dirpath, _dirs, names in os.walk(root):
        n += len(names)
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ttl-seconds", type=float, default=3.0,
                    help="TTL to verify with (default 3; sleeps TTL+1 to cross it)")
    ap.add_argument("--runtime-dir", default=None,
                    help="Where to put the temporary DATA_DIR (default: fresh temp dir)")
    args = ap.parse_args()

    scratch = args.runtime_dir or tempfile.mkdtemp(prefix="lethe-ttl-verify-")
    data_dir = os.path.join(scratch, "data")
    runtime_root = os.path.join(data_dir, "runtime")
    os.makedirs(runtime_root, exist_ok=True)

    # Isolate the process and point the module-level constants at the temp area
    # BEFORE importing the package.
    os.environ["LETHE_DATA_DIR"] = data_dir
    os.environ["LETHE_RUNTIME_DIR"] = runtime_root
    os.environ["LETHE_JOB_TTL_SECONDS"] = str(args.ttl_seconds)
    os.environ["LETHE_JOB_MAX_LIFETIME_SECONDS"] = "120"

    from lethe import Entity, assign_tokens, build_replacer, detect
    from lethe import runtime as runtime_mod
    from lethe import extract_text, redact_document

    captured: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record.getMessage())

    runtime_mod.log.setLevel(logging.INFO)
    handler = _Capture()
    handler.setLevel(logging.INFO)
    runtime_mod.log.addHandler(handler)
    store = runtime_mod.RuntimeStore(root=runtime_root, ttl=args.ttl_seconds,
                                     max_lifetime=120)

    def step(msg: str) -> None:
        print(f"\n== {msg} ==")

    step(f"1/6  create job + upload source  (TTL={args.ttl_seconds:g}s)")
    jid = store.create_job()
    source = SAMPLE.encode("utf-8")
    store.put_source(jid, 0, "sample-memo.txt", source)
    assert os.path.isdir(store.job_dir(jid))
    print(f"job_id      : {jid}")
    print(f"runtime dir : {store.root}")
    print("files during TTL:")
    for rel in _tree(store.job_dir(jid)):
        print(f"  {rel}")

    step("2/6  extract text + detect")
    text = extract_text(source, "txt")
    store.put_text(jid, 0, text)
    ents = [Entity("John Smith", "PERSON", ["Smith", "Mr Smith"]),
            Entity("Acme Capital Partners", "COUNTERPARTY", ["Acme"])]
    items = assign_tokens(detect(text, ents))
    assert items, "detection found nothing"
    print(f"detected items: {len(items)}  "
          f"(e.g. {items[0].canonical!r} -> {items[0].token})")
    print("files after extract:")
    for rel in _tree(store.job_dir(jid)):
        print(f"  {rel}")

    step("3/6  redact -> stage result in runtime/<job>/out/")
    repl, mapping = build_replacer(items)
    out_bytes, ext, hits = redact_document(source, "txt", repl)
    store.put_out(jid, "sample-memo__deidentified.txt", out_bytes)
    assert hits > 0 and b"John Smith" not in out_bytes
    print(f"redaction hits: {hits}; source name gone from output: "
          f"{b'John Smith' not in out_bytes}")
    print("files during staging:")
    for rel in _tree(store.job_dir(jid)):
        print(f"  {rel}")

    step("4/6  download -> out/ deleted immediately after the response")
    download = store.read(jid, "out/sample-memo__deidentified.txt")
    assert download == out_bytes, "download payload differed from the staged result"
    assert store.clear_out(jid) == 1
    print("download verified (bytes match); files after download:")
    for rel in _tree(store.job_dir(jid)):
        print(f"  {rel}")
    assert _files_count(os.path.join(store.job_dir(jid), "out")) == 0

    step(f"5/6  wait TTL ({args.ttl_seconds:g}s) -> purge")
    time.sleep(args.ttl_seconds + 0.5)
    purged = store.purge_expired()
    print(f"purged jobs: {purged}")
    print("runtime tree after purge:")
    print(f"  data_dir files: {_files_count(data_dir)}  "
          f"(expected 0)  -> {_tree(data_dir)}")
    assert purged == [jid]
    assert not store.active_jobs()
    assert os.path.isdir(runtime_root) and _files_count(data_dir) == 0

    step("6/6  startup sweep removes crash residuals")
    stray = os.path.join(runtime_root, "rt-crashed-job")
    os.makedirs(os.path.join(stray, "source"))
    with open(os.path.join(stray, "source", "0.pdf"), "wb") as fh:
        fh.write(b"%PDF-1.4 fake")
    swept = store.startup_sweep()
    print(f"swept: {swept}")
    assert not os.path.exists(stray) and _files_count(data_dir) == 0

    print("\n-- purge log lines (counts only, no file names / content) --")
    for line in captured:
        if line.startswith(("ttl-purge", "ttl-error")):
            print(f"  {line}")
    assert any(line.startswith("ttl-purge") for line in captured)

    print("\nRESULT: PASS — full flow completed inside the TTL; after expiry the "
          "DATA_DIR has no leftover of the run.")
    if args.runtime_dir is None:
        shutil.rmtree(scratch, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
