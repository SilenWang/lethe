// The P1 app talks to IndexedDB through the v1 client store (loaded as a
// classic script before this module). v3 adds the separate user_entities
// store and a `source` field; everything here degrades gracefully when
// browser storage is unavailable, because processing itself needs no storage.

export function storeAvailable() {
  return typeof window.lethStore === "object" && window.lethStore !== null;
}

export async function initStore() {
  if (!storeAvailable()) {
    return { ok: false, error: "Browser storage is unavailable." };
  }
  try {
    return await window.lethStore.init();
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export async function getUserEntities() {
  if (!storeAvailable()) return [];
  try {
    return await window.lethStore.getEntities();
  } catch {
    return [];
  }
}

export async function getUserTokenTypes() {
  if (!storeAvailable()) return [];
  try {
    return await window.lethStore.getTokenTypes();
  } catch {
    return [];
  }
}

export async function mergeUserEntities(rows) {
  if (!storeAvailable()) throw new Error("Browser storage is unavailable.");
  return window.lethStore.mergeEntities(rows);
}

export async function saveJob(job) {
  if (!storeAvailable()) throw new Error("Browser storage is unavailable.");
  return window.lethStore.saveJob(job);
}

export async function getMapping(jobId, passphrase) {
  if (!storeAvailable()) throw new Error("Browser storage is unavailable.");
  return window.lethStore.getMapping(jobId, passphrase);
}

export async function saveOutput(record) {
  if (!storeAvailable()) throw new Error("Browser storage is unavailable.");
  return window.lethStore.saveOutput(record);
}

export async function downloadOutput(jobId, fileName) {
  if (!storeAvailable()) throw new Error("Browser storage is unavailable.");
  return window.lethStore.downloadOutput(jobId, fileName);
}

export async function outputStats() {
  if (!storeAvailable()) return { count: 0, jobIds: [], limit: 0 };
  try {
    return await window.lethStore.outputStats();
  } catch {
    return { count: 0, jobIds: [], limit: 0 };
  }
}

export async function listJobs() {
  if (!storeAvailable()) return [];
  try {
    return await window.lethStore.listJobs();
  } catch {
    return [];
  }
}

const DISABLED_ENTITIES_KEY = "lethe.disabled-entities.v1";

export function getDisabledEntities() {
  try {
    const rows = JSON.parse(localStorage.getItem(DISABLED_ENTITIES_KEY) || "[]");
    return new Set(Array.isArray(rows) ? rows.map((row) => String(row).toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

export function setEntityDefault(canonical, enabled) {
  const key = String(canonical || "").trim().toLowerCase();
  if (!key) return getDisabledEntities();
  const disabled = getDisabledEntities();
  if (enabled) disabled.delete(key);
  else disabled.add(key);
  try {
    localStorage.setItem(DISABLED_ENTITIES_KEY, JSON.stringify([...disabled].sort()));
  } catch {
    // The switch still applies for this session even when storage is blocked.
  }
  return disabled;
}
