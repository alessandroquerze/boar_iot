# Lab 4 — Building Microservices for your Smart Space

B8019 Programming the Internet of Things · Group **boar** · due **12:00 noon, 11 November 2026**

Our smart space is a climate-controlled room. A DHT11 reports temperature and humidity; a servo
opens and closes a window; a fan clears the air. Each sensor read and each actuator action is
published as a **service**, and the Edge composes those services into small applications using
the two relationships the lab asks for — **order-based** (`A THEN B`) and **condition-based**
(`IF A op X DO B`).

> **Single Raspberry Pi.** Where the handout says "RPi-1 (sensors)" and "RPi-2 (actuators)", we
> use one Pi hosting both. The handout allows this explicitly. Every service vector still carries
> an RPi identifier and the IDE still uses the `RPiX.Service()` prefix, so the design scales to
> more Pis unchanged.

---

## Progress

Legend: **done** = built and verified · **written** = code complete, not yet run on hardware ·
**todo** = not started.

| Stage | What | Status |
|---|---|---|
| 0 | Repo restructured to `PartOne/` + `PartTwo/` | **done** |
| 1 | Fan rewired to GPIO13, 50 Hz hardware PWM validated | **written** — needs the rewire + `test/pwm13.c` run |
| 2 | `PartOne/device/main.cpp` — 8 services + MQTT server | **written** — compiles clean, dispatch verified against stubbed GPIO |
| 3 | `PartOne/edge/` — catalogue, mini-IDE, orchestrator | **written** — parser verified, not yet run against a live broker |
| 4 | `PartOne/README` — distribution of effort | **todo** — needs everyone's full names |
| 5 | `PartTwo/Atlas_IoTDDL.xml` | **todo** |
| 6 | `PartTwo/demo_app/` | **todo** |
| 7 | Zip as `Lab4_<FullNames>.zip` and submit | **todo** |

**Blocking:** stages 2 and 3 are written but unverified on real hardware, because stage 1's
rewire and gate test have not been run yet.

---

## Requirements checklist

Tracks the assignment handout. Updated as each stage lands.

### Part One — connecting services into an IoT application

| # | Requirement | Status |
|---|---|---|
| 1.1 | Pick a feasible scenario using at least one sensor and one actuator | **done** — climate control: DHT11 + servo window + fan |
| 1.2 | Wire all sensors and actuators to the Pi, write the C/C++ for each | **written** — `test/motdhtservo.c` proven; fan move to GPIO13 untested |
| 1.3 | Test that sensors read and actuators drive | **todo** — stage 1 gate |
| 1.4 | RPi connects to the Edge and reports its services | **written** — retained `vss/boar/services` |
| 1.5 | Each service reported as `(RPi id, name, #inputs, input names)` | **written** — verified in the stub harness |
| 1.6 | Edge displays the services on a web dashboard | **written** — catalogue table in `PartOne/edge/` |
| 1.7 | A trivial programming environment (mini-IDE) | **written** — text-based, RUN/THEN and IF/DO/ELSE |
| 1.8 | Mini-IDE supports order-based composition | **written** — `RUN … THEN …`, chainable |
| 1.9 | Mini-IDE supports condition-based composition | **written** — `IF … op … DO … ELSE …` |
| 1.10 | Edge translates the app into service API calls | **written** — one MQTT call per service, correlated by id |
| 1.11 | Edge controls call order and evaluates conditions | **written** — all orchestration in `app.js`, never on the Pi |
| 1.12 | Edge collects and displays the results | **written** — timestamped output log |
| 1.13 | RPi code is C/C++ only, one `main()` with services as functions | **done** — `PartOne/device/main.cpp` |
| 1.14 | `PartOne/README` with distribution of effort + single-RPi note | **todo** |

### Part Two — describe and build the thing with Atlas

| # | Requirement | Status |
|---|---|---|
| 2.1 | Write the IoT-DDL: one thing, one entity per bit-thing | **todo** |
| 2.2 | Service inputs are ints, at most 2; outputs `void` or `int` | **done** by design — the Part One catalogue already obeys this |
| 2.3 | Service names have no spaces or special characters | **done** — `Read_Temp`, `Fan_On`, … |
| 2.4 | `wiringPi.h` declared for every GPIO service | **todo** |
| 2.5 | Deploy Atlas V3.0 on the Pi, build and run | **todo** |
| 2.6 | IoT-DDL placed at `ConfigurationFiles/Atlas_IoTDDL.xml` | **todo** |
| 2.7 | Thing ID / Space ID match between the XML and the demo app | **todo** |
| 2.8 | Demo IoT Application unicasting API calls to port 6668 | **todo** |
| 2.9 | Demo app is well commented and explains each demonstration | **todo** |

### Submission

| # | Requirement | Status |
|---|---|---|
| 3.1 | `Lab4_<FullNames>.zip` with `PartOne/` + `PartTwo/` | **todo** |
| 3.2 | Comments throughout (they are graded) | ongoing |
| 3.3 | One member emails Prof. Helal **and** lijunjie@ufl.edu before the deadline, listing every full name | **todo** |
| 3.4 | Everyone available for the live TA demo | **todo** |

---

## Architecture

```
        ┌──────────────────┐                              ┌──────────────────┐
        │ PartOne/device/  │   MQTT (TCP 1883)            │                  │
        │ (Pi, C++)        │◄────────────────────────────►│  Mosquitto       │
        │ 8 services       │                              │  broker (on Pi)  │
        │ DHT11/servo/fan  │                              │                  │
        └──────────────────┘                              │  WebSockets      │
                                   PartOne/edge/  ◄───────┤  (port 9001)     │
                                   (browser, MQTT.js)     └──────────────────┘

        ┌──────────────────┐   TCP 6668, JSON service calls
        │ Atlas middleware │◄──────────────────────────────  PartTwo/demo_app/
        │ (Pi, Part Two)   │   UDP 232.1.1.1:1235 tweets ──►  the smart space
        └──────────────────┘
```

Part One and Part Two drive the **same GPIO pins** and never run at the same time. Part One
deliberately uses MQTT rather than a socket server so that TCP 6668 stays free for Atlas.

## Hardware

| Device | Entity | BCM | Header pin | Driven by |
|---|---|---|---|---|
| DHT11 data (temp + humidity) | `ClimateSensor` | 17 | 11 | bit-bang, in/out |
| Servo signal | `Window` | 18 | 12 | hardware PWM channel 0 |
| Motor base (2N2222) | `Fan` | 13 | 33 | hardware PWM channel 1 |

Both PWM channels share one clock and one range in wiringPi, so the servo's 50 Hz requirement
fixes the fan's frequency too. See `PartOne/device/README.md` for what that costs.

Safety notes for the rig (propeller hazard, the two supply grounds) are in `photos/readme.txt`.

## Services

| Entity | Service | #in | Input names | Output |
|---|---|---|---|---|
| `ClimateSensor` | `Calibrate_Sensor` | 0 | – | int (1 ok) |
| `ClimateSensor` | `Read_Temp` | 1 | `F_or_C` (0=C, 1=F) | int degrees |
| `ClimateSensor` | `Read_Humidity` | 0 | – | int % |
| `Fan` | `Fan_On` | 1 | `speed` (0–75) | int applied speed |
| `Fan` | `Fan_Off` | 0 | – | void |
| `Window` | `Set_Window` | 1 | `angle` (0–180) | int applied angle |
| `Window` | `Window_Close` | 0 | – | void |
| `Window` | `Read_Window_Position` | 0 | – | int angle |

Every input is an integer and every output is `int` or `void`, because Atlas accepts nothing
else — so the Part One bodies drop into the Part Two IoT-DDL almost unchanged.

## Topic contract (Part One)

Prefix `vss/boar/`. All payloads are JSON.

| Topic | Direction | Payload | QoS | Retained |
|---|---|---|---|---|
| `services` | device → all | `{"thing":"RPi-1","services":[{"rpi":…,"entity":…,"name":…,"ninputs":…,"inputs":[…],"output":…}]}` | 1 | yes |
| `call` | edge → device | `{"id":7,"service":"Read_Temp","inputs":[0]}` | 1 | no |
| `reply` | device → all | `{"id":7,"service":"Read_Temp","status":"Successful","description":"…","result":24}` | 1 | no |
| `status` | device → all | `{"status":"online"}` / `{"status":"offline"}` (LWT) | 1 | yes |

`services` is retained so a dashboard opened at any moment immediately receives the service
vectors. `status` and `description` reuse Atlas's own vocabulary, so the Edge orchestrator and
the Part Two demo application apply identical relationship logic.

## Running Part One

Broker setup is unchanged from Lab 3 (`../Lab3/README.md`): Mosquitto on the Pi with a plain
listener on 1883 and a WebSockets listener on 9001.

```bash
# on the Pi
cd PartOne/device && mkdir -p build && cd build
cmake .. && make
sudo ./main                      # defaults to localhost:1883
```

Then open `PartOne/edge/index.html` in a browser, enter the Pi's IP, and click Connect. The
catalogue fills from the retained message; press **Load examples** in the IDE and **Run program**.

## Mini-IDE grammar

```
// order-based: B runs only after A succeeds. THEN may chain.
RUN  RPi1.Calibrate_Sensor()
THEN RPi1.Read_Temp(0)

// condition-based: B runs on A's returned value. ELSE is optional.
IF   RPi1.Read_Temp(0) > 28
DO   RPi1.Fan_On(75)
ELSE RPi1.Fan_Off()
```

Operators `> < >= <= == !=`. Arguments are integers. A blank line separates statements, `//`
starts a comment, and the `RPiX.` prefix is optional with one Pi but kept in the grammar.

## File structure

```
Lab4/
├── README.md                  # this file
├── LAB4_CONTEXT.md            # assignment notes, not shipped
├── PartOne/
│   ├── README                 # distribution of effort            (todo)
│   ├── device/
│   │   ├── main.cpp           # 8 services + MQTT service server
│   │   ├── CMakeLists.txt
│   │   └── README.md          # pin map, services, build, run
│   └── edge/
│       ├── index.html
│       ├── app.js             # catalogue, parser, orchestrator
│       └── style.css
├── PartTwo/
│   ├── Atlas_IoTDDL.xml       #                                   (todo)
│   └── demo_app/              #                                   (todo)
├── test/
│   ├── motor.c                # bare motor on/off
│   ├── motdhtservo.c          # DHT11 + servo + motor, pre-rewire
│   └── pwm13.c                # stage 1 gate: fan on GPIO13
└── photos/                    # circuit photos + safety notes
```
