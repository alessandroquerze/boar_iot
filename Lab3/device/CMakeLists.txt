# Build:
#   mkdir -p build && cd build && cmake .. && make
# Run (broker host/port are optional, default localhost:1883):
#   ./main [broker_host] [broker_port]
#   e.g. ./main 192.168.8.189 1883

cmake_minimum_required(VERSION 3.10)
project(main)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(PkgConfig REQUIRED)
pkg_check_modules(MOSQUITTO REQUIRED libmosquitto)
find_package(nlohmann_json REQUIRED)
find_package(Threads REQUIRED)

add_executable(main main.cpp)
target_include_directories(main PRIVATE ${MOSQUITTO_INCLUDE_DIRS})
target_link_directories(main PRIVATE ${MOSQUITTO_LIBRARY_DIRS})
target_link_libraries(main PRIVATE ${MOSQUITTO_LIBRARIES} nlohmann_json::nlohmann_json wiringPi Threads::Threads)
