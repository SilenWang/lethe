// One source of truth for the browser runtime.  Both the worker and the
// service worker import this file, so the eager-preload set cannot drift from
// what the worker actually initialises.
export const SUPPORTED_FORMATS = Object.freeze(["docx", "pptx"]);
export const BETTEROFFICE_PACKAGES = Object.freeze(["docx"]);
export const PY_SOURCES = Object.freeze([
  "__init__.py",
  "core.py",
  "docx_engine.py",
  "gates.py",
  "postprocess.py",
  "pptx_engine.py",
  "web_entry.py",
]);
export const TOOL_SOURCES = Object.freeze(["__init__.py", "postprocess_contract.py"]);
export const PYODIDE_PACKAGES = Object.freeze(["lxml"]);
export const DEFERRED_PYODIDE_PACKAGES = Object.freeze(["cryptography"]);
