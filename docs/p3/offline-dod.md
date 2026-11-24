# P3 offline DoD handoff

The eager-preload decision is implemented on both P2 branches.  Remaining P3
work after they merge:

1. **Merge the two runtime configs** (0.5 day).  The union is
   `["docx","xlsx","pptx"]`, BetterOffice `["docx","pptx"]`, and all three
   engine modules in `PY_SOURCES`.  Resolve only the worker/UI routing
   conflicts; the engines are independent.
2. **Merged three-format offline e2e** (1 day).  Clear caches → online start
   once → wait for `precache-done` → offline reload → process docx, xlsx, pptx
   in order.  Assert zero external requests, zero leaks, and text round-trip.
3. **50MB memory matrix with eager loading** (0.5–1 day).  Re-run docx /
   xlsx / pptx 50MB with docx+pptx BetterOffice wasm both initialised; update
   the three gates if the eager baseline changes the numbers (report first,
   do not silently raise the gate).
4. **P3 release docs/version bump** (0.5 day).  Document the first-start
   download size, progress/retry, cache invalidation on `CACHE_VERSION`, and
   the merged acceptance in the release notes.

Total remaining P3 estimate: **2.5–3 person-days** (excluding review/merge
queue).  Until then, each P2 branch's offline test covers only its own formats
(docx+xlsx or docx+pptx); the three-format sequence is the P3 gate.

## Eager-loading memory decision

The pptx branch now keeps assets/docx eager and defers `pptx.initWasm()` until
the first pptx run.  Redact-only absolute RSS:

* realistic 49.1 MB deck / 506 hits: baseline 1,138 MB, absolute peak
  **2,671 MB**, delta 1,533 MB, no abort;
* stress 49.3 MB / 10,101 hits: baseline 1,146 MB, absolute peak
  **2,744 MB**, delta 1,598 MB.

Deferring pptx wasm saved only ~25–45 MB: the remaining ~0.59 GB baseline
increase is eager **docx**.  Absolute RSS is still 0.17–0.24 GB over the
unchanged 2.5 GB gate.  P3 must either defer the docx wasm/module
initialisation as well (assets still pre-cached; offline still zero-network;
~0.5 day + re-measure), or the user must approve a different absolute gate.
Do not silently change the DoD.

xlsx was re-measured with eager docx: 49.8 MB / 250,001 hits, baseline
1,137 MB, absolute peak **1,865 MB**, delta 728 MB — under the 2 GB xlsx gate.
The merged branch adds only the pptx module import (no wasm) for xlsx; rerun
the merged matrix in P3.

## Acceptance wording

> 清空缓存 → 在线启动一次并等待预加载完成 → 完全断网重载 → 直接依次处理
> docx、xlsx、pptx。三者都必须成功，且不得触发任何网络请求；xlsx 不得重新
> 引入 BetterOffice xlsx 资产。
