// Lab 4 Part One — service program for the single Raspberry Pi.
//
// Exposes every sensor read and actuator action as a named service and answers
// service calls over MQTT. All relationship logic (order-based, condition-based)
// lives in the Edge: this program only ever executes one service per call.
//
// Topics, prefix vss/boar/ :
//   services  device -> all   retained service catalogue, one vector per service
//   call      edge   -> device {"id":7,"service":"Read_Temp","inputs":[0]}
//   reply     device -> all    {"id":7,...,"status":"Successful","result":24}
//   status    device -> all    online / offline (LWT)

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

using namespace std::chrono_literals;

#include <mosquitto.h>
#include <nlohmann/json.hpp>
#include <wiringPi.h>
#include <stdlib.h>

using json = nlohmann::json;

// --- Pin configuration (BCM) ---
#define DHT_PIN    17
#define SERVO_PIN  18
#define FAN_PIN    13

// Both PWM channels share one clock and one range in wiringPi, so the servo's
// 50 Hz requirement fixes the fan's frequency too.
// Frequency = 19.2MHz / (PWM_CLOCK + PWM_RANGE)
#define PWM_CLOCK  192
#define PWM_RANGE  2000

// Servo calibration from test/servocal.c: 500 us is 90 deg clockwise, 1500 us
// straight, 2500 us 90 deg counter-clockwise. At 10 us per tick that is 200
// ticks for 180 deg of travel.
#define SERVO_TICKS_180  200

// The window is shut with the horn centred and opens counter-clockwise. Its
// linkage binds past 50 deg, so everything that drives GPIO18 clamps there.
#define SERVO_CLOSED_PWM 150
#define WINDOW_MAX_ANGLE 50

#define FAN_MAX_PCT 75

// The DHT11 fails a single read often enough to be a nuisance, and it needs
// about a second between conversions, so an immediate retry just fails again.
#define DHT_ATTEMPTS 3
#define DHT_RETRY_MS 1100

// Neither actuator can be read back: the servo has no position feedback, the
// fan has no tachometer, and wiringPi's PWM API is write-only. Both readers
// therefore report the last commanded value from these files. Atlas bundles
// cannot share memory, hence files rather than variables.
static const char* WINDOW_STATE_FILE = "/tmp/window_angle";
static const char* FAN_STATE_FILE = "/tmp/fan_speed";

static const std::string TOPIC_PREFIX = "vss/boar/";
static const std::string RPI_ID = "RPi-1";

std::atomic<bool> keep_running(true);

struct mosquitto* mosq = nullptr;

// Tracks delivery of the shutdown offline publish (see main()).
std::atomic<int> pending_mid{ -1 };
std::atomic<bool> mid_acked{ false };

// --- Captures the SIGNALS that end the program ---
void signal_handler(int signal) {
  if (signal == SIGINT || signal == SIGTERM) {
    keep_running = false;
  }
}

// Every service is self-contained. We don't want
// to initialize the GPIO more than needed
void gpio_setup() {
  static bool done = false;
  if (!done) {
    if (wiringPiSetupGpio() == -1) {
      std::cerr << "GPIO Initialization Error" << std::endl;
      exit(EXIT_FAILURE);
    }
    done = true;
  }
}

// --- Funtion that sets everything off when the program ends ---
void cleanup_gpio() {
  pwmWrite(FAN_PIN, 0);
  pwmWrite(SERVO_PIN, 0);
  delay(50);
  pinMode(FAN_PIN, INPUT);
  pinMode(SERVO_PIN, INPUT);
}

void pwm_setup() {
  pwmSetMode(PWM_MODE_MS);
  pwmSetClock(PWM_CLOCK);
  pwmSetRange(PWM_RANGE);
}

// --- Actuator state, shared by both readers ---

void write_state_int(const char* path, int value) {
  FILE* f = fopen(path, "w");
  if (f == nullptr) return;
  fprintf(f, "%d", value);
  fclose(f);
}

int read_state_int(const char* path, int max) {
  FILE* f = fopen(path, "r");
  if (f == nullptr) return 0;

  int value = 0;
  if (fscanf(f, "%d", &value) != 1) value = 0;
  fclose(f);

  if (value < 0) value = 0;
  if (value > max) value = max;
  return value;
}

// --- DHT11 (bit-banged, from test/motdhtservo.c) ---

// Attende un livello logico con timeout
int wait_level(int level, unsigned int timeout_us) {
  unsigned int start = micros();

  while (digitalRead(DHT_PIN) != level) {
    if ((unsigned int)(micros() - start) > timeout_us)
      return 0;
  }

  return 1;
}

// Restituisce 0 in caso di lettura valida. Temperatura in gradi Celsius interi,
// umidita' in punti percentuali interi: il DHT11 non ha parte decimale.
int read_dht11(int* temperature, int* humidity) {
  unsigned char data[5] = { 0 };

  pinMode(DHT_PIN, OUTPUT);
  digitalWrite(DHT_PIN, LOW);
  delay(20);

  pinMode(DHT_PIN, INPUT);
  pullUpDnControl(DHT_PIN, PUD_UP);

  if (!wait_level(HIGH, 100)) return -1;
  if (!wait_level(LOW, 100))  return -1;
  if (!wait_level(HIGH, 120)) return -1;
  if (!wait_level(LOW, 120))  return -1;

  for (int i = 0; i < 40; i++) {
    if (!wait_level(HIGH, 100))
      return -1;

    unsigned int start = micros();

    if (!wait_level(LOW, 120))
      return -1;

    unsigned int duration = micros() - start;

    data[i / 8] <<= 1;

    if (duration > 50)
      data[i / 8] |= 1;
  }

  unsigned char checksum =
    (data[0] + data[1] + data[2] + data[3]) & 0xFF;

  if (checksum != data[4])
    return -1;

  *humidity = data[0];
  *temperature = data[2];

  return 0;
}

// Ritenta la lettura: il DHT11 sbaglia spesso al primo colpo e vuole circa un
// secondo fra due conversioni, quindi fra un tentativo e l'altro si aspetta.
// Nel caso peggiore blocca ~2.3 s, dentro il timeout di 10 s dell'Edge.
int read_dht11_retry(int* temperature, int* humidity) {
  for (int attempt = 0; attempt < DHT_ATTEMPTS; attempt++) {
    if (attempt > 0) delay(DHT_RETRY_MS);

    if (read_dht11(temperature, humidity) == 0)
      return 0;
  }

  return -1;
}

// --- Service results ---
// status/description reuse Atlas's own vocabulary so that the Edge orchestrator
// and the Part Two demo application can apply identical relationship logic.

struct Result {
  bool ok;
  std::string description;
  json value;        // number, or null where Atlas would say "No Output"
};

Result success(json value = nullptr) {
  return { true, "Successful Service Call", value };
}

Result failure(const std::string& description) {
  return { false, description, nullptr };
}

// --- Services ---

Result svc_calibrate_sensor() {
  gpio_setup();

  // Priming read: the DHT11's first conversion after an idle period often fails,
  // so this is what an order-based "A THEN B" is meant to guard.
  int temperature, humidity;
  if (read_dht11_retry(&temperature, &humidity) != 0)
    return failure("Sensor read failed");

  return success(1);
}

Result svc_read_temp(int f_or_c) {
  gpio_setup();

  int temperature, humidity;
  if (read_dht11_retry(&temperature, &humidity) != 0)
    return failure("Sensor read failed");

  if (f_or_c == 1)
    return success(temperature * 9 / 5 + 32);

  return success(temperature);
}

Result svc_read_humidity() {
  gpio_setup();

  int temperature, humidity;
  if (read_dht11_retry(&temperature, &humidity) != 0)
    return failure("Sensor read failed");

  return success(humidity);
}

Result svc_fan_on(int speed) {
  gpio_setup();

  if (speed < 0) speed = 0;
  if (speed > FAN_MAX_PCT) speed = FAN_MAX_PCT;

  pinMode(FAN_PIN, PWM_OUTPUT);
  pwm_setup();
  pwmWrite(FAN_PIN, speed * PWM_RANGE / 100);

  write_state_int(FAN_STATE_FILE, speed);
  return success(speed);
}

Result svc_fan_off() {
  gpio_setup();

  pinMode(FAN_PIN, PWM_OUTPUT);
  pwm_setup();
  pwmWrite(FAN_PIN, 0);

  write_state_int(FAN_STATE_FILE, 0);
  return success();
}

Result svc_read_fan_speed() {
  return success(read_state_int(FAN_STATE_FILE, FAN_MAX_PCT));
}

// Derived from the same file as Read_Fan_Speed, so the two cannot disagree.
Result svc_read_fan_status() {
  return success(read_state_int(FAN_STATE_FILE, FAN_MAX_PCT) > 0 ? 1 : 0);
}

Result svc_set_window(int angle) {
  gpio_setup();

  if (angle < 0) angle = 0;
  if (angle > WINDOW_MAX_ANGLE) angle = WINDOW_MAX_ANGLE;

  pinMode(SERVO_PIN, PWM_OUTPUT);
  pwm_setup();
  pwmWrite(SERVO_PIN, SERVO_CLOSED_PWM + (angle * SERVO_TICKS_180) / 180);

  write_state_int(WINDOW_STATE_FILE, angle);
  return success(angle);
}

Result svc_window_close() {
  gpio_setup();

  pinMode(SERVO_PIN, PWM_OUTPUT);
  pwm_setup();
  pwmWrite(SERVO_PIN, SERVO_CLOSED_PWM);

  write_state_int(WINDOW_STATE_FILE, 0);
  return success();
}

Result svc_read_window_position() {
  return success(read_state_int(WINDOW_STATE_FILE, WINDOW_MAX_ANGLE));
}

// --- Service catalogue ---
// One row per advertised vector: (RPi id, service name, #inputs, input names).

struct ServiceSpec {
  const char* entity;
  const char* name;
  std::vector<const char*> inputs;
  const char* output;
};

const std::vector<ServiceSpec> CATALOGUE = {
  { "ClimateSensor", "Calibrate_Sensor",{},         "int" },
  { "ClimateSensor", "Read_Temp",{ "F_or_C" }, "int" },
  { "ClimateSensor", "Read_Humidity",{},         "int" },
  { "Fan",           "Fan_On",{ "speed" },  "int" },
  { "Fan",           "Fan_Off",{},         "void" },
  { "Fan",           "Read_Fan_Speed",{},         "int" },
  { "Fan",           "Read_Fan_Status",{},         "int" },
  { "Window",        "Set_Window",{ "angle" },  "int" },
  { "Window",        "Window_Close",{},         "void" },
  { "Window",        "Read_Window_Position",{},         "int" },
};

Result dispatch(const std::string& name, const std::vector<int>& inputs) {
  const ServiceSpec* spec = nullptr;
  for (const auto& s : CATALOGUE) {
    if (name == s.name) {
      spec = &s;
      break;
    }
  }

  if (spec == nullptr)
    return failure("Unknown Service");

  if (inputs.size() != spec->inputs.size())
    return failure("Incorrect service arguments");

  if (name == "Calibrate_Sensor")     return svc_calibrate_sensor();
  if (name == "Read_Temp")            return svc_read_temp(inputs[0]);
  if (name == "Read_Humidity")        return svc_read_humidity();
  if (name == "Fan_On")               return svc_fan_on(inputs[0]);
  if (name == "Fan_Off")              return svc_fan_off();
  if (name == "Read_Fan_Speed")       return svc_read_fan_speed();
  if (name == "Read_Fan_Status")      return svc_read_fan_status();
  if (name == "Set_Window")           return svc_set_window(inputs[0]);
  if (name == "Window_Close")         return svc_window_close();
  if (name == "Read_Window_Position") return svc_read_window_position();

  return failure("Unknown Service");
}

// --- MQTT ---

void mqtt_publish(const std::string& subtopic, const json& payload, int qos, bool retain) {
  std::string body = payload.dump();
  std::string topic = TOPIC_PREFIX + subtopic;
  mosquitto_publish(mosq, nullptr, topic.c_str(), static_cast<int>(body.size()), body.c_str(), qos, retain);
}

void publish_status(const char* status) {
  json payload;
  payload["status"] = status;
  mqtt_publish("status", payload, 1, true);
  std::cout << "STATUS status=" << status << std::endl;
}

// Retained, so a dashboard opened at any moment immediately receives the
// service vectors instead of waiting for the next advertisement.
void publish_catalogue() {
  json services = json::array();

  for (const auto& spec : CATALOGUE) {
    json names = json::array();
    for (const char* input : spec.inputs) names.push_back(input);

    json item;
    item["rpi"] = RPI_ID;
    item["entity"] = spec.entity;
    item["name"] = spec.name;
    item["ninputs"] = spec.inputs.size();
    item["inputs"] = names;
    item["output"] = spec.output;
    services.push_back(item);
  }

  json payload;
  payload["thing"] = RPI_ID;
  payload["services"] = services;
  mqtt_publish("services", payload, 1, true);
  std::cout << "SERVICES published (" << CATALOGUE.size() << ")" << std::endl;
}

void publish_reply(long id, const std::string& service, const Result& result) {
  json payload;
  payload["id"] = id;
  payload["service"] = service;
  payload["status"] = result.ok ? "Successful" : "Unsuccessful";
  payload["description"] = result.description;
  payload["result"] = result.value;
  mqtt_publish("reply", payload, 1, false);
}

void on_connect(struct mosquitto* m, void* obj, int rc) {
  if (rc != 0) {
    std::cout << "MQTT connect failed: " << mosquitto_connack_string(rc) << std::endl;
    return;
  }
  std::cout << "MQTT connected" << std::endl;

  std::string sub = TOPIC_PREFIX + "call";
  mosquitto_subscribe(m, nullptr, sub.c_str(), 1);

  publish_status("online");
  publish_catalogue();
}

void on_publish(struct mosquitto* m, void* obj, int mid) {
  if (mid == pending_mid.load()) mid_acked = true;
}

// Runs on the libmosquitto network thread. A DHT11 read blocks it for ~25 ms,
// which is well inside the keepalive and acceptable at human call rates.
void on_message(struct mosquitto* m, void* obj, const struct mosquitto_message* msg) {
  if (msg->payloadlen <= 0 || msg->payload == nullptr) return;

  std::string topic(msg->topic);
  if (topic != TOPIC_PREFIX + "call") return;

  std::string payload(static_cast<char*>(msg->payload), msg->payloadlen);

  json body;
  try {
    body = json::parse(payload);
  }
  catch (const json::parse_error&) {
    std::cout << "IGNORED invalid JSON on " << topic << std::endl;
    return;
  }

  std::cout << "CALL " << payload << std::endl;

  long id = body.value("id", static_cast<long>(-1));

  if (!body.contains("service") || !body["service"].is_string()) {
    publish_reply(id, "", failure("Unknown Service"));
    return;
  }
  std::string service = body["service"].get<std::string>();

  std::vector<int> inputs;
  if (body.contains("inputs")) {
    if (!body["inputs"].is_array()) {
      publish_reply(id, service, failure("Incorrect service arguments"));
      return;
    }
    for (const auto& value : body["inputs"]) {
      if (!value.is_number_integer()) {
        publish_reply(id, service, failure("Incorrect service arguments"));
        return;
      }
      inputs.push_back(value.get<int>());
    }
  }

  Result result = dispatch(service, inputs);
  publish_reply(id, service, result);
  std::cout << "REPLY " << service << " " << result.description << std::endl;
}

int main(int argc, char** argv) {
  const char* host = (argc > 1) ? argv[1] : "localhost";
  int port = (argc > 2) ? std::atoi(argv[2]) : 1883;

  gpio_setup();
  pinMode(FAN_PIN, PWM_OUTPUT);
  pinMode(SERVO_PIN, PWM_OUTPUT);
  pwm_setup();
  pwmWrite(FAN_PIN, 0);
  pwmWrite(SERVO_PIN, 0);

  std::signal(SIGINT, signal_handler);
  std::signal(SIGTERM, signal_handler);

  mosquitto_lib_init();
  mosq = mosquitto_new(nullptr, true, nullptr);

  json will_payload;
  will_payload["status"] = "offline";
  std::string will_body = will_payload.dump();
  std::string status_topic = TOPIC_PREFIX + "status";
  mosquitto_will_set(mosq, status_topic.c_str(), static_cast<int>(will_body.size()), will_body.c_str(), 1, true);

  mosquitto_connect_callback_set(mosq, on_connect);
  mosquitto_message_callback_set(mosq, on_message);
  mosquitto_publish_callback_set(mosq, on_publish);
  mosquitto_reconnect_delay_set(mosq, 1, 30, true);

  if (mosquitto_connect(mosq, host, port, 60) != MOSQ_ERR_SUCCESS) {
    std::cerr << "Unable to connect to MQTT broker at " << host << ":" << port << std::endl;
    return 1;
  }
  mosquitto_loop_start(mosq);

  // Here, unlike Lab3, there are no buttons to
  // actively wait for, so the while is empty
  while (keep_running) {
    std::this_thread::sleep_for(100ms);
  }

  int offline_mid = -1;
  json offline_payload;
  offline_payload["status"] = "offline";
  std::string offline_body = offline_payload.dump();
  mosquitto_publish(mosq, &offline_mid, status_topic.c_str(), static_cast<int>(offline_body.size()), offline_body.c_str(), 1, true);
  std::cout << "STATUS status=offline" << std::endl;

  // Wait for the PUBACK (bounded) instead of assuming send order.
  pending_mid = offline_mid;
  auto deadline = std::chrono::steady_clock::now() + 1s;
  while (!mid_acked.load() && std::chrono::steady_clock::now() < deadline) {
    std::this_thread::sleep_for(10ms);
  }

  mosquitto_disconnect(mosq);
  cleanup_gpio();

  mosquitto_loop_stop(mosq, true);
  mosquitto_destroy(mosq);
  mosquitto_lib_cleanup();

  return 0;
}
