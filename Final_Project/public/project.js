// An open project: one app, with its own AST, editor states, console and lock
// flags. Several can be open at once — like a VS Code multi-root workspace —
// and nothing here is global, so switching tabs swaps a whole project in.
//
// The AST is the source of truth; the text and the graph are both views of it.

const { buildAst, printProgram } = window.AtlasEditor;

let nextId = 1;
const projects = [];
let activeId = null;
const listeners = new Set();

export function onProjectsChange(handler) {
  listeners.add(handler);
  handler();
}

export function notifyProjectsChanged() {
  for (const handler of listeners) handler();
}

export function listProjects() {
  return projects;
}

export function activeProject() {
  return projects.find((project) => project.id === activeId) ?? null;
}

export function findProjectByPath(path) {
  return projects.find((project) => project.path === path) ?? null;
}

/**
 * @param {{name?: string, path?: string|null, source?: string, layout?: object,
 *          finalized?: boolean}} options
 */
export function createProject({ name = "untitled", path = null, source = "", layout = {}, finalized = false } = {}) {
  const project = {
    id: `p${nextId++}`,
    name,
    path,
    finalized,
    // The model, and the text last printed from it.
    ast: buildAst(source),
    text: "",
    lines: new Map(),
    owners: new Map(),
    // Canvas positions by node id, kept across reloads in the .iot file.
    layout: { ...layout },
    // Set while the user is editing the text: the graph stays locked until the
    // changes are applied or discarded.
    editingText: false,
    // This project's CodeMirror state, kept while another tab is in front.
    editorState: null,
    dirty: false,
    savedText: "",
    console: [],
    output: [],
    run: null,
  };

  reprint(project);
  project.savedText = project.text;
  projects.push(project);
  activeId = project.id;
  notifyProjectsChanged();
  return project;
}

export function closeProject(id) {
  const index = projects.findIndex((project) => project.id === id);
  if (index === -1) return;

  projects.splice(index, 1);
  if (activeId === id) activeId = projects[Math.min(index, projects.length - 1)]?.id ?? null;
  notifyProjectsChanged();
}

export function setActiveProject(id) {
  if (activeId === id) return;
  activeId = id;
  notifyProjectsChanged();
}

/** Re-print the AST and refresh the id → line maps the two editors share. */
export function reprint(project) {
  const printed = printProgram(project.ast);
  project.text = printed.text;
  project.lines = printed.lines;
  project.owners = printed.owners;
  return printed;
}

/** Replace the model, from either editor, and recompute everything derived. */
export function setAst(project, ast) {
  project.ast = ast;
  const before = project.text;
  reprint(project);
  if (project.text !== before) markDirty(project, project.text !== project.savedText);
  return project.text;
}

/**
 * Mark a project as having changes that are not on disk. Typing counts even
 * before the changes are applied, so the tab's dot appears straight away.
 */
export function markDirty(project, dirty = true) {
  if (project.dirty === dirty) return;
  project.dirty = dirty;
  notifyProjectsChanged();
}

export function markSaved(project) {
  project.savedText = project.text;
  project.dirty = false;
  notifyProjectsChanged();
}

/** Each project keeps its own console, so switching tabs switches the errors. */
export function setConsole(project, lines) {
  project.console = lines;
}

export function appendOutput(project, line) {
  project.output.push(line);
  if (project.output.length > 500) project.output.shift();
}
