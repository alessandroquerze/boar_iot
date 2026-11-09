// BOAR Lab 4 - ATLAS V3 client for the Edge PC.
// Uses TCP port 6668 and JSON to call services on the Raspberry Pi.
// Build: g++ -std=c++17 -O2 atlas_demo_readable.cpp -o atlas_demo.exe -lws2_32  (Windows)

#include <boost/property_tree/json_parser.hpp>

#include <algorithm>
#include <chrono>
#include <csignal>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
    #define WIN32_LEAN_AND_MEAN
    #include <winsock2.h>
    #include <ws2tcpip.h>

    using Socket = SOCKET;
    constexpr Socket INVALID_FD = INVALID_SOCKET;

    void close_socket(Socket socket) { closesocket(socket); }

    void set_nonblocking(Socket socket, bool enabled) {
        u_long mode = enabled ? 1 : 0;
        ioctlsocket(socket, FIONBIO, &mode);
    }

    bool connection_in_progress() {
        int error = WSAGetLastError();
        return error == WSAEWOULDBLOCK || error == WSAEINPROGRESS;
    }
#else
    #include <arpa/inet.h>
    #include <cerrno>
    #include <fcntl.h>
    #include <netdb.h>
    #include <sys/select.h>
    #include <sys/socket.h>
    #include <unistd.h>

    using Socket = int;
    constexpr Socket INVALID_FD = -1;

    void close_socket(Socket socket) { close(socket); }

    void set_nonblocking(Socket socket, bool enabled) {
        int flags = fcntl(socket, F_GETFL);
        fcntl(socket, F_SETFL, enabled ? flags | O_NONBLOCK : flags & ~O_NONBLOCK);
    }

    bool connection_in_progress() { return errno == EINPROGRESS; }
#endif

namespace pt = boost::property_tree;
using Clock = std::chrono::steady_clock;

volatile std::sig_atomic_t running = 1;

void handle_interrupt(int) {
    running = 0;
}

// Parse an entire string as an integer (reject values such as "12abc").
int parse_integer(const std::string& text) {
    std::size_t length = 0;
    int value = std::stoi(text, &length);

    if (length != text.size()) {
        throw std::runtime_error("Intero non valido: " + text);
    }

    return value;
}

// Sleep in short intervals so Ctrl+C can stop automatic monitoring promptly.
void sleep_ms(int milliseconds) {
    while (running && milliseconds > 0) {
        int slice = std::min(milliseconds, 100);
        std::this_thread::sleep_for(std::chrono::milliseconds(slice));
        milliseconds -= slice;
    }
}

// Settings can be overridden with command-line options.
struct Config {
    std::string host;
    std::string thing = "AT_BoarAirSensor";
    std::string space = "BoarSmartSpace";

    int port = 6668;
    int timeout = 15000;  // TCP timeout in milliseconds.
    int gap = 3300;       // ATLAS pauses about 3 seconds after a service call.
    int interval = 12;    // Seconds between automatic temperature checks.

    int fan = 60;         // Fan speed: 0 to 75.
    int angle = 40;       // Window angle: 0 to 50 degrees.
    int hot = 27;         // Turn cooling on above this temperature.
    int cool = 26;        // Turn cooling off at or below this temperature.
};

// These names and argument ranges match the project's IoT-DDL services.
struct Service {
    const char* name;
    int argument_count;
    int minimum;
    int maximum;
};

const Service services[] = {
    {"Calibrate_Sensor",      0, 0,  0},
    {"Read_Temp",             1, 0,  1},
    {"Read_Humidity",         0, 0,  0},
    {"Fan_On",                1, 0, 75},
    {"Fan_Off",               0, 0,  0},
    {"Read_Fan_Speed",        0, 0,  0},
    {"Read_Fan_Status",       0, 0,  0},
    {"Set_Window",            1, 0, 50},
    {"Window_Close",          0, 0,  0},
    {"Read_Window_Position",  0, 0,  0}
};

const Service& find_service(const std::string& name) {
    for (const auto& service : services) {
        if (name == service.name) {
            return service;
        }
    }

    throw std::runtime_error("Servizio sconosciuto: " + name);
}

// Open one TCP connection, send one JSON request, and read its JSON reply.
// ATLAS accepts one service call per connection and closes it after replying.
std::string tcp_exchange(const Config& config, const std::string& request) {
    addrinfo hints{};
    addrinfo* addresses = nullptr;

    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;

    if (getaddrinfo(config.host.c_str(), std::to_string(config.port).c_str(),
                    &hints, &addresses) != 0) {
        throw std::runtime_error("Host non risolvibile");
    }

    Socket connection = INVALID_FD;

    // Try all resolved addresses, using a timeout for each connection attempt.
    for (addrinfo* address = addresses; address != nullptr; address = address->ai_next) {
        Socket candidate = socket(address->ai_family, address->ai_socktype,
                                  address->ai_protocol);
        if (candidate == INVALID_FD) {
            continue;
        }

        set_nonblocking(candidate, true);
        bool connected = connect(candidate, address->ai_addr,
                                 static_cast<int>(address->ai_addrlen)) == 0;

        if (!connected && connection_in_progress()) {
            fd_set writable;
            FD_ZERO(&writable);
            FD_SET(candidate, &writable);

            timeval timeout{config.timeout / 1000, (config.timeout % 1000) * 1000};
#ifdef _WIN32
            connected = select(0, nullptr, &writable, nullptr, &timeout) > 0;
#else
            connected = select(candidate + 1, nullptr, &writable, nullptr, &timeout) > 0;
#endif
            // A writable socket is not necessarily connected: check SO_ERROR.
            int socket_error = -1;
#ifdef _WIN32
            int option_size = sizeof(socket_error);
            connected = connected &&
                getsockopt(candidate, SOL_SOCKET, SO_ERROR,
                           reinterpret_cast<char*>(&socket_error), &option_size) == 0 &&
                socket_error == 0;
#else
            socklen_t option_size = sizeof(socket_error);
            connected = connected &&
                getsockopt(candidate, SOL_SOCKET, SO_ERROR,
                           &socket_error, &option_size) == 0 &&
                socket_error == 0;
#endif
        }

        if (connected) {
            connection = candidate;
            break;
        }

        close_socket(candidate);
    }

    freeaddrinfo(addresses);

    if (connection == INVALID_FD) {
        throw std::runtime_error("Connessione TCP fallita / timeout");
    }

    try {
        set_nonblocking(connection, false);

        // Limit the time spent waiting for data or sending the request.
#ifdef _WIN32
        DWORD timeout = config.timeout;
        setsockopt(connection, SOL_SOCKET, SO_RCVTIMEO,
                   reinterpret_cast<char*>(&timeout), sizeof(timeout));
        setsockopt(connection, SOL_SOCKET, SO_SNDTIMEO,
                   reinterpret_cast<char*>(&timeout), sizeof(timeout));
#else
        timeval timeout{config.timeout / 1000, (config.timeout % 1000) * 1000};
        setsockopt(connection, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(connection, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
#endif

        // send() can write fewer bytes than requested, so track the offset.
        std::size_t sent = 0;
        while (sent < request.size()) {
            int bytes = send(connection, request.data() + sent,
                             static_cast<int>(request.size() - sent), 0);
            if (bytes <= 0) {
                throw std::runtime_error("Errore invio TCP");
            }
            sent += bytes;
        }

        std::string response;
        char buffer[1024];
        int bytes = 0;

        // The server closes its socket after the complete reply.
        while ((bytes = recv(connection, buffer, sizeof(buffer), 0)) > 0) {
            response.append(buffer, bytes);
            if (response.size() > 8192) {
                throw std::runtime_error("Risposta troppo grande");
            }
        }

        if (bytes < 0) {
            throw std::runtime_error("Timeout nella risposta TCP");
        }
        if (response.empty()) {
            throw std::runtime_error("ATLAS senza risposta");
        }

        close_socket(connection);
        return response;
    } catch (...) {
        close_socket(connection);
        throw;
    }
}

// Encapsulate the ATLAS JSON protocol and service-call pacing.
class Atlas {
public:
    explicit Atlas(const Config& config) : config_(config) {}

    std::string call(const std::string& name, std::vector<int> arguments = {}) {
        const Service& service = find_service(name);

        if (static_cast<int>(arguments.size()) != service.argument_count) {
            throw std::runtime_error(name + ": argomenti errati");
        }
        for (int value : arguments) {
            if (value < service.minimum || value > service.maximum) {
                throw std::runtime_error(name + ": intervallo " +
                                         std::to_string(service.minimum) + ".." +
                                         std::to_string(service.maximum));
            }
        }

        // ATLAS expects arguments as a string: "()", "(0)", "(50)", etc.
        std::string inputs = "(";
        for (int value : arguments) {
            if (inputs.size() > 1) {
                inputs += ",";
            }
            inputs += std::to_string(value);
        }
        inputs += ")";

        pt::ptree request;
        request.put("Tweet Type", "Service call");
        request.put("Thing ID", config_.thing);
        request.put("Space ID", config_.space);
        request.put("Service Name", name);
        request.put("Service Inputs", inputs);

        std::ostringstream output;
        pt::write_json(output, request, false);
        std::string payload = output.str();

        if (payload.size() >= 4048) {
            throw std::runtime_error("Richiesta troppo grande");
        }

        // The middleware waits about 3 seconds after each call.
        auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(
            next_call_ - Clock::now()).count();
        sleep_ms(static_cast<int>(remaining));

        if (!running) {
            throw std::runtime_error("Interrotto");
        }

        std::string json;
        try {
            json = tcp_exchange(config_, payload);
        } catch (...) {
            next_call_ = Clock::now() + std::chrono::milliseconds(config_.gap);
            throw;
        }
        next_call_ = Clock::now() + std::chrono::milliseconds(config_.gap);

        pt::ptree reply;
        std::istringstream input(json);
        pt::read_json(input, reply);

        std::string status = reply.get<std::string>("Status", "");
        if (status != "Successful") {
            throw std::runtime_error(name + ": " +
                reply.get<std::string>("Status Description", status));
        }

        // A successful reply must belong to the requested thing and service.
        if (reply.get<std::string>("Service Name", "") != name ||
            reply.get<std::string>("Thing ID", "") != config_.thing ||
            reply.get<std::string>("Space ID", "") != config_.space) {
            throw std::runtime_error("Risposta ATLAS non corrispondente");
        }

        return reply.get<std::string>("Service Result", "No Output");
    }

    int value(const std::string& name, std::vector<int> arguments = {}) {
        return parse_integer(call(name, arguments));
    }

private:
    const Config& config_;
    Clock::time_point next_call_{};
};

// Temperature-based ventilation. Hysteresis prevents rapid on/off switching.
struct Controller {
    Atlas& atlas;
    const Config& config;
    int last_mode = -1;  // -1 unknown; 0 cooling off; 1 cooling on.

    void poll() {
        int temperature = atlas.value("Read_Temp", {0});  // 0 means Celsius.

        if (temperature < 0 || temperature > 50) {
            throw std::runtime_error("Temperatura non valida: " +
                                     std::to_string(temperature));
        }
        std::cout << "Temperatura: " << temperature << " C\n";

        int mode = -1;
        if (temperature > config.hot) {
            mode = 1;
        } else if (temperature <= config.cool) {
            mode = 0;
        }

        // Between the thresholds, preserve the previous state.
        // Do not send duplicate commands when the target state is unchanged.
        if (mode == -1 || mode == last_mode) {
            return;
        }

        last_mode = -1;
        if (mode == 1) {
            atlas.call("Fan_On", {config.fan});
            atlas.call("Set_Window", {config.angle});
        } else {
            atlas.call("Fan_Off");
            atlas.call("Window_Close");
        }

        // Remember the mode only if both actuator calls succeeded.
        last_mode = mode;
        std::cout << (mode ? "Ventola ON, finestra aperta\n"
                           : "Ventola OFF, finestra chiusa\n");
    }
};

// Attempt both stop commands even if the first one fails.
bool stop_actuators(Atlas& atlas) {
    bool success = true;

    for (const char* name : {"Fan_Off", "Window_Close"}) {
        try {
            std::cout << name << " => " << atlas.call(name) << '\n';
        } catch (const std::exception& error) {
            std::cerr << error.what() << '\n';
            success = false;
        }
    }

    return success;
}

void show_status(Atlas& atlas) {
    const char* names[] = {
        "Read_Temp", "Read_Humidity", "Read_Fan_Status",
        "Read_Fan_Speed", "Read_Window_Position"
    };

    for (const char* name : names) {
        // Read_Temp requires a Celsius flag; other readers take no parameters.
        if (std::string(name) == "Read_Temp") {
            std::cout << name << " => " << atlas.call(name, {0}) << '\n';
        } else {
            std::cout << name << " => " << atlas.call(name) << '\n';
        }
    }
}

void run_automatic(Controller& controller, int interval_seconds) {
    while (running) {
        try {
            controller.poll();
        } catch (const std::exception& error) {
            std::cerr << "[ERRORE] " << error.what() << '\n';
        }
        sleep_ms(interval_seconds * 1000);
    }
}

void show_menu() {
    std::cout << "\nServizi ATLAS:\n";
    for (int index = 0; index < 10; ++index) {
        std::cout << index + 1 << ") " << services[index].name << "\n";
    }
    std::cout << "11) Stato generale\n"
              << "12) Un ciclo automatico\n"
              << "13) Automazione continua\n"
              << "14) Stop attuatori\n"
              << " 0) Esci\n> " << std::flush;
}

void run_menu(Atlas& atlas, Controller& controller, const Config& config) {
    while (running) {
        show_menu();

        std::string input;
        if (!std::getline(std::cin, input)) {
            return;
        }

        try {
            int choice = parse_integer(input);
            if (choice == 0) {
                return;
            }

            if (choice == 11) {
                show_status(atlas);
            } else if (choice == 12) {
                controller.poll();
            } else if (choice == 13) {
                run_automatic(controller, config.interval);
            } else if (choice == 14) {
                stop_actuators(atlas);
                controller.last_mode = -1;
            } else if (choice >= 1 && choice <= 10) {
                const Service& service = services[choice - 1];
                std::vector<int> arguments;

                if (service.argument_count > 0) {
                    std::cout << "Valore (" << service.minimum << ".."
                              << service.maximum << "): " << std::flush;
                    if (!std::getline(std::cin, input)) {
                        return;
                    }
                    arguments.push_back(parse_integer(input));
                }

                std::cout << service.name << " => "
                          << atlas.call(service.name, arguments) << '\n';

                // A manual actuator command invalidates the remembered mode.
                if (choice == 4 || choice == 5 || choice == 8 || choice == 9) {
                    controller.last_mode = -1;
                }
            }
        } catch (const std::exception& error) {
            std::cerr << "[ERRORE] " << error.what() << '\n';
        }
    }
}

void print_help() {
    std::cout << "atlas_demo --host IP [--auto|--once|--status|--stop|--call NAME [N]]\n"
              << "Options: --port --thing --space --fan-speed --window-angle\n"
              << "         --hot-threshold --cool-threshold --interval-sec\n"
              << "         --gap-ms --timeout-ms\n";
}

int main(int argc, char* argv[]) {
    std::signal(SIGINT, handle_interrupt);
    std::signal(SIGTERM, handle_interrupt);
#ifndef _WIN32
    std::signal(SIGPIPE, SIG_IGN);
#endif

    try {
        Config config;
        std::string mode = "menu";
        std::string selected_service;
        std::vector<int> service_arguments;

        // Associate numeric options with their fields in Config.
        const std::map<std::string, int*> numeric_options = {
            {"--port",           &config.port},
            {"--fan-speed",      &config.fan},
            {"--window-angle",   &config.angle},
            {"--hot-threshold",  &config.hot},
            {"--cool-threshold", &config.cool},
            {"--interval-sec",   &config.interval},
            {"--gap-ms",         &config.gap},
            {"--timeout-ms",     &config.timeout}
        };

        for (int index = 1; index < argc; ++index) {
            std::string option = argv[index];

            if (option == "--help" || option == "-h") {
                print_help();
                return 0;
            }
            if (option == "--auto" || option == "--once" ||
                option == "--status" || option == "--stop") {
                mode = option;
                continue;
            }
            if (index + 1 >= argc) {
                throw std::runtime_error("Valore mancante per " + option);
            }

            std::string argument = argv[++index];
            if (option == "--host" || option == "--ip") {
                config.host = argument;
            } else if (option == "--thing") {
                config.thing = argument;
            } else if (option == "--space") {
                config.space = argument;
            } else if (auto match = numeric_options.find(option);
                       match != numeric_options.end()) {
                *match->second = parse_integer(argument);
            } else if (option == "--call") {
                mode = option;
                selected_service = argument;
                const Service& service = find_service(argument);

                if (service.argument_count > 0) {
                    if (++index >= argc) {
                        throw std::runtime_error("Argomento servizio mancante");
                    }
                    service_arguments.push_back(parse_integer(argv[index]));
                }
            } else {
                throw std::runtime_error("Opzione sconosciuta: " + option);
            }
        }

        if (config.host.empty() || config.port < 1 || config.port > 65535 ||
            config.thing.empty() || config.space.empty()) {
            throw std::runtime_error("Specificare --host e ID/porta validi");
        }
        if (config.fan < 0 || config.fan > 75 || config.angle < 0 ||
            config.angle > 50 || config.cool >= config.hot ||
            config.interval < 1 || config.interval > 86400 ||
            config.gap < 0 || config.gap > 60000 ||
            config.timeout < 200 || config.timeout > 120000) {
            throw std::runtime_error("Parametri non validi");
        }

#ifdef _WIN32
        WSADATA winsock{};
        if (WSAStartup(MAKEWORD(2, 2), &winsock) != 0) {
            throw std::runtime_error("WSAStartup fallita");
        }
#endif

        Atlas atlas(config);
        Controller controller{atlas, config};

        if (mode == "--once") {
            controller.poll();
        } else if (mode == "--auto") {
            run_automatic(controller, config.interval);
        } else if (mode == "--status") {
            show_status(atlas);
        } else if (mode == "--stop") {
            if (!stop_actuators(atlas)) {
                return 1;
            }
        } else if (mode == "--call") {
            std::cout << selected_service << " => "
                      << atlas.call(selected_service, service_arguments) << '\n';
        } else {
            run_menu(atlas, controller, config);
        }

#ifdef _WIN32
        WSACleanup();
#endif
    } catch (const std::exception& error) {
        std::cerr << "[ERRORE] " << error.what() << '\n';
        return 1;
    }

    return 0;
}
