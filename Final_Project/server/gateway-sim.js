// A simulated Atlas space: the Lab 4 thing AT_BoarAirSensor, announced with the
// same tweets the real middleware sends and answering calls with the same
// semantics. It exists so the IDE can be developed, demonstrated and tested
// without a Raspberry Pi — and as the fallback if the hardware misbehaves.
//
// The service metadata below is copied from Lab4/PartTwo/Atlas_IoTDDL.xml; the
// behaviour from Lab4/PartOne/device/main.cpp: inputs are clamped to the nearest
// allowed value rather than refused, and the actuators report the last value
// they were commanded, because neither can be read back from the hardware.
//
// A second thing, AT_BoarLamp, stands for another group's Raspberry Pi in the
// same space. It is not Lab 4 hardware: it is here so an app calling services
// on two things, and a user-defined relationship across things, can be built
// and run without the real space.

const THING = "AT_BoarAirSensor";
const LAMP_THING = "AT_BoarLamp";
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

// The second thing. Its service names do not clash with the air sensor's, so a
// call that names no thing still resolves to exactly one service.
const LAMP_SERVICES = [
  ["Lamp", "Lamp_On", "Action", [["level", "int"]], ["Lamp_level", "int"]],
  ["Lamp", "Lamp_Off", "Action", [], null],
  ["Lamp", "Read_Lamp_Level", "Report", [], ["Lamp_level", "int"]],
];

const LAMP_ENTITIES = [["Lamp", "Dimmable LED Lamp"]];

// Both of the lamp's advertised relationships stay inside the thing, because
// that is all the IoT-DDL Builder can express. A relationship between the lamp
// and the air sensor has to be defined in the IDE by hand.
const LAMP_RELATIONSHIPS = [
  ["Lamp On interference", "interfere", "Lamp_On", "Lamp_Off", "Turning the lamp on and off should be concurrent"],
  ["Dim after reading", "condition", "Read_Lamp_Level", "Lamp_On", "Set the level depending on the level read"],
];

// Lab 4's IoT-DDL only declares the two `interfere` relationships. The other two
// are the order-based and condition-based relationships the assignment asks for;
// they must be added to the real IoT-DDL before the hardware demo (see
// docs/tweets.md and README §4).
const RELATIONSHIPS = [
  ["Fan On interference", "interfere", "Fan_On", "Fan_Off", "Turning on and off the fan should be concurrent"],
  ["Fan Off interference", "interfere", "Fan_Off", "Fan_On", "Turning on and off the fan should be concurrent"],
  ["Vent after reading", "order", "Read_Temp", "Fan_On", "Read the temperature before driving the fan"],
  ["Open when hot", "condition", "Read_Temp", "Set_Window", "Open the window depending on the temperature read"],
];

const RANGES = { Fan_On: [0, 75], Set_Window: [0, 50], Read_Temp: [0, 1], Lamp_On: [0, 100] };

export function createSimGateway({ onTweet, callGapMs = CALL_GAP_MS } = {}) {
  // What the actuators were last told to do: Lab 4 keeps this in /tmp files.
  const state = { fanSpeed: 0, windowAngle: 0, lampLevel: 0, startedAt: Date.now() };
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

  async function call({ thing, service, args = [] }) {
    // Calls to one thing are serialised and spaced, as Atlas requires.
    const wait = Math.max(0, busyUntil - Date.now());
    busyUntil = Date.now() + wait + callGapMs;
    if (wait > 0) await sleep(wait);

    // A call that names a thing only reaches that thing's services, the way a
    // real call would: it goes to one thing's address.
    const spec = servicesOf(thing).find(([, name]) => name === service);
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

/** The services a call can reach: one thing's, or every one when none is named. */
function servicesOf(thing) {
  if (thing === THING) return SERVICES;
  if (thing === LAMP_THING) return LAMP_SERVICES;
  return [...SERVICES, ...LAMP_SERVICES];
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

    case "Lamp_On":
      state.lampLevel = clamped(args[0], RANGES.Lamp_On);
      return { result: state.lampLevel };

    case "Lamp_Off":
      state.lampLevel = 0;
      return { result: null };

    case "Read_Lamp_Level":
      return { result: state.lampLevel };

    default:
      return { result: null };
  }
}

// --- the tweets it announces itself with ------------------------------------

function buildTweets() {
  return [
    ...thingTweets({
      thing: THING,
      name: "Smart Air Quality Sensor",
      description: "Air quality control system",
      entities: ENTITIES,
      services: SERVICES,
      relationships: RELATIONSHIPS,
    }),
    ...thingTweets({
      thing: LAMP_THING,
      name: "Smart Lamp",
      description: "Dimmable lamp of another group in the same space",
      entities: LAMP_ENTITIES,
      services: LAMP_SERVICES,
      relationships: LAMP_RELATIONSHIPS,
    }),
  ];
}

/** The five tweets one thing introduces itself with, in the order Atlas sends them. */
function thingTweets({ thing, name, description, entities, services, relationships }) {
  const common = { "Thing ID": thing, "Space ID": SPACE };

  return [
    {
      "Tweet Type": "Identity_Thing",
      ...common,
      Name: name,
      Model: "",
      Vendor: "",
      Owner: "BoarGroup",
      Description: description,
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
    ...entities.map(([id, entityName]) => ({
      "Tweet Type": "Identity_Entity",
      ...common,
      Name: entityName,
      ID: id,
      Type: "",
      Owner: "BoarGroup",
      Vendor: "",
      Description: "",
    })),
    ...services.map(([entity, serviceName, type, inputs, output]) => ({
      "Tweet Type": "Service",
      ...common,
      "Entity ID": entity,
      Name: serviceName,
      Vendor: "",
      API: serviceApi(serviceName, inputs, output),
      Type: type,
      AppCategory: "",
      Description: "",
      Keywords: "",
    })),
    ...relationships.map(([relationshipName, type, first, second, relationshipDescription]) => ({
      "Tweet Type": "Relationship",
      ...common,
      Name: relationshipName,
      Owner: "BoarGroup",
      Category: "Cooperative",
      Type: type,
      Description: relationshipDescription,
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
