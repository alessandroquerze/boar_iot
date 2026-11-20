// The Devices side panel: every thing the IDE heard about, with its sensors,
// its actuators, the services each one exposes and the relationships between
// them — each device's parts grouped together, as the prompt asks.
//
// Services are the drag source for the graphical editor, so the whole panel is
// also the service palette.

import { onSpaceChange } from "./main.js";

const open = new Set();

export function initDevicesPanel() {
  const host = document.getElementById("devices-list");
  onSpaceChange((state) => render(host, state));
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
    return;
  }

  for (const thing of state.things) host.appendChild(thingGroup(thing));
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
  if (thing.relationships.length > 0) {
    body.appendChild(
      section(
        "relationships",
        thing.relationships.map((relationship) => relationshipRow(relationship)),
      ),
    );
  }
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

// An order-based or condition-based relationship is what the editor can act on;
// anything else (Lab 4 declares `interfere`) is shown but not offered.
function relationshipRow(relationship) {
  const row = document.createElement("div");
  row.className = "row";
  row.style.paddingLeft = "28px";
  row.title = relationship.description || relationship.name;

  const name = document.createElement("span");
  name.className = "name mono";
  name.textContent = `${relationship.first} → ${relationship.second}`;
  row.appendChild(name);
  row.appendChild(badge(relationship.type, relationship.type === "interfere" ? "" : "active"));
  return row;
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
