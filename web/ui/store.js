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

export async function listJobs() {
  if (!storeAvailable()) return [];
  try {
    return await window.lethStore.listJobs();
  } catch {
    return [];
  }
}
