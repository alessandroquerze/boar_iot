# PLAN.md — Atlas IoT Application IDE (visual + text)

This is the plan file required by the task prompt, and it is also the `PROJECT.md`
that `AGENTS.md` asks for (see `PROJECT.md`, which points here, and
[§0](#0-file-naming-note)). Later sessions should be able to work from
`CHECKPOINT.md` + this file alone, without re-reading `Guidelines.pdf` or Lab 4.

> **Status: approved 2026-11-20.** All thirteen questions were answered with their
> recommended default (§12). `QUESTIONS.md` is now closed and the build is under way.
> Tag `plan-approved` marks the tree as it was when the plan was approved, so the
> implementation can be restarted from there.

---

## 0. File-naming note

`AGENTS.md` and the task prompt name the same documents differently. Resolution:
the real content lives in the file the prompt names; the file `AGENTS.md` names is
a one-line pointer, so both workflows keep working and nothing is duplicated.

| Content | Prompt name (holds the content) | `AGENTS.md` name (pointer) |
|---|---|---|
| The plan | `PLAN.md` | `PROJECT.md` |
| Conflict log | `directive_conflicts.md` | `docs/guideline-conflicts.md` |

---

## 1. Requirements (task prompt, verbatim)

> # Task: Visual + Text IDE for IoT Apps
>
> Follow the instructions in `AGENTS.md`.
>
> ## Workflow (mandatory)
>
> 1. **Research first.** Read `AGENTS.md`, `Guidelines.pdf` (thoroughly), and the reference codebases listed below before writing any code.
> 2. **Plan.** Write a detailed implementation plan in `PLAN.md`. It must include:
>    - the overall architecture and tech stack,
>    - the list of default functionalities taken from the Lab4 reference (see below),
>    - how the visual editor and the text editor stay in sync,
>    - how each requirement in this prompt will be met.
> 3. **Ask, don't assume.** Do not assume anything you don't know. If anything is unclear, ambiguous or underspecified after planning, write your questions in `QUESTIONS.md` and **stop**. Wait until I have answered them before you build anything.
> 4. **Implement** only after I have answered the questions.
>
> ## Open-source references
>
> - **VS Code**: use it as the reference for the IDE *layout only*. Imitate the layout; do not copy its code or features beyond what is described here.
> - **[Drawflow](https://jerosoler.github.io/Drawflow/)**: for the drag-and-drop graphical editor.
> - **[CodeMirror 6](https://codemirror.net/)**: for the text editor, and for parsing and syncing the shared model/AST between the text editor and the graphical editor.
> - **[alessandroquerze/boar_iot – Lab4](https://github.com/alessandroquerze/boar_iot/tree/main/Lab4)**: the reference for the functionalities that must be present by default. List them explicitly in `PLAN.md`.
>
> ## Layout (VS Code–style)
>
> | VS Code area | This IDE |
> |---|---|
> | Top menu bar (File, Edit, Selection, View, Go) | App actions, labelled in lowercase: `activate`, `update`, `stop`, `delete` |
> | Top search bar | Metadata: the network address where the IDE is running |
> | Left activity bar + side panel | Two selectable icons: **Apps** and **Devices** (see below) |
> | Main editor area | **Graphical editor** (Drawflow) |
> | Right side panel (where the AI chat is) | **Text editor** (CodeMirror 6), updated in real time from the graphical editor |
> | Bottom panel (terminal/console) | **Console** spanning both editors, showing validation errors |
> | Editor tab bar | One tab per open project |
>
> ### Left side panel
> - **Apps tab**: a list of the available apps created by developers. Double-clicking an app opens it in both the graphical editor and the text editor.
> - **Devices tab**: shows the IoT devices currently connected to the virtual space, with all their sensors and actuators and the services each one exposes. Group each device's sensors, actuators and services together visually.
>
> ### Multiple projects
> Like a VS Code multi-root workspace, several projects can be open in the same window. The user switches between them with their tabs in the tab bar. Each project's files, state and configuration must stay fully independent.
>
> ## Text editor behaviour
>
> ### Sync from the graphical editor to the text editor
> - When a block or connection is **added** in the graphical editor, highlight the corresponding new line(s) in the text editor in **green**.
> - When a block or connection is **removed**, highlight the corresponding line(s) in **red**, then remove the resulting empty line(s) automatically.
>
> ### Sync from the text editor to the graphical editor
> - Put an **"Apply Changes"** button above the text editor that applies the text modifications to the graphical editor.
> - **Lock the graphical editor while the text is being edited.** As soon as the user starts editing the text, block and blur the graphical editor. Keep it locked until the changes are applied successfully (or discarded).
> - **Validate before applying.** Run basic lexical and syntactic validation so the code is reasonably well-formed. It should catch obvious errors such as malformed statements, invalid tokens or unmatched delimiters.
>   - Keep validation lightweight. Reuse existing parsing capabilities (e.g. CodeMirror's/Lezer's parser) or libraries where possible, and add new ones only if strictly needed.
>   - Do **not** build a full compiler, type checker or semantic analyzer.
> - **On validation failure:** highlight the offending code in **red**, list the errors in the console panel, and do not apply the changes.
> - **On success:** update the graphical editor to match the text.
>
> ## Settings
> - The user can turn off highlighting (green/red change highlights).
>
> ## Guidelines and conflicts
> - Use `Guidelines.pdf` to fill any gaps this prompt leaves.
> - If a constraint in this prompt conflicts with `Guidelines.pdf`, **this prompt takes priority**.
> - Record every conflict you find in `directive_conflicts.md`. For each one, give the guideline, the conflicting directive from this prompt, and how you resolved it.

---

## 2. Guidelines summary (`docs/Guidelines.pdf`)

B8019 Programming the IoT, group project: *Atlas IoT Application IDE*.
Due **11:00, 30 Nov 2026**; demo the same day 16:30–19:30. Deliverable: zip with
code + a report of **≤5 pages (aim 3)** covering the code, third-party open source
used **with justification**, and **screenshots of the IDE and its dialog boxes**,
plus a **2-minute slide deck** and a live demo with all members present.

Success criterion: rebuild the **Lab 4 Part II demo app** in this IDE and have it
be *easier* than before. Four requirements:

**R1 — Discover available Atlas things.** A background thread listens to the tweets
in the VSS and learns the space: *thing identity*, *entity identity*, *service*,
*thing language*, *relationship* tweets, each a JSON key-value message. Respect the
exact structure of each tweet.

**R2 — Display space meta information.** Show the **network address where the IDE is
launched**, and tabs for **Things**, **Services**, **Relationships**, **Apps**.
Things: one card per thing (one per group RPi). Services: per thing, **alphabetical**,
one thing after another; optionally split *sensor-type* / *actuator-type*.
Relationships: all relationships heard, any order, graphically if possible. Only two
relationship kinds are supported: **order-based** (B runs only after A completes
successfully) and **condition-based** (B runs depending on A's return value); they are
declared in the IoT-DDL between services of the same thing. Apps: initially empty;
offers *upload an existing app* or *start a new app*, both of which open the app
editor. **SAVE APP** exists only inside the editor; a new app prompts for a path
(or a default) and a file name; the IDE forces the **`.iot`** extension
(`name.ext` → `name.ext.iot`); re-saving overwrites the known file name; repeated
saving is allowed.

**R3 — IoT Application Editor.** Opened by uploading an app or starting a new one. The
developer picks available services and arranges them, *guided by the relationships*.
Three app types, combinable sequentially with a sequential operator and grouping
delimiters: **Type 1** ordered set `{S1…Sn}` run in sequence; **Type 2** order-based
`if A completes successfully then run B`; **Type 3** condition-based `if comparison on
A's return value then run B`. The language is meant to be trivial. Looping is optional
extra credit. The editor may be text-based, GUI-based (*recommended*) or both. It must
offer **Clear** (empty the editor) and **Finalize** (turn the composition into a named
app, saved on the IDE machine and listed in the Apps tab).

**R4 — IoT App Manager**, invokable in the Apps tab:
*SAVE APP* (local file, format free — XML/text/JSON; short name, no special
characters, `.iot`, under a fixed-but-changeable **"Atlas working directory"**);
*UPLOAD APP* (double-click an app in the Apps tab; at IDE start the working directory
is scanned and the apps found are listed); *ACTIVATE* (load if needed, start an
execution life cycle, add a row to a **status panel at the bottom** showing every
running app, its start time and its status); *STOP* (from the status panel or the Apps
tab, stops the services, cleans up, status becomes inactive/stopped — apps that end on
their own cannot be stopped and show **Completed**; the status bar is cleared when the
IDE starts or terminates); *DELETE* (only from the Apps tab, removes the app from the
IDE and from local storage).

**Notes that shape the design.** Open source is encouraged *with licence compliance and
documented justification*. Any environment/language is allowed. Consider **freezing the
IDE at start-up until it has heard enough tweets** and built its tabs, because
interacting during discovery is confusing. The IDE must be user-friendly and
**contain only features that work** — buggy features cost marks, so unfinished features
are removed from the UI rather than shipped. Optional skins/images for things, services
and apps. Use versioning and always keep a submittable version.

### Where the guidelines fill gaps the prompt leaves

| Gap in the prompt | Filled from the guidelines |
|---|---|
| What an "app" is on disk | JSON file, `.iot` extension, in a fixed-but-changeable Atlas working directory, short name with no special characters |
| Where the app list comes from | the working directory is scanned at IDE start |
| What `activate` / `stop` / `delete` must do | R4 life cycle, incl. `Completed` apps that cannot be stopped |
| What the "network address where the IDE is running" means | R2 "space meta information": the address the IDE is launched on |
| What the graphical editor must be able to express | R3 Types 1, 2, 3, composable sequentially |
| Where devices and services come from | R1 Atlas tweets, listened to on a background thread |
| Sensors vs actuators | R2 optional split of services into sensor-type / actuator-type |
| What to do while discovery runs | R1 note: freeze the IDE until the tabs are built |
| Saving and finalizing | R2/R3/R4: Save only in the editor, Finalize names and publishes the app |
| Report, screenshots, demo | deliverables section |

Conflicts between the prompt and the guidelines are logged in
`directive_conflicts.md`; the prompt always wins.

---

## 3. Default functionalities taken from Lab 4

Everything in this section already exists in `../Lab4` and must be present by
default in the new IDE. "Keep" = behaviour is preserved; "Port" = code is reused
after being moved into a module; "Replace" = same capability, new implementation.

### 3.1 From `Lab4/PartOne/edge` (the mini-IDE)

| # | Lab 4 functionality | In the new IDE |
|---|---|---|
| L1 | Smart-space connection: broker address field, Connect, **broker status** (connected / connecting / reconnecting / disconnected / error) and **device status** (online / offline / unknown) indicators | Keep. Broker address becomes a setting; the two indicators live in the top bar next to the IDE address |
| L2 | Last-used host persisted and auto-connected on start | Keep (server-side config instead of `localStorage`) |
| L3 | Service catalogue of everything the things advertise, **grouped by entity**, with thing id, service name, number of inputs, input names and output type | Keep → the **Devices** side panel |
| L4 | Human hints for inputs (`F_or_C` → `C|F`) | Keep, extended with the ranges from the IoT-DDL (speed 0–75, angle 0–50) |
| L5 | Text composition editor with an inline **grammar help** block | Keep → CodeMirror editor + a collapsible grammar help |
| L6 | The composition language: `RUN <call>`, `THEN <call>` chains, `IF <cond> DO <block> [ELSE <block>] END`, nested `IF`, bare calls inside a branch, comparisons `> < >= <= == !=`, `AND`/`OR` with `AND` binding tighter and no parentheses, `//` comments, blank lines and indentation ignored, integer arguments, `C`/`F` aliases, optional `<thing>.` qualifier | Keep as the text syntax (see §6) |
| L7 | Readable parse errors (`expected DO after IF, got …`, `"THEN" without a matching RUN`, `argument "x" is neither an integer nor one of: C, F`) | Keep, now also shown in the console panel with line numbers |
| L8 | **Run program** | Becomes `activate` (R4 life cycle) |
| L9 | **Clear log** | Keep, as the console's clear action |
| L10 | Orchestrator: order-based chains stop at the first `Unsuccessful` and report how many calls were skipped | Port |
| L11 | Orchestrator: every predicate is a real service call; conditions are evaluated as an OR of ANDs with **short-circuiting**, and skipped predicates are logged | Port |
| L12 | Orchestrator: if a predicate's call fails, **neither** branch runs | Port |
| L13 | Orchestrator: statements are independent — a failed statement does not stop the following ones (fault tolerance) | Port |
| L14 | Call timeout counts as a failure (10 s on MQTT, 15 s on Atlas TCP) | Port |
| L15 | Timestamped, **indented** execution log with kinds `call / reply / ok / fail / info / error / other`; replies matched to calls by id; replies belonging to another client are labelled | Port → the console's *Output* stream |
| L16 | Parser/orchestrator test harness runnable with plain `node`, no broker and no hardware | Keep → `tests/` (proper modules, no `eval`) |

### 3.2 From `Lab4/PartOne/device` + `PartTwo` (the thing)

| # | Lab 4 functionality | In the new IDE |
|---|---|---|
| L17 | The thing `AT_BoarAirSensor` in space `BoarSmartSpace`, entities `ClimateSensor` (DHT11), `Fan` (motor + 2N2222), `Window` (servo) | The reference device, and the simulator's default content |
| L18 | The **10 services**: `Calibrate_Sensor`, `Read_Temp(F_or_C)`, `Read_Humidity`, `Fan_On(speed)`, `Fan_Off`, `Read_Fan_Speed`, `Read_Fan_Status`, `Set_Window(angle)`, `Window_Close`, `Read_Window_Position` | Discovered via tweets; reproduced exactly by the simulator |
| L19 | Service semantics: integer in / `int` or `void` out, out-of-range inputs clamped to the nearest allowed value and the applied value returned, actuator reads report the last commanded value, DHT11 read retried 3× then returns `-1` with status `Successful` | Reproduced by the simulator so apps behave the same with or without hardware |
| L20 | Atlas **service call** over **TCP 6668**, one JSON per connection: `{"Tweet Type":"Service call","Thing ID":…,"Space ID":…,"Service Name":…,"Service Inputs":"(75)"}` (`"()"` when there are no inputs); reply carries `"Status"` (`Successful`/`Unsuccessful`) and `"Service Result"` (`"No Output"` for `void`) | Port into the Atlas gateway |
| L21 | Calls must be **spaced** (Atlas pauses after each call) and are read until the thing closes the connection, with a 15 s timeout | Port: calls are serialised per thing with a configurable gap |
| L22 | Atlas **tweets** over MQTT, topic root `/Atlas`: `/Multicast/Tweet_ThingIdentity`, `/Multicast/Tweet_EntityIdentity`, `/Multicast/API`, `/Unicast/Interaction`; tweet types `Identity_Thing`, `Identity_Language`, `Identity_Entity`, `Service`, `Relationship` (field shapes in §5.2) | New (R1): this is what the IDE listens to |
| L23 | The Lab 4 relationships declared in the IoT-DDL (`interfere` between `Fan_On`/`Fan_Off` and between `Set_Window`/`Window_Close`) | Displayed; plus the order-based and condition-based relationships the assignment needs |
| L24 | The Lab 4 **Part II demo app** (`Read_Temp`, `Fan_On`, `Set_Window`) | The acceptance demo: it must be rebuildable in the new IDE, graphically |
| L25 | Everything works on a LAN with **no internet** (Lab 4 loaded MQTT.js from a CDN — that is fixed here) | All libraries vendored locally |

---

## 4. Architecture and tech stack

### 4.1 Why there is a small local server

A pure browser page cannot do three things the guidelines require: open the raw
**TCP** connections Atlas service calls need (R4/L20), **scan, read, write and delete
files** in the Atlas working directory (R4), and keep an app **running independently of
the browser tab** so `activate`/`stop`/`Completed` are a real life cycle (R4).
So: a small **Node.js** server owns discovery, files and execution; the browser owns
the IDE. One origin, no framework.

```
  Browser — the IDE                            Node.js server — the space + the apps
  ┌───────────────────────────────┐            ┌─────────────────────────────────────┐
  │ shell: menu, tabs, panels     │  REST      │ space.js    space model (R1/R2)     │
  │ Drawflow graphical editor     │ ─────────► │ apps.js     .iot files (R4)         │
  │ CodeMirror 6 text editor      │            │ runtime.js  activate / stop (R4)    │
  │ console + status panel        │ ◄───────── │ gateway-*   tweets + service calls  │
  │ lang/ (parse, print, validate)│  SSE       │ lang/ (parse + run)                 │
  └───────────────────────────────┘            └──────────────┬──────────────────────┘
                                             MQTT :1883       │        TCP :6668
                                        (Atlas tweets) ◄──────┴──────► (service calls)
                                                      Atlas things (RPi)
                                     Atlas working directory:  apps/*.iot
```

### 4.2 Stack

| Layer | Choice | Why |
|---|---|---|
| Server | **Node.js 20**, built-in `http` / `net` / `fs` only | no framework, as `AGENTS.md` requires; `net` gives Atlas TCP, `fs` gives the working directory |
| Browser → server | plain `fetch` + JSON | nothing to add |
| Server → browser | **Server-Sent Events** (`text/event-stream`) | live tweets, run status and log lines with **zero dependencies** (a WebSocket library would be one more dependency for a one-way stream) |
| MQTT | **`mqtt`** (MQTT.js, MIT) | the Atlas things speak MQTT; same library family as Lab 4 |
| Graphical editor | **Drawflow** (MIT), vendored `drawflow.min.js` + `.css` | required by the prompt; drag-and-drop, typed inputs/outputs, `export()`/`import()`, and **modules** — one module per open project |
| Text editor | **CodeMirror 6** (MIT), bundled into `public/vendor/editor.bundle.js` | required by the prompt; gives decorations (green/read highlights), gutters, line mapping |
| Language parser | **Lezer** grammar compiled by `@lezer/generator` (MIT) | the prompt asks to reuse CodeMirror's/Lezer's parsing; one declarative grammar gives tokenisation, syntax highlighting, **error nodes with exact positions**, bracket/delimiter matching and incremental re-parse — no hand-written compiler |
| Build | **esbuild** (MIT), dev-only, `npm run build` | one command produces the generated parser and the editor bundle, both committed because the app loads them directly (`AGENTS.md` §Keep the code readable) |
| Tests | `node --test` | no dependency |

Everything is vendored; the IDE never contacts the internet at runtime (L25).
Each library is recorded in `README.md` with its licence and the reason for it, as
`AGENTS.md` and the guidelines' open-source note require.

### 4.3 File map

| File | Purpose |
|---|---|
| `PLAN.md` | this plan (and the `PROJECT.md` of `AGENTS.md`) |
| `PROJECT.md` | one-line pointer to `PLAN.md` |
| `QUESTIONS.md` | open questions for the user; emptied once answered |
| `CHECKPOINT.md` | where the work stands |
| `directive_conflicts.md` | prompt vs. guidelines conflicts and their resolution |
| `docs/guideline-conflicts.md` | pointer to `directive_conflicts.md` |
| `docs/tweets.md` | the real tweet shapes captured from the things |
| `package.json` | scripts and the four dependencies |
| `build.mjs` | grammar → `lang/iot.parser.js`; bundle → `public/vendor/editor.bundle.js` |
| `server/index.js` | HTTP entry point: static files, REST routes, the SSE stream |
| `server/space.js` | the space model: things, entities, services, relationships (advertised + user, §5.1); merges tweets, detects "discovery finished" |
| `server/gateway-atlas.js` | real gateway: MQTT tweet subscription + service calls over TCP 6668 |
| `server/gateway-sim.js` | simulated gateway: replays the Lab 4 thing (L17–L19) and a second thing, `AT_BoarLamp`, so cross-thing apps can be built with no hardware |
| `server/apps.js` | the Atlas working directory: list, read, write, delete `.iot`, name and extension rules |
| `server/relationships.js` | the developer's own relationships: `relationships.json` in the same directory, plus the rules a new one has to satisfy |
| `server/runtime.js` | run life cycle: activate, stop, `Active`/`Stopped`/`Completed`, start time, log fan-out |
| `lang/iot.grammar` | the Lezer grammar of the composition language (source of truth for syntax) |
| `lang/iot.parser.js`, `lang/iot.terms.js` | generated parser (committed; rebuilt by `npm run build`) |
| `lang/ast.js` | Lezer tree → AST, with a stable id and a source range per node |
| `lang/print.js` | AST → text, and the line range each node printed to |
| `lang/validate.js` | syntax errors from the tree + the few catalogue checks (§6.4) |
| `lang/graph.js` | AST ↔ Drawflow graph conversion, both directions |
| `lang/run.js` | the orchestrator, ported from Lab 4 `app.js` (L10–L15) |
| `public/editor-entry.js` | the only file that knows CodeMirror: bundled into `public/vendor/editor.bundle.js` and exposed as `window.AtlasEditor` |
| `public/index.html` | the VS Code-shaped shell |
| `public/style.css` | the whole look (dark, VS Code-like) |
| `public/main.js` | bootstrap, project tabs, menu actions, SSE subscription |
| `public/project.js` | one open project: its AST, both editor states, console, dirty/lock flags |
| `public/panel-apps.js` | Apps side panel: list, open, save, finalize, delete |
| `public/panel-devices.js` | Devices side panel, including the relationships group and the dialog that adds one |
| `public/graph-editor.js` | Drawflow wiring, lock/blur, change events, the drop-time connect suggestions |
| `public/relationship-guidance.js` | which relationships guide a dropped service and the text a suggestion generates (no DOM, so it is unit-tested) |
| `public/text-editor.js` | CodeMirror view, highlight decorations, Apply Changes |
| `public/bottom-panel.js` | console (validation + output) and the app status panel |
| `public/settings.js` | settings, incl. the highlighting switch |
| `public/vendor/` | `drawflow.min.js`, `drawflow.min.css`, `editor.bundle.js` |
| `public/dev/probe.html` | development aid: drives the IDE in an iframe and reports what happened, so the sync behaviour can be checked from a terminal |
| `apps/` | the default Atlas working directory, with two example apps |
| `tests/` | language, graph and app-manager tests |

---

## 5. The space model (R1, R2)

### 5.1 Shape

One object, owned by the server, pushed to the browser on connect and on every change:

```jsonc
{
  "space":  { "id": "BoarSmartSpace", "ideAddress": "192.168.8.50:7000",
              "broker": "connected", "discovery": "ready" },
  "things": [{ "id": "AT_BoarAirSensor", "name": "Smart Air Quality Sensor",
               "owner": "BoarGroup", "os": "Raspbian", "description": "…",
               "ip": "192.168.8.189", "port": "6668", "lastSeen": "…",
               "entities": [
                 { "id": "ClimateSensor", "name": "DHT11", "category": "Hardware",
                   "role": "sensor",
                   "services": [{ "name": "Read_Temp", "type": "Report",
                                  "inputs": [{ "name": "F_or_C", "type": "int" }],
                                  "output": { "name": "Temperature", "type": "int" },
                                  "keywords": […], "description": "…" }] }],
               "relationships": [{ "name": "Fan On interference", "type": "interfere",
                                   "first": "Fan_On", "second": "Fan_Off",
                                   "description": "…" }] }],
  "relationships": [
    { "id": "iot-ddl|AT_BoarAirSensor|Vent after reading|Read_Temp|Fan_On",
      "name": "Vent after reading", "type": "order", "description": "…",
      "source": "iot-ddl", "resolved": true,
      "first":  { "thing": "AT_BoarAirSensor", "entity": "ClimateSensor", "service": "Read_Temp" },
      "second": { "thing": "AT_BoarAirSensor", "entity": "Fan",           "service": "Fan_On" } },
    { "id": "user:9e85…", "name": "Lamp follows fan", "type": "order", "description": "…",
      "source": "user", "resolved": true,
      "first":  { "thing": "AT_BoarAirSensor", "entity": "Fan",  "service": "Fan_On" },
      "second": { "thing": "AT_BoarLamp",      "entity": "Lamp", "service": "Lamp_On" } }]
}
```

`role` is derived from the services' Atlas `Type`: `Report` → **sensor**, `Action` →
**actuator** (R2's optional split, which the prompt needs for the Devices panel).

The top-level **`relationships`** array is the Relationships view: the advertised
ones (`source: "iot-ddl"`, kept per thing above and flattened here) followed by the
developer's own (`source: "user"`, owned by `server/relationships.js`). Three
assumptions, also recorded in `docs/tweets.md` and `README` §5:

- **user relationships persist across restarts** — they are saved to
  `relationships.json` in the Atlas working directory (`--apps`);
- **they may link services on two different things**, which an advertised one
  never can, because the IoT-DDL Builder only relates services of the same entity;
- **advertised relationships are read-only**: Atlas owns them, so the IDE refuses
  to delete one (HTTP 403).

Endpoints are resolved to `(thing, entity, service)` **when the state is
serialised**, because a `Relationship` tweet can arrive before the `Service` tweet
it names. `resolved` is `false` when an endpoint is not currently discovered; such
an entry is kept and shown greyed out, never dropped. Nothing here executes:
relationships only guide the developer (§6.2), and `runtime.js` ignores them.

### 5.2 Tweets to parse (field names taken from the Lab 4 middleware source)

| Tweet Type | Fields |
|---|---|
| `Identity_Thing` | `Thing ID`, `Space ID`, `Name`, `Model`, `Vendor`, `Owner`, `Description`, `OS` |
| `Identity_Language` | `Thing ID`, `Space ID`, `Network Name`, `Communication Language`, `IP`, `Port` |
| `Identity_Entity` | `Thing ID`, `Space ID`, `Name`, `ID`, `Type`, `Owner`, `Vendor`, `Description` |
| `Service` | `Thing ID`, `Space ID`, `Entity ID`, `Name`, `Vendor`, `Type`, `AppCategory`, `Description`, `Keywords`, `API` = `Name:[desc,type, NULL|…]:(outDesc,outType, NULL)` |
| `Relationship` | `Thing ID`, `Space ID`, `Name`, `Owner`, `Category`, `Type`, `Description`, `FS name`, `SS name` |
| `Service call` / `Service call reply` | the interaction messages of L20 |

Tweets arrive on `<root>/Multicast/Tweet_ThingIdentity`,
`<root>/Multicast/Tweet_EntityIdentity`, `<root>/Multicast/API` and
`<root>/Unicast/Interaction` (root `/Atlas`). Tweets are keyed by
`(Thing ID, Entity ID, Name)` so a repeat updates and never duplicates.
**Step 1 of the plan captures the real traffic into `docs/tweets.md` before the
parser is written** — the table above comes from reading the middleware source, not
from a live capture, so it must be confirmed.

### 5.3 Start-up freeze

The server reports `discovery: "scanning"` until no new tweet has arrived for
`quietMs` (default 3 s) or `maxMs` (default 15 s) has passed, then `"ready"`.
The IDE shows a blocking "Scanning smart space…" overlay while scanning
(guidelines R1 note). Discovery keeps running afterwards; a thing that goes silent
for longer than `staleMs` is marked stale in the Devices panel.

### 5.4 Adding a relationship

`server/relationships.js` owns `relationships.json` and the rules. A missing or
corrupt file means an empty list, not a crash.

| Route | Answer |
|---|---|
| `POST /api/relationships` | `201` with the stored relationship, or `400 { error }` |
| `DELETE /api/relationships/:id` | `204`; `403` for an advertised one; `404` if unknown |
| `GET /api/relationships` | the same list `GET /api/state` carries, for convenience |

A change is pushed to every browser as a new `state` event, because the two kinds
are one list in the UI. The rules, each with a message meant to be shown as it is:

1. a short, non-empty name (≤ 40 characters);
2. the type is `order` or `condition` — nothing else can be user-defined;
3. both ends are given, and are not the same service twice;
4. both ends name a service some discovered thing actually offers;
5. for `condition`, the first service has a non-`void` output, since the type
   compares its return value;
6. no duplicate — same type and same two endpoints — of any relationship already
   known, advertised ones included.

The entity of each end is resolved from the space rather than taken from the
browser, so the stored record is the thing's own. The dialog that drives this
(name, type as radios with a one-line explanation of each, two service menus
grouped by thing and entity with `<optgroup>`, optional description) lives in
`public/panel-devices.js`; it shows the server's message inline and stays open, and
the button that opens it is disabled during the start-up freeze.

---

## 6. The composition language

The Lab 4 grammar (L6), kept because it already matches R3's three app types,
with the smallest set of changes needed by a multi-thing space.

```
// Type 1 — ordered set: statements run top to bottom
RUN AT_BoarAirSensor.Read_Humidity()
RUN AT_BoarAirSensor.Fan_Off()

// Type 2 — order-based: Fan_On runs only if Read_Temp completed successfully
RUN  AT_BoarAirSensor.Read_Temp(C)
THEN AT_BoarAirSensor.Fan_On(60)

// Type 3 — condition-based, with ELSE, nesting and AND/OR
IF   AT_BoarAirSensor.Read_Temp(C) > 28 AND AT_BoarAirSensor.Read_Humidity() > 60
DO   AT_BoarAirSensor.Fan_On(75)
     AT_BoarAirSensor.Set_Window(50)
ELSE AT_BoarAirSensor.Window_Close()
END
```

Changes to Lab 4:

1. **The qualifier is the Atlas Thing ID** (`AT_BoarAirSensor.Read_Temp(C)`),
   replacing the hard-coded `RPi1`. An unqualified call stays legal when exactly one
   discovered thing offers that service; otherwise the console reports an ambiguity.
2. `END` closes `IF`; `IF` nests. These are the "grouping delimiters" R3 asks for, and
   what the prompt's "unmatched delimiters" check is about.
3. Everything else is unchanged: comparisons, `AND`/`OR` (no parentheses, `AND`
   binds tighter), `//` comments, integer arguments, `C`/`F` aliases, free
   indentation.
4. A `LOOP EVERY <n>s … END` construct is **added** (decision D11): without a
   long-running app, `stop` can never be shown, because every app finishes in
   seconds and ends as `Completed`. A looping app stays `Active` until `stop`.

### 6.1 Grammar, AST and ids

`lang/iot.grammar` is a Lezer grammar; `npm run build` compiles it to
`lang/iot.parser.js`. `lang/ast.js` walks the Lezer tree once and produces:

```jsonc
{ "kind": "program", "body": [
  { "id": "n3", "kind": "order",     "calls": [ {"id":"n4","thing":…,"name":…,"args":[…]} ] },
  { "id": "n7", "kind": "condition", "test": {…}, "consequent": [...], "alternative": [...] }
] }
```

Every node carries a stable `id` and its source range. The id is what ties a
Drawflow node, an AST node and a text line range together — it is the whole
synchronisation mechanism.

### 6.2 Graph shape (Drawflow)

| Drawflow node | Represents | Inputs | Outputs |
|---|---|---|---|
| `start` | the program entry; exactly one per project | – | `next` |
| `service` | one service call, with a field per input | `in` | `next` (sequential), `ok` (order-based = `THEN`) |
| `condition` | one `IF`: its predicates (service call, operator, value, `AND`/`OR`) | `in` | `then`, `else` |

So R3's three types are exactly: a chain of `next` edges (Type 1), an `ok` edge
(Type 2), a `condition` node (Type 3) — and they compose because every output can
lead into any node. Services are dragged in from the Devices panel; when a service is
dropped, the relationships that start at it are offered as a one-click "connect"
suggestion (R3's "with the guidance of relationships"):

| Relationship | What the suggestion adds |
|---|---|
| `order` | a block for the second service, joined by the dropped block's `ok` port — a `THEN` edge |
| `condition` | a `condition` block testing the first service's return value against a **placeholder** value, with a block for the second service in its `then` branch |
| anything else (`interfere`) | nothing: it is shown in the Relationships view but never offered |

The rules live in `public/relationship-guidance.js`, which has no DOM in it and is
unit-tested. Three details:

- matching is on `(thing, service)`, so the same service name on another thing does
  not pull in a relationship that belongs elsewhere;
- a relationship with `resolved: false` is skipped — the block it would add could
  not be called;
- advertised and user-defined relationships are treated alike, and generated calls
  are **always written as `Thing.Service(…)`**. That covers the cross-thing case a
  user-defined relationship can create, and matches the service blocks, which print
  the thing too; a bare service name would be ambiguous as soon as two things offer
  it.

A suggestion only writes a program the developer could have drawn by hand. Nothing
in `runtime.js` reads relationships.

### 6.3 `.iot` file format

JSON, with the **source text as the canonical content** and the graph layout beside
it, so hand-edited files still load and positions survive a reload:

```json
{ "format": "atlas-iot-app", "version": 1, "name": "AirControl",
  "finalized": true, "created": "…", "modified": "…",
  "source": "IF AT_BoarAirSensor.Read_Temp(C) > 28\nDO AT_BoarAirSensor.Fan_On(75)\nEND",
  "layout": { "n3": { "x": 120, "y": 60 } } }
```

### 6.4 Validation (deliberately thin)

Three levels, in this order; the first that fails stops the rest.

1. **Lexical / syntactic** — from the Lezer tree: every `⚠` error node becomes one
   console entry `line:col  message` plus a red decoration over its range. This is
   what catches invalid tokens, malformed statements and unmatched `IF`/`END`.
2. **Structural** — the few checks the tree cannot express: `THEN` without `RUN`,
   `ELSE`/`END` without `IF`, an empty `DO` branch, an `IF` with no condition.
3. **Catalogue** — *warnings*, never blocking: unknown service, wrong number of
   arguments, ambiguous unqualified call, argument outside the IoT-DDL range.

No type checker, no semantic analysis — as the prompt requires. Level 3 exists
because R3 says the editor works from the *available* services, but it is a warning
so the IDE never refuses to open a file.

---

## 7. How the two editors stay in sync

**The AST is the single source of truth.** Both editors are views over it; neither
is derived from the other. Each project owns one AST, one Drawflow module and one
CodeMirror state, and a flag saying which side currently holds the pen.

```
                   ┌──────── AST (+ id → line range, id → node id) ────────┐
                   │                                                       │
   graph change    │   print()                              build()        │   Apply Changes
  ───────────────► AST ──────────► text (diff → green / red decorations)   │
                                                                           │
   typing ────► text (graph locked + blurred) ──validate()──► AST ──────────┘──► graph.import()
```

### 7.1 Graph → text (live, every change)

1. Drawflow fires `nodeCreated`, `nodeRemoved`, `connectionCreated`,
   `connectionRemoved`, `nodeDataChanged`.
2. `lang/graph.js` turns the Drawflow export into a new AST. Node ids are preserved,
   so unchanged statements keep their ids.
3. `lang/print.js` prints the new AST and returns `{ text, ranges: { id → [from,to] } }`.
4. The old and new texts are compared **by node id**, not by text diffing: ids present
   only in the new AST are *added* lines; ids present only in the old one are
   *removed* lines. This is exact — no diff heuristics.
5. One CodeMirror transaction replaces the document, then:
   - **added** ranges get a green decoration (`.cm-change-added`);
   - **removed** lines are first *kept* with a red decoration (`.cm-change-removed`),
     and after ~700 ms a second transaction deletes those now-empty lines and the
     decoration with them. That is exactly the prompt's "highlight in red, then remove
     the resulting empty line(s) automatically".
6. Decorations fade out after ~2 s. If highlighting is switched off in the settings,
   steps 5–6 collapse to a plain document replacement (the red lines are deleted
   immediately), which is the only difference the switch makes.

The text editor is **read-only-by-intent** in this direction: the update is applied
as a programmatic transaction annotated `fromGraph`, so the "user started typing"
listener ignores it and the graph does not get locked by its own update.

### 7.2 Text → graph (explicit, on *Apply Changes*)

1. The first *user* transaction in the text editor (any transaction not annotated
   `fromGraph`) sets the project to **editing-text**:
   - the Drawflow container gets `pointer-events: none`, `filter: blur(3px)` and a
     dimming overlay (prompt: "block and blur");
   - *Apply Changes* and *Discard* become enabled; the graph stays locked until one
     of them is used.
2. **Apply Changes** runs §6.4. On failure: red decorations on the offending ranges,
   one console line per error, the graph stays locked, nothing is applied.
   On success: the new AST replaces the old one, `lang/graph.js` builds a Drawflow
   export (reusing the stored layout for surviving ids and auto-laying-out new ones),
   `drawflow.import()` loads it, the lock lifts, and the nodes that appeared get a
   brief green outline — the mirror image of §7.1.
3. **Discard** restores the text from the current AST and lifts the lock.
4. Live-as-you-type validation still runs (CodeMirror `linter`-style gutter marks), so
   errors are visible before the button is pressed; only *Apply* commits.

### 7.3 Selection sync (small, high-value)

Clicking a Drawflow node scrolls the text editor to its line range and highlights
it; putting the cursor on a line outlines the corresponding Drawflow node. Both
directions are one lookup in the id ↔ range maps built in §7.1.

---

## 8. Layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ATLAS IDE   activate  update  stop  delete        ┌───────────────────────┐   │ ← menu bar + meta
│                                                   │ http://192.168.8.50:7000│ │   (R2 address)
├──┬────────────────────┬───────────────────────────┴───────────────────────┬───┤
│  │                    │ ⊞ AirControl ×  ⊞ NightMode ×                     │   │ ← project tabs
│▣ │  APPS              ├───────────────────────────────────┬───────────────┤   │
│  │  ▸ AirControl.iot  │                                   │ Apply Changes │   │
│▤ │  ▸ NightMode.iot   │        Drawflow canvas            │ Discard       │   │
│  │                    │                                   ├───────────────┤   │
│  │  DEVICES           │   ┌──────┐   ┌──────────┐         │ 1 RUN …       │   │
│  │  ▾ AT_BoarAirSensor│   │Read_ │──►│ Fan_On   │         │ 2 THEN …      │   │
│  │    ▾ sensors       │   │Temp  │ok │ speed 60 │         │ 3 …           │   │
│  │      ClimateSensor │   └──────┘   └──────────┘         │               │   │
│  │    ▾ actuators     │                                   │ CodeMirror 6  │   │
│  │      Fan · Window  │                                   │               │   │
│  │  ▾ relationships  +│                                   │               │   │
│  ├────────────────────┼───────────────────────────────────┴───────────────┤   │
│  │                    │ CONSOLE | OUTPUT | STATUS                   ⌫  ⌃  │   │ ← bottom panel
│  │                    │ 3:6  expected DO after IF, got "RUN …"            │   │
└──┴────────────────────┴───────────────────────────────────────────────────┴───┘
```

* **Menu bar** — `activate`, `update`, `stop`, `delete`, lowercase, acting on the
  active project (the prompt's four actions; mapping to R4 in §9).
* **Meta bar** — the URL the IDE is served on, plus the broker and discovery
  indicators (L1).
* **Activity bar** — two icons, **Apps** and **Devices**, plus a settings gear at the
  bottom (VS Code puts it there; it is where the highlighting switch lives).
* **Apps panel** — every `.iot` in the working directory, with a running badge.
  Double-click opens it in a new project tab, in both editors. Right-click →
  delete/rename. A *new app* button at the top.
* **Devices panel** — one collapsible group per discovered thing, and inside it
  **sensors**, **actuators** and **services** sub-groups, so each device's parts are
  visually together as the prompt asks. Services are listed alphabetically (R2) and
  are the drag source for the graphical editor. Below the things, **one
  `relationships` group for the whole space**: a user-defined relationship may link
  two things and so belongs to no single device. Each row reads
  `Entity.Service → Entity.Service` (prefixed with the thing when the two ends are on
  different things) with a type badge and a source badge (*IoT-DDL* / *user*); an
  unresolved row is greyed out, and a user row carries a delete icon. A
  *+ add relationship* button opens the dialog of §5.4, disabled while the start-up
  scan is still running.
* **Tab bar** — one tab per open project, dirty marker, middle-click to close,
  warn on close when unsaved.
* **Bottom panel** — tabbed: **Console** (validation errors, the prompt's
  requirement, default tab), **Output** (the Lab 4 execution log, L15) and
  **Status** (R4's status panel: app, start time, `Active`/`Stopped`/`Completed`,
  stop button). It spans the full width under both editors.

---

## 9. How each requirement is met

### 9.1 Prompt requirements

| Requirement | How |
|---|---|
| VS Code-style layout | §8, one HTML shell with CSS grid; VS Code is imitated, nothing is copied from it |
| Menu bar `activate` `update` `stop` `delete` | `public/main.js` → REST calls on the active project. `activate` = R4 ACTIVATE, `update` = R4 SAVE APP on the open project, `stop` = R4 STOP, `delete` = R4 DELETE (see `QUESTIONS.md` Q2) |
| Top bar shows the network address where the IDE runs | the server reports its LAN address and port; shown in the meta bar (R2) |
| Activity bar with **Apps** and **Devices** | `panel-apps.js`, `panel-devices.js`; one is visible at a time |
| Apps panel lists developer apps; double-click opens both editors | `GET /api/apps`; `dblclick` → `GET /api/apps/:name` → new project → AST → graph + text |
| Devices panel lists connected devices, their sensors, actuators and services, grouped | the space model of §5, rendered as nested groups per thing |
| Graphical editor in the main area | Drawflow, one **module** per project |
| Text editor in the right panel, updated in real time | CodeMirror 6, driven by §7.1 |
| Console spanning both editors, showing validation errors | `bottom-panel.js`, Console tab, fed by `lang/validate.js` |
| One tab per open project | the tab bar of §8 |
| Several independent projects in one window | `public/project.js`: one object per project holding its own AST, Drawflow module, CodeMirror `EditorState`, console buffer, dirty and lock flags, and file path. Nothing is global; switching a tab swaps the Drawflow module and the CodeMirror state |
| Added block/connection → **green** lines | §7.1 steps 4–5 |
| Removed block/connection → **red** lines, then the empty lines are removed | §7.1 step 5 |
| *Apply Changes* button above the text editor | §7.2; next to it, *Discard* |
| Graph locked and blurred while the text is edited, until applied or discarded | §7.2 step 1 |
| Lightweight lexical + syntactic validation, reusing an existing parser | Lezer grammar, §6.4 levels 1–2; no type checking, no semantic analysis |
| Failure → red highlight + console list + no apply | §7.2 step 2 |
| Success → graph updated from the text | §7.2 step 2 |
| Settings: highlighting can be turned off | `settings.js`, persisted; §7.1 step 6 |
| Guidelines fill the gaps; prompt wins conflicts; conflicts recorded | §2, §9.2, `directive_conflicts.md` |

### 9.2 Guidelines requirements

| Requirement | How |
|---|---|
| R1 discovery on a background thread | `gateway-atlas.js` subscribes to the Atlas MQTT topics in the server process, independent of any browser; `space.js` merges the five tweet types (§5.2) |
| R1 start-up freeze | §5.3 + the scanning overlay |
| R2 space meta information | the meta bar |
| R2 Things / Services / Relationships tabs | folded into the **Devices** panel, because the prompt fixes the activity bar to two icons — logged as conflict C1 |
| R2 services alphabetical, per thing, sensor/actuator split | `panel-devices.js` sorts by name inside each group and derives the role from the Atlas service `Type` |
| R2 relationships shown | in one space-level `relationships` group in the Devices panel (§8), and offered as connection suggestions in the graphical editor (§6.2). The developer can add their own `order`/`condition` relationships between any two services, including across things (§5.1) |
| R2 Apps tab initially empty, offers new or upload | the Apps panel is empty when the working directory is; it has a *new app* button and opens existing apps on double-click |
| R2/R4 SAVE APP only inside the editor, `.iot` rules, repeated saves | `update` is enabled only with a project open; `server/apps.js` enforces `name` → `name.iot` and `name.ext` → `name.ext.iot`, and overwrites silently once the file name is known |
| R3 editor, GUI + text | the two synchronised editors |
| R3 Types 1, 2, 3 composable sequentially | §6, §6.2 |
| R3 relationship guidance | §6.2, driven by the one `relationships` list of §5.1 — advertised and user-defined alike |
| R3 Clear and Finalize | decision D2: *clear* in the graphical editor's toolbar, *finalize* in the Apps panel acting on the active project |
| R4 UPLOAD APP, working directory scanned at start | `server/apps.js` scans the configured directory at boot and on change |
| R4 working directory fixed but changeable | a setting, persisted server-side |
| R4 ACTIVATE + status panel with start time and status | `server/runtime.js` + the Status tab |
| R4 STOP, with cleanup, from the status panel and the Apps panel | `runtime.js` cancels pending calls and timers and marks the run `Stopped` |
| R4 apps that end on their own are `Completed` and cannot be stopped | the run ends by itself; its stop button is disabled |
| R4 status bar cleared when the IDE starts and terminates | runs live only in the server process and are abandoned on shutdown; nothing is persisted |
| R4 DELETE only from the Apps tab, confirmed, blocked while running | `panel-apps.js` context menu → confirm dialog → `DELETE /api/apps/:name`; refused by the server while a run is active |
| Only features that work | anything unfinished at the feature freeze is removed from the UI, as the guidelines demand |
| Open-source documented with licences | `README.md` table + the report |
| Report, screenshots, slides, demo | final steps of §10 |

---

## 10. Plan

Each step fits in part of a session and ends with a commit, a push and a
`CHECKPOINT.md` update.

| # | Step | Done when |
|---|---|---|
| 0 | **Answer the questions.** Fold the answers into this plan, empty `QUESTIONS.md` | ✅ done 2026-11-20: §12 records the thirteen decisions, `QUESTIONS.md` is closed |
| 1 | **Capture the real tweets.** `mosquitto_sub -h <pi> -t '/Atlas/#' -v`; write the actual field names and topics into `docs/tweets.md`; correct §5.2 | `docs/tweets.md` lists one real example of each of the five tweet types, or records that no hardware was available and the middleware source is the only reference |
| 2 | **Skeleton.** `package.json`, `build.mjs`, vendored Drawflow, `server/index.js` serving `public/` + `GET /api/state` with a fixture, the §8 shell with empty panels, dark theme | `npm start` serves an IDE-shaped page with its address in the meta bar; `npm test` runs and passes with no tests  ✅ |
| 3 | **The language.** `lang/iot.grammar`, generated parser, `ast.js`, `print.js`, `validate.js`, `tests/lang.test.js` with the Lab 4 grammar cases (L6, L7) plus print/parse round-trips | every Lab 4 example parses, prints back identically, and each malformed example yields an error with the right line  ✅ |
| 4 | **Discovery.** `space.js`, `gateway-sim.js` (the Lab 4 thing, L17–L19), `gateway-atlas.js`, SSE, the freeze overlay | with the simulator the Devices panel fills from tweets, alphabetically, grouped by thing → sensors / actuators / services / relationships; the overlay appears and clears  ✅ |
| 5 | **Text editor.** `editor.bundle.js` (CodeMirror 6 + the grammar), syntax highlighting, gutter errors, console wiring, Apply Changes / Discard with lock-and-blur | typing locks and blurs the graph; a bad program lists errors in the console with red highlights and applies nothing; a good one unlocks  ✅ |
| 6 | **Graphical editor.** `graph-editor.js`, the three node types, drag from the Devices panel, `lang/graph.js` both ways, `tests/graph.test.js` | the Lab 4 Part II demo app (L24) can be built entirely by dragging, and AST → graph → AST round-trips  ✅ |
| 7 | **Green/red sync.** §7.1 in full, plus selection sync and the settings switch | adding a block greens its new lines; deleting one reds the lines and then removes them; the switch turns both off  ✅ |
| 8 | **Projects and tabs.** `project.js`, the tab bar, per-project state, close/dirty handling | two apps open at once, each with its own graph, text, console and lock state; switching tabs never leaks state  ✅ |
| 9 | **App manager.** `apps.js`, the Apps panel, `update` (save), new, finalize, clear, delete; name and `.iot` rules | the R4 and R2 saving rules all hold, incl. `name.ext` → `name.ext.iot`; the app list survives a restart  ✅ |
| 10 | **Runtime.** `run.js` ported from Lab 4 (L10–L15), `runtime.js`, `activate`/`stop`, the Status tab | an app runs against the simulator with the Lab 4 log semantics; a finite app ends `Completed` and cannot be stopped; a looping one stays `Active` until `stop`  ✅ |
| 11 | **Hardware pass.** Point the Atlas gateway at the real RPi(s), fix what the real tweets and the 6668 timing break (L20, L21) | the Lab 4 Part II demo app runs from the IDE against the real thing |
| 12 | **Polish and deliver.** README with the licence table, screenshots of the IDE and every dialog, the ≤5-page report, the 2-minute deck, rehearsals | the deliverables checklist is complete and a tagged version is submittable |

Steps 3–7 are the core of this prompt; 9–11 are the core of the guidelines.
If time runs short, step 11 degrades to the simulator and the report says so.

---

## 11. Run and test

```bash
cd Final_Project
npm install                 # mqtt, esbuild, @lezer/generator, @lezer/* runtime
npm run build               # lang/iot.grammar -> lang/iot.parser.js
                            # CodeMirror + lang -> public/vendor/editor.bundle.js
npm test                    # node --test tests/
npm start                   # IDE on http://0.0.0.0:7000, prints its LAN address

# against the real space
npm start -- --broker 192.168.8.189:1883 --apps ./apps
# with no hardware
npm start -- --simulate
```

`npm run build` must be re-run and its two outputs committed whenever
`lang/iot.grammar` or anything in `lang/` changes (`AGENTS.md`).

---

## 12. Decisions

Settled on 2026-11-20: the user accepted every recommended default in
`QUESTIONS.md`, which is now closed. The sections above are written around these,
so this is a record, not a change list.

| # | Decision |
|---|---|
| D1 | **Node.js server + plain-JavaScript browser IDE**, because TCP 6668, the Atlas working directory and a run life cycle that outlives the tab are all impossible in a browser alone. **No hardware is available from this machine**, so both gateways are built and everything is developed against `gateway-sim.js`, which reproduces the Lab 4 thing exactly (L17–L19). Plan steps 1 and 11 need the user's Pi; until then §5.2's tweet fields stay "read from the middleware source, unconfirmed" |
| D2 | `update` = **SAVE APP**. `activate`/`stop`/`delete` = R4 ACTIVATE/STOP/DELETE. UPLOAD APP = double-click in the Apps panel; *new app* = `+` in the Apps panel; *finalize* = Apps-panel button on the active project; *clear* = graphical-editor toolbar |
| D3 | One bottom panel, three tabs: **Console** (validation errors, default), **Output** (Lab 4 execution log), **Status** (R4 running apps) |
| D4 | Relationships live in **one space-level `relationships` group** in the Devices panel **and** drive connection suggestions in the graphical editor. Revised after the instructor's clarification: advertised (IoT-DDL) relationships are read-only and same-thing only, while the developer may define `order`/`condition` relationships between any two discovered services, two different things included. The developer's own ones are saved in `relationships.json` beside the apps and survive a restart. Nothing executes them — see §5.1, §5.4, §6.2 |
| D5 | A device is an Atlas **thing**; its **entities** are grouped sensor/actuator from the service `Type` (`Report`/`Action`); services listed alphabetically under their entity |
| D6 | **Lezer grammar** for the text syntax; Lab 4's **orchestrator** is ported, its regex parser retired, its grammar test cases reused |
| D7 | The Lab 4 language is kept; the only change is the **Thing ID qualifier** (unqualified still legal when unambiguous) |
| D8 | The meta bar shows the IDE's **LAN URL** (`http://<lan-ip>:7000`), the space id and the broker/discovery indicators |
| D9 | Settings behind a gear at the bottom of the activity bar: highlight changes on/off, working directory, broker address, simulator on/off, fade duration. Stored server-side as JSON; the highlight switch mirrored in `localStorage` |
| D10 | Red ~700 ms then the empty lines are deleted; green ~2 s then fades. With highlighting off both colours are skipped and removals are immediate — **the switch never changes the resulting document** |
| D11 | **`LOOP EVERY <n>s … END` is added**, so that `stop` is demonstrable at all |
| D12 | One Pi hosting `AT_BoarAirSensor`, but the design is multi-thing from the start: calls are qualified, routed and serialised per thing |
| D13 | VS Code-like **dark theme only**, CSS custom properties so a light theme stays a one-liner later; **inline SVG icons**, no icon font, nothing fetched at runtime. No images/skins for things and services (step 12 only, if everything else works) |
