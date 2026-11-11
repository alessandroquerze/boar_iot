# Part Two: Describing and building the IoT thing with Atlas

The Part One services are described in IoT-DDL (`Atlas_IoTDDL.xml`) and run by the Atlas thing
middleware on the same single Raspberry Pi. Atlas announces the thing to the smart space and
generates one microservice per service. `demoApp/` calls those services over the network.

## The thing

| Field | Value |
| --- | --- |
| Thing ID (`Thing_ATID`) | `AT_BoarAirSensor` |
| Space ID (`Thing_SSID`) | `BoarSmartSpace` |
| Entities | `ClimateSensor` (DHT11), `Fan` (motor + 2N2222), `Window` (servo) |
| Services | the 10 services in the [general README](../README.md#services) |
| Relationships | `interfere` between `Fan_On`/`Fan_Off` and between `Set_Window`/`Window_Close` |

## Running Atlas on the Pi

1. Install the Atlas middleware (V3.0) and its dependencies, CppMicroServices and WiringPi,
   following the middleware's own README.
2. Copy `Atlas_IoTDDL.xml` to the middleware's `ConfigurationFiles/Atlas_IoTDDL.xml` (exactly
   that name and folder).
3. From the middleware root: `cmake Main/ && make`, then `sudo ./Atlas` (GPIO needs root).

On start Atlas generates and compiles one bundle per service under
`Architecture/GeneratedServices/service/<ServiceName>/`. Each folder should end up with a
`lib<ServiceName>.so`; a folder with only `service.def` means that service failed to generate.
After changing the XML, delete the old service folders so they are rebuilt.

| Port | Use |
| --- | --- |
| UDP multicast `232.1.1.1:1235` | tweets announcing the thing, its entities and its services |
| TCP `6668` | service calls, one JSON call per connection |

## Calling a service

```json
{"Tweet Type":"Service call","Thing ID":"AT_BoarAirSensor","Space ID":"BoarSmartSpace",
 "Service Name":"Fan_On","Service Inputs":"(60)"}
```

`Service Inputs` is `"()"` for no inputs. The reply carries `"Status":"Successful"` or
`"Unsuccessful"` and the output in `"Service Result"` (`"No Output"` for `void` services). A
wrong Thing or Space ID, an unknown service or wrong arguments give `Unsuccessful`. Atlas pauses
about 3 s after each call, so space consecutive calls.

## Writing service code for Atlas

The service bodies are the Part One functions adapted to how Atlas generates code from the
`Service_Formula` of each service:

- `OutputDescription` becomes the name of the output variable, so it must be a valid C name,
  different from the input names. The body assigns it; Atlas returns it.
- Any line containing `return` or `//` is dropped, so bodies never use `return` and comments are
  written as `/* … */` on their own line.
- Every `"` in a body is written as `\"`, because each line is copied into a quoted string.
- Services share no code or memory: the DHT11 read is written out in each sensor service, and
  actuator state is shared through the `/tmp` files.

Atlas has no error status for a service body, so a DHT11 read that fails 3 times returns **-1**
with status `Successful`. The `Read_*` services return 0 if nothing has been set since boot.

## Demo IoT Application

`demoApp/atlas_demo.cpp`, opens one TCP connection to port 6668 per call, sends the JSON above
and prints the reply's status and result.

```bash
# build (MinGW-w64)
g++ -std=c++17 -O2 atlas_demo.cpp -o atlas_demo.exe -lws2_32

# run
atlas_demo.exe <Pi IP>
```

| Menu | Service | Input |
| --- | --- | --- |
| 1 | `Read_Temp` | 0 (Celsius) |
| 2 | `Fan_On` | speed 0–75 |
| 3 | `Set_Window` | angle 0–50 |
| 0 | exit | – |

Values outside the range are refused before sending. With no reply within 15 s, the call is
reported as an error.
