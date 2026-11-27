// Task-model decisions, exercised without a browser.
//
// `web/ui/task-model.js` holds the rules that are easy to get subtly wrong —
// which picks a task accepts, how one token is shared across files, what a
// reopened job reports — and none of them need a DOM. Run with `node --test`.

import assert from "node:assert/strict";
import test from "node:test";

import {
  assignTaskTokens,
  buildJobFiles,
  fileIdentity,
  normaliseJobFiles,
  partitionPicks,
  splitCounts,
  taskSummary,
  tokenKey,
  tokenPrefix,
  uniqueOutputNames,
  writableEntries,
} from "../../web/ui/task-model.js";

// Sizes are in MB-equivalents the gate reads as bytes; 1 stays under the warn line.
const file = (name, size = 1, lastModified = 1) => ({ name, size, lastModified });

/** A gate stand-in: rejects over 50 and warns over 35, like format.js. */
const gateLevel = (bytes) => ({ level: bytes > 50 ? "reject" : bytes > 35 ? "warn" : "ok" });

const entry = (name, items, extra = {}) => ({
  file: file(name),
  status: "ready",
  detection: { items, hits: items.reduce((total, item) => total + (item.count || 0), 0) },
  ...extra,
});

// ------------------------------------------------------------------ picks

test("a task accepts several files of mixed supported types", () => {
  const picks = [file("a.docx"), file("b.xlsx"), file("c.pptx")];
  const out = partitionPicks(picks, {
    existing: [],
    isSupported: () => true,
    gateLevel,
  });
  assert.deepEqual(out.accepted.map((row) => row.file.name), ["a.docx", "b.xlsx", "c.pptx"]);
  assert.equal(out.rejected, 0);
  assert.equal(out.unsupported, 0);
  assert.equal(out.duplicate, 0);
});

test("re-picking a file already in the task is a duplicate, not a second copy", () => {
  const first = file("a.docx", 10, 1);
  // Same name, size and mtime: the same file, even though it is another object.
  const again = file("a.docx", 10, 1);
  const out = partitionPicks([again], { existing: [first], isSupported: () => true, gateLevel });
  assert.equal(out.accepted.length, 0);
  assert.equal(out.duplicate, 1);
  assert.equal(fileIdentity(first), fileIdentity(again));
});

test("a same-named file with different bytes is a different file", () => {
  const out = partitionPicks([file("a.docx", 20, 1)], {
    existing: [file("a.docx", 10, 1)],
    isSupported: () => true,
    gateLevel,
  });
  assert.equal(out.accepted.length, 1);
  assert.equal(out.duplicate, 0);
});

test("unsupported types and over-limit files are counted separately", () => {
  const out = partitionPicks(
    [file("a.pdf"), file("big.docx", 60), file("ok.docx", 10)],
    { existing: [], isSupported: (f) => /\.docx$/.test(f.name), gateLevel },
  );
  assert.deepEqual(out.accepted.map((row) => row.file.name), ["ok.docx"]);
  assert.equal(out.unsupported, 1);
  assert.equal(out.rejected, 1);
  assert.equal(out.duplicate, 0);
});

test("duplicates inside one pick are collapsed too", () => {
  const out = partitionPicks([file("a.docx", 1, 1), file("a.docx", 1, 1)], {
    existing: [],
    isSupported: () => true,
    gateLevel,
  });
  assert.equal(out.accepted.length, 1);
  assert.equal(out.duplicate, 1);
});

// ----------------------------------------------------------------- tokens

test("a token prefix folds ORG onto COUNTERPARTY, like lethe.core.TYPE_PREFIX", () => {
  assert.equal(tokenPrefix("ORG"), "COUNTERPARTY");
  assert.equal(tokenPrefix("org"), "COUNTERPARTY");
  assert.equal(tokenPrefix("PERSON"), "PERSON");
  assert.equal(tokenPrefix("OTHER"), "OTHER");
});

test("the same value in two files gets one token across the batch", () => {
  const a = entry("a.docx", [{ type: "PERSON", canonical: "John Smith", count: 25 }]);
  const b = entry("b.xlsx", [{ type: "PERSON", canonical: "John Smith", count: 4 }]);
  const { overrides, allocations } = assignTaskTokens([a, b]);

  assert.equal(allocations.length, 1, "one entity, one token");
  assert.equal(a.detection.items[0].token, "[PERSON_001]");
  assert.equal(b.detection.items[0].token, "[PERSON_001]");
  assert.equal(overrides[tokenKey("PERSON", "John Smith")], "[PERSON_001]");
});

test("different values are numbered per prefix, deterministically", () => {
  const a = entry("a.docx", [
    { type: "PERSON", canonical: "Zoe Adams" },
    { type: "PERSON", canonical: "Alice Chen" },
    { type: "EMAIL", canonical: "x@example.com" },
  ]);
  const { allocations } = assignTaskTokens([a]);
  const byCanonical = Object.fromEntries(allocations.map((row) => [row.canonical, row.token]));
  assert.equal(byCanonical["Alice Chen"], "[PERSON_001]");
  assert.equal(byCanonical["Zoe Adams"], "[PERSON_002]");
  assert.equal(byCanonical["x@example.com"], "[EMAIL_001]");
});

test("the same batch in another file order still numbers the same", () => {
  const items = [
    { type: "PERSON", canonical: "Alice Chen" },
    { type: "PERSON", canonical: "Zoe Adams" },
  ];
  const forward = assignTaskTokens([entry("a", items.map((i) => ({ ...i })))]);
  const backward = assignTaskTokens([entry("b", items.slice().reverse().map((i) => ({ ...i })))]);
  assert.deepEqual(
    forward.allocations.map((row) => [row.canonical, row.token]),
    backward.allocations.map((row) => [row.canonical, row.token]),
  );
});

test("case variants of one value share a token but keep their own exact keys", () => {
  // "ACME Ltd" in one file, "Acme Ltd" in another: one counterparty, one token.
  const a = entry("a.docx", [{ type: "COUNTERPARTY", canonical: "ACME Ltd" }]);
  const b = entry("b.docx", [{ type: "COUNTERPARTY", canonical: "Acme Ltd" }]);
  const { overrides, allocations } = assignTaskTokens([a, b]);

  assert.equal(allocations.length, 1);
  assert.equal(a.detection.items[0].token, allocations[0].token);
  assert.equal(b.detection.items[0].token, allocations[0].token);
  // Both spellings must be addressable, or the engine cannot apply the token
  // to the file that spells it the other way.
  assert.equal(overrides["COUNTERPARTY|ACME Ltd"], allocations[0].token);
  assert.equal(overrides["COUNTERPARTY|Acme Ltd"], allocations[0].token);
});

test("the override key keeps the exact canonical, not a case-folded one", () => {
  // JavaScript's toLowerCase is not Unicode case folding: "Straße" stays
  // "straße" while Python's casefold gives "strasse". A folded key would miss
  // and the file would silently keep its own numbering.
  const a = entry("a.docx", [{ type: "PERSON", canonical: "Straße" }]);
  const { overrides } = assignTaskTokens([a]);
  assert.deepEqual(Object.keys(overrides), ["PERSON|Straße"]);
  assert.ok(!("PERSON|strasse" in overrides));
});

test("excluded items take no token and no override", () => {
  const a = entry("a.docx", [{ type: "PERSON", canonical: "Hidden", include: false }]);
  const { overrides, allocations } = assignTaskTokens([a]);
  assert.deepEqual(allocations, []);
  assert.deepEqual(overrides, {});
  assert.equal(a.detection.items[0].token, "");
});

test("tokens clear when an item stops being included", () => {
  const item = { type: "PERSON", canonical: "John Smith" };
  const a = entry("a.docx", [item]);
  assignTaskTokens([a]);
  assert.equal(item.token, "[PERSON_001]");
  item.include = false;
  assignTaskTokens([a]);
  assert.equal(item.token, "");
});

// ------------------------------------------------- effective (edited) type

test("retyping an entity moves its token to the new type's prefix", () => {
  // "Acme" is detected as PERSON, then the reviewer retypes it as
  // COUNTERPARTY in the review table. The token must follow the type the user
  // chose — "[COUNTERPARTY_001]", not the "[PERSON_001]" detection produced.
  const a = entry("a.docx", [{ type: "PERSON", canonical: "Acme" }]);
  const types = new Map([["Acme", "COUNTERPARTY"]]);
  const { overrides, allocations } = assignTaskTokens([a], types);

  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].type, "COUNTERPARTY");
  assert.equal(allocations[0].token, "[COUNTERPARTY_001]");
  assert.equal(a.detection.items[0].token, "[COUNTERPARTY_001]");
  // The detected key must stay addressable too: the engine matches against the
  // type detection recorded, so dropping "PERSON|Acme" would make the engine
  // miss the override and keep its own per-file numbering.
  assert.equal(overrides["COUNTERPARTY|Acme"], "[COUNTERPARTY_001]");
  assert.equal(overrides["PERSON|Acme"], "[COUNTERPARTY_001]");
});

test("a retyped entity keeps its token across every file and every spelling", () => {
  // One counterparty spelled two ways in two files, retyped from PERSON to
  // COUNTERPARTY: one token, and every detected key of every spelling resolves
  // to it, or one of the files would fall back to its own numbering.
  const a = entry("a.docx", [{ type: "PERSON", canonical: "Acme" }]);
  const b = entry("b.xlsx", [{ type: "PERSON", canonical: "ACME" }]);
  const types = new Map([["Acme", "COUNTERPARTY"], ["ACME", "COUNTERPARTY"]]);
  const { overrides } = assignTaskTokens([a, b], types);

  const token = overrides["COUNTERPARTY|Acme"];
  assert.equal(token, "[COUNTERPARTY_001]");
  for (const key of ["COUNTERPARTY|Acme", "COUNTERPARTY|ACME", "PERSON|Acme", "PERSON|ACME"]) {
    assert.equal(overrides[key], token, key);
  }
  assert.equal(a.detection.items[0].token, token);
  assert.equal(b.detection.items[0].token, token);
});

test("without a type override the detected type still decides the prefix", () => {
  const a = entry("a.docx", [{ type: "ORG", canonical: "Acme" }]);
  const { overrides } = assignTaskTokens([a], new Map());
  // ORG folds onto COUNTERPARTY, and no effective-type key is invented.
  assert.deepEqual(Object.keys(overrides).sort(), ["ORG|Acme"]);
  assert.equal(overrides["ORG|Acme"], "[COUNTERPARTY_001]");
});

test("an exclusion outranks a type override", () => {
  const item = { type: "PERSON", canonical: "Acme" };
  const a = entry("a.docx", [item]);
  const types = new Map([["Acme", "COUNTERPARTY"]]);
  item.include = false;
  const { overrides, allocations } = assignTaskTokens([a], types);
  assert.deepEqual(allocations, []);
  assert.deepEqual(overrides, {});
  assert.equal(item.token, "");
});

// ------------------------------------------------------------ output names

test("same-named files from different folders get distinct result names", () => {
  // "memo.docx" in two folders are two different documents. One shared result
  // name would make the stored set ambiguous: history downloads by name.
  const a = entry("memo.docx", []);
  const b = entry("memo.docx", []);
  a.id = "task-file-1";
  b.id = "task-file-2";
  const names = uniqueOutputNames([a, b]);

  assert.equal(names.get("task-file-1"), "memo-redacted.docx");
  assert.equal(names.get("task-file-2"), "memo-redacted-2.docx");
  assert.equal(new Set(names.values()).size, 2, "every file keeps its own name");
});

test("a third collision keeps counting instead of reusing -2", () => {
  const rows = ["memo.docx", "memo.docx", "memo.docx"].map((name, index) => ({
    id: `task-file-${index + 1}`,
    file: file(name),
  }));
  const names = uniqueOutputNames(rows);
  assert.deepEqual([...names.values()], [
    "memo-redacted.docx",
    "memo-redacted-2.docx",
    "memo-redacted-3.docx",
  ]);
});

test("distinct files keep their own names untouched", () => {
  const rows = [
    { id: "a", file: file("report.docx") },
    { id: "b", file: file("sheet.xlsx") },
    { id: "c", file: file("deck.pptx") },
  ];
  assert.deepEqual([...uniqueOutputNames(rows).values()], [
    "report-redacted.docx",
    "sheet-redacted.xlsx",
    "deck-redacted.pptx",
  ]);
});

test("the extension is preserved and normalised in a de-duplicated name", () => {
  const rows = [
    { id: "a", file: file("Memo.DOCX") },
    { id: "b", file: file("Memo.DOCX") },
  ];
  const names = [...uniqueOutputNames(rows).values()];
  assert.deepEqual(names, ["Memo-redacted.docx", "Memo-redacted-2.docx"]);
});

// ---------------------------------------------------------------- summary

test("a partly failed task still reports what the successful files produced", () => {
  const files = [
    entry("a.docx", [{ type: "PERSON", canonical: "John Smith", count: 5, token: "[PERSON_001]" }]),
    { file: file("broken.docx"), status: "failed", error: "bad zip", detection: null },
    { file: file("pending.docx"), status: "pending", detection: null },
  ];
  const counts = taskSummary(files);
  assert.equal(counts.files, 3);
  assert.equal(counts.failed, 1);
  assert.equal(counts.pending, 1);
  assert.equal(counts.hits, 5);
  assert.equal(counts.tokens, 1);
});

test("only detected, non-failed files are written", () => {
  const files = [
    entry("a.docx", [{ type: "PERSON", canonical: "A" }]),
    { file: file("broken.docx"), status: "failed", detection: { items: [] } },
    { file: file("pending.docx"), status: "pending", detection: null },
  ];
  assert.deepEqual(writableEntries(files).map((row) => row.file.name), ["a.docx"]);
});

// ---------------------------------------------------------------- history

test("a saved job records every file, so history can reopen one at a time", () => {
  const files = [
    entry("a.docx", [{ type: "PERSON", canonical: "John Smith", count: 25 }], {
      status: "generated",
      output: { name: "a-redacted.docx", hits: 25, bytes: new Uint8Array([1]) },
    }),
    { file: file("broken.docx"), status: "failed", error: "bad zip", detection: null },
  ];
  const rows = buildJobFiles(files);
  assert.deepEqual(rows.map((row) => row.name), ["a.docx", "broken.docx"]);
  assert.equal(rows[0].output, "a-redacted.docx");
  assert.equal(rows[0].hits, 25);
  assert.equal(rows[1].status, "failed");
  // A failed file must not report 0 replacements: that reads as "nothing found".
  assert.equal(rows[1].hits, null);
  assert.equal(rows[1].error, "bad zip");
});

test("a reopened job keeps one output per file and never borrows another's", () => {
  const rows = normaliseJobFiles({
    jobId: "job-1",
    files: [
      { name: "a.docx", status: "generated", output: "a-redacted.docx", hits: 25, error: "" },
      { name: "b.xlsx", status: "generated", output: "b-redacted.xlsx", hits: 4, error: "" },
    ],
  });
  assert.deepEqual(rows.map((row) => row.output), ["a-redacted.docx", "b-redacted.xlsx"]);
  assert.deepEqual(rows.map((row) => row.hits), [25, 4]);
});

test("a job saved before the multi-file model still opens", () => {
  const rows = normaliseJobFiles({ jobId: "old", sourceFiles: ["a.docx", "b.docx"] });
  assert.deepEqual(rows.map((row) => row.name), ["a.docx", "b.docx"]);
  // The old job's single total cannot be split, so no file claims a share of it.
  assert.deepEqual(rows.map((row) => row.hits), [null, null]);
  assert.deepEqual(rows.map((row) => row.status), ["done", "done"]);
});

test("a job with neither files nor sourceFiles opens as an empty list", () => {
  assert.deepEqual(normaliseJobFiles({ jobId: "x" }), []);
  assert.deepEqual(normaliseJobFiles(null), []);
});

// ------------------------------------------------- per-file DOCX counters

test("a DOCX result keeps body, comment and other hits apart per file", () => {
  const counts = {
    "word/document.xml": 7,
    "word/comments.xml": 2,
    "word/header1.xml": 3,
    "word/footer1.xml": 1,
  };
  assert.deepEqual(splitCounts(counts), { bodyHits: 7, commentHits: 2, otherHits: 4 });
  // Nothing split is lost: a total that does not add up is worse than none.
  const split = splitCounts(counts);
  assert.equal(split.bodyHits + split.commentHits + split.otherHits, 13);
});

test("a non-DOCX or absent count lands in otherHits instead of vanishing", () => {
  assert.deepEqual(splitCounts({ "sheets/sheet1.xml": 5 }), {
    bodyHits: 0,
    commentHits: 0,
    otherHits: 5,
  });
  assert.deepEqual(splitCounts(null), { bodyHits: 0, commentHits: 0, otherHits: 0 });
  assert.deepEqual(splitCounts({ "word/document.xml": 0 }), {
    bodyHits: 0,
    commentHits: 0,
    otherHits: 0,
  });
});

test("each saved file carries its own counts, not the task's single total", () => {
  const files = [
    entry("memo.docx", [{ type: "PERSON", canonical: "John Smith", count: 9 }], {
      status: "generated",
      output: {
        name: "memo-redacted.docx",
        hits: 9,
        counts: { "word/document.xml": 6, "word/comments.xml": 3 },
        bytes: new Uint8Array([1]),
      },
    }),
    entry("deck.pptx", [{ type: "PERSON", canonical: "John Smith", count: 2 }], {
      status: "generated",
      output: {
        name: "deck-redacted.pptx",
        hits: 2,
        counts: { "ppt/slides/slide1.xml": 2 },
        bytes: new Uint8Array([2]),
      },
    }),
  ];
  const rows = buildJobFiles(files);
  assert.deepEqual(
    rows.map((row) => [row.bodyHits, row.commentHits, row.otherHits]),
    [
      [6, 3, 0],
      [0, 0, 2],
    ],
  );
  assert.deepEqual(rows[0].counts, { "word/document.xml": 6, "word/comments.xml": 3 });
  assert.deepEqual(rows[1].counts, { "ppt/slides/slide1.xml": 2 });
});

test("a failed file reports no counter groups at all", () => {
  const rows = buildJobFiles([
    { file: file("broken.docx"), status: "failed", error: "bad zip", detection: null },
  ]);
  assert.equal(rows[0].hits, null);
  assert.equal(rows[0].bodyHits, null);
  assert.equal(rows[0].commentHits, null);
  assert.equal(rows[0].otherHits, null);
  assert.deepEqual(rows[0].counts, {});
});

test("reopening history restores the split the job was saved with", () => {
  const rows = normaliseJobFiles({
    jobId: "job-counts",
    files: [
      {
        name: "memo.docx",
        status: "generated",
        output: "memo-redacted.docx",
        hits: 9,
        counts: { "word/document.xml": 6, "word/comments.xml": 3 },
        error: "",
      },
      {
        name: "old.docx",
        status: "done",
        output: "old-redacted.docx",
        hits: 4,
        error: "",
      },
    ],
  });
  // Saved groups are taken as-is; a job without them is derived, not zeroed.
  assert.equal(rows[0].bodyHits, 6);
  assert.equal(rows[0].commentHits, 3);
  assert.equal(rows[0].otherHits, 0);
  assert.equal(rows[1].bodyHits, 0);
  assert.equal(rows[1].otherHits, 0);
  // A legacy job with no per-file total still claims no share of it.
  const legacy = normaliseJobFiles({ jobId: "old", sourceFiles: ["a.docx"] });
  assert.equal(legacy[0].bodyHits, null);
  assert.deepEqual(legacy[0].counts, {});
});
