// Gate thresholds mirrored from lethe/gates.py for instant UI feedback. The
// worker's four gates stay authoritative: the UI never decides a file is safe.

export const MIB = 1024 * 1024;
export const WARN_BYTES = 35 * MIB;
export const MAX_BYTES = 50 * MIB;
export const RECYCLE_BYTES = 35 * MIB;

export const ENTITY_TYPES = ["PERSON", "COUNTERPARTY", "OTHER", "EMAIL", "PHONE", "ACCOUNT"];

export function sizeMb(bytes) {
  return (bytes / MIB).toFixed(1);
}

/** "ok" | "warn" | "reject", plus the numbers the notice needs. */
export function gateLevel(bytes) {
  if (bytes > MAX_BYTES) return { level: "reject", size: sizeMb(bytes) };
  if (bytes > WARN_BYTES) return { level: "warn", size: sizeMb(bytes) };
  return { level: "ok", size: sizeMb(bytes) };
}

export function isDocx(file) {
  return !!file && /\.docx$/i.test(file.name || "");
}

export function isXlsx(file) {
  return !!file && /\.xlsx$/i.test(file.name || "");
}

export function isSupported(file) {
  return isDocx(file) || isXlsx(file);
}

export function mimeFor(name) {
  return /\.xlsx$/i.test(String(name || ""))
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MIB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${sizeMb(bytes)} MB`;
}

export function replaceSuffix(name, suffix) {
  const value = String(name || "document.docx");
  const match = value.match(/\.(docx|xlsx)$/i);
  if (!match) return value + suffix;
  return value.slice(0, -match[0].length) + suffix + match[0].toLowerCase();
}

/** What the UI shows for a worker error code. Never a raw stack trace. */
export function errorKey(code) {
  const known = [
    "TOO_LARGE",
    "PARSE_FAILED",
    "OOM",
    "TIMEOUT",
    "BUSY",
    "CANCELLED",
    "INIT_FAILED",
    "INTERNAL",
  ];
  return `p1.error.${known.includes(code) ? code : "unknown"}`;
}
