// Validation, deliberately thin — the prompt asks for lexical and syntactic
// checks, not a compiler or a type checker. Three levels:
//
//   1. syntax      every error node Lezer produced, with its exact range
//   2. structure   the few rules the grammar cannot state (empty DO branch,
//                  an argument that is neither an integer nor C/F, …)
//   3. catalogue   warnings only: unknown service, wrong number of arguments,
//                  an unqualified call more than one thing could answer
//
// Levels 1 and 2 block "Apply Changes"; level 3 never does, because an app may
// legitimately be written before the thing that serves it has been heard from.

import { buildAst, parse, walk } from "./ast.js";

const ARG_ALIASES = ["C", "F"];

/**
 * @param {string} text
 * @param {{catalogue?: Map<string, {thing: string, inputs: number}[]>}} options
 * @returns {{errors: Diagnostic[], warnings: Diagnostic[], ast, tree}}
 */
export function validate(text, { catalogue } = {}) {
  const tree = parse(text);
  const ast = buildAst(text, tree);

  const errors = [...syntaxErrors(text, tree), ...structureErrors(text, ast)];
  errors.sort((a, b) => a.from - b.from);

  const warnings = errors.length > 0 ? [] : catalogueWarnings(text, ast, catalogue);
  return { errors, warnings, ast, tree };
}

// --- level 1: syntax --------------------------------------------------------

// What each construct is still waiting for when it ends too early. Lezer reports
// a zero-length error node at that point, which is how "unmatched delimiter"
// shows up.
const EXPECTED = {
  IfStatement: "END to close this IF",
  LoopStatement: "END to close this LOOP",
  ArgList: ") to close the argument list",
  Call: "a service call",
  Predicate: "a comparison, like > 28",
  Condition: "a condition",
  Program: "a statement",
  Block: "a command",
};

function syntaxErrors(text, tree) {
  const found = [];

  tree.iterate({
    enter(node) {
      if (!node.type.isError) return;

      const parent = node.node.parent?.name ?? "Program";
      const token = text.slice(node.from, node.to).trim();

      if (node.from === node.to) {
        // Nothing was consumed: something is missing rather than wrong.
        found.push(diagnostic(text, node.from, node.to, `missing ${EXPECTED[parent] ?? "input"}`));
      } else {
        found.push(diagnostic(text, node.from, node.to, unexpectedMessage(token)));
      }
    },
  });

  return found;
}

// Lab 4's wording for the three mistakes people actually made.
function unexpectedMessage(token) {
  const keyword = token.toUpperCase();
  if (keyword === "THEN") return '"THEN" without a matching RUN';
  if (keyword === "ELSE" || keyword === "END") return `"${keyword}" without a matching IF`;
  if (keyword === "DO") return '"DO" without a matching IF';
  return `unexpected "${token}"`;
}

// --- level 2: structure -----------------------------------------------------

function structureErrors(text, ast) {
  const found = [];

  walk(ast, (node) => {
    if (node.kind === "condition") {
      if (node.consequent.length === 0) {
        found.push(diagnostic(text, node.from, node.to, "an IF statement needs at least one command after DO"));
      }
      if (node.test.terms.length === 0) {
        found.push(diagnostic(text, node.from, node.to, "IF needs a condition"));
      }
    }

    if (node.kind === "loop") {
      if (node.body.length === 0) {
        found.push(diagnostic(text, node.from, node.to, "a LOOP needs at least one command"));
      }
      if (!(node.everySeconds > 0)) {
        found.push(diagnostic(text, node.from, node.to, "LOOP EVERY needs a positive number of seconds"));
      }
    }

    if (node.kind === "call") {
      if (node.name === "") {
        found.push(diagnostic(text, node.from, node.to, "a call needs a service name"));
      }
      for (const argument of node.args) {
        if (argument.kind === "alias" && !ARG_ALIASES.includes(argument.name.toUpperCase())) {
          found.push(
            diagnostic(
              text,
              node.from,
              node.to,
              `argument "${argument.name}" is neither an integer nor one of: ${ARG_ALIASES.join(", ")}`,
            ),
          );
        }
      }
    }
  });

  return found;
}

// --- level 3: catalogue -----------------------------------------------------

function catalogueWarnings(text, ast, catalogue) {
  if (!catalogue || catalogue.size === 0) return [];
  const found = [];

  walk(ast, (node) => {
    if (node.kind !== "call" || node.name === "") return;

    const offers = catalogue.get(node.name) ?? [];
    if (offers.length === 0) {
      found.push(warn(text, node, `no thing in the space offers "${node.name}"`));
      return;
    }

    if (node.thing) {
      const match = offers.find((offer) => offer.thing === node.thing);
      if (!match) {
        found.push(warn(text, node, `${node.thing} does not offer "${node.name}"`));
        return;
      }
      if (match.inputs !== node.args.length) {
        found.push(warn(text, node, `"${node.name}" takes ${match.inputs} argument(s), got ${node.args.length}`));
      }
      return;
    }

    if (offers.length > 1) {
      const things = offers.map((offer) => offer.thing).join(", ");
      found.push(warn(text, node, `"${node.name}" is offered by ${things} — qualify the call with a thing`));
      return;
    }
    if (offers[0].inputs !== node.args.length) {
      found.push(warn(text, node, `"${node.name}" takes ${offers[0].inputs} argument(s), got ${node.args.length}`));
    }
  });

  return found;
}

/** Index the discovered services by name, so a call can be looked up in one step. */
export function catalogueFromSpace(space) {
  const catalogue = new Map();

  for (const thing of space?.things ?? []) {
    for (const entity of thing.entities ?? []) {
      for (const service of entity.services ?? []) {
        if (!catalogue.has(service.name)) catalogue.set(service.name, []);
        catalogue.get(service.name).push({
          thing: thing.id,
          entity: entity.id,
          inputs: service.inputs?.length ?? 0,
        });
      }
    }
  }
  return catalogue;
}

// --- diagnostics ------------------------------------------------------------

function diagnostic(text, from, to, message, severity = "error") {
  const { line, column } = positionAt(text, from);
  if (to > from) return { from, to, line, column, message, severity };

  // A zero-length range cannot be highlighted. Widen it to the rest of the
  // line, or — when the error sits at the end of a line or of the program —
  // back over the line's content, so there is always something to mark red.
  const end = lineEnd(text, from);
  const start = end > from ? from : lineStart(text, from);
  return {
    from: start === end ? Math.max(0, from - 1) : start,
    to: end,
    line,
    column,
    message,
    severity,
  };
}

function warn(text, node, message) {
  return diagnostic(text, node.from ?? 0, node.to ?? 0, message, "warning");
}

export function positionAt(text, offset) {
  let line = 1;
  let lineStart = 0;

  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function lineEnd(text, offset) {
  const next = text.indexOf("\n", offset);
  return next === -1 ? text.length : next;
}

function lineStart(text, offset) {
  return text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}
