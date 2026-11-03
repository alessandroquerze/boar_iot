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

#include <nlohmann/json.hpp>
#include <wiringPi.h>

using json = nlohmann::json;

// --- Pin configuration ---
#define TEMP_SENSOR   17
#define VENT_MOTOR    23
#define WINDOW_MOTOR  24

std::atomic<bool> keep_running(true);

// Vector to store timestamps
std::deque<std::chrono::steady_clock::time_point> timestamps;

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

// --- Green LED Thread (Play Mode) ---
/*
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
*/

/*
* Modificare le linee di codice di lettura e scrittura dei sensori e dei
* motori con l'implementazione giusta. Per ora il main è solo la logica
* con cui verrà testata
*/

int main(int argc, char** argv) {
  wiringPiSetupGpio();
  pinMode(VENT_MOTOR, OUTPUT);
  pinMode(WINDOW_MOTOR, OUTPUT);
  pinMode(TEMP_SENSOR, INPUT);
  digitalWrite(VENT_MOTOR, LOW);
  digitalWrite(WINDOW_MOTOR, LOW);

  std::signal(SIGINT, signal_handler);
  std::signal(SIGTERM, signal_handler);

  std::thread play_thread(play_thread_func);

  float prev_temp = 100.0f;
  float prev_humidity = 100.0f;

  digitalWrite(VENT_MOTOR, HIGH);
  std::cout << "Ventilator motor turned on" << std::endl
  std::this_thread::sleep_for(5000ms);
  std::cout << "Ventilator motor turned off" << std::endl
  digitalWrite(VENT_MOTOR, LOW);

  digitalWrite(WINDOW_MOTOR, HIGH);
  std::cout << "Window motor turned on" << std::endl
  std::this_thread::sleep_for(5000ms);
  std::cout << "Window motor turned off" << std::endl
  digitalWrite(WINDOW_MOTOR, LOW);

  // --- Main Loop (Button Polling) ---
  while (keep_running) {
    float curr_temp = digitalRead(TEMP_SENSOR);
    float curr_humidity = digitalRead(TEMP_SENSOR);

    if (curr_temp != prev_temp || curr_humidity != prev_humidity) {
      std::cout << "Temperature: " << curr_temp << std::endl;
      std::cout << "Humidity: " << curr_humidity << std::endl;
    }
    prev_temp = curr_temp;
    prev_humidity = curr_humidity;

    std::this_thread::sleep_for(15ms);
  }

  //play_thread.join();
  cleanup_gpio();
  return 0;
}
