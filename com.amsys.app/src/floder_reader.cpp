#include "floder_reader.h"
#include "utils.h"
#include <iostream>
#include <filesystem>
#include <algorithm>
#include <sstream>

namespace amsys {

std::string read_floder(const std::string& dir_path) {
    namespace fs = std::filesystem;

    // Extract the last component of the path
    std::string leaf;
    std::string normalized = to_windows_sep(dir_path);
    // Remove trailing backslash
    while (!normalized.empty() && normalized.back() == '\\') {
        normalized.pop_back();
    }
    auto pos = normalized.find_last_of('\\');
    if (pos == std::string::npos) {
        leaf = normalized;
    } else {
        leaf = normalized.substr(pos + 1);
    }

    if (leaf.empty()) return {};

    // Construct .floder path at the PARENT level, not inside the directory
    // e.g. for C:\Users\home, check C:\Users\home.floder
    auto slash = normalized.find_last_of('\\');
    std::string parent_dir = (slash == std::string::npos) ? "." : normalized.substr(0, slash);
    std::string floder_path = parent_dir + "\\" + leaf + ".floder";

    // Normalize separators
    floder_path = to_windows_sep(floder_path);

    // Read file as UTF-8, decode to system ANSI
    std::string content = read_file_as_utf8_to_acp(floder_path);
    if (content.empty()) return {};

    // Extract first line
    std::stringstream ss(content);
    std::string first_line;
    if (!std::getline(ss, first_line)) {
        return {};
    }
    // Handle CRLF
    if (!first_line.empty() && first_line.back() == '\r') first_line.pop_back();

    first_line = trim(first_line);
    if (first_line.empty()) return {};

    // Expand environment variables
    first_line = expand_env_vars(first_line);

    // Verify the target path exists
    if (!fs::exists(first_line)) {
        // Extract the directory name for the error message
        std::string leaf_name;
        auto pos = dir_path.find_last_of("/\\");
        leaf_name = (pos == std::string::npos) ? dir_path : dir_path.substr(pos + 1);
        std::cerr << leaf_name << ".floder error: can't find the folder that this file point to" << std::endl;
        std::cerr << "  " << first_line << std::endl;
        return {};  // Don't redirect if target doesn't exist
    }

    return first_line;
}

} // namespace amsys
