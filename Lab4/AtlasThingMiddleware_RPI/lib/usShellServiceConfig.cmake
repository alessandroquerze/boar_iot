

set(US_ShellService_LIBRARIES usShellService)
set(US_ShellService_RUNTIME_LIBRARY_DIRS "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/bin")

if(NOT TARGET usShellService)
  include("${CMAKE_CURRENT_LIST_DIR}/usShellServiceTargets.cmake")
endif()
