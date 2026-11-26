// Three independent PWA pages: de-identify, re-identify and entity dictionary.
// Document work stays in the frozen worker; this module owns presentation and
// the browser-only history/dictionary layer.
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

const $ = (id) => document.getElementById(id);
const state = {
  i18n: null,
  bridge: null,
  runtime: "initializing",
  busy: false,
  file: null,
  inspection: null,
  detection: null,
  selected: new Set(),
  types: new Map(),
  manualEntities: [],
  customTypesList: [],
  dictRows: [],
  dictByKey: new Map(),
  disabledEntities: new Set(),
  generated: null,
  restoreFile: null,
  restored: null,
  jobs: [],
  selectedJobId: "",
  jobMapping: null,
  jobDictRequest: 0,
  storageOk: false,
  installEvent: null,
  dictionary: null,
};

const t = (key, vars) => state.i18n.t(key, vars);

// ---------------------------------------------------------------- chrome

function toast(message, kind = "info", ms = 7000) {
  const el = $("toast");
  if (kind !== "error" && !el.hidden && el.classList.contains("toast-error")) return;
  el.textContent = message;
  el.className = `toast toast-${kind}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  if (ms) toast.timer = setTimeout(() => { el.hidden = true; }, ms);
}

function hideToast() {
  $("toast").hidden = true;
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
  if (phase) $("progress-label").textContent = t(`p1.progress.${phase}`);
}

function onStatus(event) {
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
    if (event.reason && event.reason !== "init") {
      toast(t("p1.runtime.rebuilding"), "info", 0);
    }
  } else {
    badge.classList.add("badge-bad");
    badge.textContent = t("p1.runtime.failed");
    if (event.reason) toast(t("p1.error.INIT_FAILED", { error: event.reason }), "error", 0);
  }
  updateFileButtons();
}

// ---------------------------------------------------------- eager preload

function showPreload(done, total) {
  const panel = $("preload-panel");
  const bar = $("preload-bar");
  const text = $("preload-text");
  if (!panel || !bar || !text) return;
  panel.hidden = false;
  $("preload-retry").hidden = true;
  bar.max = Math.max(total || 1, 1);
  bar.value = done || 0;
  text.textContent = total
    ? t("p1.preload.progress", { done: done || 0, total })
    : t("p1.preload.starting");
}

function failPreload(message) {
  $("preload-panel").hidden = false;
  $("preload-text").textContent = t("p1.preload.failed", { error: message });
  $("preload-retry").hidden = false;
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
      $("preload-text").textContent = t("p1.preload.done");
      setTimeout(() => { $("preload-panel").hidden = true; }, 1500);
      toast(t("p1.offline.ready"), "ok", 5000);
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
  const parts = [t(errorKey(code), { error: error?.message || "" })];
  parts.push(...gateFindings(error?.detail));
  if (code === "TOO_LARGE") {
    parts.push(t("gate.tip.split"), t("gate.tip.convert"), t("gate.tip.machine"));
  }
  toast(parts.join(" · "), code === "CANCELLED" ? "info" : "error", 0);
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
  const hasFile = !!state.file;
  const ready = !!state.bridge && state.runtime === "ready" && !state.busy;
  $("inspect-btn").disabled = !hasFile || !ready;
  $("detect-btn").disabled = !hasFile || !ready;
  $("clear-btn").disabled = !hasFile;
  $("manual-add-btn").disabled = !hasFile || !ready;
}

function pickFile(file) {
  if (state.busy) {
    $("upload-input").value = "";
    return toast(t("p1.error.BUSY"), "info");
  }
  if (!isSupported(file)) return toast(t("p1.upload.wrong_type"), "error");
  const gate = gateLevel(file.size);
  if (gate.level === "reject") {
    clearFile();
    return toast(t("gate.file_reject", { size_mb: gate.size, max_mb: 50 }), "error", 0);
  }
  Object.assign(state, {
    file,
    inspection: null,
    detection: null,
    generated: null,
    selected: new Set(),
    types: new Map(),
    manualEntities: [],
  });
  showWarnings([]);
  $("upload-file").hidden = false;
  $("upload-file").textContent = t("p1.upload.selected", { name: file.name, size: humanSize(file.size) });
  $("upload-note").hidden = gate.level !== "warn";
  if (gate.level === "warn") {
    $("upload-note").textContent = t("gate.file_warn", { size_mb: gate.size, warn_mb: 35 }) +
      " " + t("p1.upload.large_note");
  }
  $("upload-inspect").hidden = true;
  $("preview-card").hidden = true;
  $("review-card").hidden = true;
  $("generate-card").hidden = true;
  renderDegradations(file);
  updateFileButtons();
}

function clearFile() {
  if (state.busy) return;
  Object.assign(state, {
    file: null,
    inspection: null,
    detection: null,
    generated: null,
    manualEntities: [],
  });
  $("upload-file").hidden = true;
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
  updateFileButtons();
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

function bindDropzone(zone, input, onFile) {
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
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  });
}

function showInspection(result, file) {
  const partsKey = isXlsx(file)
    ? "p1.upload.parts_xlsx"
    : isPptx(file)
      ? "p1.upload.parts_pptx"
      : "p1.upload.parts";
  $("upload-inspect").hidden = false;
  $("upload-inspect").textContent = `${t("p1.upload.checked")} ` +
    t(partsKey, { parts: result.parts, paragraphs: result.paragraphs || 0 });
}

async function inspectFile() {
  const sourceFile = state.file;
  if (!sourceFile) return toast(t("p1.upload.need_file"), "error");
  try {
    const inspection = await runOp({ op: "inspect", file: sourceFile });
    if (sourceFile !== state.file) return;
    state.inspection = inspection;
    showInspection(inspection, sourceFile);
    renderPreview(inspection.previewText || "", []);
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

function renderPreview(text, items) {
  const card = $("preview-card");
  const output = $("document-preview");
  if (!text) {
    card.hidden = false;
    output.textContent = t("p1.preview.empty");
    $("preview-note").textContent = "";
    return;
  }
  card.hidden = false;
  const surfaces = [];
  for (const item of items) {
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
  $("preview-note").textContent = state.detection?.previewTruncated || state.inspection?.previewTruncated
    ? t("p1.preview.note")
    : "";
}

async function detect() {
  const sourceFile = state.file;
  if (!sourceFile) return toast(t("p1.upload.need_file"), "error");
  try {
    await runBusy(async () => {
      const inspection = await runWorker({ op: "inspect", file: sourceFile });
      showInspection(inspection, sourceFile);
      const result = await runWorker({
        op: "redact",
        file: sourceFile,
        options: { entities: entitiesForDetection() },
      });
      if (sourceFile !== state.file) return;
      const manual = new Set(state.manualEntities.map((row) => row.canonical.toLowerCase()));
      const items = (result.items || []).map((item) =>
        manual.has(item.canonical.toLowerCase()) ? { ...item, source: "manual" } : item);
      state.detection = {
        file: sourceFile,
        items,
        bytes: result.bytes || null,
        hits: result.hits || 0,
        warnings: result.warnings || [],
        previewText: inspection.previewText || "",
        previewTruncated: !!inspection.previewTruncated,
      };
      state.selected = new Set(items.map((item) => item.canonical));
      state.types = new Map(items.map((item) => [item.canonical, item.type]));
      showWarnings(result.warnings || []);
      state.inspection = inspection;
      renderPreview(state.detection.previewText, items);
      renderReview();
      $("review-card").hidden = false;
      toast(t("p1.review.selected", { count: state.selected.size, total: items.length }), "info", 3000);
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
  detect().catch(reportError);
}

function renderReview() {
  const rows = $("review-rows");
  rows.textContent = "";
  const items = state.detection?.items || [];
  $("review-empty").hidden = items.length > 0;
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
      renderReviewCount();
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
    type.addEventListener("change", () => state.types.set(item.canonical, type.value));
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
  const total = state.detection?.items?.length || 0;
  $("review-count").textContent = t("p1.review.selected", { count: state.selected.size, total });
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

async function generate() {
  const detection = state.detection;
  const sourceFile = detection?.file;
  const all = state.detection?.items || [];
  if (!sourceFile) return toast(t("p1.upload.need_file"), "error");
  const chosen = all.filter((item) => state.selected.has(item.canonical));
  if (!chosen.length) return toast(t("p1.review.none_selected"), "error");
  const typeChanged = all.some((item) => state.types.get(item.canonical) !== item.type);
  const entities = chosen.map((item) => ({
    canonical: item.canonical,
    type: state.types.get(item.canonical) || item.type,
    aliases: state.dictByKey.get(item.canonical.toLowerCase())?.aliases || [],
  }));
  try {
    let result;
    if (!typeChanged && chosen.length === all.length && state.detection.bytes) {
      result = state.detection;
    } else {
      result = await runOp({ op: "redact", file: sourceFile, options: { entities } });
    }
    const items = result.items || [];
    const mapping = {};
    for (const item of items) if (item.token) mapping[item.token] = item.canonical;
    const jobId = `job-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-` +
      Math.random().toString(36).slice(2, 6);
    state.generated = {
      bytes: result.bytes,
      hits: result.hits || 0,
      tokens: items.filter((item) => item.token).length,
      jobId,
      name: replaceSuffix(sourceFile.name, "-redacted"),
      checked: new Set(chosen.map((item) => item.canonical)),
    };
    renderGenerate();
    $("generate-card").hidden = false;
    await persistJob(jobId, mapping, sourceFile);
    if ($("save-names").checked) await saveSelectedNames(chosen);
    $("generate-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    reportError(error);
  }
}

async function persistJob(jobId, mapping, sourceFile) {
  const node = $("generate-saved");
  try {
    await store.saveJob({
      jobId,
      createdAt: new Date().toISOString(),
      mapping,
      sourceFiles: [sourceFile.name],
      replacements: state.generated?.hits || 0,
      passphrase: "",
    });
    state.storageOk = true;
    node.textContent = t("p1.generate.saved");
    await loadJobs();
  } catch (error) {
    node.textContent = t("p1.generate.unsaved", { error: error?.message || error });
  }
}

function renderGenerate() {
  const out = state.generated;
  if (!out) return;
  $("generate-summary").textContent = t("p1.generate.ready", {
    count: out.hits,
    tokens: out.tokens,
  });
  $("generate-job").textContent = `${t("p1.generate.job")}: ${out.jobId}`;
  if (out.bytes?.byteLength > RECYCLE_BYTES) toast(t("p1.upload.large_note"), "info", 0);
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

// --------------------------------------------------------- re-identify page

async function loadJobs() {
  state.jobs = await store.listJobs();
  if (state.selectedJobId && !state.jobs.some((job) => job.jobId === state.selectedJobId)) {
    state.jobDictRequest += 1;
    state.selectedJobId = "";
    state.jobMapping = null;
  }
  renderHistory();
  $("restore-no-jobs").hidden = state.jobs.length > 0;
  refreshStorageLine();
}

function renderHistory() {
  const body = $("history-rows");
  body.textContent = "";
  for (const job of state.jobs) {
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
    for (const value of [
      (job.createdAt || "").replace("T", " ").slice(0, 16) || "—",
      (job.sourceFiles || []).join(", ") || "—",
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
}

function renderSelectedJob() {
  $("selected-job").textContent = state.selectedJobId
    ? t("p1.history.selected", { job: state.selectedJobId })
    : t("p1.history.none");
}

async function selectJob(job) {
  state.jobDictRequest += 1;
  state.selectedJobId = job.jobId;
  state.jobMapping = null;
  $("job-dict-rows").textContent = "";
  renderHistory();
  if (job.passphraseProtected && !$("restore-passphrase").value) {
    showJobDictionaryNote(t("p1.history.passphrase_required"));
    return;
  }
  await loadHistoryDictionary(job.jobId);
}

function showJobDictionaryNote(message) {
  const note = $("job-dict-note");
  note.hidden = !message;
  note.textContent = message || "";
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
    showJobDictionaryNote(entries.length ? "" : t("p1.history.no_dictionary"));
  } catch (error) {
    if (request !== state.jobDictRequest || jobId !== state.selectedJobId) return;
    state.jobMapping = null;
    $("job-dict-rows").textContent = "";
    showJobDictionaryNote(String(error?.message || error));
  }
}

function updateRestoreButton() {
  const button = $("restore-btn");
  if (button) button.disabled = state.busy || !state.selectedJobId || !state.restoreFile;
}

function pickRestoreFile(file) {
  if (state.busy) {
    $("restore-input").value = "";
    return toast(t("p1.error.BUSY"), "info");
  }
  if (!isSupported(file)) return toast(t("p1.upload.wrong_type"), "error");
  const gate = gateLevel(file.size);
  if (gate.level === "reject") {
    return toast(t("gate.file_reject", { size_mb: gate.size, max_mb: 50 }), "error", 0);
  }
  state.restoreFile = file;
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
  if (!state.selectedJobId) return toast(t("p1.restore.need_job"), "error");
  if (!state.restoreFile) return toast(t("p1.restore.need_file"), "error");
  try {
    const tokenMap = await store.getMapping(state.selectedJobId, $("restore-passphrase").value);
    const result = await runOp({
      op: "restore",
      file: state.restoreFile,
      options: { token_map: tokenMap },
    });
    state.restored = {
      bytes: result.bytes,
      hits: result.hits || 0,
      name: replaceSuffix(state.restoreFile.name, "-restored"),
    };
    $("restore-summary").textContent = t("p1.restore.ready", { count: state.restored.hits });
    $("restore-result").hidden = false;
  } catch (error) {
    if (error?.code) reportError(error);
    else toast(String(error?.message || error), "error", 0);
  }
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
}

async function addDictionaryTerm() {
  const name = $("dict-name").value.trim();
  if (!name) return toast(t("p1.dictionary.need_name"), "error");
  try {
    await store.mergeUserEntities([{ canonical: name, type: $("dict-type").value, aliases: [] }]);
    $("dict-name").value = "";
    await refreshDict();
    await refreshStorageLine();
    toast(t("p1.dictionary.saved", { name }), "ok");
  } catch (error) {
    toast(String(error?.message || error), "error", 0);
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

async function boot() {
  state.i18n = await createI18n();
  state.i18n.apply();
  const init = await store.initStore();
  state.storageOk = !!init.ok;
  state.customTypesList = await store.getUserTokenTypes();
  state.disabledEntities = store.getDisabledEntities();
  fillTypeSelects();
  if (!state.storageOk && init.error) toast(t("p1.storage.unavailable"), "info");

  for (const tab of document.querySelectorAll(".step")) {
    tab.addEventListener("click", () => showPanel(tab.dataset.panel));
  }
  bindDropzone($("upload-drop"), $("upload-input"), pickFile);
  bindDropzone($("restore-drop"), $("restore-input"), pickRestoreFile);
  $("inspect-btn").addEventListener("click", inspectFile);
  $("detect-btn").addEventListener("click", detect);
  $("clear-btn").addEventListener("click", clearFile);
  $("manual-add-btn").addEventListener("click", addManualEntity);
  $("rescan-btn").addEventListener("click", detect);
  $("generate-btn").addEventListener("click", generate);
  $("select-all-btn").addEventListener("click", () => {
    state.selected = new Set((state.detection?.items || []).map((item) => item.canonical));
    renderReview();
  });
  $("select-none-btn").addEventListener("click", () => {
    state.selected = new Set();
    renderReview();
  });
  $("download-btn").addEventListener("click", () => {
    if (state.generated) download(state.generated.bytes, state.generated.name);
  });
  $("goto-restore-btn").addEventListener("click", () => showPanel("reidentify"));
  $("restart-btn").addEventListener("click", () => {
    clearFile();
    state.selected = new Set();
    state.types = new Map();
  });
  $("history-refresh").addEventListener("click", () => loadJobs());
  $("job-dict-load").addEventListener("click", () => loadHistoryDictionary());
  $("restore-btn").addEventListener("click", restore);
  $("restore-download").addEventListener("click", () => {
    if (state.restored) download(state.restored.bytes, state.restored.name);
  });
  $("dict-search").addEventListener("input", renderDictionary);
  $("dict-refresh").addEventListener("click", refreshDict);
  $("dict-add").addEventListener("click", addDictionaryTerm);
  $("cancel-btn").addEventListener("click", () => {
    state.bridge.cancel();
    toast(t("p1.cancelled"), "info");
  });
  $("preload-retry").addEventListener("click", () => {
    preloadRuntime().catch((error) => failPreload(error?.message || String(error)));
  });
  $("runtime-retry").addEventListener("click", () => {
    state.bridge?.restart().catch((error) => {
      toast(t("p1.error.INIT_FAILED", { error: error?.message || error }), "error", 0);
    });
  });
  $("lang-select").addEventListener("change", async (event) => {
    await state.i18n.setLang(event.target.value);
    onStatus({ state: state.runtime });
    if (state.file) renderDegradations(state.file);
    if (state.detection) {
      showWarnings(state.detection.warnings);
      renderPreview(state.detection.previewText, state.detection.items);
    }
    renderReview();
    renderGenerate();
    renderHistory();
    renderDictionary();
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
    toast(t("p1.error.INIT_FAILED", { error: error?.message || error }), "error", 0);
  });
  window.addEventListener("online", hideToast);
  updateFileButtons();
}

boot().catch((error) => toast(String(error?.message || error), "error", 0));
