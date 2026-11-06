#----------------------------------------------------------------
# Generated CMake target import file for configuration "Debug".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "usServiceComponent" for configuration "Debug"
set_property(TARGET usServiceComponent APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(usServiceComponent PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/lib/libusServiceComponentd.so"
  IMPORTED_SONAME_DEBUG "libusServiceComponentd.so"
  )

list(APPEND _cmake_import_check_targets usServiceComponent )
list(APPEND _cmake_import_check_files_for_usServiceComponent "${_IMPORT_PREFIX}/lib/libusServiceComponentd.so" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
