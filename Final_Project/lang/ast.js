// Lezer tree -> AST. The AST is the single source of truth both editors are
// views of, so every node carries a stable id: the graphical editor keys its
// blocks on it, the printer records which lines each id produced, and the
// green/red change highlights are computed by comparing id sets.
//
// An id is derived from the node's *own* text, not its children's, so editing a
// call inside an IF leaves the IF's id — and therefore its position on the
// canvas and its highlighting — untouched.

import { parser } from "./iot.parser.js";

export function parse(text) {
  return parser.parse(text);
}

/**
 * Build the AST of `text`. Error nodes are skipped; validate.js reports them.
 * @returns {{kind: "program", body: Statement[]}}
 */
export function buildAst(text, tree = parse(text)) {
  const context = { text, counts: new Map() };
  return { kind: "program", body: buildBlock(tree.topNode, context, false) };
}

// --- identity ---------------------------------------------------------------

// FNV-1a, shortened. Not a security hash: it only has to be stable and short.
function hash(string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < string.length; i++) {
    h = ((h ^ string.charCodeAt(i)) * 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, "0").slice(-6);
}

// Two identical statements are told apart by how many came before, so a program
// may repeat a call without its blocks sharing an id.
function idFor(prefix, own, context) {
  const base = `${prefix}:${hash(own)}`;
  const seen = context.counts.get(base) ?? 0;
  context.counts.set(base, seen + 1);
  return `${base}#${seen}`;
}

// --- tree walking -----------------------------------------------------------

const STATEMENTS = new Set(["RunStatement", "IfStatement", "LoopStatement", "CallStatement"]);

function textOf(node, context) {
  return context.text.slice(node.from, node.to);
}

function children(node, name) {
  const found = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) found.push(child);
  }
  return found;
}

function buildBlock(node, context, bare) {
  const statements = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (STATEMENTS.has(child.name)) statements.push(buildStatement(child, context, bare));
  }
  return statements;
}

function buildStatement(node, context, bare) {
  const span = { from: node.from, to: node.to };

  if (node.name === "RunStatement" || node.name === "CallStatement") {
    const calls = children(node, "Call").map((call) => buildCall(call, context));
    return {
      id: idFor("ord", calls[0] ? callSignature(calls[0]) : textOf(node, context), context),
      kind: "order",
      // Whether RUN was written. Kept so printing a program the user typed gives
      // back what they typed, instead of a spurious one-word diff.
      bare: node.name === "CallStatement",
      calls,
      ...span,
    };
  }

  if (node.name === "IfStatement") {
    const condition = node.getChild("Condition");
    const blocks = children(node, "Block");
    return {
      id: idFor("if", condition ? textOf(condition, context) : "", context),
      kind: "condition",
      test: condition ? buildCondition(condition, context) : { kind: "or", terms: [] },
      consequent: blocks[0] ? buildBlock(blocks[0], context, true) : [],
      alternative: blocks[1] ? buildBlock(blocks[1], context, true) : [],
      ...span,
    };
  }

  if (node.name === "LoopStatement") {
    const duration = node.getChild("Duration");
    const body = children(node, "Block")[0];
    const everySeconds = duration ? parseInt(textOf(duration, context), 10) : 0;
    return {
      id: idFor("lp", `every ${everySeconds}`, context),
      kind: "loop",
      everySeconds,
      body: body ? buildBlock(body, context, true) : [],
      ...span,
    };
  }

  throw new Error(`not a statement: ${node.name}`);
}

// A condition is stored as an OR of ANDs, so the evaluator only ever walks two
// levels. AND binds tighter than OR, and there are no parentheses.
function buildCondition(node, context) {
  const orTerms = [];
  let andTerms = [];
  let pendingOr = false;

  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "Predicate") {
      if (pendingOr && andTerms.length > 0) {
        orTerms.push({ kind: "and", terms: andTerms });
        andTerms = [];
      }
      pendingOr = false;
      andTerms.push(buildPredicate(child, context));
    } else if (child.name === "LogicOp") {
      pendingOr = textOf(child, context).toUpperCase() === "OR";
    }
  }

  if (andTerms.length > 0) orTerms.push({ kind: "and", terms: andTerms });
  return { kind: "or", terms: orTerms };
}

function buildPredicate(node, context) {
  const call = node.getChild("Call");
  const operator = node.getChild("CompareOp");
  const value = node.getChild("Number");

  return {
    id: idFor("p", textOf(node, context).replace(/\s+/g, " "), context),
    kind: "predicate",
    call: call ? buildCall(call, context) : null,
    op: operator ? textOf(operator, context) : ">",
    value: value ? parseInt(textOf(value, context), 10) : 0,
    from: node.from,
    to: node.to,
  };
}

function buildCall(node, context) {
  const thing = node.getChild("ThingName");
  const name = node.getChild("ServiceName");
  const list = node.getChild("ArgList");

  const call = {
    id: "",
    kind: "call",
    thing: thing ? textOf(thing, context) : null,
    name: name ? textOf(name, context) : "",
    args: list ? children(list, "Argument").map((arg) => buildArgument(arg, context)) : [],
    from: node.from,
    to: node.to,
  };
  call.id = idFor("c", callSignature(call), context);
  return call;
}

function buildArgument(node, context) {
  const number = node.getChild("Number");
  if (number) return { kind: "number", value: parseInt(textOf(number, context), 10) };

  const alias = node.getChild("Alias");
  return { kind: "alias", name: alias ? textOf(alias, context) : "" };
}

// --- shared helpers ---------------------------------------------------------

/** `thing.Service(a, b)` — the canonical text of a call, used for ids and printing. */
export function callSignature(call) {
  const args = call.args.map(argumentText).join(", ");
  return `${call.thing ? `${call.thing}.` : ""}${call.name}(${args})`;
}

export function argumentText(argument) {
  return argument.kind === "number" ? String(argument.value) : argument.name;
}

/** Depth-first walk over every statement, predicate and call in the tree. */
export function walk(ast, visit) {
  const visitStatements = (statements) => {
    for (const statement of statements) {
      visit(statement);
      if (statement.kind === "order") statement.calls.forEach(visit);
      if (statement.kind === "loop") visitStatements(statement.body);
      if (statement.kind === "condition") {
        for (const andTerm of statement.test.terms) {
          for (const predicate of andTerm.terms) {
            visit(predicate);
            if (predicate.call) visit(predicate.call);
          }
        }
        visitStatements(statement.consequent);
        visitStatements(statement.alternative);
      }
    }
  };
  visitStatements(ast.body);
}
