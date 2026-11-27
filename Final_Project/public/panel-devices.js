// The Devices side panel: every thing the IDE heard about, with its sensors,
// its actuators and the services each one exposes — each device's parts grouped
// together, as the prompt asks — followed by one relationships group.
//
// Services are the drag source for the graphical editor, so the whole panel is
// also the service palette.
//
// Relationships are listed once for the whole space rather than per thing,
// because a user-defined one may link two different things and so belongs to no
// single device. The advertised ones (source `iot-ddl`) are read-only: the
// IoT-DDL Builder owns them and Atlas never executes them. The developer's own
// ones are added here and persist across restarts.

import { onSpaceChange } from "./main.js";

const open = new Set();

/** The last state the server pushed: what the add dialog fills its menus from. */
let current = { space: {}, things: [], relationships: [] };

export function initDevicesPanel() {
  const host = document.getElementById("devices-list");
  onSpaceChange((state) => {
    current = state;
    render(host, state);
  });
}

function render(host, state) {
  host.replaceChildren();

  if (state.things.length === 0) {
    host.appendChild(
      note(
        state.space.discovery === "scanning"
          ? "listening for things…"
          : "no thing has announced itself yet.",
      ),
    );
    // Saved relationships are still shown, greyed out: with every thing offline
    // they are all that is left of the space, and they must not disappear.
    if ((state.relationships ?? []).length > 0) host.appendChild(relationshipsGroup(state));
    return;
  }

  for (const thing of state.things) host.appendChild(thingGroup(thing));
  host.appendChild(relationshipsGroup(state));
}

function thingGroup(thing) {
  const sensors = thing.entities.filter((entity) => entity.role === "sensor");
  const actuators = thing.entities.filter((entity) => entity.role !== "sensor");

  const group = collapsible(`thing:${thing.id}`, thing.id, true, (header) => {
    if (thing.stale) header.appendChild(badge("stale", "draft"));
  });

  const body = group.querySelector(".group-body");
  body.appendChild(meta(`${thing.name}${thing.ip ? ` · ${thing.ip}:${thing.port}` : ""}`));

  if (sensors.length > 0) body.appendChild(section("sensors", sensors.map(entityGroup)));
  if (actuators.length > 0) body.appendChild(section("actuators", actuators.map(entityGroup)));
  return group;
}

function entityGroup(entity) {
  const group = collapsible(`entity:${entity.id}`, entity.id, true, (header) => {
    header.appendChild(badge(String(entity.services.length), ""));
  });
  group.querySelector(".row").classList.add("sub");

  const body = group.querySelector(".group-body");
  if (entity.name && entity.name !== entity.id) body.appendChild(meta(entity.name, 36));
  for (const service of entity.services) body.appendChild(serviceRow(entity, service));
  return group;
}

function serviceRow(entity, service) {
  const row = document.createElement("div");
  row.className = "row service";
  row.style.paddingLeft = "36px";
  row.draggable = true;
  row.title = serviceTooltip(entity, service);

  const name = document.createElement("span");
  name.className = "name mono";
  name.textContent = `${service.name}(${service.inputs.map((input) => input.name).join(", ")})`;
  row.appendChild(name);

  if (service.type) row.appendChild(badge(service.type === "Action" ? "act" : "rep", ""));

  // The payload the graphical editor turns into a block.
  row.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(
      "application/atlas-service",
      JSON.stringify({ thing: row.closest("[data-key^='thing:']")?.dataset.key.slice(6), service }),
    );
    event.dataTransfer.effectAllowed = "copy";
  });

  return row;
}

function serviceTooltip(entity, service) {
  const inputs = service.inputs.map((input) => `${input.name}: ${input.type}`).join(", ") || "none";
  const output = service.output ? `${service.output.name}: ${service.output.type}` : "void";
  return [
    `${entity.id}.${service.name}`,
    `inputs  ${inputs}`,
    `output  ${output}`,
    service.description && `\n${service.description}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// --- relationships ----------------------------------------------------------

/** The two kinds the developer may define, and what each one means. */
const USER_TYPES = [
  ["order", "B runs only if A completes successfully"],
  ["condition", "B runs depending on A's return value"],
];

function relationshipsGroup(state) {
  const relationships = state.relationships ?? [];
  const scanning = state.space.discovery === "scanning";

  const group = collapsible("relationships", "relationships", true, (header) => {
    const add = document.createElement("button");
    add.className = "icon-btn";
    add.id = "relationship-add";
    add.title = scanning ? "wait for the scan to finish" : "Add a relationship";
    // Nothing may be added while the space is still introducing itself: the
    // service menus would be incomplete.
    add.disabled = scanning;
    add.textContent = "+";
    add.addEventListener("click", (event) => {
      event.stopPropagation();
      openAddDialog();
    });
    header.appendChild(add);
  });

  const body = group.querySelector(".group-body");
  if (relationships.length === 0) {
    body.appendChild(meta("no relationship yet — press + to add one.", 22));
  }
  for (const relationship of relationships) body.appendChild(relationshipRow(relationship));
  return group;
}

// An order-based or condition-based relationship is what the editor can act on;
// anything else (Lab 4 declares `interfere`) is shown but not offered.
function relationshipRow(relationship) {
  const row = document.createElement("div");
  row.className = "row relationship";
  row.style.paddingLeft = "22px";
  row.dataset.resolved = String(relationship.resolved);
  row.title = relationshipTooltip(relationship);

  const name = document.createElement("span");
  name.className = "name mono";
  name.textContent = `${endpointLabel(relationship, "first")} → ${endpointLabel(relationship, "second")}`;
  row.appendChild(name);

  row.appendChild(badge(relationship.type, USER_TYPES.some(([type]) => type === relationship.type) ? "active" : ""));
  row.appendChild(badge(relationship.source === "user" ? "user" : "IoT-DDL", "source"));

  // Only the developer's own relationships can be deleted; the advertised ones
  // belong to the thing's IoT-DDL.
  if (relationship.source === "user") row.appendChild(deleteButton(relationship));
  return row;
}

/** `Entity.Service`, or `Thing.Entity.Service` when the two ends differ. */
function endpointLabel(relationship, which) {
  const endpoint = relationship[which];
  const crossThing = relationship.first.thing !== relationship.second.thing;
  const entity = endpoint.entity || "?";
  return `${crossThing ? `${endpoint.thing}.` : ""}${entity}.${endpoint.service}`;
}

function relationshipTooltip(relationship) {
  const full = (endpoint) => `${endpoint.thing}.${endpoint.entity || "?"}.${endpoint.service}`;
  return [
    relationship.name || "(unnamed)",
    `${relationship.type} · ${relationship.source === "user" ? "defined in the IDE" : "advertised by the thing"}`,
    `first   ${full(relationship.first)}`,
    `second  ${full(relationship.second)}`,
    !relationship.resolved && "one end is not in the space right now",
    relationship.description && `\n${relationship.description}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function deleteButton(relationship) {
  const button = document.createElement("button");
  button.className = "icon-btn relationship-delete";
  button.title = "Delete this relationship";
  button.innerHTML = '<svg class="icon" width="12" height="12"><use href="#i-close" /></svg>';

  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!confirm(`Delete the relationship "${relationship.name}"?`)) return;

    const response = await fetch(`/api/relationships/${encodeURIComponent(relationship.id)}`, {
      method: "DELETE",
    });
    // The list redraws from the state the server pushes back, so nothing is
    // removed here optimistically.
    if (!response.ok) alert(`could not delete it: ${(await response.json()).error}`);
  });
  return button;
}

// --- the add dialog ---------------------------------------------------------

let dialog = null;

function openAddDialog() {
  dialog ??= buildDialog();
  const form = dialog.querySelector("form");
  form.reset();

  fillServiceMenu(form.elements.first);
  fillServiceMenu(form.elements.second);
  dialog.querySelector(".dialog-error").textContent = "";
  dialog.showModal();
  form.elements.name.focus();
}

function buildDialog() {
  const element = document.createElement("dialog");
  element.id = "relationship-dialog";
  element.innerHTML = `
    <form>
      <h2>add a relationship</h2>
      <p class="dim">
        A relationship guides you while you build an app. It never runs anything by
        itself, and it may link services on two different things.
      </p>

      <label class="dialog-field">
        <span>name</span>
        <input name="name" maxlength="40" spellcheck="false" required />
      </label>

      <fieldset class="dialog-field">
        <legend>type</legend>
        ${USER_TYPES.map(
          ([type, explanation], index) => `
          <label class="dialog-radio">
            <input type="radio" name="type" value="${type}" ${index === 0 ? "checked" : ""} />
            <span><strong>${type}</strong> — ${explanation}</span>
          </label>`,
        ).join("")}
      </fieldset>

      <label class="dialog-field">
        <span>first service (A)</span>
        <select name="first" required></select>
      </label>

      <label class="dialog-field">
        <span>second service (B)</span>
        <select name="second" required></select>
      </label>

      <label class="dialog-field">
        <span>description <em class="dim">optional</em></span>
        <input name="description" maxlength="200" />
      </label>

      <p class="dialog-error"></p>

      <div class="dialog-actions">
        <button type="button" class="small-btn" value="cancel">cancel</button>
        <button type="submit" class="small-btn primary">add</button>
      </div>
    </form>`;

  element.querySelector('button[value="cancel"]').addEventListener("click", () => element.close());
  element.querySelector("form").addEventListener("submit", submitDialog);
  document.body.appendChild(element);
  return element;
}

/** Every discovered service in the space, grouped by thing and entity. */
function fillServiceMenu(select) {
  select.replaceChildren();

  for (const thing of current.things) {
    for (const entity of thing.entities) {
      if (entity.services.length === 0) continue;

      const group = document.createElement("optgroup");
      group.label = `${thing.id} · ${entity.id}`;
      for (const service of entity.services) {
        const option = document.createElement("option");
        option.value = JSON.stringify({ thing: thing.id, entity: entity.id, service: service.name });
        option.textContent = service.output ? `${service.name} → ${service.output.type}` : `${service.name} → void`;
        group.appendChild(option);
      }
      select.appendChild(group);
    }
  }
}

async function submitDialog(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = dialog.querySelector(".dialog-error");
  error.textContent = "";

  const response = await fetch("/api/relationships", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: form.elements.name.value,
      type: form.elements.type.value,
      description: form.elements.description.value,
      first: JSON.parse(form.elements.first.value),
      second: JSON.parse(form.elements.second.value),
    }),
  });

  // The server owns the rules, so its message is shown as it is and the dialog
  // stays open with what the developer typed.
  if (!response.ok) {
    error.textContent = (await response.json()).error ?? "could not add the relationship";
    return;
  }
  dialog.close();
}

// --- small builders ---------------------------------------------------------

function collapsible(key, label, openByDefault, decorate) {
  const group = document.createElement("div");
  group.className = "group";
  group.dataset.key = key;

  const isOpen = open.has(key) || (openByDefault && !open.has(`closed:${key}`));
  group.dataset.open = String(isOpen);

  const header = document.createElement("div");
  header.className = "row";
  header.innerHTML = '<svg class="icon twisty" width="14" height="16"><use href="#i-chevron" /></svg>';

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = label;
  header.appendChild(name);
  decorate?.(header);

  header.addEventListener("click", () => {
    const nowOpen = group.dataset.open !== "true";
    group.dataset.open = String(nowOpen);
    if (nowOpen) {
      open.add(key);
      open.delete(`closed:${key}`);
    } else {
      open.delete(key);
      open.add(`closed:${key}`);
    }
  });

  const body = document.createElement("div");
  body.className = "group-body";

  group.append(header, body);
  return group;
}

function section(title, rows) {
  const fragment = document.createDocumentFragment();
  const head = document.createElement("div");
  head.className = "sub-head";
  head.textContent = title;
  fragment.appendChild(head);
  for (const row of rows) fragment.appendChild(row);
  return fragment;
}

function meta(text, indent = 28) {
  const line = document.createElement("div");
  line.className = "empty-note";
  line.style.padding = `0 8px 4px ${indent}px`;
  line.textContent = text;
  return line;
}

function badge(text, kind) {
  const element = document.createElement("span");
  element.className = "badge";
  if (kind) element.dataset.kind = kind;
  element.textContent = text;
  return element;
}

function note(text) {
  const element = document.createElement("div");
  element.className = "empty-note";
  element.textContent = text;
  return element;
}
