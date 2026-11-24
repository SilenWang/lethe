// P1 UI: upload → dictionary detection → review → redact → restore.
//
// All document work happens in the single frozen worker behind the bridge
// (docs/p1/worker-interface.md). This module only owns presentation, the
// review selection (sent to the worker as `options.entities`) and IndexedDB.
import { createBridge } from "../lib/pyodide_bridge.js";
import { createI18n } from "./i18n.js";
import {
  ENTITY_TYPES,
  RECYCLE_BYTES,
  gateLevel,
  humanSize,
  isSupported,
  isXlsx,
  mimeFor,
  errorKey,
  replaceSuffix,
} from "./format.js";
import * as store from "./store.js";

const $ = (id) => document.getElementById(id);
const state = {
  i18n: null,
  bridge: null,
  runtime: "initializing",
  busy: false,
  file: null,
  fileLevel: "ok",
  detection: null, // {items, bytes, hits, tokens, counts}
  selected: new Set(),
  types: new Map(),
  dictByKey: new Map(),
  generated: null,
  restoreFile: null,
  restored: null,
  jobs: [],
  storageOk: false,
  installEvent: null,
};

const t = (key, vars) => state.i18n.t(key, vars);

// ---------------------------------------------------------------- chrome

function toast(message, kind = "info", ms = 7000) {
  const el = $("toast");
  // Never let a background notice (offline ready, rebuild hint) cover an
  // error the user needs to read.
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
  if (name === "restore") loadJobs().catch(() => {});
}

function unlock(panel) {
  const tab = document.querySelector(`.step[data-panel="${panel}"]`);
  if (tab) tab.disabled = false;
}

function setRunning(running) {
  state.busy = running;
  $("progress").hidden = !running;
  $("cancel-btn").hidden = !running;
  for (const id of ["inspect-btn", "detect-btn", "rescan-btn", "generate-btn", "restore-btn"]) {
    const btn = $(id);
    if (btn) btn.disabled = running;
  }
  if (running) {
    $("progress-bar").removeAttribute("value");
  } else {
    $("cancel-btn").hidden = true;
  }
}

function setPhase(phase) {
  if (!phase) return;
  $("progress-label").textContent = t(`p1.progress.${phase}`);
}

function onStatus(event) {
  state.runtime = event.state;
  const badge = $("runtime-badge");
  badge.className = "badge";
  const retry = $("runtime-retry");
  if (retry) retry.hidden = event.state !== "failed";
  if (event.state === "ready") {
    badge.classList.add("badge-ok");
    badge.textContent = t("p1.runtime.ready");
  } else if (event.state === "initializing") {
    badge.classList.add("badge-wait");
    const initKeys = {
      pyodide: "p1.init.pyodide",
      "python-src": "p1.init.python_src",
      "betteroffice-docx": "p1.init.docx",
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
}

// ---------------------------------------------------------- eager preload

function preloadText(key, vars = {}) {
  return t(key, vars);
}

function showPreload(done, total, path = "") {
  const panel = $("preload-panel");
  const bar = $("preload-bar");
  const text = $("preload-text");
  const retry = $("preload-retry");
  if (!panel || !bar || !text) return;
  panel.hidden = false;
  if (retry) retry.hidden = true;
  bar.max = Math.max(total || 1, 1);
  bar.value = done || 0;
  text.textContent = path
    ? preloadText("p1.preload.progress", { done: done || 0, total: total || 0 })
    : preloadText("p1.preload.starting");
}

function failPreload(message) {
  const panel = $("preload-panel");
  const text = $("preload-text");
  const retry = $("preload-retry");
  if (panel) panel.hidden = false;
  if (text) text.textContent = preloadText("p1.preload.failed", { error: message });
  if (retry) retry.hidden = false;
}

async function preloadRuntime() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.register("./sw.js", {
    type: "module",
  });
  await navigator.serviceWorker.ready;
  if (!navigator.onLine) return;
  const active = registration.active || registration.waiting || registration.installing;
  if (!active) throw new Error("service worker has no active worker");
  showPreload(0, 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        failPreload(error.message || String(error));
        reject(error);
      } else {
        const panel = $("preload-panel");
        const text = $("preload-text");
        if (text) text.textContent = preloadText("p1.preload.done");
        setTimeout(() => { if (panel) panel.hidden = true; }, 1500);
        toast(t("p1.offline.ready"), "ok", 5000);
        resolve();
      }
    };
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type === "precache-progress") {
        showPreload(data.done, data.total, data.path);
      } else if (data.type === "precache-done") {
        finish();
      } else if (data.type === "precache-error") {
        finish(new Error(data.message || "precache failed"));
      }
    };
    const timer = setTimeout(
      () => finish(new Error("runtime preload timed out")),
      10 * 60 * 1000,
    );
    navigator.serviceWorker.addEventListener("message", onMessage);
    active.postMessage({ type: "PRECACHE" });
  });
}

// ------------------------------------------------------------- worker runs

async function fileBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

async function runOp({ op, file, options = {} }) {
  if (state.busy) throw Object.assign(new Error("busy"), { code: "BUSY" });
  setRunning(true);
  setPhase("init");
  try {
    const bytes = await fileBytes(file);
    const result = await state.bridge.run({
      op,
      bytes,
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
    return result;
  } finally {
    setRunning(false);
    $("progress-bar").removeAttribute("value");
  }
}

function reportError(error) {
  const code = error?.code || "INTERNAL";
  const key = errorKey(code);
  const vars = { error: error?.message || "" };
  const parts = [t(key, vars)];
  const findings = error?.detail?.findings;
  if (Array.isArray(findings) && findings.length) parts.push(...findings);
  if (code === "TOO_LARGE") {
    parts.push(t("gate.tip.split"), t("gate.tip.convert"), t("gate.tip.machine"));
  }
  toast(parts.join(" · "), code === "CANCELLED" ? "info" : "error", 0);
}

// ------------------------------------------------------------ upload panel

function pickFile(file) {
  if (!isSupported(file)) {
    toast(t("p1.upload.wrong_type"), "error");
    return;
  }
  const gate = gateLevel(file.size);
  if (gate.level === "reject") {
    clearFile();
    toast(`${t("gate.file_reject", { size_mb: gate.size, max_mb: 50 })}`, "error", 0);
    return;
  }
  state.file = file;
  state.detection = null;
  state.generated = null;
  state.fileLevel = gate.level;
  state.selected = new Set();
  $("upload-file").hidden = false;
  $("upload-file").textContent = t("p1.upload.selected", { name: file.name, size: humanSize(file.size) });
  const note = $("upload-note");
  const degradations = $("upload-degradations");
  if (degradations) degradations.hidden = !isXlsx(file);
  if (gate.level === "warn") {
    note.hidden = false;
    note.textContent = t("gate.file_warn", { size_mb: gate.size, warn_mb: 35 }) +
      " " + t("p1.upload.large_note");
  } else {
    note.hidden = true;
  }
  $("upload-inspect").hidden = true;
  $("inspect-btn").disabled = false;
  $("detect-btn").disabled = false;
  $("clear-btn").disabled = false;
}

function clearFile() {
  state.file = null;
  state.detection = null;
  state.generated = null;
  $("upload-file").hidden = true;
  $("upload-note").hidden = true;
  if ($("upload-degradations")) $("upload-degradations").hidden = true;
  $("upload-inspect").hidden = true;
  $("inspect-btn").disabled = true;
  $("detect-btn").disabled = true;
  $("clear-btn").disabled = true;
  $("upload-input").value = "";
}

function bindDropzone(zone, input, onFile) {
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
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

async function inspectFile() {
  if (!state.file) return toast(t("p1.upload.need_file"), "error");
  try {
    const result = await runOp({ op: "inspect", file: state.file });
    $("upload-inspect").hidden = false;
    const partsKey = isXlsx(state.file) ? "p1.upload.parts_xlsx" : "p1.upload.parts";
    $("upload-inspect").textContent =
      `${t("p1.upload.checked")} ` +
      t(partsKey, { parts: result.parts, paragraphs: result.paragraphs });
  } catch (error) {
    reportError(error);
  }
}

function entitiesForDetection() {
  const rows = [...state.dictByKey.values()];
  return rows.map((row) => ({ canonical: row.canonical, type: row.type, aliases: row.aliases || [] }));
}

async function detect() {
  if (!state.file) return toast(t("p1.upload.need_file"), "error");
  try {
    await runOp({ op: "inspect", file: state.file });
    const result = await runOp({
      op: "redact",
      file: state.file,
      options: { entities: entitiesForDetection() },
    });
    state.detection = {
      items: result.items || [],
      bytes: result.bytes || null,
      hits: result.hits || 0,
      tokens: result.tokens || [],
      counts: result.counts || {},
    };
    state.selected = new Set(state.detection.items.map((item) => item.canonical));
    state.types = new Map(state.detection.items.map((item) => [item.canonical, item.type]));
    renderReview();
    unlock("review");
    showPanel("review");
  } catch (error) {
    reportError(error);
  }
}

// ------------------------------------------------------------ review panel

function renderReview() {
  const rows = $("review-rows");
  rows.textContent = "";
  const items = state.detection?.items || [];
  $("review-empty").hidden = items.length > 0;
  for (const item of items) {
    const tr = document.createElement("tr");
    const cellCheck = document.createElement("td");
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
    cellCheck.appendChild(check);
    tr.appendChild(cellCheck);

    const cellValue = document.createElement("td");
    cellValue.className = "cell-value";
    cellValue.textContent = item.canonical;
    tr.appendChild(cellValue);

    const cellType = document.createElement("td");
    const select = document.createElement("select");
    select.className = "row-type";
    for (const type of [...ENTITY_TYPES, ...state.customTypesList]) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      select.appendChild(option);
    }
    select.value = state.types.get(item.canonical) || item.type;
    select.addEventListener("change", () => state.types.set(item.canonical, select.value));
    cellType.appendChild(select);
    tr.appendChild(cellType);

    const cellSource = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `src src-${item.source}`;
    badge.textContent = t(`p1.source.${item.source}`);
    cellSource.appendChild(badge);
    tr.appendChild(cellSource);

    const cellCount = document.createElement("td");
    cellCount.textContent = String(item.count);
    tr.appendChild(cellCount);

    const cellToken = document.createElement("td");
    cellToken.className = "cell-token";
    cellToken.textContent = item.token || "—";
    tr.appendChild(cellToken);
    rows.appendChild(tr);
  }
  renderReviewCount();
}

function renderReviewCount() {
  const total = state.detection?.items?.length || 0;
  $("review-count").textContent = t("p1.review.selected", { count: state.selected.size, total });
}

// ---------------------------------------------------------- generate panel

async function generate() {
  const all = state.detection?.items || [];
  const chosen = all.filter((item) => state.selected.has(item.canonical));
  if (!chosen.length) return toast(t("p1.review.none_selected"), "error");
  const typeChanged = all.some((item) => state.types.get(item.canonical) !== item.type);
  const entities = chosen.map((item) => {
    const known = state.dictByKey.get(item.canonical.toLowerCase());
    return {
      canonical: item.canonical,
      type: state.types.get(item.canonical) || item.type,
      aliases: known?.aliases || [],
    };
  });
  try {
    let result;
    if (!typeChanged && chosen.length === all.length && state.detection.bytes) {
      result = state.detection;
    } else {
      result = await runOp({ op: "redact", file: state.file, options: { entities } });
    }
    const items = result.items || [];
    const mapping = {};
    for (const item of items) {
      if (item.token) mapping[item.token] = item.canonical;
    }
    const jobId = `job-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-` +
      Math.random().toString(36).slice(2, 6);
    state.generated = {
      bytes: result.bytes,
      hits: result.hits || 0,
      tokens: items.filter((item) => item.token).length,
      jobId,
      checked: new Set(chosen.map((item) => item.canonical)),
    };
    renderGenerate();
    unlock("generate");
    showPanel("generate");
    await persistJob(jobId, mapping);
  } catch (error) {
    reportError(error);
  }
}

async function persistJob(jobId, mapping) {
  const node = $("generate-saved");
  try {
    await store.saveJob({
      jobId,
      mapping,
      sourceFiles: [state.file?.name || "document.docx"],
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
  const names = [...out.checked].filter((name) => {
    const item = state.detection?.items?.find((row) => row.canonical === name);
    return item && item.source !== "pattern";
  });
  $("generate-dict-label").hidden = names.length === 0;
  $("generate-dict").checked = false;
  $("generate-dict-text").textContent = t("p1.generate.add_dict", { count: names.length });
  if (out.bytes?.byteLength > RECYCLE_BYTES) {
    toast(t("p1.upload.large_note"), "info", 0);
  }
}

function download(bytes, name) {
  const blob = new Blob([bytes], {
    type: mimeFor(name),
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ----------------------------------------------------------- restore panel

async function loadJobs() {
  state.jobs = await store.listJobs();
  const select = $("restore-job");
  const previous = select.value;
  select.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "—";
  select.appendChild(placeholder);
  for (const job of state.jobs) {
    const option = document.createElement("option");
    option.value = job.jobId;
    const files = (job.sourceFiles || []).join(", ");
    option.textContent = `${job.jobId}${files ? ` · ${files}` : ""}`;
    select.appendChild(option);
  }
  // A refresh (e.g. the second loadJobs when the restore panel opens) must not
  // silently drop the job the user already picked.
  if (previous && state.jobs.some((job) => job.jobId === previous)) {
    select.value = previous;
  }
  $("restore-no-jobs").hidden = state.jobs.length > 0;
  $("restore-btn").disabled = !select.value || !state.restoreFile;
  refreshStorageLine();
}

function pickRestoreFile(file) {
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
  $("restore-btn").disabled = !$("restore-job").value;
}

async function restore() {
  const jobId = $("restore-job").value;
  if (!jobId) return toast(t("p1.restore.need_job"), "error");
  if (!state.restoreFile) return toast(t("p1.restore.need_file"), "error");
  try {
    const tokenMap = await store.getMapping(jobId, $("restore-passphrase").value);
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

// ---------------------------------------------------------------- storage

async function refreshDict() {
  const rows = await store.getUserEntities();
  state.dictByKey = new Map(rows.map((row) => [String(row.canonical).toLowerCase(), row]));
}

async function refreshStorageLine() {
  const line = $("storage-line");
  if (!store.storeAvailable()) {
    line.textContent = t("p1.storage.unavailable");
    return;
  }
  const entities = await store.getUserEntities();
  const jobs = await store.listJobs();
  line.textContent = t("p1.storage.line", { entities: entities.length, jobs: jobs.length });
}

// ------------------------------------------------------------------ wiring

async function boot() {
  state.i18n = await createI18n();
  state.i18n.apply();
  state.customTypesList = await store.getUserTokenTypes();
  const init = await store.initStore();
  state.storageOk = !!init.ok;
  if (!state.storageOk && init.error) toast(t("p1.storage.unavailable"), "info");
  await refreshDict();
  refreshStorageLine().catch(() => {});

  bindDropzone($("upload-drop"), $("upload-input"), pickFile);
  bindDropzone($("restore-drop"), $("restore-input"), pickRestoreFile);
  $("inspect-btn").addEventListener("click", inspectFile);
  $("detect-btn").addEventListener("click", detect);
  $("clear-btn").addEventListener("click", clearFile);
  $("preload-retry").addEventListener("click", () => {
    preloadRuntime().catch((error) => failPreload(error?.message || String(error)));
  });
  $("runtime-retry").addEventListener("click", () => {
    if (!state.bridge) return;
    state.bridge.restart().catch((error) => {
      toast(t("p1.error.INIT_FAILED", { error: error?.message || error }), "error", 0);
    });
  });
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
    if (!state.generated) return;
    download(state.generated.bytes, replaceSuffix(state.file?.name, "-redacted"));
  });
  $("goto-restore-btn").addEventListener("click", () => showPanel("restore"));
  $("restart-btn").addEventListener("click", () => {
    clearFile();
    state.selected = new Set();
    state.types = new Map();
    showPanel("upload");
  });
  $("restore-job").addEventListener("change", () => {
    $("restore-btn").disabled = !$("restore-job").value || !state.restoreFile;
  });
  $("restore-btn").addEventListener("click", restore);
  $("restore-download").addEventListener("click", () => {
    if (state.restored) download(state.restored.bytes, state.restored.name);
  });
  $("cancel-btn").addEventListener("click", () => {
    state.bridge.cancel();
    toast(t("p1.cancelled"), "info");
  });
  $("generate-dict").addEventListener("change", async (event) => {
    if (!event.target.checked) return;
    const rows = [...(state.generated?.checked || [])]
      .map((name) => state.detection?.items?.find((item) => item.canonical === name))
      .filter((item) => item && item.source !== "pattern")
      .map((item) => ({ canonical: item.canonical, type: state.types.get(item.canonical) || item.type, aliases: [] }));
    try {
      const added = await store.mergeUserEntities(rows);
      await refreshDict();
      await refreshStorageLine();
      toast(t("p1.generate.added", { count: added }), "ok");
    } catch (error) {
      toast(String(error?.message || error), "error", 0);
    }
  });
  $("lang-select").addEventListener("change", async (event) => {
    await state.i18n.setLang(event.target.value);
    onStatus({ state: state.runtime });
    renderReview();
    renderGenerate();
    refreshStorageLine().catch(() => {});
    if (state.restored) {
      $("restore-summary").textContent = t("p1.restore.ready", { count: state.restored.hits });
    }
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
  state.bridge = createBridge({
    workerUrl: "./worker/pyodide_worker.js",
    onStatus,
  });
  state.bridge.ready.catch((error) => {
    toast(t("p1.error.INIT_FAILED", { error: error?.message || error }), "error", 0);
  });

  window.addEventListener("online", hideToast);
}

boot().catch((error) => {
  toast(String(error?.message || error), "error", 0);
});
