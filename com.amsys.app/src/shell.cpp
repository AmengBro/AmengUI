#define _WIN32_WINNT 0x0600
#include "shell.h"
#include "utils.h"

// Ctrl+C flag (set in main.cpp handler)
extern volatile bool g_ctrl_c;

#include <iostream>
#include <sstream>
#include <algorithm>
#include <fstream>
#include <cstring>
#include <io.h>
#include <fcntl.h>
#include <windows.h>
#include <shellapi.h>
#include <conio.h>
#include <map>

namespace amsys {

// ─── Maximum pipe buffer size ───────────────────────────
static const size_t PIPE_BUF_SIZE = 65536;

std::streambuf* Shell::default_cout_buf = nullptr;

Shell::Shell(const Config& cfg, bool elevated, const std::string& username)
    : config_(cfg), path_mgr_(cfg), running_(false), elevated_(elevated), username_(username)
{
    if (!default_cout_buf) default_cout_buf = std::cout.rdbuf();

    // Load tools from config.ini [tools] section
    for (const auto& alias : config_.keys("tools")) {
        std::string exe_path = config_.get("tools", alias, "");
        if (!exe_path.empty()) {
            tools_[alias] = exe_path;
        }
    }

    // Load commands from [commands] section (no warning, no terminal check)
    for (const auto& alias : config_.keys("commands")) {
        std::string exe_path = config_.get("commands", alias, "");
        if (!exe_path.empty()) {
            tools_[alias] = exe_path;
            commands_.insert(alias);
        }
    }

    // Load hijack flags from [hijack] section (default: all enabled)
    for (const auto& alias : config_.keys("hijack")) {
        std::string spec = config_.get("hijack", alias, "all");
        HijackFlags flags;
        if (spec == "none") {
            flags = {false, false, false};
        } else if (spec == "args") {
            flags = {false, false, true};
        } else if (spec == "cwd") {
            flags = {false, true, false};
        } else if (spec == "env") {
            flags = {true, false, false};
        } else {
            // Comma-separated features; anything else = all
            flags = {false, false, false};
            for (const auto& tok : split(spec, ',')) {
                std::string t = trim(tok);
                if (t == "env") flags.env = true;
                else if (t == "cwd") flags.cwd = true;
                else if (t == "args") flags.args = true;
                else flags = {true, true, true};
            }
        }
        hijack_[alias] = flags;
    }

    // Determine home directory based on username
    std::string home_unix = (username_ == "root") ? "/root" : "/home/" + username_;
    std::string home_win = (username_ == "root")
        ? path_mgr_.get_root() + "\\root"
        : path_mgr_.to_windows("/home") + "\\" + username_;
    home_unix_ = home_unix;
    home_win_ = home_win;
    // Auto-create home directory
    {
        std::wstring whome = utf8_to_wide(acp_to_utf8(home_win));
        if (!whome.empty()) {
            std::wstring acc;
            for (size_t wi = 0; wi < whome.size(); wi++) {
                acc += whome[wi];
                if (whome[wi] == L'\\' || wi == whome.size() - 1) {
                    if (!acc.empty() && acc != L"\\")
                        CreateDirectoryW(acc.c_str(), nullptr);
                }
            }
            // Auto-create standard user subdirectories
            const wchar_t* subdirs[] = {
                L"Desktop", L"Downloads", L"Documents",
                L"Pictures", L"Videos", L"Music", L"Trash"
            };
            for (const wchar_t* sub : subdirs) {
                std::wstring sub_path = whome + L"\\" + sub;
                CreateDirectoryW(sub_path.c_str(), nullptr);
            }
        }
    }

    // Load or create user permission config: ~/.config/amsys/user.yaml
    {
        std::string cfg_dir = home_win_ + "\\.config\\amsys";
        // Recursively create parent directories
        {
            std::string acc;
            for (size_t ci = 0; ci < cfg_dir.size(); ci++) {
                acc += cfg_dir[ci];
                if (cfg_dir[ci] == '\\' || cfg_dir[ci] == '/' || ci == cfg_dir.size() - 1) {
                    if (acc.size() > 3) CreateDirectoryA(acc.c_str(), nullptr);
                }
            }
        }
        std::string yaml_path = cfg_dir + "\\user.yaml";
        std::ifstream yf(yaml_path);
        if (yf.is_open()) {
            std::string line;
            while (std::getline(yf, line)) {
                auto colon = line.find(':');
                if (colon == std::string::npos) continue;
                std::string key = trim(line.substr(0, colon));
                std::string val = trim(line.substr(colon + 1));
                if (key == "permission" && (val == "user" || val == "sudo" || val == "root")) {
                    permission_ = val;
                }
            }
            yf.close();
        } else {
            // Create default config
            std::string def_perm = (username_ == "root") ? "root" : "user";
            std::ofstream of(yaml_path, std::ios::binary);
            of << "user:\n"
               << "  name: " << username_ << "\n"
               << "  permission: " << def_perm << "\n";
            of.close();
            permission_ = def_perm;
        }
    }

    // Ensure /etc/passwd reflects existing and current users
    ensure_passwd();

    // Initialize built-in environment variables (Unix-style paths)
    {
        char exe_buf[MAX_PATH];
        GetModuleFileNameA(nullptr, exe_buf, MAX_PATH);
        std::string exe_unix = path_mgr_.to_unix(exe_buf);
        env_vars_["AMSYS_LOCATE"] = exe_unix.empty() ? exe_buf : exe_unix;
    }
    env_vars_["AMSYS_VERSION"] = "1.0.0";
    {
        std::string root_ = path_mgr_.get_root();
        std::string root_loop;
        if (root_.size() >= 2 && root_[1] == ':') {
            char d = static_cast<char>(std::tolower(root_[0]));
            root_loop = std::string("/media/") + d + "/" + to_unix_sep(root_.substr(3));
        } else {
            root_loop = root_;
        }
        env_vars_["AMSYS_ROOT"] = root_loop;
    }
    env_vars_["HOME"] = home_unix;
    env_vars_["USER"] = username_;
    env_vars_["SHELL"] = "amsys";
    env_vars_["PWD"] = "/";
    env_vars_["PATH"] = "/bin:/opt";
}

std::string Shell::expand_vars(const std::string& s) const {
    std::string r = s;
    int max_depth = 5;
    while (max_depth-- > 0) {
        size_t pos = 0;
        bool found = false;
        while ((pos = r.find('$', pos)) != std::string::npos) {
            if (pos + 1 < r.size() && r[pos + 1] == '$') {
                r.erase(pos, 1);
                found = true;
                continue;
            }
            size_t end = pos + 1;
            bool brace = (end < r.size() && r[end] == '{');
            if (brace) { end++; }
            while (end < r.size() && (std::isalnum(r[end]) || r[end] == '_')) end++;
            if (brace && end < r.size() && r[end] == '}') end++;
            std::string var = r.substr(pos + (brace ? 2 : 1), end - pos - (brace ? 2 : 1));
            auto it = env_vars_.find(var);
            if (it != env_vars_.end()) {
                r.replace(pos, end - pos, it->second);
                found = true;
                break;
            } else {
                // Leave unresolved $VAR as-is, move past it
                pos = end;
            }
        }
        if (!found) break;
    }
    return r;
}

// Ensure /etc/passwd exists and lists all known users.
// Format (Unix convention, no passwords):
//   username:x:UID:GID:comment:home:shell
//   root:x:0:0:root:/root:/bin/amsys
//   name:x:1000:1000:name:/home/name:/bin/amsys
void Shell::ensure_passwd() {
    std::string passwd_path = path_mgr_.get_root() + "\\etc\\passwd";
    std::map<std::string, int> users;  // username -> uid
    int max_uid = 0;

    // Read existing passwd
    {
        std::ifstream pf(passwd_path);
        if (pf.is_open()) {
            std::string line;
            while (std::getline(pf, line)) {
                std::vector<std::string> parts = split(line, ':');
                if (parts.size() >= 3) {
                    int uid = std::atoi(parts[2].c_str());
                    users[parts[0]] = uid;
                    if (uid > max_uid) max_uid = uid;
                }
            }
            pf.close();
        }
    }

    // Scan <root>/home for existing user directories
    {
        std::string home_dir = path_mgr_.to_windows("/home");
        std::wstring whome = utf8_to_wide(acp_to_utf8(home_dir));
        std::wstring search = whome + L"\\*";
        WIN32_FIND_DATAW fd;
        HANDLE hf = FindFirstFileW(search.c_str(), &fd);
        if (hf != INVALID_HANDLE_VALUE) {
            do {
                std::wstring wn = fd.cFileName;
                if (wn == L"." || wn == L"..") continue;
                if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
                int len = WideCharToMultiByte(CP_UTF8, 0, wn.c_str(), -1,
                                              nullptr, 0, nullptr, nullptr);
                std::string name(static_cast<size_t>(len) - 1, '\0');
                WideCharToMultiByte(CP_UTF8, 0, wn.c_str(), -1, &name[0],
                                    len, nullptr, nullptr);
                name = std::string(name.c_str());
                if (!name.empty() && users.count(name) == 0) {
                    int uid = std::max(1000, max_uid + 1);
                    users[name] = uid;
                    max_uid = uid;
                }
            } while (FindNextFileW(hf, &fd) != 0);
            FindClose(hf);
        }
    }

    // Ensure root and current user are present
    if (users.count("root") == 0) users["root"] = 0;
    if (username_ != "root" && users.count(username_) == 0) {
        int uid = std::max(1000, max_uid + 1);
        users[username_] = uid;
        max_uid = uid;
    }

    // Write back: root first, then others sorted by UID
    std::ofstream of(passwd_path, std::ios::binary);
    of << "root:x:0:0:root:/root:/bin/amsys\n";
    std::vector<std::pair<int, std::string>> others;
    for (const auto& [name, uid] : users) {
        if (name == "root") continue;
        others.push_back({uid, name});
    }
    std::sort(others.begin(), others.end());
    for (const auto& [uid, name] : others) {
        std::string home = (name == "root") ? "/root" : "/home/" + name;
        of << name << ":x:" << uid << ":" << uid << ":" << name
           << ":" << home << ":/bin/amsys\n";
    }
    of.close();
}

// Expand leading ~ / ~/xxx tokens to $HOME (quote-aware)
std::string Shell::expand_tilde(const std::string& s) const {
    auto home_it = env_vars_.find("HOME");
    if (home_it == env_vars_.end() || home_it->second.empty()) return s;
    const std::string& home = home_it->second;

    std::string r = s;
    bool in_quote = false, in_dquote = false;
    size_t pos = 0;
    while (pos < r.size()) {
        char ch = r[pos];
        if (ch == '\'' && !in_dquote) { in_quote = !in_quote; pos++; continue; }
        if (ch == '"' && !in_quote) { in_dquote = !in_dquote; pos++; continue; }
        if (ch == '\\') { pos += 2; continue; }  // skip escaped char
        if (ch == '~' && !in_quote && !in_dquote) {
            // Only expand when ~ starts a token
            bool at_start = (pos == 0 || r[pos-1] == ' ' || r[pos-1] == '\t' ||
                             r[pos-1] == '|' || r[pos-1] == '<' || r[pos-1] == '>');
            if (at_start) {
                size_t end = pos + 1;
                while (end < r.size() && r[end] != ' ' && r[end] != '\t' &&
                       r[end] != '|' && r[end] != '<' && r[end] != '>' &&
                       r[end] != '\'' && r[end] != '"') end++;
                std::string tok = r.substr(pos, end - pos);
                if (tok == "~") {
                    r.replace(pos, 1, home);
                    pos += home.size();
                    continue;
                } else if (tok.size() > 1 && (tok[1] == '/' || tok[1] == '\\')) {
                    r.replace(pos, end - pos, home + tok.substr(1));
                    pos += home.size() + tok.size() - 1;
                    continue;
                }
            }
        }
        pos++;
    }
    return r;
}

// Simple glob pattern matching (* and ?)
static bool glob_match(const std::string& name, const std::string& pattern) {
    size_t ni = 0, pi = 0;
    while (pi < pattern.size() && ni < name.size()) {
        if (pattern[pi] == '*') {
            pi++;
            if (pi >= pattern.size()) return true;
            while (ni < name.size()) {
                if (glob_match(name.substr(ni), pattern.substr(pi))) return true;
                ni++;
            }
            return false;
        }
        if (pattern[pi] == '?' || pattern[pi] == name[ni]) { pi++; ni++; continue; }
        return false;
    }
    while (pi < pattern.size() && pattern[pi] == '*') pi++;
    return pi >= pattern.size() && ni >= name.size();
}

std::vector<std::string> Shell::expand_glob(const std::string& pattern) const {
    std::vector<std::string> results;
    if (pattern.find('*') == std::string::npos && pattern.find('?') == std::string::npos) {
        results.push_back(pattern);
        return results;
    }
    // Split into directory part and file pattern
    std::string dir, file_pat;
    auto slash = pattern.find_last_of('/');
    if (slash == std::string::npos) {
        dir = path_mgr_.get_cwd();
        file_pat = pattern;
    } else {
        dir = pattern.substr(0, slash);
        if (dir.empty()) dir = "/";
        file_pat = pattern.substr(slash + 1);
    }
    // Get Windows path for the directory
    std::string win_dir = path_mgr_.to_windows(dir);
    if (win_dir.empty() && path_mgr_.is_virtual_dir(dir)) {
        // Virtual dir - list virtual children instead
        auto virt = path_mgr_.list_virtual_children(dir);
        for (const auto& v : virt) {
            if (glob_match(v, file_pat)) {
                std::string prefix = (slash == std::string::npos) ? "" :
                    (dir.back() == '/') ? dir : dir + "/";
                results.push_back(prefix + v);
            }
        }
        std::sort(results.begin(), results.end());
        return results;
    }
    if (win_dir.empty()) { results.push_back(pattern); return results; }
    std::wstring wdir = utf8_to_wide(acp_to_utf8(win_dir));
    std::wstring search = wdir + L"\\*";
    WIN32_FIND_DATAW fd;
    HANDLE hf = FindFirstFileW(search.c_str(), &fd);
    if (hf == INVALID_HANDLE_VALUE) { results.push_back(pattern); return results; }
    do {
        std::wstring wn = fd.cFileName;
        if (wn == L"." || wn == L"..") continue;
        int len = WideCharToMultiByte(CP_UTF8, 0, wn.c_str(), -1, nullptr, 0, nullptr, nullptr);
        std::string name(static_cast<size_t>(len) - 1, '\0');
        WideCharToMultiByte(CP_UTF8, 0, wn.c_str(), -1, &name[0], len, nullptr, nullptr);
        // Remove trailing .floder files from glob results
        if (name.size() > 7 && name.substr(name.size() - 7) == ".floder") continue;
        if (glob_match(name, file_pat)) {
            std::string prefix = (slash == std::string::npos) ? "" :
                (dir.back() == '/') ? dir : dir + "/";
            results.push_back(prefix + name);
        }
    } while (FindNextFileW(hf, &fd));
    FindClose(hf);
    std::sort(results.begin(), results.end());
    return results;
}

std::string Shell::get_prompt() const {
    std::string cwd = path_mgr_.get_cwd();
    if (elevated_) {
        return "\033[1;31madminsys\033[0m:\033[1;34m" + cwd + "\033[0m# ";
    }
    return "\033[1;32mamsys\033[0m:\033[1;34m" + cwd + "\033[0m$ ";
}

void Shell::run() {
    running_ = true;

    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
    std::cout<< std::endl;
    std::cout << "welcome to amsys!" << std::endl;
    std::cout << "Type 'help' for commands, 'exit' to quit." << std::endl;
    std::cout << std::endl;

    std::string line;
    while (running_) {
        if (g_ctrl_c) {
            g_ctrl_c = false;
            std::cout << std::endl;
        }
        std::cout << get_prompt();
        std::cout.flush();

        if (!std::getline(std::cin, line)) {
            break;
        }

        // Ctrl+C: clear current line and restart prompt
        if (line.find('\x03') != std::string::npos || g_ctrl_c) {
            g_ctrl_c = false;
            continue;
        }

        // Multi-line continuation: unescaped backslash joins next line
        {
            std::string buf = line;
            // Count trailing backslashes
            int trail = 0;
            for (int i = (int)buf.size() - 1; i >= 0 && buf[i] == '\\'; i--, trail++);
            if (trail % 2 == 1) {
                buf.pop_back(); // remove continuation backslash
                std::string next;
                if (!std::getline(std::cin, next)) break;
                buf += next;
            }
            line = buf;
        }

        line = trim(line);
        if (line.empty()) continue;
        if (line[0] == '#') continue;  // comment

        execute(line);
    }
}

int Shell::execute(const std::string& line) {
    // Expand environment variables and ~ in the command line
    std::string expanded = expand_tilde(expand_vars(line));
    // First check if the expanded line has operators
    bool has_operator = false;
    {
        bool in_quote = false, in_dquote = false;
        for (size_t i = 0; i < expanded.size(); i++) {
            char c = expanded[i];
            if (c == '\'' && !in_dquote) { in_quote = !in_quote; continue; }
            if (c == '"' && !in_quote) { in_dquote = !in_dquote; continue; }
            if (c == '\\') { if (i+1 < line.size()) i++; continue; }
            if (!in_quote && !in_dquote) {
                if (c == '|' || c == '<' || c == '>') {
                    has_operator = true;
                    break;
                }
            }
        }
    }

    if (has_operator) {
        Pipeline pipe = parse_pipeline(expanded);
        return execute_pipeline(pipe);
    }

    // No operators — fall back to original simple path
    auto args = parse_line(expanded);
    if (args.empty()) return 0;
    // Expand glob patterns in arguments
    std::vector<std::string> expanded_args;
    for (const auto& arg : args) {
        if (arg.find('*') != std::string::npos || arg.find('?') != std::string::npos) {
            auto globbed = expand_glob(arg);
            for (const auto& g : globbed) expanded_args.push_back(g);
        } else {
            expanded_args.push_back(arg);
        }
    }
    return execute_command(expanded_args);
}

// ─── Pipeline parsing ───────────────────────────────────

Pipeline Shell::parse_pipeline(const std::string& line) const {
    Pipeline pipe;

    // Tokenize the whole line respecting quotes, but keep operators as tokens
    std::vector<std::string> tokens;
    std::string current;
    bool in_quote = false, in_dquote = false;

    for (size_t i = 0; i < line.size(); i++) {
        char c = line[i];

        if (c == '\'' && !in_dquote) { in_quote = !in_quote; continue; }
        if (c == '"' && !in_quote)   { in_dquote = !in_dquote; continue; }
        if (c == '\\' && i + 1 < line.size()) {
            char next = line[i+1];
            // Unix convention: \ escapes only special characters; otherwise keep both
            if (next == '\\' || next == '"' || next == '\'' ||
                next == ' ' || next == '\t' || next == '\n') {
                i++; current += next; continue;
            }
            // Not a special char: keep backslash as literal
            current += c;
            continue;
        }

        if (!in_quote && !in_dquote) {
            // Check for >> first (two chars)
            if (c == '>' && i + 1 < line.size() && line[i+1] == '>') {
                if (!current.empty()) { tokens.push_back(current); current.clear(); }
                tokens.push_back(">>");
                i++; // skip next >
                continue;
            }
            // 2>> and 2> redirection
            if (c == '2' && i + 1 < line.size()) {
                if (line[i+1] == '>') {
                    if (!current.empty()) { tokens.push_back(current); current.clear(); }
                    if (i + 2 < line.size() && line[i+2] == '>') {
                        tokens.push_back("2>>");
                        i += 2;
                    } else {
                        tokens.push_back("2>");
                        i++;
                    }
                    continue;
                }
            }
            if (c == '|') {
                if (!current.empty()) { tokens.push_back(current); current.clear(); }
                tokens.push_back("|");
                continue;
            }
            if (c == '<') {
                if (!current.empty()) { tokens.push_back(current); current.clear(); }
                tokens.push_back("<");
                continue;
            }
            if (c == '>') {
                if (!current.empty()) { tokens.push_back(current); current.clear(); }
                tokens.push_back(">");
                continue;
            }
            if (c == ' ' || c == '\t') {
                if (!current.empty()) { tokens.push_back(current); current.clear(); }
                continue;
            }
        }
        current += c;
    }
    if (!current.empty()) tokens.push_back(current);

    // Now build Pipeline from tokens:
    // Split by | into commands; < file / > file / >> file add redirections
    RedirectedCommand cur_cmd;
    enum OpType { OP_NONE, OP_READ, OP_WRITE, OP_APPEND, OP_WRITE_ERR, OP_APPEND_ERR };
    OpType pending_op = OP_NONE;

    for (size_t i = 0; i < tokens.size(); i++) {
        const std::string& tok = tokens[i];

        if (tok == "|") {
            if (!cur_cmd.args.empty()) {
                pipe.commands.push_back(cur_cmd);
                cur_cmd = RedirectedCommand();
            }
            continue;
        }

        if (tok == "<") { pending_op = OP_READ; continue; }
        if (tok == ">") { pending_op = OP_WRITE; continue; }
        if (tok == "2>>") { pending_op = OP_APPEND_ERR; continue; }
        if (tok == "2>") { pending_op = OP_WRITE_ERR; continue; }
        if (tok == ">>") { pending_op = OP_APPEND; continue; }

        // Strip surrounding quotes from filename if needed
        std::string val = tok;
        if (val.size() >= 2 &&
            ((val.front() == '"' && val.back() == '"') ||
             (val.front() == '\'' && val.back() == '\''))) {
            val = val.substr(1, val.size() - 2);
        }

        if (pending_op == OP_READ) {
            cur_cmd.stdin_file = val;
            pending_op = OP_NONE;
            continue;
        }
        if (pending_op == OP_WRITE) {
            cur_cmd.stdout_file = val;
            cur_cmd.stdout_append = false;
            pending_op = OP_NONE;
            continue;
        }
        if (pending_op == OP_APPEND) {
            cur_cmd.stdout_file = val;
            cur_cmd.stdout_append = true;
            pending_op = OP_NONE;
            continue;
        }
        if (pending_op == OP_WRITE_ERR) {
            cur_cmd.stderr_file = val;
            cur_cmd.stderr_append = false;
            pending_op = OP_NONE;
            continue;
        }
        if (pending_op == OP_APPEND_ERR) {
            cur_cmd.stderr_file = val;
            cur_cmd.stderr_append = true;
            pending_op = OP_NONE;
            continue;
        }

        // Regular arg
        cur_cmd.args.push_back(tok);
    }

    if (!cur_cmd.args.empty()) {
        pipe.commands.push_back(cur_cmd);
    }

    return pipe;
}

// ─── Pipeline execution ─────────────────────────────────

int Shell::execute_pipeline(const Pipeline& pipe) {
    if (pipe.commands.empty()) return 0;

    size_t n = pipe.commands.size();

    if (n == 1) {
        // Single command with possible < > >> but no pipe
        return execute_redirected(pipe.commands[0], "", nullptr, nullptr, nullptr);
    }

    // Multi-command pipeline: A | B | C ...
    // We execute each command, capture its output, pass as input to next.
    // For external commands we use CreateProcess with pipe handles;
    // for builtins we capture via stringstream.

    // For simplicity: execute left-to-right, carrying a string buffer.
    // If a command is external with complex piping, use OS pipe handles.

    std::string input_buffer;  // carries output of previous command -> input of next

    for (size_t i = 0; i < n; i++) {
        bool is_last = (i == n - 1);
        std::string output_buffer;

        int rc = 0;

        // Check if current command is a builtin or external
        // We need to decide how to handle piping
        std::string cmd_name = pipe.commands[i].args.empty() ? "" : pipe.commands[i].args[0];
        bool is_builtin = false;
        // Quick check without full table lookup
        static const char* builtin_names[] = {
            "cd","pwd","ls","dir","cat","type","echo","grep",
            "mount","help","exit","quit","wine","!",nullptr
        };
        for (int b = 0; builtin_names[b]; b++) {
            if (cmd_name == builtin_names[b]) { is_builtin = true; break; }
        }

        if (is_builtin || is_last) {
            // Builtin or last command: capture output in string for next iteration
            // or let it go to real stdout if last
            rc = execute_redirected(
                pipe.commands[i],
                input_buffer,
                is_last ? nullptr : &output_buffer,
                nullptr,
                nullptr);
        } else {
            // External + not last: need OS pipe for stdout
            // We'll just capture output via a pipe
            rc = execute_redirected(
                pipe.commands[i],
                input_buffer,
                &output_buffer,
                nullptr,
                nullptr);
        }

        input_buffer = output_buffer;

        if (rc != 0 && !is_last) {
            // Non-last command failed; stop pipeline
            return rc;
        }
    }

    return 0;
}

int Shell::execute_redirected(
    const RedirectedCommand& cmd,
    const std::string& pipe_stdin,
    std::string* pipe_stdout_out,
    HANDLE inherit_stdin_handle,
    HANDLE inherit_stdout_handle)
{
    if (cmd.args.empty()) return 0;

    // ── Handle stdin from pipe or < file ──
    bool stdin_from_file = !cmd.stdin_file.empty();
    std::string stdin_file_win;
    std::ifstream stdin_file_stream;

    if (stdin_from_file) {
        stdin_file_win = path_mgr_.to_windows(cmd.stdin_file);
        if (stdin_file_win.empty()) {
            std::cerr << cmd.args[0] << ": " << cmd.stdin_file
                      << ": Invalid path" << std::endl;
            return 1;
        }
        stdin_file_stream.open(stdin_file_win, std::ios::binary);
        if (!stdin_file_stream.is_open()) {
            std::cerr << cmd.args[0] << ": " << cmd.stdin_file
                      << ": No such file" << std::endl;
            return 1;
        }
    }

    // ── Handle stdout to pipe or > / >> file ──
    bool stdout_to_file = !cmd.stdout_file.empty();
    bool capture_stdout = (pipe_stdout_out != nullptr);
    std::string stdout_file_win;
    std::ofstream stdout_file_stream;
    std::ostringstream capture_stream;

    if (stdout_to_file) {
        // /dev/null: use Windows NUL device
        if (path_mgr_.resolve(cmd.stdout_file) == "/dev/null") {
            stdout_file_win = "nul";
        } else {
            stdout_file_win = path_mgr_.to_windows(cmd.stdout_file);
        }
        if (stdout_file_win.empty()) {
            std::cerr << cmd.args[0] << ": " << cmd.stdout_file
                      << ": Invalid path" << std::endl;
            return 1;
        }
        std::ios_base::openmode mode = cmd.stdout_append
            ? (std::ios::app | std::ios::binary)
            : (std::ios::trunc | std::ios::binary);
        stdout_file_stream.open(stdout_file_win, mode);
        if (!stdout_file_stream.is_open()) {
            std::cerr << cmd.args[0] << ": " << cmd.stdout_file
                      << ": Cannot open for writing" << std::endl;
            return 1;
        }
    }

    // ── Determine if this is a builtin or external ──
    const std::string& cmd0 = cmd.args[0];
    struct CmdEntry {
        std::string name;
        int (Shell::*handler)(const std::vector<std::string>&);
    };
    static const CmdEntry builtins[] = {
        {"cd",    &Shell::builtin_cd},
        {"pwd",   &Shell::builtin_pwd},
        {"ls",    &Shell::builtin_ls},
        {"dir",   &Shell::builtin_ls},
        {"cat",   &Shell::builtin_cat},
        {"type",  &Shell::builtin_cat},
        {"echo",  &Shell::builtin_echo},
        {"grep",  &Shell::builtin_grep},
        {"tools", &Shell::builtin_tools},
        {"tools", &Shell::builtin_tools},
        {"export", &Shell::builtin_export},
        {"unset", &Shell::builtin_unset},
        {"env", &Shell::builtin_env},
        {"passwd", &Shell::builtin_passwd},
        {"adduser", &Shell::builtin_adduser},
        {"usermod", &Shell::builtin_usermod},
        {"sudo",  &Shell::builtin_sudo},
        {"mount", &Shell::builtin_mount},
        {"umount",  &Shell::builtin_umount},
        {"newfl",  &Shell::builtin_newfl},
        {"mkdir",  &Shell::builtin_mkdir},
        {"rm",     &Shell::builtin_rm},
        {"cp",     &Shell::builtin_cp},
        {"mv",     &Shell::builtin_mv},
        {"help",  &Shell::builtin_help},
        {"exit",  &Shell::builtin_exit},
        {"quit",  &Shell::builtin_exit},
        {"wine",  &Shell::builtin_wine},
        {"!",     &Shell::builtin_wine},
    };
    bool is_builtin = false;
    int (Shell::*handler)(const std::vector<std::string>&) = nullptr;
    for (const auto& e : builtins) {
        if (cmd0 == e.name) { is_builtin = true; handler = e.handler; break; }
    }

    // ── Prepare stdin content ──
    // Priority: < file > pipe_stdin > inherit_stdin_handle > default (cin)
    std::string stdin_content;
    bool has_stdin_content = false;

    if (stdin_from_file) {
        stdin_content = std::string((std::istreambuf_iterator<char>(stdin_file_stream)),
                                     std::istreambuf_iterator<char>());
        has_stdin_content = true;
    } else if (!pipe_stdin.empty()) {
        stdin_content = pipe_stdin;
        has_stdin_content = true;
    }

    if (is_builtin) {
        // ── Execute builtin with redirect support ──

        // Redirect stdin if we have piped/file content
        std::streambuf* old_cin_buf = nullptr;
        std::istringstream cin_proxy;
        if (has_stdin_content) {
            cin_proxy.str(stdin_content);
            old_cin_buf = std::cin.rdbuf();
            std::cin.rdbuf(cin_proxy.rdbuf());
        }

        // Redirect stdout if capturing or writing to file
        std::streambuf* old_cout_buf = nullptr;
        std::ostringstream cout_proxy;
        if (capture_stdout) {
            old_cout_buf = std::cout.rdbuf();
            std::cout.rdbuf(cout_proxy.rdbuf());
        } else if (stdout_to_file) {
            old_cout_buf = std::cout.rdbuf();
            std::cout.rdbuf(stdout_file_stream.rdbuf());
        }

        // Execute
        int rc = (this->*handler)(cmd.args);

        // Restore cout
        if (old_cout_buf) {
            std::cout.rdbuf(old_cout_buf);
        }

        // Restore cin
        if (old_cin_buf) {
            std::cin.rdbuf(old_cin_buf);
        }

        // Capture output
        if (capture_stdout) {
            *pipe_stdout_out = cout_proxy.str();
        }

        return rc;
    } else {
        // ── External command ──
        // Non-builtin commands are not executed directly.
        // Use wine <program> to run Windows programs.
        // Check if command is a registered tool alias
        auto tool_it = tools_.find(cmd0);
        if (tool_it != tools_.end()) {
            // Block tools in piped/hidden terminals (sudo -i / sudo <cmd>)
            // Tools need a real console, which only sudo -n provides
            // Commands skip note and TTY check
            if (!commands_.count(cmd0)) {
                std::cout << cmd0 << ": note: this tool may not support Unix paths" << std::endl;
                if (!_isatty(_fileno(stdout))) {
                    std::cout << cmd0 << ": tool requires a terminal window" << std::endl;
                    std::cout << "  Use 'sudo -n " << cmd0 << "' or run in a normal terminal." << std::endl;
                    std::cout.flush();
                    return 1;
                }
            }
            Sleep(500);
            std::string tool_exe = resolve_tool_path(tool_it->second);
            auto hijack_it = hijack_.find(cmd0);
            HijackFlags hijack = (hijack_it != hijack_.end()) ? hijack_it->second : HijackFlags();

            std::string tool_cmd = tool_exe;
            for (size_t ai = 1; ai < cmd.args.size(); ai++) {
                tool_cmd += " ";
                std::string arg = cmd.args[ai];
                if (hijack.args && arg.size() > 1 && (arg[0] == '/' || arg[0] == '~')) {
                    // ~ fallback (normally expanded by expand_tilde earlier)
                    if (arg[0] == '~') arg = home_unix_ + arg.substr(1);
                    std::string win = path_mgr_.to_windows(arg);
                    if (!win.empty()) {
                        if (win.find(' ') != std::string::npos)
                            tool_cmd += "\"" + win + "\"";
                        else
                            tool_cmd += win;
                        continue;
                    }
                }
                tool_cmd += arg;
            }
            std::string tool_acp = utf8_to_acp(tool_cmd);
            STARTUPINFOA si;
            ZeroMemory(&si, sizeof(si));
            si.cb = sizeof(si);
            PROCESS_INFORMATION pi;
            ZeroMemory(&pi, sizeof(pi));

            // Stderr redirect for tools
            HANDLE tool_err_handle = nullptr;
            if (!cmd.stderr_file.empty()) {
                std::string err_win = path_mgr_.to_windows(cmd.stderr_file);
                if (!err_win.empty()) {
                    DWORD edisp = cmd.stderr_append ? OPEN_ALWAYS : CREATE_ALWAYS;
                    tool_err_handle = CreateFileA(err_win.c_str(), GENERIC_WRITE,
                                                   FILE_SHARE_READ, nullptr,
                                                   edisp, FILE_ATTRIBUTE_NORMAL, nullptr);
                }
            }
            if (tool_err_handle) {
                si.dwFlags |= STARTF_USESTDHANDLES;
                si.hStdError = tool_err_handle;
            }
            char* buf = new char[tool_acp.size() + 1];
            strcpy_s(buf, tool_acp.size() + 1, tool_acp.c_str());

            // Build env block if hijack.env
            std::string env_block;
            LPVOID lpEnv = nullptr;
            if (hijack.env) {
                LPCH envs = GetEnvironmentStrings();
                if (envs) {
                    for (LPCH p = envs; *p; p += strlen(p) + 1) {
                        std::string e(p);
                        if (e.rfind("HOME=", 0) == 0 || e.rfind("PWD=", 0) == 0 ||
                            e.rfind("USER=", 0) == 0 || e.rfind("AMSYS_", 0) == 0)
                            continue;
                        env_block += e + '\0';
                    }
                    FreeEnvironmentStrings(envs);
                }
                std::string cwd_unix = path_mgr_.get_cwd();
                std::string cwd_win = path_mgr_.to_windows(cwd_unix);
                env_block += "HOME=" + home_unix_ + '\0';
                env_block += "AMSYS_HOME=" + home_win_ + '\0';
                env_block += "PWD=" + cwd_unix + '\0';
                env_block += "AMSYS_PWD=" + cwd_win + '\0';
                env_block += "USER=" + username_ + '\0';
                env_block += '\0';
                lpEnv = env_block.empty() ? nullptr : &env_block[0];
            }

            // Set tool working directory if hijack.cwd
            std::string tool_cwd;
            if (hijack.cwd) {
                tool_cwd = path_mgr_.to_windows(path_mgr_.get_cwd());
            }

            BOOL ok = CreateProcessA(nullptr, buf, nullptr, nullptr,
                                     FALSE, 0, lpEnv,
                                     (hijack.cwd && !tool_cwd.empty()) ? tool_cwd.c_str() : nullptr,
                                     &si, &pi);
            delete[] buf;
            if (!ok) {
                DWORD err = GetLastError();
                std::cerr << cmd0 << ": failed to execute (error " << err << ")" << std::endl;
                return 1;
            }

            // Always wait (tool runs in its own console)
            // Wait for tool, interruptible by Ctrl+C
            while (WaitForSingleObject(pi.hProcess, 200) == WAIT_TIMEOUT) {
                if (g_ctrl_c) {
                    g_ctrl_c = false;
                    TerminateProcess(pi.hProcess, 1);
                    break;
                }
            }
            DWORD exit_code = 0;
            GetExitCodeProcess(pi.hProcess, &exit_code);
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            return static_cast<int>(exit_code);
        }
        std::cerr << cmd0 << ": no such command or should run by wine" << std::endl;
        return 1;
    }
}

// ─── Original simple execute ────────────────────────────

int Shell::execute_command(const std::vector<std::string>& args) {
    RedirectedCommand rc;
    rc.args = args;
    return execute_redirected(rc, "", nullptr, nullptr, nullptr);
}

std::vector<std::string> Shell::parse_line(const std::string& line) const {
    std::vector<std::string> args;
    std::string current;
    bool in_quote = false, in_dquote = false;

    for (size_t i = 0; i < line.size(); i++) {
        char c = line[i];

        if (c == '\'' && !in_dquote) {
            in_quote = !in_quote;
            continue;
        }
        if (c == '"' && !in_quote) {
            in_dquote = !in_dquote;
            continue;
        }
        if (c == '\\' && i + 1 < line.size()) {
            char next = line[i+1];
            // Unix convention: \ escapes only special characters; otherwise keep both
            if (next == '\\' || next == '"' || next == '\'' ||
                next == ' ' || next == '\t' || next == '\n') {
                i++; current += next; continue;
            }
            // Not a special char: keep backslash as literal
            current += c;
            continue;
        }
        if ((c == ' ' || c == '\t') && !in_quote && !in_dquote) {
            if (!current.empty()) {
                args.push_back(current);
                current.clear();
            }
            continue;
        }
        current += c;
    }

    if (!current.empty()) {
        args.push_back(current);
    }

    return args;
}

// ─── Builtins ───────────────────────────────────────────

std::string Shell::resolve_tool_path(const std::string& raw) const {
    if (raw.empty()) return {};
    // Absolute path
    if (raw.size() >= 2 && raw[1] == ':') return raw;
    // Relative to exe dir
    if (raw.size() >= 2 && raw[0] == '.' && (raw[1] == '\\' || raw[1] == '/')) {
        char exe_path[MAX_PATH];
        GetModuleFileNameA(nullptr, exe_path, MAX_PATH);
        std::string dir(exe_path);
        auto pos = dir.find_last_of("\\/");
        if (pos != std::string::npos) dir = dir.substr(0, pos);
        return dir + raw.substr(1);
    }
    // Bare name: let CreateProcess search PATH
    return raw;
}

int Shell::builtin_cd(const std::vector<std::string>& args) {
    std::string target = "/";
    if (args.size() > 1) {
        target = args[1];
        if (target == "~") {
            target = env_vars_["HOME"];
        } else if (target.size() > 1 && target[0] == '~') {
            target = env_vars_["HOME"] + "/" + target.substr(1);
        }
    }
    int rc;
    if (path_mgr_.set_cwd(target)) {
        std::string win_path = path_mgr_.to_windows(target);
        if (!win_path.empty()) {
            SetCurrentDirectoryA(win_path.c_str());
        }
        env_vars_["PWD"] = path_mgr_.get_cwd();
        rc = 0;
    } else {
        std::cerr << "cd: " << args[1] << ": No such directory or escape blocked" << std::endl;
        rc = 1;
    }
    // Skip original cd code (the rest is unused)
    // We already handled it above, but the original function body follows.
    // insert a return to avoid executing the old code
    return rc;
}

int Shell::builtin_pwd(const std::vector<std::string>& /*args*/) {
    std::cout << path_mgr_.get_cwd() << std::endl;
    return 0;
}

int Shell::builtin_ls(const std::vector<std::string>& args) {
    // Parse flags
    bool long_format = false;
    bool show_all = false;
    bool short_format = false;
    std::string target = ".";

    for (size_t i = 1; i < args.size(); i++) {
        if (args[i] == "-l" || args[i] == "/l") {
            long_format = true;
        } else if (args[i] == "-a" || args[i] == "--all") {
            show_all = true;
        } else if (args[i] == "-s" || args[i] == "--short") {
            short_format = true;
        } else if (args[i][0] != '-') {
            target = args[i];
        }
    }

    // ls --help or ls -h: show detailed help
    for (size_t i = 1; i < args.size(); i++) {
        if (args[i] == "--help" || args[i] == "-h") {
            std::cout << "ls - list directory contents" << std::endl;
            std::cout << std::endl;
            std::cout << "Usage: ls [OPTION]... [PATH]..." << std::endl;
            std::cout << std::endl;
            std::cout << "Options:" << std::endl;
            std::cout << "  -l           Long format (type + size + time + name)" << std::endl;
            std::cout << "  -a, --all    Show hidden entries (. and .., dotfiles, hidden)" << std::endl;
            std::cout << "  -s, --short  One entry per line (auto when piped)" << std::endl;
            std::cout << "  -h, --help   Show this help" << std::endl;
            std::cout << std::endl;
            std::cout << "Color coding:" << std::endl;
            std::cout << "  \033[1;34mblue\033[0m      Directory" << std::endl;
            std::cout << "  \033[1;32mgreen\033[0m     Executable (.exe .com .bat .cmd .msi)" << std::endl;
            std::cout << "  \033[1;31mred\033[0m       Archive (.zip .rar .7z .tar .gz .iso)" << std::endl;
            std::cout << "  \033[1;35mmagenta\033[0m   Image (.png .jpg .gif .bmp .ico .svg)" << std::endl;
            std::cout << "  \033[1;33myellow\033[0m    Audio (.mp3 .wav .flac .ogg)" << std::endl;
            std::cout << "  \033[38;5;208morange\033[0m   Video (.mp4 .avi .mkv .mov)" << std::endl;
            std::cout << "  \033[1;36mcyan\033[0m      Virtual directory" << std::endl;
            std::cout << "  \033[0;37mwhite\033[0m     Text (.txt .md .log .cfg .ini)" << std::endl;
            std::cout << "  default      Other files" << std::endl;
            return 0;
        }
    }

    // Detect if output is piped (cout redirected by execute_redirected)
    bool piped = (std::cout.rdbuf() != default_cout_buf);
    // Auto-enable short format when piped
    if (piped) short_format = true;

    std::string resolved_target = path_mgr_.resolve(target);
    if (resolved_target.empty()) {
        std::cerr << "ls: " << target << ": Invalid path" << std::endl;
        return 1;
    }

    std::string win_path = path_mgr_.to_windows(resolved_target);

    // Virtual directory? List mount children
    if (win_path.empty() && path_mgr_.is_virtual_dir(resolved_target)) {
        auto children = path_mgr_.list_virtual_children(resolved_target);
        std::sort(children.begin(), children.end());
        for (size_t ci = 0; ci < children.size(); ci++) {
            const std::string& child = children[ci];
            // Hide unmounted partitions unless -a
            if (!show_all && path_mgr_.is_dev_hidden(resolved_target + "/" + child)) {
                continue;
            }
            const char* color = file_color(child, true, 0);
            if (color) std::cout << color;
            std::cout << child;
            if (color) std::cout << "\033[0m";
            if (ci == children.size() - 1) std::cout << std::endl;
            else std::cout << (piped ? "\n" : "  ");
        }
        if (children.empty()) std::cout << std::endl;
        return 0;
    }

    if (win_path.empty()) {
        std::cerr << "ls: " << target << ": No such directory" << std::endl;
        return 1;
    }

    std::wstring wpath = utf8_to_wide(acp_to_utf8(win_path));
    if (wpath.empty()) {
        std::cerr << "ls: " << target << ": Invalid path" << std::endl;
        return 1;
    }

    std::wstring search_pattern = wpath;
    if (search_pattern.back() != L'\\') search_pattern += L'\\';
    search_pattern += L'*';

    WIN32_FIND_DATAW ffd;
    HANDLE hFind = FindFirstFileW(search_pattern.c_str(), &ffd);
    if (hFind == INVALID_HANDLE_VALUE) {
        std::cerr << "ls: " << target << ": Cannot access directory" << std::endl;
        return 1;
    }

    struct Entry {
        std::string name;
        bool is_dir;
        DWORD attrs;
        long long size;
        FILETIME ft;
    };
    std::vector<Entry> entries;

    do {
        std::wstring wname = ffd.cFileName;
        if (wname == L"." || wname == L"..") {
            if (!show_all) continue;
        }

        int utf8_len = WideCharToMultiByte(CP_UTF8, 0, wname.c_str(), -1, nullptr, 0, nullptr, nullptr);
        std::string name(static_cast<size_t>(utf8_len) - 1, '\0');
        WideCharToMultiByte(CP_UTF8, 0, wname.c_str(), -1, &name[0], utf8_len, nullptr, nullptr);

        // Hide .floder system files (never show, even with -a)
        if (name.size() > 7 && name.substr(name.size() - 7) == ".floder") continue;

        bool is_dir = (ffd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
        // Skip Windows hidden files and dotfiles unless -a
        if (!show_all) {
            if ((ffd.dwFileAttributes & FILE_ATTRIBUTE_HIDDEN) ||
                (!wname.empty() && wname[0] == L'.')) {
                continue;
            }
        }
        LARGE_INTEGER sz;
        sz.LowPart = ffd.nFileSizeLow;
        sz.HighPart = ffd.nFileSizeHigh;

        entries.push_back({name, is_dir, ffd.dwFileAttributes, (long long)sz.QuadPart, ffd.ftLastWriteTime});
    } while (FindNextFileW(hFind, &ffd) != 0);
    FindClose(hFind);

    // Add mount table children that aren't real files on disk
    // (e.g., /dev shows as "dev" when listing /)
    {
        std::string vprefix = resolved_target;
        if (vprefix.back() != '/') vprefix += '/';
        auto virt_children = path_mgr_.list_virtual_children(resolved_target);
        for (const auto& vc : virt_children) {
            bool found = false;
            for (const auto& e : entries) {
                std::string el, ll;
                for (char c : e.name) el += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
                for (char c : vc) ll += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
                if (el == ll) { found = true; break; }
            }
            if (!found) {
                Entry ve;
                ve.name = vc;
                ve.is_dir = true;
                ve.attrs = FILE_ATTRIBUTE_DIRECTORY;
                ve.size = 0;
                ve.ft.dwLowDateTime = 0;
                ve.ft.dwHighDateTime = 0;
                entries.push_back(ve);
            }
        }
    }

    // Sort: directories first, then alphabetical
    std::sort(entries.begin(), entries.end(), [](const Entry& a, const Entry& b) {
        if (a.is_dir != b.is_dir) return a.is_dir > b.is_dir;
        std::string al, bl;
        for (char c : a.name) al += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        for (char c : b.name) bl += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        return al < bl;
    });

    const char* short_sep = short_format ? "\n" : "  ";

    for (size_t ei = 0; ei < entries.size(); ei++) {
        const auto& e = entries[ei];
        bool is_last = (ei == entries.size() - 1);

        if (long_format) {
            char type_char = e.is_dir ? 'd' : '-';
            FILETIME ft = e.ft;
            SYSTEMTIME st;
            FileTimeToLocalFileTime(&ft, &ft);
            FileTimeToSystemTime(&ft, &st);
            char timebuf[64];
            static const char* months[] = {"Jan","Feb","Mar","Apr","May","Jun",
                                          "Jul","Aug","Sep","Oct","Nov","Dec"};
            if (st.wMonth >= 1 && st.wMonth <= 12) {
                snprintf(timebuf, sizeof(timebuf), "%s %02d %02d:%02d",
                         months[st.wMonth - 1], st.wDay, st.wHour, st.wMinute);
            } else {
                snprintf(timebuf, sizeof(timebuf), "??? ?? ??:??");
            }

            printf("%c%c%c%c%c%c%c%c%c%c %8lld %s ",
                   type_char, 'r','w','x','r','w','x','r','w','x',
                   e.size, timebuf);

            bool is_virtual_lf = path_mgr_.is_virtual_dir(resolved_target + "/" + e.name);
            const char* color_lf = is_virtual_lf ? "\033[1;36m" : file_color(e.name, e.is_dir, e.attrs);
            if (color_lf) std::cout << color_lf;
            std::cout << e.name;
            if (color_lf) std::cout << "\033[0m";
            std::cout << std::endl;
        } else {
            // Use cyan for virtual directories
            bool is_virtual = path_mgr_.is_virtual_dir(resolved_target + "/" + e.name);
            const char* color = is_virtual ? "\033[1;36m" : file_color(e.name, e.is_dir, e.attrs);
            if (color) std::cout << color;
            std::cout << e.name;
            if (color) std::cout << "\033[0m";
            if (is_last) std::cout << std::endl;
            else std::cout << short_sep;
        }
    }
    return 0;
}
int Shell::builtin_cat(const std::vector<std::string>& args) {
    if (args.size() < 2) {
        // Read from stdin (for pipe support)
        std::string line;
        while (std::getline(std::cin, line)) {
            std::cout << line << std::endl;
        }
        return 0;
    }

    for (size_t i = 1; i < args.size(); i++) {
        // Special device: /dev/null -> empty
        std::string resolved = path_mgr_.resolve(args[i]);
        if (path_mgr_.is_special_device(resolved)) {
            if (resolved == "/dev/null") {
                // cat /dev/null = nothing
                continue;
            }
            if (resolved == "/dev/zero") {
                // Output a reasonable chunk of zeros (not infinite)
                char z[4096] = {0};
                for (int n = 0; n < 256; n++) std::cout.write(z, sizeof(z));
                continue;
            }
        }
        // Disk device: try to read from \\.\PhysicalDriveX
        if (path_mgr_.is_disk_device(resolved)) {
            std::string win_path = path_mgr_.to_windows(resolved);
            if (win_path.empty()) {
                std::cerr << "cat: " << args[i] << ": Cannot access disk" << std::endl;
                continue;
            }
            // Check if running as admin
            BOOL isAdmin = FALSE;
            PSID adminGroup = NULL;
            SID_IDENTIFIER_AUTHORITY ntAuth = SECURITY_NT_AUTHORITY;
            if (AllocateAndInitializeSid(&ntAuth, 2, SECURITY_BUILTIN_DOMAIN_RID,
                                          DOMAIN_ALIAS_RID_ADMINS, 0,0,0,0,0,0, &adminGroup)) {
                CheckTokenMembership(NULL, adminGroup, &isAdmin);
                FreeSid(adminGroup);
            }
            if (!isAdmin) {
                std::cerr << "cat: " << args[i] << ": Requires administrator privileges" << std::endl;
                continue;
            }
            HANDLE hDisk = CreateFileA(win_path.c_str(), GENERIC_READ,
                                       FILE_SHARE_READ | FILE_SHARE_WRITE,
                                       nullptr, OPEN_EXISTING, 0, nullptr);
            if (hDisk == INVALID_HANDLE_VALUE) {
                std::cerr << "cat: " << args[i] << ": Permission denied" << std::endl;
                continue;
            }
            char buf[512];
            DWORD read;
            if (ReadFile(hDisk, buf, sizeof(buf), &read, nullptr)) {
                std::cout.write(buf, read);
            }
            CloseHandle(hDisk);
            continue;
        }

        std::string win_path = path_mgr_.to_windows(args[i]);
        if (win_path.empty()) {
            std::cerr << "cat: " << args[i] << ": Invalid path" << std::endl;
            continue;
        }

        // Check if path is a directory
        std::wstring wcat = utf8_to_wide(acp_to_utf8(win_path));
        DWORD cat_attr = GetFileAttributesW(wcat.c_str());
        if (cat_attr != INVALID_FILE_ATTRIBUTES && (cat_attr & FILE_ATTRIBUTE_DIRECTORY)) {
            std::cerr << "cat: " << args[i] << ": Is a directory" << std::endl;
            continue;
        }

        std::ifstream file(win_path, std::ios::binary);
        if (!file.is_open()) {
            std::cerr << "cat: " << args[i] << ": No such file" << std::endl;
            continue;
        }

        char cbuf[65536];
        char last_char = '\n';
        while (file.read(cbuf, sizeof(cbuf)) || file.gcount() > 0) {
            std::cout.write(cbuf, file.gcount());
            if (file.gcount() > 0) last_char = cbuf[file.gcount() - 1];
        }
        if (last_char != '\n') std::cout << std::endl;
    }
    return 0;
}

int Shell::builtin_echo(const std::vector<std::string>& args) {
    for (size_t i = 1; i < args.size(); i++) {
        if (i > 1) std::cout << " ";
        std::cout << args[i];
    }
    std::cout << std::endl;
    return 0;
}

int Shell::builtin_grep(const std::vector<std::string>& args) {
    bool ignore_case = false;
    std::string pattern;
    std::vector<std::string> files;
    size_t arg_i = 1;

    // Parse flags
    while (arg_i < args.size() && args[arg_i][0] == '-') {
        if (args[arg_i] == "-i") {
            ignore_case = true;
        } else {
            std::cerr << "grep: unknown flag " << args[arg_i] << std::endl;
            return 1;
        }
        arg_i++;
    }

    // Pattern
    if (arg_i >= args.size()) {
        std::cerr << "grep: missing pattern" << std::endl;
        return 1;
    }
    pattern = args[arg_i++];

    // Files (optional)
    while (arg_i < args.size()) {
        files.push_back(args[arg_i++]);
    }

    // Build lowercase pattern if -i
    std::string pattern_lower = to_lower(pattern);

    auto match_line = [&](const std::string& line) -> bool {
        if (ignore_case) {
            return to_lower(line).find(pattern_lower) != std::string::npos;
        }
        return line.find(pattern) != std::string::npos;
    };

    if (files.empty()) {
        // Read from stdin
        std::string line;
        while (std::getline(std::cin, line)) {
            // Remove trailing \r if present
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (match_line(line)) {
                std::cout << line << std::endl;
            }
        }
    } else {
        bool multiple_files = (files.size() > 1);
        for (const auto& fname : files) {
            std::string win_path = path_mgr_.to_windows(fname);
            if (win_path.empty()) {
                std::cerr << "grep: " << fname << ": Invalid path" << std::endl;
                continue;
            }

            std::ifstream file(win_path);
            if (!file.is_open()) {
                std::cerr << "grep: " << fname << ": No such file" << std::endl;
                continue;
            }

            std::string line;
            while (std::getline(file, line)) {
                if (!line.empty() && line.back() == '\r') line.pop_back();
                if (match_line(line)) {
                    if (multiple_files) {
                        std::cout << fname << ":";
                    }
                    std::cout << line << std::endl;
                }
            }
        }
    }

    return 0;
}

int Shell::builtin_mount(const std::vector<std::string>& args) {
    // mount with no args: show mounts
    if (args.size() < 3) {
        path_mgr_.list_mounts();
        return 0;
    }

    // mount <device> <mountpoint>: create .floder to mount device
    std::string device = args[1];  // e.g. /dev/sda1
    std::string mountpoint = args[2];  // e.g. /mnt/no

    // Get device Windows path from mount table (e.g. /dev/sda -> \.\PhysicalDrive0)
    std::string win_path = path_mgr_.get_mount(device);
    if (win_path.empty()) {
        std::cerr << "mount: " << device << ": no such device" << std::endl;
        return 1;
    }

    // Resolve the mount point path
    std::string resolved_mp = path_mgr_.resolve(mountpoint);
    if (resolved_mp.empty()) {
        std::cerr << "mount: " << mountpoint << ": invalid path" << std::endl;
        return 1;
    }

    // Get the last component of the mount point for the .floder file name
    std::string leaf;
    auto pos = resolved_mp.find_last_of('/');
    if (pos == std::string::npos) {
        leaf = resolved_mp;
    } else {
        leaf = resolved_mp.substr(pos + 1);
    }
    if (leaf.empty()) {
        std::cerr << "mount: invalid mount point" << std::endl;
        return 1;
    }

        // For the mount point directory, compute the real path
    std::string mount_win = path_mgr_.to_windows(resolved_mp);
    if (mount_win.empty() && path_mgr_.is_virtual_dir(resolved_mp)) {
        std::cerr << "mount: " << resolved_mp << ": is a virtual directory" << std::endl;
        return 1;
    }
    if (mount_win.empty()) {
        auto pp = resolved_mp.find_last_of('/');
        std::string pr = (pp == std::string::npos) ? "/" : resolved_mp.substr(0, pp);
        std::string lf = (pp == std::string::npos) ? resolved_mp.substr(1) : resolved_mp.substr(pp + 1);
        if (path_mgr_.is_virtual_dir(pr)) {
            mount_win = path_mgr_.get_root() + "\\" + pr.substr(1) + "\\" + lf;
        }
    }
    if (mount_win.empty()) {
        std::cerr << "mount: " << resolved_mp << ": cannot resolve" << std::endl;
        return 1;
    }

    // Create the mount point directory (recursively)
    {
        std::wstring wmount = utf8_to_wide(acp_to_utf8(mount_win));
        if (!wmount.empty()) {
            std::wstring acc;
            for (size_t wi = 0; wi < wmount.size(); wi++) {
                acc += wmount[wi];
                if (wmount[wi] == L'\\' || wi == wmount.size() - 1) {
                    if (!acc.empty() && acc != L"\\") {
                        CreateDirectoryW(acc.c_str(), nullptr);
                    }
                }
            }
        }
    }

    // Create the .floder file at the PARENT level, not inside the mount point
    // e.g. for /media/test, create <root>\media\test.floder, not <root>\media\test\test.floder
    auto last_slash = mount_win.find_last_of("\\");
    std::string floder_parent = (last_slash == std::string::npos) ? mount_win : mount_win.substr(0, last_slash);
    std::string floder_path = floder_parent + "\\" + leaf + ".floder";// Refresh: add to mount table
    // (On next startup the floder will be auto-loaded; for now we do it manually)
    {
        std::ofstream fl(floder_path, std::ios::binary);
        if (fl.is_open()) { fl << win_path; fl.close(); }
    }
    path_mgr_.add_mount(resolved_mp, win_path);

    std::cout << "mounted " << device << " at " << resolved_mp << std::endl;
    return 0;
}

int Shell::builtin_umount(const std::vector<std::string>& args) {
    if (args.size() < 2) {
        std::cerr << "umount: missing operand" << std::endl;
        return 1;
    }

    std::string target = args[1];
    std::string resolved = path_mgr_.resolve(target);
    if (resolved.empty()) {
        std::cerr << "umount: " << target << ": invalid path" << std::endl;
        return 1;
    }

    // Get the parent directory and leaf name
    auto pos = resolved.find_last_of('/');
    std::string parent = (pos == std::string::npos) ? "/" : resolved.substr(0, pos);
    std::string leaf = (pos == std::string::npos) ? resolved.substr(1) : resolved.substr(pos + 1);
    if (leaf.empty()) {
        std::cerr << "umount: invalid path" << std::endl;
        return 1;
    }

    // Construct .floder file path
    std::string parent_win = path_mgr_.to_windows(parent);
    if (parent_win.empty()) return 1;
    std::string floder_path = parent_win + "\\" + leaf + ".floder";

    // Remove the .floder file
    std::wstring wfloder = utf8_to_wide(acp_to_utf8(floder_path));
    if (DeleteFileW(wfloder.c_str())) {
        path_mgr_.remove_mount(resolved);
        std::cout << "unmounted " << resolved << std::endl;
    } else {
        std::cerr << "umount: " << target << ": not mounted" << std::endl;
        return 1;
    }
    return 0;
}

int Shell::builtin_newfl(const std::vector<std::string>& args) {
    bool make_junction = false;
    std::string floder_arg, win_target;

    for (size_t i = 1; i < args.size(); i++) {
        if (args[i] == "-j" || args[i] == "--junction") {
            make_junction = true;
        } else if (args[i] == "-h" || args[i] == "--help") {
            std::cout << "newfl - create a .floder file or junction" << std::endl;
            std::cout << "Usage:" << std::endl;
            std::cout << "  newfl floder_path windows_path" << std::endl;
            std::cout << "  newfl -j link_path target_path" << std::endl;
            std::cout << "Options:  -j, --junction  Windows junction" << std::endl;
            std::cout << "Example:" << std::endl;
            std::cout << "  newfl /opt.floder D:\\program files" << std::endl;
            std::cout << "  newfl -j /mnt/link D:\\target" << std::endl;
            return 0;
        } else if (floder_arg.empty()) {
            floder_arg = args[i];
        } else {
            win_target = args[i];
        }
    }

    if (floder_arg.empty() || win_target.empty()) {
        std::cerr << "newfl: missing operand. Try 'newfl -h' for help." << std::endl;
        return 1;
    }

    if (make_junction) {
        std::string link_win = path_mgr_.to_windows(floder_arg);
        std::string target_win = win_target;
        if (target_win.size() > 1 && target_win[0] == '/') {
            std::string conv = path_mgr_.to_windows(target_win);
            if (!conv.empty()) target_win = conv;
        }
        if (link_win.empty()) {
            std::cerr << "newfl: " << floder_arg << ": cannot resolve" << std::endl; return 1;
        }
        if (target_win.empty()) {
            std::cerr << "newfl: invalid target" << std::endl; return 1;
        }
        std::wstring wlink = utf8_to_wide(acp_to_utf8(link_win));
        std::wstring wtarget = utf8_to_wide(acp_to_utf8(target_win));
        auto p = wlink.find_last_of(L"\\/");
        if (p != std::string::npos) {
            std::wstring par = wlink.substr(0, p);
            std::wstring acc;
            for (size_t wi = 0; wi < par.size(); wi++) {
                acc += par[wi];
                if (par[wi] == L'\\' || wi == par.size() - 1) {
                    if (!acc.empty() && acc != L"\\") CreateDirectoryW(acc.c_str(), nullptr);
                }
            }
        }
        if (!CreateSymbolicLinkW(wlink.c_str(), wtarget.c_str(), SYMBOLIC_LINK_FLAG_DIRECTORY)) {
            DWORD err = GetLastError();
            std::cerr << "newfl -j: failed (error " << err << ")" << std::endl;
            std::cerr << "  Admin rights or Developer Mode may be required." << std::endl;
            return 1;
        }
        std::cout << "created junction " << floder_arg << " -> " << target_win << std::endl;
        return 0;
    }  // e.g. /system.floder

    // Ensure the floder path has .floder extension
    std::string floder_path = floder_arg;
    if (floder_path.size() < 7 || floder_path.substr(floder_path.size() - 7) != ".floder") {
        floder_path += ".floder";
    }

    // Resolve the directory containing the .floder file
    auto pos = floder_path.find_last_of('/');
    std::string parent = (pos == std::string::npos) ? "/" : floder_path.substr(0, pos);
    std::string leaf = (pos == std::string::npos) ? floder_path : floder_path.substr(pos + 1);

    std::string parent_win = path_mgr_.to_windows(parent);
    if (parent_win.empty()) {
        std::cerr << "newfl: " << parent << ": no such directory" << std::endl;
        return 1;
    }

    // Create parent directory if needed
    std::wstring wparent = utf8_to_wide(acp_to_utf8(parent_win));
    if (!wparent.empty()) {
        CreateDirectoryW(wparent.c_str(), nullptr);
    }

    // Write .floder file
    std::string full_path = parent_win + "\\" + leaf;
    std::ofstream fl(full_path, std::ios::binary);
    if (!fl.is_open()) {
        std::cerr << "newfl: failed to create " << floder_path << std::endl;
        return 1;
    }
    fl << utf8_to_acp(win_target);
    fl.close();

    std::cout << "created " << floder_path << " -> " << win_target << std::endl;
    return 0;
}

int Shell::builtin_mkdir(const std::vector<std::string>& args) {
    if (args.size() < 2) {
        std::cerr << "mkdir: missing operand" << std::endl;
        return 1;
    }

    for (size_t i = 1; i < args.size(); i++) {
        std::string res = path_mgr_.resolve(args[i]);
        if (path_mgr_.is_virtual_dir(res)) continue;

        std::string win_path = path_mgr_.to_windows(args[i]);
        if (win_path.empty()) {
            // Path under a virtual directory (e.g. /media/test): use root as base
            auto p = res.find_last_of('/');
            std::string parent = (p == std::string::npos) ? "/" : res.substr(0, p);
            std::string leaf = (p == std::string::npos) ? res.substr(1) : res.substr(p + 1);
            if (path_mgr_.is_virtual_dir(parent) && leaf.find('/') == std::string::npos) {
                win_path = path_mgr_.get_root() + "\\" + parent.substr(1) + "\\" + leaf;
            }
        }
        if (win_path.empty()) {
            std::cerr << "mkdir: " << args[i] << ": cannot create directory" << std::endl;
            continue;
        }
        std::wstring wpath = utf8_to_wide(acp_to_utf8(win_path));
        // Create parent directories recursively
        if (!wpath.empty()) {
            std::wstring acc;
            for (size_t wi = 0; wi < wpath.size(); wi++) {
                acc += wpath[wi];
                if (wpath[wi] == L'\\' || wi == wpath.size() - 1) {
                    if (!acc.empty() && acc != L"\\") {
                        CreateDirectoryW(acc.c_str(), nullptr);
                    }
                }
            }
        }
    }
    return 0;
}

int Shell::builtin_rm(const std::vector<std::string>& args) {
    if (args.size() < 2) {
        std::cerr << "rm: missing operand" << std::endl;
        return 1;
    }

    bool recursive = false;
    std::vector<std::string> targets;
    for (size_t i = 1; i < args.size(); i++) {
        if (args[i] == "-r" || args[i] == "-rf") {
            recursive = true;
        } else if (args[i] == "-f") {
            // force, ignore errors
        } else {
            targets.push_back(args[i]);
        }
    }

    for (const auto& t : targets) {
        std::string win_path = path_mgr_.to_windows(t);
        if (win_path.empty()) {
            std::cerr << "rm: " << t << ": No such file" << std::endl;
            continue;
        }

        std::wstring wpath = utf8_to_wide(acp_to_utf8(win_path));
        DWORD attrs = GetFileAttributesW(wpath.c_str());
        if (attrs == INVALID_FILE_ATTRIBUTES) {
            std::cerr << "rm: " << t << ": No such file" << std::endl;
            continue;
        }

        if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
            if (!recursive) {
                std::cerr << "rm: " << t << ": Is a directory (use -r)" << std::endl;
                continue;
            }
            // Recursive directory removal using SHFileOperationW or simple loop
            // Simple approach: remove directory (must be empty)
            std::vector<std::wstring> dirs;
            dirs.push_back(wpath);
            for (size_t ri = 0; ri < dirs.size(); ri++) {
                std::wstring sp = dirs[ri] + L"\\*";
                WIN32_FIND_DATAW fd;
                HANDLE hf = FindFirstFileW(sp.c_str(), &fd);
                if (hf != INVALID_HANDLE_VALUE) {
                    do {
                        std::wstring fn = fd.cFileName;
                        if (fn == L"." || fn == L"..") continue;
                        std::wstring fp = dirs[ri] + L"\\" + fn;
                        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
                            dirs.push_back(fp);
                        else
                            DeleteFileW(fp.c_str());
                    } while (FindNextFileW(hf, &fd));
                    FindClose(hf);
                }
            }
            for (size_t ri = dirs.size(); ri > 0; ri--)
                RemoveDirectoryW(dirs[ri - 1].c_str());
        } else {
            if (DeleteFileW(wpath.c_str())) {
                // success
            } else {
                std::cerr << "rm: " << t << ": failed to remove file" << std::endl;
            }
        }
    }
    return 0;
}




int Shell::builtin_cp(const std::vector<std::string>& args) {
    if (args.size() < 3) {
        std::cerr << "cp: missing operand" << std::endl;
        std::cerr << "Usage: cp [-r] source dest" << std::endl;
        return 1;
    }
    bool recursive = false;
    size_t arg_start = 1;
    if (args[1] == "-r" || args[1] == "-rf") {
        recursive = true;
        arg_start = 2;
        if (args.size() < 4) { std::cerr << "cp: missing operand" << std::endl; return 1; }
    }
    std::string src = args[arg_start];
    std::string dst = args[arg_start + 1];
    std::string src_win = path_mgr_.to_windows(src);
    std::string dst_win = path_mgr_.to_windows(dst);
    if (src_win.empty()) { std::cerr << "cp: " << src << ": No such file" << std::endl; return 1; }
    if (dst_win.empty()) { std::cerr << "cp: " << dst << ": Invalid path" << std::endl; return 1; }
    std::wstring wsrc = utf8_to_wide(acp_to_utf8(src_win));
    std::wstring wdst = utf8_to_wide(acp_to_utf8(dst_win));
    DWORD src_attr = GetFileAttributesW(wsrc.c_str());
    if (src_attr == INVALID_FILE_ATTRIBUTES) { std::cerr << "cp: " << src << ": No such file" << std::endl; return 1; }
    if (src_attr & FILE_ATTRIBUTE_DIRECTORY) {
        if (!recursive) { std::cerr << "cp: " << src << ": Is a directory (use -r)" << std::endl; return 1; }
        SHFILEOPSTRUCTW sh = {0};
        sh.wFunc = FO_COPY;
        std::wstring src_path = wsrc + L"\\*";
        src_path.push_back(0);
        std::wstring dst_path = wdst;
        dst_path.push_back(0);
        sh.pFrom = src_path.c_str();
        sh.pTo = dst_path.c_str();
        sh.fFlags = FOF_SILENT | FOF_NOCONFIRMATION | FOF_NOERRORUI;
        if (SHFileOperationW(&sh) != 0) { std::cerr << "cp: failed to copy " << src << std::endl; return 1; }
    } else {
        if (!CopyFileW(wsrc.c_str(), wdst.c_str(), FALSE)) {
            DWORD err = GetLastError();
            std::cerr << "cp: failed to copy " << src << " (error " << err << ")" << std::endl;
            return 1;
        }
    }
    return 0;
}

int Shell::builtin_mv(const std::vector<std::string>& args) {
    if (args.size() < 3) {
        std::cerr << "mv: missing operand" << std::endl;
        std::cerr << "Usage: mv source dest" << std::endl;
        return 1;
    }
    std::string src = args[1];
    std::string dst = args[2];
    std::string src_win = path_mgr_.to_windows(src);
    std::string dst_win = path_mgr_.to_windows(dst);
    if (src_win.empty()) { std::cerr << "mv: " << src << ": No such file" << std::endl; return 1; }
    if (dst_win.empty()) { std::cerr << "mv: " << dst << ": Invalid path" << std::endl; return 1; }
    std::wstring wsrc = utf8_to_wide(acp_to_utf8(src_win));
    std::wstring wdst = utf8_to_wide(acp_to_utf8(dst_win));
    if (!MoveFileW(wsrc.c_str(), wdst.c_str())) {
        DWORD err = GetLastError();
        std::cerr << "mv: failed to move " << src << " (error " << err << ")" << std::endl;
        return 1;
    }
    return 0;
}

int Shell::builtin_export(const std::vector<std::string>& args) {
    if (args.size() < 2) {
        // export with no args: show all
        for (const auto& [k, v] : env_vars_)
            std::cout << k << "=" << v << std::endl;
        return 0;
    }
    for (size_t i = 1; i < args.size(); i++) {
        auto eq = args[i].find('=');
        if (eq == std::string::npos) {
            // export VAR (set to "1")
            env_vars_[args[i]] = "1";
        } else {
            std::string k = args[i].substr(0, eq);
            std::string v = args[i].substr(eq + 1);
            // Expand $VAR in the value
            env_vars_[k] = expand_vars(v);
        }
    }
    return 0;
}

int Shell::builtin_unset(const std::vector<std::string>& args) {
    if (args.size() < 2) { std::cerr << "unset: missing operand" << std::endl; return 1; }
    for (size_t i = 1; i < args.size(); i++) {
        // Don't allow unsetting built-in variables
        if (args[i] == "PATH" || args[i] == "AMSYS_LOCATE" || args[i] == "AMSYS_VERSION" ||
            args[i] == "AMSYS_ROOT" || args[i] == "HOME" || args[i] == "PWD") {
            std::cerr << "unset: cannot unset " << args[i] << std::endl;
            continue;
        }
        env_vars_.erase(args[i]);
    }
    return 0;
}

// MD5 hex hash via Windows CryptoAPI (matches existing shadow format)
static std::string md5_hex(const std::string& data) {
    HCRYPTPROV prov = 0;
    HCRYPTHASH hash = 0;
    if (!CryptAcquireContext(&prov, nullptr, nullptr, PROV_RSA_FULL, CRYPT_VERIFYCONTEXT))
        return {};
    if (!CryptCreateHash(prov, CALG_MD5, 0, 0, &hash)) {
        CryptReleaseContext(prov, 0);
        return {};
    }
    CryptHashData(hash, reinterpret_cast<const BYTE*>(data.data()),
                  static_cast<DWORD>(data.size()), 0);
    BYTE digest[16];
    DWORD len = 16;
    CryptGetHashParam(hash, HP_HASHVAL, digest, &len, 0);
    CryptDestroyHash(hash);
    CryptReleaseContext(prov, 0);
    char hex[33];
    for (int i = 0; i < 16; i++)
        std::sprintf(hex + i * 2, "%02x", digest[i]);
    hex[32] = '\0';
    return std::string(hex);
}

// Read password with hidden input on TTY; plain line on pipes (for scripts/tests)
static std::string read_password(const std::string& prompt) {
    std::cout << prompt;
    std::cout.flush();
    std::string pwd;
    if (_isatty(_fileno(stdin))) {
        while (true) {
            int ch = _getch();
            if (ch == '\r' || ch == '\n') break;
            if (ch == 8 || ch == 127) {  // backspace / del
                if (!pwd.empty()) pwd.pop_back();
                continue;
            }
            pwd += static_cast<char>(ch);
        }
        std::cout << std::endl;
    } else {
        std::getline(std::cin, pwd);
    }
    return pwd;
}

int Shell::builtin_passwd(const std::vector<std::string>& args) {
    std::string target = username_;
    if (args.size() > 1) {
        if (args[1] == "-h" || args[1] == "--help") {
            std::cout << "passwd - change password (stored in /etc/shadow)" << std::endl;
            std::cout << std::endl;
            std::cout << "Usage:" << std::endl;
            std::cout << "  passwd              Change current user's password" << std::endl;
            std::cout << "  passwd <username>   Change another user's password (root/sudo only)" << std::endl;
            return 0;
        }
        target = args[1];
        if (target != username_) {
            if (permission_ != "root" && permission_ != "sudo") {
                std::cerr << "passwd: permission denied: only root/sudo can change another user's password" << std::endl;
                return 1;
            }
            if (!user_exists(target)) {
                std::cerr << "passwd: user '" << target << "' does not exist" << std::endl;
                return 1;
            }
        }
    }

    std::string p1 = read_password("New password: ");
    if (p1.empty()) {
        std::cerr << "passwd: password cannot be empty" << std::endl;
        return 1;
    }
    std::string p2 = read_password("Retype new password: ");
    if (p1 != p2) {
        std::cerr << "passwd: passwords do not match" << std::endl;
        return 1;
    }

    std::string hash = md5_hex(p1);
    if (hash.empty()) {
        std::cerr << "passwd: failed to hash password" << std::endl;
        return 1;
    }

    // Update /etc/shadow (name:hash:min:max:warn:inactive:expire:reserved)
    std::string shadow_path = path_mgr_.get_root() + "\\etc\\shadow";
    std::vector<std::string> lines;
    bool found = false;
    {
        std::ifstream sf(shadow_path);
        if (sf.is_open()) {
            std::string line;
            while (std::getline(sf, line)) {
                auto parts = split(line, ':');
                if (!parts.empty() && parts[0] == target) {
                    line = target + ":" + hash + ":0:99999:7:::";
                    found = true;
                }
                lines.push_back(line);
            }
            sf.close();
        }
    }
    if (!found)
        lines.push_back(target + ":" + hash + ":0:99999:7:::");

    std::ofstream of(shadow_path, std::ios::binary);
    for (const auto& l : lines) of << l << "\n";
    of.close();

    std::cout << "passwd: password updated for " << target << std::endl;
    return 0;
}

bool Shell::user_exists(const std::string& name) const {
    std::string passwd_path = path_mgr_.get_root() + "\\etc\\passwd";
    std::ifstream pf(passwd_path);
    if (pf.is_open()) {
        std::string line;
        while (std::getline(pf, line)) {
            auto parts = split(line, ':');
            if (!parts.empty() && parts[0] == name) {
                pf.close();
                return true;
            }
        }
        pf.close();
    }
    return false;
}

void Shell::create_user_home(const std::string& name) {
    std::string home_win = path_mgr_.to_windows("/home") + "\\" + name;
    // Recursively create the home directory
    {
        std::string acc;
        for (size_t i = 0; i < home_win.size(); i++) {
            acc += home_win[i];
            if (home_win[i] == '\\' || i == home_win.size() - 1) {
                if (acc.size() > 3) CreateDirectoryA(acc.c_str(), nullptr);
            }
        }
    }
    // Standard subdirectories
    std::wstring whome = utf8_to_wide(acp_to_utf8(home_win));
    const wchar_t* subdirs[] = {
        L"Desktop", L"Downloads", L"Documents",
        L"Pictures", L"Videos", L"Music", L"Trash"
    };
    for (const wchar_t* sub : subdirs) {
        CreateDirectoryW((whome + L"\\" + sub).c_str(), nullptr);
    }
    // .config/amsys with default user.yaml (permission: user)
    set_user_permission(name, "user");
}

bool Shell::set_user_permission(const std::string& name, const std::string& perm) {
    std::string home_win = path_mgr_.to_windows("/home") + "\\" + name;
    std::string cfg_dir = home_win + "\\.config\\amsys";
    {
        std::string acc;
        for (size_t i = 0; i < cfg_dir.size(); i++) {
            acc += cfg_dir[i];
            if (cfg_dir[i] == '\\' || i == cfg_dir.size() - 1) {
                if (acc.size() > 3) CreateDirectoryA(acc.c_str(), nullptr);
            }
        }
    }
    std::string yaml_path = cfg_dir + "\\user.yaml";
    std::ofstream of(yaml_path, std::ios::binary);
    if (!of.is_open()) return false;
    of << "user:\n"
       << "  name: " << name << "\n"
       << "  permission: " << perm << "\n";
    of.close();
    return true;
}

int Shell::builtin_adduser(const std::vector<std::string>& args) {
    if (args.size() < 2 || args[1] == "-h" || args[1] == "--help") {
        std::cout << "adduser - create a new user" << std::endl;
        std::cout << std::endl;
        std::cout << "Usage: adduser <username>" << std::endl;
        std::cout << "  Creates home directory, /etc/passwd entry," << std::endl;
        std::cout << "  and asks for a password (like Unix adduser)." << std::endl;
        return args.size() < 2 ? 1 : 0;
    }
    if (permission_ != "root" && permission_ != "sudo") {
        std::cerr << "adduser: permission denied: only root/sudo can create users" << std::endl;
        return 1;
    }
    std::string name = args[1];
    if (name.empty() || name == "root") {
        std::cerr << "adduser: invalid username '" << name << "'" << std::endl;
        return 1;
    }
    if (user_exists(name)) {
        std::cerr << "adduser: user '" << name << "' already exists" << std::endl;
        return 1;
    }
    create_user_home(name);
    ensure_passwd();  // registers in /etc/passwd with next UID
    std::cout << "adduser: created user '" << name << "'" << std::endl;
    std::cout << "Now set a password for '" << name << "':" << std::endl;
    return builtin_passwd({"passwd", name});
}

int Shell::builtin_usermod(const std::vector<std::string>& args) {
    if (args.size() < 3 || args[1] == "-h" || args[1] == "--help") {
        std::cout << "usermod - modify user permission" << std::endl;
        std::cout << std::endl;
        std::cout << "Usage: usermod <username> sudo|user" << std::endl;
        std::cout << "  root's permission is always root and cannot be changed." << std::endl;
        return args.size() < 3 ? 1 : 0;
    }
    if (permission_ != "root" && permission_ != "sudo") {
        std::cerr << "usermod: permission denied: only root/sudo can modify users" << std::endl;
        return 1;
    }
    std::string name = args[1];
    std::string perm = args[2];
    if (name == "root") {
        std::cerr << "usermod: cannot change root's permission (root is always root)" << std::endl;
        return 1;
    }
    if (perm != "sudo" && perm != "user") {
        std::cerr << "usermod: permission must be 'sudo' or 'user'" << std::endl;
        return 1;
    }
    if (!user_exists(name)) {
        std::cerr << "usermod: user '" << name << "' does not exist" << std::endl;
        return 1;
    }
    if (!set_user_permission(name, perm)) {
        std::cerr << "usermod: failed to update user config for '" << name << "'" << std::endl;
        return 1;
    }
    std::cout << "usermod: permission for '" << name << "' set to " << perm << std::endl;
    return 0;
}

int Shell::builtin_env(const std::vector<std::string>& args) {
    for (const auto& [k, v] : env_vars_)
        std::cout << k << "=" << v << std::endl;
    return 0;
}

int Shell::builtin_tools(const std::vector<std::string>& args) {
    if (args.size() > 1 && (args[1] == "-h" || args[1] == "--help")) {
        std::cout << "tools - list registered tool aliases" << std::endl;
        std::cout << std::endl;
        std::cout << "Tools are registered in config.ini [tools] section." << std::endl;
        std::cout << "Usage: tools" << std::endl;
        return 0;
    }
    if (tools_.empty()) {
        std::cout << "No tools registered. Add [tools] section to config.ini" << std::endl;
        return 0;
    }
    std::cout << "Registered tools:" << std::endl;
    for (const auto& [alias, exe] : tools_) {
        std::cout << "  " << alias << "  -> " << exe << std::endl;
    }
    return 0;
}


int Shell::builtin_help(const std::vector<std::string>& args) {
    bool chinese = false;
    for (size_t i = 1; i < args.size(); i++) {
        if (args[i] == "--Chinese" || args[i] == "--chinese" || args[i] == "-c") {
            chinese = true;
        }
    }

    if (chinese) {
        std::cout << "amsys shell - 内建命令:" << std::endl;
        std::cout << "  cd <dir>     - 切换目录（Unix 路径）" << std::endl;
        std::cout << "  pwd          - 显示当前路径" << std::endl;
        std::cout << "  ls [-l] [-a] [-s] - 列出目录内容" << std::endl;
        std::cout << "    -l         详细格式" << std::endl;
        std::cout << "    -a|--all   显示隐藏文件" << std::endl;
        std::cout << "    -s|--short 一行一个（管道时自动）" << std::endl;
        std::cout << "  cat <file>   - 查看文件内容" << std::endl;
        std::cout << "  grep [-i] <pattern> [file...] - 搜索文本" << std::endl;
        std::cout << "  echo [...]   - 输出文本" << std::endl;
        std::cout << "  mount [dev] [path] - 显示/挂载" << std::endl;
        std::cout << "  umount <path> - 卸载" << std::endl;
        std::cout << "  newfl [-j] <path> <target> - 创建.floder/链接" << std::endl;
        std::cout << "  mkdir <dir>   - 创建目录" << std::endl;
        std::cout << "  rm [-r] <path> - 删除" << std::endl;
        std::cout << "  cp [-r] <src> <dst> - 复制" << std::endl;
        std::cout << "  mv <src> <dst> - 移动" << std::endl;
        std::cout << "  export [VAR=value] - 设置变量" << std::endl;
        std::cout << "  unset <VAR> - 删除变量" << std::endl;
        std::cout << "  env       - 显示变量" << std::endl;
        std::cout << "  passwd [user] - 设置密码 (/etc/shadow)" << std::endl;
        std::cout << "  adduser <name> - 创建用户 (root/sudo)" << std::endl;
        std::cout << "  usermod <name> sudo|user - 设置权限 (root/sudo)" << std::endl;
        std::cout << "  tools        - 列出工具" << std::endl;
        std::cout << "  sudo <opts> [cmd] - 提权" << std::endl;
        std::cout << "  help[-h]     - 显示帮助（英文）" << std::endl;
        std::cout << "  help -c|--chinese --Chinese - 中文帮助" << std::endl;
        std::cout << "  exit         - 退出 Shell" << std::endl;
        std::cout << std::endl;
        std::cout << "操作符:  |  <  >  >>  2>  2>>" << std::endl;
        std::cout << "  cmd1 | cmd2    - 管道：将 cmd1 输出传给 cmd2 输入" << std::endl;
        std::cout << "  cmd < file     - 从文件读取输入" << std::endl;
        std::cout << "  cmd > file     - 输出写入文件（覆盖）" << std::endl;
        std::cout << "  cmd >> file    - 输出追加到文件末尾" << std::endl;
        std::cout << "  cmd 2> file    - 错误输出写入文件" << std::endl;
        std::cout << "  cmd 2>> file   - 错误输出追加到文件" << std::endl;
        std::cout << std::endl;
        std::cout << "Windows 程序用 wine 运行。" << std::endl;
        std::cout << "参数中的 Unix 路径会自动翻译为 Windows 路径。" << std::endl;
    } else {
        std::cout << "amsys shell - built-in commands:" << std::endl;
        std::cout << "  cd <dir>     - Change directory (Unix paths)" << std::endl;
        std::cout << "  pwd          - Print working directory" << std::endl;
        std::cout << "  ls [-l] [-a] [-s] - List directory contents" << std::endl;
        std::cout << "    -l         Long format" << std::endl;
        std::cout << "    -a|--all   Show hidden files" << std::endl;
        std::cout << "    -s|--short One per line (auto when piped)" << std::endl;
        std::cout << "  cat <file>   - Display file contents" << std::endl;
        std::cout << "  grep [-i] <pattern> [file...] - Search text" << std::endl;
        std::cout << "  echo [...]   - Print text" << std::endl;
        std::cout << "  mount [dev] [path] - Show / mount devices" << std::endl;
        std::cout << "  umount <path> - Unmount" << std::endl;
        std::cout << "  newfl [-j] <path> <target> - Create .floder/junction" << std::endl;
        std::cout << "  mkdir <dir>   - Create directory" << std::endl;
        std::cout << "  rm [-r] <path> - Remove" << std::endl;
        std::cout << "  cp [-r] <src> <dst> - Copy" << std::endl;
        std::cout << "  mv <src> <dst> - Move" << std::endl;
        std::cout << "  export [VAR=value] - Set env var" << std::endl;
        std::cout << "  unset <VAR> - Unset env var" << std::endl;
        std::cout << "  env       - Show env vars" << std::endl;
        std::cout << "  passwd [user] - Set password (/etc/shadow)" << std::endl;
        std::cout << "  adduser <name> - Create user (root/sudo)" << std::endl;
        std::cout << "  usermod <name> sudo|user - Set permission (root/sudo)" << std::endl;
        std::cout << "  tools        - List tool aliases" << std::endl;
        std::cout << "  sudo <opts> [cmd] - Elevate" << std::endl;
        std::cout << "  help[-h]     - Show this help" << std::endl;
        std::cout << "  help -c|--chinese --Chinese help" << std::endl;
        std::cout << "  exit         - Exit the shell" << std::endl;
        std::cout << std::endl;
        std::cout << "Operators:  |  <  >  >>" << std::endl;
        std::cout << "  cmd1 | cmd2    - Pipe output of cmd1 to cmd2" << std::endl;
        std::cout << "  cmd < file     - Read stdin from file" << std::endl;
        std::cout << "  cmd > file     - Write stdout to file (overwrite)" << std::endl;
        std::cout << "  cmd >> file    - Append stdout to file" << std::endl;
        std::cout << "  cmd 2> file    - Write stderr to file" << std::endl;
        std::cout << "  cmd 2>> file   - Append stderr to file" << std::endl;
        std::cout << std::endl;
        std::cout << "Use wine for Windows programs." << std::endl;
        std::cout << "Paths in arguments are automatically translated to Windows." << std::endl;
    }
    return 0;
}int Shell::builtin_exit(const std::vector<std::string>& /*args*/) {
    running_ = false;
    return 0;
}

int Shell::builtin_sudo(const std::vector<std::string>& args) {
    bool new_window = false;
    bool interactive = false;
    std::vector<std::string> cmd_args;

    for (size_t i = 1; i < args.size(); i++) {
        if (args[i] == "-n") new_window = true;
        else if (args[i] == "-i") interactive = true;
        else if (args[i] == "-h" || args[i] == "--help") {
            std::cout << "sudo - run commands with administrator privileges" << std::endl;
            std::cout << std::endl;
            std::cout << "Usage:" << std::endl;
            std::cout << "  sudo              Show this help" << std::endl;
            std::cout << "  sudo -h           Show this help" << std::endl;
            std::cout << "  sudo -i           Elevated shell (current window)" << std::endl;
            std::cout << "  sudo -n           New elevated amsys window" << std::endl;
            std::cout << "  sudo <command>    Run builtin command as admin" << std::endl;
            std::cout << "  sudo -n <command> Run command in new elevated window" << std::endl;
            std::cout << "  sudo wine <prog>  Run Windows program as admin" << std::endl;
            return 0;
        } else {
            cmd_args.push_back(args[i]);
        }
    }

    if (args.size() == 1) {
        std::cout << "sudo - run commands with administrator privileges" << std::endl;
        std::cout << "Permission: " << permission_ << " (user: " << username_ << ")" << std::endl;
        std::cout << "Usage: sudo -h" << std::endl;
        return 1;
    }

    // Permission check: user-level accounts cannot use sudo
    if (permission_ == "user") {
        std::cerr << "sudo: permission denied (user '" << username_
                  << "' has no sudo rights)" << std::endl;
        std::cerr << "  Ask an administrator to set 'permission: sudo' in "
                  << "~/.config/amsys/user.yaml" << std::endl;
        return 1;
    }

    char exe_path[MAX_PATH];
    GetModuleFileNameA(nullptr, exe_path, MAX_PATH);
    std::string exe_str(exe_path);

    // Build command string from remaining args
    std::string cmd_str;
    for (size_t i = 0; i < cmd_args.size(); i++) {
        if (i > 0) cmd_str += " ";
        std::string a = cmd_args[i];
        if (a.find(' ') != std::string::npos || a.find('"') != std::string::npos) {
            cmd_str += "\"" + a + "\"";
        } else {
            cmd_str += a;
        }
    }

    // ── sudo -i: named-pipe IPC elevated shell ──
    if (interactive) {
        DWORD pid = GetCurrentProcessId();
        std::string pipe_base = std::string("\\\\.\\pipe\\amsys_sudo_") + std::to_string(pid);

        HANDLE hStdinPipe = CreateNamedPipeA(
            (pipe_base + "_stdin").c_str(), PIPE_ACCESS_OUTBOUND,
            PIPE_TYPE_BYTE | PIPE_WAIT, 1, 4096, 4096, 0, nullptr);
        HANDLE hStdoutPipe = CreateNamedPipeA(
            (pipe_base + "_stdout").c_str(), PIPE_ACCESS_INBOUND,
            PIPE_TYPE_BYTE | PIPE_WAIT, 1, 4096, 4096, 0, nullptr);

        if (hStdinPipe == INVALID_HANDLE_VALUE || hStdoutPipe == INVALID_HANDLE_VALUE) {
            if (hStdinPipe != INVALID_HANDLE_VALUE) CloseHandle(hStdinPipe);
            std::cerr << "sudo: failed to create pipes" << std::endl;
            return 1;
        }

        std::string sudo_args = std::string("--sudo --pipe=") + pipe_base
            + " --cwd=\"" + utf8_to_acp(path_mgr_.get_cwd()) + "\"";
        std::wstring wargs = utf8_to_wide(sudo_args);
        std::wstring wexe = utf8_to_wide(exe_str);

        SHELLEXECUTEINFOW sei;
        ZeroMemory(&sei, sizeof(sei));
        sei.cbSize = sizeof(sei);
        sei.fMask = SEE_MASK_NOCLOSEPROCESS;
        sei.lpVerb = L"runas";
        sei.lpFile = wexe.c_str();
        sei.lpParameters = wargs.c_str();
        sei.nShow = SW_HIDE;

        BOOL ok = ShellExecuteExW(&sei);
        if (!ok || !sei.hProcess) {
            CloseHandle(hStdinPipe);
            CloseHandle(hStdoutPipe);
            std::cerr << "sudo: elevation failed or denied" << std::endl;
            return 1;
        }

        ConnectNamedPipe(hStdinPipe, nullptr);
        ConnectNamedPipe(hStdoutPipe, nullptr);

        char out_buf[8192];
        bool child_alive = true;
        HANDLE hParentStdin = GetStdHandle(STD_INPUT_HANDLE);

        while (child_alive) {
            DWORD bread = 0;
            // Read child stdout
            if (PeekNamedPipe(hStdoutPipe, nullptr, 0, nullptr, &bread, nullptr) && bread > 0) {
                if (ReadFile(hStdoutPipe, out_buf, sizeof(out_buf) - 1, &bread, nullptr) && bread > 0) {
                    out_buf[bread] = '\0';
                    std::cout.write(out_buf, bread);
                    std::cout.flush();
                }
            }
            // Check if child exited
            if (WaitForSingleObject(sei.hProcess, 50) == WAIT_OBJECT_0) {
                while (PeekNamedPipe(hStdoutPipe, nullptr, 0, nullptr, &bread, nullptr) && bread > 0) {
                    if (ReadFile(hStdoutPipe, out_buf, sizeof(out_buf) - 1, &bread, nullptr) && bread > 0) {
                        out_buf[bread] = '\0';
                        std::cout.write(out_buf, bread);
                    }
                }
                child_alive = false;
                break;
            }
            // Read parent stdin: handle both pipe and console
            DWORD stdin_avail = 0;
            bool has_input = false;
            if (PeekNamedPipe(hParentStdin, nullptr, 0, nullptr, &stdin_avail, nullptr)) {
                has_input = (stdin_avail > 0);
            } else {
                // Console input: use kbhit
                has_input = (_kbhit() != 0);
            }
            if (has_input) {
                std::string line;
                std::getline(std::cin, line);
                line += "\n";
                DWORD written;
                WriteFile(hStdinPipe, line.c_str(), (DWORD)line.size(), &written, nullptr);
            }
        }

        DWORD exit_code = 0;
        GetExitCodeProcess(sei.hProcess, &exit_code);
        CloseHandle(hStdinPipe);
        CloseHandle(hStdoutPipe);
        CloseHandle(sei.hProcess);
        return static_cast<int>(exit_code);
    }

    // ── sudo -n: new elevated amsys window ──
    if (new_window) {
        std::string args_line;
        if (cmd_str.empty()) {
            args_line = "--sudo";  // interactive elevated amsys
        } else {
            args_line = "--sudo --exec=\"" + cmd_str + "\" --cwd=\"" + utf8_to_acp(path_mgr_.get_cwd()) + "\"";
        }
        std::string acp = utf8_to_acp(args_line);
        ShellExecuteA(nullptr, "runas", exe_path, acp.c_str(), nullptr, SW_SHOWNORMAL);
        return 0;
    }

    // ── sudo <command>: temp file capture via elevated amsys --exec ──
    if (cmd_str.empty()) {
        std::cerr << "sudo: missing operand" << std::endl;
        std::cerr << "Try 'sudo -h' for help." << std::endl;
        return 1;
    }

    char tmp_dir[MAX_PATH];
    char tmp_file[MAX_PATH];
    GetTempPathA(MAX_PATH, tmp_dir);
    GetTempFileNameA(tmp_dir, "ams", 0, tmp_file);

    std::string args_line = "--sudo --exec=\"" + cmd_str + "\" --cwd=\"" + utf8_to_acp(path_mgr_.get_cwd()) + "\" --tmpfile=\"" + tmp_file + "\"";
    std::string acp = utf8_to_acp(args_line);

    SHELLEXECUTEINFOW sei;
    ZeroMemory(&sei, sizeof(sei));
    sei.cbSize = sizeof(sei);
    sei.fMask = SEE_MASK_NOCLOSEPROCESS;
    sei.lpVerb = L"runas";
    std::wstring wexe = utf8_to_wide(exe_str);
    std::wstring wargs = utf8_to_wide(args_line);
    sei.lpFile = wexe.c_str();
    sei.lpParameters = wargs.c_str();
    sei.nShow = SW_HIDE;

    BOOL ok = ShellExecuteExW(&sei);
    if (!ok || !sei.hProcess) {
        std::cerr << "sudo: elevation failed or denied" << std::endl;
        return 1;
    }

    WaitForSingleObject(sei.hProcess, INFINITE);
    DWORD exit_code = 0;
    GetExitCodeProcess(sei.hProcess, &exit_code);
    CloseHandle(sei.hProcess);

    std::ifstream tmpfs(tmp_file, std::ios::binary);
    if (tmpfs.is_open()) {
        std::string acp_content((std::istreambuf_iterator<char>(tmpfs)),
                                 std::istreambuf_iterator<char>());
        tmpfs.close();
        // Temp file is in system ACP encoding; convert to UTF-8 for display
        std::cout << acp_to_utf8(acp_content);
        std::cout.flush();
    }
    DeleteFileA(tmp_file);
    return static_cast<int>(exit_code);
}
int Shell::builtin_wine(const std::vector<std::string>& args) {
    if (args.size() < 2) {
        std::cerr << "wine: missing program name" << std::endl;
        std::cerr << "Usage: wine <program> [args...]" << std::endl;
        return 1;
    }

    std::string program = args[1];
    std::string cmd_line_acp = utf8_to_acp(program);
    for (size_t i = 2; i < args.size(); i++) {
        cmd_line_acp += " " + utf8_to_acp(args[i]);
    }

    // Whitelist: programs that run inline (current terminal, no new window)
    // cmd with args runs inline; cmd alone opens a new window
    bool run_inline = false;
    std::string prog_lower;
    for (char c : program) prog_lower += (char)std::tolower((unsigned char)c);
    if (args.size() > 2) {
        if (prog_lower == "cmd" || prog_lower == "cmd.exe") run_inline = true;
        else if (prog_lower == "powershell") run_inline = true;
        else if (prog_lower == "pwsh") run_inline = true;
        else if (prog_lower == "wsl") run_inline = true;
        else if (prog_lower == "git") run_inline = true;
        else if (prog_lower == "python" || prog_lower == "python3") run_inline = true;
        else if (prog_lower == "node") run_inline = true;
    }

    if (run_inline) {
        // Run inline in the current terminal via CreateProcess with inherited console
        char* cmd_line_buf = new char[cmd_line_acp.size() + 1];
        strcpy_s(cmd_line_buf, cmd_line_acp.size() + 1, cmd_line_acp.c_str());

        STARTUPINFOA si;
        ZeroMemory(&si, sizeof(si));
        si.cb = sizeof(si);
        PROCESS_INFORMATION pi;
        ZeroMemory(&pi, sizeof(pi));

        BOOL ok = CreateProcessA(nullptr, cmd_line_buf, nullptr, nullptr,
                                 FALSE, 0, nullptr, nullptr, &si, &pi);
        delete[] cmd_line_buf;

        if (!ok) {
            DWORD err = GetLastError();
            std::cerr << "wine: failed to execute '" << program << "': error " << err << std::endl;
            return 1;
        }

        WaitForSingleObject(pi.hProcess, INFINITE);
        DWORD exit_code = 0;
        GetExitCodeProcess(pi.hProcess, &exit_code);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        return static_cast<int>(exit_code);
    }

        // Open in a new window via ShellExecute (like start)
    std::string program_acp = utf8_to_acp(program);
    HINSTANCE hResult = ShellExecuteA(
        nullptr, "open",
        program_acp.c_str(),
        cmd_line_acp.c_str() + program_acp.size(),
        nullptr, SW_SHOWNORMAL);if ((INT_PTR)hResult <= 32) {
        DWORD err = GetLastError();
        std::cerr << "wine: failed to launch '" << program << "' (error " << err << ")" << std::endl;
        return 1;
    }
    return 0;
}

int Shell::run_external(const std::vector<std::string>& args,
                        HANDLE inherit_stdin,
                        HANDLE inherit_stdout)
{
    RedirectedCommand rc;
    rc.args = args;
    return execute_redirected(rc, "", nullptr, inherit_stdin, inherit_stdout);
}






const char* Shell::file_color(const std::string& name, bool is_dir, DWORD attrs) {
    (void)attrs;
    if (is_dir) return "\033[1;34m";  // bold blue

    std::string ext;
    auto dot = name.rfind('.');
    if (dot != std::string::npos) {
        for (char c : name.substr(dot)) ext += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    }

    // Executables: bold green
    if (ext == ".exe" || ext == ".com" || ext == ".bat" || ext == ".cmd" || ext == ".msi") {
        return "\033[1;32m";
    }
    // Archives: bold red
    if (ext == ".zip" || ext == ".rar" || ext == ".7z" || ext == ".tar" ||
        ext == ".gz" || ext == ".xz" || ext == ".bz2" || ext == ".iso") {
        return "\033[1;31m";
    }
    // Images: bold magenta
    if (ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".gif" ||
        ext == ".bmp" || ext == ".ico" || ext == ".svg" || ext == ".webp") {
        return "\033[1;35m";
    }
    // Audio: bold yellow
    if (ext == ".mp3" || ext == ".wav" || ext == ".flac" || ext == ".ogg" || ext == ".aac") {
        return "\033[1;33m";
    }
    // Video: bold cyan
    if (ext == ".mp4" || ext == ".avi" || ext == ".mkv" || ext == ".mov" || ext == ".wmv") {
        return "\033[1;36m";
    }
    return nullptr;  // default color
}
} // namespace amsys
