// Tests for the mini-IDE grammar and the Edge orchestrator.
//
// Run:  node parser.test.js
//
// app.js is a plain browser script: it touches the DOM at load time and talks
// MQTT. Rather than split it into modules, this harness stubs the handful of
// globals it needs and eval's it, which keeps the shipped dashboard a single
// file. Execution tests replace invoke() with a fake that records the calls it
// was asked to make and returns canned replies, so the orchestrator's control
// flow — short-circuiting, branch selection, nesting — is checked without a
// broker or a Raspberry Pi.

const fs = require("fs");
const path = require("path");

const logLines = [];

const stubElement = () => ({
  textContent: "", className: "", value: "", disabled: false, colSpan: 0,
  style: {}, appendChild() {}, replaceChildren() {}, addEventListener() {},
  scrollTop: 0, scrollHeight: 0,
});

global.document = { getElementById: stubElement, createElement: stubElement };
global.localStorage = { getItem: () => null, setItem() {} };
global.mqtt = { connect: () => ({ on() {} }) };

const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
eval(`${source}
global.parseProgram = parseProgram;
global.runBlock = runBlock;
global.EXAMPLE_PROGRAM = EXAMPLE_PROGRAM;
global.setInvoke = (fn) => { invoke = fn; };
global.setLog = (fn) => { log = fn; };
`);

// Collect log output instead of writing to the (stubbed) DOM.
setLog((text, kind = "", depth = 0) => logLines.push(`${"  ".repeat(depth)}${text}`));

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function parses(label, source, assertion) {
  try {
    const tree = parseProgram(source);
    check(label, !assertion || assertion(tree), "assertion on the parse tree");
  } catch (err) {
    check(label, false, err.message);
  }
}

function rejects(label, source, fragment) {
  try {
    parseProgram(source);
    check(label, false, "expected a parse error");
  } catch (err) {
    check(label, !fragment || err.message.includes(fragment), `message was "${err.message}"`);
  }
}

// --- Parsing -------------------------------------------------------------

console.log("\nshipped example");
parses("parses", EXAMPLE_PROGRAM, (t) => t.length === 5);

console.log("\nsingle calls and order-based chains");
parses("bare RUN", "RUN Read_Humidity()", (t) => t[0].calls.length === 1);
parses("RUN/THEN", "RUN A()\nTHEN B()", (t) => t[0].calls.length === 2);
parses("chained THEN", "RUN A()\nTHEN B()\nTHEN C()", (t) => t[0].calls.length === 3);
parses("RUN on its own line", "RUN\nA()", (t) => t[0].calls[0].name === "A");

console.log("\nsymbolic arguments");
parses("C -> 0", "RUN Read_Temp(C)", (t) => t[0].calls[0].args[0] === 0);
parses("F -> 1", "RUN Read_Temp(F)", (t) => t[0].calls[0].args[0] === 1);
parses("lowercase", "RUN Read_Temp(c)", (t) => t[0].calls[0].args[0] === 0);
parses("integers still work", "RUN Read_Temp(1)", (t) => t[0].calls[0].args[0] === 1);
rejects("unknown token", "RUN Read_Temp(X)", "neither an integer");

console.log("\nconditions");
parses("single predicate", "IF A() > 1\nDO B()\nEND",
  (t) => t[0].test.terms.length === 1 && t[0].test.terms[0].terms.length === 1);
parses("AND", "IF A() > 1 AND B() < 2\nDO C()\nEND",
  (t) => t[0].test.terms.length === 1 && t[0].test.terms[0].terms.length === 2);
parses("OR", "IF A() > 1 OR B() < 2\nDO C()\nEND", (t) => t[0].test.terms.length === 2);
parses("AND binds tighter than OR", "IF A() > 1 OR B() > 2 AND C() > 3\nDO D()\nEND",
  (t) => t[0].test.terms.length === 2
      && t[0].test.terms[0].terms.length === 1
      && t[0].test.terms[1].terms.length === 2);
parses("lowercase and/or", "IF A() > 1 and B() > 2\nDO C()\nEND",
  (t) => t[0].test.terms[0].terms.length === 2);
parses("all six operators", "IF A() >= 1 AND B() <= 2 AND C() == 3 AND D() != 4 AND E() > 5 AND F() < 6\nDO G()\nEND",
  (t) => t[0].test.terms[0].terms.map((p) => p.op).join(",") === ">=,<=,==,!=,>,<");
rejects("trailing AND", "IF A() > 1 AND\nDO B()\nEND");
rejects("empty condition", "IF\nDO B()\nEND");
rejects("float comparison", "IF A() > 2.5\nDO B()\nEND");

console.log("\nbranch bodies");
parses("several commands", "IF A() > 1\nDO B()\nC()\nD()\nEND",
  (t) => t[0].consequent.length === 3);
parses("ELSE body", "IF A() > 1\nDO B()\nELSE C()\nD()\nEND",
  (t) => t[0].consequent.length === 1 && t[0].alternative.length === 2);
parses("no ELSE", "IF A() > 1\nDO B()\nEND", (t) => t[0].alternative.length === 0);
parses("DO inline vs next line",
  "IF A() > 1\nDO B()\nEND\nIF A() > 1\nDO\nB()\nEND",
  (t) => JSON.stringify(t[0]) === JSON.stringify(t[1]));
parses("RUN/THEN inside a body", "IF A() > 1\nDO RUN B()\nTHEN C()\nEND",
  (t) => t[0].consequent.length === 1 && t[0].consequent[0].calls.length === 2);
parses("blank lines and indent ignored",
  "IF A() > 1\nDO\n\n    B()\n\n    C()\n\nEND",
  (t) => t[0].consequent.length === 2);
rejects("empty DO", "IF A() > 1\nDO\nEND", "at least one command");

console.log("\nnesting");
parses("nested IF", "IF A() > 1\nDO IF B() > 2\nDO C()\nEND\nEND",
  (t) => t[0].consequent[0].kind === "condition");
parses("three deep", "IF A() > 1\nDO IF B() > 2\nDO IF C() > 3\nDO D()\nEND\nEND\nEND",
  (t) => t[0].consequent[0].consequent[0].consequent[0].calls[0].name === "D");
parses("nested in ELSE", "IF A() > 1\nDO B()\nELSE IF C() > 2\nDO D()\nEND\nEND",
  (t) => t[0].alternative[0].kind === "condition");
parses("sibling IFs after nesting",
  "IF A() > 1\nDO IF B() > 2\nDO C()\nEND\nEND\nIF D() > 1\nDO E()\nEND",
  (t) => t.length === 2);

console.log("\nunbalanced blocks");
rejects("IF without END", "IF A() > 1\nDO B()", "expected END");
rejects("stray END", "RUN A()\nEND", "without a matching IF");
rejects("ELSE without IF", "RUN A()\nELSE B()", "without a matching IF");
rejects("stray THEN", "THEN A()", "without a matching RUN");
rejects("END before DO", "IF A() > 1\nEND", "expected DO");
rejects("inner IF unclosed", "IF A() > 1\nDO IF B() > 2\nDO C()\nEND", "expected END");
rejects("missing parens", "RUN A", "not a service call");

// --- Execution -----------------------------------------------------------

// Replays scripted results so control flow can be checked without a device.
// `results` maps a service name to the integer it returns; a name mapped to
// null replies Unsuccessful.
function runWith(results, source) {
  const calls = [];
  setInvoke(async (rpi, name, args) => {
    calls.push(`${name}(${args.join(",")})`);
    const value = results[name];
    return value === null
      ? { service: name, status: "Unsuccessful", description: "Sensor read failed", result: null }
      : { service: name, status: "Successful", description: "ok", result: value ?? null };
  });
  return runBlock(parseProgram(source), 0).then(() => calls);
}

async function execution() {
  console.log("\nshort-circuit");

  let calls = await runWith({ A: 0, B: 99 }, "IF A() > 10 AND B() > 10\nDO C()\nEND");
  check("false AND skips the rest", calls.join(" ") === "A()", `called: ${calls.join(" ")}`);

  calls = await runWith({ A: 99, B: 99 }, "IF A() > 10 OR B() > 10\nDO C()\nEND");
  check("true OR skips the rest", calls.join(" ") === "A() C()", `called: ${calls.join(" ")}`);

  calls = await runWith({ A: 0, B: 99 }, "IF A() > 10 OR B() > 10\nDO C()\nEND");
  check("false OR term tries the next", calls.join(" ") === "A() B() C()", `called: ${calls.join(" ")}`);

  console.log("\nbranch selection");

  calls = await runWith({ A: 99 }, "IF A() > 10\nDO B()\nELSE C()\nEND");
  check("true runs DO", calls.join(" ") === "A() B()", `called: ${calls.join(" ")}`);

  calls = await runWith({ A: 0 }, "IF A() > 10\nDO B()\nELSE C()\nEND");
  check("false runs ELSE", calls.join(" ") === "A() C()", `called: ${calls.join(" ")}`);

  calls = await runWith({ A: 0 }, "IF A() > 10\nDO B()\nEND");
  check("false without ELSE runs nothing", calls.join(" ") === "A()", `called: ${calls.join(" ")}`);

  console.log("\nbodies and nesting");

  calls = await runWith({ A: 99 }, "IF A() > 10\nDO B()\nC()\nD()\nEND");
  check("every command runs in order", calls.join(" ") === "A() B() C() D()", `called: ${calls.join(" ")}`);

  calls = await runWith({ A: 99, B: 99 },
    "IF A() > 10\nDO IF B() > 10\nDO C()\nEND\nD()\nEND");
  check("nested IF then sibling", calls.join(" ") === "A() B() C() D()", `called: ${calls.join(" ")}`);

  calls = await runWith({ A: 99, B: 0 },
    "IF A() > 10\nDO IF B() > 10\nDO C()\nEND\nD()\nEND");
  check("nested false skips only its body", calls.join(" ") === "A() B() D()", `called: ${calls.join(" ")}`);

  console.log("\nfailures");

  calls = await runWith({ A: null }, "IF A() > 10\nDO B()\nELSE C()\nEND");
  check("unsuccessful predicate runs no branch", calls.join(" ") === "A()", `called: ${calls.join(" ")}`);

  calls = await runWith({ A: null, D: 1 }, "IF A() > 10\nDO B()\nEND\nRUN D()");
  check("and does not stop the program", calls.join(" ") === "A() D()", `called: ${calls.join(" ")}`);

  calls = await runWith({ A: null }, "RUN A()\nTHEN B()");
  check("failed THEN chain stops", calls.join(" ") === "A()", `called: ${calls.join(" ")}`);
}

execution().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
