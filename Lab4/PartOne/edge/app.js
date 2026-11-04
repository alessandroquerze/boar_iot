// Edge for Lab 4: displays the service vectors the thing advertises and runs
// small programs composed from the two relationships.
//
// All relationship logic lives here, in the Edge. The thing executes exactly one
// service per call; ordering, condition evaluation and branch selection are this
// file's job.
//
// Broker: ws://<host>:9001. Topics: vss/boar/{services,call,reply,status}.

const TOPIC_PREFIX = "vss/boar/";
const DEFAULT_RPI = "RPi1";
const CALL_TIMEOUT_MS = 10000;
const STORAGE_KEY = "vss_host";

const EXAMPLE_PROGRAM = `// order-based: B runs only after A succeeds
RUN  RPi1.Calibrate_Sensor()
THEN RPi1.Read_Temp(0)

// order-based: set, then verify what was actually applied
RUN  RPi1.Set_Window(120)
THEN RPi1.Read_Window_Position()

// condition-based: B runs on A's returned value
IF   RPi1.Read_Temp(0) > 28
DO   RPi1.Fan_On(75)
ELSE RPi1.Fan_Off()
`;

const hostInput = document.getElementById("host");
const connectBtn = document.getElementById("connectBtn");
const connStatus = document.getElementById("connStatus");
const deviceStatus = document.getElementById("deviceStatus");
const catalogueBody = document.getElementById("catalogueBody");
const programInput = document.getElementById("program");
const runBtn = document.getElementById("runBtn");
const exampleBtn = document.getElementById("exampleBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const logPanel = document.getElementById("log");
const message = document.getElementById("message");

let client = null;
let nextId = 1;

// id -> { resolve, timer }, so a reply can be matched to the call that made it.
const pending = new Map();

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

function log(text, kind = "") {
  const line = document.createElement("div");
  line.className = `log-line log-${kind}`;
  line.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  logPanel.appendChild(line);
  logPanel.scrollTop = logPanel.scrollHeight;
}

function describe(call) {
  return `${call.rpi}.${call.name}(${call.args.join(", ")})`;
}

// --- Service catalogue ---

function addCell(row, text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  row.appendChild(cell);
}

function renderCatalogue(services) {
  catalogueBody.replaceChildren();

  if (services.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "empty";
    cell.textContent = "The thing advertised an empty catalogue.";
    row.appendChild(cell);
    catalogueBody.appendChild(row);
    return;
  }

  for (const spec of services) {
    const row = document.createElement("tr");
    addCell(row, spec.rpi);
    addCell(row, spec.entity);
    addCell(row, spec.name, "mono");
    addCell(row, String(spec.ninputs));

    // One number box per declared input, so any service can be called ad hoc.
    const inputsCell = document.createElement("td");
    const boxes = [];
    for (const name of spec.inputs) {
      const box = document.createElement("input");
      box.type = "number";
      box.className = "arg";
      box.placeholder = name;
      box.title = name;
      inputsCell.appendChild(box);
      boxes.push(box);
    }
    if (boxes.length === 0) inputsCell.textContent = "–";
    row.appendChild(inputsCell);

    addCell(row, spec.output);

    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.className = "btn btn-secondary btn-small";
    button.textContent = "Call";
    button.addEventListener("click", () => callFromRow(spec, boxes));
    actionCell.appendChild(button);
    row.appendChild(actionCell);

    catalogueBody.appendChild(row);
  }
}

async function callFromRow(spec, boxes) {
  const args = [];
  for (const box of boxes) {
    const value = parseInt(box.value, 10);
    if (Number.isNaN(value)) {
      showMessage(`${spec.name}: "${box.placeholder}" must be an integer.`, "error");
      return;
    }
    args.push(value);
  }

  try {
    await invoke(spec.rpi, spec.name, args);
  } catch (err) {
    log(`error: ${err.message}`, "error");
  }
}

// --- Service calls ---

function invoke(rpi, name, args) {
  return new Promise((resolve, reject) => {
    if (!client || !client.connected) {
      reject(new Error("not connected to the broker"));
      return;
    }

    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for ${name}`));
    }, CALL_TIMEOUT_MS);

    pending.set(id, { resolve, timer });
    log(`call  ${rpi}.${name}(${args.join(", ")})`, "call");
    client.publish(
      `${TOPIC_PREFIX}call`,
      JSON.stringify({ id, service: name, inputs: args }),
      { qos: 1 }
    );
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
      ok ? "ok" : "fail");

  entry.resolve(data);
}

// --- Parser ---

const CALL_RE = /^(?:([A-Za-z0-9_-]+)\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)$/;
const KEYWORD_RE = /^(RUN|THEN|IF|DO|ELSE)\b\s*(.*)$/i;
const TEST_RE = /^(.*?)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/;

function parseCall(text) {
  const match = CALL_RE.exec(text.trim());
  if (!match) throw new Error(`not a service call: "${text.trim()}"`);

  const [, rpi, name, rawArgs] = match;
  const trimmed = rawArgs.trim();
  const args = [];

  if (trimmed !== "") {
    for (const piece of trimmed.split(",")) {
      const value = parseInt(piece.trim(), 10);
      if (Number.isNaN(value)) {
        throw new Error(`argument "${piece.trim()}" is not an integer in "${text.trim()}"`);
      }
      args.push(value);
    }
  }

  // The RPi prefix is optional but kept in the grammar: with more than one Pi
  // it is what selects the target thing.
  return { rpi: rpi || DEFAULT_RPI, name, args };
}

function parseOrder(lines, firstRest) {
  const calls = [parseCall(firstRest)];

  for (const line of lines.slice(1)) {
    const match = KEYWORD_RE.exec(line);
    if (!match || match[1].toUpperCase() !== "THEN") {
      throw new Error(`expected THEN after RUN, got: "${line}"`);
    }
    calls.push(parseCall(match[2]));
  }

  if (calls.length < 2) throw new Error("an order-based statement needs at least one THEN");
  return { kind: "order", calls };
}

function parseCondition(lines, firstRest) {
  const test = TEST_RE.exec(firstRest);
  if (!test) throw new Error(`expected "IF <call> <op> <int>", got: "IF ${firstRest}"`);

  const statement = {
    kind: "condition",
    test: parseCall(test[1]),
    op: test[2],
    value: parseInt(test[3], 10),
    consequent: null,
    alternative: null,
  };

  for (const line of lines.slice(1)) {
    const match = KEYWORD_RE.exec(line);
    if (!match) throw new Error(`expected DO or ELSE, got: "${line}"`);

    const keyword = match[1].toUpperCase();
    if (keyword === "DO") {
      if (statement.consequent) throw new Error("only one DO per IF");
      statement.consequent = parseCall(match[2]);
    } else if (keyword === "ELSE") {
      if (statement.alternative) throw new Error("only one ELSE per IF");
      statement.alternative = parseCall(match[2]);
    } else {
      throw new Error(`expected DO or ELSE, got "${keyword}"`);
    }
  }

  if (!statement.consequent) throw new Error("an IF statement needs a DO");
  return statement;
}

function parseStatement(lines) {
  const head = KEYWORD_RE.exec(lines[0]);
  if (!head) throw new Error(`a statement must start with RUN or IF: "${lines[0]}"`);

  const keyword = head[1].toUpperCase();
  if (keyword === "RUN") return parseOrder(lines, head[2]);
  if (keyword === "IF") return parseCondition(lines, head[2]);
  throw new Error(`"${keyword}" cannot start a statement`);
}

// Strips comments, then groups the remaining lines into statements on blank lines.
function parseProgram(source) {
  const blocks = [];
  let current = [];

  for (const raw of source.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (line === "") {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);

  return blocks.map(parseStatement);
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

// Call A, wait for its reply, and only continue down the chain if it succeeded.
async function runOrder(statement) {
  log(`[order-based] ${statement.calls.map(describe).join(" THEN ")}`, "info");

  for (let i = 0; i < statement.calls.length; i++) {
    const call = statement.calls[i];
    const reply = await invoke(call.rpi, call.name, call.args);

    if (reply.status !== "Successful") {
      const skipped = statement.calls.length - i - 1;
      log(`chain stopped: ${describe(call)} was unsuccessful, ${skipped} call(s) skipped`, "fail");
      return;
    }
  }

  log("chain completed", "ok");
}

// Call A, parse its result as an int, evaluate the predicate, then run exactly
// one branch (or none, when the predicate is false and there is no ELSE).
async function runCondition(statement) {
  log(`[condition-based] IF ${describe(statement.test)} ${statement.op} ${statement.value}`, "info");

  const reply = await invoke(statement.test.rpi, statement.test.name, statement.test.args);

  if (reply.status !== "Successful") {
    log(`not evaluated: ${describe(statement.test)} was unsuccessful, consequent skipped`, "fail");
    return;
  }
  if (typeof reply.result !== "number") {
    log(`not evaluated: ${describe(statement.test)} returned no value to compare`, "fail");
    return;
  }

  const holds = compare(reply.result, statement.op, statement.value);
  log(`condition ${reply.result} ${statement.op} ${statement.value} is ${holds}`, holds ? "ok" : "info");

  const branch = holds ? statement.consequent : statement.alternative;
  if (!branch) {
    log(`skipped: ${describe(statement.consequent)} not run, no ELSE branch`, "info");
    return;
  }

  await invoke(branch.rpi, branch.name, branch.args);
}

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

  // A failed statement stops its own chain only: the next statement is a
  // separate relationship and still gets its turn.
  for (const statement of statements) {
    try {
      if (statement.kind === "order") await runOrder(statement);
      else await runCondition(statement);
    } catch (err) {
      log(`error: ${err.message}`, "error");
    }
  }

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
exampleBtn.addEventListener("click", () => {
  programInput.value = EXAMPLE_PROGRAM;
});
clearLogBtn.addEventListener("click", () => {
  logPanel.replaceChildren();
  showMessage("");
});

programInput.value = EXAMPLE_PROGRAM;

// Restore the last used host and auto-connect.
const savedHost = localStorage.getItem(STORAGE_KEY);
if (savedHost) {
  hostInput.value = savedHost;
  connect();
}
