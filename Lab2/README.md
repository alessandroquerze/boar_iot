# Lab 2 – Metronome Thing

Project split into two parts:

- `metronome/metronome/` — **Part 1**: embedded application on Raspberry Pi (C++) that drives LEDs/buttons via GPIO and exposes a REST API on port `8080`.
- `part_2/` — **Part 2**: web dashboard (plain HTML/CSS/JS) to control the metronome through the REST API.

## Quick start

### Part 1 — on the Raspberry Pi

```bash
sudo apt install libcpprest-dev wiringpi   # dependencies
cd metronome/metronome
mkdir build && cd build
cmake ..
make
./main
```

The REST service starts on `http://<pi-ip>:8080`. For subsequent builds, just rerun `make` inside `build/`.

GPIO pins (BCM) used in `main.cpp`, adjust to match your own circuit:

| Component      | BCM pin |
|-----------------|---------|
| Red LED         | 17      |
| Green LED       | 27      |
| MODE button     | 23      |
| TAP button      | 24      |
| Speaker (opt.)  | 20      |

### Part 2 — dashboard

Just open `part_2/index.html` in a browser (double-click, or serve it with any static server). No build needed.

In the "Device address" field enter `<pi-ip>:8080` (e.g. `192.168.8.189:8080`) and click "Save".

## How the metronome works

- **Play mode**: the green LED blinks at the currently set BPM (0 = off).
- **Learn mode**: the red LED pulses on every press of the TAP button; the BPM is recalculated from the average interval between taps (at least 4 valid taps required).
- The MODE button toggles between the two modes.

## REST API (port 8080)

| Endpoint      | Methods         | Description                                    |
|---------------|-----------------|-------------------------------------------------|
| `/bpm/`       | `GET`, `PUT`    | Read/set the current BPM. PUT body: `{"bpm": <number>}` |
| `/bpm/min/`   | `GET`, `DELETE` | Read/reset the lowest BPM ever set              |
| `/bpm/max/`   | `GET`, `DELETE` | Read/reset the highest BPM ever set             |

Note: all paths require the trailing slash.

## File structure

```
metronome/metronome/
├── main.cpp          # main loop: GPIO, BPM calculation, REST endpoints
├── metronome.hpp      # metronome class interface (timing/BPM)
├── rest.hpp            # helper to create REST listeners + CORS on OPTIONS
└── CMakeLists.txt     # build (cpprestsdk, wiringPi)

part_2/
├── index.html          # dashboard markup
├── app.js              # logic: fetches to the API, UI updates
└── style.css           # styling
```

## Notes

- GPIO must use **only the 3.3V power supply**: 5V may damage the Pi.
