// AST -> text, in the Lab 4 layout: keywords in a five-column gutter, bodies
// lined up under them, one statement per line.
//
// Printing is deterministic, so the text pane can be rebuilt from the graph
// after every change. Besides the text it returns which lines each AST node
// produced, which is what links a block on the canvas to its lines in the
// editor (and back).

import { callSignature } from "./ast.js";

const GUTTER = 5; // width of the keyword column: "RUN  ", "THEN ", "ELSE "…

/**
 * @returns {{ text: string, lines: Map<string, number[]>, owners: Map<number, string> }}
 *   `lines` maps an AST id to the 0-based lines it produced; `owners` is the
 *   reverse, with each line attributed to the innermost node that owns it.
 */
export function printProgram(ast) {
  const printer = { out: [], lines: new Map(), owners: new Map() };
  printBlock(ast.body, 0, printer);
  return { text: printer.out.join("\n"), lines: printer.lines, owners: printer.owners };
}

export function conditionText(test) {
  return test.terms
    .map((andTerm) => andTerm.terms.map(predicateText).join(" AND "))
    .join(" OR ");
}

export function predicateText(predicate) {
  return `${callSignature(predicate.call)} ${predicate.op} ${predicate.value}`;
}

// --- printing ---------------------------------------------------------------

function emit(printer, indent, keyword, rest, id) {
  // A keyword fills the gutter; a bare call has none and sits at the indent,
  // which inside a branch already lines it up under DO.
  const line = `${" ".repeat(indent)}${keyword ? keyword.padEnd(GUTTER) : ""}${rest}`.trimEnd();

  const number = printer.out.length;
  printer.out.push(line);

  if (id) {
    if (!printer.lines.has(id)) printer.lines.set(id, []);
    printer.lines.get(id).push(number);
    printer.owners.set(number, id);
  }
  return number;
}

function printBlock(statements, indent, printer) {
  for (const statement of statements) printStatement(statement, indent, printer);
}

function printStatement(statement, indent, printer) {
  if (statement.kind === "order") return printOrder(statement, indent, printer);
  if (statement.kind === "condition") return printCondition(statement, indent, printer);
  if (statement.kind === "loop") return printLoop(statement, indent, printer);
}

// A lone call inside a branch needs no RUN; a chain is RUN … THEN …
function printOrder(statement, indent, printer) {
  const [first, ...rest] = statement.calls;
  if (!first) return;

  const single = rest.length === 0;
  emit(printer, indent, single && statement.bare ? "" : "RUN", callSignature(first), first.id);
  for (const call of rest) emit(printer, indent, "THEN", callSignature(call), call.id);
}

function printCondition(statement, indent, printer) {
  emit(printer, indent, "IF", conditionText(statement.test), statement.id);
  emit(printer, indent, "DO", "", statement.id);
  printBlock(statement.consequent, indent + GUTTER, printer);

  if (statement.alternative.length > 0) {
    emit(printer, indent, "ELSE", "", statement.id);
    printBlock(statement.alternative, indent + GUTTER, printer);
  }
  emit(printer, indent, "END", "", statement.id);
}

function printLoop(statement, indent, printer) {
  emit(printer, indent, "LOOP", `EVERY ${statement.everySeconds}s`, statement.id);
  printBlock(statement.body, indent + GUTTER, printer);
  emit(printer, indent, "END", "", statement.id);
}
