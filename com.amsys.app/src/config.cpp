#include "config.h"
#include "utils.h"
#include <fstream>
#include <iostream>
#include <sstream>

namespace amsys {

bool Config::load(const std::string& filepath) {
    std::string content = read_file_as_utf8_to_acp(filepath);
    if (content.empty()) {
        // Try fopen directly for the warning check
        FILE* f = fopen(filepath.c_str(), "rb");
        if (!f) {
            std::cerr << "Warning: Could not open config file: " << filepath << std::endl;
            return false;
        }
        fclose(f);
        // File exists but empty — that's OK
    }

    std::string current_section;
    std::string line;
    int line_num = 0;
    std::stringstream ss(content);

    while (std::getline(ss, line)) {
        line_num++;
        // Handle CRLF: remove trailing \r if present
        if (!line.empty() && line.back() == '\r') line.pop_back();
        line = trim(line);

        // Skip empty lines and comments
        if (line.empty() || line[0] == ';' || line[0] == '#') continue;

        // Section header: [section]
        if (line[0] == '[') {
            auto end = line.find(']');
            if (end == std::string::npos) {
                std::cerr << "Config error line " << line_num
                          << ": unterminated section header" << std::endl;
                continue;
            }
            current_section = line.substr(1, end - 1);
            current_section = trim(current_section);
            continue;
        }

        // Key = Value
        auto eq_pos = line.find('=');
        if (eq_pos == std::string::npos) continue;

        std::string key = trim(line.substr(0, eq_pos));
        std::string value = trim(line.substr(eq_pos + 1));

        // Remove surrounding quotes if present
        if (value.size() >= 2 &&
            ((value.front() == '"' && value.back() == '"') ||
             (value.front() == '\'' && value.back() == '\''))) {
            value = value.substr(1, value.size() - 2);
        }

        // Expand environment variables in value
        value = expand_env_vars(value);

        data_[current_section][key] = value;
    }

    return true;
}

std::vector<std::string> Config::keys(const std::string& section) const {
    std::vector<std::string> result;
    auto it = data_.find(section);
    if (it != data_.end()) {
        for (const auto& [key, _] : it->second) {
            result.push_back(key);
        }
    }
    return result;
}

std::string Config::get(const std::string& section, const std::string& key,
                        const std::string& default_val) const {
    auto sec_it = data_.find(section);
    if (sec_it == data_.end()) return default_val;
    auto key_it = sec_it->second.find(key);
    if (key_it == sec_it->second.end()) return default_val;
    return key_it->second;
}

bool Config::has(const std::string& section, const std::string& key) const {
    auto sec_it = data_.find(section);
    if (sec_it == data_.end()) return false;
    return sec_it->second.find(key) != sec_it->second.end();
}

void Config::dump() const {
    for (const auto& [section, keys] : data_) {
        std::cout << "[" << section << "]" << std::endl;
        for (const auto& [key, value] : keys) {
            std::cout << "  " << key << " = " << value << std::endl;
        }
    }
}

} // namespace amsys
