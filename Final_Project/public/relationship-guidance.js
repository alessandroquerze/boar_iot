// Which relationships the editor can build, and the text one generates. No DOM
// here, so the rules can be tested on their own (tests/relationships.test.js).
//
// A relationship never executes anything: all it does is build the edge or the
// IF the developer would otherwise draw by hand. Two ways in, both using the
// rules below: dragging a relationship out of the Devices panel onto the canvas,
// and the suggestions offered when a service is dropped.

/** The two kinds the editor can act on. Anything else is shown but not offered. */
export const GUIDED_TYPES = ["order", "condition"];

/** The value a suggested IF compares against, for the developer to replace. */
export const PLACEHOLDER_VALUE = 0;

/**
 * Whether the editor can turn this relationship into blocks. An `interfere`
 * relationship says two services conflict, which is not a program; an
 * unresolved one has an end that is not in the space right now, so the block it
 * would add could not be called. Both are shown in the panel, neither is built.
 */
export function isActionable(relationship) {
  return Boolean(relationship?.resolved) && GUIDED_TYPES.includes(relationship?.type);
}

/**
 * The relationships that start at the service just dropped. Only the first end
 * is matched: the suggestion adds the second service after the dropped one, so
 * a relationship whose *second* end was dropped has nothing to connect to yet.
 *
 * @param {Array<object>} relationships  state.relationships, both sources
 * @param {{thing: string, service: string}} dropped
 */
export function suggestionsFor(relationships, { thing, service }) {
  return (relationships ?? []).filter(
    (relationship) =>
      isActionable(relationship) &&
      relationship.first.thing === thing &&
      relationship.first.service === service,
  );
}

/**
 * The text of a call to one end. Always qualified with the thing, which covers
 * the cross-thing case the IDE has to support and matches the service blocks,
 * whose printed form carries the thing too. A bare service name would be
 * ambiguous as soon as two things offer the same service.
 */
export function callTextFor(endpoint, inputs = []) {
  return `${endpoint.thing}.${endpoint.service}(${inputs.map(() => String(PLACEHOLDER_VALUE)).join(", ")})`;
}

/** The IF a condition relationship suggests: A's value against a placeholder. */
export function conditionTextFor(relationship, firstInputs = []) {
  return `${callTextFor(relationship.first, firstInputs)} > ${PLACEHOLDER_VALUE}`;
}

/** What the suggestion button says. */
export function suggestionLabel(relationship) {
  return relationship.type === "order"
    ? `then run ${relationship.second.service}`
    : `if ${relationship.first.service}'s value → ${relationship.second.service}`;
}
