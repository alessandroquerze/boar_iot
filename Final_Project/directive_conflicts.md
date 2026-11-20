# Directive conflicts

Where the task prompt and `docs/Guidelines.pdf` (or `AGENTS.md`) ask for different
things. **The prompt always wins**; each entry records what was given up and why the
guideline's intent is still satisfied.

---

## C1 — Four discovery tabs vs. two activity-bar icons

- **Guideline (R2):** "tabs for each of 'Things', 'Services', 'Relationships'.
  Further, it should also include a tab for 'Apps'."
- **Prompt:** the left activity bar has "Two selectable icons: **Apps** and
  **Devices**", and the Devices panel shows "the IoT devices currently connected to
  the virtual space, with all their sensors and actuators and the services each one
  exposes".
- **Resolution:** two icons. The Devices panel is organised per thing, and inside each
  thing as **sensors**, **actuators**, **services** and **relationships** sub-groups.
  So the Things, Services and Relationships content all survives — it is grouped by
  device instead of by kind, which is also what the prompt's "group each device's
  sensors, actuators and services together visually" asks for. Services stay in
  alphabetical order inside each group, as R2 requires.

## C2 — The guidelines' app actions vs. the prompt's fixed menu bar

- **Guideline (R2, R3, R4):** the IDE exposes SAVE APP, UPLOAD APP, ACTIVATE, STOP,
  DELETE, plus **Clear** and **Finalize** in the editor.
- **Prompt:** the top menu bar is exactly `activate`, `update`, `stop`, `delete`.
- **Resolution:** the menu bar holds those four and nothing else.
  `activate` → ACTIVATE, `update` → SAVE APP for the open project, `stop` → STOP,
  `delete` → DELETE. The three remaining actions move to where the prompt already
  puts their trigger or where VS Code would put them: UPLOAD APP is the
  double-click on an app in the Apps panel (the prompt specifies this), *new app* and
  *finalize* live in the Apps panel, *clear* in the graphical editor's own toolbar.
  Confirmed with the user as `QUESTIONS.md` Q2.

## C3 — Bottom panel: status panel vs. console

- **Guideline (R4):** ACTIVATE "updates *a status panel* on the bottom of the IDE
  showing all running apps, their start time, and their status".
- **Prompt:** the bottom panel is the "**Console** spanning both editors, showing
  validation errors".
- **Resolution:** the bottom panel is a console, as the prompt says, and **Console**
  (validation errors) is its default tab. R4's status panel becomes a second tab,
  **Status**, in the same panel; the Lab 4 execution log becomes a third, **Output**.
  The prompt's console is what the user sees first and it spans both editors.

## C4 — "Finalize" as the only way to publish an app

- **Guideline (R3):** Finalize "converts the developed IoT App into a named app that
  gets added to the Apps tab"; R2 says the Apps tab is "initially empty".
- **Prompt:** the Apps panel is "a list of the available apps created by developers",
  with no mention of a finalize step, and `update` is a first-class menu action.
- **Resolution:** saving (`update`) is what puts an app in the list, because the
  prompt makes the list a plain view of the apps that exist. `finalized: true` is kept
  as a flag in the `.iot` file and set by the *finalize* action, which additionally
  validates the whole app against the discovered catalogue. A saved-but-not-finalized
  app is shown in the list with a draft marker. Nothing is lost; the gate is softer.

## C5 — A text-based *or* GUI editor vs. both, kept in sync

- **Guideline (R3):** the editor "can be: 1) text-based … or 2) GUI-based
  (recommended) … It could also be a combination of both".
- **Prompt:** both are mandatory, side by side, with real-time synchronisation, green
  and red change highlights, a lock-and-blur protocol and an Apply Changes button.
- **Resolution:** no real conflict — the prompt chooses the third option the guideline
  permits and specifies it. Recorded because it makes a recommended-but-optional item
  the central requirement, which is where most of the implementation effort goes
  (`PLAN.md` §7).

## C6 — "No frameworks, no build step" vs. CodeMirror 6 and Lezer

- **Guideline (`AGENTS.md`):** "Write plain JavaScript with no frameworks. Add a
  library or build step only if `PROJECT.md` lists it" — while also anticipating
  "files the app loads directly, such as `editor.bundle.js`".
- **Prompt:** CodeMirror 6 and Drawflow are required by name, and CodeMirror 6 only
  ships as ES modules, so it cannot be used without a bundling step.
- **Resolution:** the libraries are listed in `PLAN.md` §4.2, which is exactly the
  escape hatch `AGENTS.md` defines. Drawflow is vendored as-is; CodeMirror 6, the
  Lezer runtime and the `lang/` modules are bundled into
  `public/vendor/editor.bundle.js` by `npm run build` and the bundle is committed,
  as `AGENTS.md` instructs. The UI code itself stays plain JavaScript with no
  framework. Each library is recorded in `README.md` with its licence and
  justification, which the guidelines' open-source note also requires.

## C7 — Document names

- **`AGENTS.md`:** the plan is `PROJECT.md`; conflicts go in
  `docs/guideline-conflicts.md`.
- **Prompt:** the plan is `PLAN.md`; conflicts go in `directive_conflicts.md`.
- **Resolution:** the content lives in the file the prompt names, and the file
  `AGENTS.md` names is a one-line pointer to it. Both workflows keep working and
  there is only one copy of each document to maintain. See `PLAN.md` §0.
