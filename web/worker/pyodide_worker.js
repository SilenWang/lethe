// Single document worker: Pyodide (Python gates/post-processing) and
// BetterOffice (OOXML parse/write) live in this one worker, in sequence.
//
// Everything is same-origin. There is no CDN import and no micropip: the
// Pyodide runtime, wheels and BetterOffice bundles are the P0 vendored assets.
import { OPS, PROTOCOL_VERSION } from "../lib/protocol.js";
import {
  DEFERRED_PYODIDE_PACKAGES,
  PYODIDE_PACKAGES,
  PY_SOURCES,
  TOOL_SOURCES,
} from "../lib/runtime-config.js";

const PYODIDE_DIR = new URL("../assets/vendor/pyodide/", self.location.href);
const PY_SRC_DIR = new URL("../py/lethe/", self.location.href);
const TOOLS_SRC_DIR = new URL("../py/tools/", self.location.href);
const DOCX_ENTRY = new URL(
  "../assets/vendor/betteroffice/docx/dist/docx/index.mjs",
  self.location.href,
);
const OPC_ENTRY = new URL(
  "../assets/vendor/betteroffice/docx/dist/wasm-opc.mjs",
  self.location.href,
);
let pyodide = null;
let docxModule = null;
let opcReady = null;
let docxWasmReady = false;
let cryptoReady = false;
let initPromise = null;

const post = (message, transfer = []) => self.postMessage(message, transfer);
// WASM memory only grows, so reading this after a phase is the high-water
// mark reached by that phase — that is what the DoD peak numbers report.
const heapBytes = () => pyodide?._module?.HEAPU8?.byteLength ?? 0;
const progress = (message) => ({ ...message, heapBytes: heapBytes() });

async function initRuntime() {
  if (pyodide) return pyodide;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    post({ type: "init-progress", phase: "pyodide" });
    const { loadPyodide } = await import(new URL("pyodide.mjs", PYODIDE_DIR).href);
    pyodide = await loadPyodide({ indexURL: PYODIDE_DIR.href });
    await pyodide.loadPackage(PYODIDE_PACKAGES);

    post({ type: "init-progress", phase: "python-src" });
    pyodide.FS.mkdirTree("/lethe");
    for (const name of PY_SOURCES) {
      const response = await fetch(new URL(name, PY_SRC_DIR));
      if (!response.ok) {
        throw new Error(`cannot load ${name} (HTTP ${response.status})`);
      }
      pyodide.FS.writeFile(`/lethe/${name}`, new Uint8Array(await response.arrayBuffer()));
    }
    pyodide.FS.mkdirTree("/tools");
    for (const name of TOOL_SOURCES) {
      const response = await fetch(new URL(name, TOOLS_SRC_DIR));
      if (!response.ok) {
        throw new Error(`cannot load tools/${name} (HTTP ${response.status})`);
      }
      pyodide.FS.writeFile(`/tools/${name}`, new Uint8Array(await response.arrayBuffer()));
    }
    pyodide.runPython(`
import sys
if "/" not in sys.path:
    sys.path.insert(0, "/")
import lethe.web_entry  # fail at init, not on the first upload
`);
    post({
      type: "ready",
      protocol: PROTOCOL_VERSION,
      cryptoReady: cryptoReady,
      docxWasm: docxWasmReady,
      pptxPartDirect: true,
      pyodide: pyodide.version,
      ops: OPS,
    });
    return pyodide;
  })();
  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

async function loadDocx() {
  if (!docxModule) docxModule = await import(DOCX_ENTRY.href);
  if (!opcReady) {
    opcReady = (async () => {
      const { preloadOpcWasm } = await import(OPC_ENTRY.href);
      await preloadOpcWasm();
    })();
  }
  await opcReady;
  return docxModule;
}

async function ensureCrypto() {
  if (cryptoReady) return;
  await pyodide.loadPackage(DEFERRED_PYODIDE_PACKAGES);
  cryptoReady = true;
}

function countParagraphs(node) {
  if (Array.isArray(node)) return node.reduce((total, child) => total + countParagraphs(child), 0);
  if (!node || typeof node !== "object") return 0;
  let count = node.type === "paragraph" ? 1 : 0;
  for (const value of Object.values(node)) {
    count += countParagraphs(value);
  }
  return count;
}

function callPython(payload) {
  const fn = pyodide.runPython("from lethe import web_entry; web_entry.dispatch");
  try {
    return JSON.parse(fn(JSON.stringify(payload)));
  } finally {
    fn.destroy();
  }
}

async function runInspect(id, bytes, fileName) {
  post(progress({ type: "progress", id, phase: "gates" }));
  pyodide.FS.writeFile("/tmp/input.docx", bytes);
  const gated = callPython({ op: "inspect", path: "/tmp/input.docx", file_name: fileName });
  if (!gated.ok) return gated;
  if (/\.(xlsx|pptx)$/i.test(fileName)) {
    pyodide.runPython(`
import os
try:
    os.remove("/tmp/input.docx")
except OSError:
    pass
`);
    return {
      ok: true,
      parts: gated.parts,
      paragraphs: 0,
      status: gated.status,
      warnings: gated.warnings,
      previewText: gated.preview_text || "",
      previewTruncated: !!gated.preview_truncated,
      docxWasm: docxWasmReady,
      heapBytes: heapBytes(),
    };
  }

  post(progress({ type: "progress", id, phase: "parse" }));
  const { parseDocx } = await loadDocx();
  docxWasmReady = true;
  const document = await parseDocx(bytes);
  const paragraphs = countParagraphs(document.package.document.content);

  post(progress({ type: "progress", id, phase: "postprocess" }));
  pyodide.runPython(`
import os
try:
    os.remove("/tmp/input.docx")
except OSError:
    pass
`);
  pyodide.runPython("import gc; gc.collect()");
  return {
    ok: true,
    parts: gated.parts,
    paragraphs,
    status: gated.status,
    warnings: gated.warnings,
    previewText: gated.preview_text || "",
    previewTruncated: !!gated.preview_truncated,
    docxWasm: true,
    heapBytes: heapBytes(),
  };
}

async function runWrite(id, op, bytes, options, fileName) {
  if (/\.(xlsx|pptx)$/i.test(fileName)) {
    return runPartDirectWrite(id, op, bytes, options, fileName);
  }
  const pyodideRuntime = await initRuntime();
  pyodideRuntime.FS.writeFile("/tmp/source.docx", bytes);
  post(progress({ type: "progress", id, phase: "detect" }));
  const plan = callPython({
    op,
    path: "/tmp/source.docx",
    file_name: fileName,
    entities: options.entities || [],
    token_map: options.token_map || {},
    token_overrides: options.token_overrides || {},
  });
  if (!plan.ok) return plan;
  if (plan.final_path) {
    post(progress({ type: "progress", id, phase: "postprocess" }));
    const output = pyodideRuntime.FS.readFile(plan.final_path);
    return {
      ok: true,
      bytes: output,
      tokens: plan.tokens || [],
      items: plan.items || [],
      counts: plan.counts || {},
      hits: plan.hits || 0,
      warnings: plan.warnings || [],
      size: output.byteLength,
      docxWasm: docxWasmReady,
      heapBytes: heapBytes(),
    };
  }

  post(progress({ type: "progress", id, phase: "write" }));
  const { updateMultipleFiles } = await loadDocx();
  docxWasmReady = true;
  const library = await updateMultipleFiles(
    bytes.buffer,
    new Map(Object.entries(plan.updates)),
  );
  pyodideRuntime.FS.writeFile("/tmp/library.docx", new Uint8Array(library));

  post(progress({ type: "progress", id, phase: "postprocess" }));
  const done = callPython({
    op: "finish",
    source: "/tmp/source.docx",
    library: "/tmp/library.docx",
    tokens: plan.tokens,
  });
  if (!done.ok) return done;
  const output = pyodideRuntime.FS.readFile("/tmp/final.docx");
  return {
    ok: true,
    bytes: output,
    tokens: plan.tokens,
    items: plan.items,
    counts: plan.counts,
    hits: plan.hits,
    size: output.byteLength,
    docxWasm: true,
    heapBytes: heapBytes(),
  };
}

async function runPartDirectWrite(id, op, bytes, options, fileName) {
  const pyodideRuntime = await initRuntime();
  pyodideRuntime.FS.writeFile("/tmp/source.part", bytes);
  post(progress({ type: "progress", id, phase: "detect" }));
  const plan = callPython({
    op,
    path: "/tmp/source.part",
    file_name: fileName,
    entities: options.entities || [],
    token_map: options.token_map || {},
    token_overrides: options.token_overrides || {},
  });
  if (!plan.ok) return plan;
  if (!plan.final_path) {
    return { ok: false, code: "INTERNAL", message: "part-direct engine returned no final_path" };
  }

  post(progress({ type: "progress", id, phase: "postprocess" }));
  const output = pyodideRuntime.FS.readFile(plan.final_path);
  return {
    ok: true,
    bytes: output,
    tokens: plan.tokens || [],
    items: plan.items || [],
    counts: plan.counts || {},
    hits: plan.hits || 0,
    warnings: plan.warnings || [],
    docxWasm: docxWasmReady,
    pptxPartDirect: /\.pptx$/i.test(fileName),
    size: output.byteLength,
    heapBytes: heapBytes(),
  };
}

function cleanupTemp() {
  try {
    pyodide.runPython(`
import os
for _path in ("/tmp/source.docx", "/tmp/library.docx", "/tmp/final.docx",
              "/tmp/source.part", "/tmp/final.xlsx", "/tmp/final.pptx",
              "/tmp/input.docx"):
    try:
        os.remove(_path)
    except OSError:
        pass
import gc
gc.collect()
`);
  } catch {
    // runtime already gone; the worker will be replaced
  }
}

async function handleRun(message) {
  const { id, op } = message;
  const bytes = new Uint8Array(message.bytes);
  try {
    await initRuntime();
    if (op === "echo") {
      const result = callPython({ op: "echo", options: message.options || {} });
      post({ type: "result", id, result });
      return;
    }
    if (op === "inspect") {
      const result = await runInspect(id, bytes, message.fileName);
      if (!result.ok) {
        post({ type: "error", id, ...result });
        return;
      }
      post({ type: "result", id, result });
      return;
    }
    if (op === "redact" || op === "restore") {
      const result = await runWrite(
        id,
        op,
        bytes,
        message.options || {},
        String(message.fileName || "upload.docx"),
      );
      if (!result.ok) {
        post({ type: "error", id, ...result });
        return;
      }
      post({ type: "result", id, result }, [result.bytes.buffer]);
      return;
    }
    post({ type: "error", id, code: "INTERNAL", message: `unknown op ${op}` });
  } catch (error) {
    post({ type: "error", id, code: classifyError(error), message: String(error?.message || error) });
  } finally {
    cleanupTemp();
  }
}

export function classifyError(error) {
  const text = `${error?.name || ""} ${error?.message || error}`.toLowerCase();
  if (/out of memory|grow failed|cannot enlarge memory|memory access out of bounds/.test(text)) {
    return "OOM";
  }
  if (/badzipfile|invalid zip|not a zip|crc error|xmlsyntaxerror|parse error/.test(text)) {
    return "PARSE_FAILED";
  }
  if (/cancel|abort/.test(text)) return "CANCELLED";
  if (/timeout|timed out|无响应/.test(text)) return "TIMEOUT";
  return "INTERNAL";
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message?.type === "stats") {
    post({ type: "stats", id: message.id, heapBytes: heapBytes() });
    return;
  }
  if (message?.type === "vault") {
    try {
      await initRuntime();
      await ensureCrypto();
      post({ type: "vault-ready", id: message.id, cryptoReady: cryptoReady });
    } catch (error) {
      post({
        type: "vault-error",
        id: message.id,
        code: classifyError(error),
        message: String(error?.message || error),
      });
    }
    return;
  }
  if (message?.type !== "run") return;
  await handleRun(message);
};

// Warm the runtime on spawn so the first upload does not pay the full init.
initRuntime().catch((error) => {
  post({
    type: "init-error",
    code: "INIT_FAILED",
    message: String(error?.message || error),
  });
});
