// Discovery: merging Atlas tweets into the space model, and the simulated thing
// that stands in for the Raspberry Pi.

import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { Space, parseServiceApi } from "../server/space.js";
import { createSimGateway } from "../server/gateway-sim.js";

// --- the API string Atlas packs a signature into ---------------------------

test("a service API with one input and an output", () => {
  assert.deepEqual(parseServiceApi("Read_Temp:[F_or_C,int, NULL]:(Temperature,int, NULL)"), {
    inputs: [{ name: "F_or_C", type: "int" }],
    output: { name: "Temperature", type: "int" },
  });
});

test("NULL means none, for inputs and for a void output", () => {
  assert.deepEqual(parseServiceApi("Fan_Off:[NULL]:(NULL)"), { inputs: [], output: null });
  assert.deepEqual(parseServiceApi("Calibrate_Sensor:[NULL]:(Calibration,int, NULL)"), {
    inputs: [],
    output: { name: "Calibration", type: "int" },
  });
});

test("several inputs are separated by a pipe", () => {
  const { inputs } = parseServiceApi("S:[a,int, NULL|b,int, NULL]:(o,int, NULL)");
  assert.deepEqual(inputs.map((input) => input.name), ["a", "b"]);
});

test("an API string we cannot read yields no signature rather than throwing", () => {
  assert.deepEqual(parseServiceApi("nonsense"), { inputs: [], output: null });
});

// --- merging tweets ---------------------------------------------------------

const tweet = (type, fields) => ({
  "Tweet Type": type,
  "Thing ID": "AT_Test",
  "Space ID": "TestSpace",
  ...fields,
});

function filledSpace() {
  const space = new Space({ id: "TestSpace" });
  space.applyTweet(tweet("Identity_Thing", { Name: "Test thing", Owner: "Boar", OS: "Raspbian" }));
  space.applyTweet(tweet("Identity_Language", { IP: "10.0.0.5", Port: "6668" }));
  space.applyTweet(tweet("Identity_Entity", { ID: "Fan", Name: "Fan Motor" }));
  space.applyTweet(
    tweet("Service", { "Entity ID": "Fan", Name: "Fan_On", Type: "Action", API: "Fan_On:[speed,int, NULL]:(s,int, NULL)" }),
  );
  return space;
}

test("the identity tweets describe the thing and how to reach it", () => {
  const [thing] = filledSpace().toJSON().things;

  assert.equal(thing.id, "AT_Test");
  assert.equal(thing.name, "Test thing");
  assert.equal(thing.os, "Raspbian");
  assert.equal(thing.ip, "10.0.0.5");
  assert.equal(thing.port, 6668);
});

test("a repeated tweet updates the thing instead of duplicating it", () => {
  const space = filledSpace();
  space.applyTweet(tweet("Identity_Thing", { Name: "Renamed" }));
  space.applyTweet(
    tweet("Service", { "Entity ID": "Fan", Name: "Fan_On", Type: "Action", API: "Fan_On:[NULL]:(NULL)" }),
  );

  const { things } = space.toJSON();
  assert.equal(things.length, 1);
  assert.equal(things[0].name, "Renamed");
  assert.equal(things[0].entities[0].services.length, 1, "the service was duplicated");
  assert.deepEqual(things[0].entities[0].services[0].inputs, [], "the service was not updated");
});

test("a service tweet arriving before its entity creates the entity", () => {
  const space = new Space({});
  space.applyTweet(tweet("Service", { "Entity ID": "Window", Name: "Set_Window", Type: "Action", API: "x:[NULL]:(NULL)" }));

  const [thing] = space.toJSON().things;
  assert.equal(thing.entities[0].id, "Window");
});

test("services are listed alphabetically, as requirement 2 asks", () => {
  const space = filledSpace();
  for (const name of ["Read_Fan_Status", "Fan_Off", "Read_Fan_Speed"]) {
    space.applyTweet(tweet("Service", { "Entity ID": "Fan", Name: name, Type: "Report", API: `${name}:[NULL]:(NULL)` }));
  }

  const [thing] = space.toJSON().things;
  assert.deepEqual(thing.entities[0].services.map((service) => service.name), [
    "Fan_Off",
    "Fan_On",
    "Read_Fan_Speed",
    "Read_Fan_Status",
  ]);
});

test("an entity that can act is an actuator, one that only reports is a sensor", () => {
  const space = filledSpace();
  space.applyTweet(tweet("Identity_Entity", { ID: "ClimateSensor", Name: "DHT11" }));
  space.applyTweet(
    tweet("Service", { "Entity ID": "ClimateSensor", Name: "Read_Temp", Type: "Report", API: "x:[NULL]:(NULL)" }),
  );

  const roles = Object.fromEntries(
    space.toJSON().things[0].entities.map((entity) => [entity.id, entity.role]),
  );
  assert.deepEqual(roles, { ClimateSensor: "sensor", Fan: "actuator" });
});

test("relationships are kept, and repeats do not pile up", () => {
  const space = filledSpace();
  const relationship = { Name: "Calibrate before temperature", Type: "order", "FS name": "Calibrate_Sensor", "SS name": "Read_Temp" };
  space.applyTweet(tweet("Relationship", relationship));
  space.applyTweet(tweet("Relationship", relationship));

  const [thing] = space.toJSON().things;
  assert.equal(thing.relationships.length, 1);
  assert.equal(thing.relationships[0].type, "order");
});

test("a tweet type we do not know is ignored, not fatal", () => {
  const space = filledSpace();
  assert.equal(space.applyTweet(tweet("Something_New", {})), false);
  assert.equal(space.toJSON().things.length, 1);
});

test("a tweet without a thing id is ignored", () => {
  const space = new Space({});
  assert.equal(space.applyTweet({ "Tweet Type": "Identity_Thing" }), false);
});

// --- the start-up freeze ----------------------------------------------------

test("scanning ends once the space falls quiet", async () => {
  const space = new Space({ quietMs: 60, maxScanMs: 5000 });
  space.startScanning();
  assert.equal(space.toJSON().space.discovery, "scanning");

  space.applyTweet(tweet("Identity_Thing", { Name: "x" }));
  await delay(700);

  assert.equal(space.toJSON().space.discovery, "ready");
  space.stop();
});

test("scanning ends anyway if the space never falls quiet", async () => {
  const space = new Space({ quietMs: 10000, maxScanMs: 200 });
  space.startScanning();
  await delay(800);

  assert.equal(space.toJSON().space.discovery, "ready");
  space.stop();
});

// --- the simulated thing ----------------------------------------------------

test("the simulator announces the Lab 4 thing in full", async () => {
  const space = new Space({});
  const gateway = createSimGateway({ onTweet: (t) => space.applyTweet(t) });
  gateway.start();
  await delay(2200);
  gateway.stop();

  const [thing] = space.toJSON().things;
  assert.equal(thing.id, "AT_BoarAirSensor");
  assert.deepEqual(thing.entities.map((entity) => entity.id), ["ClimateSensor", "Fan", "Window"]);

  const services = thing.entities.flatMap((entity) => entity.services.map((service) => service.name));
  assert.equal(services.length, 10, "Lab 4 has ten services");
  assert.ok(services.includes("Read_Window_Position"));

  // Exactly the relationships of Atlas_IoTDDL.xml, nothing invented.
  const names = thing.relationships.map((relationship) => relationship.name).sort();
  assert.deepEqual(names, [
    "Calibrate before humidity",
    "Calibrate before temperature",
    "Close interference",
    "Fan Off interference",
    "Fan On interference",
    "Set interference",
  ]);
});

test("the simulator announces a second thing, so cross-thing apps can be built", async () => {
  const space = new Space({});
  const gateway = createSimGateway({ onTweet: (t) => space.applyTweet(t) });
  gateway.start();
  await delay(2200);
  gateway.stop();

  const { things } = space.toJSON();
  assert.deepEqual(things.map((thing) => thing.id), ["AT_BoarAirSensor", "AT_BoarLamp"]);
  assert.deepEqual(things[1].entities.map((entity) => entity.id), ["Lamp"]);
  assert.deepEqual(things[1].entities[0].services.map((service) => service.name), [
    "Lamp_Off",
    "Lamp_On",
    "Read_Lamp_Level",
  ]);
  // We do not have the other group's IoT-DDL, and the simulator never invents a
  // relationship, so the lamp advertises none. Anything linking it to the air
  // sensor has to be defined in the IDE.
  assert.deepEqual(things[1].relationships, []);
});

test("a call that names a thing only reaches that thing's services", async () => {
  const gateway = createSimGateway({ callGapMs: 0 });

  assert.equal((await gateway.call({ thing: "AT_BoarLamp", service: "Lamp_On", args: [60] })).result, 60);
  assert.equal(
    (await gateway.call({ thing: "AT_BoarAirSensor", service: "Lamp_On", args: [60] })).description,
    "Unknown Service",
    "the air sensor does not offer the lamp's services",
  );
});

test("the simulator keeps Lab 4's service behaviour", async () => {
  const gateway = createSimGateway({ callGapMs: 0 });
  const call = (service, args) => gateway.call({ service, args });

  // Out-of-range inputs are clamped to the nearest allowed value, not refused.
  assert.deepEqual(await call("Fan_On", [200]), { status: "Successful", result: 75, description: "" });
  assert.equal((await call("Read_Fan_Speed", [])).result, 75, "the fan reports what it was told");
  assert.equal((await call("Read_Fan_Status", [])).result, 1);

  // A void service answers with no value.
  assert.equal((await call("Fan_Off", [])).result, null);
  assert.equal((await call("Read_Fan_Status", [])).result, 0);

  assert.equal((await call("Set_Window", [-10])).result, 0);
  assert.equal((await call("Set_Window", [50])).result, 50);
  assert.equal((await call("Read_Window_Position", [])).result, 50);

  const fahrenheit = (await call("Read_Temp", [1])).result;
  const celsius = (await call("Read_Temp", [0])).result;
  assert.ok(fahrenheit > celsius, "F should read higher than C");
});

test("the simulator refuses unknown services and wrong arguments, as Lab 4 did", async () => {
  const gateway = createSimGateway({ callGapMs: 0 });

  const unknown = await gateway.call({ service: "Open_Door", args: [] });
  assert.equal(unknown.status, "Unsuccessful");
  assert.equal(unknown.description, "Unknown Service");

  const wrong = await gateway.call({ service: "Fan_On", args: [] });
  assert.equal(wrong.status, "Unsuccessful");
  assert.equal(wrong.description, "Incorrect service arguments");
});
