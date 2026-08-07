#ifndef SHELL_H
#define SHELL_H

#include "path_manager.h"
#include "config.h"
#include <string>
#include <vector>
#include <sstream>
#include <windows.h>

namespace amsys {

struct RedirectedCommand {
    std::vector<std::string> args;
    std::string stdin_file;
    std::string stdout_file;
    bool stdout_append = false;
    std::string stderr_file;
    bool stderr_append = false;
};

struct Pipeline {
    std::vector<RedirectedCommand> commands;
};

// Per-tool path hijacking flags
struct HijackFlags {
    bool env = true;   // inject $HOME/$PWD/$USER into tool env
    bool cwd = true;   // set tool working directory to current Unix cwd
    bool args = true;  // convert Unix path args to Windows
    bool enabled() const { return env || cwd || args; }
};

class Shell {
public:
    explicit Shell(const Config& cfg, bool elevated = false, const std::string& username = "root");
    void run();
    int execute(const std::string& line);

    static std::streambuf* default_cout_buf;

    // Set working directory (used by sudo --exec mode)
    bool set_cwd(const std::string& path) { return path_mgr_.set_cwd(path); }

private:
    Config config_;
    PathManager path_mgr_;
    bool running_;
    bool elevated_;
    std::string username_;

    // Tools from config.ini [tools] section: alias -> exe path
    std::unordered_map<std::string, std::string> tools_;

    // Environment variables (export VAR=value / $VAR)
    std::unordered_map<std::string, std::string> env_vars_;

    // Commands (no warning, no terminal requirement, from [commands])
    std::unordered_set<std::string> commands_;

    // Per-tool hijack flags from [hijack] (default: all on)
    std::unordered_map<std::string, HijackFlags> hijack_;

    // Home directory (Unix + Windows form) for tool env injection
    std::string home_unix_;
    std::string home_win_;

    // Permission level from ~/.config/amsys/user.yaml: user / sudo / root
    std::string permission_ = "user";

    void ensure_passwd();

    std::string get_prompt() const;
    std::string expand_vars(const std::string& s) const;
    std::string expand_tilde(const std::string& s) const;
    std::vector<std::string> expand_glob(const std::string& pattern) const;
    std::vector<std::string> parse_line(const std::string& line) const;
    Pipeline parse_pipeline(const std::string& line) const;
    int execute_pipeline(const Pipeline& pipe);
    int execute_redirected(
        const RedirectedCommand& cmd,
        const std::string& pipe_stdin,
        std::string* pipe_stdout_out,
        HANDLE inherit_stdin_handle,
        HANDLE inherit_stdout_handle);
    int execute_command(const std::vector<std::string>& args);

    // === Built-in commands ===
    int builtin_cd(const std::vector<std::string>& args);
    int builtin_pwd(const std::vector<std::string>& args);
    int builtin_ls(const std::vector<std::string>& args);
    int builtin_cat(const std::vector<std::string>& args);
    int builtin_echo(const std::vector<std::string>& args);
    int builtin_grep(const std::vector<std::string>& args);
    int builtin_help(const std::vector<std::string>& args);
    int builtin_exit(const std::vector<std::string>& args);
    int builtin_wine(const std::vector<std::string>& args);
    int builtin_mount(const std::vector<std::string>& args);
    int builtin_umount(const std::vector<std::string>& args);
    int builtin_newfl(const std::vector<std::string>& args);
    int builtin_mkdir(const std::vector<std::string>& args);
    int builtin_rm(const std::vector<std::string>& args);
    int builtin_cp(const std::vector<std::string>& args);
    int builtin_mv(const std::vector<std::string>& args);
    int builtin_sudo(const std::vector<std::string>& args);
    int builtin_tools(const std::vector<std::string>& args);
    int builtin_export(const std::vector<std::string>& args);
    int builtin_unset(const std::vector<std::string>& args);
    int builtin_env(const std::vector<std::string>& args);
    int builtin_passwd(const std::vector<std::string>& args);
    int builtin_adduser(const std::vector<std::string>& args);
    int builtin_usermod(const std::vector<std::string>& args);

    // User management helpers
    bool user_exists(const std::string& name) const;
    void create_user_home(const std::string& name);
    bool set_user_permission(const std::string& name, const std::string& perm);

    // Resolve tool alias path (relative to exe dir / %PATH%)
    std::string resolve_tool_path(const std::string& raw) const;

    int run_external(const std::vector<std::string>& args,
                     HANDLE inherit_stdin = nullptr,
                     HANDLE inherit_stdout = nullptr);

    static const char* file_color(const std::string& name, bool is_dir, DWORD attrs);
};

} // namespace amsys

#endif // SHELL_H
