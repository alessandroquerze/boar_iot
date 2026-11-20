// The orchestrator: turns an AST into service calls. Ported from Lab 4's
// edge/app.js, whose execution semantics are kept exactly:
//
//  - an order-based chain stops at the first unsuccessful call, and says how
//    many calls were skipped;
//  - every predicate is a real service call, conditions are an OR of ANDs and
//    short-circuit, and a skipped predicate is logged rather than hidden;
//  - if a predicate's call fails, neither branch runs;
//  - statements are independent: a failed one does not stop the ones after it;
//  - a call that does not answer in time counts as failed.
//
// What is new is LOOP, and being stoppable: `signal.stopped` is checked before
// every call, which is what the guidelines' STOP needs.

/** Raised when a predicate's own call fails, to tell it from a bug. */
class PredicateError extends Error {}

const ALIASES = { C: 0, F: 1 };

/**
 * @param {object} ast
 * @param {{invoke: Function, log: Function, signal: {stopped: boolean}}} context
 * @returns {Promise<"completed"|"stopped">}
 */
export async function runProgram(ast, context) {
  const { log, signal } = context;

  log({ kind: "info", text: `--- run: ${ast.body.length} statement(s) ---` });
  await runBlock(ast.body, 0, context);

  const outcome = signal.stopped ? "stopped" : "completed";
  log({ kind: "info", text: `--- ${outcome} ---` });
  return outcome;
}

async function runBlock(statements, depth, context) {
  for (const statement of statements) {
    if (context.signal.stopped) return;

    try {
      if (statement.kind === "order") await runOrder(statement, depth, context);
      else if (statement.kind === "condition") await runCondition(statement, depth, context);
      else if (statement.kind === "loop") await runLoop(statement, depth, context);
    } catch (error) {
      // Fault tolerance: report it and carry on with the next statement.
      context.log({ kind: "error", depth, text: `error: ${error.message}` });
    }
  }
}

// --- type 1 and type 2: a call, or a chain of them -------------------------

async function runOrder(statement, depth, context) {
  const { log } = context;
  const single = statement.calls.length === 1;

  log({
    kind: "info",
    depth,
    text: single
      ? `[single call] ${describe(statement.calls[0])}`
      : `[order-based] ${statement.calls.map(describe).join(" THEN ")}`,
  });

  for (let i = 0; i < statement.calls.length; i++) {
    if (context.signal.stopped) return;

    const call = statement.calls[i];
    const reply = await invokeCall(call, depth + 1, context);

    if (reply.status !== "Successful") {
      if (single) return;
      const skipped = statement.calls.length - i - 1;
      log({
        kind: "fail",
        depth: depth + 1,
        text: `chain stopped: ${describe(call)} was unsuccessful, ${skipped} call(s) skipped`,
      });
      return;
    }
  }

  if (!single) log({ kind: "ok", depth: depth + 1, text: "chain completed" });
}

// --- type 3: a condition ----------------------------------------------------

async function runCondition(statement, depth, context) {
  const { log } = context;
  const description = statement.test.terms
    .map((andTerm) =>
      andTerm.terms.map((p) => `${describe(p.call)} ${p.op} ${p.value}`).join(" AND "),
    )
    .join(" OR ");
  log({ kind: "info", depth, text: `[condition-based] IF ${description}` });

  let holds;
  try {
    holds = await evaluateCondition(statement.test, depth + 1, context);
  } catch (error) {
    if (!(error instanceof PredicateError)) throw error;
    log({ kind: "fail", depth: depth + 1, text: `not evaluated: ${error.message}, no branch run` });
    return;
  }

  if (context.signal.stopped) return;

  const branch = holds ? statement.consequent : statement.alternative;
  log({ kind: holds ? "ok" : "info", depth: depth + 1, text: `condition is ${holds}` });

  if (branch.length === 0) {
    log({
      kind: "info",
      depth: depth + 1,
      text: holds ? "nothing to run" : "skipped: no ELSE branch",
    });
    return;
  }
  await runBlock(branch, depth + 1, context);
}

async function evaluateCondition(test, depth, context) {
  for (const andTerm of test.terms) {
    let holds = true;

    for (const predicate of andTerm.terms) {
      if (!holds) {
        // Logged rather than silent, so the developer can see what was skipped.
        context.log({
          kind: "other",
          depth,
          text: `skipped ${describe(predicate.call)} ${predicate.op} ${predicate.value} (short-circuit)`,
        });
        continue;
      }
      holds = await evaluatePredicate(predicate, depth, context);
    }
    if (holds) return true;
  }
  return false;
}

async function evaluatePredicate(predicate, depth, context) {
  const reply = await invokeCall(predicate.call, depth, context);

  if (reply.status !== "Successful") {
    throw new PredicateError(`${describe(predicate.call)} was unsuccessful`);
  }
  if (typeof reply.result !== "number") {
    throw new PredicateError(`${describe(predicate.call)} returned no value to compare`);
  }

  const holds = compare(reply.result, predicate.op, predicate.value);
  context.log({
    kind: holds ? "ok" : "info",
    depth,
    text: `${reply.result} ${predicate.op} ${predicate.value} is ${holds}`,
  });
  return holds;
}

function compare(left, operator, right) {
  switch (operator) {
    case ">":  return left > right;
    case "<":  return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    case "==": return left === right;
    case "!=": return left !== right;
    default:   return false;
  }
}

// --- the loop ---------------------------------------------------------------

// An app that loops stays Active until it is stopped; everything else finishes
// on its own and ends Completed. Without this, STOP could never be shown.
async function runLoop(statement, depth, context) {
  const { log, signal } = context;
  log({ kind: "info", depth, text: `[loop] every ${statement.everySeconds}s until stopped` });

  for (let pass = 1; !signal.stopped; pass++) {
    log({ kind: "info", depth: depth + 1, text: `pass ${pass}` });
    await runBlock(statement.body, depth + 1, context);
    if (signal.stopped) break;
    await sleep(statement.everySeconds * 1000, signal);
  }
}

/** A sleep that gives up as soon as the run is stopped. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (signal.stopped || Date.now() - started >= ms) {
        clearInterval(tick);
        resolve();
      }
    }, Math.min(100, Math.max(10, ms / 10)));
  });
}

// --- calls ------------------------------------------------------------------

async function invokeCall(call, depth, context) {
  if (context.signal.stopped) return { status: "Unsuccessful", result: null, description: "stopped" };

  context.log({ kind: "call", depth, text: `call  ${describe(call)}` });
  const reply = await context.invoke({ ...call, args: call.args.map(argumentValue) });

  const shown = reply.result === null || reply.result === undefined ? "no output" : reply.result;
  context.log({
    kind: reply.status === "Successful" ? "ok" : "fail",
    depth,
    text: `reply ${call.name} -> ${reply.status}: ${reply.status === "Successful" ? shown : reply.description}`,
  });
  return reply;
}

/** Arguments reach a thing as integers; C and F are Lab 4's aliases for 0 and 1. */
export function argumentValue(argument) {
  if (argument.kind === "number") return argument.value;
  const alias = ALIASES[String(argument.name).toUpperCase()];
  return alias === undefined ? 0 : alias;
}

function describe(call) {
  const args = call.args.map((argument) => (argument.kind === "number" ? argument.value : argument.name));
  return `${call.thing ? `${call.thing}.` : ""}${call.name}(${args.join(", ")})`;
}
