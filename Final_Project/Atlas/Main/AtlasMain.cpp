// Starts the native MQTT announcements and the Atlas TCP service listener.

#include "../Architecture/Communication_Manager.h"

#include <cstdlib>
#include <exception>
#include <iostream>
#include <thread>

int main() {
    try {
        Communication_Manager manager;
        std::thread publisher(&Communication_Manager::MQTT_Publish, &manager);
        manager.CaptureAPIcalls_IPSocket();
        publisher.join();
    } catch (const std::exception& error) {
        std::cerr << "Atlas startup failed: " << error.what() << std::endl;
        return EXIT_FAILURE;
    }
    return EXIT_SUCCESS;
}
