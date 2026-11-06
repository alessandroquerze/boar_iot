

set(US_Framework_LIBRARIES CppMicroServices)
set(US_Framework_RUNTIME_LIBRARY_DIRS "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/bin")

if(NOT TARGET CppMicroServices)
  include("${CMAKE_CURRENT_LIST_DIR}/usFrameworkTargets.cmake")
endif()
