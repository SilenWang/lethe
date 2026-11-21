// Main-thread half of the single document worker.
//
// One request at a time (the worker is deliberately sequential), transferable
// upload bytes, a stall watchdog, and cancellation that never turns a healthy
// initialising worker into a permanent "load failed" badge.
import {
  DEFAULT_LIMITS,
  ERROR_CODES,
  LARGE_TASK_BYTES,
  PROTOCOL_VERSION,
} from "./protocol.js";

let counter = 0;

function bridgeError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function classifyError(error) {
  if (error && typeof error.code === "string") return error.code;
  const text = `${error?.name || ""} ${error?.message || error}`.toLowerCase();
  if (/out of memory|grow failed|cannot enlarge memory|memory access out of bounds/.test(text)) {
    return ERROR_CODES.OOM;
  }
  if (/badzipfile|invalid zip|not a zip|crc error|xmlsyntaxerror|parse error/.test(text)) {
    return ERROR_CODES.PARSE_FAILED;
  }
  if (/cancel|abort/.test(text)) return ERROR_CODES.CANCELLED;
  if (/timeout|timed out|无响应/.test(text)) return ERROR_CODES.TIMEOUT;
  return ERROR_CODES.INTERNAL;
}

export function createBridge(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const recycleThresholdBytes = options.recycleThresholdBytes ?? LARGE_TASK_BYTES;
  const workerUrl = options.workerUrl ?? "../worker/pyodide_worker.js";
  const onStatus = options.onStatus ?? (() => {});

  let worker = null;
  let state = "idle"; // idle | initializing | ready | failed | disposed
  let pending = null;
  let watcher = null;
  let readyPromise;
  let resolveReady;
  let rejectReady;
  const statsWaiters = new Map();
  const stats = { runs: 0, recycles: 0, lastBytes: 0, lastDurationMs: 0 };

  // Every spawned worker gets a fresh init promise. A cancelled init therefore
  // never leaves the next request holding a rejected promise.
  function armReady() {
    readyPromise = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    readyPromise.catch(() => {});
  }
  armReady();

  const setState = (next, reason = null) => {
    state = next;
    onStatus({ state, reason, stats: { ...stats } });
  };

  function failPending(error) {
    if (!pending) return;
    const { reject } = pending;
    pending = null;
    reject(error);
  }

  function spawn() {
    if (state === "disposed") return;
    if (worker) worker.terminate();
    armReady();
    setState("initializing");
    worker = new Worker(workerUrl, { type: "module", name: "lethe-doc-worker" });
    worker.onmessage = ({ data: message }) => {
      if (message.type === "ready") {
        setState("ready");
        resolveReady({ protocol: message.protocol, pyodide: message.pyodide, ops: message.ops });
      } else if (message.type === "init-error") {
        setState("failed", message.code);
        rejectReady(bridgeError(message.code || "INIT_FAILED", message.message));
        failPending(bridgeError(message.code || "INIT_FAILED", message.message));
      } else if (message.type === "init-progress") {
        onStatus({ state: "initializing", phase: message.phase });
      } else if (message.type === "stats") {
        const waiter = statsWaiters.get(message.id);
        if (waiter) {
          statsWaiters.delete(message.id);
          waiter.resolve(message.heapBytes);
        }
      } else if (pending && message.id === pending.id) {
        pending.lastSeen = Date.now();
        if (message.type === "progress") {
          pending.limit =
            message.phase === "packing"
              ? limits.packingMs
              : message.done !== undefined
                ? limits.interBatchMs
                : limits.firstByteMs;
          pending.onProgress?.(message);
        } else if (message.type === "result") {
          const finished = pending;
          pending = null;
          stats.lastDurationMs = Date.now() - finished.startedAt;
          finished.resolve(message.result);
          if (finished.size > recycleThresholdBytes) recycle("large-task");
        } else if (message.type === "error") {
          const finished = pending;
          pending = null;
          finished.reject(
            bridgeError(message.code || "INTERNAL", message.message, { detail: message.detail }),
          );
          if (message.code === ERROR_CODES.OOM) recycle("oom");
        }
      }
    };
    worker.onerror = (event) => {
      const error = bridgeError(classifyError(event), event.message || "worker crashed");
      failPending(error);
      setState("failed", "worker-crash");
      recycle("crash");
    };
    if (!watcher) {
      watcher = setInterval(() => {
        if (!pending || !pending.sent) return;
        if (Date.now() - pending.lastSeen < pending.limit) return;
        const error = bridgeError(
          ERROR_CODES.TIMEOUT,
          "worker stopped reporting progress; it was restarted",
        );
        failPending(error);
        recycle("watchdog");
      }, 250);
    }
  }

  function recycle(reason) {
    if (state === "disposed") return;
    stats.recycles += 1;
    spawn();
    onStatus({ state: "initializing", reason, stats: { ...stats } });
  }

  function whenReady() {
    if (state === "ready") return Promise.resolve();
    if (state === "idle" || state === "failed") {
      // Failed init is retried once per request; cancel never reaches here.
      spawn();
    }
    return readyPromise.then(() => undefined);
  }

  function run({ op, bytes, fileName = "upload.docx", options: runOptions = {}, onProgress }) {
    if (state === "disposed") {
      return Promise.reject(bridgeError(ERROR_CODES.INTERNAL, "bridge disposed"));
    }
    if (pending) {
      return Promise.reject(bridgeError(ERROR_CODES.BUSY, "previous document is still running"));
    }
    const id = `req-${++counter}`;
    return new Promise((resolve, reject) => {
      const request = {
        id,
        resolve,
        reject,
        onProgress,
        size: bytes.byteLength,
        startedAt: Date.now(),
        lastSeen: Date.now(),
        limit: limits.firstByteMs,
        sent: false,
      };
      pending = request;
      stats.runs += 1;
      stats.lastBytes = request.size;
      whenReady().then(
        () => {
          if (pending !== request) return;
          request.sent = true;
          request.lastSeen = Date.now();
          worker.postMessage(
            { type: "run", id, op, fileName, options: runOptions, bytes },
            [bytes.buffer],
          );
        },
        (error) => {
          if (pending === request) {
            pending = null;
            reject(error);
          }
        },
      );
    });
  }

  function cancel(id = null) {
    if (!pending || (id !== null && pending.id !== id)) return false;
    const { reject, sent } = pending;
    pending = null;
    reject(bridgeError(ERROR_CODES.CANCELLED, "cancelled by user"));
    // Cancelling before the request reached the worker leaves initialisation
    // alone: the badge keeps saying "initialising" and turns ready on its own.
    if (sent) recycle("cancel");
    return true;
  }

  function dispose() {
    state = "disposed";
    if (watcher) clearInterval(watcher);
    watcher = null;
    worker?.terminate();
    worker = null;
    failPending(bridgeError(ERROR_CODES.CANCELLED, "bridge disposed"));
  }

  async function heapBytes() {
    await whenReady();
    return new Promise((resolve, reject) => {
      const id = `stats-${++counter}`;
      const timer = setTimeout(() => {
        if (statsWaiters.delete(id)) reject(new Error("heap stats timed out"));
      }, 5000);
      statsWaiters.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject,
      });
      worker.postMessage({ type: "stats", id });
    });
  }

  spawn();
  const api = {
    protocol: PROTOCOL_VERSION,
    get ready() {
      return readyPromise;
    },
    run,
    cancel,
    dispose,
    heapBytes,
    stats: () => ({ ...stats }),
    state: () => state,
  };
  // Diagnostic handle for the DoD tests and DevTools; the UI path is unchanged.
  if (typeof window !== "undefined") {
    window.__letheBridge = api;
  }
  return api;
}
