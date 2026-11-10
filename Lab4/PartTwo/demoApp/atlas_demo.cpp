// Minimal ATLAS client for Windows: Read_Temp, Fan_On, Set_Window.
// Compile: g++ -std=c++17 atlas_minimal.cpp -o atlas_minimal.exe -lws2_32
// Run:     atlas_minimal.exe 192.168.1.100  (replace with the ATLAS host IP)

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iostream>
#include <string>
#include <stdexcept>

// Open one TCP connection for each ATLAS service call.
std::string call_atlas(const std::string& host, const std::string& service, int value) {
    addrinfo hints{};
    hints.ai_family = AF_INET; //this means: ipv4 only
    hints.ai_socktype = SOCK_STREAM;

    addrinfo* address = nullptr;
    if (getaddrinfo(host.c_str(), "6668", &hints, &address) != 0)
        throw std::runtime_error("Invalid host");
//socket initialization
    SOCKET socket_fd = socket(address->ai_family, address->ai_socktype, address->ai_protocol);
    if (socket_fd == INVALID_SOCKET) {
        freeaddrinfo(address);
        throw std::runtime_error("Cannot create socket");
    }
//connection via the socket
    int connected = connect(socket_fd, address->ai_addr, static_cast<int>(address->ai_addrlen));
    freeaddrinfo(address);
    if (connected == SOCKET_ERROR) {
        closesocket(socket_fd);
        throw std::runtime_error("Cannot connect to ATLAS");
    }

    // ATLAS receives a JSON request with the service name and one argument.
    std::string request =
        "{\"Tweet Type\":\"Service call\","
        "\"Thing ID\":\"AT_BoarAirSensor\","
        "\"Space ID\":\"BoarSmartSpace\","
        "\"Service Name\":\"" + service + "\","
        "\"Service Inputs\":\"(" + std::to_string(value) + ")\"}";

        //sends the TCP request. we prioritized simplicity of the code over a over-engineered 
        //while condition for a demo, assuming a single send for this amount of
        //data would be almost always enough. if for some reason it fails to deliver the entire packet,
        //it gets notified with a "send failed" message.
    int n = send(socket_fd, request.data(),
             static_cast<int>(request.size()), 0);

if (n != static_cast<int>(request.size())) {
    closesocket(socket_fd);
    throw std::runtime_error("Send failed");
}

    // Read the reply until ATLAS closes the connection.
    DWORD timeout = 15000;
    setsockopt(socket_fd, SOL_SOCKET, SO_RCVTIMEO,
               reinterpret_cast<const char*>(&timeout), sizeof(timeout));

    std::string reply;
    char buffer[1024];
    
    while ((n = recv(socket_fd, buffer, sizeof(buffer), 0)) > 0)
        reply.append(buffer, n);

    closesocket(socket_fd);
    if (n < 0 || reply.empty())
        throw std::runtime_error("No reply / receive timeout");

    return reply;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: atlas_minimal.exe <ATLAS_IP>\n";
        return 1;
    }

    // this initializes winsock 2.2 for TCP communication.
    WSADATA data{};
    if (WSAStartup(MAKEWORD(2, 2), &data) != 0)
        return 1;

    while (true) {
        std::cout << "\n1) Read_Temp\n2) Fan_On\n3) Set_Window\n0) Exit\n> ";
        int choice;
        if (!(std::cin >> choice) || choice == 0)
            break;

        std::string service;
        int value = 0;

        if (choice == 1) {
            service = "Read_Temp"; // 0 = temperature in Celsius 
        } else if (choice == 2 || choice == 3) {
            service = (choice == 2) ? "Fan_On" : "Set_Window";
            std::cout << (choice == 2 ? "Fan speed (0-75): " : "Window angle (0-50): ");
            if (!(std::cin >> value)) break;
            if (value < 0 || value > (choice == 2 ? 75 : 50)) { //value is capped at 75 for design reasons: we didnt want to draw too much power/create too much noise in this demo circuit
                std::cout << "Value out of range\n";
                continue;
            }
        } else {
            std::cout << "Invalid choice\n";
            continue;
        }

        try {
            //sending the service request and collecting the reply
            std::string reply = call_atlas(argv[1], service, value);
            //lambda function with a simplified json parser, for a clearer output 
            auto field = [&](const std::string& key) {

                size_t pos = reply.find("\"" + key + "\"");
                if (pos == std::string::npos) return std::string("N/A");
                pos = reply.find('"', reply.find(':', pos)) + 1;
                return reply.substr(pos, reply.find('"', pos) - pos);
            };
            std::cout << service << " | Status: " << field("Status")
                      << " | Result: " << field("Service Result") << '\n';
            Sleep(100); //euristic waiting time for cleanup of tcp connections
        } catch (const std::exception& error) {
            std::cerr << "Error: " << error.what() << '\n';
        }
    }

    WSACleanup();
    return 0;
}
