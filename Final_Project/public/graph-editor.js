// The graphical editor: a Drawflow canvas showing the AST as blocks, and the
// drop target for services dragged out of the Devices panel.
//
// Every change on the canvas rebuilds the model and re-prints the text. The
// canvas is never re-imported while the user works on it — only when a project
// is opened or when the text editor applies changes — so dragging stays smooth.

import { space } from "./main.js";
import { activeProject, reprint, setAst } from "./project.js";
import { conditionTextFor, isActionable, suggestionLabel, suggestionsFor } from "./relationship-guidance.js";
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

  hideSuggestions();
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

// The Devices panel drags two things onto the canvas: a service, which becomes
// one call, and a relationship, which becomes the whole structure it describes.
const DRAG_TYPES = ["application/atlas-service", "application/atlas-relationship"];

function initDropTarget(container) {
  container.addEventListener("dragover", (event) => {
    if (DRAG_TYPES.some((type) => event.dataTransfer.types.includes(type))) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });

  container.addEventListener("drop", (event) => {
    if (!activeProject()) return;
    const position = () => canvasPosition(event.clientX, event.clientY);

    const relationship = event.dataTransfer.getData("application/atlas-relationship");
    if (relationship) {
      event.preventDefault();
      hideSuggestions();
      dropRelationship(JSON.parse(relationship), position());
      return;
    }

    const payload = event.dataTransfer.getData("application/atlas-service");
    if (!payload) return;

    event.preventDefault();
    const { thing, service } = JSON.parse(payload);
    const nodeId = addServiceBlock(thing, service, position());

    // R3's "with the guidance of relationships": offer the edges the space says
    // belong after this service.
    showSuggestions(event, { thing, service, nodeId });
  });
}

/** Add a block for a discovered service. Used by drag-and-drop and by the panel. */
export function addServiceBlock(thing, service, position = { x: 80, y: 80 }) {
  return addBlock("service", 2, serviceData(thing, service), position);
}

function serviceData(thing, service) {
  const data = { thing: thing ?? "", service: service.name, astId: newId("c") };
  service.inputs.forEach((input, index) => {
    data[`arg${index}`] = "0";
    data[`label${index}`] = input.name;
  });
  return data;
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
  const id = createBlock(kind, outputs, data, position);

  if (tail) {
    const nodeName = nodes()[tail.nodeId]?.name;
    editor.addConnection(tail.nodeId, id, portOf(nodeName, tail.port), "input_1");
  }
  return id;
}

/** A block the caller wires up itself, instead of appending it to the program. */
function createBlock(kind, outputs, data, position) {
  return editor.addNode(kind, 1, outputs, position.x, position.y, `node-${kind}`, data, nodeHtml(kind, data), false);
}

function portOf(kind, port) {
  return `output_${(PORTS[kind] ?? []).indexOf(port) + 1}`;
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

// --- relationship guidance ---------------------------------------------------

// Dropping a service offers the relationships that start at it as one-click
// connections: an order-based one becomes a THEN edge, a condition-based one an
// IF on the service's return value. Advertised and user-defined relationships
// are treated alike, because the editor only cares what the relationship says.
let suggestions = null;

/** Where a suggested block lands, relative to the one it hangs off. */
const SUGGEST_OFFSET = { x: 270, y: 95 };

function showSuggestions(event, { thing, service, nodeId }) {
  hideSuggestions();

  const matches = suggestionsFor(space.relationships, { thing, service: service.name });
  if (matches.length === 0) return;

  const pane = document.getElementById("graph-pane");
  const rect = pane.getBoundingClientRect();

  suggestions = document.createElement("div");
  suggestions.className = "graph-suggest";
  suggestions.style.left = `${event.clientX - rect.left + 14}px`;
  suggestions.style.top = `${event.clientY - rect.top + 14}px`;

  const head = document.createElement("div");
  head.className = "graph-suggest-head";
  head.textContent = `${service.name} relates to`;

  const dismiss = document.createElement("button");
  dismiss.className = "icon-btn";
  dismiss.title = "Dismiss";
  dismiss.textContent = "×";
  dismiss.addEventListener("click", hideSuggestions);
  head.appendChild(dismiss);
  suggestions.appendChild(head);

  for (const relationship of matches) {
    const button = document.createElement("button");
    button.className = "small-btn";
    button.textContent = suggestionLabel(relationship);
    button.title = relationship.description || relationship.name;
    button.addEventListener("click", () => {
      applySuggestion(relationship, nodeId);
      hideSuggestions();
    });
    suggestions.appendChild(button);
  }

  pane.appendChild(suggestions);
}

function hideSuggestions() {
  suggestions?.remove();
  suggestions = null;
}

/**
 * A relationship dragged out of the Devices panel: its first service becomes a
 * block appended to the program, and the relationship builds the rest onto it.
 * So the drag produces the same shape as dropping the first service and then
 * taking its suggestion, in one gesture.
 */
function dropRelationship(relationship, position) {
  if (!isActionable(relationship)) return;

  const first = serviceDefinition(relationship.first);
  if (!first) return;

  const fromNodeId = addServiceBlock(relationship.first.thing, first, position);
  applySuggestion(relationship, fromNodeId);
}

function applySuggestion(relationship, fromNodeId) {
  const from = nodes()[fromNodeId];
  const second = serviceDefinition(relationship.second);
  if (!from || !second) return;

  const at = { x: from.pos_x + SUGGEST_OFFSET.x, y: from.pos_y + SUGGEST_OFFSET.y };

  if (relationship.type === "order") {
    // Type 2: the `ok` edge, which prints as THEN.
    const id = createBlock("service", 2, serviceData(relationship.second.thing, second), at);
    editor.addConnection(fromNodeId, id, portOf("service", "ok"), "input_1");
    return;
  }

  // Type 3: an IF on the first service's return value, with the second service
  // in its DO branch. The value compared against is a placeholder.
  const first = serviceDefinition(relationship.first);
  const condition = conditionTextFor(relationship, first?.inputs ?? []);
  const ifId = createBlock("condition", 3, { condition, astId: newId("if") }, at);
  editor.addConnection(fromNodeId, ifId, portOf("service", "next"), "input_1");

  const bodyId = createBlock(
    "service",
    2,
    serviceData(relationship.second.thing, second),
    { x: at.x + SUGGEST_OFFSET.x, y: at.y + SUGGEST_OFFSET.y },
  );
  editor.addConnection(ifId, bodyId, portOf("condition", "then"), "input_1");
}

/** The service one end of a relationship names, as the thing advertised it. */
function serviceDefinition(endpoint) {
  const thing = (space.things ?? []).find((candidate) => candidate.id === endpoint.thing);
  for (const entity of thing?.entities ?? []) {
    const service = entity.services.find((candidate) => candidate.name === endpoint.service);
    if (service) return service;
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
