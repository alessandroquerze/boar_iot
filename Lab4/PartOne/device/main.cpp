// Lab 4 Part One — service program for the single Raspberry Pi.
//
// Exposes every sensor read and actuator action as a named service and answers
// service calls over MQTT. All relationship logic (order-based, condition-based)
// lives in the Edge: this program only ever executes one service per call.
//
// Topics, prefix vss/boar/ :
//   services  device -> all   retained service catalogue, one vector per service
//   call      edge   -> device {"id":7,"service":"Read_Temp","inputs":[0]}
//   reply     device -> all    {"id":7,"Read_Temp","status":"Successful","result":24}
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
#include <mosquitto.h>
#include <nlohmann/json.hpp>
#include <stdlib.h>
#include <wiringPi.h>

using namespace std::chrono_literals;
using json = nlohmann::json;
using std::string;
using std::vector;
using std::cout;
using std::cerr;
using std::endl;

// --- Pin configuration (BCM) ---
#define DHT_PIN 17
#define SERVO_PIN 18
#define FAN_PIN 13

// Both PWM channels share one clock and one range in wiringPi, so the servo's
// 50 Hz requirement fixes the fan's frequency too.
// Frequency = 19.2MHz / (PWM_CLOCK + PWM_RANGE)
#define PWM_CLOCK 192
#define PWM_RANGE 2000

// Servo calibration from test/servocal.c: 500 us is 90 deg clockwise, 1500 us
// straight, 2500 us 90 deg counter-clockwise. At 10 us per tick that is 200
// ticks for 180 deg of travel.
#define SERVO_TICKS_180 200

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

static const string TOPIC_PREFIX = "vss/boar/";
static const string RPI_ID = "RPi-1";

std::atomic<bool> keep_running(true);

struct mosquitto* mosq = nullptr;

// Tracks delivery of the shutdown offline publish (see main()).
std::atomic<int> pending_mid{ -1 };
std::atomic<bool> mid_acked{ false };

// --- Captures the SIGNALS that end the program ---
void signal_handler(int signal) {
  if (signal == SIGINT || signal == SIGTERM)
    keep_running = false;
}

// Every service is self-contained. We don't want
// to initialize the GPIO more than needed
void gpio_setup() {
  static bool done = false;
  if (!done) {
    if (wiringPiSetupGpio() == -1) {
      cerr << "GPIO Initialization Error" << endl;
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

  if (value < 0)    value = 0;
  if (value > max)  value = max;
  return value;
}

// --- DHT11 (bit-banged, from test/motdhtservo.c) ---

// Waits a level (HIGH or LOW) within a certain timeout (in us)
bool wait_level(int level, unsigned int timeout_us) {
  unsigned int start = micros();
  while (digitalRead(DHT_PIN) != level) {
    if ((unsigned int)(micros() - start) > timeout_us)  return false;
  }
  return true;
}

// Returns 0 if the reading was successful. Both temperature and humidity (the second
// representing a percentage) are integers, DHT11 doesn't provide decimal precision (in most of the cases)
int read_dht11(int* temperature, int* humidity) {
  // The RPi sends a LOW signal to the sensor for 20ms to wake it up
  pinMode(DHT_PIN, OUTPUT);
  digitalWrite(DHT_PIN, LOW);
  delay(20);

  /* Now the RPi is listening for the acknowledgement signal from the sensor.
   * It has to give this sequence of signals:
   *   1. LOW for 80us
   *   2. HIGH for 80us
   *
   * If the signal is not exactly in this sequence (or if no signal is received at all),
   * it returns -1 and aborts the reading.
   */
  pinMode(DHT_PIN, INPUT);
  pullUpDnControl(DHT_PIN, PUD_UP);
  if (!wait_level(HIGH, 100)) return -1;
  if (!wait_level(LOW, 100))  return -1;
  if (!wait_level(HIGH, 120)) return -1;
  if (!wait_level(LOW, 120))  return -1;

  // Here starts the reading of 40 bit of data. The first 2 bytes
  // are humidity, the following 2 are temperature
  unsigned char data[5] = { 0 };
  for (int i = 0; i < 40; i++) {
    // If the signal doesn't arrive, return -1
    if (!wait_level(HIGH, 100)) return -1;
    unsigned int start = micros();
    if (!wait_level(LOW, 120))  return -1;

    // Here we calculate the duration of the signal: if the signal was greater than
    // 50us than it would represent a '1', whereas if it was less than 50us it's a '0'
    unsigned int duration = micros() - start;
    data[i / 8] = data[i / 8] << 1;   // Left shift of 1 bit
    if (duration > 50)
      data[i / 8] = data[i / 8] | 1;  // OR between the last bit of data and '1'
  }

  // Checksum checking (the fifth byte is the checksum)
  unsigned char checksum = (data[0] + data[1] + data[2] + data[3]) & 0xFF;
  if (checksum != data[4])  return -1;

  // We retrieve the integer part
  *humidity = data[0];
  *temperature = data[2];

  return 0;
}

// The function retries the reading, the first ones can be erroneous
bool read_dht11_retry(int* temperature, int* humidity) {
  for (int attempt = 0; attempt < DHT_ATTEMPTS; attempt++) {
    if (read_dht11(temperature, humidity) == 0) return true;
    delay(DHT_RETRY_MS);
  }
  return false;
}

// --- Service results ---
// status/description reuse Atlas's own vocabulary so that the Edge orchestrator
// and the Part Two demo application can apply identical relationship logic.

struct Result {
  bool ok;
  string description;
  json value; // number, or null where Atlas would say "No Output"
};

Result success(json value = nullptr) {
  return { true, "Successful Service Call", value };
}

Result failure(const string& description) {
  return { false, description, nullptr };
}

// --- Services ---

Result svc_calibrate_sensor() {
  gpio_setup();

  // Priming read: the DHT11's first conversion after an idle period often fails,
  // so this is what an order-based "A THEN B" is meant to guard.
  int temperature, humidity;
  bool read_ok = read_dht11_retry(&temperature, &humidity);
  return read_ok ? success(1) : failure("Sensor read failed");
}

Result svc_read_temp(int f_or_c) {
  gpio_setup();
  int temperature, humidity;
  if (!read_dht11_retry(&temperature, &humidity))
    return failure("Sensor read failed");

  if (f_or_c == 1) temperature = temperature * 9 / 5 + 32;
  return success(temperature);
}

Result svc_read_humidity() {
  gpio_setup();
  int temperature, humidity;
  int read_ok = read_dht11_retry(&temperature, &humidity);
  return read_ok ? success(humidity) : failure("Sensor read failed");
}

Result svc_fan_on(int speed) {
  gpio_setup();
  if (speed < 0)            speed = 0;
  if (speed > FAN_MAX_PCT)  speed = FAN_MAX_PCT;

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
  if (angle < 0)                angle = 0;
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
// One row per service: (RPi id, service name, #inputs, input names).
struct ServiceSpec {
  const char* entity;
  const char* name;
  vector<const char*> inputs;
  const char* output;
};

// We built a catalogue so it's easier to edit the services we offer
const vector<ServiceSpec> CATALOGUE = {
    { "ClimateSensor", "Calibrate_Sensor",{}, "int" },
    { "ClimateSensor", "Read_Temp",{ "F_or_C" }, "int" },
    { "ClimateSensor", "Read_Humidity",{}, "int" },
    { "Fan", "Fan_On",{ "speed" }, "int" },
    { "Fan", "Fan_Off",{}, "void" },
    { "Fan", "Read_Fan_Speed",{}, "int" },
    { "Fan", "Read_Fan_Status",{}, "int" },
    { "Window", "Set_Window",{ "angle" }, "int" },
    { "Window", "Window_Close",{}, "void" },
    { "Window", "Read_Window_Position",{}, "int" },
};

// This function is called when a service is needed, and it chooses the correct "svc" function to call
Result dispatch(const string& name, const vector<int>& inputs) {
  const ServiceSpec* spec = nullptr;
  for (const ServiceSpec& s : CATALOGUE) {
    if (name == s.name) {
      spec = &s;
      break;
    }
  }

  if (spec == nullptr)  return failure("Unknown Service");

  if (inputs.size() != spec->inputs.size())
    return failure("Incorrect number of input arguments for this service");

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

void mqtt_publish(const string& subtopic, const json& payload, int qos, bool retain) {
  string body = payload.dump();
  string topic = TOPIC_PREFIX + subtopic;
  mosquitto_publish(mosq, nullptr, topic.c_str(), static_cast<int>(body.size()), body.c_str(), qos, retain);
}

void publish_status(const char* status) {
  json payload;
  payload["status"] = status;
  mqtt_publish("status", payload, 1, true);
  cout << "STATUS status=" << status << endl;
}

void publish_catalogue() {
  json services = json::array();

  for (const ServiceSpec& spec : CATALOGUE) {
    json names = json::array();
    for (const char* input : spec.inputs)
      names.push_back(input);

    json item;
    item["rpi"] = RPI_ID;
    item["entity"] = spec.entity;
    item["name"] = spec.name;
    item["ninputs"] = spec.inputs.size();
    item["inputs"] = names;
    item["output"] = spec.output;
    services.push_back(item);
  }

  // QoS is 1, so the state is retained for the user to know the status at any given moment it connects
  json payload;
  payload["thing"] = RPI_ID;
  payload["services"] = services;
  mqtt_publish("services", payload, 1, true);
  cout << CATALOGUE.size() << " SERVICES published" << endl;
}

void publish_reply(long id, const string& service, const Result& result) {
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
    cout << "MQTT connect failed: " << mosquitto_connack_string(rc) << endl;
    return;
  }
  cout << "MQTT connected" << endl;

  string sub = TOPIC_PREFIX + "call";
  mosquitto_subscribe(m, nullptr, sub.c_str(), 1);

  // Publish the status ONLINE
  json payload;
  payload["status"] = "online";
  mqtt_publish("status", payload, 1, true);
  cout << "STATUS status=" << status << endl;

  // We publish throuh an mqtt_publish() all the services we offer
  publish_catalogue();
}

void on_publish(struct mosquitto* m, void* obj, int mid) {
  if (mid == pending_mid.load())
    mid_acked = true;
}

void on_message(struct mosquitto* m, void* obj, const struct mosquitto_message* msg) {
  if (msg->payloadlen <= 0 || msg->payload == nullptr)  return;

  string topic(msg->topic);
  if (topic != TOPIC_PREFIX + "call") return;

  string payload(static_cast<char*>(msg->payload), msg->payloadlen);

  json body;
  try {
    body = json::parse(payload);
  }
  catch (const json::parse_error&) {
    cerr << "IGNORED invalid JSON on " << topic << endl;
    return;
  }

  cout << "CALL " << payload << endl;

  long id = body.value("id", -1L);

  if (!body.contains("service") || !body["service"].is_string()) {
    publish_reply(id, "", failure("Unknown Service"));
    return;
  }
  string service = body["service"].get<string>();

  vector<int> inputs;
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

  // Considering the increased amount of service in comparison with Lab3 (and for scalability reasons),
  // we preferred to use a dispatch function that handles it. This way the code is more readable and
  // the on_message() function stays the same despite changing the services
  Result result = dispatch(service, inputs);
  publish_reply(id, service, result);
  cout << "REPLY " << service << " " << result.description << endl;
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
  string will_body = will_payload.dump();
  string status_topic = TOPIC_PREFIX + "status";
  mosquitto_will_set(mosq, status_topic.c_str(), static_cast<int>(will_body.size()), will_body.c_str(), 1, true);

  mosquitto_connect_callback_set(mosq, on_connect);
  mosquitto_message_callback_set(mosq, on_message);
  mosquitto_publish_callback_set(mosq, on_publish);
  mosquitto_reconnect_delay_set(mosq, 1, 30, true);

  if (mosquitto_connect(mosq, host, port, 60) != MOSQ_ERR_SUCCESS) {
    cerr << "Unable to connect to MQTT broker at " << host << ":" << port << endl;
    return 1;
  }
  mosquitto_loop_start(mosq);

  // Here, unlike Lab3, there are no buttons to actively wait for, so the while is empty
  while (keep_running) {
    std::this_thread::sleep_for(100ms);
  }

  int offline_mid = -1;
  json offline_payload;
  offline_payload["status"] = "offline";
  string offline_body = offline_payload.dump();
  mosquitto_publish(mosq, &offline_mid, status_topic.c_str(), static_cast<int>(offline_body.size()), offline_body.c_str(), 1, true);
  cout << "STATUS status=offline" << endl;

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