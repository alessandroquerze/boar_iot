#----------------------------------------------------------------
# Generated CMake target import file for configuration "Debug".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "CppMicroServices" for configuration "Debug"
set_property(TARGET CppMicroServices APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(CppMicroServices PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/lib/libCppMicroServicesd.so.4.0.0"
  IMPORTED_SONAME_DEBUG "libCppMicroServicesd.so.4.0.0"
  )

list(APPEND _cmake_import_check_targets CppMicroServices )
list(APPEND _cmake_import_check_files_for_CppMicroServices "${_IMPORT_PREFIX}/lib/libCppMicroServicesd.so.4.0.0" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
