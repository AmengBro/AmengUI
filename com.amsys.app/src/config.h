#ifndef CONFIG_H
#define CONFIG_H

#include <string>
#include <unordered_map>
#include <vector>

namespace amsys {

class Config {
public:
    Config() = default;

    // Load from an INI file path
    bool load(const std::string& filepath);

    // Get a value by section.key; returns default_val if not found
    std::string get(const std::string& section, const std::string& key,
                    const std::string& default_val = "") const;

    // Check if a key exists
    bool has(const std::string& section, const std::string& key) const;

    // Get all keys in a section
    std::vector<std::string> keys(const std::string& section) const;

    // Print all config (for debug)
    void dump() const;

private:
    // Store as section -> (key -> value)
    std::unordered_map<std::string, std::unordered_map<std::string, std::string>> data_;
};

} // namespace amsys

#endif // CONFIG_H
