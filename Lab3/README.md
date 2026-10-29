# Lab 3 – MQTT Metronome

Demo video: <link>

Port of the Lab 2 Metronome Thing from REST to MQTT. Same device behaviour (LEDs, speaker,
tap-to-tempo, min/max tracking), driven over a Mosquitto broker instead of HTTP.

## Topic prefix

Our group (**boar**) publishes and subscribes everything under **`metronome/boar/`**. Every
topic in this document and in [`topic_list.md`](topic_list.md) is relative to that prefix.

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

## Install dependencies

**Broker** (on the Pi):

```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients python3-pip
```

**Python** (monitor/controller, any machine):

```bash
python3 -m pip install --break-system-packages paho-mqtt
```

**Device build deps** (on the Pi):

```bash
sudo apt install -y libmosquitto-dev nlohmann-json3-dev wiringpi
```

**Dashboard**: no install — just a browser. It loads MQTT.js straight from unpkg
(`https://unpkg.com/mqtt/dist/mqtt.min.js`), no build step or local `node_modules`.

## Start the broker

Add a listener config at `/etc/mosquitto/conf.d/lab3.conf`:

```conf
# /etc/mosquitto/conf.d/lab3.conf
listener 1883
allow_anonymous true

listener 9001
protocol websockets
```

Enable and start the service, then check it's healthy:

```bash
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
sudo systemctl status mosquitto
```

Verify both listeners are up:

```bash
ss -tlnp | grep mosquitto
# expect two LISTEN lines: one on :1883, one on :9001
```

Quick round-trip test:

```bash
mosquitto_sub -h localhost -t 'metronome/boar/#' -v &
mosquitto_pub -h localhost -t 'metronome/boar/test' -m 'hello'
# the sub should print: metronome/boar/test hello
```

## Run the device client

On the Pi:

```bash
cd device
mkdir -p build && cd build
cmake ..
make
./main [broker_host] [broker_port]   # defaults: localhost 1883
```

Full details (GPIO pin table, expected startup log, how to stop it) are in
[`device/README.md`](device/README.md).

## Run the remote side

**Monitor** (read-only, any machine with network access to the Pi):

```bash
python3 remote/monitor.py --host 192.168.8.189
```

**Controller** — interactive only:

```bash
python3 remote/controller.py --host 192.168.8.189
Metronome controller - interactive mode.
Commands: bpm <n> | mode play|learn | reset min|max | quit
> bpm 120
Sent set_bpm: 120
> mode learn
Sent set_mode: learn
> reset min
Sent reset_min
> quit
```

**Dashboard**: open `remote/dashboard/index.html` in a browser (no build step). Enter the Pi's
IP in the "Device address" field and click Connect — it talks to `ws://<ip>:9001`.

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
| `status` | device → all | `{"status": "online"}` / `{"status": "offline"}` | 1 | yes |

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
- **Single code path for mode/bpm/min/max changes.** Buttons (polled in the main loop) call
  `set_bpm`, `enter_learn`, `enter_play`, `reset_min`, `reset_max` directly. `on_message`
  (running on the libmosquitto thread) validates the incoming JSON and then calls those exact
  same functions — it never touches GPIO or `state/*` publishing on its own path.
- **Threading model.** Three threads run concurrently: the main loop (button polling), the play
  thread (beat timing/LED/speaker), and libmosquitto's own network thread (connect/message/
  publish callbacks). MQTT callbacks never block or
  sleep — they validate, write a few variables, and publish, then return immediately.

## Changes from Lab 2

- **BPM average fix.** The logic used to compute the mean bpm value was fixed, now the three intervals are indeed divided by 3
- **"Go to min" / "Go to max" buttons.** New in the dashboard: one click re-sends the tracked
  min/max as the current BPM, instead of having to retype the number.

## File structure

```
Lab3/
├── README.md
├── topic_list.md
├── device/
│   ├── README.md
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
