// The relationships the developer defined in the IDE, saved beside the apps.
//
// Modelled on AppStore: one file in the Atlas working directory (--apps), read
// at start-up and rewritten after every change. Three assumptions this file
// encodes, all of them stated in README §5 and docs/tweets.md:
//   * user relationships persist across restarts, so they live in a file;
//   * they may link services on two different things, which the IoT-DDL
//     Builder cannot express — it only relates services of the same entity;
//   * relationships advertised by Atlas are read-only, so only the user's own
//     ones are ever written here or deleted.
// Nothing in this file executes anything: a relationship only guides the
// developer while an .iot app is being built.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FILE = "relationships.json";
const MAX_NAME = 40;
/** The only two kinds the developer may define (guidelines R2). */
export const USER_TYPES = ["order", "condition"];

export class RelationshipStore {
  constructor(directory) {
    this.directory = directory;
    this.file = join(directory, FILE);
    this.relationships = [];
  }

  async ready() {
    await mkdir(this.directory, { recursive: true });
  }

  /**
   * Read the file. A missing file is the normal first start, and a corrupt one
   * is not worth losing the IDE over, so both mean "no relationships yet".
   */
  async load() {
    await this.ready();
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8"));
      this.relationships = (parsed?.relationships ?? []).filter(isWellFormed);
    } catch {
      this.relationships = [];
    }
    return this.list();
  }

  /** The stored relationships. Copies, so a caller cannot edit the store. */
  list() {
    return this.relationships.map((relationship) => structuredClone(relationship));
  }

  /**
   * Add one. `state` is space.toJSON(): the services it carries are what the
   * endpoints are checked against, and its `relationships` are what a duplicate
   * is checked against — advertised ones included.
   * @returns {{error: string|null, relationship: object|null}}
   */
  async add(input, state) {
    const { error, relationship } = buildRelationship(input, state);
    if (error) return { error, relationship: null };

    this.relationships.push(relationship);
    await this.save();
    return { error: null, relationship: structuredClone(relationship) };
  }

  /**
   * Delete one by id. Advertised relationships belong to the thing's IoT-DDL,
   * not to the IDE, so they are refused rather than ignored.
   * @returns {{status: number, error: string|null}}
   */
  async remove(id, state) {
    const advertised = (state?.relationships ?? []).find(
      (relationship) => relationship.id === id && relationship.source === "iot-ddl",
    );
    if (advertised) {
      return {
        status: 403,
        error: `${advertised.name || id} was advertised by ${advertised.first.thing} and cannot be deleted`,
      };
    }

    const index = this.relationships.findIndex((relationship) => relationship.id === id);
    if (index === -1) return { status: 404, error: `no such relationship: ${id}` };

    this.relationships.splice(index, 1);
    await this.save();
    return { status: 204, error: null };
  }

  async save() {
    await this.ready();
    const body = {
      format: "atlas-relationships",
      version: 1,
      relationships: this.relationships,
    };
    await writeFile(this.file, `${JSON.stringify(body, null, 2)}\n`);
  }
}

// --- validation -------------------------------------------------------------

/**
 * Check one proposed relationship and turn it into the record that is stored.
 * Every message is written to be shown to the developer as it is.
 * @returns {{error: string|null, relationship: object|null}}
 */
export function buildRelationship(input, state) {
  const name = String(input?.name ?? "").trim();
  const type = String(input?.type ?? "").trim().toLowerCase();
  const description = String(input?.description ?? "").trim();

  if (name === "") return problem("a relationship needs a name");
  if (name.length > MAX_NAME) return problem(`a relationship name is at most ${MAX_NAME} characters`);

  if (!USER_TYPES.includes(type)) {
    return problem('a relationship type must be "order" or "condition"');
  }

  const first = readEndpoint(input?.first);
  const second = readEndpoint(input?.second);
  if (!first || !second) {
    return problem("both ends are needed: pick a first and a second service");
  }
  if (first.thing === second.thing && first.service === second.service) {
    return problem("a relationship needs two different services");
  }

  // Resolve against what the space actually advertised, so the stored entity is
  // the thing's own and not whatever the browser happened to send.
  const firstService = findService(state, first);
  const secondService = findService(state, second);
  if (!firstService) return problem(`${first.thing} does not offer ${first.service}`);
  if (!secondService) return problem(`${second.thing} does not offer ${second.service}`);

  // Type 3 compares the first service's return value, so there has to be one.
  if (type === "condition" && !firstService.service.output) {
    return problem(`a condition relationship needs a first service that returns a value, and ${first.service} returns nothing`);
  }

  const ends = {
    first: { thing: first.thing, entity: firstService.entity, service: first.service },
    second: { thing: second.thing, entity: secondService.entity, service: second.service },
  };

  const duplicate = (state?.relationships ?? []).find(
    (relationship) =>
      relationship.type === type &&
      sameEnd(relationship.first, ends.first) &&
      sameEnd(relationship.second, ends.second),
  );
  if (duplicate) {
    return problem(
      `that ${type} relationship already exists${duplicate.name ? ` as "${duplicate.name}"` : ""}` +
        `${duplicate.source === "iot-ddl" ? ", advertised by the thing" : ""}`,
    );
  }

  return {
    error: null,
    relationship: { id: `user:${randomUUID()}`, name, type, description, ...ends },
  };
}

function problem(error) {
  return { error, relationship: null };
}

/** An endpoint the browser sent. The entity is optional: it is resolved below. */
function readEndpoint(value) {
  const thing = String(value?.thing ?? "").trim();
  const service = String(value?.service ?? "").trim();
  return thing && service ? { thing, service, entity: String(value?.entity ?? "").trim() } : null;
}

function findService(state, endpoint) {
  const thing = (state?.things ?? []).find((candidate) => candidate.id === endpoint.thing);
  for (const entity of thing?.entities ?? []) {
    const service = entity.services.find((candidate) => candidate.name === endpoint.service);
    if (service) return { entity: entity.id, service };
  }
  return null;
}

/** Two ends are the same when they name the same service on the same thing. */
function sameEnd(left, right) {
  return left?.thing === right.thing && left?.service === right.service;
}

/** Keep a hand-edited or half-written file from poisoning the list. */
function isWellFormed(relationship) {
  return (
    typeof relationship?.id === "string" &&
    USER_TYPES.includes(relationship?.type) &&
    typeof relationship?.first?.thing === "string" &&
    typeof relationship?.first?.service === "string" &&
    typeof relationship?.second?.thing === "string" &&
    typeof relationship?.second?.service === "string"
  );
}
