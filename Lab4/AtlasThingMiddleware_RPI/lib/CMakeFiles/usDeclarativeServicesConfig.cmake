
####### Expanded from @PACKAGE_INIT@ by configure_package_config_file() #######
####### Any changes to this file will be overwritten by the next CMake run ####
####### The input file was usBundleConfig.cmake.in                            ########

get_filename_component(PACKAGE_PREFIX_DIR "${CMAKE_CURRENT_LIST_DIR}/../../../" ABSOLUTE)

####################################################################################

set(US_DeclarativeServices_LIBRARIES DeclarativeServices)
set(US_DeclarativeServices_RUNTIME_LIBRARY_DIRS "${PACKAGE_PREFIX_DIR}/bin/")

if(NOT TARGET DeclarativeServices)
  include("${CMAKE_CURRENT_LIST_DIR}/usDeclarativeServicesTargets.cmake")
endif()
