# Lab 4 — Building Microservices for your Smart Space — Project Context

> Context file for B8019 Programming the Internet of Things, Prof. Sumi Helal.
> Sources: the Lab 4 assignment PDF (Fall 2026), the Lab 4 slide deck, and the Atlas Thing Middleware source (github.com/NickLiJunjie/AtlasThingMiddleware_RPI, V3.0).
>
> **Our setup is different from the handout:** we have **ONE Raspberry Pi** that hosts **both the sensors and the actuators**. Wherever the handout says "RPi-1 (sensors)" and "RPi-2 (actuators)", read it as "our single RPi". The handout explicitly allows this ("RPi-2 platform (if not available use RPi-1)", "each of the two Raspberry Pi's (or the only single Pi you may have available)").

---

## 0. Quick facts

| Item | Value |
|---|---|
| Course | B8019 – Programming the Internet of Things, Fall 2026 |
| Due | **12:00 noon, 11 November 2026** (the slide deck still shows the old Spring date of 27 April 2026; ignore it) |
| Submit to | Email Prof. Helal **and** Junjie Li (lijunjie@ufl.edu). Only one group member submits. List every member's full name. |
| Deliverable | `Lab4_<OurNames>.zip` → `PartOne/` + `PartTwo/` |
| RPi language | **C/C++ only. No Python on the RPi side in this assignment.** |
| Demo app language (Part Two) | Any (C/C++, Java, Python…) |
| Atlas service-call port | **TCP 6668** on the RPi |
| Atlas multicast (tweets) | UDP **232.1.1.1:1235** (hard-coded in the middleware) |
| Network | Private network (own Wi-Fi hub / hotspot / Ethernet). **Not** UNIBO's network. |
| Grading | Live demo with TAs; all members must attend (absences = deduction). Comments and documentation count toward the grade. |

---

## 1. Big picture: where Lab 4 fits

The Virtual Smart Space (VSS) from Lab 1 has three layers on a private network:

1. **Private cloud**: hosts IoT applications (e.g., the Metronome dashboard).
2. **Edge**: one or two laptops. Relay commands down and data up via REST APIs and MQTT.
3. **IoT things**: RPi platforms with sensors and actuators that run instructions and return results.

Path so far:
- **Lab 1:** built the VSS (cloud, Edge laptop(s), RPi things).
- **Labs 2–3:** physical layer (metronome circuit: push buttons and LEDs, two modes) and Edge layer (HTML dashboard on the laptop talking to the RPi over REST and MQTT/broker).
- **Lab 4:** **think in services.** Describe, advertise and compose services. It is a stepping stone to the final project.

**Our topology (single RPi):**

```
 [Laptop = Edge]  --- private Wi-Fi/Ethernet ---  [RPi (thing)]
   web dashboard + mini-IDE                         sensor entities (bit-things)
   orchestrator (calls services)                    actuator entities (bit-things)
   Part Two: Demo IoT Application                   Part One: our C/C++ service program
                                                    Part Two: Atlas middleware (port 6668)
```

---

## 2. Core concepts

**Service:** a single function an IoT thing offers (e.g., `Read_Temp`, `Fan_On`, `Set_Angle(deg)`). More services mean more possible applications. Meaningful applications come from the **relationships** between services.

**Relationship:** a virtual link between two or more services. Lab 4 uses only these two:

1. **Order-based:** Service B may run **only after** Service A runs **successfully to completion**.
   Example: `Calibrate`, then `Read_Temp`.
2. **Condition-based:** Service B runs **conditionally**, based on a specific outcome (return value) of Service A.
   Example: `if Read_Temp(C) > 28 → Fan_On`.

**Bit-thing / entity:** an inner component of a thing. Each sensor and each actuator is its own entity. Our single RPi is **one thing** with **several entities** (at least one sensor entity and one actuator entity).

---

## 3. PART ONE: Connecting multiple services to build an IoT application

### Step 1: Scenario
Pick an interesting **and feasible** application that uses the sensors and actuators available to us (class locker inventory, or a part the group buys). It must have at least one sensor and one actuator so both relationships can be shown.

> **TODO (group):** write our scenario here.
> Illustrative only (from the slides): temperature sensor + fan. `IF Read_Temp(C) > 28 DO Fan_On()`.

### Step 2: Physical layer (single RPi)
- Wire **all** sensors **and** actuators to the **same RPi**.
- Write the C/C++ functionality for each sensor read and each actuator action.
- **Test it**: confirm we get sensor values and can drive each actuator.
- Single-Pi wiring cautions:
  - Plan a **pin map** up front so sensor, ADC and actuator pins don't collide (see §6).
  - The servo example uses **GPIO18** for hardware PWM, but the MCP3008 example wiring also uses **GPIO18** (as SPI CLK). If we use both, move the MCP3008 to other free GPIOs (allowed; it's software SPI) or put the PWM device on GPIO12/13.
  - Watch total current draw. Power motors and servos from an external supply with a common ground, not from the Pi's 3.3V/5V rail.

### Step 3: Edge layer — advertise services as vectors
The RPi must **connect to the Edge and report its available services**. Each service is reported as a vector:

```
(RPi identifier, service name, number of required input parameters, input parameter names)
e.g.  (RPi-1, Read_Temp, 1, F_or_C)
```

Single-RPi version: every vector carries the **same RPi identifier** (e.g., `RPi-1`). Keep the identifier field anyway; it's part of the required format and lets the design scale to more Pis.

The Edge collects the vectors and **displays them on a web-based dashboard** (extend the Lab 3 HTML dashboard). Transport is up to us; REST or MQTT from Lab 3 both work.

Suggested service list format (fill in):

| RPi | Entity | Service | #inputs | Input names | Output |
|---|---|---|---|---|---|
| RPi-1 | (sensor) | `Read_…` | 0/1 | … | int |
| RPi-1 | (actuator) | `…_On` | 0 | – | void/int status |
| RPi-1 | (actuator) | `…_Off` | 0 | – | void/int status |

### Step 4: A "trivial" programming environment (mini-IDE)
Through the dashboard, the user composes a simple IoT app using one or both relationships. It is a very small, limited IDE. Two options:
- **Text-based** (command line / text box): easier.
- **Simple graphical** (point, click, drag).

Illustrative text syntax from the slides (each group designs its own):

```
// order-based: B after A succeeds
RUN  RPi1.Calibrate()
THEN RPi1.Read_Temp(C)

// condition-based: B on A's result
IF   RPi1.Read_Temp(C) > 28
DO   RPi1.Fan_On()
```

With one RPi, every statement targets the same Pi (`RPi1.`), but keep the prefix in the grammar.

### Step 5: Build and run an app
Use the IDE to compose a simple app and run it. The **Edge translates** the app into a set of **service API calls** to the RPi, as defined by the relationship(s).

### Step 6: Display results
The **Edge** controls the order of API calls, checks returned values for conditions, collects the results from the thing, and **displays them** to the user.

Edge orchestration logic:
- **Order-based (A THEN B):** call A → wait for its reply → if A reports success, call B; otherwise stop and show the error.
- **Condition-based (IF A op X DO B):** call A → parse its return value → evaluate `value op X` (`>`, `<`, `==`, …) → call B only if true → show A's value, the condition result, and B's result (or "skipped").

### Part One deliverable
- C/C++ service implementations for the RPi as **one `main(){}` program with the services as functions** (since we have one Pi, one program holds the sensor and actuator services).
- Edge dashboard / IDE code.
- `README` in `PartOne/` with a short description of the **distribution of effort** (who did what). Note in the README that we used a **single RPi** for both sensors and actuators.

---

## 4. PART TWO: Describe and build the IoT Thing with Atlas

**Atlas Thing Middleware** is a firmware layer embedded in the IoT thing. It integrates the thing into the VSS automatically. It enables thing-to-thing and thing-to-user/cloud communication, and it:
- **Advertises and discovers:** broadcasts JSON "tweets" summarizing the thing to the smart space.
- **Generates microservices** dynamically from the service descriptions.
- **Exposes APIs** so users and other things can invoke the services.
- Lets programmers **compose applications** from discovered services.

**IoT-DDL** is an XML-based declarative language describing a thing's inner components, identity, capabilities, resources and services.

### Step 1: Write the IoT-DDL with the Builder
Tool: https://www.cise.ufl.edu/~helal/Atlas-IoT-DDL-Builder.html (Atlas IoT-DDL Builder v3.0).
Tabs: *Descriptive Metadata* · *Structural and Administrative Metadata* · *Entities, Services, and Relationships* · *Thing Attachments* · *HELP*.

Single-RPi mapping:
- **Thing = our one Raspberry Pi.** Fill *Descriptive Metadata* (Thing ATID = our Thing ID, name, owner, vendor, model, OS, **Thing_SSID = our Space ID**, space name…).
- **One entity per bit-thing:** one entity per sensor and one per actuator, all under the same thing. `Number_Entities` = total sensors + actuators.
- Entity fields: ID (required, unique), Name, Owner, Vendor, Category, Type, Description.

For **each service** in an entity:
1. **Libraries:** if the service uses GPIO, add the header first. **`wiringPi.h` is required for any GPIO or ADC use** (it is the only library supported for ADC).
2. **Service Inputs:** name and type of each input (default: none/void).
3. **ADC Configuration** (default: none): choose the ADC model (**MCP3008** or **ADS1115**), the channel, and a variable name that will hold the reading (e.g., `mcpRead0`).
4. **Service Output:** output name and data type (default: void).
5. **Functionality:** the C/C++ body. **Reuse the Part One code.** You can use input names, the ADC variable, and the output variable directly. **Do not write `return`**; the middleware adds it automatically.

Example (sensor service, no inputs, read ADC CH0 on MCP3008, output `value` of type Integer):
```c
// ~ Service body C/C++ code block ~
value = mcpRead0;
```

Reference IoT-DDL (servo entity with one service): https://github.com/NickLiJunjie/AtlasFramework/blob/main/IoT-DDL/Servo_Motor.xml
Key tags in that file: `<Thing_ATID>MySmartThing01</Thing_ATID>`, `<Thing_SSID>MySmartSpace</Thing_SSID>`, `<Number_Entities>`, per-service `<Name>`, `<OutputType>`, `<Service_Formula><![CDATA[ ... ]]>`, `<Service_NumberInputs>`, `<Service_InputTypes>`, `<Libraries>wiringPi.h</Libraries>`, `<ADC_Number>`.

### Middleware limits (from the source; design services around them)
- **Input types: integers only.** Inputs are parsed with `stol`. Encode choices as ints (e.g., `F_or_C`: 0 = C, 1 = F).
- **At most 2 inputs** per service (0, 1 or 2).
- **Output types: `void` or `int` only** (bool is mentioned but not handled in the call path).
- Service names become directory and `.so` names. Use **no spaces or special characters** (e.g., `Read_Temp`).
- Each service is compiled into its own bundle under `Architecture/GeneratedServices/service/<ServiceName>/`.

### Step 2: Deploy Atlas on the RPi
Repo: https://github.com/NickLiJunjie/AtlasThingMiddleware_RPI (V3.0). Install **this** version.

```bash
# 1. Dependencies
sudo apt update && sudo apt upgrade
sudo apt install -y build-essential libcurl4-openssl-dev libboost-all-dev \
  gcc gcc-12 g++ g++-12 cmake cmake-data cmake-curses-gui doxygen autogen make \
  libc6-dev libgcc-12-dev libstdc++-12-dev libstdc++6 git dpkg apt

# 2. Download the middleware zip from GitHub onto the Pi and unzip it

# 3. CppMicroServices (zip is in lib/ of the middleware; keep it in lib/)
unzip CppMicroServices-development.zip
cmake CppMicroServices-development/
sudo make
sudo make install
LD_LIBRARY_PATH=/usr/local/include
export LD_LIBRARY_PATH
sudo ldconfig
sudo mv /usr/local/include/cppmicroservices4/ ~/Desktop/
sudo mv ~/Desktop/cppmicroservices4/cppmicroservices/ /usr/local/include/

# 4. WiringPi + interfaces
git clone https://github.com/WiringPi/WiringPi.git
cd WiringPi && ./build
sudo raspi-config        # Interfacing Options → enable BOTH I2C and SPI

# 5. Build Atlas (from the middleware root directory)
cmake Main/
make

# 6. Put our IoT-DDL in place: replace ConfigurationFiles/Atlas_IoTDDL.xml
#    (same file name, in the ConfigurationFiles/ directory; this placement matters)

# 7. Run
sudo ./Atlas
```

Middleware layout: `Main/` (entry point, CMakeLists), `Architecture/` (Communication Manager, IoT-DDL Parser, Identity Parser, API Generator, Knowledge Tweeting Manager, System Functions), `lib/` (RapidJSON, TinyXML2, Paho MQTT, CoAP, Crypto++, OMA), `ConfigurationFiles/` (the IoT-DDL).

### Step 3: What Atlas does on launch, and the Demo IoT Application
On launch the middleware parses the IoT-DDL, generates the microservices, builds JSON tweets, and broadcasts them to the VSS. Then it listens for service calls.

- **Tweets** (UDP multicast 232.1.1.1:1235): `Identity_Thing`, `Identity_Language`, `Identity_Entity`, `Service`, `Relationship`. Sent about 3 s apart, with the cycle repeating every ~20 s. A `Service` tweet carries Name, Thing ID, Entity ID, Space ID, Vendor, API, Type, AppCategory, Description and Keywords. The API string looks like `ServiceName:[inName,int, NULL|in2,int, NULL]:(outName,int, NULL)`.
- **Service calls**: TCP to `<RPi IP>:6668`, **one JSON call per connection**. Send the whole JSON in one write (the server does a single read of up to 4048 bytes). Read the JSON reply, then close.

**Write a "Demo IoT Application"** (any language) that unicasts API calls to the thing and invokes the services we described. **Comment it well** and explain what each demonstration shows.

Call format (`Thing ID` and `Space ID` must exactly match the IoT-DDL):
```json
{ "Tweet Type": "Service call",
  "Thing ID": "MySmartThing01",
  "Space ID": "MySmartSpace",
  "Service Name": "Service2",
  "Service Inputs": "(3,9)" }
```
- No inputs: `"Service Inputs": "()"` (also accepted: `(null)`, `(NULL)`, `(void)`, `(VOID)`).
- One input: `"(18)"`. Two inputs: `"(3,9)"`.
- Send it as a single-line string. The PDF's `char Call1[] = "` with raw line breaks is illustrative and is not valid C as written.

Reply format:
```json
{ "Tweet Type" : "Service call reply", "Thing ID" : "...", "Space ID" : "...",
  "Service Name" : "Read_Temp", "Status" : "Successful",
  "Status Description" : "Successful Service Call", "Service Result" : "27" }
```
- `void` services reply with `"Service Result" : "No Output"`.
- Failures: `"Status" : "Unsuccessful"` with `"Status Description"` of `"Unknown Service"`, `"Incorrect service arguments"`, or `"incorrect thing id or smart space id"`. A wrong Thing or Space ID can also produce `{ "Status" : "ATID doesn't match" }` / `"SSID doesn't match"`.
- The middleware **pauses ~3 s after each call**. Space consecutive calls accordingly or retry on connection failure.
- Order-based relationship check = `Status == "Successful"`. Condition-based check = parse `Service Result` as an int.

Minimal demo-app sketch (Python is allowed for the demo app only; any language works):
```python
import socket, json, time
RPI_IP, PORT = "192.168.x.x", 6668
THING, SPACE = "MySmartThing01", "MySmartSpace"   # must match IoT-DDL

def call(service, inputs="()"):
    msg = json.dumps({"Tweet Type": "Service call", "Thing ID": THING,
                      "Space ID": SPACE, "Service Name": service,
                      "Service Inputs": inputs})
    with socket.create_connection((RPI_IP, PORT), timeout=10) as s:
        s.sendall(msg.encode())
        reply = json.loads(s.recv(4096).decode())
    time.sleep(3)                                   # middleware pauses ~3 s per call
    return reply

# Condition-based demo: IF Read_Temp(0=C) > 28 DO Fan_On
r = call("Read_Temp", "(0)")
if r.get("Status") == "Successful" and int(r["Service Result"]) > 28:
    print(call("Fan_On"))
```

### Part Two deliverable
- The **IoT-DDL XML** generated with the Builder (our single thing with all its entities).
- The **Demo IoT Application** source, well commented.

---

## 5. Single-RPi adaptations (summary)

| Handout says | We do |
|---|---|
| RPi-1 = sensors, RPi-2 = actuators | One RPi hosts both; one pin map for everything |
| "Your two RPi platforms must connect and report services" | The one RPi reports all its services; same RPi ID in every vector |
| C/C++ services per RPi, each as `main()` + functions | One C/C++ program with all sensor + actuator services as functions |
| IDE app spans RPi1 → RPi2 | IDE still uses `RPiX.Service()` syntax; all calls go to the same Pi |
| IoT-DDL per Pi | **One** IoT-DDL: one thing, one entity per sensor/actuator |
| Demo app calls things' IPs | One IP, port 6668 |

**Process conflicts on one Pi:**
- The Part One service program and the Atlas middleware both drive the **same GPIO pins**. Don't run them at the same time during demos; stop one before starting the other.
- **Port 6668 belongs to Atlas.** If the Part One program runs its own server for the Edge, put it on a different port (or use MQTT from Lab 3).
- Run Atlas with `sudo` (GPIO access).

---

## 6. Appendix: ADC wiring (Atlas supports MCP3008 and ADS1115)

| | MCP3008 | ADS1115 |
|---|---|---|
| Resolution | 10-bit → Atlas outputs ints 0–1024 | 16-bit → Atlas outputs ints 0–65536 |
| Channels | 8 (CH0–CH7) | 4 (A0–A3) |
| Interface | **Software** SPI | I2C, address **0x48** (ADDR → GND) |
| Enable | `raspi-config` → Interface Options → SPI | `raspi-config` → Interface Options → I2C |
| Power | VDD, VREF → 3.3V; AGND, DGND → GND | VCC → **3.3V only (never 5V)**; GND → GND |
| Signal pins | CLK GPIO18 (pin 12), DOUT/MISO GPIO23 (pin 16), DIN/MOSI GPIO24 (pin 18), CS/SHDN GPIO25 (pin 22) | SDA GPIO2 (pin 3), SCL GPIO3 (pin 5); ALRT not connected |

- MCP3008 pins can be moved to any free GPIO (software SPI). If you change them, update the code to match.
- In IoT-DDL, **always add `wiringPi.h`** to Libraries when using an ADC.
- Convert raw ADC counts to real units (°C, lux, volts…) with the sensor-specific formula, scaling factors and offsets inside the service's Functionality code.

**Pin map (TODO, fill in for our single Pi):**

| Device | Entity | Pins (BCM) | Notes |
|---|---|---|---|
| ADC (MCP3008/ADS1115) | – | | |
| Sensor 1 | | | |
| Actuator 1 | | | |

---

## 7. Extra credit (+10%): cross-group VSS over VPN
Two groups link their things through an external VPN server (e.g., self-hosted OpenVPN) so they hear each other's tweets and can invoke services across groups.

```bash
sudo apt install openvpn
# place the config at /etc/openvpn/client/vss.conf (exact name)
sudo systemctl start openvpn-client@vss
sudo systemctl status openvpn-client@vss
ip -br a                 # VSS IP on tap0, likely 10.254.0.0/24
sudo systemctl stop openvpn-client@vss   # disconnect
```
**Security:** change the default RPi password with `passwd` first, because the Pi becomes visible to the other group. Use a network other than UNIBO's.

---

## 8. Submission checklist

```
Lab4_<FullNamesOfGroup>.zip
├── PartOne/
│   ├── <services>.c / .cpp    # single main() program, one function per service (sensors + actuators)
│   ├── edge/ …                 # dashboard + mini-IDE + orchestrator code
│   └── README                  # distribution of effort; note we used a single RPi
└── PartTwo/
    ├── Atlas_IoTDDL.xml        # from the Builder: 1 thing, 1 entity per sensor/actuator
    └── demo_app/ …             # Demo IoT Application, well commented
```
- [ ] RPi code is C/C++ only (no Python on the Pi)
- [ ] Every service reported as `(RPi ID, name, #inputs, input names)` and shown on the dashboard
- [ ] Mini-IDE supports order-based and/or condition-based composition
- [ ] Edge controls call order, evaluates conditions, displays results
- [ ] IoT-DDL Thing ID / Space ID match the IDs in the demo app calls
- [ ] Service inputs are ints (≤ 2), outputs are void or int
- [ ] IoT-DDL placed at `ConfigurationFiles/Atlas_IoTDDL.xml` and Atlas builds/runs
- [ ] Comments throughout (they are graded)
- [ ] One member emails Prof. Helal + lijunjie@ufl.edu before **12:00 noon, 11 Nov 2026**, with all full names
- [ ] Everyone available for the live TA demo