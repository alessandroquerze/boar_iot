# Device — Metronome Thing

Runs on the Raspberry Pi. Drives the LEDs/speaker/buttons over GPIO and talks to the
Mosquitto broker over plain MQTT (TCP 1883) using libmosquitto. Subscribes to
`metronome/boar/cmd/#`, publishes `metronome/boar/{state,event,status}/*`. See
[`../topic_list.md`](../topic_list.md) for the full topic contract.

## GPIO pins (BCM numbering)

| Pin | Name       | Direction | Purpose                     |
|-----|------------|-----------|------------------------------|
| 17  | `LED_RED`  | output    | Learn mode / tap flash       |
| 27  | `LED_GREEN`| output    | Beat pulse (play mode)       |
| 20  | `SPEAKER`  | output    | Beat click                   |
| 23  | `BTN_MODE` | input     | Toggle play/learn             |
| 24  | `BTN_TAP`  | input     | Record a tap (learn mode)     |

## Dependencies

```bash
sudo apt install libmosquitto-dev nlohmann-json3-dev wiringpi
```

## Build

```bash
mkdir -p build && cd build
cmake ..
make
```

## Run

```bash
./main [broker_host] [broker_port]   # defaults: localhost 1883
```

GPIO access usually requires root, so run with `sudo` if you get a permissions error:

```bash
./main 192.168.8.189 1883
```

## Expected startup log

```
MQTT connected
STATUS status=online
STATE state/bpm bpm=0
STATE state/mode mode=play
STATE state/min min=0
STATE state/max max=0
```

## Stopping

`Ctrl-C` (SIGINT) triggers a clean shutdown: the play thread stops, `status=offline` is
published and acked, GPIO pins are turned off, then the process exits.
