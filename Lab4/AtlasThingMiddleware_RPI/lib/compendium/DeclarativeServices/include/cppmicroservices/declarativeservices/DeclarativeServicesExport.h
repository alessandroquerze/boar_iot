///-------------------------------------------------------------------
// Macros for import/export declarations
//-------------------------------------------------------------------

#ifndef CPPMICROSERVICES_DeclarativeServicesEXPORT_H
#define CPPMICROSERVICES_DeclarativeServicesEXPORT_H

#include "cppmicroservices/GlobalConfig.h"

#ifdef US_BUILD_SHARED_LIBS
  // We are building a shared lib
  #ifdef DeclarativeServices_EXPORTS
    #define US_DeclarativeServices_EXPORT US_ABI_EXPORT
  #else
    #define US_DeclarativeServices_EXPORT US_ABI_IMPORT
  #endif
#else
  // We are building a static lib
  // Don't hide RTTI symbols of definitions in the C++ Micro Services
  // headers that are included in DSOs with hidden visibility
  #define US_DeclarativeServices_EXPORT US_ABI_EXPORT
#endif

#endif // CPPMICROSERVICES_DeclarativeServicesEXPORT_H
