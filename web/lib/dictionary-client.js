// Signed preset-dictionary client. User entities are intentionally absent:
// this module only handles the immutable, release-signed preset layer.
import {
  DICTIONARY_BASE_URL,
  DICTIONARY_CORE_LIMIT_BYTES,
  DICTIONARY_PUBLIC_KEY,
  DICTIONARY_TOTAL_LIMIT_BYTES,
} from "./dictionary-config.js";

const MANIFEST_SCHEMA = "lethe-dictionary-manifest";
const MANIFEST_SCHEMA_VERSION = 1;
const PACK_VERSION_RE = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SHARD_RE = /^[a-z][a-z0-9-]{0,31}$/;
const ROOT_DIR = "lethe-dictionaries";
const PACKS_DIR = "packs";
const SHARDS_DIR = "shards";
const POINTER_SLOTS = ["active-0.json", "active-1.json"];
const UPDATE_LOCK = "lethe-dictionary-update";

function dictionaryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function base64Bytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

function safeRelativePath(path) {
  const parts = String(path).split("/");
  return (
    path &&
    !path.startsWith("/") &&
    !parts.includes("..") &&
    !parts.includes("") &&
    path.endsWith(".jsonl.gz")
  );
}

function validateManifest(manifest, limits) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw dictionaryError("MANIFEST_INVALID", "Dictionary manifest is not an object.");
  }
  if (
    manifest.schema !== MANIFEST_SCHEMA ||
    manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION
  ) {
    throw dictionaryError("MANIFEST_INVALID", "Unsupported dictionary manifest schema.");
  }
  if (!PACK_VERSION_RE.test(String(manifest.packVersion || ""))) {
    throw dictionaryError("MANIFEST_INVALID", "Dictionary packVersion is invalid.");
  }
  if (manifest.layer !== "preset") {
    throw dictionaryError("MANIFEST_INVALID", "Dictionary manifests must target the preset layer.");
  }
  if (!Array.isArray(manifest.shards) || manifest.shards.length === 0) {
    throw dictionaryError("MANIFEST_INVALID", "Dictionary manifest has no shards.");
  }
  if (!Array.isArray(manifest.coreShards) || manifest.coreShards.length === 0) {
    throw dictionaryError("MANIFEST_INVALID", "Dictionary manifest has no core shards.");
  }
  const ids = new Set();
  let total = 0;
  let coreTotal = 0;
  for (const shard of manifest.shards) {
    if (!shard || !SHARD_RE.test(String(shard.id || "")) || ids.has(shard.id)) {
      throw dictionaryError("MANIFEST_INVALID", "Dictionary manifest has an invalid shard id.");
    }
    ids.add(shard.id);
    if (!safeRelativePath(shard.path)) {
      throw dictionaryError("MANIFEST_INVALID", `Unsafe shard path for ${shard.id}.`);
    }
    if (!SHA256_RE.test(String(shard.sha256 || ""))) {
      throw dictionaryError("MANIFEST_INVALID", `Invalid shard hash for ${shard.id}.`);
    }
    if (!Number.isSafeInteger(shard.bytes) || shard.bytes <= 0) {
      throw dictionaryError("MANIFEST_INVALID", `Invalid byte count for ${shard.id}.`);
    }
    if (!Number.isSafeInteger(shard.entities) || shard.entities <= 0) {
      throw dictionaryError("MANIFEST_INVALID", `Invalid entity count for ${shard.id}.`);
    }
    total += shard.bytes;
    if (manifest.coreShards.includes(shard.id)) coreTotal += shard.bytes;
  }
  if (manifest.coreShards.some((id) => !ids.has(id))) {
    throw dictionaryError("MANIFEST_INVALID", "Dictionary manifest references a missing core shard.");
  }
  if (total !== manifest.totalGzipBytes || coreTotal !== manifest.coreGzipBytes) {
    throw dictionaryError("MANIFEST_INVALID", "Dictionary manifest size totals do not add up.");
  }
  if (coreTotal > limits.core) {
    throw dictionaryError("CORE_TOO_LARGE", `Dictionary core is ${coreTotal} bytes; limit ${limits.core}.`);
  }
  if (total > limits.total) {
    throw dictionaryError("PACK_TOO_LARGE", `Dictionary pack is ${total} bytes; limit ${limits.total}.`);
  }
  return manifest;
}

export async function verifySignedManifest(manifestBytes, signatureBytes, publicKeyBase64) {
  let key;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      base64Bytes(publicKeyBase64),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  } catch (error) {
    throw dictionaryError("SIGNATURE_INVALID", `Dictionary trust anchor is invalid: ${error.message || error}`);
  }
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    signatureBytes,
    manifestBytes,
  );
  if (!valid) {
    throw dictionaryError("SIGNATURE_INVALID", "Dictionary manifest signature does not verify.");
  }
}

function parsePointer(value, slot) {
  if (!value || typeof value !== "object") return null;
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) return null;
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) return null;
  if (!PACK_VERSION_RE.test(String(value.currentVersion || ""))) return null;
  if (value.previousVersion != null && !PACK_VERSION_RE.test(String(value.previousVersion))) {
    return null;
  }
  if (!SHA256_RE.test(String(value.currentManifestSha256 || ""))) return null;
  if (
    value.previousVersion != null &&
    value.schemaVersion >= 2 &&
    !SHA256_RE.test(String(value.previousManifestSha256 || ""))
  ) {
    return null;
  }
  return { ...value, slot };
}

async function readJsonFile(dir, name) {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return JSON.parse(await file.text());
  } catch (error) {
    if (error?.name === "NotFoundError" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function readJsonFileState(dir, name) {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    try {
      return { value: JSON.parse(await file.text()), damaged: false };
    } catch (error) {
      if (error instanceof SyntaxError) return { value: null, damaged: true };
      throw error;
    }
  } catch (error) {
    if (error?.name === "NotFoundError") return { value: null, damaged: false };
    return { value: null, damaged: true };
  }
}

async function readBytesFile(dir, name) {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

async function writeBytesFile(dir, name, bytes) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function childDirectory(parent, name, create = true) {
  return parent.getDirectoryHandle(name, { create });
}

async function gunzip(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw dictionaryError("DECOMPRESSION_UNAVAILABLE", "This browser cannot decompress dictionary shards.");
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseEntities(bytes, manifest) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw dictionaryError("SHARD_INVALID", `Dictionary shard contains invalid JSON: ${error.message}`);
    }
    if (row?.source !== "preset") {
      throw dictionaryError("SHARD_INVALID", "Dictionary shard contains non-preset data.");
    }
    const canonical = String(row.canonical || "").trim();
    const type = String(row.type || "").trim();
    if (!canonical || !type) {
      throw dictionaryError("SHARD_INVALID", "Dictionary shard contains an incomplete entity.");
    }
    rows.push({
      canonical,
      type,
      aliases: Array.isArray(row.aliases)
        ? row.aliases.map((alias) => String(alias).trim()).filter(Boolean)
        : [],
      source: "preset",
      packVersion: manifest.packVersion,
    });
  }
  return rows;
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta) return delta;
  }
  return 0;
}

/**
 * Content-addressed shards underneath two alternating OPFS pointer slots.
 *
 * A pack directory and every shard are made durable and verified before the
 * inactive pointer slot is written. If that slot is damaged, status() falls
 * back to the other slot, so the previous active pack remains recoverable.
 */
export class DictionaryClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || DICTIONARY_BASE_URL;
    this.publicKey = options.publicKey || DICTIONARY_PUBLIC_KEY;
    this.fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
    this.storageRoot = options.storageRoot || null;
    this.limits = {
      core: options.coreLimit || DICTIONARY_CORE_LIMIT_BYTES,
      total: options.totalLimit || DICTIONARY_TOTAL_LIMIT_BYTES,
    };
    this._rootPromise = null;
    this._entityCache = new Map();
  }

  async _root() {
    if (!this._rootPromise) {
      this._rootPromise = (async () => {
        if (this.storageRoot) return this.storageRoot;
        if (!navigator.storage?.getDirectory) {
          throw dictionaryError("OPFS_UNAVAILABLE", "This browser does not provide origin-private file storage.");
        }
        const origin = await navigator.storage.getDirectory();
        return childDirectory(origin, ROOT_DIR);
      })();
    }
    return this._rootPromise;
  }

  async _withLock(work) {
    if (navigator.locks?.request) {
      return navigator.locks.request(UPDATE_LOCK, { mode: "exclusive" }, work);
    }
    return work();
  }

  async _fetchBytes(path) {
    const response = await this.fetchImpl(joinUrl(this.baseUrl, path), { cache: "no-cache" });
    if (!response || !response.ok) {
      throw dictionaryError(
        "FETCH_FAILED",
        `${path}: HTTP ${response ? response.status : "no response"}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async _candidates(root) {
    const candidates = [];
    const damagedSlots = [];
    for (let slot = 0; slot < POINTER_SLOTS.length; slot += 1) {
      const state = await readJsonFileState(root, POINTER_SLOTS[slot]);
      const parsed = parsePointer(state.value, slot);
      if (parsed) candidates.push(parsed);
      else if (state.damaged || state.value != null) damagedSlots.push(slot);
    }
    candidates.sort((left, right) => right.sequence - left.sequence);
    return { candidates, damagedSlots };
  }

  async _writePointer(root, active, current, currentHash, previous, previousHash) {
    const pointer = {
      schemaVersion: 2,
      sequence: (active?.sequence || 0) + 1,
      currentVersion: current,
      currentManifestSha256: currentHash,
      previousVersion: previous || null,
      previousManifestSha256: previous ? previousHash : null,
    };
    const slot = active?.slot === 0 ? 1 : 0;
    await writeBytesFile(root, POINTER_SLOTS[slot], new TextEncoder().encode(`${JSON.stringify(pointer)}\n`));
    const reread = parsePointer(await readJsonFile(root, POINTER_SLOTS[slot]), slot);
    if (!reread || reread.sequence !== pointer.sequence || reread.currentVersion !== current) {
      throw dictionaryError("POINTER_WRITE_FAILED", "Dictionary activation pointer did not persist.");
    }
    return reread;
  }

  async _readPack(root, version) {
    const packs = await childDirectory(root, PACKS_DIR);
    const pack = await childDirectory(packs, version, false);
    const manifestBytes = await readBytesFile(pack, "manifest.json");
    const signature = await readBytesFile(pack, "manifest.sig");
    if (!manifestBytes || !signature) {
      throw dictionaryError("PACK_MISSING", `Dictionary pack ${version} is incomplete.`);
    }
    await verifySignedManifest(manifestBytes, signature, this.publicKey);
    let manifest;
    try {
      manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
    } catch (error) {
      throw dictionaryError("MANIFEST_INVALID", `Dictionary pack ${version} is invalid: ${error.message}`);
    }
    validateManifest(manifest, this.limits);
    if (manifest.packVersion !== version) {
      throw dictionaryError("PACK_MISMATCH", `Dictionary pack ${version} contains another version.`);
    }
    return { pack, manifest, manifestBytes, signature, manifestHash: await sha256(manifestBytes) };
  }

  async _ensureShard(root, shard) {
    const shards = await childDirectory(root, SHARDS_DIR);
    let bytes = await readBytesFile(shards, shard.sha256);
    if (bytes && bytes.byteLength === shard.bytes && (await sha256(bytes)) === shard.sha256) {
      return "reused";
    }
    if (bytes) await shards.removeEntry(shard.sha256);
    bytes = await this._fetchBytes(shard.path);
    if (bytes.byteLength !== shard.bytes || (await sha256(bytes)) !== shard.sha256) {
      throw dictionaryError("SHARD_INVALID", `Dictionary shard ${shard.id} failed size/hash verification.`);
    }
    await writeBytesFile(shards, shard.sha256, bytes);
    return "downloaded";
  }

  async _verifyInstalledShards(root, manifest) {
    const shards = await childDirectory(root, SHARDS_DIR);
    for (const shard of manifest.shards) {
      const bytes = await readBytesFile(shards, shard.sha256);
      if (!bytes || bytes.byteLength !== shard.bytes || (await sha256(bytes)) !== shard.sha256) {
        throw dictionaryError("SHARD_INVALID", `Dictionary shard ${shard.id} is missing or damaged.`);
      }
    }
  }

  async _validatePointer(root, pointer) {
    const pack = await this._readPack(root, pointer.currentVersion);
    if (pack.manifestHash !== pointer.currentManifestSha256) {
      throw dictionaryError("PACK_MISMATCH", "Dictionary pointer manifest digest does not match.");
    }
    await this._verifyInstalledShards(root, pack.manifest);
    return pack;
  }

  async _retainedHashes(root, pointer) {
    const hashes = new Map([
      [pointer.currentVersion, pointer.currentManifestSha256],
    ]);
    if (!pointer.previousVersion) return hashes;
    if (pointer.previousManifestSha256) {
      hashes.set(pointer.previousVersion, pointer.previousManifestSha256);
      return hashes;
    }
    try {
      const previous = await this._readPack(root, pointer.previousVersion);
      hashes.set(pointer.previousVersion, previous.manifestHash);
    } catch {
      // A damaged retained manifest cannot be compared; callers reject an
      // incoming manifest for that version rather than overwrite it.
    }
    return hashes;
  }

  async _selectActive(root) {
    const { candidates, damagedSlots } = await this._candidates(root);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      try {
        const pack = await this._validatePointer(root, candidate);
        if (index === 0 && damagedSlots.length === 0) {
          return { pointer: candidate, pack, repaired: false };
        }

        const previousHash = candidate.previousManifestSha256 || null;
        const prior = index === 0 ? candidate : candidates[0];
        const repaired = await this._writePointer(
          root,
          prior,
          candidate.currentVersion,
          candidate.currentManifestSha256,
          previousHash ? candidate.previousVersion : null,
          previousHash,
        );
        // Parsed rows carry packVersion metadata. A persistent fallback must
        // not leave rows from the previous pointer epoch visible to this client.
        this._entityCache.clear();
        return {
          pointer: { ...candidate, ...repaired, repaired: true },
          pack,
          repaired: true,
        };
      } catch {
        // Try the other retained slot.
      }
    }
    return null;
  }

  async update() {
    return this._withLock(async () => {
      const root = await this._root();
      const manifestBytes = await this._fetchBytes("manifest.json");
      const signature = await this._fetchBytes("manifest.sig");
      await verifySignedManifest(manifestBytes, signature, this.publicKey);
      let manifest;
      try {
        manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
      } catch (error) {
        throw dictionaryError("MANIFEST_INVALID", `Dictionary manifest JSON is invalid: ${error.message}`);
      }
      validateManifest(manifest, this.limits);

      const selected = await this._selectActive(root);
      const active = selected?.pointer || null;
      const incomingHash = await sha256(manifestBytes);
      if (active) {
        const retained = await this._retainedHashes(root, active);
        const retainedHashes = [active.currentVersion, active.previousVersion];
        if (
          retainedHashes.includes(manifest.packVersion) &&
          retained.get(manifest.packVersion) !== incomingHash
        ) {
          throw dictionaryError(
            "VERSION_CONFLICT",
            `Dictionary ${manifest.packVersion} is already retained with different signed content.`,
          );
        }
        const order = compareVersions(manifest.packVersion, active.currentVersion);
        if (order < 0 || (order === 0 && incomingHash !== active.currentManifestSha256)) {
          throw dictionaryError(
            "VERSION_CONFLICT",
            `Dictionary ${manifest.packVersion} cannot replace active ${active.currentVersion}; use rollback for older packs.`,
          );
        }
        if (order === 0) {
          return {
            action: "up-to-date",
            currentVersion: active.currentVersion,
            previousVersion: active.previousVersion,
            downloadedShards: 0,
            reusedShards: manifest.shards.length,
          };
        }
      }

      const result = { downloaded: 0, reused: 0 };
      for (const shard of manifest.shards) {
        const outcome = await this._ensureShard(root, shard);
        if (outcome === "downloaded") result.downloaded += 1;
        else result.reused += 1;
      }

      const packs = await childDirectory(root, PACKS_DIR);
      const pack = await childDirectory(packs, manifest.packVersion);
      await writeBytesFile(pack, "manifest.json", manifestBytes);
      await writeBytesFile(pack, "manifest.sig", signature);
      await this._readPack(root, manifest.packVersion);

      const reinstall = active?.currentVersion === manifest.packVersion;
      const previous = reinstall
        ? active.previousVersion
        : (active?.currentVersion || null);
      const previousHash = reinstall
        ? active.previousManifestSha256
        : (previous ? active.currentManifestSha256 : null);
      const pointer = await this._writePointer(
        root,
        active,
        manifest.packVersion,
        incomingHash,
        previous,
        previousHash,
      );
      this._entityCache.clear();
      return {
        action: "installed",
        currentVersion: pointer.currentVersion,
        previousVersion: pointer.previousVersion,
        downloadedShards: result.downloaded,
        reusedShards: result.reused,
      };
    });
  }

  async status() {
    return this._withLock(async () => {
      const root = await this._root();
      const selected = await this._selectActive(root);
      if (!selected) return { currentVersion: null, previousVersion: null };
      return {
        currentVersion: selected.pointer.currentVersion,
        previousVersion: selected.pointer.previousVersion,
        sequence: selected.pointer.sequence,
        repaired: selected.repaired,
      };
    });
  }

  async rollback() {
    return this._withLock(async () => {
      const root = await this._root();
      const selected = await this._selectActive(root);
      const active = selected?.pointer;
      if (!active?.previousVersion) {
        throw dictionaryError("NO_ROLLBACK", "No previous dictionary pack is retained.");
      }
      const target = await this._readPack(root, active.previousVersion);
      await this._verifyInstalledShards(root, target.manifest);
      const pointer = await this._writePointer(
        root,
        active,
        active.previousVersion,
        target.manifestHash,
        active.currentVersion,
        active.currentManifestSha256,
      );
      this._entityCache.clear();
      return {
        currentVersion: pointer.currentVersion,
        previousVersion: pointer.previousVersion,
      };
    });
  }

  async loadEntities(options = {}) {
    return this._withLock(async () => {
      const root = await this._root();
      const selected = await this._selectActive(root);
      if (!selected) {
        throw dictionaryError("NO_ACTIVE_PACK", "No complete preset dictionary is installed.");
      }
      const manifest = selected.pack.manifest;
      const shardsDir = await childDirectory(root, SHARDS_DIR);
      const coreOnly = options.tier === "core";
      const shards = manifest.shards.filter(
        (shard) => !coreOnly || manifest.coreShards.includes(shard.id),
      );
      const entities = [];
      const seen = new Set();
      for (const shard of shards) {
        const cacheKey = [
          selected.pointer.currentVersion,
          selected.pointer.currentManifestSha256,
          shard.sha256,
        ].join(":");
        let rows = this._entityCache.get(cacheKey);
        if (!rows) {
          const packed = await readBytesFile(shardsDir, shard.sha256);
          if (!packed) {
            throw dictionaryError("SHARD_MISSING", `Dictionary shard ${shard.id} is missing.`);
          }
          if (packed.byteLength !== shard.bytes || (await sha256(packed)) !== shard.sha256) {
            throw dictionaryError("SHARD_INVALID", `Dictionary shard ${shard.id} failed verification.`);
          }
          rows = parseEntities(await gunzip(packed), manifest);
          this._entityCache.set(cacheKey, rows);
        }
        for (const row of rows) {
          const key = row.canonical.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          entities.push(row);
        }
      }
      return entities;
    });
  }
}

export function createDictionaryClient(options = {}) {
  return new DictionaryClient(options);
}
