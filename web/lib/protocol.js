// Frozen worker protocol (P1). The UI is built against this file; changing a
// message shape requires a PROTOCOL_VERSION bump and an interface review.
export const PROTOCOL_VERSION = 1;

export const OPS = Object.freeze(["inspect", "redact", "restore", "echo"]);

export const PHASES = Object.freeze({
  init: "init",
  gates: "gates",
  parse: "parse",
  detect: "detect",
  write: "write",
  postprocess: "postprocess",
  packing: "packing",
});

export const ERROR_CODES = Object.freeze({
  OOM: "OOM",
  TOO_LARGE: "TOO_LARGE",
  PARSE_FAILED: "PARSE_FAILED",
  CANCELLED: "CANCELLED",
  TIMEOUT: "TIMEOUT",
  BUSY: "BUSY",
  INIT_FAILED: "INIT_FAILED",
  INTERNAL: "INTERNAL",
});

// first byte / between progress ticks / single blocking pack call
export const DEFAULT_LIMITS = Object.freeze({
  firstByteMs: 60_000,
  interBatchMs: 4_000,
  packingMs: 120_000,
});

// Files above this size recycle the worker once the result is delivered.
export const LARGE_TASK_BYTES = 35 * 1024 * 1024;
