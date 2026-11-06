

set(US_ServiceComponent_LIBRARIES usServiceComponent)
set(US_ServiceComponent_RUNTIME_LIBRARY_DIRS "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/bin")

if(NOT TARGET usServiceComponent)
  include("${CMAKE_CURRENT_LIST_DIR}/usServiceComponentTargets.cmake")
endif()
