// The composition language: parsing, printing, round-tripping and validation.
// The grammar cases come from Lab 4's mini-IDE, which this language keeps.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAst, callSignature } from "../lang/ast.js";
import { printProgram } from "../lang/print.js";
import { catalogueFromSpace, validate } from "../lang/validate.js";

const ast = (text) => buildAst(text);
const print = (text) => printProgram(ast(text)).text;
const errorsOf = (text) => validate(text).errors.map((error) => `${error.line}: ${error.message}`);

// --- the three app types the assignment asks for ---------------------------

test("type 1: a sequence of calls", () => {
  const program = ast("RUN Read_Humidity()\nRUN Fan_Off()");

  assert.equal(program.body.length, 2);
  assert.deepEqual(program.body.map((s) => s.kind), ["order", "order"]);
  assert.equal(callSignature(program.body[0].calls[0]), "Read_Humidity()");
});

test("type 2: RUN … THEN … is one order-based statement", () => {
  const program = ast("RUN AT_Boar.Read_Temp(C)\nTHEN AT_Boar.Fan_On(60)");

  assert.equal(program.body.length, 1);
  const [statement] = program.body;
  assert.equal(statement.kind, "order");
  assert.deepEqual(statement.calls.map(callSignature), [
    "AT_Boar.Read_Temp(C)",
    "AT_Boar.Fan_On(60)",
  ]);
  assert.equal(statement.calls[0].thing, "AT_Boar");
});

test("type 3: IF … DO … ELSE … END, with AND and OR", () => {
  const program = ast(`
IF   Read_Temp(C) > 28 AND Read_Humidity() > 60 OR Read_Fan_Status() == 0
DO   Fan_On(75)
     Set_Window(50)
ELSE Window_Close()
END`);

  const [statement] = program.body;
  assert.equal(statement.kind, "condition");
  // AND binds tighter than OR, so this is (a AND b) OR (c).
  assert.deepEqual(statement.test.terms.map((term) => term.terms.length), [2, 1]);
  assert.equal(statement.test.terms[0].terms[0].op, ">");
  assert.equal(statement.test.terms[0].terms[0].value, 28);
  assert.equal(statement.consequent.length, 2);
  assert.equal(statement.alternative.length, 1);
});

test("the three types compose, and IFs nest", () => {
  const program = ast(`
RUN Calibrate_Sensor()
IF  Read_Temp(C) > 28
DO  Fan_On(75)
    IF  Read_Humidity() > 60
    DO  Set_Window(50)
    END
END
RUN Fan_Off()`);

  assert.deepEqual(program.body.map((s) => s.kind), ["order", "condition", "order"]);
  assert.equal(program.body[1].consequent[1].kind, "condition");
});

test("LOOP keeps an app running so that stop can be demonstrated", () => {
  const [statement] = ast("LOOP EVERY 5s\n  Fan_On(10)\nEND").body;

  assert.equal(statement.kind, "loop");
  assert.equal(statement.everySeconds, 5);
  assert.equal(statement.body.length, 1);
});

// --- lexical details carried over from Lab 4 -------------------------------

test("comments, blank lines and indentation are ignored", () => {
  const program = ast(`
// turn everything off
   Fan_Off()      // trailing comment

   Window_Close()`);

  assert.deepEqual(program.body.map((s) => callSignature(s.calls[0])), [
    "Fan_Off()",
    "Window_Close()",
  ]);
});

test("keywords may be written in lower case, as in Lab 4", () => {
  const [statement] = ast("run Fan_On(10)\nthen Fan_Off()").body;
  assert.equal(statement.calls.length, 2);
});

test("C and F are accepted where an integer is", () => {
  const [statement] = ast("RUN Read_Temp(F)").body;
  assert.deepEqual(statement.calls[0].args, [{ kind: "alias", name: "F" }]);
});

test("negative and multiple arguments parse", () => {
  const [statement] = ast("RUN Set_Window(-5, 10)").body;
  assert.deepEqual(statement.calls[0].args, [
    { kind: "number", value: -5 },
    { kind: "number", value: 10 },
  ]);
});

// --- printing ---------------------------------------------------------------

test("printing puts keywords in a gutter and indents branches", () => {
  const text = print("IF Read_Temp(C)>28\nDO Fan_On(75)\nELSE Window_Close()\nEND");

  assert.equal(
    text,
    [
      "IF   Read_Temp(C) > 28",
      "DO",
      "     Fan_On(75)",
      "ELSE",
      "     Window_Close()",
      "END",
    ].join("\n"),
  );
});

test("printing a printed program changes nothing", () => {
  const source = `
RUN  Calibrate_Sensor()
THEN Read_Temp(C)
IF   Read_Temp(C) > 28 AND Read_Humidity() > 60
DO   Fan_On(75)
     IF   Read_Fan_Status() == 1
     DO   Set_Window(50)
     ELSE Window_Close()
     END
ELSE Fan_Off()
END
LOOP EVERY 10s
     Read_Humidity()
END`;

  const once = print(source);
  assert.equal(print(once), once, "printing is not stable");
});

test("a bare call stays bare, a RUN stays a RUN", () => {
  assert.equal(print("Fan_Off()"), "Fan_Off()");
  assert.equal(print("RUN Fan_Off()"), "RUN  Fan_Off()");
});

test("every printed line belongs to exactly one node", () => {
  const program = ast("RUN Read_Temp(C)\nTHEN Fan_On(75)\nIF Read_Humidity() > 60\nDO Fan_Off()\nEND");
  const { text, owners, lines } = printProgram(program);

  const lineCount = text.split("\n").length;
  for (let i = 0; i < lineCount; i++) {
    assert.ok(owners.has(i), `line ${i} has no owner: ${JSON.stringify(text.split("\n")[i])}`);
  }
  // The two calls of the chain own one line each; the IF owns its IF, DO and END.
  const condition = program.body[1];
  assert.equal(lines.get(condition.id).length, 3);
});

test("ids are stable when another statement is edited", () => {
  const before = ast("IF Read_Temp(C) > 28\nDO Fan_On(75)\nEND\nRUN Fan_Off()");
  const after = ast("IF Read_Temp(C) > 28\nDO Fan_On(60)\nEND\nRUN Fan_Off()");

  assert.equal(after.body[0].id, before.body[0].id, "the IF should keep its id");
  assert.equal(after.body[1].calls[0].id, before.body[1].calls[0].id, "Fan_Off should keep its id");
  assert.notEqual(after.body[0].consequent[0].calls[0].id, before.body[0].consequent[0].calls[0].id);
});

test("two identical calls get different ids", () => {
  const program = ast("RUN Fan_Off()\nRUN Fan_Off()");
  assert.notEqual(program.body[0].calls[0].id, program.body[1].calls[0].id);
});

// --- validation: level 1 and 2 block, level 3 warns ------------------------

test("a well-formed program has no errors", () => {
  assert.deepEqual(errorsOf("RUN Read_Temp(C)\nTHEN Fan_On(75)"), []);
});

test("an unclosed IF is reported as a missing END", () => {
  const [error] = errorsOf("IF Read_Temp(C) > 28\nDO Fan_On(75)");
  assert.match(error, /END to close this IF/);
});

test("an unclosed argument list is reported", () => {
  const [error] = errorsOf("RUN Fan_On(75");
  assert.match(error, /\) to close the argument list/);
});

test("keywords in the wrong place get Lab 4's message", () => {
  assert.match(errorsOf("THEN Fan_On(75)")[0], /"THEN" without a matching RUN/);
  assert.match(errorsOf("END")[0], /"END" without a matching IF/);
});

test("an invalid token is reported where it is", () => {
  const [error] = errorsOf("RUN Fan_On(75)\n%%%\nRUN Fan_Off()");
  assert.match(error, /^2: unexpected "%%%"/);
});

test("an empty DO branch is rejected", () => {
  assert.match(errorsOf("IF Read_Temp(C) > 28\nDO\nEND")[0], /at least one command after DO/);
});

test("an argument that is neither an integer nor C or F is rejected", () => {
  assert.match(errorsOf("RUN Read_Temp(X)")[0], /neither an integer nor one of: C, F/);
});

test("a LOOP needs a body and a positive period", () => {
  assert.match(errorsOf("LOOP EVERY 5s\nEND")[0], /needs at least one command/);
  assert.match(errorsOf("LOOP EVERY 0s\n  Fan_Off()\nEND")[0], /positive number of seconds/);
});

test("errors carry the line they are on", () => {
  const [error] = validate("RUN Fan_On(75)\nRUN Fan_Off(").errors;
  assert.equal(error.line, 2);
  assert.ok(error.to > error.from, "a diagnostic must cover a range to be highlighted");
});

// --- validation: catalogue warnings never block ----------------------------

const space = {
  things: [
    {
      id: "AT_BoarAirSensor",
      entities: [
        { id: "ClimateSensor", services: [{ name: "Read_Temp", inputs: [{ name: "F_or_C" }] }] },
        { id: "Fan", services: [{ name: "Fan_On", inputs: [{ name: "speed" }] }, { name: "Fan_Off", inputs: [] }] },
      ],
    },
    { id: "AT_Spare", entities: [{ id: "Fan", services: [{ name: "Fan_Off", inputs: [] }] }] },
  ],
};

const catalogue = catalogueFromSpace(space);
const warningsOf = (text) => validate(text, { catalogue }).warnings.map((w) => w.message);

test("a call the space can answer warns about nothing", () => {
  assert.deepEqual(warningsOf("RUN AT_BoarAirSensor.Fan_On(75)"), []);
});

test("an unknown service warns", () => {
  assert.match(warningsOf("RUN Open_Door()")[0], /no thing in the space offers "Open_Door"/);
});

test("the wrong number of arguments warns", () => {
  assert.match(warningsOf("RUN Fan_On()")[0], /takes 1 argument\(s\), got 0/);
});

test("an ambiguous unqualified call warns and names the things", () => {
  assert.match(warningsOf("RUN Fan_Off()")[0], /offered by AT_BoarAirSensor, AT_Spare/);
  assert.deepEqual(warningsOf("RUN AT_Spare.Fan_Off()"), []);
});

test("warnings are not errors, so they never block applying", () => {
  const result = validate("RUN Open_Door()", { catalogue });
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 1);
});
