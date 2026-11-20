// The text editor pane: a CodeMirror view shared by every project, plus the
// Apply Changes / Discard protocol.
//
// Typing locks the graphical editor — the prompt asks for it to be blocked and
// blurred as soon as the user starts editing — and it stays locked until the
// text validates and is applied, or is discarded.

import { activeProject, markDirty, notifyProjectsChanged, reprint, setAst, setConsole } from "./project.js";
import { render, setCount, showTab } from "./bottom-panel.js";
import { getSetting } from "./settings.js";

const { createEditor, catalogueFromSpace, validate } = window.AtlasEditor;

let editor = null;
let current = null; // the project the view currently shows
let applyHandler = () => {};
let catalogue = new Map();
const elements = {};
// Timers of a change highlight that has not finished playing out yet.
const pending = { remove: null, fade: null };

export function initTextEditor({ onApply }) {
  applyHandler = onApply ?? (() => {});
  elements.apply = document.getElementById("text-apply");
  elements.discard = document.getElementById("text-discard");
  elements.hint = document.getElementById("text-hint");
  elements.pane = document.getElementById("graph-pane");

  editor = createEditor({
    parent: document.getElementById("editor-host"),
    onUserEdit: handleUserEdit,
    onCursorLine: handleCursorLine,
  });

  elements.apply.addEventListener("click", applyChanges);
  elements.discard.addEventListener("click", discardChanges);

  // Selecting a block on the canvas scrolls to the lines it printed.
  document.addEventListener("atlas-reveal-lines", (event) => {
    const lines = current?.lines.get(event.detail.astId);
    if (!lines?.length) return;
    editor.marks({ reveal: lines });
    editor.revealLine(lines[0]);
  });
}

export function setCatalogue(space) {
  catalogue = catalogueFromSpace(space);
  // Re-check the open project against the services that are now known.
  if (current) showDiagnostics(current, validate(editor.getText(), { catalogue }));
}

/** Show a project, or nothing when every tab is closed. */
export function showProject(project) {
  clearPending();
  current = project;
  if (!project) {
    editor.setText("");
    editor.clearMarks();
    updateToolbar();
    return;
  }

  editor.setText(project.text);
  editor.clearMarks();
  showDiagnostics(project, validate(project.text, { catalogue }));
  updateToolbar();
}

/**
 * Called by the graph side after it changed the model.
 *
 * This is the prompt's graph-to-text synchronisation. A block or connection that
 * appeared highlights its new lines green; one that disappeared turns its lines
 * red, and then the empty lines are removed. Both are computed from the AST ids
 * each line belongs to, so the marks are exact rather than guessed from a diff.
 *
 * @param {object} project
 * @param {{beforeLines?: Map<string, number[]>, addedIds?: string[], removedIds?: string[]}} change
 */
export function syncFromModel(project, change = {}) {
  if (project !== current) return;
  clearPending();

  const { beforeLines, addedIds = [], removedIds = [] } = change;
  const text = project.text;
  const addedLines = () => addedIds.flatMap((id) => project.lines.get(id) ?? []);

  if (!getSetting("highlightChanges")) {
    editor.setText(text);
    editor.clearChangeMarks();
    showDiagnostics(project, validate(text, { catalogue }));
    return;
  }

  const removedLines = removedIds.flatMap((id) => beforeLines?.get(id) ?? []);

  if (removedLines.length === 0) {
    editor.setText(text);
    showAdded(addedLines());
    showDiagnostics(project, validate(text, { catalogue }));
    return;
  }

  // Show what went away before it goes: the lines are emptied in place and
  // marked red, and only then are the empty lines taken out.
  editor.blankLines(removedLines);
  editor.marks({ removed: removedLines });

  pending.remove = setTimeout(() => {
    editor.dropLines(removedLines);
    editor.setText(text);
    showAdded(addedLines());
    showDiagnostics(project, validate(text, { catalogue }));
  }, getSetting("highlightRedMs"));
}

function showAdded(lines) {
  // Also drops the red marks: by now the lines they pointed at are gone, and a
  // leftover decoration would reattach itself to whatever moved up into them.
  editor.marks({ added: lines, removed: [], reveal: [] });
  if (lines.length === 0) return;
  pending.fade = setTimeout(() => editor.clearChangeMarks(), getSetting("highlightFadeMs"));
}

function clearPending() {
  clearTimeout(pending.remove);
  clearTimeout(pending.fade);
  pending.remove = null;
  pending.fade = null;
}

export function editorHandle() {
  return editor;
}

// --- user editing -----------------------------------------------------------

function handleUserEdit() {
  const project = current;
  if (!project) return;

  // A highlight still playing out would fight with what is being typed.
  clearPending();

  // The first keystroke locks the graph.
  if (!project.editingText) {
    project.editingText = true;
    notifyProjectsChanged();
  }
  markDirty(project, true);

  showDiagnostics(project, validate(editor.getText(), { catalogue }));
  updateToolbar();
}

function handleCursorLine(line) {
  if (!current || current.editingText) return;
  const id = current.owners.get(line);
  if (id) document.dispatchEvent(new CustomEvent("atlas-reveal-node", { detail: { id } }));
}

// --- apply and discard ------------------------------------------------------

function applyChanges() {
  const project = current;
  if (!project) return;

  const text = editor.getText();
  const result = validate(text, { catalogue });
  showDiagnostics(project, result);

  if (result.errors.length > 0) {
    // Nothing is applied: the graph stays locked and the errors stay on screen.
    showTab("console");
    setHint(`${result.errors.length} error${result.errors.length === 1 ? "" : "s"} — nothing applied`, "error");
    return;
  }

  setAst(project, result.ast);
  // Printing normalises spacing, so show the text the model actually holds.
  editor.setText(project.text);
  project.editingText = false;
  applyHandler(project);
  setHint("applied to the graph", "ok");
  updateToolbar();
  notifyProjectsChanged();
}

function discardChanges() {
  const project = current;
  if (!project) return;

  reprint(project);
  editor.setText(project.text);
  editor.clearMarks();
  project.editingText = false;
  markDirty(project, true);
  showDiagnostics(project, validate(project.text, { catalogue }));
  setHint("changes discarded", "");
  updateToolbar();
  notifyProjectsChanged();
}

// --- diagnostics ------------------------------------------------------------

function showDiagnostics(project, result) {
  const all = [...result.errors, ...result.warnings];

  editor.marks({
    ranges: all.map(({ from, to, severity }) => ({ from, to, severity })),
  });

  const lines = all.map((item) => ({
    kind: item.severity === "warning" ? "warn" : "error",
    where: `${item.line}:${item.column}`,
    what: item.message,
    reveal: () => editor.revealLine(item.line - 1),
  }));

  setConsole(
    project,
    lines.length > 0 ? lines : [{ kind: "dim", what: "no problems found." }],
  );
  if (project === current) {
    render("console", project.console);
    setCount("console", result.errors.length, "error");
  }
}

// --- toolbar ----------------------------------------------------------------

function updateToolbar() {
  const project = current;
  const editing = Boolean(project?.editingText);

  elements.apply.disabled = !editing;
  elements.discard.disabled = !editing;
  // The graphical editor reads this attribute to block and blur itself.
  elements.pane.dataset.locked = String(editing);

  if (!project) setHint("");
  else if (editing) setHint("the graph is locked while you edit — apply or discard", "");
}

function setHint(text, kind = "") {
  elements.hint.textContent = text;
  elements.hint.dataset.kind = kind;
}
