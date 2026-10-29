# Lab 3 – The Metronome Thing, over MQTT – 2026

**Group name:** Boar
**Thing name:** The Metronome Thing
**Demo video:** <link>

## 1. Group, members, setup

| Alessandro Querzé | Andrei Radu | Enrico Giannini | Mirko Tonelli |
|---|---|---|---|

**Hardware:** Raspberry Pi 4B, two push buttons (mode, tap), one green LED, one red LED,
one speaker — unchanged from Lab 2.

**Software:**
- Device: C++17, [libmosquitto](https://mosquitto.org/), [nlohmann/json](https://github.com/nlohmann/json), WiringPi.
- Broker: Eclipse Mosquitto, running on the Pi, with two listeners: plain MQTT on TCP 1883
  and MQTT-over-WebSockets on 9001.
- Remote CLIs (`monitor.py`, `controller.py`): Python 3, `paho-mqtt`.
- Dashboard: static HTML/CSS/JS, no build step, [MQTT.js](https://github.com/mqttjs/MQTT.js) loaded from unpkg, connects to
  the broker's WebSocket listener directly from the browser.

## 2. Design overview

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

Three roles, cleanly separated:

- **Device** — the only thing that knows about GPIO. It owns the metronome's state (BPM,
  mode, min/max) and is the only client allowed to publish `state/*`. It never talks to
  remote clients directly.
- **Broker** — the only thing every client talks to. It relays messages, retains the latest
  `state/*` and `status` for late joiners, and detects the device going offline (LWT). It
  has no application logic of its own.
- **Remote clients** (monitor, controller, dashboard) — each one only knows the broker's
  address and the `metronome/boar/` topic prefix. None of them know about each other or
  about the device's address; all three can run anywhere with network access to the broker.

This is the main structural change from Lab 2: the device went from being a server that
remote clients had to reach directly, to being just another client of a broker that nobody
has a direct connection to but the broker itself.

## 3. Topic hierarchy

```
metronome/boar/
├── cmd/
│   ├── set_bpm
│   ├── set_mode
│   ├── reset_min
│   └── reset_max
├── state/
│   ├── bpm
│   ├── mode
│   ├── min
│   └── max
├── event/
│   ├── beat
│   └── tap
└── status
```

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

**Why we split it this way.** We treated the topic tree the way we treated REST endpoint
paths in Lab 2 — as our API. Each top-level segment is a distinct kind of message, not just
a naming convention:

- `cmd/` — an *intent* a remote client is asking the device to act on. Never retained: a
  command is an instruction for right now, not a fact worth replaying later.
- `state/` — the *current truth* about the device, always retained, always written by the
  device only.
- `event/` — something that *happened once*, high-rate and ephemeral (a beat, a tap).
- `status` — whether the device is reachable at all, independent of what it's doing.

A client can subscribe to exactly the category it cares about (`state/#` for a dashboard
that only shows current values, `cmd/#` on the device to receive instructions) and know what
kind of message it got from the topic alone, without inspecting the payload first.

## 4. Retained messages, QoS, and LWT

**Retained:** every `state/*` topic and `status`, never `cmd/*`.
- State is retained so a client that connects late (e.g. the dashboard opened after the
  device has been running for a while) sees the current BPM/mode/min/max immediately,
  without waiting for the next change.
- Commands are never retained — a retained `set_bpm` would replay on every device reconnect
  (e.g. a stale command firing again hours later just because the device came back online).

**QoS:**
- QoS 1 for `cmd/*`, `state/*`, and `status` — these each represent a single meaningful fact
  or instruction; losing one silently would leave a client with stale state.
- QoS 0 for `event/beat` and `event/tap` — high-rate, ephemeral ticks. Losing one is
  harmless because the next beat/tap supersedes it immediately, and QoS 1's ack/retry
  bookkeeping isn't worth it for a value nobody needs to see twice.

**LWT:** the device sets its will (`status` = `offline`, QoS 1, retained) *before* calling
`mosquitto_connect`, so an ungraceful disconnect (crash, network loss, power pull) makes the
broker publish `offline` on the device's behalf — no cooperation from the device required.
On every successful (re)connect, the device explicitly publishes `status` = `online` plus
all four `state/*` topics, so a reconnect self-heals without manual intervention. On a clean
shutdown (`Ctrl-C`), the device publishes `offline` itself and waits for the PUBACK before
disconnecting, so the "going offline" message is never left to the LWT when the shutdown was
intentional.

**Observed in testing:**
- [TODO: note what `mosquitto_sub -t 'metronome/boar/#' -v` showed when subscribing after
  the device had already been running for a while — confirm the retained flag and that
  `state/*`/`status` arrived without any new device activity]
- [TODO: note what happened when the device process was killed with `kill -9` — time until
  `status` flipped to `offline` in `monitor.py`, whether it matched the keepalive setting]
- [TODO: note the difference observed between a clean `Ctrl-C` shutdown and a `kill -9`, if
  any, in how quickly `status` went offline]

## 5. Device integration

The Lab 2 metronome logic is unchanged in substance: play mode pulses the green LED and
speaker at the current BPM, learn mode records taps on the red LED's button and computes BPM
from the average tap interval, and the device tracks the lowest and highest non-zero BPM seen.
What changed is how the device is told to do things.

**Single code path for local and remote changes.** Buttons, polled in the main loop, call
`set_bpm`, `enter_learn`, `enter_play`, `reset_min`, `reset_max` directly. `on_message`
(running on the libmosquitto network thread) validates the incoming JSON and then calls those
exact same functions — it never touches GPIO or `state/*` publishing through a separate path.
Each function writes to the shared atomics and publishes the matching `state/*` topic, so a
local button press and a remote MQTT command always leave the device in the same, visible
state, and we only had to get each state transition right once.

**Threading model.** Three threads run concurrently: the main loop (button polling), the play
thread (beat timing, LED, speaker), and libmosquitto's own network thread (connect/message/
publish callbacks). Shared scalar state (`current_bpm`, `current_mode`, `min_bpm`, `max_bpm`)
is `std::atomic`, so the play thread and main loop read it without locking. The one exception
is the tap-times vector, which isn't expressible as a single atomic and is guarded by a small
mutex held only long enough to push, copy, or clear it. MQTT callbacks never block or sleep —
they validate, write a few atomics, publish, and return immediately, so a slow or stuck
callback can never stall the beat timing.

**Payload validation.** `on_message` checks every incoming command before acting on it: valid
JSON, the expected field present and of the right type, `bpm` within `0`–`400`, `mode` one of
`play`/`learn`. Anything else is logged and dropped — the device must never crash or enter an
inconsistent state because of a malformed or malicious MQTT message.

## 6. Remote interface

- **`monitor.py`** — read-only CLI, subscribes to `state/#`, `event/#`, `status`, prints every
  message with a timestamp and a `[retained]` tag where relevant. Beat events print in place
  on a single line so the terminal doesn't scroll on every beat.
- **`controller.py`** — interactive CLI (`bpm <n>`, `mode play|learn`, `reset min|max`,
  `quit`), publishes commands and waits for the PUBACK before reporting success.
- **`dashboard/`** — static page, connects to the broker over MQTT-over-WebSockets
  (`ws://<pi-ip>:9001`) via MQTT.js. Shows live BPM, mode, min/max, and connection/device
  status; new in Lab 3 are the "Go to min" and "Go to max" buttons, which re-publish the
  tracked bound as the current BPM with one click.

[SCREENSHOT: dashboard online + playing]

[SCREENSHOT: monitor with retained state]

[SCREENSHOT: monitor showing offline after kill -9]

[SCREENSHOT: controller session]

## 7. REST (Lab 2) vs MQTT (Lab 3)

| Aspect | REST (Lab 2) | MQTT (Lab 3) |
|---|---|---|
| Communication model | Request/response | Publish/subscribe |
| Who initiates | The client always initiates (GET/PUT) | Either side: clients publish commands, device publishes state whenever it changes |
| Coupling | Client must know the device's own address | Clients only need the broker's address and the topic prefix; nobody talks to the device directly |
| Learning about changes | Client has to poll, or the user hits Refresh | Device pushes `state/*` the instant something changes; subscribers update immediately |
| Visibility of local (button) changes | Invisible to remote clients until they next poll | Device publishes `state/*` on every local button press too, so remote clients see it right away |
| Offline detection | None — no reply looks the same as "slow" or "down" | LWT: the broker publishes `status = offline` the moment the TCP connection drops |
| Late-joining clients | Must make a request to learn current state | Retained `state/*` delivered automatically on subscribe |
| Delivery guarantees | Implicit in the direct TCP connection per request | Explicit per topic: QoS 1 for commands/state/status, QoS 0 for high-rate beat/tap events |
| Device footprint | Device runs its own HTTP server (cpprestsdk), needs CORS for the browser dashboard | Device is one more MQTT client; the broker does all the listening, no CORS involved |
| Multiple clients | Each client polls independently; device answers every request | Broker fans one publish out to every subscriber; device publishes once regardless of client count |

The communication model change is visible directly in our code. The Lab 2 dashboard had a
Refresh button because it had no way to know the state had changed except by asking again —
Lab 3's dashboard has no such button; it subscribes once and updates on `state/*`/`event/*` as
they arrive. The device itself no longer runs any kind of server (no cpprestsdk, no listening
socket, no CORS headers to manage) — it is purely an MQTT client, and every piece of state it
exposes goes through the same `mqtt_publish` path instead of a set of REST handlers.

## 8. Testing

| # | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Connect dashboard to running device | Open dashboard, enter Pi IP, click Connect | Broker shows connected, device shows online, retained BPM/mode/min/max populate immediately | [fill in] |
| 2 | Set BPM within range | `controller.py` → `bpm 120` | `state/bpm` = 120 on monitor and dashboard; device beats at 120 | [fill in] |
| 3 | Set BPM out of range | `controller.py` → `bpm 500` | Rejected locally by the controller before publishing; no `cmd/set_bpm` sent | [fill in] |
| 4 | Mode switch, learn → play | `controller.py` → `mode learn`, tap button ≥4 times, `mode play` | BPM recalculated from taps, `state/bpm` and `state/mode` updated | [fill in] |
| 5 | Reset min/max | `controller.py` → `reset min` | `state/min` = 0 on monitor and dashboard, "Go to min" button disabled | [fill in] |
| 6 | Late-joining client sees retained state | Start `monitor.py` after the device has been running and BPM already set | `state/*` and `status` arrive immediately, tagged `[retained]` | [fill in] |
| 7 | Device crash detection | `kill -9` the device process | `status` flips to `offline` via LWT within the keepalive window, with monitor and dashboard both reflecting it | [fill in] |
| 8 | Clean shutdown | `Ctrl-C` the device | `status = offline` published and acked before the process exits; GPIO pins off | [fill in] |
| 9 | Local button vs remote command parity | Press the mode button locally, then switch mode remotely | Both paths produce identical `state/mode` updates on all clients | [fill in] |
| 10 | Multiple simultaneous clients | Run monitor, controller, and dashboard at once, issue commands from the controller | All clients see the same updates at the same time | [fill in] |

## 9. Problems encountered and solutions

- **Mosquitto wasn't installed on the Pi.** We hadn't needed a broker in Lab 2. Fixed with
  `sudo apt install -y mosquitto mosquitto-clients`.
- **Mosquitto 2.x defaults to a localhost-only listener.** Out of the box, the broker refused
  connections from the device and the remote clients over the network — only `127.0.0.1`
  could connect. We added an explicit listener config at `/etc/mosquitto/conf.d/lab3.conf`
  instead of relying on the default.
- **The dashboard needed a second, separate listener for WebSockets.** The browser can't open
  a raw TCP MQTT socket, so the same `conf.d/lab3.conf` also declares `listener 9001` with
  `protocol websockets`, alongside the plain `listener 1883` used by the device and the
  Python CLIs.
- **Dashboard showed a stale BPM for a moment at startup/during playback.** `event/beat`
  carries the BPM the device is currently playing at, but the dashboard wasn't comparing it
  against what it had on screen, so a BPM change that happened to arrive between two
  `state/bpm` messages could be missed until the next beat. Fixed by factoring the BPM
  display update into a single `updateBpmDisplay()` function and calling it from `event/beat`
  whenever `data.bpm` differs from what's currently displayed, not just from `state/bpm`.

## 10. Changes from Lab 2 feedback

[TODO: paste the feedback we received on the Lab 2 report, then describe what we changed in
response for Lab 3.]

## 11. Contributions

| Member | Tasks | % |
|---|---|---|
| Alessandro Querzé | [fill in] | [fill in] |
| Andrei Radu | [fill in] | [fill in] |
| Enrico Giannini | [fill in] | [fill in] |
| Mirko Tonelli | [fill in] | [fill in] |

## 12. Conclusion

Porting the Metronome Thing from REST to MQTT didn't change what the device does, but it
changed who is responsible for what. The device stopped being a server that remote clients
depend on directly, and became one client among several that only depend on the broker. In
exchange for designing a topic hierarchy and choosing retention/QoS/LWT deliberately up
front, we got state propagation, late-join synchronization, and offline detection essentially
for free — all three were either absent or manually reimplemented in the REST version. The
main cost was new vocabulary to get right (retained vs not, which QoS where, when the LWT
fires vs an explicit publish), but once that vocabulary was settled, the device-side logic
from Lab 2 dropped in with only the transport layer replaced.
