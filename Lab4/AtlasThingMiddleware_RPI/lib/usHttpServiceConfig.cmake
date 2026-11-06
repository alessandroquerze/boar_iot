

set(US_HttpService_LIBRARIES usHttpService)
set(US_HttpService_RUNTIME_LIBRARY_DIRS "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/bin")

if(NOT TARGET usHttpService)
  include("${CMAKE_CURRENT_LIST_DIR}/usHttpServiceTargets.cmake")
endif()
