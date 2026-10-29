#include <algorithm>
#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <iostream>
#include <mutex>
#include <numeric>
#include <string>
#include <thread>
#include <vector>
#include <deque>

using namespace std::chrono_literals;

#include <mosquitto.h>
#include <nlohmann/json.hpp>
#include <wiringPi.h>

using json = nlohmann::json;

// --- Pin configuration ---
#define LED_RED   17
#define LED_GREEN 27
#define BTN_MODE  23
#define BTN_TAP   24
#define SPEAKER   20

static const std::string TOPIC_PREFIX = "metronome/boar/";
constexpr long MAX_BPM = 400;

// --- Metronome states ---
enum class Mode { PLAY, LEARN };
std::atomic<bool> keep_running(true);

Mode current_mode{ Mode::PLAY };
size_t current_bpm = 60;

// Tracking of the minimum and maximum BPM values
size_t min_bpm = current_bpm;
size_t max_bpm = current_bpm;
size_t beat_seq = 0;

// Vector to store tap timestamps during Learn Mode
std::deque<std::chrono::steady_clock::time_point> timestamps;
size_t tap_times = 0;
size_t changed_bpm = 1;

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

// --- Funtion that sets everything off when the program ends ---
void cleanup_gpio() {
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(SPEAKER, LOW);
}

void mqtt_publish(const std::string& subtopic, const json& payload, int qos, bool retain) {
  std::string body = payload.dump();
  std::string topic = TOPIC_PREFIX + subtopic;
  mosquitto_publish(mosq, nullptr, topic.c_str(), static_cast<int>(body.size()), body.c_str(), qos, retain);
}

void publish_state_bpm(size_t bpm) {
  mqtt_publish("state/bpm", { { "bpm", bpm } }, 1, true);
  std::cout << "STATE state/bpm bpm=" << bpm << std::endl;
}

void publish_state_mode(Mode mode) {
  std::string mode_str = (mode == Mode::PLAY) ? "play" : "learn";
  mqtt_publish("state/mode", { { "mode", mode_str } }, 1, true);
  std::cout << "STATE state/mode mode=" << mode_str << std::endl;
}

void publish_state_min(size_t min) {
  mqtt_publish("state/min", { { "min", min } }, 1, true);
  std::cout << "STATE state/min min=" << min << std::endl;
}

void publish_state_max(size_t max) {
  mqtt_publish("state/max", { { "max", max } }, 1, true);
  std::cout << "STATE state/max max=" << max << std::endl;
}

void publish_status(const char* status) {
  mqtt_publish("status", { {"status", status} }, 1, true);
  std::cout << "STATUS status=" << status << std::endl;
}

// QoS 0: high-rate ticks where losing one is harmless, since the next
// beat/tap supersedes it immediately.
void publish_event_beat(size_t bpm, size_t seq) {
  mqtt_publish("event/beat", { { "bpm", bpm },{ "seq", seq } }, 0, false);
}

void publish_event_tap(size_t count) {
  mqtt_publish("event/tap", { { "count", count } }, 0, false);
}

void update_bpm_bounds(size_t new_bpm) {
  if (new_bpm == 0) return;

  // Update Min and Max BPM
  if (new_bpm < min_bpm) {
    min_bpm = new_bpm;
    publish_state_min(new_bpm);
  }

  if (new_bpm > max_bpm) {
    max_bpm = new_bpm;
    publish_state_max(new_bpm);
  }
}

void set_bpm(size_t bpm) {
  current_bpm = bpm;
  changed_bpm = 1;
  update_bpm_bounds(bpm);
  publish_state_bpm(bpm);
}

// FARLO TORNARE A CONTROLLARE LA MEDIA DEGLI ULTIMI 4!!!
void calculate_bpm() {
  // At least 4 taps required for the measurement to be considered valid
  if (tap_times < 4) {
    timestamps.clear();
    tap_times = 0;
    return;
  }

  // Calculate the time differences between consecutive taps
  std::vector<double> intervals_ms;
  for (size_t i = 1; i < 4; ++i) {
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(
      timestamps[i] - timestamps[i - 1]
    ).count();
    intervals_ms.push_back(static_cast<double>(diff));
  }

  // Calculate the average of the intervals
  double sum = std::accumulate(intervals_ms.begin(), intervals_ms.end(), 0.0);
  double avg_interval_ms = sum / 3;

  if (avg_interval_ms > 0) {
    size_t calculated_bpm = static_cast<size_t>(60000.0 / avg_interval_ms);
    current_bpm = calculated_bpm;
    changed_bpm = 1;
    update_bpm_bounds(calculated_bpm);
  }
  timestamps.clear();
}

void enter_learn() {
  current_mode = Mode::LEARN;
  digitalWrite(LED_RED, HIGH);
  timestamps.clear();
  tap_times = 0;
  publish_state_mode(Mode::LEARN);
}

void enter_play() {
  if (current_mode == Mode::LEARN) {
    calculate_bpm();
  }
  digitalWrite(LED_RED, LOW);
  current_mode = Mode::PLAY;
  publish_state_mode(Mode::PLAY);
}

// --- Green LED Thread (Play Mode) ---
void play_thread_func() {
  auto beat_duration = 0;
  auto pulse_duration = 0;
  auto off_duration = 0;

  while (keep_running) {
    if (current_mode == Mode::PLAY && current_bpm > 0) {
      if (changed_bpm == 1) {
        // Calculate the duration of a full cycle (ON + OFF) in ms
        beat_duration = 60000 / current_bpm;

        // Turn on the green LED for half the period (or max 100ms)
        pulse_duration = std::min(beat_duration / 2, 100);
        off_duration = beat_duration - pulse_duration;
        changed_bpm = 0;
      }

      digitalWrite(LED_GREEN, HIGH);
      digitalWrite(SPEAKER, HIGH);
      beat_seq++;
      publish_event_beat(current_bpm, beat_seq);
      std::this_thread::sleep_for(std::chrono::milliseconds(pulse_duration));
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(SPEAKER, LOW);
      std::this_thread::sleep_for(std::chrono::milliseconds(off_duration));
    }
    else {
      // Turn off the green LED and speaker if we are in LEARN mode or BPM = 0
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(SPEAKER, LOW);
      std::this_thread::sleep_for(50ms);
    }
  }
}

void on_connect(struct mosquitto* m, void* obj, int rc) {
  if (rc != 0) {
    std::cout << "MQTT connect failed: " << mosquitto_connack_string(rc) << std::endl;
    return;
  }
  std::cout << "MQTT connected" << std::endl;

  std::string sub = TOPIC_PREFIX + "cmd/#";
  mosquitto_subscribe(m, nullptr, sub.c_str(), 1);

  publish_status("online");
  publish_state_bpm(current_bpm);
  publish_state_mode(current_mode);
  publish_state_min(min_bpm);
  publish_state_max(max_bpm);
}

void on_publish(struct mosquitto* m, void* obj, int mid) {
  if (mid == pending_mid.load()) mid_acked = true;
}

void on_message(struct mosquitto* m, void* obj, const struct mosquitto_message* msg) {
  if (msg->payloadlen <= 0 || msg->payload == nullptr) return;

  std::string topic(msg->topic);
  std::string payload(static_cast<char*>(msg->payload), msg->payloadlen);

  json body;
  try {
    body = json::parse(payload);
  }
  catch (const json::parse_error&) {
    std::cout << "IGNORED invalid JSON on " << topic << std::endl;
    return;
  }

  std::cout << "CMD " << topic << " " << payload << std::endl;

  if (topic == TOPIC_PREFIX + "cmd/set_bpm") {
    if (!body.contains("bpm") || !body["bpm"].is_number_integer()) {
      std::cout << "IGNORED cmd/set_bpm: missing/invalid 'bpm'" << std::endl;
      return;
    }
    long bpm = body["bpm"].get<long>();
    if (bpm < 0 || bpm > MAX_BPM) {
      std::cout << "IGNORED cmd/set_bpm: bpm out of range " << bpm << std::endl;
      return;
    }
    set_bpm(static_cast<size_t>(bpm));
  }
  else if (topic == TOPIC_PREFIX + "cmd/set_mode") {
    if (!body.contains("mode") || !body["mode"].is_string()) {
      std::cout << "IGNORED cmd/set_mode: missing/invalid 'mode'" << std::endl;
      return;
    }
    std::string mode = body["mode"].get<std::string>();
    if (mode == "play") {
      enter_play();
    }
    else if (mode == "learn") {
      enter_learn();
    }
    else {
      std::cout << "IGNORED cmd/set_mode: unknown mode '" << mode << "'" << std::endl;
    }
  }
  else if (topic == TOPIC_PREFIX + "cmd/reset_min") {
    if (!body.contains("reset") || !body["reset"].is_boolean() || !body["reset"].get<bool>()) {
      std::cout << "IGNORED cmd/reset_min: expected {'reset': true}" << std::endl;
      return;
    }
    min_bpm = current_bpm;
    publish_state_min(min_bpm);
  }
  else if (topic == TOPIC_PREFIX + "cmd/reset_max") {
    if (!body.contains("reset") || !body["reset"].is_boolean() || !body["reset"].get<bool>()) {
      std::cout << "IGNORED cmd/reset_max: expected {'reset': true}" << std::endl;
      return;
    }
    max_bpm = current_bpm;
    publish_state_max(max_bpm);
  }
}

int main(int argc, char** argv) {
  const char* host = (argc > 1) ? argv[1] : "localhost";
  int port = (argc > 2) ? std::atoi(argv[2]) : 1883;

  wiringPiSetupGpio();
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(SPEAKER, OUTPUT);
  pinMode(BTN_MODE, INPUT);
  pinMode(BTN_TAP, INPUT);
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(SPEAKER, LOW);

  std::signal(SIGINT, signal_handler);
  std::signal(SIGTERM, signal_handler);

  mosquitto_lib_init();
  mosq = mosquitto_new(nullptr, true, nullptr);

  // LWT must be set before connect: an ungraceful disconnect (crash, network
  // loss) makes the broker publish this on our behalf.
  json will_payload = { { "status", "offline" } };
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

  std::thread play_thread(play_thread_func);

  bool prev_btn_mode = LOW;
  bool prev_btn_tap = LOW;

  // --- Main Loop (Button Polling) ---
  while (keep_running) {
    bool curr_btn_mode = digitalRead(BTN_MODE);
    bool curr_btn_tap = digitalRead(BTN_TAP);

    if (curr_btn_mode == HIGH && prev_btn_mode == LOW) {
      if (current_mode == Mode::PLAY) {
        std::cout << "MODE BUTTON PRESSED: SWITCHING TO LEARN MODE..." << std::endl;
        enter_learn();
      }
      else {
        std::cout << "MODE BUTTON PRESSED: SWITCHING TO PLAY MODE" << std::endl;
        enter_play();
      }
    }

    if (current_mode == Mode::LEARN && curr_btn_tap == HIGH && prev_btn_tap == LOW) {
      if (tap_times >= 4) {
        timestamps.pop_front();
      }
      timestamps.push_back(std::chrono::steady_clock::now());
      tap_times++;
      printf("BUTTON TAP PRESSED\n");

      digitalWrite(LED_RED, LOW);
      std::this_thread::sleep_for(100ms);
      digitalWrite(LED_RED, HIGH);
      publish_event_tap(tap_times);
    }

    prev_btn_mode = curr_btn_mode;
    prev_btn_tap = curr_btn_tap;

    std::this_thread::sleep_for(15ms);
  }

  play_thread.join();

  int offline_mid = -1;
  json offline_payload = { { "status", "offline" } };
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
