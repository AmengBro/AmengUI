#include "package_info.h"

#include <cctype>
#include <cstdlib>
#include <sstream>
#include <vector>

std::string trim(const std::string& s) {
    size_t b = 0, e = s.size();
    while (b < e && std::isspace((unsigned char)s[b])) b++;
    while (e > b && std::isspace((unsigned char)s[e - 1])) e--;
    // 去掉 UTF-8 BOM
    if (e - b >= 3 && (unsigned char)s[b] == 0xEF &&
        (unsigned char)s[b + 1] == 0xBB && (unsigned char)s[b + 2] == 0xBF)
        b += 3;
    return s.substr(b, e - b);
}

std::string PackageInfo::comboLabel() const {
    std::string base = displayName.empty() ? pkgName : displayName;
    if (!version.empty()) base += "  v" + version;
    return base;
}

PackageInfo parseAminfo(const std::string& text) {
    PackageInfo p;
    std::string section;
    std::istringstream ss(text);
    std::string line;
    while (std::getline(ss, line)) {
        std::string t = trim(line);
        if (t.empty() || t[0] == ';' || t[0] == '#') continue;
        if (t[0] == '[') {
            size_t c = t.find(']');
            if (c != std::string::npos) section = trim(t.substr(1, c - 1));
            continue;
        }
        size_t eq = t.find('=');
        if (eq == std::string::npos) continue;
        std::string key = trim(t.substr(0, eq));
        std::string val = trim(t.substr(eq + 1));
        size_t sc = val.find(';');
        if (sc != std::string::npos) val = trim(val.substr(0, sc));
        if (section == "package") {
            if (key == "name") p.pkgName = val;
            else if (key == "version") p.version = val;
        } else if (section == "install") {
            if (key == "location") p.location = val;
            else if (key == "name") p.dirName = val;
        }
    }
    return p;
}

namespace {

// 取 JSON 中某个字符串字段的值（处理常见转义）
std::string jsonStringValue(const std::string& json, const std::string& key) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "";
    pos += search.size();
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

} // namespace

void mergeAppJson(PackageInfo& info, const std::string& jsonText) {
    std::string n = jsonStringValue(jsonText, "name");
    if (!n.empty()) info.displayName = n;
    std::string d = jsonStringValue(jsonText, "description");
    if (!d.empty()) info.description = d;
    info.iconPath = jsonStringValue(jsonText, "icon");
    info.exePath = jsonStringValue(jsonText, "exePath");
}

int compareVersions(const std::string& a, const std::string& b) {
    auto tokens = [](const std::string& s) {
        std::vector<long long> v;
        std::string cur;
        for (char c : s) {
            if (c >= '0' && c <= '9') {
                cur += c;
            } else {
                if (!cur.empty()) {
                    v.push_back(atoll(cur.c_str()));
                    cur.clear();
                }
            }
        }
        if (!cur.empty()) v.push_back(atoll(cur.c_str()));
        return v;
    };
    auto ta = tokens(a), tb = tokens(b);
    size_t n = ta.size() > tb.size() ? ta.size() : tb.size();
    for (size_t i = 0; i < n; ++i) {
        long long x = i < ta.size() ? ta[i] : 0;
        long long y = i < tb.size() ? tb[i] : 0;
        if (x != y) return x < y ? -1 : 1;
    }
    return 0;
}
