

set(US_DeclarativeServices_LIBRARIES DeclarativeServices)
set(US_DeclarativeServices_RUNTIME_LIBRARY_DIRS "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/bin")

if(NOT TARGET DeclarativeServices)
  include("${CMAKE_CURRENT_LIST_DIR}/usDeclarativeServicesTargets.cmake")
endif()
