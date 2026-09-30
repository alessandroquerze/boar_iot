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

// Configurazione dei PIN Broadcom (BCM)
#define LED_RED   17
#define LED_GREEN 27
#define BTN_MODE  23
#define BTN_TAP   24
#define SPEAKER   20

// Stati del metronomo
enum class Mode { PLAY, LEARN };

// Variabili globali thread-safe per lo stato condiviso
std::atomic<Mode> current_mode{ Mode::PLAY };
std::atomic<size_t> current_bpm{ 0 };

// Tracciamento dei valori minimo e massimo di BPM
std::atomic<size_t> min_bpm{ 0 };
std::atomic<size_t> max_bpm{ 0 };

// Vettore e mutex per memorizzare i timestamp dei tap durante il Learn Mode
std::vector<std::chrono::steady_clock::time_point> tap_times;
std::mutex tap_mutex;

// --- Funzione ausiliaria per aggiornare i limiti Min/Max ---
void update_bpm_bounds(size_t new_bpm) {
  if (new_bpm == 0) return;

  // Aggiorna Min BPM (se e 0 oppure se il nuovo valore e minore del min attuale)
  size_t current_min = min_bpm.load();
  while (current_min == 0 || new_bpm < current_min) {
    if (min_bpm.compare_exchange_weak(current_min, new_bpm)) {
      break;
    }
  }

  // Aggiorna Max BPM
  size_t current_max = max_bpm.load();
  while (new_bpm > current_max) {
    if (max_bpm.compare_exchange_weak(current_max, new_bpm)) {
      break;
    }
  }
}

// --- Gestione Endpoints REST ---

// GET /bpm/ & PUT /bpm/
void handle_bpm(web::http::http_request msg) {
  if (msg.method() == web::http::methods::GET) {
    web::json::value response = web::json::value::object();
    response[U("bpm")] = web::json::value::number(current_bpm.load());
    msg.reply(200, response);
  } 
  else if (msg.method() == web::http::methods::PUT) {
    msg.extract_json().then([msg](web::json::value body) {
      if (body.has_field(U("bpm")) && body[U("bpm")].is_number()) {
        size_t new_bpm = body[U("bpm")].as_integer();
        current_bpm.store(new_bpm);
        update_bpm_bounds(new_bpm);
        
        web::json::value response = web::json::value::object();
        response[U("bpm")] = web::json::value::number(new_bpm);
        msg.reply(200, response);
      } else {
        msg.reply(400, web::json::value::string(U("Invalid JSON body. Expected {'bpm': <number>}")));
      }
    }).wait();
  } 
  else {
    msg.reply(45, web::json::value::string(U("Method Not Allowed")));
  }
}

// GET /bpm/min/ & DELETE /bpm/min/
void handle_bpm_min(web::http::http_request msg) {
  if (msg.method() == web::http::methods::GET) {
    web::json::value response = web::json::value::object();
    response[U("min")] = web::json::value::number(min_bpm.load());
    msg.reply(200, response);
  } 
  else if (msg.method() == web::http::methods::DEL) {
    min_bpm.store(0);
    web::json::value response = web::json::value::object();
    response[U("min")] = web::json::value::number(0);
    msg.reply(200, response);
  } 
  else {
    msg.reply(405, web::json::value::string(U("Method Not Allowed")));
  }
}

// GET /bpm/max/ & DELETE /bpm/max/
void handle_bpm_max(web::http::http_request msg) {
  if (msg.method() == web::http::methods::GET) {
    web::json::value response = web::json::value::object();
    response[U("max")] = web::json::value::number(max_bpm.load());
    msg.reply(200, response);
  } 
  else if (msg.method() == web::http::methods::DEL) {
    max_bpm.store(0);
    web::json::value response = web::json::value::object();
    response[U("max")] = web::json::value::number(0);
    msg.reply(200, response);
  } 
  else {
    msg.reply(405, web::json::value::string(U("Method Not Allowed")));
  }
}

// --- Thread LED Verde (Play Mode) ---
void play_thread_func() {
  while (true) {
    size_t bpm = current_bpm.load();
    Mode mode = current_mode.load();

    if (mode == Mode::PLAY && bpm > 0) {
      // Calcola la durata di un ciclo completo (ON + OFF) in millisecondi
      auto beat_duration = std::chrono::milliseconds(60000 / bpm);

      // Accende il LED Verde per metà del periodo (o max 100ms per un impulso breve)
      auto pulse_duration = std::min(beat_duration / 2, 100ms);
      auto off_duration = beat_duration - pulse_duration;

      digitalWrite(LED_GREEN, HIGH);
      digitalWrite(SPEAKER, HIGH);
      std::this_thread::sleep_for(pulse_duration);
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(SPEAKER, LOW);
      std::this_thread::sleep_for(off_duration);
    }
    else {
      // Spegne il LED Verde e lo Speaker se siamo in LEARN mode o con BPM = 0
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(SPEAKER, LOW);
      std::this_thread::sleep_for(50ms);
    }
  }
}

// --- Funzione per Calcolare il BPM ---
void calculate_bpm() {
  std::lock_guard<std::mutex> lock(tap_mutex);

  // Almeno 4 tap richiesti per considerare valida la misurazione
  if (tap_times.size() < 4) {
    tap_times.clear();
    return;
  }

  // Calcola le differenze di tempo tra tap consecutivi
  std::vector<double> intervals_ms;
  for (size_t i = 1; i < tap_times.size(); ++i) {
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(
      tap_times[i] - tap_times[i - 1]
    ).count();
    intervals_ms.push_back(static_cast<double>(diff));
  }

  // Media degli intervalli
  double sum = std::accumulate(intervals_ms.begin(), intervals_ms.end(), 0.0);
  double avg_interval_ms = sum / intervals_ms.size();

  if (avg_interval_ms > 0) {
    size_t calculated_bpm = static_cast<size_t>(60000.0 / avg_interval_ms);
    current_bpm.store(calculated_bpm);
    update_bpm_bounds(calculated_bpm);
  }

  tap_times.clear();
}

int main() {
  // Inizializzazione WiringPi con pin BCM (Broadcom)
  wiringPiSetupGpio();

  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(SPEAKER, OUTPUT);

  // Configurazione pulsanti come INPUT
  pinMode(BTN_MODE, INPUT);
  pinMode(BTN_TAP, INPUT);

  // Assicuriamoci che i LED partano spenti
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(SPEAKER, LOW);

  // --- Configurazione Endpoints Server REST ---
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

  // Avvio del thread per il blink del LED verde (Play Mode)
  std::thread play_thread(play_thread_func);
  play_thread.detach();

  // Stato precedente dei pulsanti per la rilevazione del fronte di salita (Rising Edge)
  bool prev_btn_mode = LOW;
  bool prev_btn_tap = LOW;

  // --- Loop Principale (Polling dei Pulsanti) ---
  while (true) {
    bool curr_btn_mode = digitalRead(BTN_MODE);
    bool curr_btn_tap = digitalRead(BTN_TAP);

    // 1. Rilevazione pressione PB2 (BTN_MODE) -> Cambio Modalita
    if (curr_btn_mode == HIGH && prev_btn_mode == LOW) {
      if (current_mode.load() == Mode::PLAY) {
        // Passaggio da PLAY a LEARN
        printf("PREMUTO IL TASTO MODE: PASSAGGIO A MODALITA' LEARN IN CORSO...\n");
        current_mode.store(Mode::LEARN);
        digitalWrite(LED_RED, HIGH);
        {
          std::lock_guard<std::mutex> lock(tap_mutex);
          tap_times.clear();
        }
      }
      else {
        // Passaggio da LEARN a PLAY
        printf("PREMUTO IL TASTO MODE: PASSAGGIO A MODALITA' PLAY\n");
        calculate_bpm();
        digitalWrite(LED_RED, LOW);
        current_mode.store(Mode::PLAY);
      }
    }

    // 2. Rilevazione pressione PB1 (BTN_TAP) in LEARN Mode
    if (current_mode.load() == Mode::LEARN) {
      if (curr_btn_tap == HIGH && prev_btn_tap == LOW) {
        {
          std::lock_guard<std::mutex> lock(tap_mutex);
          tap_times.push_back(std::chrono::steady_clock::now());
        }
        printf("PREMUTO TASTO TAP\n");

        // Feedback visivo sul LED rosso
        digitalWrite(LED_RED, LOW);
        std::this_thread::sleep_for(50ms);
        digitalWrite(LED_RED, HIGH);
      }
    }

    // Aggiornamento stati dei pulsanti
    prev_btn_mode = curr_btn_mode;
    prev_btn_tap = curr_btn_tap;

    std::this_thread::sleep_for(15ms);
  }

  return 0;
}