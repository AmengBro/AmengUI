#include "config.h"
#include "path_manager.h"
#include "shell.h"
#include "utils.h"
#include <iostream>
#include <sstream>
#include <cstdlib>
#include <fstream>
#include <cstring>
#include <windows.h>
#include <io.h>
#include <fcntl.h>

std::string find_config_path() {
    char exe_path[MAX_PATH];
    GetModuleFileNameA(nullptr, exe_path, MAX_PATH);

    std::string exe_dir(exe_path);
    auto pos = exe_dir.find_last_of("\\/");
    if (pos != std::string::npos) {
        exe_dir = exe_dir.substr(0, pos);
    }

    std::string candidate = exe_dir + "\\config.ini";
    std::ifstream test(candidate);
    if (test.is_open()) return candidate;

    candidate = exe_dir + "\\..\\config.ini";
    test.open(candidate);
    if (test.is_open()) return candidate;

    candidate = "config.ini";
    test.open(candidate);
    if (test.is_open()) return candidate;

    return exe_dir + "\\config.ini";
}

// ── JSON helpers ───────────────────────────────────

static std::string json_escape(const std::string& s) {
    std::string r;
    for (char c : s) {
        switch (c) {
            case '"': r += "\\\""; break;
            case '\\': r += "\\\\"; break;
            case '\n': r += "\\n"; break;
            case '\r': r += "\\r"; break;
            case '\t': r += "\\t"; break;
            default: r += c;
        }
    }
    return r;
}

static std::string json_error(const char* msg, const char* code = "EINVAL") {
    return "{\"success\":false,\"error\":\"" + std::string(msg) + "\",\"code\":\"" + code + "\"}";
}

static std::string format_time(FILETIME ft) {
    SYSTEMTIME st;
    FileTimeToLocalFileTime(&ft, &ft);
    FileTimeToSystemTime(&ft, &st);
    char buf[32];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
             st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
    return buf;
}

// ── Pipe mode ──────────────────────────────────────

static void run_pipe_mode(amsys::PathManager& pm, const std::string& home_unix) {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (line.empty()) continue;

        std::stringstream ss(line);
        std::string cmd;
        ss >> cmd;

        std::string rest;
        std::getline(ss, rest);
        if (!rest.empty() && rest[0] == ' ') rest = rest.substr(1);

        // Expand ~ to home directory
        if (rest == "~") {
            rest = home_unix;
        } else if (rest.size() > 1 && rest[0] == '~' && (rest[1] == '/' || rest[1] == '\\')) {
            rest = home_unix + rest.substr(1);
        }

        std::string response;

        if (cmd == "resolve") {
            if (rest.empty()) {
                response = json_error("missing path", "EINVAL");
            } else {
                std::string resolved = pm.resolve(rest);
                if (resolved.empty()) {
                    response = json_error("no such file or directory", "ENOENT");
                } else if (pm.is_virtual_dir(resolved)) {
                    std::string r = "{\"success\":true,\"type\":\"virtual\",\"winPath\":null,\"children\":[";
                    auto children = pm.list_virtual_children(resolved);
                    for (size_t i = 0; i < children.size(); i++) {
                        if (i > 0) r += ",";
                        std::string child_path = resolved + "/" + children[i];
                        bool is_virt = pm.is_virtual_dir(child_path);
                        r += "{\"name\":\"" + json_escape(children[i]) +
                             "\",\"type\":\"dir\",\"is_virtual\":" +
                             (is_virt ? "true" : "false") + "}";
                    }
                    r += "]}";
                    response = r;
                } else {
                    std::string win_path = pm.to_windows(resolved);
                    if (win_path.empty()) {
                        response = json_error("path resolution failed", "EINVAL");
                    } else {
                        response = "{\"success\":true,\"type\":\"real\",\"winPath\":\"" +
                                   json_escape(amsys::acp_to_utf8(win_path)) + "\",\"children\":null}";
                    }
                }
            }
        }
        else if (cmd == "list_dir") {
            if (rest.empty()) {
                response = json_error("missing path", "EINVAL");
            } else {
                std::string resolved = pm.resolve(rest);
                if (resolved.empty()) {
                    response = json_error("no such file or directory", "ENOENT");
                } else if (pm.is_virtual_dir(resolved)) {
                    std::string r = "{\"success\":true,\"entries\":[";
                    auto children = pm.list_virtual_children(resolved);
                    for (size_t i = 0; i < children.size(); i++) {
                        if (i > 0) r += ",";
                        std::string child_path = resolved + "/" + children[i];
                        bool is_virt = pm.is_virtual_dir(child_path);
                        r += "{\"name\":\"" + json_escape(children[i]) +
                             "\",\"type\":\"dir\",\"is_virtual\":" +
                             (is_virt ? "true" : "false") + "}";
                    }
                    r += "]}";
                    response = r;
                } else {
                    std::string win_path = pm.to_windows(resolved);
                    if (win_path.empty()) {
                        response = json_error("path resolution failed", "EINVAL");
                    } else {
                        std::wstring wpath = amsys::utf8_to_wide(amsys::acp_to_utf8(win_path));
                        std::wstring search = wpath;
                        if (search.back() != L'\\') search += L'\\';
                        search += L'*';

                        std::string r = "{\"success\":true,\"entries\":[";
                        bool first = true;
                        WIN32_FIND_DATAW ffd;
                        HANDLE hFind = FindFirstFileW(search.c_str(), &ffd);
                        if (hFind != INVALID_HANDLE_VALUE) {
                            do {
                                std::wstring wn = ffd.cFileName;
                                if (wn == L"." || wn == L"..") continue;

                                // Skip .floder files
                                if (wn.size() > 7 &&
                                    wn.substr(wn.size() - 7) == L".floder") continue;

                                int len = WideCharToMultiByte(CP_UTF8, 0, wn.c_str(), -1,
                                                              nullptr, 0, nullptr, nullptr);
                                std::string name(static_cast<size_t>(len) - 1, '\0');
                                WideCharToMultiByte(CP_UTF8, 0, wn.c_str(), -1,
                                                     &name[0], len, nullptr, nullptr);

                                bool is_dir = (ffd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
                                LARGE_INTEGER sz;
                                sz.LowPart = ffd.nFileSizeLow;
                                sz.HighPart = ffd.nFileSizeHigh;

                                if (!first) r += ",";
                                first = false;
                                r += "{\"name\":\"" + json_escape(name) +
                                     "\",\"type\":\"" + (is_dir ? "dir" : "file") +
                                     "\",\"size\":" + std::to_string((long long)sz.QuadPart) +
                                     ",\"mtime\":\"" + format_time(ffd.ftLastWriteTime) + "\"}";
                            } while (FindNextFileW(hFind, &ffd));
                            FindClose(hFind);
                        }
                        r += "]}";
                        response = r;
                    }
                }
            }
        }
        else if (cmd == "to_windows") {
            if (rest.empty()) {
                response = json_error("missing path", "EINVAL");
            } else {
                std::string resolved = pm.resolve(rest);
                if (resolved.empty()) {
                    response = json_error("path resolution failed", "ENOENT");
                } else if (pm.is_virtual_dir(resolved)) {
                    response = json_error("not a real path", "ENOENT");
                } else {
                    std::string win = pm.to_windows(resolved);
                    if (win.empty()) {
                        response = json_error("not a real path", "ENOENT");
                    } else {
                        response = "{\"success\":true,\"winPath\":\"" + json_escape(amsys::acp_to_utf8(win)) + "\"}";
                    }
                }
            }
        }
        else {
            response = json_error("unknown command", "EINVAL");
        }

        std::cout << response << std::endl;
    }
}

// ── Ctrl+C handler ──
volatile bool g_ctrl_c = false;

static BOOL WINAPI ctrl_handler(DWORD dwCtrlType) {
    if (dwCtrlType == CTRL_C_EVENT || dwCtrlType == CTRL_BREAK_EVENT) {
        g_ctrl_c = true;
        return TRUE;
    }
    return FALSE;
}

// ── main ───────────────────────────────────────────

int main(int argc, char* argv[]) {
    SetConsoleCtrlHandler(ctrl_handler, TRUE);
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
    HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
    if (hOut != INVALID_HANDLE_VALUE) {
        DWORD mode = 0;
        if (GetConsoleMode(hOut, &mode)) {
            mode |= ENABLE_VIRTUAL_TERMINAL_PROCESSING;
            SetConsoleMode(hOut, mode);
        }
    }

    bool sudo_mode = false;
    bool pipe_mode = false;
    bool create_mode = false;
    std::string username = "root";
    std::string pipe_base;
    std::string exec_cmd;
    std::string tmpfile;
    std::string sudo_cwd;
    HANDLE hPipeStdin = INVALID_HANDLE_VALUE;
    HANDLE hPipeStdout = INVALID_HANDLE_VALUE;

    for (int i = 1; i < argc; i++) {
        if (i + 1 < argc && strcmp(argv[i], "--user") == 0) {
            username = argv[++i];
        } else if (strcmp(argv[i], "--sudo") == 0) {
            sudo_mode = true;
        } else if (strcmp(argv[i], "--create") == 0) {
            create_mode = true;
        } else if (strcmp(argv[i], "--pipe") == 0) {
            pipe_mode = true;
        } else if (strncmp(argv[i], "--pipe=", 7) == 0) {
            pipe_base = argv[i] + 7;
        } else if (strncmp(argv[i], "--exec=", 7) == 0) {
            exec_cmd = argv[i] + 7;
        } else if (strncmp(argv[i], "--cwd=", 6) == 0) {
            sudo_cwd = argv[i] + 6;
        } else if (strncmp(argv[i], "--tmpfile=", 10) == 0) {
            tmpfile = argv[i] + 10;
        }
    }

    // ── Sudo named pipe setup ──
    if (sudo_mode && !pipe_base.empty()) {
        std::string stdin_pipe = pipe_base + "_stdin";
        std::string stdout_pipe = pipe_base + "_stdout";

        while (true) {
            hPipeStdin = CreateFileA(stdin_pipe.c_str(), GENERIC_READ,
                                     FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
            if (hPipeStdin != INVALID_HANDLE_VALUE) break;
            if (GetLastError() != ERROR_PIPE_BUSY) break;
            WaitNamedPipeA(stdin_pipe.c_str(), 5000);
        }

        while (true) {
            hPipeStdout = CreateFileA(stdout_pipe.c_str(), GENERIC_WRITE,
                                      FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
            if (hPipeStdout != INVALID_HANDLE_VALUE) break;
            if (GetLastError() != ERROR_PIPE_BUSY) break;
            WaitNamedPipeA(stdout_pipe.c_str(), 5000);
        }

        if (hPipeStdin != INVALID_HANDLE_VALUE && hPipeStdout != INVALID_HANDLE_VALUE) {
            SetStdHandle(STD_INPUT_HANDLE, hPipeStdin);
            SetStdHandle(STD_OUTPUT_HANDLE, hPipeStdout);
            SetStdHandle(STD_ERROR_HANDLE, hPipeStdout);

            int stdin_fd = _open_osfhandle((intptr_t)hPipeStdin, _O_RDONLY | _O_TEXT);
            if (stdin_fd != -1) {
                _dup2(stdin_fd, _fileno(stdin));
                _close(stdin_fd);
            }

            int stdout_fd = _open_osfhandle((intptr_t)hPipeStdout, _O_WRONLY | _O_TEXT);
            if (stdout_fd != -1) {
                _dup2(stdout_fd, _fileno(stdout));
                _close(stdout_fd);
            }

            int stderr_fd = _open_osfhandle((intptr_t)hPipeStdout, _O_WRONLY | _O_TEXT);
            if (stderr_fd != -1) {
                _dup2(stderr_fd, _fileno(stderr));
                _close(stderr_fd);
            }

            std::ios::sync_with_stdio(true);
        }
    }

    // ── Load configuration ──
    amsys::Config config;
    std::string config_path = find_config_path();
    config.load(config_path);

    // ── --exec mode ──
    if (sudo_mode && !exec_cmd.empty()) {
        if (!tmpfile.empty()) {
            FILE* f = freopen(tmpfile.c_str(), "w", stdout);
            if (f) freopen(tmpfile.c_str(), "w", stderr);
        }

        amsys::Shell shell(config, true, username);
        if (!sudo_cwd.empty()) {
            shell.set_cwd(sudo_cwd);
        }
        shell.execute(exec_cmd);

        if (!tmpfile.empty()) {
            fclose(stdout);
            fclose(stderr);
        }
        return 0;
    }

    // ── --create mode: rebuild needed directories and exit ──
    if (create_mode) {
        amsys::Shell shell(config, false, username);
        return 0;
    }

    // ── --pipe mode (JSON-line protocol) ──
    if (pipe_mode) {
        amsys::PathManager pm(config);
        std::string home_unix = (username == "root") ? "/root" : "/home/" + username;
        run_pipe_mode(pm, home_unix);
        return 0;
    }

    // ── Interactive shell ──
    amsys::Shell shell(config, sudo_mode, username);
    if (!sudo_cwd.empty()) {
        shell.set_cwd(sudo_cwd);
    }
    shell.run();

    if (hPipeStdin != INVALID_HANDLE_VALUE) CloseHandle(hPipeStdin);
    if (hPipeStdout != INVALID_HANDLE_VALUE) CloseHandle(hPipeStdout);

    return 0;
}
