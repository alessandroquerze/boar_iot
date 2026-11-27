// Relationships: the one list the IDE shows, the file the user's own ones live
// in, the rules they have to satisfy, and the HTTP API behind the dialog.
//
// Three assumptions are pinned down here: user relationships survive a restart,
// they may link two different things, and advertised ones are read-only.

import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { after, before, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RelationshipStore, buildRelationship } from "../server/relationships.js";
import { Space } from "../server/space.js";
import {
  conditionTextFor,
  suggestionLabel,
  suggestionsFor,
} from "../public/relationship-guidance.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- a space with two things -------------------------------------------------

const AIR = "AT_BoarAirSensor";
const LAMP = "AT_BoarLamp";

const tweet = (type, thing, fields) => ({
  "Tweet Type": type,
  "Thing ID": thing,
  "Space ID": "BoarSmartSpace",
  ...fields,
});

const serviceTweet = (thing, entity, name, output = ["v", "int"], inputs = "NULL") =>
  tweet("Service", thing, {
    "Entity ID": entity,
    Name: name,
    Type: "Report",
    API: `${name}:[${inputs}]:(${output ? `${output[0]},${output[1]}, NULL` : "NULL"})`,
  });

/**
 * Both things, their services, and the air sensor's advertised relationship.
 * The advertised one stays inside one entity, because that is all the IoT-DDL
 * Builder can express — the whole reason user-defined ones are needed.
 */
function twoThingSpace() {
  const space = new Space({ id: "BoarSmartSpace" });

  space.applyTweet(serviceTweet(AIR, "ClimateSensor", "Calibrate_Sensor", ["Calibration", "int"]));
  space.applyTweet(serviceTweet(AIR, "ClimateSensor", "Read_Temp", ["Temperature", "int"], "F_or_C,int, NULL"));
  space.applyTweet(serviceTweet(AIR, "Fan", "Fan_On", ["Fan_speed", "int"], "speed,int, NULL"));
  space.applyTweet(serviceTweet(AIR, "Fan", "Fan_Off", null));
  space.applyTweet(serviceTweet(LAMP, "Lamp", "Lamp_On", ["Lamp_level", "int"], "level,int, NULL"));
  space.applyTweet(serviceTweet(LAMP, "Lamp", "Lamp_Off", null));

  space.applyTweet(
    tweet("Relationship", AIR, {
      Name: "Calibrate before temperature",
      Type: "order",
      Description: "Calibrate the sensor before reading the temperature",
      "FS name": "Calibrate_Sensor",
      "SS name": "Read_Temp",
    }),
  );
  return space;
}

const endpoints = (relationship) => [
  `${relationship.first.thing}.${relationship.first.entity}.${relationship.first.service}`,
  `${relationship.second.thing}.${relationship.second.entity}.${relationship.second.service}`,
];

// --- resolving an advertised relationship -----------------------------------

test("a Relationship tweet that arrives before its Service tweets resolves later", () => {
  const space = new Space({});

  // The tweet only carries "FS name" / "SS name"; which entity owns the service
  // is not knowable until the Service tweet turns up.
  space.applyTweet(
    tweet("Relationship", AIR, {
      Name: "Calibrate before temperature",
      Type: "order",
      "FS name": "Calibrate_Sensor",
      "SS name": "Read_Temp",
    }),
  );

  let [relationship] = space.toJSON().relationships;
  assert.equal(relationship.source, "iot-ddl");
  assert.equal(relationship.resolved, false, "neither end has been heard yet");
  assert.equal(relationship.first.entity, "");
  assert.equal(relationship.first.service, "Calibrate_Sensor");

  space.applyTweet(serviceTweet(AIR, "ClimateSensor", "Calibrate_Sensor"));
  space.applyTweet(serviceTweet(AIR, "ClimateSensor", "Read_Temp"));

  [relationship] = space.toJSON().relationships;
  assert.deepEqual(endpoints(relationship), [
    `${AIR}.ClimateSensor.Calibrate_Sensor`,
    `${AIR}.ClimateSensor.Read_Temp`,
  ]);
  assert.equal(relationship.resolved, true);
});

test("an advertised relationship keeps a stable id across a re-announcement", () => {
  const space = twoThingSpace();
  const before = space.toJSON().relationships[0].id;

  space.applyTweet(
    tweet("Relationship", AIR, {
      Name: "Calibrate before temperature",
      Type: "order",
      Description: "edited in the IoT-DDL",
      "FS name": "Calibrate_Sensor",
      "SS name": "Read_Temp",
    }),
  );

  const { relationships } = space.toJSON();
  assert.equal(relationships.length, 1, "the repeat piled up");
  assert.equal(relationships[0].id, before);
  assert.equal(relationships[0].description, "edited in the IoT-DDL");
});

test("an endpoint whose thing is not in the space is kept, marked unresolved", () => {
  const space = new Space({});
  space.userRelationships = [
    {
      id: "user:offline",
      name: "Lamp follows fan",
      type: "order",
      description: "",
      first: { thing: AIR, entity: "Fan", service: "Fan_On" },
      second: { thing: LAMP, entity: "Lamp", service: "Lamp_On" },
    },
  ];

  const [relationship] = space.toJSON().relationships;
  assert.equal(relationship.resolved, false);
  // The last known entity is still shown, so the row stays readable.
  assert.deepEqual(endpoints(relationship), [`${AIR}.Fan.Fan_On`, `${LAMP}.Lamp.Lamp_On`]);
});

// --- validation -------------------------------------------------------------

const ok = {
  name: "Lamp follows fan",
  type: "order",
  first: { thing: AIR, service: "Fan_On" },
  second: { thing: LAMP, service: "Lamp_On" },
};

/** The error buildRelationship gives for a change on top of a valid input. */
function errorFor(changes, state = twoThingSpace().toJSON()) {
  return buildRelationship({ ...ok, ...changes }, state).error;
}

test("a relationship needs a short, non-empty name", () => {
  assert.match(errorFor({ name: "" }), /needs a name/);
  assert.match(errorFor({ name: "   " }), /needs a name/);
  assert.match(errorFor({ name: "x".repeat(60) }), /at most 40 characters/);
});

test("only order and condition can be defined by the developer", () => {
  assert.match(errorFor({ type: "interfere" }), /must be "order" or "condition"/);
  assert.match(errorFor({ type: "" }), /must be "order" or "condition"/);
  assert.equal(errorFor({ type: "order" }), null);
  assert.equal(errorFor({ type: "condition", first: { thing: AIR, service: "Read_Temp" } }), null);
});

test("both ends are needed", () => {
  assert.match(errorFor({ second: null }), /both ends are needed/);
  assert.match(errorFor({ first: { thing: AIR } }), /both ends are needed/);
  assert.match(errorFor({ second: { service: "Lamp_On" } }), /both ends are needed/);
});

test("the same service cannot be related to itself", () => {
  assert.match(
    errorFor({ second: { thing: AIR, service: "Fan_On" } }),
    /two different services/,
  );
});

test("an end that no thing offers is refused, with the thing named", () => {
  assert.match(errorFor({ first: { thing: AIR, service: "Open_Door" } }), /AT_BoarAirSensor does not offer Open_Door/);
  assert.match(errorFor({ second: { thing: "AT_Ghost", service: "Lamp_On" } }), /AT_Ghost does not offer Lamp_On/);
});

test("a condition relationship needs a first service that returns a value", () => {
  assert.match(
    errorFor({ type: "condition", first: { thing: AIR, service: "Fan_Off" } }),
    /returns nothing/,
  );
  // An order relationship does not care about the return value.
  assert.equal(errorFor({ type: "order", first: { thing: AIR, service: "Fan_Off" } }), null);
});

test("a duplicate of an advertised relationship is refused", () => {
  const error = errorFor({
    name: "My own version",
    type: "order",
    first: { thing: AIR, service: "Calibrate_Sensor" },
    second: { thing: AIR, service: "Read_Temp" },
  });

  assert.match(error, /already exists/);
  assert.match(error, /advertised by the thing/);
});

test("the same endpoints with a different type are not a duplicate", () => {
  assert.equal(
    errorFor({
      type: "condition",
      first: { thing: AIR, service: "Calibrate_Sensor" },
      second: { thing: AIR, service: "Read_Temp" },
    }),
    null,
  );
});

test("two ends on different things are allowed, and the entity is resolved", () => {
  const { error, relationship } = buildRelationship(ok, twoThingSpace().toJSON());

  assert.equal(error, null);
  assert.deepEqual(relationship.first, { thing: AIR, entity: "Fan", service: "Fan_On" });
  assert.deepEqual(relationship.second, { thing: LAMP, entity: "Lamp", service: "Lamp_On" });
  assert.match(relationship.id, /^user:/);
});

// --- the store --------------------------------------------------------------

let directory;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "atlas-rel-"));
});

test("a user relationship survives a new store instance", async () => {
  const space = twoThingSpace();
  const store = new RelationshipStore(directory);
  await store.load();

  const { error, relationship } = await store.add(ok, space.toJSON());
  assert.equal(error, null);

  // A fresh store reads the same file, as it does when the IDE restarts.
  const reopened = new RelationshipStore(directory);
  const list = await reopened.load();

  assert.equal(list.length, 1);
  assert.equal(list[0].id, relationship.id);
  assert.equal(list[0].name, "Lamp follows fan");
  assert.deepEqual(list[0].second, { thing: LAMP, entity: "Lamp", service: "Lamp_On" });
});

test("a duplicate of a stored user relationship is refused", async () => {
  const store = new RelationshipStore(directory);
  await store.load();

  const space = twoThingSpace();
  space.userRelationships = store.list();

  const { error } = await store.add({ ...ok, name: "Again" }, space.toJSON());
  assert.match(error, /already exists as "Lamp follows fan"/);
});

test("deleting a user relationship removes it from the file", async () => {
  const store = new RelationshipStore(directory);
  await store.load();
  const [saved] = store.list();

  const { status, error } = await store.remove(saved.id, { relationships: [] });
  assert.equal(error, null);
  assert.equal(status, 204);
  assert.equal((await new RelationshipStore(directory).load()).length, 0);
});

test("an advertised relationship cannot be deleted", async () => {
  const space = twoThingSpace();
  const store = new RelationshipStore(directory);
  await store.load();

  const advertised = space.toJSON().relationships.find((r) => r.source === "iot-ddl");
  const { status, error } = await store.remove(advertised.id, space.toJSON());

  assert.equal(status, 403);
  assert.match(error, /cannot be deleted/);
});

test("deleting something unknown is a 404, not a crash", async () => {
  const store = new RelationshipStore(directory);
  await store.load();

  const { status, error } = await store.remove("user:nope", { relationships: [] });
  assert.equal(status, 404);
  assert.match(error, /no such relationship/);
});

test("a missing or corrupt file means an empty list, not a crash", async () => {
  const empty = await mkdtemp(join(tmpdir(), "atlas-rel-empty-"));
  assert.deepEqual(await new RelationshipStore(empty).load(), []);

  await writeFile(join(empty, "relationships.json"), "{ not json");
  assert.deepEqual(await new RelationshipStore(empty).load(), []);

  // A well-formed file with a junk entry keeps the entries it can read.
  await writeFile(
    join(empty, "relationships.json"),
    JSON.stringify({ relationships: [{ id: "user:1", type: "nonsense" }] }),
  );
  assert.deepEqual(await new RelationshipStore(empty).load(), []);
});

test("the saved file is readable JSON, so it can be inspected by hand", async () => {
  const space = twoThingSpace();
  const store = new RelationshipStore(directory);
  await store.load();
  await store.add({ ...ok, name: "Readable" }, space.toJSON());

  const text = await readFile(join(directory, "relationships.json"), "utf8");
  assert.match(text, /\n {2}"format": "atlas-relationships"/);
  assert.ok(text.endsWith("\n"));
});

// --- editor guidance --------------------------------------------------------

test("guidance offers the relationships that start at the dropped service", () => {
  const space = twoThingSpace();
  space.userRelationships = [
    {
      id: "user:1",
      name: "Lamp follows fan",
      type: "order",
      description: "",
      first: { thing: AIR, entity: "Fan", service: "Fan_On" },
      second: { thing: LAMP, entity: "Lamp", service: "Lamp_On" },
    },
  ];
  space.applyTweet(
    tweet("Relationship", AIR, { Name: "Fan interference", Type: "interfere", "FS name": "Fan_On", "SS name": "Fan_Off" }),
  );

  const { relationships } = space.toJSON();

  // The user's own relationship is offered, and the interfere one is not.
  const offered = suggestionsFor(relationships, { thing: AIR, service: "Fan_On" });
  assert.deepEqual(offered.map((r) => r.name), ["Lamp follows fan"]);

  // Matching is on (thing, service): the same service name on another thing
  // does not pull in this relationship.
  assert.deepEqual(suggestionsFor(relationships, { thing: LAMP, service: "Fan_On" }), []);
  // Nor does the second end: there would be nothing to connect it to.
  assert.deepEqual(suggestionsFor(relationships, { thing: LAMP, service: "Lamp_On" }), []);
});

test("an unresolved relationship is never offered", () => {
  const space = new Space({});
  space.userRelationships = [
    {
      id: "user:1",
      name: "Lamp follows fan",
      type: "order",
      description: "",
      first: { thing: AIR, entity: "Fan", service: "Fan_On" },
      second: { thing: LAMP, entity: "Lamp", service: "Lamp_On" },
    },
  ];

  assert.deepEqual(suggestionsFor(space.toJSON().relationships, { thing: AIR, service: "Fan_On" }), []);
});

test("generated text qualifies the call with the thing, across things included", () => {
  const relationship = {
    type: "condition",
    first: { thing: AIR, entity: "ClimateSensor", service: "Read_Temp" },
    second: { thing: LAMP, entity: "Lamp", service: "Lamp_On" },
  };

  assert.equal(
    conditionTextFor(relationship, [{ name: "F_or_C", type: "int" }]),
    `${AIR}.Read_Temp(0) > 0`,
  );
  assert.equal(suggestionLabel(relationship), "if Read_Temp's value → Lamp_On");
  assert.equal(suggestionLabel({ ...relationship, type: "order" }), "then run Lamp_On");
});

// --- the HTTP API -----------------------------------------------------------

const PORT = 7124;
const base = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  // --simulate so there are things to relate; --apps so the file lands in a
  // temporary directory rather than in the repo's apps/.
  const appsDir = await mkdtemp(join(tmpdir(), "atlas-rel-api-"));
  server = spawn(
    "node",
    [join(root, "server/index.js"), "--port", String(PORT), "--simulate", "--apps", appsDir],
    { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
  );
  await once(server.stdout, "data");

  // Wait for the start-up scan to end, not just for the tweets we care about:
  // a thing's Identity tweet arrives before its Service tweets, so counting
  // things would let the test run against a half-discovered space.
  for (let attempt = 0; attempt < 120; attempt++) {
    const state = await (await fetch(`${base}/api/state`)).json();
    if (state.space.discovery === "ready" && state.things.length === 2) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("the simulated space never finished announcing itself");
});

after(() => server?.kill());

const post = (body) =>
  fetch(`${base}/api/relationships`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("the state carries advertised and user relationships in one list", async () => {
  const state = await (await fetch(`${base}/api/state`)).json();
  const advertised = state.relationships.filter((r) => r.source === "iot-ddl");

  assert.ok(advertised.length >= 6, "both things advertise relationships");
  assert.ok(advertised.every((r) => r.resolved), "every advertised end is discovered");
  // Advertised relationships never leave their thing.
  assert.ok(advertised.every((r) => r.first.thing === r.second.thing));
});

test("POST adds a cross-thing relationship and DELETE removes it", async () => {
  const added = await post({
    name: "Lamp follows fan",
    type: "order",
    description: "turn the lamp on once the fan is running",
    first: { thing: AIR, service: "Fan_On" },
    second: { thing: LAMP, service: "Lamp_On" },
  });
  const relationship = await added.json();

  assert.equal(added.status, 201);
  assert.equal(relationship.first.entity, "Fan");
  assert.equal(relationship.second.entity, "Lamp");

  const state = await (await fetch(`${base}/api/state`)).json();
  const stored = state.relationships.find((r) => r.id === relationship.id);
  assert.equal(stored.source, "user");
  assert.equal(stored.resolved, true);

  const deleted = await fetch(`${base}/api/relationships/${encodeURIComponent(relationship.id)}`, {
    method: "DELETE",
  });
  assert.equal(deleted.status, 204);

  const after = await (await fetch(`${base}/api/state`)).json();
  assert.ok(!after.relationships.some((r) => r.id === relationship.id));
});

test("POST answers 400 with the message the dialog shows", async () => {
  const response = await post({ name: "", type: "order", first: { thing: AIR, service: "Fan_On" } });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /needs a name/);
});

test("DELETE is 403 for an advertised relationship and 404 for an unknown one", async () => {
  const state = await (await fetch(`${base}/api/state`)).json();
  const advertised = state.relationships.find((r) => r.source === "iot-ddl");

  const refused = await fetch(`${base}/api/relationships/${encodeURIComponent(advertised.id)}`, {
    method: "DELETE",
  });
  assert.equal(refused.status, 403);
  assert.match((await refused.json()).error, /cannot be deleted/);

  const unknown = await fetch(`${base}/api/relationships/user:nope`, { method: "DELETE" });
  assert.equal(unknown.status, 404);

  // It is still there.
  const after = await (await fetch(`${base}/api/state`)).json();
  assert.ok(after.relationships.some((r) => r.id === advertised.id));
});
