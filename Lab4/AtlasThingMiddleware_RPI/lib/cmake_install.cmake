# Install script for directory: /home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development

# Set the install prefix
if(NOT DEFINED CMAKE_INSTALL_PREFIX)
  set(CMAKE_INSTALL_PREFIX "/usr/local")
endif()
string(REGEX REPLACE "/$" "" CMAKE_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")

# Set the install configuration name.
if(NOT DEFINED CMAKE_INSTALL_CONFIG_NAME)
  if(BUILD_TYPE)
    string(REGEX REPLACE "^[^A-Za-z0-9_]+" ""
           CMAKE_INSTALL_CONFIG_NAME "${BUILD_TYPE}")
  else()
    set(CMAKE_INSTALL_CONFIG_NAME "Debug")
  endif()
  message(STATUS "Install configuration: \"${CMAKE_INSTALL_CONFIG_NAME}\"")
endif()

# Set the component getting installed.
if(NOT CMAKE_INSTALL_COMPONENT)
  if(COMPONENT)
    message(STATUS "Install component: \"${COMPONENT}\"")
    set(CMAKE_INSTALL_COMPONENT "${COMPONENT}")
  else()
    set(CMAKE_INSTALL_COMPONENT)
  endif()
endif()

# Install shared libraries without execute permission?
if(NOT DEFINED CMAKE_INSTALL_SO_NO_EXE)
  set(CMAKE_INSTALL_SO_NO_EXE "1")
endif()

# Is this installation the result of a crosscompile?
if(NOT DEFINED CMAKE_CROSSCOMPILING)
  set(CMAKE_CROSSCOMPILING "FALSE")
endif()

# Set default install directory permissions.
if(NOT DEFINED CMAKE_OBJDUMP)
  set(CMAKE_OBJDUMP "/usr/bin/objdump")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/share/cppmicroservices4/cmake/CppMicroServicesTargets.cmake")
    file(DIFFERENT _cmake_export_file_changed FILES
         "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/share/cppmicroservices4/cmake/CppMicroServicesTargets.cmake"
         "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CMakeFiles/Export/07c78fe876f0ca29ad434080522b336f/CppMicroServicesTargets.cmake")
    if(_cmake_export_file_changed)
      file(GLOB _cmake_old_config_files "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/share/cppmicroservices4/cmake/CppMicroServicesTargets-*.cmake")
      if(_cmake_old_config_files)
        string(REPLACE ";" ", " _cmake_old_config_files_text "${_cmake_old_config_files}")
        message(STATUS "Old export file \"$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/share/cppmicroservices4/cmake/CppMicroServicesTargets.cmake\" will be replaced.  Removing files [${_cmake_old_config_files_text}].")
        unset(_cmake_old_config_files_text)
        file(REMOVE ${_cmake_old_config_files})
      endif()
      unset(_cmake_old_config_files)
    endif()
    unset(_cmake_export_file_changed)
  endif()
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/share/cppmicroservices4/cmake" TYPE FILE FILES "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CMakeFiles/Export/07c78fe876f0ca29ad434080522b336f/CppMicroServicesTargets.cmake")
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/share/cppmicroservices4/cmake" TYPE FILE FILES "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CMakeFiles/Export/07c78fe876f0ca29ad434080522b336f/CppMicroServicesTargets-debug.cmake")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/share/cppmicroservices4/cmake" TYPE FILE FILES
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development/cmake/BundleInit.cpp"
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development/cmake/CMakeResourceDependencies.cpp"
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development/cmake/usFunctionGenerateBundleInit.cmake"
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development/cmake/usFunctionAddResources.cmake"
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development/cmake/usFunctionEmbedResources.cmake"
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development/cmake/usFunctionGetResourceSource.cmake"
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development/cmake/usFunctionCheckResourceLinking.cmake"
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServices-development/cmake/usFunctionCheckCompilerFlags.cmake"
    )
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/cppmicroservices4/cppmicroservices" TYPE FILE FILES "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/include/cppmicroservices/GlobalConfig.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "sdk" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/share/cppmicroservices4/cmake" TYPE FILE FILES
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CMakeFiles/CppMicroServicesConfig.cmake"
    "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/CppMicroServicesConfigVersion.cmake"
    )
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for each subdirectory.
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/third_party/absl/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/tools/rc/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/tools/jsonschemavalidator/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/util/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/framework/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/httpservice/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/webconsole/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/shellservice/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/compendium/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/tools/shell/cmake_install.cmake")
  include("/home/boar/lab4/AtlasThingMiddleware_RPI/lib/doc/cmake_install.cmake")

endif()

if(CMAKE_INSTALL_COMPONENT)
  set(CMAKE_INSTALL_MANIFEST "install_manifest_${CMAKE_INSTALL_COMPONENT}.txt")
else()
  set(CMAKE_INSTALL_MANIFEST "install_manifest.txt")
endif()

string(REPLACE ";" "\n" CMAKE_INSTALL_MANIFEST_CONTENT
       "${CMAKE_INSTALL_MANIFEST_FILES}")
file(WRITE "/home/boar/lab4/AtlasThingMiddleware_RPI/lib/${CMAKE_INSTALL_MANIFEST}"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
