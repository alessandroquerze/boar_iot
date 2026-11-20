// Bootstrap: wires the workbench chrome (activity bar, meta bar, bottom panel,
// start-up overlay) and keeps the space model up to date over Server-Sent
// Events. Project tabs and the menu actions arrive in plan steps 8 and 9.

import { initBottomPanel, onBottomClear, render, setCount } from "./bottom-panel.js";
import { initDevicesPanel } from "./panel-devices.js";
import {
  activeProject,
  closeProject,
  createProject,
  listProjects,
  onProjectsChange,
  setActiveProject,
} from "./project.js";
import { initTextEditor, setCatalogue, showProject } from "./text-editor.js";

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

// ------------------------------------------------------------------- tab bar

// One tab per open project, as in a VS Code multi-root workspace. Each project
// owns its model, its editor states and its console; switching tabs swaps all
// of it, and nothing is shared.
let shownProjectId = null;

function renderTabs() {
  const bar = document.getElementById("tabbar");
  bar.replaceChildren(...listProjects().map(tabElement));

  const project = activeProject();
  document.getElementById("editors").classList.toggle("no-project", !project);
  document.getElementById("graph-clear").disabled = !project;

  for (const action of document.querySelectorAll(".menu-action")) {
    action.disabled = !project;
  }

  // Only reload the editors when the tab actually changed: this runs on every
  // small change, including while the user is typing.
  if ((project?.id ?? null) !== shownProjectId) {
    shownProjectId = project?.id ?? null;
    showProject(project);
    render("console", project?.console ?? [{ kind: "dim", what: "no project open." }]);
    render("output", project?.output ?? [{ kind: "dim", what: "nothing has run yet." }]);
  }
}

function tabElement(project) {
  const tab = document.createElement("div");
  tab.className = "tab";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", String(project.id === activeProject()?.id));
  tab.dataset.dirty = String(project.dirty);
  tab.title = project.path ?? "not saved yet";

  const name = document.createElement("span");
  name.className = "tab-name";
  name.textContent = project.name;
  tab.appendChild(name);

  const close = document.createElement("button");
  close.className = "icon-btn tab-close";
  close.title = "Close";
  close.innerHTML = '<svg class="icon" width="13" height="13"><use href="#i-close" /></svg>';
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    if (project.dirty && !confirm(`${project.name} has unsaved changes. Close it anyway?`)) return;
    closeProject(project.id);
  });
  tab.appendChild(close);

  tab.addEventListener("click", () => setActiveProject(project.id));
  tab.addEventListener("mousedown", (event) => {
    if (event.button === 1) {
      event.preventDefault();
      closeProject(project.id);
    }
  });
  return tab;
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
  setCatalogue(next);
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
initTextEditor({ onApply: (project) => document.dispatchEvent(new CustomEvent("atlas-text-applied", { detail: { project } })) });

onBottomClear((tab) => {
  const project = activeProject();
  if (project && tab === "output") project.output = [];
  render(tab, []);
});

// A new, empty app: the editors have somewhere to live before anything is
// opened from the Apps panel.
document.getElementById("app-new").addEventListener("click", () => {
  createProject({ name: `untitled-${listProjects().length + 1}` });
});

onProjectsChange(renderTabs);
render("status", [{ kind: "dim", what: "no app is running." }]);
setCount("console", 0);

// Open something straight away, for screenshots and for the live demo:
//   ?new=1     an empty project
//   ?sample=1  the Lab 4 Part II demo app, which this IDE must be able to rebuild
const query = new URLSearchParams(location.search);
if (query.has("new")) createProject({ name: "untitled-1" });
if (query.has("sample")) {
  createProject({
    name: "AirControl",
    source: [
      "RUN  AT_BoarAirSensor.Calibrate_Sensor()",
      "THEN AT_BoarAirSensor.Read_Temp(C)",
      "IF   AT_BoarAirSensor.Read_Temp(C) > 24 AND AT_BoarAirSensor.Read_Humidity() > 45",
      "DO",
      "     AT_BoarAirSensor.Fan_On(60)",
      "     AT_BoarAirSensor.Set_Window(40)",
      "ELSE",
      "     AT_BoarAirSensor.Fan_Off()",
      "END",
    ].join("\n"),
  });
}

fetch("/api/state")
  .then((response) => response.json())
  .then(applyState)
  .catch((error) => render("console", [{ kind: "error", what: `cannot reach the IDE server: ${error.message}` }]));

connect();
