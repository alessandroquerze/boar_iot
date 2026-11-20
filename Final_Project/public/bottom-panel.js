// The bottom panel, spanning both editors: console (validation errors), output
// (the execution log) and status (running apps). It only renders what it is
// given — the buffers belong to the projects, so switching tabs swaps content.

const TABS = ["console", "output", "status"];

const el = {};
let active = "console";
let onClear = () => {};

export function initBottomPanel() {
  el.area = document.getElementById("editorarea");
  el.tabs = document.getElementById("bottom-tabs");
  for (const tab of TABS) el[tab] = document.querySelector(`.bottom-body[data-tab="${tab}"]`);

  el.tabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".bottom-tab");
    if (tab) showTab(tab.dataset.tab);
  });

  document.getElementById("bottom-clear").addEventListener("click", () => onClear(active));
  document.getElementById("bottom-toggle").addEventListener("click", toggleCollapsed);
  showTab("console");
}

export function showTab(tab) {
  active = tab;
  el.area.classList.remove("bottom-collapsed");
  for (const name of TABS) {
    el[name].hidden = name !== tab;
    el.tabs
      .querySelector(`.bottom-tab[data-tab="${name}"]`)
      .setAttribute("aria-selected", String(name === tab));
  }
}

function toggleCollapsed() {
  const collapsed = el.area.classList.toggle("bottom-collapsed");
  document.getElementById("bottom-toggle").textContent = collapsed ? "⌃" : "⌄";
}

export function onBottomClear(handler) {
  onClear = handler;
}

/** Replace a tab's content. A line is { kind, where, what, reveal?, action? }. */
export function render(tab, lines) {
  const host = el[tab];
  host.replaceChildren(...lines.map(lineElement));
  host.scrollTop = host.scrollHeight;
}

/** Add one line, keeping the view scrolled to the end. */
export function append(tab, line) {
  const host = el[tab];
  const atEnd = host.scrollTop + host.clientHeight >= host.scrollHeight - 4;
  host.appendChild(lineElement(line));
  if (atEnd) host.scrollTop = host.scrollHeight;
}

/** Show a count next to a tab's label; `n = 0` removes it. */
export function setCount(tab, n, kind = "") {
  const label = el.tabs.querySelector(`.bottom-tab[data-tab="${tab}"]`);
  label.querySelector(".count")?.remove();
  if (n <= 0) return;

  const badge = document.createElement("span");
  badge.className = "count";
  badge.textContent = String(n);
  if (kind) badge.dataset.kind = kind;
  label.appendChild(badge);
}

function lineElement(line) {
  const row = document.createElement("div");
  row.className = "line";
  row.dataset.kind = line.kind ?? "info";

  if (line.where) {
    const where = document.createElement("span");
    where.className = "where";
    where.textContent = line.where;
    if (line.reveal) where.addEventListener("click", line.reveal);
    row.appendChild(where);
  }

  const what = document.createElement("span");
  what.className = "what";
  what.textContent = line.what;
  row.appendChild(what);

  if (line.action) {
    const button = document.createElement("button");
    button.className = "small-btn line-action";
    button.textContent = line.action.label;
    button.disabled = Boolean(line.action.disabled);
    button.addEventListener("click", line.action.onClick);
    row.appendChild(button);
  }
  return row;
}
