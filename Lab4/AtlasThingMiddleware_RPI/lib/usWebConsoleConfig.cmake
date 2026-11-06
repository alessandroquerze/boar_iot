

set(US_WebConsole_LIBRARIES usWebConsole)
set(US_WebConsole_RUNTIME_LIBRARY_DIRS "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/bin")

if(NOT TARGET usWebConsole)
  include("${CMAKE_CURRENT_LIST_DIR}/usWebConsoleTargets.cmake")
endif()
