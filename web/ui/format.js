import { SUPPORTED_FORMATS } from "../lib/runtime-config.js";

// Gate thresholds mirrored from lethe/gates.py for instant UI feedback. The
// worker's four gates stay authoritative: the UI never decides a file is safe.

export const MIB = 1024 * 1024;
export const WARN_BYTES = 35 * MIB;
export const MAX_BYTES = 50 * MIB;
export const RECYCLE_BYTES = 35 * MIB;

export const ENTITY_TYPES = ["PERSON", "COUNTERPARTY", "OTHER", "EMAIL", "PHONE", "ACCOUNT"];

// Source badges come from `core.Item.source`; anything the UI does not know
// falls back to a generic badge instead of leaking the raw internal code.
export const SOURCE_KEYS = Object.freeze({
  dictionary: "p1.source.dictionary",
  preset_rule: "p1.source.preset_rule",
  pattern: "p1.source.pattern",
  manual: "p1.source.manual",
});

/** Locale key for a detection source badge. */
export function sourceKey(source) {
  return SOURCE_KEYS[source] || "p1.source.unknown";
}

// What each writer deliberately does not rewrite (docs/p3/release.md). The list
// is per format and drives the upload panel, so a user only sees the
// degradations that apply to the file they picked.
export const DEGRADATION_KEYS = Object.freeze({
  xlsx: [
    "p1.xlsx.degradations.pivot",
    "p1.xlsx.degradations.chart",
    "p1.xlsx.degradations.smartart",
    "p1.xlsx.degradations.ole",
    "p1.xlsx.degradations.formula",
    "p1.xlsx.degradations.external",
  ],
  pptx: [
    "p1.pptx.degradations.chart",
    "p1.pptx.degradations.smartart",
    "p1.pptx.degradations.ole",
    "p1.pptx.degradations.media",
  ],
});

// The engine reports degradation *codes* per run (`xlsx.pivot_cache`, …). Each
// one maps to the locale key above so the review/generate panels can say which
// known gaps this particular file actually hit. A gap the writer cannot detect
// at all (`pptx.media`: text baked into an image) has no code — it is only
// listed in `DEGRADATION_KEYS` so the upload panel warns up front.
export const DEGRADATION_CODE_KEYS = Object.freeze({
  "xlsx.pivot_cache": "p1.xlsx.degradations.pivot",
  "xlsx.chart_cache": "p1.xlsx.degradations.chart",
  "xlsx.smartart": "p1.xlsx.degradations.smartart",
  "xlsx.ole": "p1.xlsx.degradations.ole",
  "xlsx.formula_literal": "p1.xlsx.degradations.formula",
  "xlsx.external_links": "p1.xlsx.degradations.external",
  "pptx.chart_cache": "p1.pptx.degradations.chart",
  "pptx.smartart": "p1.pptx.degradations.smartart",
  "pptx.ole": "p1.pptx.degradations.ole",
});

export function sizeMb(bytes) {
  return (bytes / MIB).toFixed(1);
}

/** "ok" | "warn" | "reject", plus the numbers the notice needs. */
export function gateLevel(bytes) {
  if (bytes > MAX_BYTES) return { level: "reject", size: sizeMb(bytes) };
  if (bytes > WARN_BYTES) return { level: "warn", size: sizeMb(bytes) };
  return { level: "ok", size: sizeMb(bytes) };
}

export function isPptx(file) {
  return !!file && /\.pptx$/i.test(file.name || "");
}

export function isXlsx(file) {
  return !!file && /\.xlsx$/i.test(file.name || "");
}

export function isSupported(file) {
  const name = String(file?.name || "");
  return SUPPORTED_FORMATS.some((format) => new RegExp(`\\.${format}$`, "i").test(name));
}

export function mimeFor(name) {
  if (/\.pptx$/i.test(String(name || ""))) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
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
  const match = value.match(/\.(docx|xlsx|pptx)$/i);
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
