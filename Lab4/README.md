# Lab 4 — Building Microservices for your Smart Space

B8019 Programming the Internet of Things · Group **boar**

Our smart space is a climate-controlled room. A DHT11 reports temperature and humidity; a servo
opens and closes a window; a fan clears the air. Each sensor read and each actuator action is
published as a **service**, and the Edge composes those services into small applications using
the two relationships: **order-based** (`A THEN B`) and **condition-based**
(`IF A op X DO B`).

---

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

Part One and Part Two drive the **same GPIO pins** and never run at the same time. Part One
deliberately uses MQTT rather than a socket server so that TCP 6668 stays free for Atlas.

## Hardware

| Device | Entity | BCM | Header pin | Driven by |
|---|---|---|---|---|
| DHT11 data (temp + humidity) | `ClimateSensor` | 17 | 11 | bit-bang, in/out |
| Servo signal | `Window` | 18 | 12 | hardware PWM channel 0 |
| Motor base (2N2222) | `Fan` | 13 | 33 | hardware PWM channel 1 |

Both PWM channels share one clock and one range in wiringPi, so the servo's 50 Hz requirement
fixes the fan's frequency too.

The window is shut with the servo horn centred (1500 µs) and opens counter-clockwise to a
mechanical limit of **50°**, so `Set_Window` takes 0–50 and angle 0 is mid-travel rather than
an end stop.

Safety notes for the rig (propeller hazard, the two supply grounds) are in `photos/readme.txt`.

## Services

| Entity | Service | #in | Input names | Output |
|---|---|---|---|---|
| `ClimateSensor` | `Calibrate_Sensor` | 0 | – | int (1 ok) |
| `ClimateSensor` | `Read_Temp` | 1 | `F_or_C` (0=C, 1=F) | int degrees |
| `ClimateSensor` | `Read_Humidity` | 0 | – | int % |
| `Fan` | `Fan_On` | 1 | `speed` (0–75) | int applied speed |
| `Fan` | `Fan_Off` | 0 | – | void |
| `Fan` | `Read_Fan_Speed` | 0 | – | int speed (0–75) |
| `Fan` | `Read_Fan_Status` | 0 | – | int (1 on / 0 off) |
| `Window` | `Set_Window` | 1 | `angle` (0–50) | int applied angle |
| `Window` | `Window_Close` | 0 | – | void |
| `Window` | `Read_Window_Position` | 0 | – | int angle |

Every input is an integer and every output is `int` or `void`, because Atlas accepts nothing
else — so the Part One bodies drop into the Part Two IoT-DDL almost unchanged. The mini-IDE
additionally accepts `Read_Temp(C)` and `Read_Temp(F)`, but that is Edge-side sugar: the alias
is resolved to `0`/`1` before the call goes on the wire, since Atlas parses inputs with `stol`.

Neither actuator can be read back from hardware, so `Read_Fan_Speed`, `Read_Fan_Status` and
`Read_Window_Position` report the last commanded value from `/tmp/fan_speed` and
`/tmp/window_angle`. Sensor reads are retried up to 3 times, 1.1 s apart, because the DHT11
fails a single read often. Details in `PartOne/device/README.md`.

## Topic contract (Part One)

Prefix `vss/boar/`. All payloads are JSON.

| Topic | Direction | Payload | QoS | Retained |
|---|---|---|---|---|
| `services` | device → all | `{"thing":"RPi-1","services":[{"rpi":…,"entity":…,"name":…,"ninputs":…,"inputs":[…],"output":…}]}` | 1 | yes |
| `call` | edge → device | `{"id":7,"service":"Read_Temp","inputs":[0]}` | 1 | no |
| `reply` | device → all | `{"id":7,"service":"Read_Temp","status":"Successful","description":"…","result":24}` | 1 | no |
| `status` | device → all | `{"status":"online"}` / `{"status":"offline"}` (LWT) | 1 | yes |

`services` is retained so a dashboard opened at any moment immediately receives the service
vectors.

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
// a single call: RUN on its own, no THEN needed
RUN  RPi1.Service_A(args)

// order-based: B runs only after A succeeds. THEN may chain.
RUN  RPi1.Service_A(args)
THEN RPi1.Service_B(args)

// condition-based. Every IF is closed by END. ELSE is optional.
// A branch may hold several commands, and IFs may nest.
IF   RPi1.Service_A() > 28 AND RPi1.Service_B() > 60
DO   RPi1.Service_C(75)
     RPi1.Service_D(40)
     IF   RPi1.Service_E() == 1
     DO   RPi1.Service_F()
     END
ELSE RPi1.Service_G()
END
```

Comparisons: > < >= <= == !=
Combine them with AND and OR. AND binds tighter than OR; there are no
grouping parentheses, so nest an IF when you need to group.
A condition stops as soon as its outcome is known, so later predicates
may never be called.

Commands in a branch need no RUN. Arguments are integers, and Read_Temp
also accepts C and F for 0 and 1.
Blank lines and indentation are ignored. // starts a comment.

# Part Two

To compile the DemoIoT applicaztion:
```
g++ -std=c++17 -O2 atlas_demo.cpp -o atlas_demo.exe -lws2_32
```

## File structure

```
Lab4/
├── README.md
├── PartOne/
│   ├── README.md # missing
│   ├── device/
│   │   ├── main.cpp           # 10 services + MQTT service server
│   │   ├── CMakeLists.txt
│   │   └── README.md          # pin map, services, build, run
│   └── edge/
│       ├── index.html
│       ├── app.js             # catalogue, parser, orchestrator
│       ├── parser.test.js     # node parser.test.js — no broker needed
│       └── style.css
└── PartTwo/
    ├── README.md # missing
    ├── Atlas_IoTDDL.xml
    └── demo_app/
        └── atlas_demo.cpp
```

# Distribution of effort