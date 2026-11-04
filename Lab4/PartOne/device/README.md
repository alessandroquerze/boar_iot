# Device — service program for the single RPi

Runs on the Raspberry Pi. Drives the DHT11, the servo and the fan over GPIO, and answers
service calls over plain MQTT (TCP 1883) using libmosquitto. Subscribes to `vss/boar/call`,
publishes `vss/boar/{services,reply,status}`.

All relationship logic lives in the Edge. This program executes exactly one service per call.

## GPIO pins (BCM numbering)

| Pin | Device | Entity | Direction | Purpose |
|-----|--------------------|-----------------|-----------|------------------------------|
| 17  | DHT11 data | `ClimateSensor` | in/out | Bit-banged temperature + humidity |
| 18  | Servo signal | `Window` | PWM ch0 | Window angle, 0–50° |
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
| `Fan` | `Read_Fan_Speed` | 0 | – | int speed (0–75) |
| `Fan` | `Read_Fan_Status` | 0 | – | int (1 on / 0 off) |
| `Window` | `Set_Window` | 1 | `angle` (0–50) | int applied angle |
| `Window` | `Window_Close` | 0 | – | void |
| `Window` | `Read_Window_Position` | 0 | – | int angle |

Inputs are integers and outputs are `int` or `void` throughout, because Part Two's Atlas
middleware accepts nothing else. Out-of-range inputs are clamped, not rejected; the reply
reports the value actually applied.

### Window arc and servo calibration

Measured on the bench with `../../test/servocal.c`: 500 µs is 90° clockwise, 1500 µs straight,
2500 µs 90° counter-clockwise. At 10 µs per duty tick that is **200 ticks per 180°**. The
nominal 1–2 ms range most examples use covers only the middle half of this servo's travel and
delivers roughly half the commanded angle.

The window is **shut with the horn centred** and opens counter-clockwise until its linkage
binds at 50°:

```
duty = 150 + angle * 200 / 180        angle clamped to 0–50
  0° -> duty 150 -> 1500 µs (closed)
 25° -> duty 177 -> 1770 µs
 50° -> duty 205 -> 2050 µs (fully open)
```

So angle 0 is the centre of the servo's travel, not an end stop, and `Window_Close` drives
1500 µs. Every program here stays inside that arc. The one exception is `servocal.c`, whose
job is to find end stops — run it only with the horn **disconnected** from the linkage.

### Actuator state is remembered, not measured

A hobby servo has no position feedback, the fan has no tachometer, and wiringPi cannot read a
PWM register back. So `Read_Window_Position`, `Read_Fan_Speed` and `Read_Fan_Status` all report
the **last commanded** value, persisted in `/tmp/window_angle` and `/tmp/fan_speed`. Files
rather than variables because in Part Two each service is a separate Atlas bundle that shares no
memory with the others — `Read_Fan_Speed` genuinely cannot see anything `Fan_On` left behind.

`Read_Fan_Status` derives from the same `/tmp/fan_speed` file as `Read_Fan_Speed`, reporting
`speed > 0`, so the two can never contradict each other.

A read before any set — for instance after a reboot clears `/tmp` — returns 0. That is an
assumption that the window is shut and the fan is off, not a measurement.

### Sensor reads are retried

A single DHT11 read fails often enough to be a nuisance, so `read_dht11_retry` makes up to
**3 attempts**, waiting **1.1 s** between them because the sensor needs roughly a second
between conversions — an immediate retry just fails again. All three `ClimateSensor` services
go through it.

A service that exhausts all three attempts replies `"status":"Unsuccessful"` with
`"Sensor read failed"`. Worst case it blocks the libmosquitto thread for about 2.3 s, well
inside both the 60 s keepalive and the Edge's 10 s call timeout.

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
SERVICES published (10)
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
