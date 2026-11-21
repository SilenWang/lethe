// Minimal P1 harness: proves the built app can load the pinned Pyodide runtime
// from this origin only. The worker pipeline is added in next/p1-foundation.
import { loadPyodide } from "../assets/vendor/pyodide/pyodide.mjs";

const status = document.getElementById("status");
const detail = document.getElementById("detail");

window.p1 = {
  state: "loading",
  async load() {
    const py = await loadPyodide({ indexURL: "../assets/vendor/pyodide/" });
    this.pyodide = py;
    this.state = "ready";
    status.textContent = "ready";
    detail.textContent = py.version;
    return py;
  },
};

window.p1
  .load()
  .catch((error) => {
    window.p1.state = "init-error";
    window.p1.error = String(error);
    status.textContent = "init-error";
    detail.textContent = window.p1.error;
  });
