#----------------------------------------------------------------
# Generated CMake target import file for configuration "Debug".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "usLogService" for configuration "Debug"
set_property(TARGET usLogService APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(usLogService PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/lib/libusLogServiced.so"
  IMPORTED_SONAME_DEBUG "libusLogServiced.so"
  )

list(APPEND _cmake_import_check_targets usLogService )
list(APPEND _cmake_import_check_files_for_usLogService "${_IMPORT_PREFIX}/lib/libusLogServiced.so" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
