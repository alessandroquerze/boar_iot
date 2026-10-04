#include <chrono>
#include <thread>
#include <vector>
#include <numeric>
#include <atomic>
#include <mutex>
#include <algorithm>
#include <iostream>

using namespace std::chrono_literals;

#include <cpprest/http_msg.h>
#include <wiringPi.h>

#include "metronome.hpp"
#include "rest.hpp"

// Broadcom (BCM) pin configuration
#define LED_RED   17
#define LED_GREEN 27
#define BTN_MODE  23
#define BTN_TAP   24
#define SPEAKER   20

// Metronome states
enum class Mode { PLAY, LEARN };

// Thread-safe global variables for shared state
//std::atomic<Mode> current_mode{ Mode::PLAY };
//std::atomic<size_t> current_bpm{ 0 };
Mode current_mode{ Mode::PLAY };
size_t current_bpm{ 0 };

// Tracking of the minimum and maximum BPM values
size_t min_bpm{ 0 };
size_t max_bpm{ 0 };

// Vector and mutex to store tap timestamps during Learn Mode
std::vector<std::chrono::steady_clock::time_point> tap_times(4);
size_t k = 0;
size_t changed_bpm{ 0 };
//std::mutex tap_mutex;

// --- Helper function to update the Min/Max bounds ---
void update_bpm_bounds(size_t new_bpm) {
  if (new_bpm == 0) return;

  // Update Min and Max BPM
  size_t current_min = min_bpm.load();
  if (new_bpm < min_bpm.load()) {
    min_bpm.store(new_bpm);
  } elif (new_bpm > max_bpm.load()) {
    max_bpm.store(new_bpm);
  }
}

// --- REST Endpoint Handling ---

// Replies with a JSON body, always adding the CORS header, which is
// necessary because the dashboard (part2) is served from a different
// origin than the device's port 8080.
void reply_json(web::http::http_request& msg, web::http::status_code status, const web::json::value& body) {
  web::http::http_response response(status);
  response.headers().add(U("Access-Control-Allow-Origin"), U("*"));
  response.headers().set_content_type(U("application/json"));
  response.set_body(body);
  msg.reply(response);
}

// GET /bpm/ & PUT /bpm/
void handle_bpm(web::http::http_request msg) {
  if (msg.method() == web::http::methods::GET) {
    web::json::value response = web::json::value::object();
    response[U("bpm")] = web::json::value::number(current_bpm.load());
    reply_json(msg, 200, response);
  }
  else if (msg.method() == web::http::methods::PUT) {
    msg.extract_json().then([msg](web::json::value body) mutable {
      if (body.has_field(U("bpm")) && body[U("bpm")].is_number()) {
        size_t new_bpm = body[U("bpm")].as_integer();
        current_bpm.store(new_bpm);
        update_bpm_bounds(new_bpm);

        web::json::value response = web::json::value::object();
        response[U("bpm")] = web::json::value::number(new_bpm);
        reply_json(msg, 200, response);
      } else {
        reply_json(msg, 400, web::json::value::string(U("Invalid JSON body. Expected {'bpm': <number>}")));
      }
    }).wait();
  }
  else {
    reply_json(msg, 405, web::json::value::string(U("Method Not Allowed")));
  }
}

// GET /bpm/min/ & DELETE /bpm/min/
void handle_bpm_min(web::http::http_request msg) {
  if (msg.method() == web::http::methods::GET) {
    web::json::value response = web::json::value::object();
    response[U("min")] = web::json::value::number(min_bpm.load());
    reply_json(msg, 200, response);
  }
  else if (msg.method() == web::http::methods::DEL) {
    min_bpm.store(0);
    web::json::value response = web::json::value::object();
    response[U("min")] = web::json::value::number(0);
    reply_json(msg, 200, response);
  }
  else {
    reply_json(msg, 405, web::json::value::string(U("Method Not Allowed")));
  }
}

// GET /bpm/max/ & DELETE /bpm/max/
void handle_bpm_max(web::http::http_request msg) {
  if (msg.method() == web::http::methods::GET) {
    web::json::value response = web::json::value::object();
    response[U("max")] = web::json::value::number(max_bpm.load());
    reply_json(msg, 200, response);
  }
  else if (msg.method() == web::http::methods::DEL) {
    max_bpm.store(0);
    web::json::value response = web::json::value::object();
    response[U("max")] = web::json::value::number(0);
    reply_json(msg, 200, response);
  }
  else {
    reply_json(msg, 405, web::json::value::string(U("Method Not Allowed")));
  }
}

// --- Green LED Thread (Play Mode) ---
void play_thread_func() {
  size_t bpm = current_bpm.load();
  Mode mode = current_mode.load();
  auto beat_duration = 0;
  auto pulse_duration = 0;
  auto off_duration = 0;
  while (true) {
    mode = current_mode.load();
    if (mode == Mode::PLAY && bpm > 0) {
      if(changed_bpm.load() == 1) {
        // Compute the duration of a full cycle (ON + OFF) in milliseconds
        bpm = current_bpm.load();
        beat_duration = std::chrono::milliseconds(60000 / bpm);

        // Turn on the green LED for half the period (or max 100ms for a short pulse)
        pulse_duration = std::min(beat_duration / 2, 100ms);
        off_duration = beat_duration - pulse_duration;
        changed_bpm.store(0);
      }

      digitalWrite(LED_GREEN, HIGH);
      digitalWrite(SPEAKER, HIGH);
      std::this_thread::sleep_for(pulse_duration);
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(SPEAKER, LOW);
      std::this_thread::sleep_for(off_duration);
    }
    else {
      // Turn off the green LED and speaker if we are in LEARN mode or BPM = 0
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(SPEAKER, LOW);
      std::this_thread::sleep_for(50ms);
    }
  }
}

// --- BPM Calculation Function ---
void calculate_bpm() {
  //std::lock_guard<std::mutex> lock(tap_mutex);

  // At least 4 taps required for the measurement to be considered valid
  if (k < 4) {
    tap_times.clear();
    k=0;
    return;
  }

  // Compute the time differences between consecutive taps
  std::vector<double> intervals_ms;
  for (size_t i = 1; i < 4; ++i) {
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(
      tap_times[i] - tap_times[i - 1]
    ).count();
    intervals_ms.push_back(static_cast<double>(diff));
  }

  // Average of the intervals
  double sum = std::accumulate(intervals_ms.begin(), intervals_ms.end(), 0.0);
  double avg_interval_ms = sum / 4;

  if (avg_interval_ms > 0) {
    size_t calculated_bpm = static_cast<size_t>(60000.0 / avg_interval_ms);
    current_bpm.store(calculated_bpm);
    changed_bpm.store(1);
    update_bpm_bounds(calculated_bpm);
  }

  tap_times.clear();
}

int main() {
  // Initialize WiringPi with BCM (Broadcom) pin numbering
  wiringPiSetupGpio();

  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(SPEAKER, OUTPUT);

  // Configure buttons as INPUT
  pinMode(BTN_MODE, INPUT);
  pinMode(BTN_TAP, INPUT);

  // Make sure the LEDs start off
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(SPEAKER, LOW);

  // --- REST Server Endpoint Configuration ---
  auto bpm_rest = rest::make_endpoint("/bpm/");
  bpm_rest.support(web::http::methods::GET, handle_bpm);
  bpm_rest.support(web::http::methods::PUT, handle_bpm);
  bpm_rest.open().wait();

  auto bpm_min_rest = rest::make_endpoint("/bpm/min/");
  bpm_min_rest.support(web::http::methods::GET, handle_bpm_min);
  bpm_min_rest.support(web::http::methods::DEL, handle_bpm_min);
  bpm_min_rest.open().wait();

  auto bpm_max_rest = rest::make_endpoint("/bpm/max/");
  bpm_max_rest.support(web::http::methods::GET, handle_bpm_max);
  bpm_max_rest.support(web::http::methods::DEL, handle_bpm_max);
  bpm_max_rest.open().wait();

  // Start the thread that blinks the green LED (Play Mode)
  std::thread play_thread(play_thread_func);
  play_thread.detach();

  // Previous button states, used to detect the rising edge
  bool prev_btn_mode = LOW;
  bool prev_btn_tap = LOW;

  // --- Main Loop (Button Polling) ---
  while (true) {
    bool curr_btn_mode = digitalRead(BTN_MODE);
    bool curr_btn_tap = digitalRead(BTN_TAP);

    // 1. Detect PB2 (BTN_MODE) press -> mode switch
    if (curr_btn_mode == HIGH && prev_btn_mode == LOW) {
      if (current_mode.load() == Mode::PLAY) {
        // Switching from PLAY to LEARN
        printf("MODE BUTTON PRESSED: SWITCHING TO LEARN MODE...\n");
        current_mode.store(Mode::LEARN);
        digitalWrite(LED_RED, HIGH);
        tap_times.clear();
        k=0;
      }
      else {
        // Switching from LEARN to PLAY
        printf("MODE BUTTON PRESSED: SWITCHING TO PLAY MODE\n");
        calculate_bpm();
        digitalWrite(LED_RED, LOW);
        current_mode.store(Mode::PLAY);
      }
    }

    // 2. Detect PB1 (BTN_TAP) press in LEARN Mode
    if (current_mode.load() == Mode::LEARN) {
      if (curr_btn_tap == HIGH && prev_btn_tap == LOW) {
        tap_times[i % 4] = std::chrono::steady_clock::now();
        k++;
        printf("TAP BUTTON PRESSED\n");

        // Visual feedback on the red LED
        while (curr_btn_tap == HIGH)
          digitalWrite(LED_RED, LOW);
        digitalWrite(LED_RED, HIGH);
      }
    }

    // Update button states
    prev_btn_mode = curr_btn_mode;
    prev_btn_tap = curr_btn_tap;

    std::this_thread::sleep_for(15ms);
  }

  return 0;
}