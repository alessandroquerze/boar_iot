// Bootstrap: wires the workbench chrome (activity bar, meta bar, bottom panel,
// start-up overlay) and keeps the space model up to date over Server-Sent
// Events. Project tabs and the menu actions arrive in plan steps 8 and 9.

import { initBottomPanel, onBottomClear, render, setCount } from "./bottom-panel.js";
import { initDevicesPanel } from "./panel-devices.js";

/** The space model as last pushed by the server. */
export let space = { space: {}, things: [] };

const listeners = new Set();

/** Called with the whole state whenever the server pushes a new one. */
export function onSpaceChange(handler) {
  listeners.add(handler);
  if (space.space.id) handler(space);
}

// ----------------------------------------------------------------- activity bar

function initActivityBar() {
  const bar = document.getElementById("activitybar");
  const workbench = document.getElementById("workbench");

  bar.addEventListener("click", (event) => {
    const button = event.target.closest(".activity");
    if (!button) return;

    const wanted = button.dataset.panel;
    const alreadyOpen = button.getAttribute("aria-current") === "true";

    // Clicking the open panel's icon hides the side bar, as in VS Code.
    workbench.classList.toggle("sidebar-hidden", alreadyOpen);
    if (alreadyOpen) return;

    for (const other of bar.querySelectorAll(".activity")) {
      other.setAttribute("aria-current", String(other === button));
    }
    for (const panel of document.querySelectorAll("#sidebar .panel")) {
      panel.hidden = panel.dataset.panel !== wanted;
    }
  });

  // ?panel=devices opens straight into a panel, which is handy for a demo.
  const wanted = new URLSearchParams(location.search).get("panel") ?? "apps";
  (bar.querySelector(`.activity[data-panel="${wanted}"]`) ??
    bar.querySelector('.activity[data-panel="apps"]')).click();
}

// --------------------------------------------------------------------- meta bar

function renderMeta(state) {
  document.getElementById("meta-address").textContent = state.space.ideAddress ?? "…";
  document.getElementById("meta-space").textContent = state.space.id ?? "unknown space";

  const broker = state.space.broker ?? "unknown";
  setPill("meta-broker", `broker: ${broker}`, {
    connected: "ok",
    simulated: "warn",
    disconnected: "error",
    error: "error",
  }[broker] ?? "unknown");

  const discovery = state.space.discovery ?? "unknown";
  const things = state.things.length;
  setPill(
    "meta-discovery",
    discovery === "ready" ? `${things} thing${things === 1 ? "" : "s"}` : discovery,
    discovery === "ready" ? (things > 0 ? "ok" : "warn") : "unknown",
  );
}

function setPill(id, text, kind) {
  const pill = document.getElementById(id);
  pill.textContent = text;
  pill.dataset.kind = kind;
}

// --------------------------------------------------------------------- overlay

// The guidelines ask the IDE to freeze until it has heard enough tweets, because
// interacting while the panels are still being learned is confusing.
function renderOverlay(state) {
  const overlay = document.getElementById("startup-overlay");
  const scanning = state.space.discovery === "scanning";
  overlay.hidden = !scanning;

  if (scanning) {
    const things = state.things.length;
    document.getElementById("startup-detail").textContent =
      things === 0
        ? "listening for Atlas tweets"
        : `heard ${things} thing${things === 1 ? "" : "s"} so far`;
  }
}

// ------------------------------------------------------------------- live state

function applyState(next) {
  space = next;
  renderMeta(next);
  renderOverlay(next);
  for (const listener of listeners) listener(next);
}

function connect() {
  const events = new EventSource("/api/events");

  events.addEventListener("state", (event) => applyState(JSON.parse(event.data)));

  events.addEventListener("error", () => {
    // EventSource retries on its own; just say so in the meta bar.
    setPill("meta-broker", "broker: ide offline", "error");
  });
}

// ------------------------------------------------------------------- bootstrap

initActivityBar();
initBottomPanel();
initDevicesPanel();
onBottomClear(() => render("console", []));

render("console", [{ kind: "dim", what: "no project open." }]);
render("output", [{ kind: "dim", what: "nothing has run yet." }]);
render("status", [{ kind: "dim", what: "no app is running." }]);
setCount("console", 0);

fetch("/api/state")
  .then((response) => response.json())
  .then(applyState)
  .catch((error) => render("console", [{ kind: "error", what: `cannot reach the IDE server: ${error.message}` }]));

connect();
