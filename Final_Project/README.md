# Atlas IoT Application IDE — Project Plan

---

## Useful links

- [Google Document](https://docs.google.com/document/d/1VKFvtHHD8RIvbwTrTB6uQKqivUGpet8quuX5LGZL6cA/edit?tab=t.0) to write random things
- [Drawflow](https://jerosoler.github.io/Drawflow/)
- [CodeMirror 6](https://codemirror.net/)

## 1. Goal

Evolve the Lab 4 mini-IDE (single page, single RPi, custom MQTT protocol, text-only composition) into a **realistic Atlas IoT Application IDE** that:

1. **Discovers** Atlas things, services and relationships by listening to tweets in the smart space (background scan).
2. **Displays** the space meta information in tabs: *Things, Services, Relationships, Apps*.
3. Provides an **App Editor** to compose apps of Type 1 (ordered services), Type 2 (order-based relationship) and Type 3 (condition-based relationship), combinable sequentially.
4. Provides an **App Manager**: Save, Upload, Activate, Stop, Delete, plus a live status panel.

**Success test (from the guidelines):** re-build the Lab 4 Part II demo application through the new IDE, and it must feel easier than before.

**Golden rule:** *only ship features that work.* A smaller IDE that works beats a bigger one with bugs. Always keep a tagged, submittable version.

---

## 2. Deliverables checklist

- [ ] Zip with **code** (+ README on how to run it)
- [ ] **Report**, max 5 pages, aim for 3: code explanation, **third-party open source used + justification**, **screenshots of the IDE and its dialog boxes**
- [ ] **2-minute PowerPoint** + live demo (rehearsed as a group, several times)
- [ ] OneDrive link emailed before **11:00 on 30 Nov** (target: 09:00)

---

## 3. Starting point: what we already have

| File | What it is | How we reuse it |
|---|---|---|
| `Atlas_IoTDDL.xml` | IoT-DDL of thing `AT_BoarAirSensor` (space `BoarSmartSpace`): 3 entities, 10 services, MQTT broker `192.168.8.189:1883`, topic root `/Atlas`. | Source of truth for thing/service metadata. Needs new relationships (see §4). |
| `main.cpp` | Lab 4 Part 1 service program (RPi, `mosquitto` + `nlohmann/json` + `wiringPi`). Custom topics `vss/boar/{services,call,reply,status}`. | Keep as a **fallback/dev transport** and as the reference for the hardware logic. |
| `atlas_demo.cpp` | Lab 4 Part 2 client talking to the **real Atlas middleware** over TCP `:6668` with JSON `"Tweet Type":"Service call"`. | Defines the real call/reply format the new IDE must speak (§6.2). |
| `index.html` + `app.js` | Lab 4 web IDE: MQTT.js over WebSocket (`:9001`), catalogue table, text parser (`RUN/THEN/IF/DO/ELSE/END`, `AND/OR`, nesting, short-circuit), orchestrator, log. | The **parser and orchestrator are the most valuable asset**: extract them into a standalone module and keep them. UI gets rebuilt. |
| `style.css` | Referenced by `index.html` but **not in the upload** — make sure it is in the repo. | — |

---

## 4. Gaps and issues found in the baseline (fix first)

These come from reading the uploaded code; they should be resolved in Phase 0.

1. **The IDE does not listen to Atlas tweets.** Lab 4 used a private protocol (`vss/boar/*`); the guidelines require discovering things via Atlas tweets (thing identity, entity identity, service, thing language, relationship). This is the biggest architectural change.
2. **Browsers cannot open raw TCP sockets**, but Atlas service calls go over TCP `:6668` (see `atlas_demo.cpp`). A pure-browser IDE cannot call Atlas services directly → we need a small local backend (§6.1).
3. **Browsers cannot scan a "working directory" at startup** or write `.iot` files freely (Requirement 4 asks for exactly that). Same conclusion: local backend.
4. **`main.cpp` does not compile as uploaded:** `on_connect()` prints `status`, which is undeclared there (should be `"online"`).
5. **Hardware constants disagree between files:** `WINDOW_MAX_ANGLE` is 175 in `main.cpp` but 50 in the XML and in `atlas_demo.cpp`; servo PWM constants (`SERVO_CLOSED_PWM` 500 vs 150, `SERVO_TICKS_180` 10 vs 200) differ too. Test on the real servo and keep **one** set of values everywhere.
6. **No per-thing routing.** `call` is a single broadcast topic with no target thing; with several RPis they would all execute the same call. Calls must carry/route by Thing ID.
7. **Naming is inconsistent:** `RPi-1` (catalogue) vs `RPi1` (default in `app.js`, grammar help) vs `AT_BoarAirSensor` (Atlas Thing ID). Pick one qualifier scheme (§7).
8. **Relationships:** the XML only contains `interfere` relationships (Fan, Window). The assignment needs **order-based** and **condition-based** relationships, defined in the IoT-DDL builder (same-thing services only). `ClimateSensor` has none.
9. **`index.html` loads MQTT.js from `unpkg.com`.** The lab network (`GL-SFT1200`, `192.168.8.x`) may have no internet → **vendor all libraries locally** (also needed on demo day).
10. The XML contains the Wi-Fi passcode in clear text — keep credentials out of the public repo / report screenshots.

---

## 5. Requirements → features

Priority: **M** = must (graded core), **S** = should, **C** = could (only if everything else works).

### Requirement 1 — Discover Atlas things

| # | Feature | Pri |
|---|---|---|
| 1.1 | Background listener subscribed to the space's Atlas topics (`/Atlas/Multicast/...`) | M |
| 1.2 | Handle all tweet types: thing identity, entity identity, service, thing language, relationship | M |
| 1.3 | Merge tweets into one in-memory **space model**; repeated tweets update, never duplicate | M |
| 1.4 | **Startup freeze:** overlay "Scanning smart space…" until the model is stable (e.g. no new tweet for N s, hard timeout) — UI interaction while tabs are being learned is explicitly discouraged | M |
| 1.5 | Keep listening after the freeze (late/rejoining things); mark a thing *stale* if silent too long | S |
| 1.6 | Mock "thing simulator" that publishes recorded tweets, so UI work doesn't depend on RPi availability | S |

### Requirement 2 — Display space meta information

| # | Feature | Pri |
|---|---|---|
| 2.1 | Header with space meta info: **network address where the IDE is launched**, space ID (`BoarSmartSpace`), broker status | M |
| 2.2 | Tabs: **Things · Services · Relationships · Apps** (Apps initially empty) | M |
| 2.3 | **Things** tab: info card for each thing (one per RPi of the group) | M |
| 2.4 | **Services** tab: services of each thing in **alphabetical order**, one thing after the other. Show name, inputs, output | M |
| 2.5 | **Relationships** tab: all relationships heard, any order (order-based and condition-based must be visible) | M |
| 2.6 | Services split into *Sensor-type* (`Type=Report`) and *Actuator-type* (`Type=Action`) — trivial from the IoT-DDL | S |
| 2.7 | Relationships as a graph (simple SVG node-link, vendored, no CDN) | C |
| 2.8 | User-assigned images/skins for things, services, apps (stored in the IDE, not in IoT-DDL) | C |

### Requirement 3 — IoT Application Editor

| # | Feature | Pri |
|---|---|---|
| 3.1 | Text editor reusing the Lab 4 grammar (§7), with live syntax check and error messages | M |
| 3.2 | **Service palette**: pick one or more discovered services (grouped by thing/type); click/double-click inserts a call template with argument placeholders | M |
| 3.3 | **Relationship guidance:** after selecting a service, show relationships that involve it ("can follow…", "condition on…") and insert the matching `THEN` / `IF…DO…END` snippet | M |
| 3.4 | Support Type 1 (ordered set), Type 2 (order-based `THEN`), Type 3 (condition-based `IF/DO/ELSE/END`), composed sequentially | M |
| 3.5 | **Clear** the editor | M |
| 3.6 | **Finalize:** validate (parses + all services exist + arg counts match) → ask for an app name → add to Apps list and save to the working directory | M |
| 3.7 | Drag-and-drop of services onto the editor | S |
| 3.8 | Visual block/flow editor | C |
| 3.9 | **Looping** (extra credit in the guidelines, but we also need it to make STOP demonstrable — see §7) | S |

### Requirement 4 — IoT App Manager

| # | Feature | Pri |
|---|---|---|
| 4.1 | Apps tab landing: **New App** / **Upload App**; either opens the editor | M |
| 4.2 | **SAVE APP** visible/enabled **only inside the editor**; new app → ask path (default = working dir) + file name; re-save overwrites the same file silently; repeated saves allowed | M |
| 4.3 | Extension rule: always `.iot`; if the user typed `name.ext`, save as `name.ext.iot`; if they typed `name.iot`, don't double it | M |
| 4.4 | Fixed but **changeable "Atlas working directory"** (setting) | M |
| 4.5 | On IDE start: **scan the working directory** and list the apps found in the Apps tab | M |
| 4.6 | **UPLOAD:** double-click an app in the list → opens in editor (also allow importing a `.iot` from elsewhere) | M |
| 4.7 | **ACTIVATE:** load if not loaded, start execution lifecycle, add a row to the status panel | M |
| 4.8 | **Status panel** (bottom): app name, start time, status `Active / Stopped / Completed`; **cleared at IDE start and exit** | M |
| 4.9 | **STOP** (from status panel and Apps tab): stop the run, cancel pending calls/timers, clean up; status → stopped/inactive | M |
| 4.10 | Apps that finish on their own show **Completed** and **cannot** be stopped | M |
| 4.11 | **DELETE** only from Apps tab, with confirmation; removes the file from the working dir; blocked/disabled while the app is running | M |
| 4.12 | App name validation: short, no special characters (§10) | M |

---

## 6. Proposed architecture

### 6.1 Overview

```
 ┌──────────────────────┐  HTTP + WebSocket   ┌────────────────────────────┐
 │  Browser (UI)        │◄───────────────────►│  Node.js local server      │
 │  tabs, editor,       │  state, app events  │  - discovery + space model │
 │  status panel        │                     │  - app manager (files)     │
 └──────────────────────┘                     │  - runtime (parser+runner) │
                                              └───┬──────────────┬─────────┘
                                   MQTT :1883     │              │  TCP :6668
                          (Atlas multicast tweets)▼              ▼  (service calls)
                                 ┌───────────────────┐   ┌────────────────────┐
                                 │ Broker (Pi)       │   │ Atlas things (RPi) │
                                 └───────────────────┘   └────────────────────┘
                                              Atlas working directory: *.iot files
```

**Why a local Node.js backend with a web UI** (reusing our HTML/JS skills and code):

- can open the **TCP connections** Atlas needs and talk to MQTT on plain `:1883` (no WebSocket listener needed);
- can **scan/read/write/delete** files in the working directory;
- runs apps **independently of the browser tab**, so ACTIVATE / STOP / Completed are real lifecycles;
- the parser module is shared: the browser uses it for live validation, the server for execution.

*Alternatives considered:* pure browser (fails points 2–3 above), Electron (works, but heavier setup/packaging for 13 days). **[DECIDE]**

### 6.2 Transport layer (`ThingGateway`)

Define one small interface so the rest of the IDE doesn't care about the protocol:

```
discover()  -> emits tweets / model updates
call(thingId, service, args) -> { status, result, description }
```

Two implementations:

1. **AtlasGateway (primary).** Discovery via MQTT subscription to the Atlas multicast topics from the IoT-DDL (`/Atlas/Multicast/Tweet_ThingIdentity`, `.../Tweet_EntityIdentity`, `.../API`, `/Atlas/Unicast/Interaction`). Calls via TCP `:6668`, same JSON as `atlas_demo.cpp`:
   `{"Tweet Type":"Service call","Thing ID":…,"Space ID":…,"Service Name":…,"Service Inputs":"(75)"}` → reply fields `Status`, `Service Result`.
   Lessons already in `atlas_demo.cpp` to carry over: one TCP connection per call, read until close, ~15 s timeout, **~100 ms pause between calls**, so **serialize calls per thing**.
2. **Lab4MqttGateway + simulator (fallback/dev).** Wraps the existing `vss/boar/*` protocol so we can develop without the full middleware and keep a working demo path if Atlas misbehaves on the day.

> ⚠️ **We have not seen the exact JSON of the service / thing-language / relationship tweets, nor which topic carries them.** Task 0.2 below is to capture them (`mosquitto_sub -h <pi> -t '/Atlas/#' -v`) and write the field names into `docs/tweets.md` **before** writing the parser. Do not guess the structure.

### 6.3 Space model (shared contract between backend and UI)

Agree on this on day 1–2 so UI and backend can proceed in parallel (UI can start from a JSON fixture):

```jsonc
{
  "space": { "id": "BoarSmartSpace", "ideAddress": "192.168.8.50", "broker": "connected" },
  "things": [{ "id": "AT_BoarAirSensor", "name": "Smart Air Quality Sensor", "owner": "BoarGroup",
               "address": "192.168.8.189", "lastSeen": "…", "entities": ["ClimateSensor","Fan","Window"] }],
  "services": [{ "thing": "AT_BoarAirSensor", "entity": "Fan", "name": "Fan_On", "kind": "Action",
                 "inputs": [{ "name": "speed", "type": "int" }], "output": "int" }],
  "relationships": [{ "thing": "AT_BoarAirSensor", "name": "…", "type": "…", "from": "…", "to": "…" }]
}
```

### 6.4 Backend API (proposal)

| Endpoint | Purpose |
|---|---|
| `GET /api/state` + WebSocket `/events` | Space model and live pushes (model updates, run status, log lines) |
| `GET /api/apps` | List `.iot` files in the working dir (name, modified, finalized, running?) |
| `GET /api/apps/:name` · `PUT /api/apps/:name` · `DELETE /api/apps/:name` | Upload / Save / Delete |
| `POST /api/apps/:name/activate` · `POST /api/runs/:id/stop` | Run lifecycle |
| `GET/PUT /api/config` | Working directory setting |

### 6.5 `.iot` file format

JSON, with the program **source text as the canonical content** (the AST is rebuilt by the parser on load — simple, robust, diff-friendly):

```json
{
  "format": "atlas-iot-app",
  "version": 1,
  "name": "AirControl",
  "finalized": true,
  "created": "2026-11-20T10:00:00Z",
  "modified": "2026-11-20T10:30:00Z",
  "source": "IF AT_BoarAirSensor.Read_Temp(C) > 28\nDO AT_BoarAirSensor.Fan_On(75)\nEND"
}
```

### 6.6 Third-party open source (to document in the report)

Keep this list short and justified; verify each license before writing it down.

| Library | Use | Justification |
|---|---|---|
| `mqtt` (MQTT.js) | MQTT client in the Node backend | Same library family we used in Lab 4; MIT |
| `express` + `ws` (or similar) | HTTP + WebSocket between UI and backend | Minimal, standard |
| `nlohmann/json`, `mosquitto`, `wiringPi` | RPi service program (already in `main.cpp`) | Already used in Lab 4 |

Everything must be **vendored locally** (no CDN at runtime).

---

## 7. The composition language

Keep the Lab 4 grammar (already implemented and tested in `app.js`), with these changes:

- **Qualifier = Thing ID**, e.g. `AT_BoarAirSensor.Read_Temp(C)`. The unqualified form `Read_Temp(C)` stays valid **only if exactly one thing offers that service**; otherwise the editor reports an ambiguity. (Replaces the hard-coded `DEFAULT_RPI`.) **[DECIDE]** whether to also support short aliases like `RPi1`.
- The parser/validator checks every call against the **discovered catalogue** (service exists, argument count matches) — both live in the editor and at Finalize.
- **Loop (S):** add one minimal construct, e.g. `LOOP EVERY 5s … END` (optionally `TIMES n`). Reason: a purely sequential app finishes in seconds, so without a long-running app **STOP can never be demonstrated** and every app would end as *Completed*. Plan: finite apps → *Completed*; looping apps → *Active* until STOP.
- Unchanged: comparisons `> < >= <= == !=`, `AND`/`OR` (no parentheses; nest `IF` to group), nested `IF`, optional `ELSE`, `IF` closed by `END`, `//` comments, integer arguments, `C`/`F` aliases for `Read_Temp`.

---

## 8. Workstreams and tasks

Assign an owner to each workstream (names left blank — group size not fixed here). Each person should also review one other workstream's pull requests.

### WS0 — Foundation *(owner: ____)*
- [ ] 0.1 Create repo, branch policy, folder structure (§11), `.gitignore`, remove credentials
- [ ] 0.2 **Capture real Atlas tweets** (all types) with `mosquitto_sub`; document fields and topics in `docs/tweets.md`
- [ ] 0.3 Verify all RPis are wired and running; run `atlas_demo.cpp` against each (hardware smoke test)
- [ ] 0.4 Fix `main.cpp` compile error; reconcile servo/fan constants with real hardware (§4 #4–5)
- [ ] 0.5 Add order-based and condition-based relationships (and the other needed metadata) in the IoT-DDL builder; regenerate/redeploy
- [ ] 0.6 Write the §6.3 model contract + a `fixtures/space.json` example
- [ ] 0.7 Vendor all JS libraries; confirm IDE works with **no internet**

### WS1 — Discovery & space model (Req 1) *(owner: ____)*
- [ ] 1.1 Node server skeleton + `ThingGateway` interface
- [ ] 1.2 `AtlasGateway.discover()`: MQTT subscription + tweet parsers for each tweet type
- [ ] 1.3 Merge/dedupe into the space model; push updates via WebSocket
- [ ] 1.4 Startup "scan complete" detection (quiet period + timeout) → freeze/unfreeze event
- [ ] 1.5 `AtlasGateway.call()` over TCP with per-thing serialization and 100 ms spacing
- [ ] 1.6 `Lab4MqttGateway` + thing simulator (fallback/dev)

### WS2 — UI shell & discovery tabs (Req 2) *(owner: ____)*
- [ ] 2.1 Layout: header (space meta info), tab bar, bottom status-panel placeholder, startup freeze overlay
- [ ] 2.2 Things tab · Services tab (alphabetical, sensor/actuator grouping) · Relationships tab
- [ ] 2.3 Connection / device status indicators (carry over from Lab 4)
- [ ] 2.4 *(Could)* relationship graph, images/skins

### WS3 — Language & editor (Req 3) *(owner: ____)*
- [ ] 3.1 Extract parser + orchestrator from `app.js` into a shared module (`lang/`), no DOM dependencies
- [ ] 3.2 Catalogue-aware validation, Thing-ID qualifiers, ambiguity errors
- [ ] 3.3 Editor UI: text area with error display, service palette, relationship-guided snippets
- [ ] 3.4 Clear + Finalize dialog
- [ ] 3.5 Loop construct + unit tests
- [ ] 3.6 *(Should)* drag-and-drop from palette

### WS4 — App manager & runtime (Req 4) *(owner: ____)*
- [ ] 4.1 Working-dir config; scan at startup; `.iot` read/write; filename rules (§5 #4.3, #4.12)
- [ ] 4.2 Apps tab: list, New/Upload, double-click open, Delete with confirmation
- [ ] 4.3 Save / Save-as dialogs; Save available **only** in editor
- [ ] 4.4 Run manager: activate, run id, status (`Active/Stopped/Completed`), stop with cleanup (cancel timers, abort pending call, clear queues)
- [ ] 4.5 Status panel UI (start time, status, Stop button); clear on start/exit
- [ ] 4.6 Graceful shutdown (stop all runs, clean up)

### WS5 — QA, demo, report *(owner: ____)*
- [ ] 5.1 Test plan execution (§9) — owner of the "bug list"
- [ ] 5.2 Rebuild the Lab 4 Part II demo app in the new IDE and script the live demo
- [ ] 5.3 Collect **screenshots** as features land (IDE tabs, every dialog) — do not leave this to the last night
- [ ] 5.4 Report (≤5 pages, aim 3) and 2-minute PowerPoint
- [ ] 5.5 Rehearsals (at least 3 full runs, with timing)

---

## 9. Timeline (17 → 30 Nov)

| Dates | Phase | Outcome |
|---|---|---|
| **Tue 17 – Wed 18** | Phase 0 — Foundation | Repo ready, real tweets captured and documented, hardware OK, model contract agreed, decisions in §12 closed |
| **Thu 19 – Sat 21** | Phase 1 — Discovery + shell | Backend discovers things; Things/Services/Relationships tabs render live data; startup freeze works |
| **Fri 20 – Tue 24** | Phase 2 — Editor | Parser module extracted, catalogue validation, palette + relationship snippets, Clear/Finalize |
| **Mon 23 – Thu 26** | Phase 3 — App manager | Save/Upload/Activate/Stop/Delete, working-dir scan, status panel |
| **Fri 27** | **Feature freeze** | Everything merged; from now on bug fixes only. Tag `v0.9` |
| **Sat 28 – Sun 29** | Hardening + report | Full test pass on real hardware, report + slides done, rehearsals #1–#2, tag `v1.0-rc` |
| **Mon 30** | Submission + demo | Zip uploaded and link emailed **by 09:00** (hard deadline 11:00), rehearsal #3, demo from 16:30 |

Phases 1–3 overlap on purpose: the model contract (§6.3) lets the UI and backend streams work in parallel.

---

## 10. Test plan and demo

### Acceptance tests (run on the real RPis, on the lab network, **without internet**)

| Area | Check |
|---|---|
| Discovery | Start IDE → freeze overlay → all RPis/entities/services appear; restart a thing → model updates without duplicates |
| Tabs | Services alphabetical per thing; Relationships show both order-based and condition-based; Apps empty on a clean working dir |
| Editor | Each of Type 1 / 2 / 3 apps runs; nested `IF`, `ELSE`, `AND/OR` still behave as in Lab 4; syntax errors are readable; unknown service or wrong argument count is rejected |
| Save | `x` → `x.iot`; `x.ext` → `x.ext.iot`; `x.iot` → `x.iot`; second save overwrites silently; Save is unavailable outside the editor |
| Manager | Restart IDE → apps from working dir are listed; double-click opens; Activate → status row with start time; Stop → stopped; finite app → Completed and not stoppable; Delete removes the file; status panel empty after restart |
| Robustness | Thing offline mid-run → error logged, IDE not stuck; two apps running at once; browser reload during a run |

### Demo plan
1. **2-min slides:** problem → architecture (one diagram) → what is new vs Lab 4.
2. **Live demo (~5 min):** startup scan → tour of the four tabs → build the Lab 4 Part II app in the editor using palette + relationship guidance → Finalize/Save → Activate → show status panel → Stop a looping app → show a Completed app → Delete.
3. **Backup plan:** pre-saved `.iot` apps in the working dir, simulator/Lab 4 gateway ready, screen recording of a clean run.

---

## 11. Suggested repository layout

```
atlas-ide/
├─ README.md
├─ server/
│  ├─ index.js              # HTTP + WebSocket entry point
│  ├─ gateway/              # ThingGateway, AtlasGateway, Lab4MqttGateway, simulator
│  ├─ model/                # space model, tweet parsers
│  ├─ apps/                 # app manager (files, .iot format)
│  └─ runtime/              # run manager (activate / stop / status)
├─ lang/                    # parser + orchestrator (shared by server and browser)
├─ public/                  # index.html, app.js, style.css, vendor/
├─ things/                  # Atlas_IoTDDL.xml, main.cpp, atlas_demo.cpp
├─ apps/                    # default Atlas working directory (+ example .iot files)
├─ fixtures/                # space.json, recorded tweets
├─ docs/                    # tweets.md, report, screenshots, slides
└─ tests/
```

### Working agreements
- `main` is **always runnable**; work happens on short-lived branches, merged by pull request with one reviewer.
- Tag every milestone (`v0.5`, `v0.9`, `v1.0-rc`, `v1.0`) so we can always fall back to a working version.
- No half-finished features on `main` after the **Fri 27 Nov feature freeze**; anything that doesn't work is removed from the UI (we can still mention it in the report).
- No credentials or Wi-Fi passcodes in commits or screenshots.

---

## 12. Open decisions [DECIDE]

| # | Question | Default if we don't decide |
|---|---|---|
| 1 | Architecture: Node backend + web UI vs pure browser vs Electron | Node backend + web UI |
| 2 | Primary transport: real Atlas (MQTT tweets + TCP `:6668`) with Lab 4 MQTT as fallback | As stated |
| 3 | Qualifier in the language: Thing ID only, or also short aliases (`RPi1`) | Thing ID, unqualified allowed when unambiguous |
| 4 | Status labels: guidelines say "active/stopped" in ACTIVATE but "inactive" in STOP | Show `Active`, `Stopped` (= inactive), `Completed` |
| 5 | App name rule: Req 4 says "no special characters", Req 2 says `name.ext` → `name.ext.iot` | Validate base name `[A-Za-z0-9_-]`, max ~20 chars; if user types a dot-extension, follow Req 2 literally |
| 6 | Finalize vs Save: what exactly differs | Save = draft anytime; Finalize = validate + name + list in Apps tab (sets `"finalized": true`) |
| 7 | Loop syntax and semantics | `LOOP EVERY <n>s … END`, stoppable only via STOP |
| 8 | Where service/relationship/language tweets are published (same multicast topics or via the Multicast API?) | Answer by capturing traffic (task 0.2) |
| 9 | Should the final demo include more than one RPi (the guidelines imply several per group)? | Yes if hardware allows; the design supports it from day one |
