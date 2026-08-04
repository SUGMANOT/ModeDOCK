#pragma once
#include <stdint.h>

#ifdef __cplusplus
#define MODDOCK_EXTERN_C extern "C"
#else
#define MODDOCK_EXTERN_C extern
#endif

#ifdef _WIN32
#define MODDOCK_EXPORT MODDOCK_EXTERN_C __declspec(dllexport)
#else
#define MODDOCK_EXPORT MODDOCK_EXTERN_C
#endif

MODDOCK_EXPORT uint32_t ModeDOCK_GetApiVersion(void);
MODDOCK_EXPORT const char* ModeDOCK_GetName(void);
MODDOCK_EXPORT const char* ModeDOCK_GetDescription(void);
MODDOCK_EXPORT int32_t ModeDOCK_TestPing(void);

/* Reserved for a future ABI. Hosts MUST NOT call these as part of ABI v1. */
/* ModeDOCK_Load, ModeDOCK_Unload, ModeDOCK_GetCapabilities */
