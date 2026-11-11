# Lab 4: Building Microservices for your Smart Space

B8019 Programming the Internet of Things · Group **Boar**

Our smart space is a climate-controlled room. A DHT11 reports temperature and humidity, a servo
opens and closes a window, and a fan clears the air. Every sensor read and every actuator action
is exposed as a **service**, and applications are composed from those services with the two
relationships: **order-based** (`A THEN B`) and **condition-based** (`IF A op X DO B`).

## Quick overview

- **Part One:** Our own C++ service program on the Pi + an Edge dashboard with a mini-IDE, over MQTT ([`PartOne/README.md`](PartOne/README.md))
- **Part Two:** The same thing, described in IoT-DDL and run by the Atlas middleware, plus a demo application ([`PartTwo/README.md`](PartTwo/README.md))

## Architecture

```
        ┌──────────────────┐                              ┌──────────────────┐
        │ PartOne/device/  │   MQTT (TCP 1883)            │                  │
        │ main.cpp         │◄────────────────────────────►│  Mosquitto       │
        │ 10 services      │                              │  broker (on Pi)  │
        │ DHT11/servo/fan  │                              │                  │
        └──────────────────┘                              │  WebSockets      │
                                   PartOne/edge/  ◄───────┤  (port 9001)     │
                                   (browser, MQTT.js)     └──────────────────┘

        ┌──────────────────┐   TCP 6668, JSON service calls
        │ Atlas middleware │◄──────────────────────────────  PartTwo/demo_app/
        │ (Pi, Part Two)   │   UDP 232.1.1.1:1235 tweets ──►  the smart space
        └──────────────────┘
```

Part One and Part Two drive the **same GPIO pins**, so only one of them runs at a time.

## Hardware

| Device | Entity | BCM pin | Header pin | Driven by |
| --- | --- | --- | --- | --- |
| DHT11 data (temperature + humidity) | `ClimateSensor` | 17 | 11 | bit-banged, in/out |
| Servo signal | `Window` | 18 | 12 | hardware PWM channel 0 |
| Motor base, through a 2N2222 | `Fan` | 13 | 33 | hardware PWM channel 1 |

- Both PWM channels share one clock and one range, so the servo's 50 Hz also sets the fan's
  frequency (clock 192, range 2000).
- The window is closed with the servo horn centred (1500 µs) and opens to a mechanical limit of
  **50°**. The fan is capped at **75 %** duty.

Servo calibration and the PWM details are in [`PartOne/device/README.md`](PartOne/device/README.md).

## Services

| Entity | Service | #in | Input names | Output |
| --- | --- | --- | --- | --- |
| `ClimateSensor` | `Calibrate_Sensor` | 0 | – | int (1 ok) |
| `ClimateSensor` | `Read_Temp` | 1 | `F_or_C` (0 = C, 1 = F) | int degrees |
| `ClimateSensor` | `Read_Humidity` | 0 | – | int % |
| `Fan` | `Fan_On` | 1 | `speed` (0–75) | int applied speed |
| `Fan` | `Fan_Off` | 0 | – | void |
| `Fan` | `Read_Fan_Speed` | 0 | – | int speed (0–75) |
| `Fan` | `Read_Fan_Status` | 0 | – | int (1 on / 0 off) |
| `Window` | `Set_Window` | 1 | `angle` (0–50) | int applied angle |
| `Window` | `Window_Close` | 0 | – | void |
| `Window` | `Read_Window_Position` | 0 | – | int angle |

- Inputs are integers and outputs are `int` or `void`, this keeps the Part One code reusable in the Part Two IoT-DDL.
- Out-of-range inputs are transformed to the nearest allowed value, not rejected; the result is the value actually applied.
- Neither actuator can be read back from hardware, so the three `Read_Fan_*` / `Read_Window_*`
  services report the **last commanded value**, stored in `/tmp/fan_speed` and
  `/tmp/window_angle` (0 if nothing was set since boot).
- DHT11 reads are retried up to 3 times, 1.1 s apart, because a single read fails often.

## File structure

```

Lab4/
├── README.md                  # this file
├── PartOne/
│   ├── README.md              # MQTT topics, running Part One, mini-IDE grammar
│   ├── device/
│   │   ├── main.cpp           # 10 services + MQTT service server (C++)
│   │   ├── CMakeLists.txt
│   │   └── README.md          # pins, servo calibration, dependencies, build, run
│   └── edge/
│       ├── index.html         # dashboard + mini-IDE
│       ├── app.js             # service catalogue, parser, orchestrator
│       ├── parser.test.js     # parser/orchestrator tests (Node, no broker)
│       └── style.css
└── PartTwo/
    ├── README.md              # Atlas deployment, IoT-DDL notes, demo application
    ├── Atlas_IoTDDL.xml       # the thing: 3 entities, 10 services
    └── demoApp/
        └── atlas_demo.cpp     # Demo IoT Application (Windows, C++)
```

## Distribution of effort

| Member | Work |
| --- | --- |
| Alessandro Querzé | Hardware wiring and testing, IDE, Part Two demo IoT application, Atlas deployment and testing on the Pi |
| Andrei Radu | IDE, IoT-DDL and Atlas middleware setup, Part One device services, code documentation, reports/READMEs |
| Enrico Giannini | Edge dashboard and IDE, Part One device services, servo calibration, IoT-DDL debugging, reports/READMEs |
| Mirko Tonelli | Service design for the sensor and actuators, IDE, Edge orchestrator testing, code documentation, reports/READMEs |

All members took part in design discussions, testing on the hardware and debugging across both parts.
