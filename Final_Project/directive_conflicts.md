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
  thing as **sensors**, **actuators** and **services** sub-groups, with one
  **relationships** group for the whole space below them. So the Things, Services and
  Relationships content all survives — the first two grouped by device instead of by
  kind, which is also what the prompt's "group each device's sensors, actuators and
  services together visually" asks for. Services stay in alphabetical order inside
  each group, as R2 requires. Relationships are the one thing *not* nested under a
  device, because a user-defined one may link two things and so belongs to neither
  (see C8).

## C2 — The guidelines' app actions vs. the prompt's fixed menu bar

- **Guideline (R2, R3, R4):** the IDE exposes SAVE APP, UPLOAD APP, ACTIVATE, STOP,
  DELETE, plus **Clear** and **Finalize** in the editor.
- **Prompt:** the top menu bar is exactly `activate`, `update`, `stop`, `delete`.
- **Resolution:** the menu bar holds four actions and nothing else.
  `activate` → ACTIVATE, `save` → SAVE APP for the open project, `stop` → STOP,
  `delete` → DELETE. The user later renamed `update` to `save`, and dropped
  *finalize*: `save` is the only save action. The remaining actions move to where
  the prompt already puts their trigger or where VS Code would put them: UPLOAD APP
  is the double-click on an app in the Apps panel (the prompt specifies this),
  *new app* lives in the Apps panel, *clear* in the graphical editor's own toolbar.
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
- **Resolution:** saving (`save`) is what puts an app in the list, because the
  prompt makes the list a plain view of the apps that exist. The *finalize* action
  was dropped at the user's request: `save` is the only save action, there is no
  `finalized` flag and no draft marker. Older `.iot` files that still contain
  `"finalized"` open and save normally; the key is ignored.

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

## C8 — Relationships "between services of the same thing" vs. user-defined ones

- **Guideline (R2):** the two supported relationship kinds "are declared in the
  IoT-DDL between services of the same thing". `docs/tweets.md` says the same, read
  from the middleware: a `Relationship` tweet carries only `FS name` / `SS name`, so
  both services necessarily belong to the thing that sent it.
- **Prompt (instructor clarification):** the IoT-DDL Builder only lets you relate
  services of the **same entity**, and Atlas advertises those relationships without
  ever executing them. The IDE must keep listening for them *and* let the programmer
  define their own relationships between **any two services** — different entities,
  and different things.
- **Resolution:** both, in one list, told apart by a `source` field. Advertised
  relationships (`source: "iot-ddl"`) keep the guideline's limit exactly: they are
  re-learned from the tweets on every scan, they never leave their thing, and they
  are **read-only** — `DELETE` answers 403. User relationships (`source: "user"`)
  may link any two discovered services, are restricted to the two kinds R2 names
  (`order`, `condition`), and are saved in `relationships.json` in the Atlas working
  directory so they survive a restart. The guideline's intent is untouched: neither
  kind executes anything — a relationship only guides the developer while an `.iot`
  app is built, and `runtime.js` does not read them. Recorded because the "same
  thing" sentence now describes **only** the advertised half.
  The simulator keeps the stricter house rule that goes with this: it advertises
  **exactly** what `Atlas_IoTDDL.xml` declares and never invents a relationship, so
  the second simulated thing `AT_BoarLamp` — whose IoT-DDL belongs to another group
  and is not in this repo — advertises services and no relationships at all.
  See `PLAN.md` §5.1, §5.4, §6.2 and decision D4.

## C9 — `AGENTS.md` "work directly on main" vs. a feature branch

- **Guideline (`AGENTS.md`):** "Work directly on `main`. The repo is used from two
  computers whose local files don't sync, so GitHub is the only source of truth."
- **Prompt:** "Work on a branch."
- **Resolution:** no conflict in the end. The change was built on the
  `relationships` branch as the prompt asked, then merged into `main` at the user's
  request, so everything sits on `main` and `main` is the single source of truth
  between the two machines — which is the reason `AGENTS.md` gives for the rule.
  The merge is a real merge commit, not a fast-forward, because the other machine
  had pushed eight commits meanwhile; those are reconciled in the same commit.
  Nothing was pushed with `--force` and no pushed commit was rewritten.
