// Broker: ws://<host>:9001. Topics: vss/boar/{services,call,reply,status}.

const TOPIC_PREFIX = "vss/boar/";
const DEFAULT_RPI = "RPi1";
const CALL_TIMEOUT_MS = 10000;
const STORAGE_KEY = "vss_host";
const ARG_ALIASES = { C: 0, F: 1 };
const INPUT_HINTS = { F_or_C: "C|F" };

const hostInput = document.getElementById("host");
const connectBtn = document.getElementById("connectBtn");
const connStatus = document.getElementById("connStatus");
const deviceStatus = document.getElementById("deviceStatus");
const catalogueBody = document.getElementById("catalogueBody");
const programInput = document.getElementById("program");
const runBtn = document.getElementById("runBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const logPanel = document.getElementById("log");
const message = document.getElementById("message");

let client = null;
let nextId = 1;

// id -> { resolve, timer }, so a reply can be matched to the call that made it.
const pending = new Map();

// Raised when a predicate's service call throws an error. We use it to distinguish them from the synthax errors or bugs
class PredicateError extends Error {}

// --- UI helpers ---
function setBrokerStatus(kind, text) {
  connStatus.textContent = `Broker: ${text}`;
  connStatus.className = `status status-${kind}`;
}

function setDeviceStatus(kind, text) {
  deviceStatus.textContent = `Device: ${text}`;
  deviceStatus.className = `status status-${kind}`;
}

function showMessage(text, kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

function log(text, kind = "", depth = 0) {
  const line = document.createElement("div");
  line.className = `log-line log-${kind}`;
  line.textContent = `${new Date().toLocaleTimeString()}  ${"  ".repeat(depth)}${text}`;
  logPanel.appendChild(line);
  logPanel.scrollTop = logPanel.scrollHeight;
}

function describe(call) {
  return `${call.rpi}.${call.name}(${call.args.join(", ")})`;
}

// --- Service catalogue ---
// These functions are the ones that generates the table with all the services exposes by the Iot things

function addCell(row, text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  row.appendChild(cell);
}

function placeholderRow(text) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 5;
  cell.className = "empty";
  cell.textContent = text;
  row.appendChild(cell);
  return row;
}

function entityRow(entity) {
  const row = document.createElement("tr");
  row.className = "entity";
  const cell = document.createElement("td");
  cell.colSpan = 5;
  cell.textContent = entity;
  row.appendChild(cell);
  return row;
}

function describeInputs(spec) {
  if (spec.inputs.length === 0) return "–";

  return spec.inputs
    .map((name) => (INPUT_HINTS[name] ? `${name} (${INPUT_HINTS[name]})` : name))
    .join(", ");
}

function renderCatalogue(services) {
  catalogueBody.replaceChildren();

  if (services.length === 0) {
    catalogueBody.appendChild(placeholderRow("The thing advertised an empty catalogue."));
    return;
  }

  let currentEntity = null;
  for (const spec of services) {
    if (spec.entity !== currentEntity) {
      catalogueBody.appendChild(entityRow(spec.entity));
      currentEntity = spec.entity;
    }

    const row = document.createElement("tr");
    addCell(row, spec.rpi);
    addCell(row, spec.name, "mono");
    addCell(row, String(spec.ninputs));
    addCell(row, describeInputs(spec));
    addCell(row, spec.output);
    catalogueBody.appendChild(row);
  }
}

// --- Service calls ---

// Sends an MQTT request and wait for a response
function mqtt_send(rpi, name, args, depth = 0) {
  return new Promise((resolve, reject) => {     // Promise is a native js object that allows the callee to use the keyword "await"
    if (!client || !client.connected) {
      reject(new Error("not connected to the broker"));
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {            // Timeout set in case the device doesn't reply
      pending.delete(id);
      reject(new Error(`timeout waiting for ${name}`));
    }, CALL_TIMEOUT_MS);

    pending.set(id, { resolve, timer, depth }); // Mapped as a pending request
    log(`call  ${rpi}.${name}(${args.join(", ")})`, "call", depth);
    client.publish(`${TOPIC_PREFIX}call`, JSON.stringify({ id, service: name, inputs: args }), { qos: 1 });
  });
}

function handleReply(data) {
  const entry = pending.get(data.id);

  // Replies are broadcast, so one that we did not ask for is another client's.
  if (!entry) {
    log(`reply ${data.service} -> ${data.status} (another client)`, "other");
    return;
  }
  clearTimeout(entry.timer);
  pending.delete(data.id);

  const ok = data.status === "Successful";
  const shown = data.result === null || data.result === undefined ? "no output" : data.result;
  log(`reply ${data.service} -> ${data.status}: ${ok ? shown : data.description}`,
      ok ? "ok" : "fail", entry.depth);

  entry.resolve(data);
}

// --- Parser ---
const CALL_RE = /^(?:([A-Za-z0-9_-]+)\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)$/;  // Format "<rpi>.<service>(<args>)" or "<service>(<args>)"
const KEYWORD_RE = /^(RUN|THEN|IF|DO|ELSE|END)\b\s*(.*)$/i;                         // Keyword regex
const TEST_RE = /^(.*?)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/;                            // Condition regex

// Returns the parsed call (RPi, service name, [argument(s)])
function parseCall(line) {
  const match = CALL_RE.exec(line.trim());
  if (!match) throw new Error(`not a service call: "${line.trim()}"`);

  const [, rpi, name, rawArgs] = match;   // Component extraction
  const trimmed = rawArgs.trim();
  const args = [];

  if (trimmed !== "") {                   // Argument parsing
    for (const piece of trimmed.split(",")) {
      const token = piece.trim();
      const value = /^-?\d+$/.test(token) ? parseInt(token, 10) : ARG_ALIASES[token.toUpperCase()];   // Number

      if (value === undefined) {
        const known = Object.keys(ARG_ALIASES).join(", ");
        throw new Error(`argument "${token}" in "${line.trim()}" is neither an integer nor one of: ${known}`);
      }
      args.push(value);
    }
  }
  return { rpi: rpi || DEFAULT_RPI, name, args }; // As long as we have 1 RPi connected, the RPi argument is optional
}

// Analyse a single predicate compose by a compare operator and a number, the result is the call to execute
function parsePredicate(text) {
  const match = TEST_RE.exec(text.trim());
  if (!match) throw new Error(`expected "<call> <op> <int>", got: "${text.trim()}"`);

  return {
    kind: "predicate",
    call: parseCall(match[1]),
    op: match[2],
    value: parseInt(match[3], 10),
  };
}

// Normalised to an OR of ANDs so the evaluator only ever walks two levels
function parseCondition(text) {
  if (text.trim() === "") throw new Error("IF needs a condition");

  const pieces = text.split(/\s+(AND|OR)\s+/i);
  const orTerms = [];
  let andTerms = [parsePredicate(pieces[0])];

  for (let i = 1; i < pieces.length; i += 2) {
    const operator = pieces[i].toUpperCase();
    const predicate = parsePredicate(pieces[i + 1]);

    if (operator === "AND") {
      andTerms.push(predicate);
    } else {
      orTerms.push({ kind: "and", terms: andTerms });
      andTerms = [predicate];
    }
  }

  orTerms.push({ kind: "and", terms: andTerms });
  return { kind: "or", terms: orTerms };
}

// --- Line cursor ---
// Statements can nest, so the parser walks a flat line list with a cursor rather than slicing the source into independent blocks.

// Function that returns the current line, represented by "cursor.i"
function peek(cursor) {
  return cursor.i < cursor.lines.length ? cursor.lines[cursor.i] : null;
}

// Returns a possible keyword sitting at the start of the line
function peekKeyword(cursor) {
  const line = peek(cursor);
  if (line === null) return null;
  const match = KEYWORD_RE.exec(line);
  return match ? match[1].toUpperCase() : null;
}

// Returns the line without the initial keyword
function takeKeyword(cursor) {
  const match = KEYWORD_RE.exec(cursor.lines[cursor.i]);  // Check if the current line has a keyword 
  const rest = match[2].trim();

  if (rest === "") cursor.i++;
  else cursor.lines[cursor.i] = rest;
  
  return rest;
}

function takeKeywordLine(cursor) {
  const match = KEYWORD_RE.exec(cursor.lines[cursor.i]);
  cursor.i++;
  return match[2].trim();
}

function takeCall(cursor, context) {
  const line = peek(cursor);
  if (line === null) throw new Error(`${context} is missing its service call`);

  const call = parseCall(line);
  cursor.i++;
  return call;
}

// Analyse a RUN operation and the possible following THEN operation in order to call the service in the right order
function parseRun(cursor) {
  takeKeyword(cursor);
  const calls = [takeCall(cursor, "RUN")];

  while (peekKeyword(cursor) === "THEN") {
    takeKeyword(cursor);
    calls.push(takeCall(cursor, "THEN"));
  }
  return { kind: "order", calls };  // A bare RUN is a valid one-call program; THEN is what makes it order-based
}

// Analyze and parse the IF block, checking for possible ELSE or innested IFs
function parseIf(cursor) {
  const condition = parseCondition(takeKeywordLine(cursor));

  if (peekKeyword(cursor) !== "DO") {
    throw new Error(`expected DO after IF, got: "${peek(cursor) ?? "end of program"}"`);
  }
  takeKeyword(cursor);
  const consequent = parseBlock(cursor, ["ELSE", "END"]); // The parsing stops only if it find the keywords ELSE or END. From here it can recursively come back here for nested IFs

  let alternative = [];
  if (peekKeyword(cursor) === "ELSE") {
    takeKeyword(cursor);
    alternative = parseBlock(cursor, ["END"]);            // The parsing stops only if it find the keyword END
  }

  if (peekKeyword(cursor) !== "END") {                    // Every IF must end with END
    throw new Error(`expected END to close IF, got: "${peek(cursor) ?? "end of program"}"`);
  }
  takeKeyword(cursor);

  if (consequent.length === 0) throw new Error("an IF statement needs at least one command after DO");
  return { kind: "condition", test: condition, consequent, alternative };
}

function parseStatement(cursor) {
  const keyword = peekKeyword(cursor);

  if (keyword === "RUN")  return parseRun(cursor);
  if (keyword === "IF")   return parseIf(cursor);

  // ELSE, END and THEN only ever appear inside a statement, so meeting one here means the block it belonged to was never opened
  if (keyword === "ELSE" || keyword === "END")  throw new Error(`"${keyword}" without a matching IF`);
  if (keyword === "THEN")                       throw new Error('"THEN" without a matching RUN');
  if (keyword !== null)                         throw new Error(`"${keyword}" cannot start a statement`);

  const call = parseCall(cursor.lines[cursor.i]);   // A bare service call is a statement, so body lines need no RUN
  cursor.i++;
  return { kind: "order", calls: [call] };
}

// Parses the statements within a block
function parseBlock(cursor, stopKeywords) {
  const statements = [];

  // Statements are parsed until they hit a "stopKeyword"
  while (peek(cursor) !== null && !stopKeywords.includes(peekKeyword(cursor))) {
    statements.push(parseStatement(cursor));
  }
  return statements;
}

// Initial parse of the program
function parseProgram(source) {
  const lines = source.split("\n")                      // Divided into lines
    .map((line) => line.replace(/\/\/.*$/, "").trim())  // Commented lines are discarded 
    .filter((line) => line !== "");                     // Empty lines are discarded 

  // We give no "stopKeyword" to the "parseBlock" function, so every statement has to be parsed. Also ELSE and END out of place can be caught
  return parseBlock({ lines, i: 0 }, []);
}

// --- Orchestrator ---

function compare(left, op, right) {
  switch (op) {
    case ">":  return left > right;
    case "<":  return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    case "==": return left === right;
    case "!=": return left !== right;
    default:   return false;
  }
}

// Sends an MQTT request, wait for its reply, and only continue down the chain if it succeeds
async function runOrder(statement, depth) {
  const single = statement.calls.length === 1;
  log(single
    ? `[single call] ${describe(statement.calls[0])}`
    : `[order-based] ${statement.calls.map(describe).join(" THEN ")}`, "info", depth);

  for (let i = 0; i < statement.calls.length; i++) {
    const call = statement.calls[i];
    const reply = await mqtt_send(call.rpi, call.name, call.args, depth + 1);

    if (reply.status !== "Successful") {
      if (single) return;
      const skipped = statement.calls.length - i - 1;   // Calculate how many operations were left
      log(`chain stopped: ${describe(call)} was unsuccessful, ${skipped} call(s) skipped`, "fail", depth + 1);
      return;
    }
  }

  if (!single) log("chain completed", "ok", depth + 1);
}

// Returns true if the predicate is true
async function evaluatePredicate(predicate, depth) {
  const reply = await mqtt_send(predicate.call.rpi, predicate.call.name, predicate.call.args, depth);

  if (reply.status !== "Successful") {
    throw new PredicateError(`${describe(predicate.call)} was unsuccessful`);
  }
  if (typeof reply.result !== "number") {
    throw new PredicateError(`${describe(predicate.call)} returned no value to compare`);
  }

  const holds = compare(reply.result, predicate.op, predicate.value);   // The predicates are compared
  log(`${reply.result} ${predicate.op} ${predicate.value} is ${holds}`, holds ? "ok" : "info", depth);
  return holds;
}

// Evaluates the IF condition evaluating its predicates
async function evaluateCondition(expr, depth) {
  for (const andTerm of expr.terms) {   // We extract an AND term between the ORs
    let holds = true;

    for (const predicate of andTerm.terms) {
      if (!holds) {
        log(`skipped ${describe(predicate.call)} ${predicate.op} ${predicate.value} (short-circuit)`, "other", depth);
        continue;   // We use continue instead of break just to log the skipped evaluations
      }
      holds = await evaluatePredicate(predicate, depth);
    }
    if (holds) return true;   // We evaluate an OR of ANDs, so at the first AND we have a true condition
  }
  return false;
}

// Evaluate the condition, then run exactly one branch: the DO body, the ELSE body, or neither when the condition is false and there is no ELSE
async function runCondition(statement, depth) {
  const describe_condition = statement.test.terms.map((andTerm) => andTerm.terms.map((predicate) => 
  `${describe(predicate.call)} ${predicate.op} ${predicate.value}`)
  .join(" AND ")).join(" OR ");
  log(`[condition-based] IF ${describe_condition}`, "info", depth);

  let holds;
  try {
    holds = await evaluateCondition(statement.test, depth + 1);   // Check the IF condition
  } catch (err) {
    if (!(err instanceof PredicateError)) throw err;
    log(`not evaluated: ${err.message}, no branch run`, "fail", depth + 1);
    return;
  }

  const branch = holds ? statement.consequent : statement.alternative;   // Choosing the block to run
  log(`condition is ${holds}`, holds ? "ok" : "info", depth + 1);

  if (branch.length === 0) {
    log(holds ? "nothing to run" : "skipped: no ELSE branch", "info", depth + 1);
    return;
  }
  await runBlock(branch, depth + 1);
}

// Function that manage ordered and nested instruction to be initially parsed and then run
async function runBlock(statements, depth) {
  for (const statement of statements) {
    try {
      if (statement.kind === "order") await runOrder(statement, depth);
      else                            await runCondition(statement, depth);
    } catch (err) {
      log(`error: ${err.message}`, "error", depth);   // Error registered in the log, proceedes to the next block (Fault Tolerance)
    }
  }
}

// Function called when we press the "Run Button"
async function runProgram() {
  let statements;
  try {
    statements = parseProgram(programInput.value);
  } catch (err) {
    showMessage(err.message, "error");
    log(`parse error: ${err.message}`, "error");
    return;
  }

  if (statements.length === 0) {
    showMessage("Nothing to run.", "error");
    return;
  }

  runBtn.disabled = true;
  showMessage(`Running ${statements.length} statement(s)…`);
  log(`--- run: ${statements.length} statement(s) ---`, "info");

  await runBlock(statements, 0);

  log("--- done ---", "info");
  showMessage("Run finished.", "success");
  runBtn.disabled = false;
}

// --- MQTT ---

function handleMessage(topic, payloadStr) {
  const suffix = topic.slice(TOPIC_PREFIX.length);

  let data;
  try {
    data = JSON.parse(payloadStr);
  } catch {
    return;
  }

  switch (suffix) {
    case "services": {
      const services = data.services || [];
      renderCatalogue(services);
      log(`catalogue received: ${services.length} services from ${data.thing}`, "info");
      break;
    }
    case "reply":
      handleReply(data);
      break;
    case "status":
      if (data.status === "online") setDeviceStatus("ok", "online");
      else setDeviceStatus("error", "offline");
      break;
  }
}

function connect() {
  const host = hostInput.value.trim();
  if (!host) {
    showMessage("Enter the device address first.", "error");
    return;
  }
  localStorage.setItem(STORAGE_KEY, host);

  if (client) {
    client.end(true);
  }

  setBrokerStatus("unknown", "connecting…");
  setDeviceStatus("unknown", "unknown");
  client = mqtt.connect(`ws://${host}:9001`);

  client.on("connect", () => {
    setBrokerStatus("ok", "connected");
    showMessage("Connected to broker.", "success");
    // services is retained, so the catalogue arrives immediately on subscribe.
    client.subscribe([
      `${TOPIC_PREFIX}services`,
      `${TOPIC_PREFIX}reply`,
      `${TOPIC_PREFIX}status`,
    ], { qos: 1 });
  });

  client.on("reconnect", () => setBrokerStatus("unknown", "reconnecting…"));

  client.on("close", () => {
    setBrokerStatus("error", "disconnected");
    setDeviceStatus("unknown", "unknown");
  });

  client.on("error", (err) => {
    setBrokerStatus("error", "error");
    showMessage(`MQTT error: ${err.message}`, "error");
  });

  client.on("message", (topic, payload) => handleMessage(topic, payload.toString()));
}

connectBtn.addEventListener("click", connect);
runBtn.addEventListener("click", runProgram);
clearLogBtn.addEventListener("click", () => {
  logPanel.replaceChildren();
  showMessage("");
});

// Restore the last used host and auto-connect.
const savedHost = localStorage.getItem(STORAGE_KEY);
if (savedHost) {
  hostInput.value = savedHost;
  connect();
}
