#ifndef PATH_MANAGER_H
#define PATH_MANAGER_H

#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include "config.h"

namespace amsys {

// Partition mapping info for drive letter detection
struct PartMapping {
    int disk;
    long long offset;
    std::string dev;
};

class PathManager {
public:
    explicit PathManager(const Config& cfg);

    // ── Path conversion ──────────────────────────────
    std::string to_windows(const std::string& unix_path, bool* is_under_mnt = nullptr) const;
    std::string to_unix(const std::string& windows_path) const;

    // ── cwd ──────────────────────────────────────────
    std::string get_cwd() const { return cwd_; }
    bool set_cwd(const std::string& unix_path);

    // ── Info ─────────────────────────────────────────
    std::string get_root() const { return root_; }
    void list_mounts() const;
    bool is_valid_path(const std::string& unix_path) const;
    std::string resolve(const std::string& unix_path) const;

    // ── Virtual directories (mount prefixes, well-known names) ──
    bool is_virtual_dir(const std::string& unix_path) const;
    std::vector<std::string> list_virtual_children(const std::string& unix_path) const;

    // ── Special device path checking ─────────────────
    bool is_special_device(const std::string& unix_path) const;
    bool is_disk_device(const std::string& unix_path) const;

    // Runtime mount management
    void add_mount(const std::string& unix_path, const std::string& win_path);
    void remove_mount(const std::string& unix_path);
    std::string get_mount(const std::string& unix_path) const;

    // Returns true if a /dev entry has no drive letter (hidden without -a)
    bool is_dev_hidden(const std::string& unix_path) const;

private:
    std::string root_;
    std::string cwd_;
    bool block_dotdot_;

    // Mounted directories: unix_path -> Windows path
    std::unordered_map<std::string, std::string> mounts_;

    // Well-known virtual directories that always exist (no mount children needed)
    std::unordered_set<std::string> well_known_virtual_dirs_;

    // /dev entries that have no drive letter (hidden without -a)
    std::unordered_set<std::string> hidden_devices_;

    // ── Initialization helpers ───────────────────────

    // ── Initialization helpers ───────────────────────
    void build_mounts(const Config& cfg);
    void discover_devices();       // Populate /dev/sda, /dev/null, etc.
    void detect_mounted_devices(const std::vector<PartMapping>& parts);
    void load_fstab();             // Create / read /etc/fstab
    void discover_windows_drives(); // (kept for backward compat in fstab creation)

    // ── Helpers ──────────────────────────────────────
    std::string find_windows_for_unix_component(const std::string& component,
                                                 const std::string& default_root) const;
    std::string normalize_unix(const std::string& path) const;
    bool would_escape_root(const std::string& path) const;
};

} // namespace amsys

#endif // PATH_MANAGER_H
