# P1 DoD measurements (UI path)

All numbers come from `tests/browser/test_p1_dod.py`, run on the built static
app in headless Chromium, served from `127.0.0.1`. The tests drive the same
`window.__letheBridge` instance the UI creates.

Sampling method:

- **WASM heap** — `pyodide._module.HEAPU8.byteLength` read by the worker after
  each phase. WASM memory only grows inside a worker, so the value after a run
  is that run's high-water mark. It is returned as `result.heapBytes` and also
  attached to every `progress` message.
- **Main-thread JS heap** — `performance.memory.usedJSHeapSize` sampled every
  50 ms while the run is in flight (Chromium only).
- **Recycle** — `bridge.stats().recycles`, incremented by the `>35MiB`
  post-result rebuild.

## Offline cold start + installability

`test_offline_install_and_docx_roundtrip`:

1. online visit installs the service worker; manifest `start_url=/`,
   `display=standalone`, 192/512 icons all return 200, secure context true;
2. a second controlled visit fills the lazy runtime cache (asserted:
   `/assets/vendor/pyodide/pyodide.asm.wasm` is in a cache), then one online
   docx run caches the docx BetterOffice set;
3. network is cut (`context.set_offline(True)`), the page is reloaded, the SW
   controller is present, and a docx redact → restore completes with
   **30 replacements, 43,893 B restored, heap 28.8 MiB**, and zero external
   requests attempted.

Per-format lazy caching is the documented policy: the docx runtime is cached by
the first docx run, not at install time.

## File-size peaks

`test_peak_memory_20mb_and_50mb`:

| file | WASM heap high-water | wall time | main-thread JS max |
|---|---:|---:|---:|
| 20 MB docx | 154.5 MiB | 1,129 ms | 9.5 MiB |
| 49 MiB docx (~50 MB tier) | 320.6 MiB | 2,641 ms | 9.5 MiB |

Thresholds asserted in the test: 20 MB < 1.5 GiB, 50 MB tier ≤ 2.5 GiB.

## Three 35 MB runs

`test_three_35mb_runs_recycle_and_return_to_baseline`:

| | value |
|---|---|
| idle heap after first init | 24.0 MiB |
| per-run peak (36 MiB input) | 234.0 MiB, three identical runs |
| idle heap after each rebuild | 24.0 MiB, 24.0 MiB, 24.0 MiB |
| recycle counter | 1 → 2 → 3 |

Every run above the 35 MiB threshold terminates the worker after delivering
the result; the rebuilt worker returns to the original 24.0 MiB baseline.
