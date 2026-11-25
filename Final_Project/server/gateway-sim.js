// A simulated Atlas space: the Lab 4 thing AT_BoarAirSensor, announced with the
// same tweets the real middleware sends and answering calls with the same
// semantics. It exists so the IDE can be developed, demonstrated and tested
// without a Raspberry Pi — and as the fallback if the hardware misbehaves.
//
// The service metadata below is copied from Lab4/PartTwo/Atlas_IoTDDL.xml; the
// behaviour from Lab4/PartOne/device/main.cpp: inputs are clamped to the nearest
// allowed value rather than refused, and the actuators report the last value
// they were commanded, because neither can be read back from the hardware.

const THING = "AT_BoarAirSensor";
const SPACE = "BoarSmartSpace";

/** How long the thing waits after each call, as the real Atlas does. */
const CALL_GAP_MS = 300;
/** Spacing between tweets, so the start-up scan is visible. */
const TWEET_GAP_MS = 60;

const SERVICES = [
  // entity, name, Type, inputs, output        (output NULL means void)
  ["ClimateSensor", "Calibrate_Sensor", "Report", [], ["Calibration", "int"]],
  ["ClimateSensor", "Read_Temp", "Report", [["F_or_C", "int"]], ["Temperature", "int"]],
  ["ClimateSensor", "Read_Humidity", "Report", [], ["Humidity", "int"]],
  ["Fan", "Fan_On", "Action", [["speed", "int"]], ["Fan_speed", "int"]],
  ["Fan", "Fan_Off", "Action", [], null],
  ["Fan", "Read_Fan_Speed", "Report", [], ["Fan_speed", "int"]],
  ["Fan", "Read_Fan_Status", "Report", [], ["Fan_status", "int"]],
  ["Window", "Set_Window", "Action", [["angle", "int"]], ["Window_angle", "int"]],
  ["Window", "Window_Close", "Action", [], null],
  ["Window", "Read_Window_Position", "Report", [], ["Window_angle", "int"]],
];

const ENTITIES = [
  ["ClimateSensor", "Temperature and Humidity Sensor DHT11"],
  ["Fan", "Fan Motor 2N2222"],
  ["Window", "Servo Motor"],
];

// Exactly the relationships declared in Atlas/ConfigurationFiles/Atlas_IoTDDL.xml,
// entity by entity. The IDE must never show one the IoT-DDL does not declare.
const RELATIONSHIPS = [
  ["Calibrate before temperature", "order", "Calibrate_Sensor", "Read_Temp", "Calibrate the sensor before reading the temperature"],
  ["Calibrate before humidity", "order", "Calibrate_Sensor", "Read_Humidity", "Calibrate the sensor before reading the humidity"],
  ["Fan On interference", "interfere", "Fan_On", "Fan_Off", "Turning on and off the fan should be concurrent"],
  ["Fan Off interference", "interfere", "Fan_Off", "Fan_On", "Turning on and off the fan should be concurrent"],
  ["Close interference", "interfere", "Window_Close", "Set_Window", "Setting and closing the window should be concurrent"],
  ["Set interference", "interfere", "Set_Window", "Window_Close", "Setting and closing the window should be concurrent"],
];

const RANGES = { Fan_On: [0, 75], Set_Window: [0, 50], Read_Temp: [0, 1] };

export function createSimGateway({ onTweet, callGapMs = CALL_GAP_MS } = {}) {
  // What the actuators were last told to do: Lab 4 keeps this in /tmp files.
  const state = { fanSpeed: 0, windowAngle: 0, startedAt: Date.now() };
  const timers = [];
  let busyUntil = 0;

  function emitLater(tweet, index) {
    timers.push(setTimeout(() => onTweet?.(tweet), index * TWEET_GAP_MS));
  }

  function start() {
    const tweets = buildTweets();
    tweets.forEach(emitLater);
  }

  function stop() {
    for (const timer of timers) clearTimeout(timer);
    timers.length = 0;
  }

  async function call({ service, args = [] }) {
    // Calls to one thing are serialised and spaced, as Atlas requires.
    const wait = Math.max(0, busyUntil - Date.now());
    busyUntil = Date.now() + wait + callGapMs;
    if (wait > 0) await sleep(wait);

    const spec = SERVICES.find(([, name]) => name === service);
    if (!spec) return { status: "Unsuccessful", result: null, description: "Unknown Service" };

    const [, , , inputs] = spec;
    if (inputs.length !== args.length) {
      return { status: "Unsuccessful", result: null, description: "Incorrect service arguments" };
    }

    await sleep(callGapMs);
    return { status: "Successful", ...run(service, args, state), description: "" };
  }

  return { name: "simulator", start, stop, call };
}

// --- behaviour ---------------------------------------------------------------

function run(service, args, state) {
  const clamped = (value, [low, high]) => Math.min(high, Math.max(low, value));

  switch (service) {
    case "Calibrate_Sensor":
      return { result: 1 };

    case "Read_Temp": {
      // A slow swing, so a condition-based app actually changes its mind.
      const celsius = Math.round(22 + 8 * Math.sin((Date.now() - state.startedAt) / 30000));
      const fahrenheit = Math.round(celsius * 1.8 + 32);
      return { result: clamped(args[0] ?? 0, RANGES.Read_Temp) === 1 ? fahrenheit : celsius };
    }

    case "Read_Humidity":
      return { result: Math.round(50 + 20 * Math.sin((Date.now() - state.startedAt) / 41000)) };

    case "Fan_On":
      state.fanSpeed = clamped(args[0], RANGES.Fan_On);
      return { result: state.fanSpeed };

    case "Fan_Off":
      state.fanSpeed = 0;
      return { result: null };

    case "Read_Fan_Speed":
      return { result: state.fanSpeed };

    case "Read_Fan_Status":
      return { result: state.fanSpeed > 0 ? 1 : 0 };

    case "Set_Window":
      state.windowAngle = clamped(args[0], RANGES.Set_Window);
      return { result: state.windowAngle };

    case "Window_Close":
      state.windowAngle = 0;
      return { result: null };

    case "Read_Window_Position":
      return { result: state.windowAngle };

    default:
      return { result: null };
  }
}

// --- the tweets it announces itself with ------------------------------------

function buildTweets() {
  const common = { "Thing ID": THING, "Space ID": SPACE };

  return [
    {
      "Tweet Type": "Identity_Thing",
      ...common,
      Name: "Smart Air Quality Sensor",
      Model: "",
      Vendor: "",
      Owner: "BoarGroup",
      Description: "Air quality control system",
      OS: "Raspbian",
    },
    {
      "Tweet Type": "Identity_Language",
      ...common,
      "Network Name": "GL-SFT1200",
      "Communication Language": "MQTT",
      IP: "127.0.0.1",
      Port: "6668",
    },
    ...ENTITIES.map(([id, name]) => ({
      "Tweet Type": "Identity_Entity",
      ...common,
      Name: name,
      ID: id,
      Type: "",
      Owner: "BoarGroup",
      Vendor: "",
      Description: "",
    })),
    ...SERVICES.map(([entity, name, type, inputs, output]) => ({
      "Tweet Type": "Service",
      ...common,
      "Entity ID": entity,
      Name: name,
      Vendor: "",
      API: serviceApi(name, inputs, output),
      Type: type,
      AppCategory: "",
      Description: "",
      Keywords: "",
    })),
    ...RELATIONSHIPS.map(([name, type, first, second, description]) => ({
      "Tweet Type": "Relationship",
      ...common,
      Name: name,
      Owner: "BoarGroup",
      Category: "Cooperative",
      Type: type,
      Description: description,
      "FS name": first,
      "SS name": second,
    })),
  ];
}

/** The exact string Atlas builds: name:[inputs]:(output), with NULL for none. */
function serviceApi(name, inputs, output) {
  const inputPart = inputs.length === 0
    ? "NULL"
    : inputs.map(([inputName, type]) => `${inputName},${type}, NULL`).join("|");
  const outputPart = output ? `${output[0]},${output[1]}, NULL` : "NULL";
  return `${name}:[${inputPart}]:(${outputPart})`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
