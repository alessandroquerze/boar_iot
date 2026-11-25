// The Apps side panel: the apps found in the Atlas working directory.
//
// Double-clicking one opens it in both editors — the guidelines' UPLOAD APP.
// Saving (the menu bar's `save`) and deleting both go through
// here, because an app is a file and the server owns the files.

import { render } from "./bottom-panel.js";
import {
  activeProject,
  closeProject,
  createProject,
  findProjectByPath,
  markSaved,
  onProjectsChange,
  setActiveProject,
} from "./project.js";

let apps = [];
let selected = null;
let runs = [];

export function initAppsPanel() {
  onProjectsChange(renderApps);
  refresh();
}

export async function refresh() {
  try {
    apps = await (await fetch("/api/apps")).json();
  } catch {
    apps = [];
  }
  renderApps();
}

/** Called when the server pushes a new app list or run status. */
export function setApps(list) {
  apps = list;
  renderApps();
}

export function setRuns(list) {
  runs = list;
  renderApps();
}

function renderApps() {
  const host = document.getElementById("apps-list");
  host.replaceChildren();

  if (apps.length === 0) {
    host.appendChild(note("no apps yet — press + to start one."));
  } else {
    for (const app of apps) host.appendChild(appRow(app));
  }
}

function appRow(app) {
  const row = document.createElement("div");
  row.className = "row";
  row.setAttribute("aria-selected", String(selected === app.file));
  row.title = app.file;

  const name = document.createElement("span");
  name.className = "name mono";
  name.textContent = app.name;
  row.appendChild(name);

  const run = runs.find((candidate) => candidate.file === app.file);
  if (run) row.appendChild(badge(run.status.toLowerCase(), run.status === "Active" ? "active" : "completed"));

  row.addEventListener("click", () => {
    selected = app.file;
    renderApps();
  });
  row.addEventListener("dblclick", () => openApp(app.file));
  return row;
}

// --- opening ----------------------------------------------------------------

/** UPLOAD APP: load the file into a project and show it in both editors. */
export async function openApp(file) {
  const already = findProjectByPath(file);
  if (already) return setActiveProject(already.id);

  const response = await fetch(`/api/apps/${encodeURIComponent(file)}`);
  if (!response.ok) {
    render("console", [{ kind: "error", what: `cannot open ${file}` }]);
    return;
  }

  const app = await response.json();
  const project = createProject({
    name: app.name,
    path: app.file,
    source: app.source ?? "",
    layout: app.layout ?? {},
  });
  markSaved(project);
}

// --- saving -----------------------------------------------------------------

/**
 * SAVE APP. A project that has never been saved is asked for a name; one that
 * has a file is overwritten silently, so saving repeatedly is cheap.
 */
export async function saveActive() {
  const project = activeProject();
  if (!project) return null;

  let file = project.path;
  if (!file) {
    const typed = prompt("Save app as (the IDE adds .iot):", project.name);
    if (typed === null) return null;
    file = typed.trim();
    // Apps live only in the working directory, so a path is refused up front
    // and the save is dropped exactly as if Cancel had been pressed.
    if (/[\/\\]/.test(file)) {
      alert("The app was NOT saved: only a name is allowed, not a path.");
      return null;
    }
  }

  const response = await fetch(`/api/apps/${encodeURIComponent(file)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: project.text, layout: project.layout }),
  });

  const result = await response.json();
  if (!response.ok) {
    render("console", [{ kind: "error", what: result.error ?? "could not save the app" }]);
    return null;
  }

  project.path = result.file;
  project.name = result.name;
  markSaved(project);
  await refresh();
  return result;
}

// --- deleting ---------------------------------------------------------------

/** DELETE: remove the app from the IDE and from the working directory. */
export async function deleteActive() {
  const project = activeProject();
  const file = project?.path ?? selected;
  if (!file) {
    render("console", [{ kind: "error", what: "save the app before deleting it." }]);
    return;
  }

  if (runs.some((run) => run.file === file && run.status === "Active")) {
    render("console", [{ kind: "error", what: `${file} is running — stop it first.` }]);
    return;
  }

  if (!confirm(`Delete ${file}? This removes the file from the working directory.`)) return;

  await fetch(`/api/apps/${encodeURIComponent(file)}`, { method: "DELETE" });
  const open = findProjectByPath(file);
  if (open) closeProject(open.id);
  if (selected === file) selected = null;
  await refresh();
}

// --- small builders ---------------------------------------------------------

function badge(text, kind) {
  const element = document.createElement("span");
  element.className = "badge";
  if (kind) element.dataset.kind = kind;
  element.textContent = text;
  return element;
}

function note(text) {
  const element = document.createElement("div");
  element.className = "empty-note";
  element.textContent = text;
  return element;
}
