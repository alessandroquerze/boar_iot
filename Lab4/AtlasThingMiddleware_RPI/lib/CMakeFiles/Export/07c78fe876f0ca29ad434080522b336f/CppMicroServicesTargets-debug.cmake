#----------------------------------------------------------------
# Generated CMake target import file for configuration "Debug".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "usResourceCompiler" for configuration "Debug"
set_property(TARGET usResourceCompiler APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(usResourceCompiler PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/bin/usResourceCompiler4"
  )

list(APPEND _cmake_import_check_targets usResourceCompiler )
list(APPEND _cmake_import_check_files_for_usResourceCompiler "${_IMPORT_PREFIX}/bin/usResourceCompiler4" )

# Import target "jsonschemavalidator" for configuration "Debug"
set_property(TARGET jsonschemavalidator APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(jsonschemavalidator PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/bin/jsonschemavalidator"
  )

list(APPEND _cmake_import_check_targets jsonschemavalidator )
list(APPEND _cmake_import_check_files_for_jsonschemavalidator "${_IMPORT_PREFIX}/bin/jsonschemavalidator" )

# Import target "SCRCodeGen" for configuration "Debug"
set_property(TARGET SCRCodeGen APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(SCRCodeGen PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/bin/SCRCodeGen4"
  )

list(APPEND _cmake_import_check_targets SCRCodeGen )
list(APPEND _cmake_import_check_files_for_SCRCodeGen "${_IMPORT_PREFIX}/bin/SCRCodeGen4" )

# Import target "usShell" for configuration "Debug"
set_property(TARGET usShell APPEND PROPERTY IMPORTED_CONFIGURATIONS DEBUG)
set_target_properties(usShell PROPERTIES
  IMPORTED_LOCATION_DEBUG "${_IMPORT_PREFIX}/bin/usShell4"
  )

list(APPEND _cmake_import_check_targets usShell )
list(APPEND _cmake_import_check_files_for_usShell "${_IMPORT_PREFIX}/bin/usShell4" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
