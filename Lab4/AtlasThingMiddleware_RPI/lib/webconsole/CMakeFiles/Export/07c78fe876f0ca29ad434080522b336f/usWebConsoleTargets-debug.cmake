#----------------------------------------------------------------
# Generated CMake target import file for configuration "Debug".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "usWebConsole" for configuration "Debug"
set_property(TARGET usWebConsole APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(usWebConsole PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/lib/libusWebConsoled.so.0.1.0"
  IMPORTED_SONAME_DEBUG "libusWebConsoled.so.0.1.0"
  )

list(APPEND _cmake_import_check_targets usWebConsole )
list(APPEND _cmake_import_check_files_for_usWebConsole "${_IMPORT_PREFIX}/lib/libusWebConsoled.so.0.1.0" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
