#define _WIN32_WINNT 0x0600
#include "amsys_client.h"

#include <windows.h>

#include <algorithm>
#include <string>

namespace {

std::wstring utf8ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
    std::wstring w(n > 0 ? n : 0, L'\0');
    if (n > 0) MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], n);
    return w;
}

// 取 JSON 对象中某个字符串字段的值（处理常见转义；字段缺失返回空）
std::string jsonStr(const std::string& json, const std::string& key) {
    std::string marker = "\"" + key + "\"";
    size_t pos = json.find(marker);
    if (pos == std::string::npos) return "";
    pos += marker.size();
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' ||
                                 json[pos] == '\n' || json[pos] == '\r'))
        pos++;
    if (pos >= json.size() || json[pos] != ':') return "";
    pos++;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' ||
                                 json[pos] == '\n' || json[pos] == '\r'))
        pos++;
    if (pos >= json.size() || json[pos] != '"') return "";
    pos++;
    std::string out;
    while (pos < json.size()) {
        char c = json[pos];
        if (c == '"') break;
        if (c == '\\' && pos + 1 < json.size()) {
            char n = json[pos + 1];
            switch (n) {
                case '"':  out += '"';  break;
                case '\\': out += '\\'; break;
                case '/':  out += '/';  break;
                case 'n':  out += '\n'; break;
                case 't':  out += '\t'; break;
                case 'r':  out += '\r'; break;
                default:   out += n;    break;
            }
            pos += 2;
            continue;
        }
        out += c;
        pos++;
    }
    return out;
}

long long jsonNum(const std::string& json, const std::string& key) {
    std::string marker = "\"" + key + "\"";
    size_t pos = json.find(marker);
    if (pos == std::string::npos) return 0;
    pos += marker.size();
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' ||
                                 json[pos] == '\n' || json[pos] == '\r'))
        pos++;
    if (pos >= json.size() || json[pos] != ':') return 0;
    pos++;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' ||
                                 json[pos] == '\n' || json[pos] == '\r'))
        pos++;
    long long v = 0;
    bool neg = false;
    if (pos < json.size() && json[pos] == '-') { neg = true; pos++; }
    while (pos < json.size() && json[pos] >= '0' && json[pos] <= '9') {
        v = v * 10 + (json[pos] - '0');
        pos++;
    }
    return neg ? -v : v;
}

} // namespace

AmsysPipe::AmsysPipe(const std::string& amsysExe) {
    HANDLE hInRead = nullptr, hInWrite = nullptr;
    HANDLE hOutRead = nullptr, hOutWrite = nullptr;
    SECURITY_ATTRIBUTES sa{};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;
    if (!CreatePipe(&hInRead, &hInWrite, &sa, 0)) return;
    if (!CreatePipe(&hOutRead, &hOutWrite, &sa, 0)) {
        CloseHandle(hInRead);
        CloseHandle(hInWrite);
        return;
    }
    SetHandleInformation(hInWrite, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(hOutRead, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = hInRead;
    si.hStdOutput = hOutWrite;
    si.hStdError = hOutWrite;

    PROCESS_INFORMATION pi{};
    std::wstring cmd = L"\"" + utf8ToWide(amsysExe) + L"\" --pipe";
    BOOL ok = CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, TRUE,
                             CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi);
    CloseHandle(hInRead);
    CloseHandle(hOutWrite);
    if (!ok) {
        CloseHandle(hInWrite);
        CloseHandle(hOutRead);
        return;
    }
    CloseHandle(pi.hThread);
    hProc_ = pi.hProcess;
    hStdinWrite_ = hInWrite;
    hStdoutRead_ = hOutRead;
    ok_ = true;
}

AmsysPipe::~AmsysPipe() { close(); }

void AmsysPipe::close() {
    ok_ = false;
    if (hStdinWrite_) {
        CloseHandle((HANDLE)hStdinWrite_);
        hStdinWrite_ = nullptr;
    }
    if (hStdoutRead_) {
        CloseHandle((HANDLE)hStdoutRead_);
        hStdoutRead_ = nullptr;
    }
    if (hProc_) {
        WaitForSingleObject((HANDLE)hProc_, 300);
        TerminateProcess((HANDLE)hProc_, 1);
        CloseHandle((HANDLE)hProc_);
        hProc_ = nullptr;
    }
}

std::string AmsysPipe::sendCommand(const std::string& cmd) {
    if (!ok_ || !hStdinWrite_ || !hStdoutRead_) return "{\"success\":false}";
    std::string full = cmd + "\n";
    DWORD written = 0;
    if (!WriteFile((HANDLE)hStdinWrite_, full.data(), (DWORD)full.size(), &written, nullptr))
        return "{\"success\":false}";

    ULONGLONG deadline = GetTickCount64() + 10000;
    while (true) {
        size_t nl = readBuf_.find('\n');
        if (nl != std::string::npos) {
            std::string line = readBuf_.substr(0, nl);
            if (!line.empty() && line.back() == '\r') line.pop_back();
            readBuf_.erase(0, nl + 1);
            return line;
        }
        if (GetTickCount64() > deadline) break;
        if (WaitForSingleObject((HANDLE)hProc_, 50) == WAIT_OBJECT_0) break;
        DWORD avail = 0;
        if (!PeekNamedPipe((HANDLE)hStdoutRead_, nullptr, 0, nullptr, &avail, nullptr))
            break;
        if (avail > 0) {
            char buf[4096];
            DWORD n = 0;
            if (!ReadFile((HANDLE)hStdoutRead_, buf,
                          (DWORD)std::min<size_t>(avail, sizeof(buf)), &n, nullptr) ||
                n == 0)
                break;
            readBuf_.append(buf, n);
        }
    }
    return "{\"success\":false}";
}

std::string AmsysPipe::extractWinPath(const std::string& json) const {
    if (json.find("\"success\":true") == std::string::npos &&
        json.find("\"success\": true") == std::string::npos)
        return {};
    const std::string marker = "\"winPath\":\"";
    auto p = json.find(marker);
    if (p == std::string::npos) return {};
    p += marker.size();
    std::string val;
    bool escape = false;
    for (; p < json.size(); ++p) {
        char c = json[p];
        if (escape) {
            if (c == '\\' || c == '"') val += c;
            else if (c == 'n') val += '\n';
            else if (c == 'r') val += '\r';
            else if (c == 't') val += '\t';
            else val += c;
            escape = false;
        } else if (c == '\\') {
            escape = true;
        } else if (c == '"') {
            break;
        } else {
            val += c;
        }
    }
    return val;
}

std::string AmsysPipe::resolve(const std::string& unixPath) {
    return extractWinPath(sendCommand("resolve " + unixPath));
}

std::string AmsysPipe::toWindows(const std::string& unixPath) {
    return extractWinPath(sendCommand("to_windows " + unixPath));
}

std::vector<AmsysEntry> AmsysPipe::listDir(const std::string& unixPath) {
    std::vector<AmsysEntry> out;
    std::string json = sendCommand("list_dir " + unixPath);
    if (json.find("\"success\":true") == std::string::npos &&
        json.find("\"success\": true") == std::string::npos)
        return out;
    size_t arr = json.find("\"entries\":");
    if (arr == std::string::npos) return out;
    arr = json.find('[', arr);
    if (arr == std::string::npos) return out;
    size_t i = arr + 1;
    while (true) {
        size_t ob = json.find('{', i);
        if (ob == std::string::npos) break;
        size_t cb = json.find('}', ob);
        if (cb == std::string::npos) break;
        std::string obj = json.substr(ob, cb - ob + 1);
        AmsysEntry e;
        e.name = jsonStr(obj, "name");
        e.type = jsonStr(obj, "type");
        e.size = jsonNum(obj, "size");
        e.virtualEntry = obj.find("\"is_virtual\":true") != std::string::npos ||
                         obj.find("\"is_virtual\": true") != std::string::npos;
        if (!e.name.empty()) out.push_back(std::move(e));
        i = cb + 1;
    }
    return out;
}
