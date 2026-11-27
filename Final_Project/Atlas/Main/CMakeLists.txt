cmake_minimum_required (VERSION 3.10)

project (Atlas)

set(CMAKE_CXX_FLAGS "-w -pthread -Wno-write-strings -std=c++14 -Wall -fPIC -I.")

option(DTLS "Enable DTLS" OFF)

include(${CMAKE_CURRENT_LIST_DIR}/../lib/OMALib/core/wakaama.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/../lib/OMALib/shared/shared.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/../Architecture/architect.cmake)
#include(${CMAKE_CURRENT_LIST_DIR}/../lib/CRYPTOPPLib/cryptopp.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/../lib/PahoMQTT/PAHOMQTT.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/../lib/CoAPLib/COAPLIB.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/../lib/tinyxml/tinyxml2.cmake)

add_definitions(-DLWM2M_CLIENT_MODE -DLWM2M_BOOTSTRAP -DLWM2M_SUPPORT_JSON)
add_definitions(${SHARED_DEFINITIONS} ${WAKAAMA_DEFINITIONS})

include_directories (${WAKAAMA_SOURCES_DIR} ${SHARED_INCLUDE_DIRS} ${TINYXML2_SOURCES_DIR} ${ARCHITECT_SOURCES_DIR} ${PAHOMQTT_SOURCES_DIR} ${COAPLIB_SOURCES_DIR})

include_directories (${CMAKE_CURRENT_LIST_DIR}/../lib/JSON/include ${CMAKE_CURRENT_LIST_DIR}/../lib/include)

SET(SOURCES
    AtlasMain.cpp
    )

add_executable(${PROJECT_NAME} ${SOURCES} ${WAKAAMA_SOURCES} ${SHARED_SOURCES} ${TINYXML2_SOURCES} ${ARCHITECT_SOURCES} ${PAHOMQTT_SOURCES} ${COAPLIB_SOURCES})

# The packaged ARM64 library keeps the middleware independent of the old Pi installation.
target_link_libraries(${PROJECT_NAME}
    "${CMAKE_CURRENT_LIST_DIR}/../lib/lib/libCppMicroServicesd.so.4.0.0"
    curl)
set_target_properties(${PROJECT_NAME} PROPERTIES
    BUILD_WITH_INSTALL_RPATH TRUE
    INSTALL_RPATH "$ORIGIN/../lib/lib")
set_property(TARGET ${PROJECT_NAME} APPEND PROPERTY COMPILE_DEFINITIONS $<$<CONFIG:Debug>:WITH_LOGS>)
