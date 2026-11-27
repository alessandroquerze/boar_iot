// The space model: what the IDE learned by listening to Atlas tweets.
//
// Tweets are merged by (thing, entity, service) so a thing that re-announces
// itself updates its entry instead of duplicating it. The shapes of the five
// discovery tweets are documented in docs/tweets.md.
//
// Relationships come from two places and are serialised into one list:
//   * advertised — Relationship tweets. The IoT-DDL Builder can only relate two
//     services of the same entity, so an advertised relationship never leaves
//     its thing. Atlas never executes them; they are read-only here.
//   * user-defined — written in the IDE and owned by server/relationships.js,
//     which persists them across restarts. They may link any two discovered
//     services, including services on two different things.
// Neither kind executes anything: they guide the developer while an .iot app is
// being built.

import { EventEmitter } from "node:events";

/** No tweet for this long means the space has finished introducing itself. */
const QUIET_MS = 3000;
/** …but never freeze the IDE for longer than this. */
const MAX_SCAN_MS = 15000;
/** A thing silent for this long is shown as stale rather than removed. */
const STALE_MS = 120000;

export class Space extends EventEmitter {
  constructor({ id = "unknown", ideAddress = "", quietMs = QUIET_MS, maxScanMs = MAX_SCAN_MS } = {}) {
    super();
    this.id = id;
    this.ideAddress = ideAddress;
    this.broker = "disconnected";
    this.discovery = "scanning";
    this.things = new Map();
    // Filled from server/relationships.js; empty until it has been loaded.
    this.userRelationships = [];

    this.quietMs = quietMs;
    this.maxScanMs = maxScanMs;
    this.scanStartedAt = Date.now();
    this.lastTweetAt = 0;
    this.scanTimer = null;
  }

  /** Begin the start-up scan the guidelines ask for: the IDE freezes until it ends. */
  startScanning() {
    this.discovery = "scanning";
    this.scanStartedAt = Date.now();
    this.lastTweetAt = 0;
    clearInterval(this.scanTimer);
    this.scanTimer = setInterval(() => this.checkScanFinished(), 500);
    this.changed();
  }

  stop() {
    clearInterval(this.scanTimer);
    this.scanTimer = null;
  }

  checkScanFinished() {
    if (this.discovery !== "scanning") return;

    const now = Date.now();
    const quiet = this.lastTweetAt > 0 && now - this.lastTweetAt > this.quietMs;
    const tooLong = now - this.scanStartedAt > this.maxScanMs;

    if (quiet || tooLong) {
      this.discovery = "ready";
      clearInterval(this.scanTimer);
      this.scanTimer = null;
      this.changed();
    }
  }

  setBroker(status) {
    if (this.broker === status) return;
    this.broker = status;
    this.changed();
  }

  /**
   * Hand the space the user-defined relationships the store holds. Called once
   * at start-up and after every add or delete, so one change broadcast carries
   * both kinds of relationship.
   */
  setUserRelationships(list) {
    this.userRelationships = list;
    this.changed();
  }

  changed() {
    this.emit("change", this.toJSON());
  }

  // --- tweets ---------------------------------------------------------------

  /** Merge one tweet into the model. Unknown tweet types are ignored. */
  applyTweet(tweet) {
    const type = tweet["Tweet Type"];
    const thingId = tweet["Thing ID"];
    if (!type || !thingId) return false;

    this.lastTweetAt = Date.now();
    const thing = this.thingFor(thingId, tweet["Space ID"]);
    thing.lastSeen = new Date().toISOString();

    switch (type) {
      case "Identity_Thing":
        Object.assign(thing, {
          name: tweet.Name || thing.name,
          model: tweet.Model ?? "",
          vendor: tweet.Vendor ?? "",
          owner: tweet.Owner ?? "",
          description: tweet.Description ?? "",
          os: tweet.OS ?? "",
        });
        break;

      case "Identity_Language":
        Object.assign(thing, {
          ip: tweet.IP ?? thing.ip,
          port: Number(tweet.Port) || thing.port,
          network: tweet["Network Name"] ?? "",
          language: tweet["Communication Language"] ?? "",
        });
        break;

      case "Identity_Entity": {
        const entity = this.entityFor(thing, tweet.ID || tweet.Name);
        Object.assign(entity, {
          name: tweet.Name ?? entity.name,
          type: tweet.Type ?? "",
          owner: tweet.Owner ?? "",
          vendor: tweet.Vendor ?? "",
          description: tweet.Description ?? "",
        });
        break;
      }

      case "Service": {
        const entity = this.entityFor(thing, tweet["Entity ID"]);
        const { inputs, output } = parseServiceApi(tweet.API ?? "");
        const service = {
          name: tweet.Name,
          // Atlas marks a sensor-type service Report and an actuator-type one
          // Action: that is what sorts entities into sensors and actuators.
          type: tweet.Type ?? "",
          description: tweet.Description ?? "",
          keywords: splitList(tweet.Keywords),
          inputs,
          output,
        };
        const existing = entity.services.findIndex((s) => s.name === service.name);
        if (existing === -1) entity.services.push(service);
        else entity.services[existing] = service;
        entity.services.sort((a, b) => a.name.localeCompare(b.name));
        break;
      }

      case "Relationship": {
        const relationship = {
          name: tweet.Name ?? "",
          type: (tweet.Type ?? "").toLowerCase(),
          description: tweet.Description ?? "",
          first: tweet["FS name"] ?? "",
          second: tweet["SS name"] ?? "",
        };
        const key = (r) => `${r.name}|${r.first}|${r.second}`;
        const existing = thing.relationships.findIndex((r) => key(r) === key(relationship));
        if (existing === -1) thing.relationships.push(relationship);
        else thing.relationships[existing] = relationship;
        break;
      }

      default:
        return false;
    }

    if (!this.id || this.id === "unknown") this.id = tweet["Space ID"] ?? this.id;
    this.changed();
    return true;
  }

  thingFor(id, spaceId) {
    let thing = this.things.get(id);
    if (!thing) {
      thing = {
        id,
        spaceId: spaceId ?? "",
        name: id,
        owner: "",
        description: "",
        os: "",
        ip: "",
        port: 6668,
        lastSeen: "",
        entities: [],
        relationships: [],
      };
      this.things.set(id, thing);
    }
    return thing;
  }

  entityFor(thing, id) {
    const entityId = id || "unknown";
    let entity = thing.entities.find((candidate) => candidate.id === entityId);
    if (!entity) {
      entity = { id: entityId, name: entityId, type: "", description: "", services: [] };
      thing.entities.push(entity);
      thing.entities.sort((a, b) => a.id.localeCompare(b.id));
    }
    return entity;
  }

  // --- what the browser sees -------------------------------------------------

  toJSON() {
    const now = Date.now();
    return {
      space: {
        id: this.id,
        ideAddress: this.ideAddress,
        broker: this.broker,
        discovery: this.discovery,
      },
      things: [...this.things.values()].map((thing) => ({
        ...thing,
        stale: thing.lastSeen ? now - Date.parse(thing.lastSeen) > STALE_MS : false,
        entities: thing.entities.map((entity) => ({ ...entity, role: roleOf(entity) })),
      })),
      relationships: this.relationshipList(),
    };
  }

  /**
   * Every relationship the IDE knows, advertised first. Endpoints are resolved
   * here rather than when the tweet arrives, because a Relationship tweet can
   * reach us before the Service tweet it names — the entity is only knowable
   * once the service has been heard.
   */
  relationshipList() {
    const advertised = [];
    for (const thing of this.things.values()) {
      for (const relationship of thing.relationships) {
        advertised.push({
          id: advertisedId(thing.id, relationship),
          name: relationship.name,
          type: relationship.type,
          description: relationship.description,
          source: "iot-ddl",
          first: this.endpoint(thing.id, relationship.first),
          second: this.endpoint(thing.id, relationship.second),
          resolved: false, // set below, once both endpoints are known
        });
      }
    }

    const user = this.userRelationships.map((relationship) => ({
      ...relationship,
      source: "user",
      // Re-resolve the entity each time: the thing may have been rediscovered
      // under a different entity, or not be in the space at all right now.
      first: this.endpoint(relationship.first.thing, relationship.first.service, relationship.first.entity),
      second: this.endpoint(relationship.second.thing, relationship.second.service, relationship.second.entity),
      resolved: false,
    }));

    // An endpoint whose thing is offline keeps its last known entity and is
    // marked unresolved; it is never dropped, so nothing silently disappears.
    for (const relationship of [...advertised, ...user]) {
      relationship.resolved = relationship.first.found && relationship.second.found;
      delete relationship.first.found;
      delete relationship.second.found;
    }
    return [...advertised, ...user];
  }

  /** Where a service lives: the entity that advertised it, if we have heard it. */
  endpoint(thingId, serviceName, fallbackEntity = "") {
    const thing = this.things.get(thingId);
    for (const entity of thing?.entities ?? []) {
      if (entity.services.some((service) => service.name === serviceName)) {
        return { thing: thingId, entity: entity.id, service: serviceName, found: true };
      }
    }
    return { thing: thingId, entity: fallbackEntity, service: serviceName, found: false };
  }
}

/**
 * A stable id for an advertised relationship. There is no id in the tweet, so
 * it is derived from the fields space.js already merges on, which means the id
 * survives a thing re-announcing itself.
 */
function advertisedId(thingId, relationship) {
  return ["iot-ddl", thingId, relationship.name, relationship.first, relationship.second].join("|");
}

/** An entity that can act is an actuator; one that only reports is a sensor. */
function roleOf(entity) {
  if (entity.services.length === 0) return "unknown";
  return entity.services.some((service) => service.type === "Action") ? "actuator" : "sensor";
}

/**
 * Atlas packs a service's signature into one string:
 *   Read_Temp:[F_or_C,int, NULL]:(Temperature,int, NULL)
 * Inputs are joined with "|", the third field of each triple is an unused range
 * slot, and a lone NULL means "none".
 */
export function parseServiceApi(api) {
  const match = /^([^:]*):\[(.*)\]:\((.*)\)$/.exec(api.trim());
  if (!match) return { inputs: [], output: null };

  const [, , inputPart, outputPart] = match;
  return {
    inputs: inputPart.trim() === "NULL" || inputPart.trim() === ""
      ? []
      : inputPart.split("|").map(parseTriple),
    output: outputPart.trim() === "NULL" || outputPart.trim() === "" ? null : parseTriple(outputPart),
  };
}

function parseTriple(part) {
  const [name = "", type = ""] = part.split(",");
  return { name: name.trim(), type: type.trim() };
}

function splitList(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
