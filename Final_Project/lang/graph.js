// AST <-> Drawflow graph, both ways.
//
// The three app types map onto three kinds of block and the edges between them:
//
//   start      ──next──▶  where the app begins
//   service    ──next──▶  the statement after this one      (type 1, a sequence)
//              ──ok────▶  run only if this call succeeded   (type 2, order-based)
//   condition  ──then──▶  the DO branch                     (type 3, condition-based)
//              ──else──▶  the ELSE branch
//              ──next──▶  the statement after END
//   loop       ──body──▶  the body
//
// Every block but a loop has a `next`, so the three types compose: anything can
// follow anything, which is the "sequential operator and grouping delimiters" the
// assignment asks for. A loop runs until the app is stopped, so nothing follows it.

import { argumentText, buildAst, parse } from "./ast.js";
import { conditionText } from "./print.js";

/** Output ports of each kind of block, in the order Drawflow numbers them. */
export const PORTS = {
  start: ["next"],
  service: ["next", "ok"],
  condition: ["then", "else", "next"],
  loop: ["body"],
};

const COLUMN_WIDTH = 270;
const ROW_HEIGHT = 95;

// --- AST -> graph -----------------------------------------------------------

/**
 * @param {object} ast
 * @param {{layout?: Record<string, {x: number, y: number}>}} options
 * @returns {{drawflow: {Home: {data: object}}}} a Drawflow export object
 */
export function astToGraph(ast, { layout = {} } = {}) {
  const context = { nodes: {}, nextId: 1, layout, row: 0 };

  const start = addNode(context, "start", { label: "start" }, "start", 0);
  const block = buildBlock(ast.body, context, 0);
  if (block.entry) connect(context, start.id, "next", block.entry);

  return { drawflow: { Home: { data: context.nodes } } };
}

function buildBlock(statements, context, depth) {
  let entry = null;
  let previous = null;

  for (const statement of statements) {
    const built = buildStatement(statement, context, depth);
    if (!entry) entry = built.entry;
    if (previous) connect(context, previous.id, previous.port, built.entry);
    previous = built.exit;
  }
  return { entry, exit: previous };
}

function buildStatement(statement, context, depth) {
  if (statement.kind === "order") {
    let entry = null;
    let previous = null;

    for (const call of statement.calls) {
      const node = addNode(context, "service", callData(call), call.id, depth);
      if (!entry) entry = node.id;
      // Inside a chain, each call runs only if the one before succeeded.
      if (previous) connect(context, previous, "ok", node.id);
      previous = node.id;
    }
    return { entry, exit: { id: previous, port: "next" } };
  }

  if (statement.kind === "condition") {
    const node = addNode(
      context,
      "condition",
      { condition: conditionText(statement.test) },
      statement.id,
      depth,
    );
    const consequent = buildBlock(statement.consequent, context, depth + 1);
    const alternative = buildBlock(statement.alternative, context, depth + 1);
    if (consequent.entry) connect(context, node.id, "then", consequent.entry);
    if (alternative.entry) connect(context, node.id, "else", alternative.entry);
    return { entry: node.id, exit: { id: node.id, port: "next" } };
  }

  // loop
  const node = addNode(context, "loop", { every: String(statement.everySeconds) }, statement.id, depth);
  const body = buildBlock(statement.body, context, depth + 1);
  if (body.entry) connect(context, node.id, "body", body.entry);
  // No exit: a loop has no `next`, so nothing is chained after it.
  return { entry: node.id, exit: null };
}

function callData(call) {
  const data = { thing: call.thing ?? "", service: call.name };
  call.args.forEach((argument, index) => {
    data[`arg${index}`] = argumentText(argument);
  });
  return data;
}

function addNode(context, kind, data, astId, depth) {
  const id = context.nextId++;
  const position = context.layout[astId] ?? autoPosition(context, depth);

  context.nodes[id] = {
    id,
    name: kind,
    data: { ...data, astId },
    class: `node-${kind}`,
    html: kind,
    typenode: false,
    inputs: kind === "start" ? {} : { input_1: { connections: [] } },
    outputs: Object.fromEntries(PORTS[kind].map((_, index) => [`output_${index + 1}`, { connections: [] }])),
    pos_x: position.x,
    pos_y: position.y,
  };
  return context.nodes[id];
}

// Blocks are laid out in the order they are printed: one row down for each
// block, one column right for each level of nesting. The canvas then reads
// top-to-bottom like the text beside it, before anything is dragged.
function autoPosition(context, depth) {
  const row = context.row++;
  return { x: 60 + depth * COLUMN_WIDTH, y: 40 + row * ROW_HEIGHT };
}

function connect(context, fromId, port, toId) {
  const from = context.nodes[fromId];
  const to = context.nodes[toId];
  if (!from || !to) return;

  const output = `output_${PORTS[from.name].indexOf(port) + 1}`;
  from.outputs[output].connections.push({ node: String(toId), output: "input_1" });
  to.inputs.input_1.connections.push({ node: String(fromId), input: output });
}

// --- graph -> AST -----------------------------------------------------------

/** Rebuild the AST from what is on the canvas. Unreachable blocks are dropped. */
export function graphToAst(graph) {
  const nodes = graph?.drawflow?.Home?.data ?? {};
  const start = Object.values(nodes).find((node) => node.name === "start");
  if (!start) return { kind: "program", body: [] };

  return { kind: "program", body: readChain(nodes, start, "next", new Set(), 0) };
}

/** Where every block ended up, keyed by AST id, so a reload keeps the layout. */
export function layoutOf(graph) {
  const nodes = graph?.drawflow?.Home?.data ?? {};
  const layout = {};

  for (const node of Object.values(nodes)) {
    if (node.data?.astId) layout[node.data.astId] = { x: node.pos_x, y: node.pos_y };
  }
  return layout;
}

/**
 * The free port at the end of the program, where a newly added block belongs.
 * Returns the start block itself for an empty program, and null when the program
 * ends with a loop: a loop has no `next`, so the new block is left unconnected.
 * @returns {{nodeId: string, port: string}|null}
 */
export function tailOf(graph) {
  const nodes = graph?.drawflow?.Home?.data ?? {};
  let node = Object.values(nodes).find((candidate) => candidate.name === "start");
  if (!node) return null;

  const seen = new Set();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);

    // A THEN chain hangs off `ok`; the sequence continues after its last call.
    let last = node;
    while (last.name === "service") {
      const chained = follow(nodes, last, "ok");
      if (!chained || seen.has(chained.id)) break;
      seen.add(chained.id);
      last = chained;
    }

    if (last.name === "loop") return null;
    const next = follow(nodes, last, "next");
    if (!next) return { nodeId: String(last.id), port: "next" };
    node = next;
  }
  return null;
}

function readChain(nodes, from, port, visited, depth) {
  const statements = [];
  let node = follow(nodes, from, port);

  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    const { statement, last } = readStatement(nodes, node, visited, depth);
    if (statement) statements.push(statement);
    // The sequence continues from the end of what was just read: for a THEN
    // chain that is its last call, not the block the chain started at.
    node = follow(nodes, last, "next");
  }
  return statements;
}

function readStatement(nodes, node, visited, depth) {
  if (node.name === "service") {
    const calls = [readCall(node)];
    let last = node;

    // An `ok` edge is a THEN: keep walking while they chain.
    let next = follow(nodes, node, "ok");
    while (next && next.name === "service" && !visited.has(next.id)) {
      visited.add(next.id);
      calls.push(readCall(next));
      last = next;
      next = follow(nodes, next, "ok");
    }
    // A bare call is how a command inside a branch is written.
    return { statement: { kind: "order", bare: depth > 0 && calls.length === 1, calls }, last };
  }

  if (node.name === "condition") {
    return {
      statement: {
        id: node.data.astId,
        kind: "condition",
        test: parseConditionText(node.data.condition ?? ""),
        consequent: readChain(nodes, node, "then", visited, depth + 1),
        alternative: readChain(nodes, node, "else", visited, depth + 1),
      },
      last: node,
    };
  }

  if (node.name === "loop") {
    return {
      statement: {
        id: node.data.astId,
        kind: "loop",
        everySeconds: Number(node.data.every) || 0,
        body: readChain(nodes, node, "body", visited, depth + 1),
      },
      last: node,
    };
  }

  return { statement: null, last: node };
}

function readCall(node) {
  const args = [];
  for (let index = 0; `arg${index}` in node.data; index++) {
    const raw = String(node.data[`arg${index}`] ?? "").trim();
    if (raw === "") continue;
    args.push(/^-?\d+$/.test(raw) ? { kind: "number", value: parseInt(raw, 10) } : { kind: "alias", name: raw });
  }

  return {
    id: node.data.astId,
    kind: "call",
    thing: node.data.thing || null,
    name: node.data.service ?? "",
    args,
  };
}

function follow(nodes, node, port) {
  const index = PORTS[node.name]?.indexOf(port) ?? -1;
  if (index === -1) return null;

  const connection = node.outputs?.[`output_${index + 1}`]?.connections?.[0];
  return connection ? nodes[connection.node] ?? null : null;
}

/**
 * A condition block holds its condition as text, which keeps AND, OR and nesting
 * available without a sub-editor. It is parsed with the same grammar, by reading
 * it back as a complete IF.
 */
export function parseConditionText(text) {
  // Read it back as a complete IF with an empty body. The body has to stay
  // empty: given a malformed condition, Lezer's error recovery would otherwise
  // take whatever stands in the body for part of the condition.
  const source = `IF ${text}\nDO\nEND`;
  const tree = parse(source);

  let wellFormed = true;
  tree.iterate({
    enter(node) {
      if (node.type.isError) wellFormed = false;
    },
  });
  if (!wellFormed) return { kind: "or", terms: [] };

  const statement = buildAst(source, tree).body[0];
  return statement?.kind === "condition" ? statement.test : { kind: "or", terms: [] };
}
