// Single document worker: Pyodide (Python gates/post-processing) and
// BetterOffice (OOXML parse/write) live in this one worker, in sequence.
//
// Everything is same-origin. There is no CDN import and no micropip: the
// Pyodide runtime, wheels and BetterOffice bundles are the P0 vendored assets.
import { OPS, PROTOCOL_VERSION } from "../lib/protocol.js";

const PYODIDE_DIR = new URL("../assets/vendor/pyodide/", self.location.href);
const PY_SRC_DIR = new URL("../py/lethe/", self.location.href);
const DOCX_ENTRY = new URL(
  "../assets/vendor/betteroffice/docx/dist/docx/index.mjs",
  self.location.href,
);
const PY_SOURCES = ["__init__.py", "gates.py", "web_entry.py"];

let pyodide = null;
let docxModule = null;
let initPromise = null;

const post = (message, transfer = []) => self.postMessage(message, transfer);

async function initRuntime() {
  if (pyodide) return pyodide;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    post({ type: "init-progress", phase: "pyodide" });
    const { loadPyodide } = await import(new URL("pyodide.mjs", PYODIDE_DIR).href);
    pyodide = await loadPyodide({ indexURL: PYODIDE_DIR.href });

    post({ type: "init-progress", phase: "python-src" });
    pyodide.FS.mkdirTree("/lethe");
    for (const name of PY_SOURCES) {
      const response = await fetch(new URL(name, PY_SRC_DIR));
      if (!response.ok) {
        throw new Error(`cannot load ${name} (HTTP ${response.status})`);
      }
      pyodide.FS.writeFile(`/lethe/${name}`, new Uint8Array(await response.arrayBuffer()));
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
  return docxModule;
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
  post({ type: "progress", id, phase: "gates" });
  pyodide.FS.writeFile("/tmp/input.docx", bytes);
  const gated = callPython({ op: "inspect", path: "/tmp/input.docx", file_name: fileName });
  if (!gated.ok) return gated;

  post({ type: "progress", id, phase: "parse" });
  const { parseDocx } = await loadDocx();
  const document = await parseDocx(bytes);
  const paragraphs = countParagraphs(document.package.document.content);

  post({ type: "progress", id, phase: "postprocess" });
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
  };
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
    post({
      type: "error",
      id,
      code: "INTERNAL",
      message: `op ${op} arrives with next/p1-docx-core`,
    });
  } catch (error) {
    post({ type: "error", id, code: classifyError(error), message: String(error?.message || error) });
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
