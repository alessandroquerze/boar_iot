# Device — service program for the single RPi

Runs on the Raspberry Pi. Drives the DHT11, the servo and the fan over GPIO, and answers
service calls over plain MQTT (TCP 1883) using libmosquitto. Subscribes to `vss/boar/call`,
publishes `vss/boar/{services,reply,status}`.

All relationship logic lives in the Edge. This program executes exactly one service per call.

## GPIO pins (BCM numbering)

| Pin | Device | Entity | Direction | Purpose |
|-----|--------------------|-----------------|-----------|------------------------------|
| 17  | DHT11 data | `ClimateSensor` | in/out | Bit-banged temperature + humidity |
| 18  | Servo signal | `Window` | PWM ch0 | Window angle, 0–180° |
| 13  | Motor base (2N2222)| `Fan` | PWM ch1 | Fan speed, 0–75 % |

wiringPi drives both PWM channels from one clock and `pwmSetRange()` writes both range
registers, so the two share a frequency. The servo fixes it at clock 192 / range 2000 = 50 Hz
and the fan inherits it. Expect an audible buzz from the motor, and expect low duties to
stutter rather than spin — see `../../test/pwm13.c`.

## Services

| Entity | Service | #inputs | Input names | Output |
|---|---|---|---|---|
| `ClimateSensor` | `Calibrate_Sensor` | 0 | – | int (1 ok) |
| `ClimateSensor` | `Read_Temp` | 1 | `F_or_C` (0=C, 1=F) | int degrees |
| `ClimateSensor` | `Read_Humidity` | 0 | – | int % |
| `Fan` | `Fan_On` | 1 | `speed` (0–75) | int applied speed |
| `Fan` | `Fan_Off` | 0 | – | void |
| `Window` | `Set_Window` | 1 | `angle` (0–180) | int applied angle |
| `Window` | `Window_Close` | 0 | – | void |
| `Window` | `Read_Window_Position` | 0 | – | int angle |

Inputs are integers and outputs are `int` or `void` throughout, because Part Two's Atlas
middleware accepts nothing else. Out-of-range inputs are clamped, not rejected; the reply
reports the value actually applied.

### Window position is remembered, not measured

A hobby servo has no position feedback and wiringPi cannot read a PWM register back, so
`Read_Window_Position` reports the **last commanded** angle, persisted in `/tmp/window_angle`.
A file rather than a variable because in Part Two each service is a separate Atlas bundle that
shares no memory with the others. A read before any set — for instance after a reboot clears
`/tmp` — returns 0, which is an assumption that the window is closed, not a measurement.

## Dependencies

```bash
sudo apt install libmosquitto-dev nlohmann-json3-dev
git clone https://github.com/WiringPi/WiringPi.git && cd WiringPi && ./build
```

## Build

```bash
mkdir -p build && cd build
cmake ..
make
```

## Run

GPIO access requires root:

```bash
sudo ./main [broker_host] [broker_port]   # defaults: localhost 1883
```

## Expected startup log

```
MQTT connected
STATUS status=online
SERVICES published (8)
```

## Calling a service by hand

```bash
mosquitto_sub -h localhost -t 'vss/boar/#' -v &
mosquitto_pub -h localhost -t vss/boar/call \
  -m '{"id":1,"service":"Read_Temp","inputs":[0]}'
```

The reply mirrors the Atlas service-call reply so the Edge and the Part Two demo application
can share one piece of relationship logic:

```json
{"id":1,"service":"Read_Temp","status":"Successful",
 "description":"Successful Service Call","result":24}
```

`result` is `null` for `void` services, where Atlas says `"No Output"`. Failures carry
`"status":"Unsuccessful"` with a `description` of `"Unknown Service"`,
`"Incorrect service arguments"` or `"Sensor read failed"`.

## Stopping

`Ctrl-C` (SIGINT) publishes `status=offline`, waits for the PUBACK, then zeroes both PWM
channels and releases the pins.

## Note on Atlas

Port 6668 belongs to the Atlas middleware, and Atlas drives the same GPIO pins as this
program. Never run the two at once — stop one before starting the other.
