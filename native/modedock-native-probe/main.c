#define _WIN32_WINNT 0x0602
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <io.h>

typedef uint32_t (*get_api_version_fn)(void);
typedef const char* (*get_string_fn)(void);
typedef int32_t (*test_ping_fn)(void);

static void json_string(const char* value) {
    const unsigned char* cursor = (const unsigned char*)value;
    putchar('"');
    while (*cursor) {
        unsigned char c = *cursor++;
        if (c == '"' || c == '\\') { putchar('\\'); putchar((int)c); }
        else if (c == '\b') fputs("\\b", stdout);
        else if (c == '\f') fputs("\\f", stdout);
        else if (c == '\n') fputs("\\n", stdout);
        else if (c == '\r') fputs("\\r", stdout);
        else if (c == '\t') fputs("\\t", stdout);
        else if (c < 0x20) fprintf(stdout, "\\u%04x", (unsigned)c);
        else putchar((int)c);
    }
    putchar('"');
}

static int fail_json(const char* status, const char* code, DWORD system_error, int exit_code) {
    fputs("{\"status\":", stdout); json_string(status);
    fputs(",\"code\":", stdout); json_string(code);
    fprintf(stdout, ",\"systemError\":%lu}\n", (unsigned long)system_error);
    return exit_code;
}

static int copy_plugin_string(const char* source, char destination[4097]) {
    size_t index;
    if (!source) return 0;
    for (index = 0; index <= 4096; index++) {
        destination[index] = source[index];
        if (source[index] == '\0') return 1;
    }
    destination[4096] = '\0';
    return 0;
}

static HANDLE establish_job(void) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
    HANDLE job = CreateJobObjectW(NULL, NULL);
    if (!job) return NULL;
    ZeroMemory(&limits, sizeof(limits));
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
    limits.BasicLimitInformation.ActiveProcessLimit = 1;
    if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits)) ||
        !AssignProcessToJobObject(job, GetCurrentProcess())) {
        CloseHandle(job);
        return NULL;
    }
    return job;
}

static void redirect_standard_streams(int* saved_stdout, int* saved_stderr, int* null_fd) {
    fflush(stdout); fflush(stderr);
    *saved_stdout = _dup(_fileno(stdout));
    *saved_stderr = _dup(_fileno(stderr));
    *null_fd = _open("NUL", _O_WRONLY);
    if (*null_fd >= 0) {
        _dup2(*null_fd, _fileno(stdout));
        _dup2(*null_fd, _fileno(stderr));
    }
}

static void restore_standard_streams(int saved_stdout, int saved_stderr, int null_fd) {
    fflush(stdout); fflush(stderr);
    if (saved_stdout >= 0) { _dup2(saved_stdout, _fileno(stdout)); _close(saved_stdout); }
    if (saved_stderr >= 0) { _dup2(saved_stderr, _fileno(stderr)); _close(saved_stderr); }
    if (null_fd >= 0) _close(null_fd);
}

int main(void) {
    int argc = 0, execute_probe = 0, index;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    LPCWSTR dll_path = NULL;
    HANDLE job;
    HMODULE module;
    get_api_version_fn get_api_version;
    get_string_fn get_name, get_description;
    test_ping_fn test_ping;
    uint32_t api_version;
    int32_t ping;
    char name[4097], description[4097];
    int saved_stdout = -1, saved_stderr = -1, null_fd = -1;

    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
    if (!argv) return fail_json("error", "argument-decode-failed", GetLastError(), 10);
    for (index = 1; index < argc; index++) {
        if (wcscmp(argv[index], L"--execute-probe") == 0) execute_probe = 1;
        else if (wcscmp(argv[index], L"--json") != 0 && argv[index][0] != L'-' && !dll_path) dll_path = argv[index];
    }
    if (!dll_path) { LocalFree(argv); return fail_json("error", "missing-dll-path", 0, 10); }
    if (!execute_probe) {
        fputs("{\"status\":\"not-executed\",\"executed\":false}\n", stdout);
        LocalFree(argv);
        return 0;
    }

    job = establish_job();
    if (!job) { DWORD error = GetLastError(); LocalFree(argv); return fail_json("error", "job-object-failed", error, 11); }
    SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    redirect_standard_streams(&saved_stdout, &saved_stderr, &null_fd);
    module = LoadLibraryExW(dll_path, NULL, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!module) {
        DWORD error = GetLastError();
        restore_standard_streams(saved_stdout, saved_stderr, null_fd);
        fprintf(stderr, "LoadLibraryExW failed with Windows error %lu.\n", (unsigned long)error);
        LocalFree(argv);
        return fail_json("error", "load-failed", error, 20);
    }

    get_api_version = (get_api_version_fn)GetProcAddress(module, "ModeDOCK_GetApiVersion");
    get_name = (get_string_fn)GetProcAddress(module, "ModeDOCK_GetName");
    get_description = (get_string_fn)GetProcAddress(module, "ModeDOCK_GetDescription");
    test_ping = (test_ping_fn)GetProcAddress(module, "ModeDOCK_TestPing");
    if (!get_api_version || !get_name || !get_description || !test_ping) {
        FreeLibrary(module); restore_standard_streams(saved_stdout, saved_stderr, null_fd);
        LocalFree(argv);
        return fail_json("invalid-native-plugin", "missing-required-export", 0, 21);
    }

    api_version = get_api_version();
    ping = test_ping();
    if (!copy_plugin_string(get_name(), name) || !copy_plugin_string(get_description(), description)) {
        FreeLibrary(module); restore_standard_streams(saved_stdout, saved_stderr, null_fd);
        LocalFree(argv);
        return fail_json("invalid-native-plugin", "invalid-plugin-string", 0, 24);
    }
    FreeLibrary(module);
    restore_standard_streams(saved_stdout, saved_stderr, null_fd);
    LocalFree(argv);

    if (api_version != 1) return fail_json("unsupported-api-version", "unsupported-api-version", 0, 22);
    if (ping != 1) return fail_json("self-test-failed", "test-ping-failed", 0, 23);
    fprintf(stdout, "{\"apiVersion\":%u,\"name\":", (unsigned)api_version); json_string(name);
    fputs(",\"description\":", stdout); json_string(description);
    fprintf(stdout, ",\"ping\":%ld,\"status\":\"ok\",\"executed\":true}\n", (long)ping);
    return 0;
}
