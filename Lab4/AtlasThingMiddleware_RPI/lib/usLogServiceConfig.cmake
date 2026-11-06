

set(US_LogService_LIBRARIES usLogService)
set(US_LogService_RUNTIME_LIBRARY_DIRS "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/bin")

if(NOT TARGET usLogService)
  include("${CMAKE_CURRENT_LIST_DIR}/usLogServiceTargets.cmake")
endif()
