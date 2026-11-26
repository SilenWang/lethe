// Three independent PWA pages: de-identify, re-identify and entity dictionary.
// Document work stays in the frozen worker; this module owns presentation and
// the browser-only history/dictionary layer.
//
// One de-identify task owns several files. The worker still processes exactly
// one file per call, so the task loop lives here: detect every file, allocate
// one token per real value across the batch, then write each file with the
// shared overrides. `task-model.js` holds the pure allocation rules.
import { createBridge } from "../lib/pyodide_bridge.js";
import { createDictionaryClient } from "../lib/dictionary-client.js";
import { mergeDictionaryLayers } from "../lib/dictionary-merge.js";
import { createI18n } from "./i18n.js";
import {
  DEGRADATION_CODE_KEYS,
  DEGRADATION_KEYS,
  ENTITY_TYPES,
  RECYCLE_BYTES,
  errorKey,
  gateLevel,
  humanSize,
  isPptx,
  isSupported,
  isXlsx,
  mimeFor,
  replaceSuffix,
  sourceKey,
} from "./format.js";
import * as store from "./store.js";
import {
  assignTaskTokens as allocateTaskTokens,
  buildJobFiles,
  fileIdentity,
  normaliseJobFiles,
  partitionPicks,
  splitCounts,
  taskCounterTotals,
  taskSummary,
  tokenKey,
  uniqueOutputNames,
  writableEntries,
} from "./task-model.js";

const $ = (id) => document.getElementById(id);
const state = {
  i18n: null,
  bridge: null,
  runtime: "initializing",
  statusEvent: null,
  phase: "",
  preload: null,
  gate: null,
  busy: false,
  files: [],
  activeFileIndex: 0,
  taskFileSeq: 0,
  // Selection and type overrides are task-wide: one real value must be handled
  // the same way in every file, or the shared token would mean two things.
  redactionWarning: null,
  selected: new Set(),
  types: new Map(),
  generated: null,
  manualEntities: [],
  customTypesList: [],
  dictRows: [],
  dictByKey: new Map(),
  disabledEntities: new Set(),
  generatedSaved: null,
  restoreFile: null,
  restored: null,
  restoreSummary: null,
  jobs: [],
  selectedJobId: "",
  jobFiles: [],
  jobFileIndex: 0,
  jobOutputIds: new Set(),
  jobMapping: null,
  jobDictNote: null,
  jobDictRequest: 0,
  restoreRequest: 0,
  storageOk: false,
  installEvent: null,
  dictionary: null,
};

const t = (key, vars) => state.i18n.t(key, vars);

const FILE_STATUS_KEYS = Object.freeze({
  pending: "p1.files.pending",
  ready: "p1.files.ready",
  generated: "p1.files.generated",
  failed: "p1.files.failed",
});

function activeFile() {
  return state.files[state.activeFileIndex] || null;
}

// ---------------------------------------------------------------- chrome

// Every transient message is kept as a locale key (plus its values) rather than
// as finished text, so a language switch can repaint the toast that is still on
// screen instead of leaving the previous language's sentence behind.
let toastSpec = null;

function showToast(spec) {
  // An error that is still on screen outranks an informational update. Decide
  // that from semantic state, before replacing the current message.
  if (spec.kind !== "error" && toastSpec?.visible && toastSpec.kind === "error") return;
  clearTimeout(paintToast.timer);
  toastSpec = { ...spec, visible: true };
  paintToast();
}

function toastKey(key, vars, kind = "info", ms = 7000) {
  showToast({ key, vars, kind, ms });
}

// Composite messages (a localised code sentence plus its gate findings) keep
// their builder so the toast repaints in the new language too.
function toastBuild(build, kind, ms = 0) {
  showToast({ render: build, kind, ms });
}

function paintToast() {
  const el = $("toast");
  if (!toastSpec?.visible) {
    el.hidden = true;
    return;
  }
  const { key, vars, render, kind, ms } = toastSpec;
  el.textContent = key ? t(key, vars) : render();
  el.className = `toast toast-${kind}`;
  el.hidden = false;
  clearTimeout(paintToast.timer);
  if (ms) {
    paintToast.timer = setTimeout(hideToast, ms);
  }
}

function hideToast() {
  clearTimeout(paintToast.timer);
  paintToast.timer = null;
  toastSpec = null;
  const el = $("toast");
  el.hidden = true;
  el.textContent = "";
}

function showPanel(name) {
  for (const section of document.querySelectorAll("main .panel")) {
    section.hidden = section.id !== `panel-${name}`;
  }
  for (const tab of document.querySelectorAll(".step")) {
    const active = tab.dataset.panel === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  if (name === "reidentify") loadJobs().catch(() => {});
  if (name === "dictionary") refreshDict().catch(() => {});
}

function setRunning(running) {
  state.busy = running;
  $("progress").hidden = !running;
  $("cancel-btn").hidden = !running;
  for (const id of [
    "inspect-btn", "detect-btn", "rescan-btn", "generate-btn", "restore-btn",
    "manual-add-btn", "dict-add", "job-dict-load", "clear-btn",
  ]) {
    const button = $(id);
    if (button) button.disabled = running;
  }
  if (running) {
    $("progress-bar").removeAttribute("value");
  } else {
    $("cancel-btn").hidden = true;
    updateFileButtons();
    updateRestoreButton();
  }
  $("upload-input").disabled = running;
  $("restore-input").disabled = running;
  $("upload-drop").setAttribute("aria-disabled", String(running));
  $("restore-drop").setAttribute("aria-disabled", String(running));
}

function setPhase(phase) {
  state.phase = phase || "";
  if (phase) $("progress-label").textContent = t(`p1.progress.${phase}`);
}

function setTaskProgress(index, total, name) {
  const bar = $("progress-bar");
  bar.max = Math.max(total, 1);
  bar.value = index;
  $("progress-label").textContent = t("p1.progress.file", {
    index: Math.min(index + 1, total),
    total,
    name,
  });
}

function onStatus(event, notify = true) {
  state.statusEvent = event;
  state.runtime = event.state;
  const badge = $("runtime-badge");
  badge.className = "badge";
  $("runtime-retry").hidden = event.state !== "failed";
  if (event.state === "ready") {
    badge.classList.add("badge-ok");
    badge.textContent = t("p1.runtime.ready");
  } else if (event.state === "initializing") {
    badge.classList.add("badge-wait");
    const initKeys = {
      pyodide: "p1.init.pyodide",
      "python-src": "p1.init.python_src",
      "betteroffice-docx": "p1.init.docx",
      "betteroffice-pptx": "p1.init.pptx",
    };
    badge.textContent = t(initKeys[event.phase] || "p1.runtime.initializing");
    if (notify && event.reason && event.reason !== "init") {
      toastKey("p1.runtime.rebuilding", null, "info", 0);
    }
  } else {
    badge.classList.add("badge-bad");
    badge.textContent = t("p1.runtime.failed");
    if (notify && event.reason) {
      toastKey("p1.error.INIT_FAILED", { error: event.reason }, "error", 0);
    }
  }
  updateFileButtons();
}

// ---------------------------------------------------------- eager preload

function showPreload(done, total) {
  const panel = $("preload-panel");
  const bar = $("preload-bar");
  const text = $("preload-text");
  if (!panel || !bar || !text) return;
  state.preload = { done: done || 0, total: total || 0, visible: true };
  paintPreload();
}

function paintPreload() {
  const bar = $("preload-bar");
  const text = $("preload-text");
  if (!bar || !text || !state.preload?.visible) {
    $("preload-panel").hidden = true;
    return;
  }
  const { done, total, error, finished } = state.preload;
  $("preload-panel").hidden = false;
  $("preload-retry").hidden = !error;
  if (error) {
    text.textContent = t("p1.preload.failed", { error });
    return;
  }
  if (finished) {
    text.textContent = t("p1.preload.done");
    return;
  }
  if (total) {
    bar.max = Math.max(total, 1);
    bar.value = done;
    text.textContent = t("p1.preload.progress", { done, total });
  } else {
    text.textContent = t("p1.preload.starting");
  }
}

function failPreload(message) {
  state.preload = { done: 0, total: 0, error: message, visible: true };
  paintPreload();
}

function hidePreload() {
  if (state.preload) state.preload.visible = false;
  $("preload-panel").hidden = true;
}

async function preloadRuntime() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.register("./sw.js", { type: "module" });
  await navigator.serviceWorker.ready;
  if (!navigator.onLine) return;
  const active = registration.active || registration.waiting || registration.installing;
  if (!active) throw new Error("service worker has no active worker");
  showPreload(0, 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      clearTimeout(timer);
      if (error) {
        failPreload(error.message || String(error));
        reject(error);
        return;
      }
      state.preload = { done: 0, total: 0, finished: true, visible: true };
      paintPreload();
      setTimeout(hidePreload, 1500);
      toastKey("p1.offline.ready", null, "ok", 5000);
      resolve();
    };
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type === "precache-progress") showPreload(data.done, data.total);
      else if (data.type === "precache-done") finish();
      else if (data.type === "precache-error") finish(new Error(data.message || "precache failed"));
    };
    const timer = setTimeout(() => finish(new Error("runtime preload timed out")), 10 * 60 * 1000);
    navigator.serviceWorker.addEventListener("message", onMessage);
    active.postMessage({ type: "PRECACHE" });
  });
}

async function installPresetDictionary() {
  state.dictionary = createDictionaryClient();
  return state.dictionary.update();
}

// ------------------------------------------------------------- worker runs

async function runWorker({ op, file, options = {} }) {
  return state.bridge.run({
    op,
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    options,
    onProgress: ({ phase, done, total }) => {
      setPhase(phase);
      const bar = $("progress-bar");
      if (typeof done === "number" && typeof total === "number" && total > 0) {
        bar.max = total;
        bar.value = done;
      } else {
        bar.removeAttribute("value");
      }
    },
  });
}

async function runBusy(task) {
  if (state.busy) throw Object.assign(new Error("busy"), { code: "BUSY" });
  setRunning(true);
  setPhase("init");
  try {
    return await task();
  } finally {
    setRunning(false);
    $("progress-bar").removeAttribute("value");
  }
}

async function runOp(args) {
  return runBusy(() => runWorker(args));
}

function reportError(error) {
  const code = error?.code || "INTERNAL";
  const build = () => {
    const parts = [t(errorKey(code), { error: error?.message || "" })];
    parts.push(...gateFindings(error?.detail));
    if (code === "TOO_LARGE") {
      parts.push(t("gate.tip.split"), t("gate.tip.convert"), t("gate.tip.machine"));
    }
    return parts.join(" · ");
  };
  toastBuild(build, code === "CANCELLED" ? "info" : "error", 0);
}

// Browser-store failures are written in English by client-store.js / store.js.
// Showing `error.message` verbatim would put English prose into a Chinese page,
// so the ones a user can actually hit map to their own locale key; anything else
// is reported through a localised wrapper sentence with the detail appended.
const STORE_ERROR_KEYS = [
  ["Wrong passphrase, or the stored mapping is corrupted.", "p1.restore.wrong_passphrase"],
  ["That conversion is no longer in this browser.", "p1.history.job_missing"],
  ["This conversion is not passphrase-protected", "p1.history.not_protected"],
  ["This result file is no longer stored in this browser", "p1.restore.result_gone"],
  ["Browser storage is unavailable", "p1.storage.unavailable"],
];

function storeErrorSpec(error, fallbackKey) {
  const message = String(error?.message || error || "");
  for (const [prefix, key] of STORE_ERROR_KEYS) {
    if (message.startsWith(prefix)) return { key, vars: null };
  }
  return { key: fallbackKey, vars: { error: message } };
}

function storeErrorText(error, fallbackKey) {
  const spec = storeErrorSpec(error, fallbackKey);
  return t(spec.key, spec.vars);
}

function gateFindings(detail) {
  const findings = detail?.findings_detail;
  if (Array.isArray(findings) && findings.length) {
    return findings.map((finding) =>
      finding?.message_key ? t(finding.message_key, finding.values || {}) : "",
    ).filter(Boolean);
  }
  const raw = detail?.findings;
  return Array.isArray(raw) ? raw : [];
}

// -------------------------------------------------------- de-identify page

function updateFileButtons() {
  const hasFiles = state.files.length > 0;
  const ready = !!state.bridge && state.runtime === "ready" && !state.busy;
  $("inspect-btn").disabled = !hasFiles || !ready;
  $("detect-btn").disabled = !hasFiles || !ready;
  $("clear-btn").disabled = !hasFiles;
  $("manual-add-btn").disabled = !hasFiles || !ready;
}

function makeTaskFile(file, gate) {
  state.taskFileSeq += 1;
  return {
    id: `task-file-${state.taskFileSeq}`,
    file,
    redactionConfirmed: false,
    inspection: null,
    detection: null,
    output: null,
    status: "pending",
    error: "",
    warnings: [],
    large: gate.level === "warn",
  };
}

function pickFiles(fileList) {
  if (state.busy) {
    $("upload-input").value = "";
    return toastKey("p1.error.BUSY", null, "info");
  }
  const incoming = [...(fileList || [])];
  if (!incoming.length) return;
  const { accepted, rejected, unsupported } = partitionPicks(incoming, {
    existing: state.files.map((entry) => entry.file),
    isSupported,
    gateLevel,
  });
  if (!accepted.length) {
    $("upload-input").value = "";
    if (rejected) {
      return toastKey("gate.file_reject", { size_mb: 50, max_mb: 50 }, "error", 0);
    }
    if (unsupported) return toastKey("p1.upload.wrong_type", null, "error");
    return toastKey("p1.upload.no_new_files", null, "info");
  }
  // A question and confirmation belong to the previously active file.
  dismissRedactionWarning();
  if (activeFile()) activeFile().redactionConfirmed = false;
  state.generated = null;
  state.files.push(...accepted.map(({ file, gate }) => makeTaskFile(file, gate)));
  state.activeFileIndex = state.files.length - accepted.length;
  if (rejected) toastKey("p1.upload.some_rejected", { count: rejected }, "info", 0);
  else if (unsupported) {
    toastKey("p1.upload.some_unsupported", { count: unsupported }, "info", 0);
  }
  renderTask();
}

function removeTaskFile(id) {
  if (state.busy) return;
  dismissRedactionWarning();
  const index = state.files.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  state.files.splice(index, 1);
  state.activeFileIndex = Math.min(state.activeFileIndex, Math.max(0, state.files.length - 1));
  state.generated = null;
  renderTask();
}

function clearTask() {
  if (state.busy) return;
  dismissRedactionWarning();
  state.files = [];
  state.activeFileIndex = 0;
  state.manualEntities = [];
  state.generated = null;
  state.selected = new Set();
  state.types = new Map();
  $("upload-file").hidden = true;
  $("task-files").hidden = true;
  $("upload-note").hidden = true;
  $("upload-degradations").hidden = true;
  $("degradation-list").textContent = "";
  $("upload-inspect").hidden = true;
  $("preview-card").hidden = true;
  $("review-card").hidden = true;
  $("generate-card").hidden = true;
  $("document-preview").textContent = "";
  $("manual-entity").value = "";
  $("upload-input").value = "";
  showWarnings([]);
  renderTaskFileList();
  renderTaskSummary();
  updateFileButtons();
}

function renderTaskFileList() {
  const host = $("task-files");
  host.textContent = "";
  host.hidden = state.files.length === 0;
  for (const [index, entry] of state.files.entries()) {
    const chip = document.createElement("span");
    chip.className = `task-file${index === state.activeFileIndex ? " is-active" : ""}`;
    if (entry.status === "failed") chip.classList.add("is-failed");
    const label = document.createElement("button");
    label.type = "button";
    label.className = "task-file-name";
    label.textContent = entry.file.name;
    label.addEventListener("click", () => selectTaskFile(index));
    chip.appendChild(label);
    const badge = document.createElement("span");
    badge.className = "task-file-state";
    badge.textContent = t(FILE_STATUS_KEYS[entry.status] || "p1.files.pending");
    if (entry.status === "failed" && entry.error) badge.title = entry.error;
    chip.appendChild(badge);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-file-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", t("p1.files.remove", { name: entry.file.name }));
    remove.addEventListener("click", () => removeTaskFile(entry.id));
    chip.appendChild(remove);
    host.appendChild(chip);
  }
}

function renderTaskSummary() {
  const node = $("task-summary");
  if (!node) return;
  if (state.files.length <= 1) {
    node.textContent = "";
    node.hidden = true;
    return;
  }
  const counts = taskSummary(state.files);
  node.hidden = false;
  node.textContent = t("p1.files.summary", {
    files: counts.files,
    pending: counts.pending,
    failed: counts.failed,
  });
}

function selectTaskFile(index) {
  if (!state.files.length) {
    state.activeFileIndex = 0;
  } else {
    const next = Math.max(0, Math.min(Number(index) || 0, state.files.length - 1));
    if (next !== state.activeFileIndex) {
      // Confirmation and any open question are valid only for this file while
      // it is active. Switching invalidates both rather than carrying consent
      // into another document or letting a stale modal answer the new one.
      dismissRedactionWarning();
      if (activeFile()) activeFile().redactionConfirmed = false;
    }
    state.activeFileIndex = next;
  }
  renderTask();
}

function renderTask() {
  const entry = activeFile();
  renderTaskFileList();
  renderTaskSummary();
  if (!entry) {
    clearTask();
    return;
  }
  $("upload-file").hidden = false;
  $("upload-file").textContent = t("p1.upload.selected_count", {
    count: state.files.length,
    name: entry.file.name,
    size: humanSize(entry.file.size),
  });
  // The large-file note names the file that actually crossed the warn line, so
  // switching to a small file never shows another file's warning.
  const largeEntry = state.files.find((row) => row.large);
  $("upload-note").hidden = !largeEntry;
  if (largeEntry) {
    const gate = gateLevel(largeEntry.file.size);
    $("upload-note").textContent = t("gate.file_warn", {
      size_mb: gate.size,
      warn_mb: 35,
    }) + " " + t("p1.upload.large_note");
  }
  renderDegradations(entry.file);
  showWarnings(entry.detection?.warnings || entry.warnings || []);
  if (entry.error) {
    $("upload-inspect").hidden = false;
    $("upload-inspect").textContent = t("p1.files.failed_reason", { error: entry.error });
  } else if (entry.inspection) {
    renderInspection(entry.file, entry.inspection);
  } else {
    $("upload-inspect").hidden = true;
  }
  renderPreview();
  renderReview();
  $("review-card").hidden = !entry.detection;
  renderGenerate();
  updateFileButtons();
  updateFileSwitchers();
}

function updateFileSwitchers() {
  for (const [id, handler] of [
    ["preview-file", (index) => selectTaskFile(index)],
    ["result-file", (index) => selectTaskFile(index)],
  ]) {
    const select = $(id);
    if (!select) continue;
    const previous = Number(select.value);
    select.textContent = "";
    for (const [index, entry] of state.files.entries()) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = entry.file.name;
      select.appendChild(option);
    }
    select.value = String(Math.min(state.activeFileIndex, Math.max(0, state.files.length - 1)));
    if (previous !== Number(select.value)) select.dataset.synced = "true";
    select.onchange = () => handler(Number(select.value));
  }
}

function renderDegradations(file) {
  const details = $("upload-degradations");
  const keys = isXlsx(file) ? DEGRADATION_KEYS.xlsx : isPptx(file) ? DEGRADATION_KEYS.pptx : [];
  details.hidden = keys.length === 0;
  const list = $("degradation-list");
  list.textContent = "";
  for (const key of keys) {
    const li = document.createElement("li");
    li.textContent = t(key);
    list.appendChild(li);
  }
}

function degradationNotes(warnings) {
  if (!Array.isArray(warnings)) return [];
  const seen = new Set();
  const notes = [];
  let unknown = false;
  for (const code of warnings) {
    const key = DEGRADATION_CODE_KEYS[code];
    if (!key) {
      unknown = true;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(t(key));
  }
  if (unknown) notes.push(t("p1.degradations.unknown"));
  return notes;
}

function showWarnings(warnings) {
  const notes = degradationNotes(warnings);
  $("upload-warnings").hidden = notes.length === 0;
  $("upload-warnings").textContent = notes.join(" · ");
}

function bindDropzone(zone, input, onFiles, { multiple = false } = {}) {
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    input.click();
  });
  for (const type of ["dragenter", "dragover"]) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add("is-over");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.remove("is-over");
    });
  }
  zone.addEventListener("drop", (event) => {
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    onFiles(multiple ? files : files.slice(0, 1));
  });
  input.addEventListener("change", () => {
    const files = [...(input.files || [])];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  });
}

// The "package checked" line is part of the visible upload state, so it is
// rebuilt from the active file's own inspection on a language switch rather
// than written once and left in the previous language.
function renderInspection(file = activeFile()?.file, result = activeFile()?.inspection) {
  const line = $("upload-inspect");
  if (!result || !file) {
    line.hidden = true;
    return;
  }
  const partsKey = isXlsx(file)
    ? "p1.upload.parts_xlsx"
    : isPptx(file)
      ? "p1.upload.parts_pptx"
      : "p1.upload.parts";
  line.hidden = false;
  line.textContent = `${t("p1.upload.checked")} ${t(partsKey, {
    parts: result.parts,
    paragraphs: result.paragraphs || 0,
  })}`;
}

function renderRedactionWarning() {
  const warning = state.redactionWarning;
  if (!warning) return;
  $("redaction-warning-text").textContent = t("p1.redaction_warning.body", {
    occurrences: warning.tokenCount,
    distinct: warning.distinctCount,
  });
  const examples = Array.isArray(warning.examples) ? warning.examples : [];
  $("redaction-warning-examples").textContent = examples.length
    ? t("p1.redaction_warning.examples", { examples: examples.join(", ") })
    : "";
}

// The confirmation is a real gate: nothing is written to a file that already
// carries Lethe placeholders until the user has read the dialog and chosen.
// The answer is `true` (continue), `false` (the user stopped) or `null` (the
// question no longer applies because the file changed under it).
let redactionPrompt = null;
let redactionPending = null; // { entry, promise }: the question on screen

function closeRedactionWarning(answer) {
  const dialog = $("redaction-warning");
  if (dialog.open) dialog.close();
  state.redactionWarning = null;
  const resolve = redactionPrompt;
  redactionPrompt = null;
  redactionPending = null;
  if (resolve) resolve(answer);
}

function dismissRedactionWarning() {
  if (redactionPrompt) closeRedactionWarning(null);
}

function askAboutExistingRedaction(inspection, entry) {
  const warning = inspection?.redactionWarning;
  if (!warning) return Promise.resolve(true);
  if (entry.redactionConfirmed) return Promise.resolve(true);
  // Asking again for the task file already on screen must share that answer:
  // replacing the resolver would strand the first caller forever.
  if (redactionPending?.entry === entry) return redactionPending.promise;
  if (redactionPending) closeRedactionWarning(null);
  state.redactionWarning = warning;
  renderRedactionWarning();
  const dialog = $("redaction-warning");
  if (!dialog.open) dialog.showModal();
  const promise = new Promise((resolve) => {
    redactionPrompt = (answer) => {
      if (answer) entry.redactionConfirmed = true;
      resolve(answer);
    };
  });
  redactionPending = { entry, promise };
  return promise;
}

// The inspect op needs the user's custom token types so the "already
// de-identified" detector recognises placeholders the dictionary itself
// defines, not just Lethe's built-in prefixes.
function inspectOptions() {
  return { tokenTypes: state.customTypesList };
}

async function inspectActive() {
  const entry = activeFile();
  if (!entry) return toastKey("p1.upload.need_file", null, "error");
  try {
    const inspection = await runOp({
      op: "inspect",
      file: entry.file,
      options: inspectOptions(),
    });
    if (entry !== activeFile()) return;
    entry.inspection = inspection;
    renderTask();
    // `null` means the question went stale because the active file changed.
    const answer = await askAboutExistingRedaction(inspection, entry);
    if (answer === false) toastKey("p1.redaction_warning.stopped", null, "info");
  } catch (error) {
    reportError(error);
  }
}

function entitiesForDetection() {
  const rows = new Map();
  for (const row of state.dictRows) {
    const key = String(row.canonical).toLowerCase();
    if (!state.disabledEntities.has(key)) rows.set(key, row);
  }
  for (const row of state.manualEntities) rows.set(row.canonical.toLowerCase(), row);
  return [...rows.values()].map((row) => ({
    canonical: row.canonical,
    type: row.type,
    aliases: row.aliases || [],
  }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// `text`/`truncated` default to the active file so a language switch can redraw
// the panel without threading arguments through every caller.
function renderPreview(text, items, truncated) {
  const entry = activeFile();
  const card = $("preview-card");
  const output = $("document-preview");
  if (text === undefined) {
    text = entry?.detection?.previewText || entry?.inspection?.previewText || "";
    items = entry?.detection?.items || [];
    truncated = entry?.detection?.previewTruncated || entry?.inspection?.previewTruncated;
  }
  if (!text) {
    card.hidden = false;
    output.textContent = t("p1.preview.empty");
    $("preview-note").textContent = "";
    return;
  }
  card.hidden = false;
  const surfaces = [];
  for (const item of items || []) {
    for (const surface of item.surfaces || [item.canonical]) {
      if (surface) surfaces.push(String(surface));
    }
  }
  surfaces.sort((a, b) => b.length - a.length);
  if (!surfaces.length) {
    output.textContent = text;
  } else {
    const pattern = new RegExp(surfaces.map((value) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
    let html = "";
    let at = 0;
    for (const match of text.matchAll(pattern)) {
      html += escapeHtml(text.slice(at, match.index));
      html += `<mark>${escapeHtml(match[0])}</mark>`;
      at = match.index + match[0].length;
    }
    output.innerHTML = html + escapeHtml(text.slice(at));
  }
  $("preview-note").textContent = truncated ? t("p1.preview.note") : "";
}

/**
 * Detect every file in the task, then allocate one token per real value across
 * the batch. A file that fails is recorded with its error and skipped; the
 * rest still get a detection, which is what makes "some files failed" a
 * usable outcome rather than an all-or-nothing abort.
 */
async function detectTask() {
  if (!state.files.length) return toastKey("p1.upload.need_file", null, "error");
  const entities = entitiesForDetection();
  const target = [...state.files];
  const inspections = new Map();
  const originalIndex = state.activeFileIndex;
  try {
    // Inspect first and ask outside the busy scope. Nothing is redacted until
    // every inspected file has passed its own repeat-redaction gate, so Stop
    // leaves the whole task untouched instead of writing earlier files.
    await runBusy(async () => {
      for (const [index, entry] of target.entries()) {
        setTaskProgress(index, target.length, entry.file.name);
        entry.detection = null;
        entry.detectedTokens = null;
        entry.output = null;
        entry.error = "";
        entry.warnings = [];
        entry.status = "pending";
        try {
          const inspection = await runWorker({
            op: "inspect",
            file: entry.file,
            options: inspectOptions(),
          });
          entry.inspection = inspection;
          inspections.set(entry.id, inspection);
        } catch (error) {
          entry.status = "failed";
          entry.error = error?.message || String(error);
          if (state.files.length === 1) reportError(error);
        }
      }
    });

    // Each file gets its own answer. A confirmation on one file never covers
    // the next, and selecting another task file dismisses a pending question.
    for (const [index, entry] of target.entries()) {
      const inspection = inspections.get(entry.id);
      if (!inspection) continue;
      state.activeFileIndex = index;
      renderTask();
      const answer = await askAboutExistingRedaction(inspection, entry);
      if (answer !== true) {
        if (answer === false) toastKey("p1.redaction_warning.stopped", null, "info");
        renderTask();
        return;
      }
    }

    let ok = 0;
    await runBusy(async () => {
      for (const [index, entry] of target.entries()) {
        const inspection = inspections.get(entry.id);
        if (!inspection) continue;
        setTaskProgress(index, target.length, entry.file.name);
        try {
          const result = await runWorker({
            op: "redact",
            file: entry.file,
            options: { entities },
          });
          const manual = new Set(
            state.manualEntities.map((row) => row.canonical.toLowerCase()),
          );
          const items = (result.items || []).map((item) => ({
            ...item,
            include: item.include !== false,
            source: manual.has(item.canonical.toLowerCase()) ? "manual" : item.source,
          }));
          const counts = result.counts || {};
          const split = splitCounts(counts);
          entry.detection = {
            items,
            bytes: result.bytes || null,
            hits: result.hits || 0,
            counts: { ...counts },
            ...split,
            warnings: result.warnings || [],
            previewText: inspection.previewText || "",
            previewTruncated: !!inspection.previewTruncated,
          };
          // The numbering these bytes actually carry. Task-wide tokens replace
          // it on every item below, so this is the only record of what was
          // written and the sole way to tell a reusable detection from one
          // that must be rewritten with the shared mapping.
          entry.detectedTokens = Object.fromEntries(
            items.filter((item) => item.token).map((item) => [item.canonical, item.token]),
          );
          entry.warnings = result.warnings || [];
          entry.status = "ready";
          ok += 1;
        } catch (error) {
          entry.status = "failed";
          entry.error = error?.message || String(error);
          if (state.files.length === 1) reportError(error);
        }
      }
      // One mapping for the whole batch, applied to every file's items.
      state.selected = new Set();
      state.types = new Map();
      for (const entry of state.files) {
        for (const item of entry.detection?.items || []) {
          state.selected.add(item.canonical);
          state.types.set(item.canonical, item.type);
        }
      }
      allocateTaskTokens(state.files, state.types);
      state.generated = null;
      state.activeFileIndex = Math.min(originalIndex, Math.max(0, state.files.length - 1));
      renderTask();
      if (!ok) {
        toastKey("p1.detect.all_failed", { files: target.length }, "error", 0);
        return;
      }
      const failed = target.length - ok;
      if (failed) {
        toastKey("p1.detect.partial", { failed, files: target.length }, "info", 0);
      }
      else {
        toastKey(
          "p1.review.selected",
          { count: state.selected.size, total: state.selected.size },
          "info",
          3000,
        );
      }
    });
  } catch (error) {
    reportError(error);
  }
}

function addManualEntity() {
  const value = $("manual-entity").value.trim();
  if (!value) return;
  const type = $("manual-type").value || "PERSON";
  const key = value.toLowerCase();
  if (!state.manualEntities.some((row) => row.canonical.toLowerCase() === key)) {
    state.manualEntities.push({ canonical: value, type, aliases: [], source: "manual" });
  }
  $("manual-entity").value = "";
  // Re-detecting the whole batch keeps the tokens consistent after a new term.
  detectTask().catch(reportError);
}

/** The task-wide entities to hand the worker, honouring the ticked rows. */
function chosenEntities() {
  const rows = new Map();
  for (const entry of state.files) {
    for (const item of entry.detection?.items || []) {
      if (!state.selected.has(item.canonical)) continue;
      const type = state.types.get(item.canonical) || item.type;
      const key = `${String(type).toUpperCase()}|${item.canonical.toLowerCase()}`;
      if (rows.has(key)) continue;
      rows.set(key, {
        canonical: item.canonical,
        type,
        aliases: state.dictByKey.get(item.canonical.toLowerCase())?.aliases || [],
      });
    }
  }
  return [...rows.values()];
}

function renderReview() {
  const rows = $("review-rows");
  rows.textContent = "";
  const entry = activeFile();
  const items = entry?.detection?.items || [];
  $("review-empty").hidden = items.length > 0;
  if ($("review-file")) {
    $("review-file").textContent = entry
      ? t("p1.review.file", { name: entry.file.name, files: state.files.length })
      : "";
  }
  for (const item of items) {
    const tr = document.createElement("tr");
    const checkCell = document.createElement("td");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "row-check";
    check.checked = state.selected.has(item.canonical);
    check.setAttribute("aria-label", item.canonical);
    check.addEventListener("change", () => {
      if (check.checked) state.selected.add(item.canonical);
      else state.selected.delete(item.canonical);
      renderTask();
    });
    checkCell.appendChild(check);
    tr.appendChild(checkCell);

    const value = document.createElement("td");
    value.className = "cell-value";
    value.textContent = item.canonical;
    tr.appendChild(value);

    const typeCell = document.createElement("td");
    const type = document.createElement("select");
    type.className = "row-type";
    for (const name of [...new Set([...ENTITY_TYPES, ...state.customTypesList])]) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      type.appendChild(option);
    }
    type.value = state.types.get(item.canonical) || item.type;
    type.addEventListener("change", () => {
      state.types.set(item.canonical, type.value);
      allocateTaskTokens(state.files, state.types);
      renderTask();
    });
    typeCell.appendChild(type);
    tr.appendChild(typeCell);

    const source = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `src src-${item.source}`;
    badge.textContent = t(sourceKey(item.source));
    source.appendChild(badge);
    tr.appendChild(source);

    const count = document.createElement("td");
    count.textContent = String(item.count);
    tr.appendChild(count);

    const token = document.createElement("td");
    token.className = "cell-token";
    token.textContent = item.token || "—";
    tr.appendChild(token);
    rows.appendChild(tr);
  }
  renderReviewCount();
}

function renderReviewCount() {
  const total = (activeFile()?.detection?.items || []).length;
  const chosen = (activeFile()?.detection?.items || [])
    .filter((item) => state.selected.has(item.canonical)).length;
  $("review-count").textContent = t("p1.review.selected", { count: chosen, total });
  if ($("review-task-note")) {
    $("review-task-note").hidden = state.files.length <= 1;
    $("review-task-note").textContent = state.files.length > 1
      ? t("p1.review.task_hint", { files: state.files.length })
      : "";
  }
}

async function saveSelectedNames(items) {
  const rows = items
    .filter((item) => item.source !== "pattern")
    .filter((item) => state.dictByKey.get(item.canonical.toLowerCase())?.source !== "preset")
    .map((item) => ({
      canonical: item.canonical,
      type: state.types.get(item.canonical) || item.type,
      aliases: state.dictByKey.get(item.canonical.toLowerCase())?.aliases || [],
    }));
  if (!rows.length) return;
  await store.mergeUserEntities(rows);
  await refreshDict();
  await refreshStorageLine();
}

/**
 * True when the bytes from detection can be delivered unchanged.
 *
 * Detection writes each file with its own per-file numbering, because the
 * task-wide allocation only exists once every file has been detected. Those
 * bytes are therefore only reusable when that numbering already matches the
 * task-wide one — the single-file case, or a batch whose files happened to
 * detect in the same order. Otherwise the file is rewritten with the shared
 * overrides, because shipping per-file tokens under a task-wide mapping would
 * make re-identification restore the wrong value.
 *
 * `detectedTokens` holds the numbering those bytes actually carry; `item.token`
 * has already been overwritten with the task-wide token by then.
 */
function detectionIsCurrent(entry, overrides) {
  if (!entry.detection?.bytes) return false;
  const items = entry.detection.items || [];
  if (!items.length) return false;
  return items.every((item) => {
    if (item.include === false) return true;
    if (!state.selected.has(item.canonical)) return false;
    if ((state.types.get(item.canonical) || item.type) !== item.type) return false;
    // No record of what these bytes carry means no safe reuse: fall back to
    // rewriting rather than trusting `item.token`, which is already the
    // task-wide token and would agree with itself by construction.
    const written = entry.detectedTokens?.[item.canonical];
    return !!written && written === overrides[tokenKey(item.type, item.canonical)];
  });
}

/**
 * Write every writable file with the shared token overrides, then store one
 * job for the task. Each file keeps its own output bytes, hits and name, so
 * switching files never mixes previews, matches or counts.
 */
async function generateTask() {
  const entries = writableEntries(state.files);
  if (!entries.length) return toastKey("p1.upload.need_file", null, "error");
  const entities = chosenEntities();
  if (!entities.length) return toastKey("p1.review.none_selected", null, "error");
  const { overrides, allocations } = allocateTaskTokens(state.files, state.types);
  // Names are assigned across the whole task before any file is written: two
  // same-named files from different folders are different documents, and giving
  // them one result name would make the stored set ambiguous — history
  // downloads by name and would hand one file the other's bytes.
  const outputNames = uniqueOutputNames(entries);
  const jobId = `job-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-` +
    Math.random().toString(36).slice(2, 6);
  // Declared outside the busy block so the outcome is still readable after it:
  // the per-file failure list is what the task reports and what history keeps.
  const failures = [];
  try {
    await runBusy(async () => {
      for (const [index, entry] of entries.entries()) {
        setTaskProgress(index, entries.length, entry.file.name);
        const outputName = outputNames.get(entry.id) || replaceSuffix(entry.file.name, "-redacted");
        // Failure is per file. One file that cannot be written must not throw
        // away the files already written in this loop, nor stop the ones after
        // it: a task where four of five files succeeded is a usable result, and
        // re-running the whole batch to recover the fifth would be worse. The
        // file is recorded as failed with its own message, everything else is
        // left exactly as the successful write left it.
        try {
          if (detectionIsCurrent(entry, overrides)) {
            const counts = entry.detection.counts || {};
            entry.output = {
              name: outputName,
              bytes: entry.detection.bytes,
              hits: entry.detection.hits || 0,
              counts: { ...counts },
              bodyHits: entry.detection.bodyHits || 0,
              commentHits: entry.detection.commentHits || 0,
              otherHits: entry.detection.otherHits || 0,
              reused: true,
            };
          } else {
            const result = await runWorker({
              op: "redact",
              file: entry.file,
              options: { entities, token_overrides: overrides },
            });
            const counts = result.counts || {};
            const split = splitCounts(counts);
            entry.output = {
              name: outputName,
              bytes: result.bytes,
              hits: result.hits || 0,
              counts: { ...counts },
              ...split,
              reused: false,
            };
            entry.detection = {
              ...(entry.detection || {}),
              items: result.items || entry.detection?.items || [],
              bytes: result.bytes || null,
              hits: result.hits || 0,
              counts: { ...counts },
              ...split,
              warnings: result.warnings || entry.detection?.warnings || [],
            };
            // These bytes now carry the task-wide numbering, so that is what a
            // later reuse check must compare against.
            entry.detectedTokens = Object.fromEntries(
              (result.items || []).filter((item) => item.token)
                .map((item) => [item.canonical, item.token]),
            );
          }
          entry.status = "generated";
          entry.error = "";
        } catch (error) {
          // A cancelled run is not a broken file: it stops the loop rather than
          // being reported as this file's failure.
          if (error?.code === "CANCELLED") throw error;
          entry.output = null;
          entry.status = "failed";
          entry.error = error?.message || String(error);
          failures.push({ name: entry.file.name, error: entry.error });
        }
      }
      const counterTotals = taskCounterTotals(entries);
      state.generated = {
        jobId,
        files: entries.length,
        failed: failures.length,
        hits: entries.reduce((total, entry) => total + (entry.output?.hits || 0), 0),
        ...counterTotals,
        // One token per distinct entity, not per override key: the same entity
        // spelled two ways in two files shares one token and two keys.
        tokens: allocations.filter((row) => state.selected.has(row.canonical)).length,
      };
      renderTask();
      $("generate-card").hidden = false;
    });
    const mapping = {};
    for (const entry of entries) {
      for (const item of entry.detection?.items || []) {
        if (item.token && state.selected.has(item.canonical)) mapping[item.token] = item.canonical;
      }
    }
    await persistJob(jobId, mapping);
    if ($("save-names").checked) await saveSelectedNames(entities);
    // The successful files stay written and stored; this only names the ones
    // that did not make it, so the user can retry just those.
    if (failures.length) {
      toastKey(
        "p1.generate.partial_failed",
        { failed: failures.length, files: entries.length, name: failures[0].name },
        "error",
        0,
      );
    }
    $("generate-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    reportError(error);
  }
}

async function persistJob(jobId, mapping) {
  const node = $("generate-saved");
  const entries = writableEntries(state.files);
  try {
    await store.saveJob({
      jobId,
      createdAt: new Date().toISOString(),
      mapping,
      sourceFiles: entries.map((entry) => entry.file.name),
      files: buildJobFiles(state.files),
      replacements: state.generated?.hits || 0,
      passphrase: "",
    });
    state.storageOk = true;
    state.generatedSaved = { key: "p1.generate.saved", vars: null };
    node.textContent = t("p1.generate.saved");
    try {
      await store.saveOutput({
        jobId,
        createdAt: new Date().toISOString(),
        files: entries
          .filter((entry) => entry.output?.bytes)
          .map((entry) => ({
            name: entry.output.name,
            type: mimeFor(entry.output.name),
            b64: bytesToBase64(entry.output.bytes),
          })),
      });
    } catch (error) {
      console.warn("Result files were not kept in this browser:", error);
    }
    await loadJobs();
  } catch (error) {
    state.generatedSaved = storeErrorSpec(error, "p1.generate.unsaved");
  }
  paintGeneratedSaved();
}

// The saved / not-saved line outlives the run, so it is kept as a key + values
// and repainted on a language switch rather than frozen in one language.
function paintGeneratedSaved() {
  const node = $("generate-saved");
  if (!node) return;
  const spec = state.generatedSaved;
  node.textContent = spec ? t(spec.key, spec.vars) : "";
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < view.length; index += chunk) {
    binary += String.fromCharCode(...view.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function renderGenerate() {
  const out = state.generated;
  if (!out) {
    $("generate-card").hidden = true;
    return;
  }
  $("generate-card").hidden = false;
  const summary = t("p1.generate.ready", {
    count: out.hits,
    tokens: out.tokens,
    files: out.files,
  });
  const hasBreakdown =
    Number.isFinite(out.bodyHits) || Number.isFinite(out.commentHits);
  $("generate-summary").textContent = hasBreakdown
    ? `${summary} · ${t("p1.generate.breakdown", {
      body: out.bodyHits || 0,
      comments: out.commentHits || 0,
      other: out.otherHits || 0,
    })}`
    : summary;
  $("generate-job").textContent = `${t("p1.generate.job")}: ${out.jobId}`;
  const entry = activeFile();
  const status = $("result-file-status");
  if (status) {
    // A file that failed generation says so with its own error. Reporting it as
    // "pending" would suggest it can still be downloaded, and reporting another
    // file's count would be plainly wrong.
    if (entry?.status === "failed") {
      status.textContent = t("p1.files.failed_reason", { error: entry.error || "" });
    } else if (entry?.output) {
      status.textContent = t("p1.generate.file_status", {
        name: entry.file.name,
        count: entry.output.hits,
      });
    } else {
      status.textContent = t("p1.files.pending");
    }
  }
  const download = $("download-btn");
  if (download) download.disabled = !entry?.output?.bytes;
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeFor(name) }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function downloadActiveResult() {
  const entry = activeFile();
  if (!entry?.output?.bytes) return toastKey("p1.generate.no_result", null, "error");
  download(entry.output.bytes, entry.output.name);
}

async function downloadActiveResultAgain() {
  const jobId = state.selectedJobId;
  const file = state.jobFiles[state.jobFileIndex];
  if (!file) return toastKey("p1.history.no_file", null, "error");
  if (file.status === "failed") return toastKey("p1.history.no_output", null, "error");
  try {
    // A multi-file job stores one result per file, so ask for that file's
    // result by name. A legacy job stored the task's single output under the
    // original name and has no per-file record, so pass no name and take it.
    await store.downloadOutput(jobId, file.output || "");
  } catch (error) {
    toastBuild(() => storeErrorText(error, "p1.history.no_output"), "error", 0);
  }
}

// --------------------------------------------------------- re-identify page

async function loadJobs() {
  state.jobs = await store.listJobs();
  if (state.selectedJobId && !state.jobs.some((job) => job.jobId === state.selectedJobId)) {
    state.jobDictRequest += 1;
    state.restoreRequest += 1;
    state.selectedJobId = "";
    state.jobMapping = null;
    state.jobFiles = [];
    state.jobFileIndex = 0;
    state.restored = null;
    $("restore-result").hidden = true;
  }
  renderHistory();
  $("restore-no-jobs").hidden = state.jobs.length > 0;
  refreshStorageLine();
}

function renderHistory() {
  const body = $("history-rows");
  body.textContent = "";
  for (const job of state.jobs) {
    const files = normaliseJobFiles(job);
    const tr = document.createElement("tr");
    tr.classList.toggle("is-selected", job.jobId === state.selectedJobId);
    const selectCell = document.createElement("td");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "history-job";
    radio.value = job.jobId;
    radio.checked = job.jobId === state.selectedJobId;
    radio.setAttribute("aria-label", job.jobId);
    radio.addEventListener("change", () => selectJob(job));
    selectCell.appendChild(radio);
    tr.appendChild(selectCell);
    const names = files.length <= 1
      ? (files[0]?.name || "—")
      : t("p1.history.file_count", { count: files.length, name: files[0]?.name || "" });
    for (const value of [
      (job.createdAt || "").replace("T", " ").slice(0, 16) || "—",
      names,
      String(job.replacements || 0),
      job.jobId,
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  renderSelectedJob();
  updateRestoreButton();
  updateRestoreFileCard();
}

function renderSelectedJob() {
  $("selected-job").textContent = state.selectedJobId
    ? t("p1.history.selected", { job: state.selectedJobId })
    : t("p1.history.none");
}

function updateRestoreFileCard() {
  const card = $("history-files-card");
  if (!card) return;
  card.hidden = !state.selectedJobId || state.jobFiles.length === 0;
  const select = $("history-file");
  if (!select) return;
  select.textContent = "";
  // A task may hold two files with the same name from different folders, so the
  // option text falls back to the distinct result name when the source names
  // alone would read as two identical entries.
  const repeated = new Set();
  const seen = new Map();
  for (const file of state.jobFiles) {
    const count = (seen.get(file.name) || 0) + 1;
    seen.set(file.name, count);
    if (count > 1) repeated.add(file.name);
  }
  for (const [index, file] of state.jobFiles.entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = repeated.has(file.name) && file.output
      ? `${file.name} → ${file.output}`
      : file.name;
    select.appendChild(option);
  }
  state.jobFileIndex = Math.min(state.jobFileIndex, Math.max(0, state.jobFiles.length - 1));
  select.value = String(state.jobFileIndex);
  select.onchange = () => {
    state.jobFileIndex = Number(select.value) || 0;
    renderHistoryFile();
  };
  renderHistoryFile();
}

function renderHistoryFile() {
  const file = state.jobFiles[state.jobFileIndex];
  const status = $("history-file-status");
  const preview = $("history-preview");
  const download = $("history-download");
  if (!file) {
    if (status) status.textContent = "";
    if (preview) preview.textContent = "";
    if (download) download.disabled = true;
    return;
  }
  if (preview) preview.textContent = "";
  if (status) {
    const notes = [file.name];
    if (typeof file.hits === "number") {
      notes.push(t("p1.history.file_hits", { count: file.hits }));
    } else {
      notes.push(t("p1.history.legacy_hits"));
    }
    if (file.status === "failed") notes.push(t("p1.files.failed"));
    status.textContent = notes.join(" · ");
  }
  if (preview) {
    // The readable record for this file. Result bytes live in IndexedDB and
    // previewing them would mean re-parsing a stored document, so the panel
    // reports what happened to the file and the download button fetches the
    // result itself.
    const lines = [t("p1.history.file_status", { status: FILE_STATUS_KEYS[file.status] ? t(FILE_STATUS_KEYS[file.status]) : file.status })];
    if (file.output) lines.push(t("p1.history.file_output", { name: file.output }));
    if (file.error) lines.push(t("p1.files.failed_reason", { error: file.error }));
    preview.textContent = lines.join("\n");
  }
  if (download) {
    download.disabled = !state.jobOutputIds?.has(state.selectedJobId) || file.status === "failed";
    download.title = download.disabled ? t("p1.history.no_output") : "";
  }
}

async function selectJob(job) {
  state.jobDictRequest += 1;
  state.restoreRequest += 1;
  state.selectedJobId = job.jobId;
  state.jobMapping = null;
  state.jobFiles = normaliseJobFiles(job);
  state.jobFileIndex = 0;
  state.restored = null;
  state.restoreSummary = null;
  state.jobDictNote = null;
  $("restore-result").hidden = true;
  $("job-dict-rows").textContent = "";
  renderHistory();
  if (job.passphraseProtected && !$("restore-passphrase").value) {
    showJobDictionaryNote({ key: "p1.history.passphrase_required", vars: null });
    return;
  }
  await loadHistoryDictionary(job.jobId);
  await loadJobOutputs(job.jobId);
}

async function loadJobOutputs(jobId) {
  if (!store.storeAvailable()) return;
  try {
    const stats = await store.outputStats();
    state.jobOutputIds = new Set(stats.jobIds || []);
  } catch {
    state.jobOutputIds = new Set();
  }
  if (jobId !== state.selectedJobId) return;
  renderHistoryFile();
}

// The note under the job dictionary is kept as a key + values so a language
// switch repaints it; `null` hides it.
function showJobDictionaryNote(spec) {
  state.jobDictNote = spec;
  paintJobDictionaryNote();
}

function paintJobDictionaryNote() {
  const note = $("job-dict-note");
  const spec = state.jobDictNote;
  note.hidden = !spec;
  note.textContent = spec ? t(spec.key, spec.vars) : "";
}

async function loadHistoryDictionary(jobId = state.selectedJobId) {
  const request = ++state.jobDictRequest;
  const job = state.jobs.find((row) => row.jobId === jobId);
  if (!job) return;
  try {
    const mapping = await store.getMapping(job.jobId, $("restore-passphrase").value);
    if (request !== state.jobDictRequest || jobId !== state.selectedJobId) return;
    state.jobMapping = mapping;
    const body = $("job-dict-rows");
    body.textContent = "";
    const entries = Object.entries(state.jobMapping || {}).sort(([a], [b]) => a.localeCompare(b));
    for (const [token, real] of entries) {
      const tr = document.createElement("tr");
      for (const value of [token, real]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    showJobDictionaryNote(entries.length ? null : { key: "p1.history.no_dictionary", vars: null });
  } catch (error) {
    if (request !== state.jobDictRequest || jobId !== state.selectedJobId) return;
    state.jobMapping = null;
    $("job-dict-rows").textContent = "";
    showJobDictionaryNote(storeErrorSpec(error, "p1.history.cant_load"));
  }
}

function updateRestoreButton() {
  const button = $("restore-btn");
  if (button) button.disabled = state.busy || !state.selectedJobId || !state.restoreFile;
}

function pickRestoreFile(file) {
  if (state.busy) {
    $("restore-input").value = "";
    return toastKey("p1.error.BUSY", null, "info");
  }
  if (!isSupported(file)) return toastKey("p1.upload.wrong_type", null, "error");
  const gate = gateLevel(file.size);
  if (gate.level === "reject") {
    return toastKey("gate.file_reject", { size_mb: gate.size, max_mb: 50 }, "error", 0);
  }
  state.restoreFile = file;
  state.restoreRequest += 1;
  state.restored = null;
  $("restore-result").hidden = true;
  $("restore-file").hidden = false;
  $("restore-file").textContent = t("p1.upload.selected", {
    name: file.name,
    size: humanSize(file.size),
  });
  updateRestoreButton();
}

async function restore() {
  const jobId = state.selectedJobId;
  const file = state.restoreFile;
  const passphrase = $("restore-passphrase").value;
  const request = ++state.restoreRequest;
  if (!jobId) return toastKey("p1.restore.need_job", null, "error");
  if (!file) return toastKey("p1.restore.need_file", null, "error");
  const stillCurrent = () =>
    request === state.restoreRequest && jobId === state.selectedJobId && file === state.restoreFile;
  try {
    const tokenMap = await store.getMapping(jobId, passphrase);
    if (!stillCurrent()) return;
    const result = await runOp({
      op: "restore",
      file,
      options: { token_map: tokenMap },
    });
    if (!stillCurrent()) return;
    state.restored = {
      bytes: result.bytes,
      hits: result.hits || 0,
      name: replaceSuffix(file.name, "-restored"),
      jobId,
      request,
    };
    renderRestore();
    $("restore-result").hidden = false;
  } catch (error) {
    if (!stillCurrent()) return;
    if (error?.code) reportError(error);
    else toastBuild(() => storeErrorText(error, "p1.restore.failed"), "error", 0);
  }
}

function renderRestore() {
  if (!state.restored) return;
  $("restore-summary").textContent = t("p1.restore.ready", { count: state.restored.hits });
}

// ---------------------------------------------------------- dictionary page

async function refreshDict() {
  const [userRows, tokenTypes] = await Promise.all([
    store.getUserEntities(),
    store.getUserTokenTypes(),
  ]);
  state.customTypesList = tokenTypes;
  let presetRows = [];
  if (state.dictionary) {
    try {
      presetRows = await state.dictionary.loadEntities({ tier: "all" });
    } catch (error) {
      console.warn("Preset dictionary is unavailable:", error);
    }
  }
  state.dictRows = mergeDictionaryLayers(userRows, presetRows);
  state.dictByKey = new Map(state.dictRows.map((row) => [row.canonical.toLowerCase(), row]));
  state.disabledEntities = store.getDisabledEntities();
  renderDictionary();
  renderReview();
}

function renderDictionary() {
  const needle = $("dict-search").value.trim().toLowerCase();
  const rows = state.dictRows.filter((row) => {
    if (!needle) return true;
    return [row.canonical, row.type, ...(row.aliases || [])]
      .some((value) => String(value || "").toLowerCase().includes(needle));
  });
  rows.sort((a, b) => {
    if (a.source !== b.source) return a.source === "preset" ? -1 : 1;
    return a.canonical.localeCompare(b.canonical);
  });
  const body = $("dict-rows");
  body.textContent = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const enabled = !state.disabledEntities.has(row.canonical.toLowerCase());
    tr.classList.toggle("dict-row-disabled", !enabled);
    const enabledCell = document.createElement("td");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = enabled;
    check.setAttribute("aria-label", row.canonical);
    check.addEventListener("change", () => {
      state.disabledEntities = store.setEntityDefault(row.canonical, check.checked);
      tr.classList.toggle("dict-row-disabled", !check.checked);
    });
    enabledCell.appendChild(check);
    tr.appendChild(enabledCell);
    const aliases = (row.aliases || []).join(", ");
    for (const value of [
      row.canonical,
      row.type,
      row.source === "preset" ? t("p1.dictionary.preset") : t("p1.dictionary.user"),
      aliases || "—",
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      if (value === aliases && aliases) td.className = "dict-aliases";
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  $("dict-count").textContent = t("p1.dictionary.count", { count: rows.length });
  if ($("preset-count")) {
    const preset = state.dictRows.filter((row) => row.source === "preset").length;
    $("preset-count").textContent = t("p1.dictionary.preset_count", { count: preset });
  }
}

async function addDictionaryTerm() {
  const name = $("dict-name").value.trim();
  if (!name) return toastKey("p1.dictionary.need_name", null, "error");
  try {
    await store.mergeUserEntities([{ canonical: name, type: $("dict-type").value, aliases: [] }]);
    $("dict-name").value = "";
    await refreshDict();
    await refreshStorageLine();
    toastKey("p1.dictionary.saved", { name }, "ok");
  } catch (error) {
    toastBuild(() => storeErrorText(error, "p1.dictionary.cant_save"), "error", 0);
  }
}

async function refreshStorageLine() {
  if (!store.storeAvailable()) {
    $("storage-line").textContent = t("p1.storage.unavailable");
    return;
  }
  const [entities, jobs] = await Promise.all([store.getUserEntities(), store.listJobs()]);
  $("storage-line").textContent = t("p1.storage.line", { entities: entities.length, jobs: jobs.length });
}

function fillTypeSelects() {
  const types = [...new Set([...ENTITY_TYPES, ...state.customTypesList])];
  for (const id of ["manual-type", "dict-type"]) {
    const select = $(id);
    select.textContent = "";
    for (const type of types) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      select.appendChild(option);
    }
  }
}

// ------------------------------------------------------------------ wiring

// Re-render every piece of state that is already on screen in the newly chosen
// language: the static shell (via i18n.apply), the runtime badge and phase, the
// preload banner, the upload/preview/review panes, generated and restored
// results, history, the job dictionary and the dictionary page. Without this a
// switch only retranslated the shell and left the live panes in the old
// language.
function repaint() {
  state.i18n.apply();
  if (state.statusEvent) onStatus(state.statusEvent, false);
  else $("runtime-badge").textContent = t("p1.runtime.initializing");
  if (state.phase) $("progress-label").textContent = t(`p1.progress.${state.phase}`);
  if (state.preload) paintPreload();
  // Everything on the upload/preview/review/generate panes belongs to one file,
  // so a language switch redraws them from the file that is active right now —
  // the one the user is looking at — and never from another file in the task.
  if (activeFile()) {
    renderTask();
  } else {
    renderTaskFileList();
    renderTaskSummary();
  }
  renderRedactionWarning();
  renderGenerate();
  // The saved / not-saved line is stored as a key, so it must be repainted too:
  // a store failure reported in Chinese would otherwise stay Chinese after the
  // switch while the rest of the pane turns English.
  paintGeneratedSaved();
  renderHistory();
  paintJobDictionaryNote();
  if (state.restored) renderRestore();
  renderDictionary();
  paintToast();
  fillTypeSelects();
}

async function boot() {
  state.i18n = await createI18n();
  state.i18n.apply();
  const init = await store.initStore();
  state.storageOk = !!init.ok;
  state.customTypesList = await store.getUserTokenTypes();
  state.disabledEntities = store.getDisabledEntities();
  fillTypeSelects();
  if (!state.storageOk && init.error) toastKey("p1.storage.unavailable", null, "info");

  for (const tab of document.querySelectorAll(".step")) {
    tab.addEventListener("click", () => showPanel(tab.dataset.panel));
  }
  bindDropzone($("upload-drop"), $("upload-input"), pickFiles, { multiple: true });
  bindDropzone($("restore-drop"), $("restore-input"), (files) => pickRestoreFile(files[0]));
  $("inspect-btn").addEventListener("click", inspectActive);
  $("detect-btn").addEventListener("click", detectTask);
  $("clear-btn").addEventListener("click", clearTask);
  $("manual-add-btn").addEventListener("click", addManualEntity);
  $("open-dictionary-btn").addEventListener("click", () => showPanel("dictionary"));
  $("rescan-btn").addEventListener("click", detectTask);
  $("generate-btn").addEventListener("click", generateTask);
  $("select-all-btn").addEventListener("click", () => {
    // Selection is task-wide, so these act on every file in the batch — ticking
    // them must not leave the other files' matches unselected and silently
    // unredacted.
    for (const entry of state.files) {
      for (const item of entry.detection?.items || []) state.selected.add(item.canonical);
    }
    renderTask();
  });
  $("select-none-btn").addEventListener("click", () => {
    for (const entry of state.files) {
      for (const item of entry.detection?.items || []) state.selected.delete(item.canonical);
    }
    renderTask();
  });
  $("download-btn").addEventListener("click", downloadActiveResult);
  $("goto-restore-btn").addEventListener("click", () => showPanel("reidentify"));
  $("restart-btn").addEventListener("click", () => {
    clearTask();
  });
  $("history-refresh").addEventListener("click", () => loadJobs());
  $("job-dict-load").addEventListener("click", () => loadHistoryDictionary());
  $("history-download").addEventListener("click", downloadActiveResultAgain);
  $("restore-btn").addEventListener("click", restore);
  $("restore-download").addEventListener("click", () => {
    const restored = state.restored;
    if (restored && restored.request === state.restoreRequest &&
        restored.jobId === state.selectedJobId) {
      download(restored.bytes, restored.name);
    }
  });
  $("dict-search").addEventListener("input", renderDictionary);
  $("dict-refresh").addEventListener("click", refreshDict);
  $("dict-add").addEventListener("click", addDictionaryTerm);
  $("redaction-warning-cancel").addEventListener("click", () => closeRedactionWarning(false));
  $("redaction-warning-continue").addEventListener("click", () => closeRedactionWarning(true));
  // Esc must mean "stop", not "continue": cancel the dialog explicitly so the
  // pending run resolves false and no file is written.
  $("redaction-warning").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeRedactionWarning(false);
  });
  $("cancel-btn").addEventListener("click", () => {
    state.bridge.cancel();
    toastKey("p1.cancelled", null, "info");
  });
  $("preload-retry").addEventListener("click", () => {
    preloadRuntime().catch((error) => failPreload(error?.message || String(error)));
  });
  $("runtime-retry").addEventListener("click", () => {
    state.bridge?.restart().catch((error) => {
      toastKey("p1.error.INIT_FAILED", { error: error?.message || error }, "error", 0);
    });
  });
  $("lang-select").addEventListener("change", async (event) => {
    await state.i18n.setLang(event.target.value);
    repaint();
    refreshStorageLine().catch(() => {});
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installEvent = event;
    $("install-btn").hidden = false;
  });
  $("install-btn").addEventListener("click", async () => {
    if (!state.installEvent) return;
    state.installEvent.prompt();
    await state.installEvent.userChoice;
    state.installEvent = null;
    $("install-btn").hidden = true;
  });
  window.addEventListener("appinstalled", () => { $("install-btn").hidden = true; });

  await preloadRuntime().catch((error) => failPreload(error?.message || String(error)));
  try {
    await installPresetDictionary();
  } catch (error) {
    console.warn("Preset dictionary is unavailable:", error);
  }
  await refreshDict();
  await loadJobs();
  refreshStorageLine().catch(() => {});
  state.bridge = createBridge({ workerUrl: "./worker/pyodide_worker.js", onStatus });
  state.bridge.ready.catch((error) => {
    toastKey("p1.error.INIT_FAILED", { error: error?.message || error }, "error", 0);
  });
  window.addEventListener("online", hideToast);
  updateFileButtons();
}

boot().catch((error) =>
  toastBuild(() => storeErrorText(error, "p1.error.INTERNAL"), "error", 0),
);
