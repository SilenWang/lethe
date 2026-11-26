// Task-level model for the multi-file de-identify flow.
//
// One task owns a list of files. Each file is detected and written separately
// by the worker, but a task must hand out *one* token per real value so the
// same name becomes "[PERSON_001]" in every file of the batch. That split is
// why this module exists: the pure decisions (which picks are acceptable, how
// tokens are allocated across files, what the task summary says) live here,
// apart from the DOM, so they can be tested without a browser.
//
// The allocation rule mirrors lethe/core.py: TYPE_PREFIX maps ORG onto
// COUNTERPARTY, tokens are "[PREFIX_NNN]", and the overrides handed to the
// worker are keyed by "TYPE|canonical" exactly as core.apply_token_overrides
// reads them.

/** Same mapping as `lethe.core.TYPE_PREFIX`; a custom type keeps its own name. */
export const TOKEN_TYPE_PREFIX = Object.freeze({
  PERSON: "PERSON",
  COUNTERPARTY: "COUNTERPARTY",
  ORG: "COUNTERPARTY",
  EMAIL: "EMAIL",
  PHONE: "PHONE",
  ACCOUNT: "ACCOUNT",
});

/** A file's identity for duplicate detection inside one task. */
export function fileIdentity(file) {
  return `${file?.name || ""}:${file?.size || 0}:${file?.lastModified || 0}`;
}

/**
 * Split an incoming picker selection into what the task accepts.
 *
 * `existing` is the current task's files; a file already in the task is a
 * duplicate and is skipped silently (re-picking the same folder is normal).
 * Unsupported types and over-limit files are counted so the caller can say
 * what it left out instead of dropping them without a word.
 */
export function partitionPicks(incoming, { existing = [], isSupported, gateLevel }) {
  const seen = new Set(existing.map(fileIdentity));
  const accepted = [];
  let rejected = 0;
  let unsupported = 0;
  let duplicate = 0;
  for (const file of incoming) {
    if (!isSupported(file)) {
      unsupported += 1;
      continue;
    }
    const gate = gateLevel(file.size);
    if (gate.level === "reject") {
      rejected += 1;
      continue;
    }
    const identity = fileIdentity(file);
    if (seen.has(identity)) {
      duplicate += 1;
      continue;
    }
    seen.add(identity);
    accepted.push({ file, gate });
  }
  return { accepted, rejected, unsupported, duplicate };
}

/**
 * The worker's override key: "TYPE|canonical".
 *
 * The canonical is used verbatim, not case-folded: `core.apply_token_overrides`
 * matches the exact key first and only then a case-folded one, and JavaScript's
 * `toLowerCase` is not Unicode case folding ("Straße" folds to "strasse" in
 * Python but stays "straße" here). Using the exact value keeps the token the
 * interface shows identical to the token the engine writes.
 */
export function tokenKey(type, canonical) {
  return `${String(type || "PERSON").toUpperCase()}|${String(canonical ?? "")}`;
}

/** The token prefix the engine will use for a type (ORG folds into COUNTERPARTY). */
export function tokenPrefix(type) {
  const key = String(type || "PERSON").toUpperCase();
  return TOKEN_TYPE_PREFIX[key] || key;
}

/**
 * Allocate one token per distinct entity across every file.
 *
 * Entries are the task's files, each with `detection.items`. Allocation is
 * deterministic — grouped by token prefix, then by canonical — so a re-run of
 * the same batch produces the same tokens and a directory listing that
 * happens to arrive in another order does not renumber everything.
 *
 * Grouping is case-insensitive (the same counterparty written "ACME Ltd" in
 * one file and "Acme Ltd" in another is one entity, and must get one token),
 * but every spelling that occurred is written into the override map under its
 * own exact key, because `core.apply_token_overrides` looks the exact key up
 * first. Collapsing the key itself would leave a file unmatched and silently
 * keep its own per-file numbering.
 *
 * Mutates `item.token` on every included item and returns the override map to
 * pass to the worker plus the flat allocation table for the UI.
 */
export function assignTaskTokens(entries) {
  const groups = new Map();
  for (const entry of entries) {
    for (const item of entry.detection?.items || []) {
      if (item.include === false) continue;
      const key = tokenKey(item.type, item.canonical);
      const folded = `${String(item.type || "PERSON").toUpperCase()}` +
        `|${String(item.canonical ?? "").toLowerCase()}`;
      let group = groups.get(folded);
      if (!group) {
        group = { key, folded, type: item.type, canonical: item.canonical, keys: new Set() };
        groups.set(folded, group);
      }
      group.keys.add(key);
    }
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const pa = tokenPrefix(a.type);
    const pb = tokenPrefix(b.type);
    if (pa !== pb) return pa.localeCompare(pb);
    return String(a.canonical).localeCompare(String(b.canonical));
  });
  const counters = new Map();
  const overrides = {};
  const allocations = [];
  for (const group of ordered) {
    const prefix = tokenPrefix(group.type);
    const index = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, index);
    const token = `[${prefix}_${String(index).padStart(3, "0")}]`;
    for (const key of group.keys) overrides[key] = token;
    allocations.push({
      key: group.key,
      type: group.type,
      canonical: group.canonical,
      token,
      keys: [...group.keys],
    });
  }
  for (const entry of entries) {
    for (const item of entry.detection?.items || []) {
      item.token = overrides[tokenKey(item.type, item.canonical)] || "";
    }
  }
  return { overrides, allocations };
}

/**
 * Task-level summary. A file that failed contributes its error but no hits;
 * the task as a whole still reports what the successful files produced.
 */
export function taskSummary(entries) {
  let hits = 0;
  let tokens = 0;
  let failed = 0;
  let pending = 0;
  for (const entry of entries) {
    if (entry.status === "failed") {
      failed += 1;
      continue;
    }
    if (!entry.detection) {
      pending += 1;
      continue;
    }
    hits += entry.detection.hits || 0;
    tokens += (entry.detection.items || []).filter((item) => item.token).length;
  }
  return { hits, tokens, failed, pending, files: entries.length };
}

/** Only these files can be written: detection ran and produced result bytes. */
export function writableEntries(entries) {
  return entries.filter((entry) => entry.status !== "failed" && entry.detection);
}

/**
 * The `files` column of a saved job. It is the durable record of which file in
 * the task produced which result, so history can reopen one file at a time.
 * Older jobs carry only `sourceFiles`; `normaliseJobFiles` fills the gap.
 */
export function buildJobFiles(entries) {
  return entries.map((entry) => ({
    name: entry.file.name,
    status: entry.status,
    output: entry.output?.name || "",
    // A failed file has no count of its own. Recording 0 would read as "done,
    // nothing replaced" in history, which is the opposite of what happened.
    hits: entry.status === "failed" ? null : entry.output?.hits ?? entry.detection?.hits ?? 0,
    error: entry.error || "",
  }));
}

/**
 * Read a stored job's files, falling back for jobs saved before this model.
 * A legacy job lists only `sourceFiles`, has no per-file results, and its one
 * replacement count cannot be split — so each file reports `hits: null`
 * rather than inventing a share of the total.
 */
export function normaliseJobFiles(job) {
  const stored = Array.isArray(job?.files) ? job.files : [];
  if (stored.length) {
    return stored.map((file) => ({
      name: String(file?.name || ""),
      status: file?.status || "done",
      output: String(file?.output || ""),
      hits: typeof file?.hits === "number" ? file.hits : null,
      error: String(file?.error || ""),
    }));
  }
  return (job?.sourceFiles || []).map((name) => ({
    name: String(name),
    status: "done",
    output: "",
    hits: null,
    error: "",
  }));
}
