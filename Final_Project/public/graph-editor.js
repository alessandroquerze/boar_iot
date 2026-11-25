// The graphical editor: a Drawflow canvas showing the AST as blocks, and the
// drop target for services dragged out of the Devices panel.
//
// Every change on the canvas rebuilds the model and re-prints the text. The
// canvas is never re-imported while the user works on it — only when a project
// is opened or when the text editor applies changes — so dragging stays smooth.

import { space } from "./main.js";
import { activeProject, reprint, setAst } from "./project.js";
import { syncFromModel } from "./text-editor.js";

const { PORTS, astToGraph, buildAst, graphToAst, layoutOf, printProgram, tailOf } = window.AtlasEditor;

let editor = null;
let suspended = false; // true while we are the ones changing the canvas
let onModelChange = () => {};

const CHANGE_EVENTS = [
  "nodeCreated",
  "nodeRemoved",
  "connectionCreated",
  "connectionRemoved",
  "nodeDataChanged",
];

export function initGraphEditor({ onChange }) {
  onModelChange = onChange ?? (() => {});

  const container = document.getElementById("drawflow");
  editor = new window.Drawflow(container);
  editor.reroute = true;
  editor.editor_mode = "edit";
  editor.start();

  for (const event of CHANGE_EVENTS) {
    editor.on(event, () => {
      if (!suspended) handleCanvasChange();
    });
  }
  editor.on("nodeMoved", () => {
    if (!suspended) rememberLayout();
  });

  // Selecting a block scrolls the text to the lines it printed.
  editor.on("nodeSelected", (id) => {
    const astId = nodes()[id]?.data?.astId;
    if (astId) document.dispatchEvent(new CustomEvent("atlas-reveal-lines", { detail: { astId } }));
  });

  initDropTarget(container);
  initToolbar();

  // Clicking a line in the text editor outlines the block it belongs to.
  document.addEventListener("atlas-reveal-node", (event) => revealNode(event.detail.id));
}

// --- showing a project ------------------------------------------------------

export function showProjectGraph(project) {
  if (!editor) return;

  suspended = true;
  if (!project) {
    editor.clear();
  } else {
    editor.import(decorate(astToGraph(project.ast, { layout: project.layout })));
  }
  suspended = false;
}

/** Called after the text editor applied changes: rebuild the canvas from the model. */
export function reloadFromModel(project) {
  showProjectGraph(project);
}

// Drawflow renders node.html as-is; lang/graph.js stays free of presentation,
// so the markup is filled in here.
function decorate(graph) {
  for (const node of Object.values(graph.drawflow.Home.data)) {
    node.html = nodeHtml(node.name, node.data);
  }
  return graph;
}

// --- reacting to the canvas -------------------------------------------------

// One user action can make Drawflow fire several events — deleting a block
// also removes its connections — so a burst is collapsed into a single model
// update. Otherwise the second event would re-print the text and cut the change
// highlight of the first one short.
let burst = null;

function handleCanvasChange() {
  const project = activeProject();
  if (!project) return;

  // Which ids were on screen before the change, and on which lines: that is
  // what tells the text editor which lines to green and which to red.
  if (!burst || burst.project !== project) burst = { project, beforeLines: project.lines, timer: null };
  clearTimeout(burst.timer);
  burst.timer = setTimeout(flushCanvasChange, 0);
}

function flushCanvasChange() {
  const { project, beforeLines } = burst;
  burst = null;

  setAst(project, modelFromCanvas());
  rememberLayout();

  const after = new Set(project.lines.keys());
  onModelChange(project, {
    beforeLines,
    addedIds: [...after].filter((id) => !beforeLines.has(id)),
    removedIds: [...beforeLines.keys()].filter((id) => !after.has(id)),
  });
}

/**
 * Read the canvas back into an AST whose ids are derived from the program text,
 * the same way the text editor derives them. Printing is stable, so the two
 * printings agree line by line, which is how each block learns its new id —
 * without re-importing the canvas and interrupting the user.
 */
function modelFromCanvas() {
  const rawAst = graphToAst(editor.export());
  const rawPrint = printProgram(rawAst);
  const canonicalAst = buildAst(rawPrint.text);
  const canonicalPrint = printProgram(canonicalAst);

  const renamed = new Map();
  for (const [line, rawId] of rawPrint.owners) {
    const canonicalId = canonicalPrint.owners.get(line);
    if (canonicalId) renamed.set(rawId, canonicalId);
  }

  for (const node of Object.values(nodes())) {
    const mapped = renamed.get(node.data.astId);
    if (mapped) node.data.astId = mapped;
  }
  return canonicalAst;
}

function rememberLayout() {
  const project = activeProject();
  if (project) project.layout = { ...project.layout, ...layoutOf(editor.export()) };
}

function nodes() {
  return editor.drawflow.drawflow.Home.data;
}

// --- adding blocks ----------------------------------------------------------

function initDropTarget(container) {
  container.addEventListener("dragover", (event) => {
    if (event.dataTransfer.types.includes("application/atlas-service")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });

  container.addEventListener("drop", (event) => {
    const payload = event.dataTransfer.getData("application/atlas-service");
    if (!payload || !activeProject()) return;

    event.preventDefault();
    const { thing, service } = JSON.parse(payload);
    addServiceBlock(thing, service, canvasPosition(event.clientX, event.clientY));
  });
}

/** Add a block for a discovered service. Used by drag-and-drop and by the panel. */
export function addServiceBlock(thing, service, position = { x: 80, y: 80 }) {
  const data = { thing: thing ?? "", service: service.name, astId: newId("c") };
  service.inputs.forEach((input, index) => {
    data[`arg${index}`] = "0";
    data[`label${index}`] = input.name;
  });

  addBlock("service", 2, data, position);
}

export function addControlBlock(kind) {
  if (!activeProject()) return;

  const data =
    kind === "condition"
      ? { condition: "Read_Temp(C) > 25", astId: newId("if") }
      : { every: "10", astId: newId("lp") };

  addBlock(kind, kind === "condition" ? 3 : 1, data, { x: 90, y: 90 });
}

// A block that nothing leads to is not part of the program, so a new one is
// appended to the end of what is already there. The user can always re-wire it.
function addBlock(kind, outputs, data, position) {
  const tail = tailOf(editor.export());
  const id = editor.addNode(kind, 1, outputs, position.x, position.y, `node-${kind}`, data, nodeHtml(kind, data), false);

  if (tail) {
    const nodeName = nodes()[tail.nodeId]?.name;
    const port = `output_${(PORTS[nodeName] ?? []).indexOf(tail.port) + 1}`;
    editor.addConnection(tail.nodeId, id, port, "input_1");
  }
  return id;
}

/** A placeholder id until the next re-print derives one from the program text. */
function newId(prefix) {
  return `${prefix}:new${(Math.random() * 1e6) | 0}#0`;
}

// Drawflow's own recipe for turning a page position into a canvas position.
function canvasPosition(clientX, clientY) {
  const canvas = editor.precanvas;
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.clientWidth / (canvas.clientWidth * editor.zoom);

  return { x: clientX * scale - rect.x * scale, y: clientY * scale - rect.y * scale };
}

// --- block markup -----------------------------------------------------------

function nodeHtml(kind, data) {
  if (kind === "start") {
    return '<div class="nb"><div class="nb-title">start</div></div>';
  }

  if (kind === "service") {
    const rows = [];
    for (let index = 0; `arg${index}` in data; index++) {
      const label = data[`label${index}`] ?? inputName(data.service, index) ?? `arg ${index + 1}`;
      rows.push(
        `<div class="nb-row"><label>${escape(label)}</label>` +
          `<input class="nb-input" df-arg${index} spellcheck="false" /></div>`,
      );
    }
    return (
      '<div class="nb">' +
      `<div class="nb-head">${escape(data.thing || "any thing")}</div>` +
      `<div class="nb-title">${escape(data.service)}</div>` +
      rows.join("") +
      "</div>"
    );
  }

  if (kind === "condition") {
    return (
      '<div class="nb">' +
      '<div class="nb-head">if</div>' +
      '<input class="nb-input nb-wide" df-condition spellcheck="false" />' +
      "</div>"
    );
  }

  return (
    '<div class="nb">' +
    '<div class="nb-head">loop every</div>' +
    '<div class="nb-row"><input class="nb-input nb-narrow" df-every spellcheck="false" /><span>seconds</span></div>' +
    "</div>"
  );
}

/** The argument's name as the thing advertised it, for the block's labels. */
function inputName(serviceName, index) {
  for (const thing of space.things ?? []) {
    for (const entity of thing.entities) {
      const service = entity.services.find((candidate) => candidate.name === serviceName);
      if (service) return service.inputs[index]?.name;
    }
  }
  return null;
}

function escape(text) {
  return String(text).replace(/[<>&"]/g, (character) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[character],
  );
}

// --- toolbar and selection --------------------------------------------------

function initToolbar() {
  document.getElementById("graph-zoom-in").addEventListener("click", () => editor.zoom_in());
  document.getElementById("graph-zoom-out").addEventListener("click", () => editor.zoom_out());
  document.getElementById("graph-zoom-reset").addEventListener("click", () => editor.zoom_reset());

  // "Clear" is requirement 3's clear operation: empty the editor, keeping the
  // start block so the app still has a beginning.
  document.getElementById("graph-clear").addEventListener("click", () => {
    const project = activeProject();
    if (!project || !confirm("Clear the editor? The app will be empty.")) return;

    suspended = true;
    project.layout = {};
    setAst(project, buildAst(""));
    editor.import(decorate(astToGraph(project.ast)));
    suspended = false;
    reprint(project);
    syncFromModel(project);
    onModelChange(project, { beforeLines: new Map(), addedIds: [], removedIds: [] });
  });
}

function revealNode(astId) {
  for (const [id, node] of Object.entries(nodes())) {
    const element = document.getElementById(`node-${id}`);
    element?.classList.toggle("revealed", node.data.astId === astId);
  }
}
