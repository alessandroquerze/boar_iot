#----------------------------------------------------------------
# Generated CMake target import file for configuration "Debug".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "usShellService" for configuration "Debug"
set_property(TARGET usShellService APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(usShellService PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/lib/libusShellServiced.so.0.1.0"
  IMPORTED_SONAME_DEBUG "libusShellServiced.so.0.1.0"
  )

list(APPEND _cmake_import_check_targets usShellService )
list(APPEND _cmake_import_check_files_for_usShellService "${_IMPORT_PREFIX}/lib/libusShellServiced.so.0.1.0" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
