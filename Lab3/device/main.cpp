// Metronome Thing - MQTT device.
// See device/CMakeLists.txt for build/run instructions.

#include <algorithm>
#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <iostream>
#include <numeric>
#include <string>
#include <thread>
#include <vector>

using namespace std::chrono_literals;

#include <mosquitto.h>
#include <nlohmann/json.hpp>
#include <wiringPi.h>

using json = nlohmann::json;

#define LED_RED   17
#define LED_GREEN 27
#define BTN_MODE  23
#define BTN_TAP   24
#define SPEAKER   20

static const std::string TOPIC_PREFIX = "metronome/boar/";
constexpr long MAX_BPM = 400;

enum class Mode { PLAY, LEARN };

std::atomic<bool> keep_running{ true };

void signal_handler(int signal) {
  if (signal == SIGINT || signal == SIGTERM) {
    // Only flip the flag; offline publish and GPIO cleanup happen after
    // the main loop exits, not inside the handler.
    keep_running = false;
  }
}

void cleanup_gpio() {
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(SPEAKER, LOW);
}

// Atomics: current_bpm/current_mode/min_bpm/max_bpm/beat_seq are read by the
// play thread and on_connect, so plain globals would not be safe for those.
std::atomic<Mode> current_mode{ Mode::PLAY };
std::atomic<size_t> current_bpm{ 0 };
std::atomic<size_t> min_bpm{ 0 };
std::atomic<size_t> max_bpm{ 0 };
std::atomic<size_t> beat_seq{ 0 };

// Only ever touched from the main thread (button loop + drained pending_*
// requests), so no synchronization needed.
std::vector<std::chrono::steady_clock::time_point> tap_times;

struct mosquitto* mosq = nullptr;

// on_message (libmosquitto thread) only writes these; the main loop drains
// them with exchange() and calls the real functions, keeping every state
// change and every tap_times access on the main thread.
enum class PendingMode { NONE, PLAY, LEARN };
std::atomic<long> pending_bpm{ -1 };
std::atomic<PendingMode> pending_mode{ PendingMode::NONE };
std::atomic<bool> pending_reset_min{ false };
std::atomic<bool> pending_reset_max{ false };

// Tracks delivery of the shutdown offline publish (see main()).
std::atomic<int> pending_mid{ -1 };
std::atomic<bool> mid_acked{ false };

void mqtt_publish(const std::string& subtopic, const json& payload, int qos, bool retain) {
  std::string body = payload.dump();
  std::string topic = TOPIC_PREFIX + subtopic;
  mosquitto_publish(mosq, nullptr, topic.c_str(), static_cast<int>(body.size()), body.c_str(), qos, retain);
}

void publish_state_bpm(size_t bpm) {
  mqtt_publish("state/bpm", { {"bpm", bpm} }, 1, true);
  std::cout << "STATE state/bpm bpm=" << bpm << std::endl;
}

void publish_state_mode(Mode mode) {
  std::string mode_str = (mode == Mode::PLAY) ? "play" : "learn";
  mqtt_publish("state/mode", { {"mode", mode_str} }, 1, true);
  std::cout << "STATE state/mode mode=" << mode_str << std::endl;
}

void publish_state_min(size_t min) {
  mqtt_publish("state/min", { {"min", min} }, 1, true);
  std::cout << "STATE state/min min=" << min << std::endl;
}

void publish_state_max(size_t max) {
  mqtt_publish("state/max", { {"max", max} }, 1, true);
  std::cout << "STATE state/max max=" << max << std::endl;
}

void publish_status(const char* status) {
  mqtt_publish("status", { {"status", status} }, 1, true);
  std::cout << "STATUS status=" << status << std::endl;
}

void publish_all_state() {
  publish_state_bpm(current_bpm.load());
  publish_state_mode(current_mode.load());
  publish_state_min(min_bpm.load());
  publish_state_max(max_bpm.load());
}

// QoS 0: high-rate ticks where losing one is harmless, since the next
// beat/tap supersedes it immediately.
void publish_event_beat(size_t bpm, size_t seq) {
  mqtt_publish("event/beat", { {"bpm", bpm}, {"seq", seq} }, 0, false);
}

void publish_event_tap(size_t count) {
  mqtt_publish("event/tap", { {"count", count} }, 0, false);
}

void update_bpm_bounds(size_t new_bpm) {
  if (new_bpm == 0) return;

  // Main thread is the only writer now, so a plain load/compare/store
  // replaces the old CAS loop.
  size_t cur_min = min_bpm.load();
  if (cur_min == 0 || new_bpm < cur_min) {
    min_bpm.store(new_bpm);
    publish_state_min(new_bpm);
  }

  size_t cur_max = max_bpm.load();
  if (new_bpm > cur_max) {
    max_bpm.store(new_bpm);
    publish_state_max(new_bpm);
  }
}

// Single code path for mode/bpm/min/max changes: both the button loop and
// on_message call only these, so every change publishes state the same way.

void set_bpm(size_t bpm) {
  current_bpm.store(bpm);
  update_bpm_bounds(bpm);
  publish_state_bpm(bpm);
}

// N taps give N-1 intervals; dividing by intervals.size() (not a hard-coded 4)
void calculate_bpm() {
  std::vector<std::chrono::steady_clock::time_point> times = tap_times;
  tap_times.clear();

  if (times.size() < 4) return;

  std::vector<double> intervals_ms;
  for (size_t i = 1; i < times.size(); ++i) {
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(times[i] - times[i - 1]).count();
    intervals_ms.push_back(static_cast<double>(diff));
  }

  double sum = std::accumulate(intervals_ms.begin(), intervals_ms.end(), 0.0);
  double avg_interval_ms = sum / intervals_ms.size();

  if (avg_interval_ms > 0) {
    size_t bpm = static_cast<size_t>(60000.0 / avg_interval_ms);
    set_bpm(bpm);
  }
}

void enter_learn() {
  current_mode.store(Mode::LEARN);
  digitalWrite(LED_RED, HIGH);
  tap_times.clear();
  publish_state_mode(Mode::LEARN);
}

void enter_play() {
  // cmd/set_mode "play" from learn computes bpm the same way the button does.
  if (current_mode.load() == Mode::LEARN) {
    calculate_bpm();
  }
  digitalWrite(LED_RED, LOW);
  current_mode.store(Mode::PLAY);
  publish_state_mode(Mode::PLAY);
}

void reset_min() {
  min_bpm.store(0);
  publish_state_min(0);
}

void reset_max() {
  max_bpm.store(0);
  publish_state_max(0);
}

void record_tap() {
  tap_times.push_back(std::chrono::steady_clock::now());
  size_t count = tap_times.size();
  std::cout << "TAP BUTTON PRESSED" << std::endl;

  digitalWrite(LED_RED, LOW);
  std::this_thread::sleep_for(50ms);
  digitalWrite(LED_RED, HIGH);

  publish_event_tap(count);
}

// Sleeps in small steps, stopping early on shutdown or if bpm/mode changed,
// so a new BPM or Ctrl-C doesn't have to wait out the current beat.
bool sleep_chunked(std::chrono::milliseconds total, size_t bpm_at_start) {
  constexpr auto step = 20ms;
  auto remaining = total;
  while (remaining > 0ms && keep_running) {
    if (current_bpm.load() != bpm_at_start || current_mode.load() != Mode::PLAY) return false;
    auto chunk = std::min(remaining, step);
    std::this_thread::sleep_for(chunk);
    remaining -= chunk;
  }
  return keep_running.load();
}

void play_thread_func() {
  while (keep_running) {
    size_t bpm = current_bpm.load();
    Mode mode = current_mode.load();

    if (mode != Mode::PLAY || bpm == 0) {
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(SPEAKER, LOW);
      std::this_thread::sleep_for(20ms);
      continue;
    }

    auto beat_duration = std::chrono::milliseconds(60000 / bpm);
    auto pulse_duration = std::min(beat_duration / 2, 100ms);
    auto off_duration = beat_duration - pulse_duration;

    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(SPEAKER, HIGH);
    publish_event_beat(bpm, beat_seq.fetch_add(1));
    sleep_chunked(pulse_duration, bpm);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(SPEAKER, LOW);
    sleep_chunked(off_duration, bpm);
  }
}

// on_connect/on_message/on_publish run on libmosquitto's network thread:
// never block or sleep in them.

void on_connect(struct mosquitto* m, void* obj, int rc) {
  if (rc != 0) {
    std::cout << "MQTT connect failed: " << mosquitto_connack_string(rc) << std::endl;
    return;
  }
  std::cout << "MQTT connected" << std::endl;

  std::string sub = TOPIC_PREFIX + "cmd/#";
  mosquitto_subscribe(m, nullptr, sub.c_str(), 1);

  // Runs on every reconnect too, so returning clients always see current state.
  publish_status("online");
  publish_all_state();
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
  } catch (const json::parse_error&) {
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
    pending_bpm.store(bpm);
  }
  else if (topic == TOPIC_PREFIX + "cmd/set_mode") {
    if (!body.contains("mode") || !body["mode"].is_string()) {
      std::cout << "IGNORED cmd/set_mode: missing/invalid 'mode'" << std::endl;
      return;
    }
    std::string mode = body["mode"].get<std::string>();
    if (mode == "play") {
      pending_mode.store(PendingMode::PLAY);
    }
    else if (mode == "learn") {
      pending_mode.store(PendingMode::LEARN);
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
    pending_reset_min.store(true);
  }
  else if (topic == TOPIC_PREFIX + "cmd/reset_max") {
    if (!body.contains("reset") || !body["reset"].is_boolean() || !body["reset"].get<bool>()) {
      std::cout << "IGNORED cmd/reset_max: expected {'reset': true}" << std::endl;
      return;
    }
    pending_reset_max.store(true);
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
  json will_payload = { {"status", "offline"} };
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

  while (keep_running) {
    // on_message only posts requests into pending_*; applying them here
    // keeps every state change and every tap_times access on this one
    // thread, so none of it needs a mutex.
    long req_bpm = pending_bpm.exchange(-1);
    if (req_bpm >= 0) set_bpm(static_cast<size_t>(req_bpm));

    PendingMode req_mode = pending_mode.exchange(PendingMode::NONE);
    if (req_mode == PendingMode::PLAY) enter_play();
    else if (req_mode == PendingMode::LEARN) enter_learn();

    if (pending_reset_min.exchange(false)) reset_min();
    if (pending_reset_max.exchange(false)) reset_max();

    bool curr_btn_mode = digitalRead(BTN_MODE);
    bool curr_btn_tap = digitalRead(BTN_TAP);

    if (curr_btn_mode == HIGH && prev_btn_mode == LOW) {
      if (current_mode.load() == Mode::PLAY) {
        std::cout << "MODE BUTTON PRESSED: SWITCHING TO LEARN MODE..." << std::endl;
        enter_learn();
      }
      else {
        std::cout << "MODE BUTTON PRESSED: SWITCHING TO PLAY MODE" << std::endl;
        enter_play();
      }
    }

    if (current_mode.load() == Mode::LEARN && curr_btn_tap == HIGH && prev_btn_tap == LOW) {
      record_tap();
    }

    prev_btn_mode = curr_btn_mode;
    prev_btn_tap = curr_btn_tap;

    std::this_thread::sleep_for(15ms);
  }

  // keep_running only flipped the flag; play_thread reads it too, so join
  // before touching the GPIO pins it writes to.
  play_thread.join();

  int offline_mid = -1;
  json offline_payload = { {"status", "offline"} };
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
