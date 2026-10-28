# Lab 3 – MQTT Metronome

Port of the Lab 2 Metronome Thing from REST to MQTT. Same device behaviour (LEDs, speaker,
tap-to-tempo, min/max tracking), driven over a Mosquitto broker instead of HTTP.

## Architecture

```
        ┌──────────────┐        MQTT (TCP 1883)               ┌──────────────────┐
        │  device/     │◄────────────────────────────────────►│                  │
        │  (Pi, C++)   │                                      │                  │
        │  GPIO + LEDs │    MQTT (TCP 1883)                   │  Mosquitto       │
        │  + speaker   |◄────────────┐                        │  broker (on Pi)  │
        └──────────────┘             │                        │                  │
                                     │ remote/monitor.py      │                  │
                                     │ remote/controller.py   |                  │
                                     │                        │                  │
                                     └────────────────────────┤                  │
                                                              │  WebSockets      │
                                         remote/dashboard/ ◄──┤  (port 9001)     │
                                         (browser, MQTT.js)   └──────────────────┘
```

- **device/** – runs on the Raspberry Pi, drives the GPIO (LEDs, speaker, buttons) and talks to
  the broker over plain MQTT (TCP 1883) using libmosquitto.
- **Mosquitto broker** – runs on the Pi, relays everything under `metronome/boar/`. Exposes a
  plain MQTT listener (1883, for the device and Python clients) and a WebSockets listener
  (9001, for the browser dashboard).
- **remote/monitor.py**, **remote/controller.py** – Python CLIs, talk MQTT over TCP 1883.
- **remote/dashboard/** – static web page, talks MQTT over WebSockets (port 9001) via MQTT.js.

## Mosquitto setup (on the Pi)

Install:

```bash
sudo apt update
sudo apt install mosquitto mosquitto-clients
```

Add a listener config at `/etc/mosquitto/conf.d/lab3.conf`:

```conf
# /etc/mosquitto/conf.d/lab3.conf
listener 1883
protocol mqtt

listener 9001
protocol websockets

allow_anonymous true
```

Restart and verify:

```bash
sudo systemctl restart mosquitto
ss -tlnp | grep mosquitto
# expect two LISTEN lines: one on :1883, one on :9001
```

## Build & run

### Device (on the Pi)

```bash
sudo apt install libmosquitto-dev nlohmann-json3-dev wiringpi
cd device
mkdir -p build && cd build
cmake ..
make
./main [broker_host] [broker_port]   # defaults: localhost 1883
```

### Monitor / Controller (any machine with network access to the Pi)

```bash
pip install paho-mqtt
python3 remote/monitor.py --host 192.168.8.189
python3 remote/controller.py --host 192.168.8.189 bpm 120
python3 remote/controller.py --host 192.168.8.189 mode learn
python3 remote/controller.py --host 192.168.8.189 reset min
python3 remote/controller.py --host 192.168.8.189   # interactive mode
```

### Dashboard

Open `remote/dashboard/index.html` in a browser (no build step). Enter the Pi's IP in the
"Device address" field and click Connect — it talks to `ws://<ip>:9001`.

## Topic contract

Prefix: `metronome/boar/`. All payloads are JSON.

| Topic | Direction | Payload | QoS | Retained |
|---|---|---|---|---|
| `cmd/set_bpm` | remote → device | `{"bpm": 120}` | 1 | no |
| `cmd/set_mode` | remote → device | `{"mode": "play"}` / `{"mode": "learn"}` | 1 | no |
| `cmd/reset_min` | remote → device | `{"reset": true}` | 1 | no |
| `cmd/reset_max` | remote → device | `{"reset": true}` | 1 | no |
| `state/bpm` | device → all | `{"bpm": 120}` | 1 | yes |
| `state/mode` | device → all | `{"mode": "play"}` | 1 | yes |
| `state/min` | device → all | `{"min": 60}` | 1 | yes |
| `state/max` | device → all | `{"max": 140}` | 1 | yes |
| `event/beat` | device → all | `{"bpm": 120, "seq": 42}` | 0 | no |
| `event/tap` | device → all | `{"count": 3}` | 0 | no |
| `status` | device → all | `{"status": "online"}` / `{"status": "offline"}` | 1 | yes (LWT = offline) |

## Design choices

- **Commands are never retained.** A retained command would replay on every device reconnect
  (e.g. a stale `set_bpm` firing again hours later just because the device came back online).
- **State is always retained.** A client that connects late (dashboard opened after the device
  has been running for a while) must see the current BPM/mode/min/max immediately, without
  waiting for the next change.
- **`event/beat` and `event/tap` use QoS 0.** These are high-rate, ephemeral ticks: losing one
  is harmless because the next beat/tap supersedes it immediately, and the cost of QoS 1's
  ack/retry bookkeeping isn't worth it for a value nobody needs to see twice.
- **LWT (`status` = offline, QoS 1, retained)** is set before `mosquitto_connect`, so a crash or
  network loss makes the broker publish `offline` on the device's behalf. On every (re)connect
  the device also explicitly publishes `online` plus all four `state/*` topics, so reconnects
  self-heal without manual intervention.
- **Single code path for mode/bpm/min/max changes.** The button-polling loop and the MQTT
  `on_message` handler both call the same functions (`set_bpm`, `enter_learn`, `enter_play`,
  `reset_min`, `reset_max`). Each one publishes its `state/*` topic, so a local button press and
  a remote command always leave the device in the same, visible state.

## File structure

```
Lab3/
├── README.md
├── device/
│   ├── main.cpp
│   └── CMakeLists.txt
└── remote/
    ├── monitor.py
    ├── controller.py
    └── dashboard/
        ├── index.html
        ├── app.js
        └── style.css
```
