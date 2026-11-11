# Part One: Connecting multiple services to build an IoT application

> **Single Raspberry Pi.** One Pi hosts both the sensor and the actuators. Every service vector
> carries the identifier `RPi-1`, and the mini-IDE keeps the `RPiX.` prefix so the design works
> with more Pis.

| Component | Where |
| --- | --- |
| Services for each sensor and actuator, in C/C++ | `device/main.cpp`, one program, one function per service |
| The RPi connects to the Edge and reports its services as `(RPi id, name, #inputs, input names)` | retained MQTT message on `vss/boar/services`, shown in the dashboard's catalogue |
| A programming environment | mini-IDE in `edge/index.html` (text-based) |
| The Edge turns the program into service calls, checks conditions and displays results | orchestrator in `edge/app.js` |

## MQTT topics

Prefix `vss/boar/`. All payloads are JSON.

| Topic | Direction | Payload | QoS | Retained |
| --- | --- | --- | --- | --- |
| `services` | device → all | `{"thing":"RPi-1","services":[{"rpi":…,"entity":…,"name":…,"ninputs":…,"inputs":[…],"output":…}]}` | 1 | yes |
| `call` | Edge → device | `{"id":7,"service":"Read_Temp","inputs":[0]}` | 1 | no |
| `reply` | device → all | `{"id":7,"service":"Read_Temp","status":"Successful","description":"…","result":24}` | 1 | no |
| `status` | device → all | `{"status":"online"}` / `{"status":"offline"}` (last will) | 1 | yes |

- `services` is retained, so a dashboard opened at any time receives the vectors immediately.
- Failures reply `Unsuccessful` with a `description` such as `Unknown Service`,
  `Incorrect service arguments` or `Sensor read failed`. `result` is `null` for `void` services.

## Running

**1. Broker (on the Pi).** Mosquitto with a plain listener for the device and a WebSockets
listener for the browser. Create `/etc/mosquitto/conf.d/lab4.conf`:

```conf
listener 1883
allow_anonymous true

listener 9001
protocol websockets
```

```bash
sudo systemctl enable --now mosquitto
ss -tlnp | grep mosquitto        # expect :1883 and :9001
```

**2. Device (on the Pi).** Dependencies and details are in [`device/README.md`](device/README.md).

```bash
cd device && mkdir -p build && cd build
cmake .. && make
sudo ./main [broker_host] [broker_port]     # defaults: localhost 1883
```

**3. Edge (on the laptop).** Open `edge/index.html` in a browser, enter the Pi's IP and press
**Connect**. The catalogue fills with the service vectors and the device shows as online.
Write a program in the mini-IDE and press **Run program**; every call, reply and decision appears
in the log.

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

How the orchestrator runs a program:

- **Order-based.** If a call replies `Unsuccessful`, the rest of the chain is skipped.
- **Condition-based.** Each predicate is a real service call. Evaluation short-circuits, so later
  predicates may never be called. If a predicate's call fails, neither branch runs.
- **Statements are independent.** A failed statement does not stop the ones after it.
- **Timeout.** A call with no reply within 10 s counts as failed.
