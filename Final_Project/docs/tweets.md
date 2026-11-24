# Atlas tweets — what the IDE listens to

Reference for `server/gateway-atlas.js` and `server/space.js` (plan step 1).

> ⚠️ **Not captured from a live space.** No Raspberry Pi, MQTT broker or Atlas
> middleware is reachable from the development machine (decision D1), so every shape
> below was **read out of the Lab 4 middleware source**, not observed on the wire:
> `Lab4/AtlasThingMiddleware_RPI/Architecture/Identity_Parser.cpp` (identity tweets),
> `Knowledge_Tweeting_Manager.cpp` (service and relationship tweets),
> `Communication_Manager.cpp` (transport), `API_Generator.cpp` (calls and replies).
> Line numbers are given so each claim can be rechecked.
>
> **Before the hardware pass (plan step 11), capture the real traffic:**
> ```bash
> mosquitto_sub -h <pi-ip> -t '/Atlas/#' -v      # MQTT transport (this thing)
> ```
> then correct this file and `PLAN.md` §5.2. `space.js` ignores unknown fields and
> unknown tweet types, so a mismatch degrades the Devices panel rather than
> crashing the IDE.

## Transport

The Lab 4 thing is configured for **MQTT** — `Atlas_IoTDDL.xml`
→ `Network_Manager/Communication_Protocol` = `MQTT`, broker `192.168.8.189:1883`.
Topics are the topic root followed by the per-kind suffix, both from the IoT-DDL:

| Topic | Carries |
|---|---|
| `/Atlas/Multicast/Tweet_ThingIdentity` | `Identity_Thing`, `Identity_Language` |
| `/Atlas/Multicast/Tweet_EntityIdentity` | `Identity_Entity` |
| `/Atlas/Multicast/API` | `Service`, `Relationship` |
| `/Atlas/Unicast/Interaction` | `Service call`, `Service call reply` |

The exact split of tweet types across the three multicast topics is the **least
certain** part of this document — subscribe to `/Atlas/#` and route on the
`Tweet Type` field rather than on the topic, which is what `gateway-atlas.js` does.

The middleware also has a UDP path (`Communication_Manager.cpp:82-84`: multicast
`232.1.1.1:1235` for tweets, unicast TCP `6668` for calls) used when the thing is not
attached to an MQTT broker. Service **calls** always go to **TCP 6668**
(`Identity_Parser.cpp:84-85` advertises exactly that port), which is what Lab 4's
`atlas_demo.cpp` does and what the IDE does too.

## Tweet shapes

All payloads are a single flat JSON object; keys contain spaces and are
space-padded around the colons in the middleware's hand-built JSON, so parse, never
pattern-match. Every tweet carries `Thing ID` and `Space ID`.

### `Identity_Thing` — `Identity_Parser.cpp:38-47`

```json
{ "Tweet Type": "Identity_Thing", "Thing ID": "AT_BoarAirSensor",
  "Space ID": "BoarSmartSpace", "Name": "Smart Air Quality Sensor",
  "Model": "", "Vendor": "", "Owner": "BoarGroup",
  "Description": "Air quality control system", "OS": "Raspbian" }
```

### `Identity_Language` — `Identity_Parser.cpp:86-94`

How to reach the thing. `Port` is hard-coded to `6668` in the middleware.

```json
{ "Tweet Type": "Identity_Language", "Thing ID": "AT_BoarAirSensor",
  "Space ID": "BoarSmartSpace", "Network Name": "GL-SFT1200",
  "Communication Language": "MQTT", "IP": "192.168.8.189", "Port": "6668" }
```

### `Identity_Entity` — `Identity_Parser.cpp:124-132`

One per entity. `ID` is the entity id used by the service tweets; `Name` is the
human label; `Type` is free text from the IoT-DDL and is **not** what tells sensors
from actuators (use the service `Type` for that — see below).

```json
{ "Tweet Type": "Identity_Entity", "Thing ID": "AT_BoarAirSensor",
  "Space ID": "BoarSmartSpace", "Name": "Temperature and Humidity Sensor DHT11",
  "ID": "ClimateSensor", "Type": "", "Owner": "BoarGroup",
  "Vendor": "", "Description": "" }
```

### `Service` — `Knowledge_Tweeting_Manager.cpp:181-191`

```json
{ "Tweet Type": "Service", "Name": "Read_Temp", "Thing ID": "AT_BoarAirSensor",
  "Entity ID": "ClimateSensor", "Space ID": "BoarSmartSpace", "Vendor": "",
  "API": "Read_Temp:[F_or_C,int, NULL]:(Temperature,int, NULL)",
  "Type": "Report", "AppCategory": "", "Description": "",
  "Keywords": "temperature,sensor,read" }
```

- **`Type`** is `Report` for a sensor-type service and `Action` for an actuator-type
  one. This is what the Devices panel groups on (decision D5), and R2's optional
  sensor/actuator split.
- **`API`** is built at `Knowledge_Tweeting_Manager.cpp:120-169` as
  `<name>:[<inputs>]:(<output>)` where each input is
  `<description>,<type>, NULL` — note the **space before `NULL`** — inputs are
  joined with `|`, and the output is `<outputDescription>,<outputType>, NULL`.
- The literal string **`NULL`** means "none", because the middleware initialises
  `API_Input`/`API_Output` to `"NULL"` and only overwrites them when there are
  inputs / the output is not `void`. So:

  | Service | `API` |
  |---|---|
  | one input, int output | `Read_Temp:[F_or_C,int, NULL]:(Temperature,int, NULL)` |
  | no input, int output | `Calibrate_Sensor:[NULL]:(Calibration,int, NULL)` |
  | no input, `void` output | `Fan_Off:[NULL]:(NULL)` |
  | two inputs | `S:[a,int, NULL|b,int, NULL]:(o,int, NULL)` |

  `lang`/`space.js` therefore treat a lone `NULL` field as empty, and the trailing
  `, NULL` of each triple (the unused input-range slot) is discarded.
- The IoT-DDL carries no input **ranges** (the middleware's range code is commented
  out), so the IDE keeps the Lab 4 ranges — `speed` 0–75, `angle` 0–50, `F_or_C`
  0/1 — as local metadata and reports an out-of-range argument as a *warning* only
  (`PLAN.md` §6.4 level 3).

### `Relationship` — `Knowledge_Tweeting_Manager.cpp:301-312`

```json
{ "Tweet Type": "Relationship", "Thing ID": "AT_BoarAirSensor",
  "Space ID": "BoarSmartSpace", "Name": "Fan On interference", "Owner": "",
  "Category": "Cooperative", "Type": "interfere",
  "Description": "Turning on and off the fan should be concurrent",
  "FS name": "Fan_On", "SS name": "Fan_Off" }
```

- `FS name` / `SS name` are the **first** and **second** service of the relationship,
  taken from the IoT-DDL's `Input1` / `Input2`.
- `Category` is hard-coded to `Cooperative` (`:296`), so it carries no information.
- `Type` is the free-text `type` tag of the IoT-DDL. Lab 4 only declares
  `interfere`; the IDE additionally understands **`order`** and **`condition`** —
  the two kinds the assignment requires — and shows anything else as an
  uninterpreted relationship. Relationships always link two services of the
  **same thing**.
- Relationships are also emitted a second way (`:378-393`) for *unbounded* services;
  the shape is identical.

## Service calls — `API_Generator.cpp:963-985`, and Lab 4 `atlas_demo.cpp`

One TCP connection to port **6668** per call, one JSON object out, read the reply
until the thing closes the connection.

```json
{ "Tweet Type": "Service call", "Thing ID": "AT_BoarAirSensor",
  "Space ID": "BoarSmartSpace", "Service Name": "Fan_On",
  "Service Inputs": "(60)" }
```

```json
{ "Tweet Type": "Service call reply", "Thing ID": "AT_BoarAirSensor",
  "Space ID": "BoarSmartSpace", "Service Name": "Fan_On",
  "Status": "Successful", "Service Result": "60" }
```

- `Service Inputs` is a **parenthesised, comma-separated list**, `"()"` when the
  service takes none. Values are sent as text.
- `Status` is `Successful` or `Unsuccessful`; a wrong thing or space id, an unknown
  service or a wrong argument count gives `Unsuccessful`.
- `Service Result` is `"No Output"` for a `void` service, otherwise the value as
  text — so the orchestrator parses it to a number before comparing (L11).
- Lab 4 Atlas paused after each call. The packaged Atlas accepts the next TCP
  call after closing the previous one. The IDE gateway serialises calls per
  thing with a 15 s socket timeout.
- Atlas has no error status for a service *body*, so a failed DHT11 read comes back
  as `-1` with `Status: Successful`. The IDE does not try to hide that.
