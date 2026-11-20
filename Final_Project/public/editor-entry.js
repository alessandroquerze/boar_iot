// Entry point of public/vendor/editor.bundle.js: everything that has to be
// bundled — CodeMirror 6, the Lezer parser and the lang/ modules — reachable
// from the plain scripts in public/ as `window.AtlasEditor`.
//
// The rest of public/ stays dependency-free ES modules; only this file knows
// what CodeMirror looks like.

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  bracketMatching,
  syntaxHighlighting,
} from "@codemirror/language";
import { Annotation, EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { styleTags, tags } from "@lezer/highlight";

import { buildAst, callSignature, walk } from "../lang/ast.js";
import { astToGraph, graphToAst, layoutOf, parseConditionText } from "../lang/graph.js";
import { describeStatement, predicateText, printProgram } from "../lang/print.js";
import { parser } from "../lang/iot.parser.js";
import { catalogueFromSpace, validate } from "../lang/validate.js";

// --- the language -----------------------------------------------------------

const iotLanguage = LRLanguage.define({
  name: "atlas-iot",
  parser: parser.configure({
    props: [
      styleTags({
        "RUN THEN IF DO ELSE END LOOP EVERY": tags.controlKeyword,
        "AND OR": tags.logicOperator,
        ServiceName: tags.function(tags.variableName),
        ThingName: tags.namespace,
        Alias: tags.atom,
        Number: tags.number,
        Duration: tags.number,
        CompareOp: tags.compareOperator,
        LineComment: tags.lineComment,
        "( )": tags.paren,
        ",": tags.separator,
        ".": tags.derefOperator,
      }),
    ],
  }),
  languageData: { commentTokens: { line: "//" }, closeBrackets: { brackets: ["("] } },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.controlKeyword, color: "#c586c0" },
  { tag: tags.logicOperator, color: "#569cd6" },
  { tag: tags.function(tags.variableName), color: "#dcdcaa" },
  { tag: tags.namespace, color: "#4ec9b0" },
  { tag: tags.atom, color: "#569cd6" },
  { tag: tags.number, color: "#b5cea8" },
  { tag: tags.compareOperator, color: "#d4d4d4" },
  { tag: tags.lineComment, color: "#6a9955", fontStyle: "italic" },
  { tag: tags.paren, color: "#888888" },
]);

const theme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "12.5px", backgroundColor: "#1e1e1e", color: "#cccccc" },
    ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6", overflow: "auto" },
    ".cm-content": { caretColor: "#aeafad", padding: "6px 0" },
    ".cm-gutters": { backgroundColor: "#1e1e1e", color: "#6e7681", border: "none" },
    ".cm-activeLine": { backgroundColor: "#ffffff0a" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#cccccc" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "#264f78" },
    ".cm-cursor": { borderLeftColor: "#aeafad" },

    // The change highlights the prompt asks for.
    ".cm-line.cm-added": { backgroundColor: "#487e0233", boxShadow: "inset 2px 0 0 #487e02" },
    ".cm-line.cm-removed": { backgroundColor: "#6f131340", boxShadow: "inset 2px 0 0 #f14c4c" },
    ".cm-line.cm-reveal": { backgroundColor: "#ffffff14" },
    ".cm-invalid": {
      backgroundColor: "#f14c4c26",
      textDecoration: "underline wavy #f14c4c",
      textUnderlineOffset: "3px",
    },
    ".cm-warned": { textDecoration: "underline dotted #cca700", textUnderlineOffset: "3px" },
  },
  { dark: true },
);

// --- change and error marks -------------------------------------------------

const setMarks = StateEffect.define();
const fromModel = Annotation.define();

const LINE_CLASS = {
  added: Decoration.line({ class: "cm-added" }),
  removed: Decoration.line({ class: "cm-removed" }),
  reveal: Decoration.line({ class: "cm-reveal" }),
};

const RANGE_CLASS = {
  error: Decoration.mark({ class: "cm-invalid" }),
  warning: Decoration.mark({ class: "cm-warned" }),
};

const marksField = StateField.define({
  create: () => Decoration.none,
  update(marks, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setMarks)) return buildMarks(transaction.state, effect.value);
    }
    return marks.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildMarks(state, { added = [], removed = [], reveal = [], ranges = [] }) {
  const decorations = [];

  for (const [kind, lines] of [["added", added], ["removed", removed], ["reveal", reveal]]) {
    for (const line of lines) {
      if (line < 0 || line >= state.doc.lines) continue;
      decorations.push(LINE_CLASS[kind].range(state.doc.line(line + 1).from));
    }
  }

  for (const range of ranges) {
    const from = Math.max(0, Math.min(range.from, state.doc.length));
    const to = Math.max(from, Math.min(range.to, state.doc.length));
    if (to > from) decorations.push((RANGE_CLASS[range.severity] ?? RANGE_CLASS.error).range(from, to));
  }

  // Decoration.set sorts by position; line decorations must come first at the
  // same offset, which `sort: true` takes care of.
  return Decoration.set(decorations, true);
}

// --- the editor -------------------------------------------------------------

/**
 * @param {{parent: Element, doc?: string, onUserEdit?: Function, onCursorLine?: Function}} options
 */
export function createEditor({ parent, doc = "", onUserEdit, onCursorLine }) {
  let lastLine = -1;

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        bracketMatching(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        new LanguageSupport(iotLanguage),
        syntaxHighlighting(highlightStyle),
        marksField,
        theme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          // Our own updates carry an annotation; anything else is the user
          // typing, which is what locks the graphical editor.
          if (update.docChanged && !update.transactions.some((t) => t.annotation(fromModel))) {
            onUserEdit?.();
          }
          if (update.selectionSet || update.docChanged) {
            const line = update.state.doc.lineAt(update.state.selection.main.head).number - 1;
            if (line !== lastLine) {
              lastLine = line;
              onCursorLine?.(line);
            }
          }
        }),
      ],
    }),
  });

  const api = {
    view,

    getText: () => view.state.doc.toString(),

    /** Replace the whole document without it counting as a user edit. */
    setText(text, { keepCursor = true } = {}) {
      if (text === api.getText()) return;
      const head = Math.min(view.state.selection.main.head, text.length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: keepCursor ? { anchor: head } : undefined,
        annotations: fromModel.of(true),
      });
    },

    /** Empty the given lines in place, keeping the line breaks. */
    blankLines(lines) {
      const changes = lines
        .filter((line) => line >= 0 && line < view.state.doc.lines)
        .map((line) => {
          const { from, to } = view.state.doc.line(line + 1);
          return { from, to, insert: "" };
        });
      if (changes.length > 0) view.dispatch({ changes, annotations: fromModel.of(true) });
    },

    /** Drop the given lines entirely, line break included. */
    dropLines(lines) {
      const sorted = [...lines].sort((a, b) => b - a);
      const changes = sorted
        .filter((line) => line >= 0 && line < view.state.doc.lines)
        .map((line) => {
          const target = view.state.doc.line(line + 1);
          const last = line + 1 === view.state.doc.lines;
          return { from: last ? Math.max(0, target.from - 1) : target.from, to: last ? target.to : target.to + 1 };
        });
      if (changes.length > 0) view.dispatch({ changes, annotations: fromModel.of(true) });
    },

    marks(spec) {
      view.dispatch({ effects: setMarks.of(spec), annotations: fromModel.of(true) });
    },

    clearMarks() {
      api.marks({});
    },

    revealLine(line) {
      if (line < 0 || line >= view.state.doc.lines) return;
      const { from } = view.state.doc.line(line + 1);
      view.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
    },

    lineCount: () => view.state.doc.lines,
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };

  return api;
}

// What the rest of the IDE needs from lang/, re-exported so there is one copy.
export {
  astToGraph,
  buildAst,
  callSignature,
  catalogueFromSpace,
  describeStatement,
  graphToAst,
  layoutOf,
  parseConditionText,
  predicateText,
  printProgram,
  validate,
  walk,
};
