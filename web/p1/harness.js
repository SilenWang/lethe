// P1 harness: the debug surface UI work builds against. It owns no document
// logic; the worker and the bridge do.
import { createBridge, classifyError } from "../lib/pyodide_bridge.js";

const status = document.getElementById("status");
const detail = document.getElementById("detail");

function render(event) {
  if (window.p1) {
    window.p1.state = event.state;
    window.p1.lastStatus = event;
  }
  status.textContent = event.state;
  const phase = event.phase ? ` (${event.phase})` : "";
  const reason = event.reason ? ` — ${event.reason}` : "";
  detail.textContent = `${event.state}${phase}${reason}`;
}

window.p1 = { state: "starting", createBridge, classifyError };
const bridge = createBridge({ onStatus: render });

window.p1.bridge = bridge;
window.p1.ready = bridge.ready;

bridge.ready.then(
  (info) => {
    window.p1.runtime = info;
    render({ state: "ready" });
  },
  (error) => {
    window.p1.error = `${error.code || "INIT_FAILED"}: ${error.message}`;
    render({ state: "init-error" });
  },
);
