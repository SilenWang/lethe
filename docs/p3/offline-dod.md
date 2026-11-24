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

Measured on the pptx branch with pptx wasm deferred to the first pptx run:

* realistic 49.1 MB deck / 506 hits: baseline 1,138 MB, peak **2,671 MB**,
  delta 1,533 MB, no abort;
* stress 49.3 MB / 10,101 hits: baseline 1,146 MB, peak **2,744 MB**, delta
  1,598 MB.

Deferring pptx wasm saved only ~25–45 MB; the remaining ~0.59 GB baseline
increase is eager docx.  Absolute RSS is still 171–244 MB over the unchanged
2.5 GB gate.  P3 must defer docx wasm/module initialisation as well (assets
pre-cached, offline still zero-network; ~0.5 day + re-measure) or obtain a
user-approved gate change.  The xlsx path was re-measured at 1,865 MB absolute,
under its 2 GB gate.

## Acceptance wording

> 清空缓存 → 在线启动一次并等待预加载完成 → 完全断网重载 → 直接依次处理
> docx、xlsx、pptx。三者都必须成功，且不得触发任何网络请求；xlsx 不得重新
> 引入 BetterOffice xlsx 资产。
