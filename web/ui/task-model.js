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
 * `types` is the review table's type overrides, keyed by canonical. A type the
 * user edited there is the *effective* type: the token must be allocated under
 * it, so retyping "Acme" from PERSON to COUNTERPARTY yields
 * "[COUNTERPARTY_001]" rather than keeping the prefix detection gave it.
 *
 * The override map then has to carry **two** keys per entity. The engine
 * matches `TYPE|canonical` against the type *detection* recorded, which the
 * edit never touches, so the detected key must stay addressable or the engine
 * misses it and silently keeps its own per-file numbering. The effective key is
 * written too, for a later run that detects the value under the new type.
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
export function assignTaskTokens(entries, types = null) {
  const effectiveType = (item) =>
    String(types?.get(item.canonical) || item.type || "PERSON").toUpperCase();
  const groups = new Map();
  for (const entry of entries) {
    for (const item of entry.detection?.items || []) {
      if (item.include === false) continue;
      const detectedType = String(item.type || "PERSON").toUpperCase();
      const type = effectiveType(item);
      const folded = `${type}|${String(item.canonical ?? "").toLowerCase()}`;
      let group = groups.get(folded);
      if (!group) {
        group = {
          key: tokenKey(type, item.canonical),
          folded,
          type,
          canonical: item.canonical,
          keys: new Set(),
        };
        groups.set(folded, group);
      }
      // Both keys point at the same token: the detected one is what the engine
      // looks up today, the effective one is what the interface shows.
      group.keys.add(tokenKey(detectedType, item.canonical));
      group.keys.add(tokenKey(type, item.canonical));
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
      if (item.include === false) {
        item.token = "";
        continue;
      }
      // The effective type decides the prefix the interface showed, so look it
      // up first; the detected key is the fallback for an item whose type was
      // never edited.
      item.token =
        overrides[tokenKey(effectiveType(item), item.canonical)] ||
        overrides[tokenKey(item.type, item.canonical)] ||
        "";
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
 * A distinct result name for every file in one task.
 *
 * Two files picked from different folders can share a name — "memo.docx" in
 * "Q2/ACME" and "memo.docx" in "Q3/Beta" — and they are different documents.
 * Naming both of them "memo-redacted.docx" makes the stored result set
 * ambiguous: history downloads by name, so it would hand back whichever copy it
 * found first and silently give one file the other's bytes.
 *
 * The first file to claim a name keeps it, so the common single-file and
 * already-distinct cases are unaffected. Each later collision gets a "-2",
 * "-3", … marker before the extension, counting only files in this task (not
 * what exists on the user's disk, which the browser cannot see).
 */
export function uniqueOutputNames(entries, suffix = "-redacted", extensionOf = null) {
  const used = new Set();
  const names = new Map();
  const split = (name) => {
    if (extensionOf) return extensionOf(name);
    const match = String(name || "").match(/\.([^.]+)$/);
    if (!match) return { stem: String(name || "document"), ext: "" };
    return { stem: String(name).slice(0, -match[0].length), ext: match[0].toLowerCase() };
  };
  for (const entry of entries) {
    const { stem, ext } = split(entry.file.name);
    let name = `${stem}${suffix}${ext}`;
    if (used.has(name)) {
      let index = 2;
      // Loop rather than assume: a task may hold "memo.docx", "memo (2).docx"
      // *and* a third "memo.docx", so "-2" itself can already be taken.
      while (used.has(`${stem}${suffix}-${index}${ext}`)) index += 1;
      name = `${stem}${suffix}-${index}${ext}`;
    }
    used.add(name);
    names.set(entry.id ?? entry.file, name);
  }
  return names;
}

/**
 * Split a write result's per-part counts into the three groups the review and
 * history panels report separately.
 *
 * The engines already count per XML part, which is what makes a DOCX result
 * auditable: body text, comments and the rest (headers, footers, notes and core
 * properties) are replaced by different code paths and users ask about them
 * separately. Collapsing them into one number at the task level throws that
 * away, so each file keeps both the raw `counts` and this split.
 *
 * The keys are per part name, which is the shape `docx_engine.WriteResult`
 * already produces. Non-DOCX engines name their parts differently, so anything
 * that does not look like DOCX body/comments falls into `otherHits` rather than
 * being dropped — a total that does not add up is worse than an unsplit one.
 */
export function splitCounts(counts) {
  const parts = counts && typeof counts === "object" ? counts : {};
  let bodyHits = 0;
  let commentHits = 0;
  let otherHits = 0;
  for (const [part, value] of Object.entries(parts)) {
    const hits = Number(value) || 0;
    if (!hits) continue;
    const name = String(part).toLowerCase();
    const leaf = name.split("/").pop() || "";
    if (name.endsWith("/document.xml")) bodyHits += hits;
    // Word numbers comment parts after a merge: comments1.xml and friends are
    // the same user-visible surface as comments.xml, not "other".
    else if (/^comments\d*\.xml$/.test(leaf)) commentHits += hits;
    else otherHits += hits;
  }
  return { bodyHits, commentHits, otherHits };
}

/** Task-level counter groups, defined as the sum of the per-file groups. */
export function taskCounterTotals(entries) {
  const totals = { bodyHits: 0, commentHits: 0, otherHits: 0 };
  for (const entry of entries) {
    if (entry.status === "failed") continue;
    const split = splitCounts(entry.output?.counts || entry.detection?.counts || null);
    totals.bodyHits += split.bodyHits;
    totals.commentHits += split.commentHits;
    totals.otherHits += split.otherHits;
  }
  return totals;
}

/**
 * The `files` column of a saved job. It is the durable record of which file in
 * the task produced which result, so history can reopen one file at a time.
 * Older jobs carry only `sourceFiles`; `normaliseJobFiles` fills the gap.
 *
 * Every file keeps its own counters: `hits` for the total the UI shows, the
 * `bodyHits`/`commentHits`/`otherHits` split, and the raw per-part `counts` the
 * engine reported. A failed file records `null` for all of them — 0 would read
 * as "done, nothing replaced", the opposite of what happened.
 */
export function buildJobFiles(entries) {
  return entries.map((entry) => {
    const counts =
      entry.output?.counts || entry.detection?.counts || null;
    const split = splitCounts(counts);
    const hits = entry.status === "failed"
      ? null
      : entry.output?.hits ?? entry.detection?.hits ?? split.bodyHits + split.commentHits + split.otherHits;
    return {
      name: entry.file.name,
      status: entry.status,
      output: entry.output?.name || "",
      hits,
      bodyHits: hits === null ? null : split.bodyHits,
      commentHits: hits === null ? null : split.commentHits,
      otherHits: hits === null ? null : split.otherHits,
      counts: counts ? { ...counts } : {},
      error: entry.error || "",
    };
  });
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
    return stored.map((file) => {
      const hits = typeof file?.hits === "number" ? file.hits : null;
      const counts =
        file?.counts && typeof file.counts === "object" ? { ...file.counts } : {};
      // A job saved before the split existed has `hits` but no groups; derive
      // them from its raw counts when there are any, else leave them null
      // rather than reporting zeros for a total we cannot divide.
      const split = hits === null ? null : splitCounts(counts);
      return {
        name: String(file?.name || ""),
        status: file?.status || "done",
        output: String(file?.output || ""),
        hits,
        bodyHits: typeof file?.bodyHits === "number" ? file.bodyHits : split?.bodyHits ?? null,
        commentHits:
          typeof file?.commentHits === "number" ? file.commentHits : split?.commentHits ?? null,
        otherHits: typeof file?.otherHits === "number" ? file.otherHits : split?.otherHits ?? null,
        counts,
        error: String(file?.error || ""),
      };
    });
  }
  return (job?.sourceFiles || []).map((name) => ({
    name: String(name),
    status: "done",
    output: "",
    hits: null,
    bodyHits: null,
    commentHits: null,
    otherHits: null,
    counts: {},
    error: "",
  }));
}
