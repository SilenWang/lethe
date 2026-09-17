/*
 * Lethe — browser-side user-data store.
 *
 * This is the single source of truth for everything the user owns: the entity
 * dictionary, custom token types, conversion history and the token -> real
 * value mappings. Nothing here is ever sent to the server for keeping; the
 * server only computes (see the client-side storage architecture doc).
 *
 * Backing stores (IndexedDB database "lethe", schema version 2):
 *   entities     keyPath "key"     { key, canonical, type, aliases, updatedAt }
 *   token_types  keyPath "id"      { id: "token_types", types: [...], updatedAt }
 *   jobs         keyPath "jobId"   metadata + (encrypted) token -> real mapping
 *   outputs      keyPath "jobId"   the de-identified result file(s), as binary
 *   meta         keyPath "key"     { key, value }
 *
 * Sensitive mappings are encrypted in the browser with WebCrypto
 * (PBKDF2-SHA-256, 480k iterations -> AES-GCM-256) unless the user chose a
 * blank passphrase, in which case the mapping is stored unprotected — the same
 * semantics the old server-side vault had for blank passphrases.
 */
(function () {
  'use strict';

  var DB_NAME = 'lethe';
  // version 2 adds the "outputs" store (result files); the upgrade is purely
  // additive, so entities / token_types / jobs / meta are untouched.
  var DB_VERSION = 2;
  var SCHEMA_VERSION = 2;
  var SCHEMA_VERSION_KEY = 'lethe.schema.v2';
  var SCHEMA_VERSION_KEY_V1 = 'lethe.schema.v1';
  var INSTALLED_AT_KEY = 'lethe.installed.v1';
  var PERSIST_KEY = 'lethe.persisted.v1';
  var OUTPUT_RETENTION_KEY = 'lethe.outputs.retention.v1';
  var CHANNEL_NAME = 'lethe';

  // How many result files to keep, newest first. The oldest are dropped (and
  // their bytes deleted) once the cap is exceeded; the UI shows this number.
  var OUTPUT_RETENTION_DEFAULT = 20;

  var _dbPromise = null;
  var _channel = null;

  // ---- tiny helpers --------------------------------------------------------

  function nowIso() { return new Date().toISOString(); }

  function normKey(canonical) {
    return String(canonical == null ? '' : canonical).trim().toLowerCase();
  }

  function b64Encode(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(out);
  }

  function b64Decode(text) {
    var bin = atob(text);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function b64ToBlob(text, type) {
    return new Blob([b64Decode(text)], { type: type || 'application/octet-stream' });
  }

  function broadcast(reason) {
    try {
      if (_channel) _channel.postMessage({ type: 'changed', reason: reason, at: nowIso() });
    } catch (e) { /* channel closed — ignore */ }
  }

  function announce(reason) {
    broadcast(reason);
    // Let the NiceGUI side refresh its tables when this tab changes the data.
    try {
      if (typeof window.emitEvent === 'function') {
        window.emitEvent('leth-data-changed', { reason: reason });
      }
    } catch (e) { /* not connected yet — ignore */ }
  }

  // ---- IndexedDB plumbing --------------------------------------------------

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('This browser does not support IndexedDB.'));
        return;
      }
      var req;
      try {
        req = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains('entities')) {
          var ents = db.createObjectStore('entities', { keyPath: 'key' });
          ents.createIndex('by_type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('token_types')) {
          db.createObjectStore('token_types', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('jobs')) {
          var jobs = db.createObjectStore('jobs', { keyPath: 'jobId' });
          jobs.createIndex('by_createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('outputs')) {
          var outs = db.createObjectStore('outputs', { keyPath: 'jobId' });
          outs.createIndex('by_createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Could not open browser storage.')); };
      req.onblocked = function () { reject(new Error('Browser storage is blocked by another tab.')); };
    });
    return _dbPromise;
  }

  function run(storeName, mode, work) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, mode);
        var store = tx.objectStore(storeName);
        var result;
        try {
          result = work(store);
        } catch (e) {
          reject(e);
          return;
        }
        tx.oncomplete = function () { resolve(result && result.__value !== undefined ? result.__value : result); };
        tx.onerror = function () { reject(tx.error || new Error('Browser storage transaction failed.')); };
        tx.onabort = function () { reject(tx.error || new Error('Browser storage transaction aborted.')); };
      });
    });
  }

  function getAll(storeName) {
    return run(storeName, 'readonly', function (store) {
      var out = { __value: [] };
      store.openCursor().onsuccess = function (ev) {
        var cursor = ev.target.result;
        if (cursor) { out.__value.push(cursor.value); cursor.continue(); }
      };
      return out;
    });
  }

  function getOne(storeName, key) {
    return run(storeName, 'readonly', function (store) {
      var out = { __value: undefined };
      var req = store.get(key);
      req.onsuccess = function () { out.__value = req.result; };
      return out;
    });
  }

  function putAll(storeName, records) {
    return run(storeName, 'readwrite', function (store) {
      store.clear();
      (records || []).forEach(function (r) { store.put(r); });
      return { __value: (records || []).length };
    });
  }

  function getMeta(key) {
    return getOne('meta', key).then(function (row) { return row ? row.value : undefined; });
  }

  function setMeta(key, value) {
    return run('meta', 'readwrite', function (store) {
      store.put({ key: key, value: value });
      return { __value: value };
    });
  }

  // ---- dictionary + token types -------------------------------------------

  function normaliseEntity(row) {
    var canonical = String(row && row.canonical != null ? row.canonical : '').trim();
    var aliases = (row && row.aliases) || [];
    if (typeof aliases === 'string') {
      aliases = aliases.split(',').map(function (a) { return a.trim(); }).filter(Boolean);
    }
    aliases = aliases.map(function (a) { return String(a).trim(); }).filter(Boolean);
    return {
      key: normKey(canonical),
      canonical: canonical,
      type: String((row && row.type) || 'COUNTERPARTY'),
      aliases: aliases,
      updatedAt: (row && row.updatedAt) || nowIso()
    };
  }

  function getEntities() {
    return getAll('entities').then(function (rows) {
      return rows.filter(function (r) { return r && r.canonical; });
    });
  }

  function saveEntities(rows) {
    var byKey = {};
    (rows || []).forEach(function (row) {
      var e = normaliseEntity(row);
      if (e.key) byKey[e.key] = e;
    });
    var out = Object.keys(byKey).map(function (k) { return byKey[k]; });
    return putAll('entities', out).then(function () {
      announce('entities');
      return out.length;
    });
  }

  /** Add new entities to the dictionary, merging aliases into existing entries
   * (dedup by canonical, case-insensitive). Returns the number of brand-new
   * entities added. Mirrors the old server-side store.merge_entities(). */
  function mergeEntities(rows) {
    return getEntities().then(function (existing) {
      var byKey = {};
      existing.forEach(function (r) { byKey[r.key] = r; });
      var added = 0;
      (rows || []).forEach(function (row) {
        var e = normaliseEntity(row);
        if (!e.key) return;
        var cur = byKey[e.key];
        if (cur) {
          var have = {};
          (cur.aliases || []).forEach(function (a) { have[a.toLowerCase()] = true; });
          have[e.key] = true;
          (e.aliases || []).forEach(function (a) {
            if (!have[a.toLowerCase()]) { cur.aliases.push(a); have[a.toLowerCase()] = true; }
          });
          cur.updatedAt = e.updatedAt;
        } else {
          byKey[e.key] = e;
          added += 1;
        }
      });
      var out = Object.keys(byKey).map(function (k) { return byKey[k]; });
      return putAll('entities', out).then(function () {
        announce('entities');
        return added;
      });
    });
  }

  function getTokenTypes() {
    return getOne('token_types', 'token_types').then(function (row) {
      return (row && row.types) ? row.types.slice() : [];
    });
  }

  function saveTokenTypes(types) {
    var clean = (types || []).map(function (t) { return String(t).trim(); }).filter(Boolean);
    return run('token_types', 'readwrite', function (store) {
      store.put({ id: 'token_types', types: clean, updatedAt: nowIso() });
      return { __value: clean };
    }).then(function (out) {
      announce('token_types');
      return out;
    });
  }

  // ---- mappings (jobs) -----------------------------------------------------

  function deriveKey(passphrase, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then(function (material) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: 480000 },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  function encryptMapping(mapping, passphrase) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(passphrase, salt).then(function (key) {
      var plaintext = new TextEncoder().encode(JSON.stringify(mapping || {}));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
    }).then(function (ciphertext) {
      return {
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 480000, saltB64: b64Encode(salt) },
        cipher: { name: 'AES-GCM', ivB64: b64Encode(iv) },
        ciphertextB64: b64Encode(new Uint8Array(ciphertext))
      };
    });
  }

  function decryptMapping(record, passphrase) {
    if (!record.crypto) return Promise.resolve(record.mapping || {});
    var salt = b64Decode(record.crypto.kdf.saltB64);
    var iv = b64Decode(record.crypto.cipher.ivB64);
    var ciphertext = b64Decode(record.crypto.ciphertextB64);
    return deriveKey(passphrase || '', salt).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
    }).then(function (plaintext) {
      return JSON.parse(new TextDecoder().decode(plaintext));
    }).catch(function () {
      throw new Error('Wrong passphrase, or the stored mapping is corrupted.');
    });
  }

  /** Store a job: metadata in the clear, the token -> real mapping encrypted
   * with the passphrase (or stored unprotected when the passphrase is blank). */
  function saveJob(job) {
    var passphrase = job.passphrase || '';
    var record = {
      jobId: job.jobId,
      schemaVersion: SCHEMA_VERSION,
      createdAt: job.createdAt || nowIso(),
      sourceFiles: job.sourceFiles || [],
      replacements: job.replacements || 0,
      passphraseProtected: !!passphrase,
      crypto: null,
      mapping: null
    };
    var stored = passphrase
      ? encryptMapping(job.mapping, passphrase).then(function (crypto) {
          record.crypto = crypto;
          record.mapping = null;
        })
      : Promise.resolve().then(function () {
          record.crypto = null;
          record.mapping = job.mapping || {};
        });
    return stored.then(function () {
      return run('jobs', 'readwrite', function (store) {
        store.put(record);
        return { __value: record.jobId };
      });
    }).then(function (jobId) {
      announce('jobs');
      return jobId;
    });
  }

  /** Decrypt and return the token -> real mapping of a stored job. */
  function getMapping(jobId, passphrase) {
    return getOne('jobs', jobId).then(function (record) {
      if (!record) throw new Error('That conversion is no longer in this browser.');
      return decryptMapping(record, passphrase || '');
    });
  }

  function listJobs() {
    return getAll('jobs').then(function (rows) {
      return rows.map(function (r) {
        return {
          jobId: r.jobId,
          createdAt: r.createdAt || '',
          sourceFiles: r.sourceFiles || [],
          replacements: r.replacements || 0,
          passphraseProtected: !!r.passphraseProtected
        };
      }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    });
  }

  function deleteJob(jobId) {
    return run('jobs', 'readwrite', function (store) {
      store.delete(jobId);
      return { __value: jobId };
    }).then(function (id) {
      // A job's result file is useless without its mapping — drop it too.
      return run('outputs', 'readwrite', function (store) {
        store.delete(jobId);
        return { __value: id };
      });
    }).then(function (id) {
      announce('jobs');
      return id;
    });
  }

  // ---- result files (outputs) ---------------------------------------------
  //
  // The de-identified result of a conversion is kept here, as the raw bytes
  // the user downloads (a Blob — never a base64 string), so it can be fetched
  // again after a refresh. The history list itself only ever reads job
  // metadata; a result is opened solely when the user asks for it.

  function retentionLimit() {
    return getMeta(OUTPUT_RETENTION_KEY).then(function (value) {
      var n = Number(value);
      return (isFinite(n) && n > 0) ? Math.floor(n) : OUTPUT_RETENTION_DEFAULT;
    });
  }

  function setOutputRetention(limit) {
    var n = Number(limit);
    if (!isFinite(n) || n <= 0) {
      return Promise.reject(new Error('The retention limit must be a positive number.'));
    }
    return setMeta(OUTPUT_RETENTION_KEY, Math.floor(n)).then(function () {
      announce('outputs');
      // A lower cap takes effect at once, not only on the next conversion.
      return pruneOutputs(Math.floor(n)).then(function () { return Math.floor(n); });
    });
  }

  /** Drop every result file beyond the newest `limit` (default: the configured
   * retention). Ordering comes from the by_createdAt index and only the keys
   * are read, so no blob is ever loaded into memory here. */
  function pruneOutputs(limit) {
    var limitPromise = (limit === undefined) ? retentionLimit() : Promise.resolve(Math.floor(Number(limit)));
    return limitPromise.then(function (n) {
      return run('outputs', 'readwrite', function (store) {
        var removed = { __value: [] };
        var seen = 0;
        var req = store.index('by_createdAt').openCursor(null, 'prev');   // newest first
        req.onsuccess = function (ev) {
          var cursor = ev.target.result;
          if (!cursor) return;
          seen += 1;
          if (seen > n) {
            removed.__value.push(cursor.primaryKey);
            cursor.delete();
          }
          cursor.continue();
        };
        return removed;
      });
    });
  }

  /** Keep a conversion's result file. `files` is [{name, type, b64}]; the
   * bytes are decoded and stored as Blobs, so nothing base64 survives. */
  function saveOutput(record) {
    var jobId = (record && record.jobId) || '';
    var files = ((record && record.files) || []).map(function (f) {
      return {
        name: String((f && f.name) || 'result.bin'),
        type: String((f && f.type) || 'application/octet-stream'),
        blob: b64ToBlob(f && f.b64, f && f.type)
      };
    }).filter(function (f) { return f.blob.size > 0; });
    if (!jobId || !files.length) {
      return Promise.reject(new Error('There was nothing to store for that result.'));
    }
    var row = {
      jobId: jobId,
      createdAt: (record && record.createdAt) || nowIso(),
      files: files
    };
    return run('outputs', 'readwrite', function (store) {
      store.put(row);
      return { __value: files.length };
    }).then(function () {
      announce('outputs');
      return pruneOutputs(record && record.keep);
    }).then(function (removed) {
      return { files: files.length, evicted: removed || [] };
    });
  }

  /** Metadata only: how many result files are kept, and which ones. */
  function outputStats() {
    return run('outputs', 'readonly', function (store) {
      var out = { __value: { count: 0, jobIds: [] } };
      var req = store.getAllKeys();
      req.onsuccess = function () {
        out.__value.jobIds = (req.result || []).slice();
        out.__value.count = out.__value.jobIds.length;
      };
      return out;
    }).then(function (stats) {
      return retentionLimit().then(function (limit) {
        stats.limit = limit;
        return stats;
      });
    });
  }

  /** Download a stored result file again, straight from IndexedDB (no server
   * round trip). Rejects with a plain-language error when it is gone. */
  function downloadOutput(jobId) {
    return getOne('outputs', jobId).then(function (row) {
      var files = (row && row.files) || [];
      if (!files.length) {
        throw new Error('This result file is no longer stored in this browser ' +
                        '(it was cleared, or it passed the retention limit). Add the original ' +
                        'file again to generate a fresh de-identified copy.');
      }
      return files.map(function (f) {
        var url = URL.createObjectURL(f.blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Give the browser time to start the download before dropping the URL.
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        return f.name;
      });
    });
  }

  /** Remove stored result files only — dictionary, token types and the
   * conversion mappings are left alone. */
  function clearOutputs() {
    return run('outputs', 'readwrite', function (store) {
      store.clear();
      return { __value: true };
    }).then(function () {
      announce('outputs');
      return true;
    });
  }

  // ---- backup / restore ----------------------------------------------------

  function exportBackup() {
    // Result files are deliberately NOT part of the backup: the export stays a
    // portable JSON document. A restored job keeps its mapping and can be
    // re-identified; only its result file has to be generated again.
    return Promise.all([getEntities(), getTokenTypes(), getAll('jobs'), getMeta(INSTALLED_AT_KEY)])
      .then(function (parts) {
        return {
          app: 'lethe',
          schemaVersion: SCHEMA_VERSION,
          exportedAt: nowIso(),
          installedAt: parts[3] || null,
          entities: parts[0],
          token_types: parts[1],
          jobs: parts[2]
        };
      });
  }

  function importBackup(backup) {
    if (!backup || typeof backup !== 'object' || !Array.isArray(backup.entities)) {
      return Promise.reject(new Error('That file is not a Lethe backup.'));
    }
    var version = Number(backup.schemaVersion || 1);
    if (version > SCHEMA_VERSION) {
      return Promise.reject(new Error('That backup was written by a newer Lethe version.'));
    }
    var added = 0;
    return mergeEntities(backup.entities).then(function (n) {
      added = n;
      return saveTokenTypes((backup.token_types || []).concat([]));
    }).then(function () {
      var jobs = backup.jobs || [];
      return run('jobs', 'readwrite', function (store) {
        jobs.forEach(function (job) {
          if (job && job.jobId) store.put(job);
        });
        return { __value: jobs.length };
      });
    }).then(function (n) {
      announce('jobs');
      return { entities: (backup.entities || []).length, added: added, jobs: n.__value || n };
    });
  }

  function downloadBackup() {
    return exportBackup().then(function (backup) {
      var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var stamp = nowIso().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = 'lethe-backup-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { entities: (backup.entities || []).length, jobs: (backup.jobs || []).length };
    });
  }

  function clearAll() {
    return new Promise(function (resolve, reject) {
      openDB().then(function (db) {
        db.close();
        _dbPromise = null;
        var req = window.indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error || new Error('Could not erase browser storage.')); };
        req.onblocked = function () { reject(new Error('Close the other Lethe tabs and try again.')); };
      }).catch(reject);
    }).then(function (ok) {
      try { window.localStorage.removeItem(INSTALLED_AT_KEY); } catch (e) { /* ignore */ }
      announce('cleared');
      return ok;
    });
  }

  function quota() {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().then(function (est) {
      return { usage: est.usage || 0, quota: est.quota || 0 };
    });
  }

  /** Ask the browser to keep this origin's data (dictionary, mappings, result
   * files) even under disk pressure. Never rejects, never blocks the caller:
   * a refusal only changes what the Settings page says. */
  function requestPersist() {
    var out = { supported: false, persisted: false };
    if (!navigator.storage || !navigator.storage.persist) {
      return setMeta(PERSIST_KEY, false).then(function () { return out; });
    }
    out.supported = true;
    var already = (navigator.storage.persisted ? navigator.storage.persisted()
                                               : Promise.resolve(false));
    return already.catch(function () { return false; }).then(function (yes) {
      if (yes) { out.persisted = true; return out; }
      return navigator.storage.persist().then(function (granted) {
        out.persisted = !!granted;
        return out;
      }, function () { return out; });
    }).then(function (result) {
      return setMeta(PERSIST_KEY, result.persisted).then(function () { return result; });
    });
  }

  /** What the Settings page shows about persistent storage. */
  function persistStatus() {
    var out = { supported: !!(navigator.storage && navigator.storage.persist),
                persisted: false, requested: false };
    var already = (navigator.storage && navigator.storage.persisted)
      ? navigator.storage.persisted() : Promise.resolve(false);
    return already.catch(function () { return false; }).then(function (yes) {
      out.persisted = !!yes;
      return getMeta(PERSIST_KEY);
    }).then(function (stored) {
      out.requested = stored === true;
      return out;
    }).catch(function () { return out; });
  }

  // ---- lifecycle -----------------------------------------------------------

  function init() {
    var out = {
      ok: false,
      fresh: false,
      cleared: false,
      installedAt: null,
      schemaVersion: SCHEMA_VERSION,
      upgradedFrom: null,
      error: null
    };
    var marker = null;
    try { marker = window.localStorage.getItem(INSTALLED_AT_KEY); } catch (e) { marker = null; }
    return openDB().then(function () {
      // Version 1 wrote "lethe.schema.v1"; version 2 writes "lethe.schema.v2".
      // Read both so an existing browser reports its real version and the
      // upgrade (new "outputs" store, applied by onupgradeneeded) is recorded
      // without touching any existing record.
      return Promise.all([getMeta(SCHEMA_VERSION_KEY), getMeta(SCHEMA_VERSION_KEY_V1)]);
    }).then(function (versions) {
      var known = Math.max(Number(versions[0]) || 0, Number(versions[1]) || 0);
      out.upgradedFrom = known && known < SCHEMA_VERSION ? known : null;
      return known;
    }).then(function (storedVersion) {
      var installedAt = null;
      return getMeta(INSTALLED_AT_KEY).then(function (v) {
        installedAt = v || null;
        if (!installedAt) {
          installedAt = nowIso();
          // A localStorage marker without the IndexedDB record means the
          // browser data was cleared/evicted since the last visit.
          out.fresh = !marker;
          out.cleared = !!marker;
          return setMeta(INSTALLED_AT_KEY, installedAt);
        }
      }).then(function () {
        return setMeta(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
      }).then(function () {
        out.ok = true;
        out.installedAt = installedAt;
        out.schemaVersion = SCHEMA_VERSION;
        try { window.localStorage.setItem(INSTALLED_AT_KEY, installedAt); } catch (e) { /* ignore */ }
        return out;
      });
    }).catch(function (err) {
      out.ok = false;
      out.error = (err && err.message) || String(err);
      return out;
    });
  }

  function listenForOtherTabs() {
    try {
      if (!('BroadcastChannel' in window)) return;
      _channel = new BroadcastChannel(CHANNEL_NAME);
      _channel.onmessage = function (ev) {
        var detail = (ev && ev.data) || {};
        try {
          window.dispatchEvent(new CustomEvent('leth-data-changed', { detail: detail }));
        } catch (e) { /* ignore */ }
        try {
          // Ask the NiceGUI side of every open tab to refresh its browser-backed
          // panels, so a change in one tab shows up in the others.
          if (typeof window.emitEvent === 'function') {
            window.emitEvent('leth-data-changed', detail);
          }
        } catch (e) { /* ignore */ }
      };
    } catch (e) { /* ignore */ }
  }

  listenForOtherTabs();

  window.lethStore = {
    init: init,
    getEntities: getEntities,
    saveEntities: saveEntities,
    mergeEntities: mergeEntities,
    getTokenTypes: getTokenTypes,
    saveTokenTypes: saveTokenTypes,
    listJobs: listJobs,
    deleteJob: deleteJob,
    saveJob: saveJob,
    getMapping: getMapping,
    saveOutput: saveOutput,
    outputStats: outputStats,
    downloadOutput: downloadOutput,
    clearOutputs: clearOutputs,
    pruneOutputs: pruneOutputs,
    setOutputRetention: setOutputRetention,
    outputRetentionDefault: OUTPUT_RETENTION_DEFAULT,
    exportBackup: exportBackup,
    importBackup: importBackup,
    downloadBackup: downloadBackup,
    clearAll: clearAll,
    quota: quota,
    requestPersist: requestPersist,
    persistStatus: persistStatus
  };
})();
