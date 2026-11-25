# P1 worker interface (frozen v1)

The UI talks to exactly one document worker through
`web/lib/pyodide_bridge.js`. Pyodide and BetterOffice share that worker and run
one request at a time. `PROTOCOL_VERSION` in `web/lib/protocol.js` is `1`; a
shape change needs a version bump and an interface review, because the UI line
is built against this page.

## Main thread API

```js
const bridge = createBridge({ onStatus });
await bridge.ready; // {protocol, pyodide, ops}
const result = await bridge.run({ op, bytes, fileName, options, onProgress });
bridge.cancel();      // rejects the active run with CANCELLED
bridge.dispose();
bridge.stats();       // {runs, recycles, lastBytes, lastDurationMs}
```

- `bytes` is a `Uint8Array`; its buffer is transferred (zero-copy) and is
  detached afterwards.
- Only one run may be active; a second call rejects with `BUSY`.
- `onProgress({id, phase, done, total})` fires with `phase` from `PHASES`.
- `onStatus({state, reason, stats})` tracks `initializing | ready | failed`.

## Ops

| op | status | result |
|---|---|---|
| `inspect` | P1 foundation | `{parts, paragraphs, status, warnings}` |
| `redact` | P1 docx / P2 xlsx | `{bytes, tokens, items, counts, hits, size, heapBytes, warnings}` |
| `restore` | P1 docx / P2 xlsx | `{bytes, tokens, counts, hits, size, heapBytes, warnings}` |
| `echo` | diagnostics only | `{payload, protocol}` |

`inspect` runs the four hard gates in Pyodide **before** BetterOffice
`parseDocx`, then reports the part count and paragraph count.  For `.xlsx` it
does not call a document library at all (`paragraphs` is 0).

`redact` options: `{entities: [{canonical, type, aliases}]}`. It replaces every
text container (body, headers, footers, footnotes, endnotes, comments,
tracked-change text, author attributes, `docProps/core.xml`), then repacks via
BetterOffice and routes the result through `postprocess()`.

`restore` options: `{token_map: {"[PERSON_001]": "John Smith"}}`.

For `.xlsx`, `redact` / `restore` run the Python part-direct engine
(`lethe/xlsx_engine.py`) and return the finished package; BetterOffice is not
involved.  They return `bytes` the same way, plus `warnings` with the xlsx
degradation codes (`xlsx.pivot_cache`, `xlsx.chart_cache`, `xlsx.smartart`,
`xlsx.ole`, `xlsx.formula_literal`, `xlsx.external_links`).  The progress
phases are `detect → postprocess` (there is no library write phase).

Both return `bytes` as a transferred `Uint8Array`; the worker also emits
`detect → write → postprocess` progress phases.

`heapBytes` is `pyodide._module.HEAPU8.byteLength` after the run (WASM memory
only grows, so it is the run's high-water mark). `bridge.heapBytes()` asks the
idle worker for the same value; the DoD tests use both.

## Worker messages

| direction | message |
|---|---|
| main → worker | `{type:"run", id, op, fileName, options, bytes}` |
| worker → main | `{type:"ready", protocol, pyodide, ops}` |
| worker → main | `{type:"init-progress", phase}` |
| worker → main | `{type:"init-error", code, message}` |
| worker → main | `{type:"progress", id, phase, done?, total?}` |
| worker → main | `{type:"result", id, result}` |
| worker → main | `{type:"error", id, code, message, detail?}` |

## Error codes

`OOM`, `TOO_LARGE`, `PARSE_FAILED`, `CANCELLED`, `TIMEOUT`, `BUSY`,
`INIT_FAILED`, `INTERNAL`.

Gate rejections come back as `TOO_LARGE` with `detail.gate` / `detail.part`
(`G0`/`G5` invalid or encrypted packages are `PARSE_FAILED`). Every gate line
is also in `detail.findings`.

## Liveness

Watchdog defaults: first byte 60s, between progress ticks 4s, packing 120s.
A stalled or cancelled executing worker is terminated and respawned; the UI
sees `initializing`, never a stuck `init-error` badge. Cancelling while the
worker is still initialising does not touch initialisation at all.

Files above 35MiB recycle the worker after the result is delivered
(`reason: "large-task"`). OOM errors recycle immediately.
