// The orchestrator, against a fake thing. These are Lab 4's execution rules;
// if one of them changes, an app that worked in Lab 4 behaves differently here.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAst } from "../lang/ast.js";
import { runProgram } from "../lang/run.js";

/**
 * @param {string} source
 * @param {object} replies  service name -> reply, or a function of the args
 */
async function run(source, replies = {}, { stopAfter = 0 } = {}) {
  const calls = [];
  const log = [];
  const signal = { stopped: false };

  const invoke = async (call) => {
    calls.push(`${call.name}(${call.args.join(",")})`);
    if (stopAfter && calls.length >= stopAfter) signal.stopped = true;

    const reply = replies[call.name];
    const resolved = typeof reply === "function" ? reply(call.args) : reply;
    return resolved ?? { status: "Successful", result: 0, description: "" };
  };

  const outcome = await runProgram(buildAst(source), {
    invoke,
    log: (line) => log.push(line.text),
    signal,
  });
  return { calls, log, outcome };
}

const ok = (result = 0) => ({ status: "Successful", result, description: "" });
const fail = (description = "boom") => ({ status: "Unsuccessful", result: null, description });

// --- type 1 and type 2 ------------------------------------------------------

test("a sequence runs every statement in order", async () => {
  const { calls, outcome } = await run("RUN A()\nRUN B()\nRUN C()");

  assert.deepEqual(calls, ["A()", "B()", "C()"]);
  assert.equal(outcome, "completed");
});

test("an order-based chain stops at the first unsuccessful call", async () => {
  const { calls, log } = await run("RUN A()\nTHEN B()\nTHEN C()", { B: fail() });

  assert.deepEqual(calls, ["A()", "B()"], "C must not run");
  assert.ok(log.some((line) => /chain stopped: B\(\) was unsuccessful, 1 call\(s\) skipped/.test(line)));
});

test("a failed statement does not stop the ones after it", async () => {
  const { calls } = await run("RUN A()\nTHEN B()\nRUN C()", { A: fail() });

  assert.deepEqual(calls, ["A()", "C()"]);
});

// --- type 3 -----------------------------------------------------------------

test("a condition calls its predicate and takes the DO branch when it holds", async () => {
  const { calls } = await run("IF Read_Temp(C) > 20\nDO Fan_On(75)\nELSE Fan_Off()\nEND", {
    Read_Temp: ok(28),
  });

  assert.deepEqual(calls, ["Read_Temp(0)", "Fan_On(75)"]);
});

test("the ELSE branch runs when the condition does not hold", async () => {
  const { calls } = await run("IF Read_Temp(C) > 20\nDO Fan_On(75)\nELSE Fan_Off()\nEND", {
    Read_Temp: ok(12),
  });

  assert.deepEqual(calls, ["Read_Temp(0)", "Fan_Off()"]);
});

test("with no ELSE and a false condition, nothing in the statement runs", async () => {
  const { calls, log } = await run("IF Read_Temp(C) > 20\nDO Fan_On(75)\nEND", { Read_Temp: ok(1) });

  assert.deepEqual(calls, ["Read_Temp(0)"]);
  assert.ok(log.some((line) => /no ELSE branch/.test(line)));
});

test("AND short-circuits, and the skipped predicate is reported", async () => {
  const { calls, log } = await run("IF A() > 10 AND B() > 10\nDO C()\nEND", { A: ok(1), B: ok(99) });

  assert.deepEqual(calls, ["A()"], "B must never be called");
  assert.ok(log.some((line) => /skipped B\(\) > 10 \(short-circuit\)/.test(line)));
});

test("OR tries the next group when the first does not hold", async () => {
  const { calls } = await run("IF A() > 10 OR B() > 10\nDO C()\nEND", { A: ok(1), B: ok(99) });

  assert.deepEqual(calls, ["A()", "B()", "C()"]);
});

test("if a predicate's call fails, neither branch runs", async () => {
  const { calls, log } = await run("IF A() > 10\nDO B()\nELSE C()\nEND", { A: fail() });

  assert.deepEqual(calls, ["A()"]);
  assert.ok(log.some((line) => /not evaluated: A\(\) was unsuccessful, no branch run/.test(line)));
});

test("a predicate whose call returns nothing to compare fails the same way", async () => {
  const { log } = await run("IF A() > 10\nDO B()\nEND", { A: ok(null) });

  assert.ok(log.some((line) => /returned no value to compare/.test(line)));
});

test("every comparison operator behaves", async () => {
  const cases = [
    [">", 5, 4, true], ["<", 5, 4, false], [">=", 4, 4, true],
    ["<=", 4, 5, true], ["==", 4, 4, true], ["!=", 4, 4, false],
  ];

  for (const [operator, left, right, expected] of cases) {
    const { calls } = await run(`IF A() ${operator} ${right}\nDO B()\nEND`, { A: ok(left) });
    assert.equal(calls.includes("B()"), expected, `${left} ${operator} ${right}`);
  }
});

// --- arguments --------------------------------------------------------------

test("C and F reach the thing as 0 and 1", async () => {
  const { calls } = await run("RUN Read_Temp(C)\nRUN Read_Temp(F)");
  assert.deepEqual(calls, ["Read_Temp(0)", "Read_Temp(1)"]);
});

test("integer arguments are passed through, negatives included", async () => {
  const { calls } = await run("RUN Set_Window(-5, 10)");
  assert.deepEqual(calls, ["Set_Window(-5,10)"]);
});

// --- loops and stopping -----------------------------------------------------

test("a loop keeps going until the run is stopped", async () => {
  const { calls, outcome } = await run("LOOP EVERY 0s\n  A()\nEND", {}, { stopAfter: 3 });

  assert.equal(calls.length, 3);
  assert.equal(outcome, "stopped");
});

test("stopping mid-chain abandons the calls that were still to come", async () => {
  const { calls, outcome } = await run("RUN A()\nTHEN B()\nTHEN C()", {}, { stopAfter: 1 });

  assert.deepEqual(calls, ["A()"]);
  assert.equal(outcome, "stopped");
});

test("an app with no loop finishes on its own", async () => {
  const { outcome } = await run("RUN A()");
  assert.equal(outcome, "completed");
});
