// Settings, behind the gear at the bottom of the activity bar.
//
// The one the prompt requires is "highlight changes": with it off, the green
// and red marks are skipped. It never changes what the editors end up holding,
// only whether the change is pointed out.

const STORAGE_KEY = "atlas-ide-settings";

const DEFAULTS = {
  highlightChanges: true,
  highlightRedMs: 700, // how long a removed line stays red before it goes
  highlightFadeMs: 2000, // how long an added line stays green
};

const FIELDS = [
  {
    key: "highlightChanges",
    type: "boolean",
    label: "highlight changes",
    hint: "mark lines green when a block is added and red when one is removed",
  },
  {
    key: "highlightRedMs",
    type: "number",
    label: "removed lines stay red for",
    unit: "ms",
    hint: "then the empty lines are removed",
  },
  { key: "highlightFadeMs", type: "number", label: "added lines stay green for", unit: "ms" },
];

let settings = load();
const listeners = new Set();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSetting(key) {
  return settings[key];
}

export function setSetting(key, value) {
  settings = { ...settings, [key]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  for (const listener of listeners) listener(settings);
}

export function onSettingsChange(handler) {
  listeners.add(handler);
}

export function initSettingsPanel() {
  const host = document.getElementById("settings-form");
  host.replaceChildren(...FIELDS.map(fieldElement));

  // The server owns the rest of the configuration (the Atlas working directory,
  // the broker); it is shown read-only until the app manager arrives.
  const note = document.createElement("div");
  note.className = "empty-note";
  note.textContent = "the working directory and the broker are set when the IDE is started.";
  host.appendChild(note);
}

function fieldElement(field) {
  const row = document.createElement("label");
  row.className = "setting";

  const input = document.createElement("input");
  input.type = field.type === "boolean" ? "checkbox" : "number";
  if (field.type === "boolean") input.checked = Boolean(settings[field.key]);
  else {
    input.value = String(settings[field.key]);
    input.min = "0";
    input.step = "100";
    input.className = "nb-input";
  }

  input.addEventListener("change", () => {
    setSetting(field.key, field.type === "boolean" ? input.checked : Number(input.value));
  });

  const text = document.createElement("span");
  text.className = "setting-label";
  text.textContent = field.label + (field.unit ? ` (${field.unit})` : "");

  row.append(input, text);

  if (field.hint) {
    const hint = document.createElement("span");
    hint.className = "setting-hint";
    hint.textContent = field.hint;
    row.appendChild(hint);
  }
  return row;
}
