#ifndef UTILS_H
#define UTILS_H

#include <string>
#include <vector>
#include <algorithm>
#include <cctype>
#include <sstream>
#include <cstring>
#include <windows.h>

namespace amsys {

// Trim whitespace from both ends
inline std::string trim(std::string s) {
    auto not_space = [](unsigned char ch) { return !std::isspace(ch); };
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), not_space));
    s.erase(std::find_if(s.rbegin(), s.rend(), not_space).base(), s.end());
    return s;
}

// Split string by delimiter
inline std::vector<std::string> split(const std::string& s, char delim) {
    std::vector<std::string> parts;
    std::stringstream ss(s);
    std::string item;
    while (std::getline(ss, item, delim)) {
        parts.push_back(item);
    }
    return parts;
}

// Replace all occurrences of 'from' with 'to'
inline std::string replace_all(std::string s, const std::string& from, const std::string& to) {
    size_t pos = 0;
    while ((pos = s.find(from, pos)) != std::string::npos) {
        s.replace(pos, from.length(), to);
        pos += to.length();
    }
    return s;
}

// Convert to lowercase
inline std::string to_lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return s;
}

// Normalize path separators: replace / with \ on Windows
inline std::string to_windows_sep(const std::string& path) {
    return replace_all(path, "/", "\\");
}

// Normalize path separators: replace \ with /
inline std::string to_unix_sep(const std::string& path) {
    return replace_all(path, "\\", "/");
}

// Check if string starts with prefix
inline bool starts_with(const std::string& s, const std::string& prefix) {
    return s.size() >= prefix.size() &&
           std::equal(prefix.begin(), prefix.end(), s.begin());
}

// Check if string ends with suffix
inline bool ends_with(const std::string& s, const std::string& suffix) {
    return s.size() >= suffix.size() &&
           std::equal(suffix.rbegin(), suffix.rend(), s.rbegin());
}

// Expand %VAR% environment variables in a string
inline std::string expand_env_vars(const std::string& s) {
    std::string result = s;
    size_t start = 0;
    while ((start = result.find('%', start)) != std::string::npos) {
        size_t end = result.find('%', start + 1);
        if (end == std::string::npos) break;
        std::string var = result.substr(start + 1, end - start - 1);
        const char* val = std::getenv(var.c_str());
        if (val) {
            result.replace(start, end - start + 1, val);
            start += strlen(val);
        } else {
            start = end + 1;
        }
    }
    return result;
}

// Get the directory part of a path (everything before last / or \)
inline std::string dirname(const std::string& path) {
    auto pos = path.find_last_of("/\\");
    if (pos == std::string::npos) return ".";
    if (pos == 0) return "/";
    return path.substr(0, pos);
}

// ─── UTF-8 ↔ System ANSI (CP_ACP) encoding helpers ─────

// UTF-8 → UTF-16 (wide)
inline std::wstring utf8_to_wide(const std::string& utf8) {
    if (utf8.empty()) return {};
    int len = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
    if (len <= 0) return {};
    std::wstring buf(static_cast<size_t>(len) - 1, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, &buf[0], len);
    return buf;
}

// UTF-16 (wide) → System ANSI (e.g. GBK on Chinese Windows)
inline std::string wide_to_acp(const std::wstring& wide) {
    if (wide.empty()) return {};
    int len = WideCharToMultiByte(CP_ACP, 0, wide.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (len <= 0) return {};
    std::string buf(static_cast<size_t>(len) - 1, '\0');
    WideCharToMultiByte(CP_ACP, 0, wide.c_str(), -1, &buf[0], len, nullptr, nullptr);
    return buf;
}

// UTF-8 → System ANSI
inline std::string utf8_to_acp(const std::string& utf8) {
    auto wide = utf8_to_wide(utf8);
    return wide_to_acp(wide);
}

// System ANSI → UTF-8
inline std::string acp_to_utf8(const std::string& acp) {
    if (acp.empty()) return {};
    // ANSI → wide
    int wlen = MultiByteToWideChar(CP_ACP, 0, acp.c_str(), -1, nullptr, 0);
    if (wlen <= 0) return {};
    std::wstring wbuf(static_cast<size_t>(wlen) - 1, L'\0');
    MultiByteToWideChar(CP_ACP, 0, acp.c_str(), -1, &wbuf[0], wlen);
    // wide → UTF-8
    int ulen = WideCharToMultiByte(CP_UTF8, 0, wbuf.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (ulen <= 0) return {};
    std::string ubuf(static_cast<size_t>(ulen) - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wbuf.c_str(), -1, &ubuf[0], ulen, nullptr, nullptr);
    return ubuf;
}

// Read a text file as UTF-8, return content converted to system ANSI encoding.
// Returns empty string on failure.
inline std::string read_file_as_utf8_to_acp(const std::string& filepath) {
    FILE* f = fopen(filepath.c_str(), "rb");
    if (!f) return {};
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz <= 0) { fclose(f); return {}; }
    std::vector<char> raw(static_cast<size_t>(sz) + 1, '\0');
    fread(raw.data(), 1, static_cast<size_t>(sz), f);
    fclose(f);

    // Skip UTF-8 BOM (EF BB BF) if present
    const char* start = raw.data();
    size_t remain = static_cast<size_t>(sz);
    if (remain >= 3 &&
        (unsigned char)start[0] == 0xEF &&
        (unsigned char)start[1] == 0xBB &&
        (unsigned char)start[2] == 0xBF) {
        start += 3;
        remain -= 3;
    }

    std::string utf8(start, remain);
    return utf8_to_acp(utf8);
}

} // namespace amsys

#endif // UTILS_H
