#include "path_manager.h"
#include "utils.h"
#include "floder_reader.h"
#include <iostream>
#include <filesystem>
#include <algorithm>
#include <sstream>
#include <fstream>
#include <windows.h>
#include <winioctl.h>
#include <wbemidl.h>

namespace amsys {

// ─── Constructor ──────────────────────────────────────

PathManager::PathManager(const Config& cfg) {
    root_ = cfg.get("system", "root", "C:\\amsys_root");
    root_ = to_windows_sep(root_);
    while (!root_.empty() && root_.back() == '\\') root_.pop_back();

    // Warn if root directory doesn't exist
    {
        std::wstring wroot = utf8_to_wide(acp_to_utf8(root_));
        DWORD attr = GetFileAttributesW(wroot.c_str());
        if (attr == INVALID_FILE_ATTRIBUTES || !(attr & FILE_ATTRIBUTE_DIRECTORY)) {
            std::cerr << "unable to mount / (" << root_ << "): directory not found" << std::endl;
            std::cerr << "  Check root path in config.ini" << std::endl;
        }
    }

    block_dotdot_ = (cfg.get("system", "block_dotdot", "true") == "true");

    // Well-known virtual directories
    well_known_virtual_dirs_ = {"/dev", "/media"};

    // 1. Standard directories from config.ini
    build_mounts(cfg);

    // Create /mnt as a real directory on disk (not virtual)
    {
        std::string mnt_path = root_ + "\\mnt";
        std::wstring wmnt = utf8_to_wide(acp_to_utf8(mnt_path));
        if (!wmnt.empty()) {
            CreateDirectoryW(wmnt.c_str(), nullptr);
            DWORD attr = GetFileAttributesW(wmnt.c_str());
            if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY)) {
                mounts_["/mnt"] = mnt_path;
            }
        }
    }

    // 2. /dev devices (disks, null, zero)
    try { discover_devices(); }
    catch (...) { std::cerr << "warn: discover_devices failed" << std::endl; }

    // 3. /etc/fstab — mount points including /mnt drives
    load_fstab();

    // 4. Register root in mount table for loop normalization
    mounts_["/"] = root_;

    cwd_ = "/";
}

// ─── build_mounts — standard dirs from config.ini ─────

void PathManager::build_mounts(const Config& cfg) {
    bool floder_enabled = (cfg.get("floder", "enabled", "true") == "true");
    std::vector<std::string> dirs = {"home", "root", "usr", "tmp", "var", "etc", "opt", "bin", "lib"};

    for (const auto& dir : dirs) {
        std::string val = cfg.get("mounts", dir, "");
        if (val.empty()) {
            val = root_ + "\\" + dir;
        } else {
            val = to_windows_sep(val);
            while (!val.empty() && val.back() == '\\') val.pop_back();
        }

        if (floder_enabled) {
            std::string floder_path = read_floder(val);
            if (!floder_path.empty()) {
                val = to_windows_sep(floder_path);
                while (!val.empty() && val.back() == '\\') val.pop_back();
            }
        }

        std::wstring wpath = utf8_to_wide(acp_to_utf8(val));
        if (!wpath.empty()) {
            std::wstring acc;
            for (size_t i = 0; i < wpath.size(); i++) {
                acc += wpath[i];
                if (wpath[i] == L'\\' || i == wpath.size() - 1) {
                    if (!acc.empty() && acc != L"\\") {
                        CreateDirectoryW(acc.c_str(), nullptr);
                    }
                }
            }
        }

        // Check if the directory exists now, warn if not
        {
            std::wstring wcheck = utf8_to_wide(acp_to_utf8(val));
            DWORD attr = GetFileAttributesW(wcheck.c_str());
            if (attr == INVALID_FILE_ATTRIBUTES || !(attr & FILE_ATTRIBUTE_DIRECTORY)) {
                std::cerr << "unable to mount /" << dir << " (" << val << ")" << std::endl;
            }
        }

        mounts_["/" + dir] = val;
    }
}

// ─── discover_devices — /dev/* ────────────────────────

void PathManager::discover_devices() {
    // /dev/null — special marker
    mounts_["/dev/null"] = "";

    // /dev/zero — special marker
    mounts_["/dev/zero"] = "";

    // Enumerate physical disk drives and their partitions
    std::vector<PartMapping> part_mappings;

    for (int i = 0; i < 32; i++) {
        std::string path = "\\\\.\\PhysicalDrive" + std::to_string(i);
        HANDLE h = CreateFileA(path.c_str(), 0,
                               FILE_SHARE_READ | FILE_SHARE_WRITE,
                               nullptr, OPEN_EXISTING, 0, nullptr);
        if (h == INVALID_HANDLE_VALUE) break;
        CloseHandle(h);

        char disk_letter = static_cast<char>('a' + i);
        std::string dev_name = "/dev/sd" + std::string(1, disk_letter);
        mounts_[dev_name] = path;

        // Query partition layout (requires admin)
        HANDLE hAdmin = CreateFileA(path.c_str(), GENERIC_READ,
                                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                                    nullptr, OPEN_EXISTING, 0, nullptr);
        if (hAdmin != INVALID_HANDLE_VALUE) {
            char buf[sizeof(DRIVE_LAYOUT_INFORMATION_EX) + 128 * sizeof(PARTITION_INFORMATION_EX)];
            DWORD bytes_returned = 0;
            BOOL ok = DeviceIoControl(hAdmin, IOCTL_DISK_GET_DRIVE_LAYOUT_EX,
                                       nullptr, 0, buf, sizeof(buf),
                                       &bytes_returned, nullptr);
            if (ok && bytes_returned >= sizeof(DRIVE_LAYOUT_INFORMATION_EX)) {
                DRIVE_LAYOUT_INFORMATION_EX* layout = (DRIVE_LAYOUT_INFORMATION_EX*)buf;
                for (DWORD p = 0; p < layout->PartitionCount; p++) {
                    PARTITION_INFORMATION_EX* part = &layout->PartitionEntry[p];
                    if (part->PartitionNumber > 0) {
                        std::string part_name = dev_name + std::to_string(part->PartitionNumber);
                        mounts_[part_name] = path;
                        part_mappings.push_back({i, part->StartingOffset.QuadPart, part_name});
                    }
                }
            }
            CloseHandle(hAdmin);
        }
    }

    // If no partitions were found via IOCTL (non-admin), try WMI
    if (part_mappings.empty()) {
        HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        if (SUCCEEDED(hr)) {
            hr = CoInitializeSecurity(nullptr, -1, nullptr, nullptr,
                                      RPC_C_AUTHN_LEVEL_DEFAULT,
                                      RPC_C_IMP_LEVEL_IMPERSONATE,
                                      nullptr, EOAC_NONE, nullptr);
            if (hr == RPC_E_TOO_LATE) hr = S_OK;
            if (SUCCEEDED(hr)) {
                IWbemLocator* pLoc = nullptr;
                hr = CoCreateInstance(CLSID_WbemLocator, nullptr,
                                      CLSCTX_INPROC_SERVER, IID_IWbemLocator,
                                      (void**)&pLoc);
                if (SUCCEEDED(hr) && pLoc) {
                    IWbemServices* pSvc = nullptr;
                    hr = pLoc->ConnectServer(L"root\\cimv2", nullptr, nullptr,
                                             nullptr, 0, nullptr, nullptr, &pSvc);
                    if (SUCCEEDED(hr) && pSvc) {
                        IEnumWbemClassObject* pEnum = nullptr;
                        hr = pSvc->ExecQuery(L"WQL", L"SELECT * FROM Win32_DiskPartition",
                                             WBEM_FLAG_FORWARD_ONLY, nullptr, &pEnum);
                        if (SUCCEEDED(hr) && pEnum) {
                            while (true) {
                                IWbemClassObject* pObj = nullptr;
                                ULONG ret = 0;
                                if (pEnum->Next(WBEM_INFINITE, 1, &pObj, &ret) != S_OK || ret == 0)
                                    break;
                                VARIANT vtDev, vtDisk, vtIdx;
                                VariantInit(&vtDev); VariantInit(&vtDisk); VariantInit(&vtIdx);
                                pObj->Get(L"DeviceID", 0, &vtDev, nullptr, nullptr);
                                pObj->Get(L"DiskIndex", 0, &vtDisk, nullptr, nullptr);
                                pObj->Get(L"Index", 0, &vtIdx, nullptr, nullptr);
                                if (vtDev.vt == VT_BSTR && vtDisk.vt == VT_I4 && vtIdx.vt == VT_I4) {
                                    int disk_num = vtDisk.lVal;
                                    int part_num = vtIdx.lVal;
                                    std::string dev_name = "/dev/sd" +
                                        std::string(1, 'a' + disk_num) +
                                        std::to_string(part_num + 1);
                                    std::string phys_path = "\\\\.\\PhysicalDrive" +
                                        std::to_string(disk_num);
                                    mounts_[dev_name] = phys_path;
                                    part_mappings.push_back({disk_num, 0, dev_name});
                                }
                                VariantClear(&vtDev); VariantClear(&vtDisk); VariantClear(&vtIdx);
                                pObj->Release();
                            }
                            pEnum->Release();
                        }
                        pSvc->Release();
                    }
                    pLoc->Release();
                }
            }
            CoUninitialize();
        }
    }

    // Detect which partitions have drive letters
    detect_mounted_devices(part_mappings);
}

void PathManager::detect_mounted_devices(const std::vector<PartMapping>& parts) {
    hidden_devices_.clear();
    if (parts.empty()) return;

    // Assume all partitions are hidden initially
    for (const auto& p : parts) {
        hidden_devices_.insert(p.dev);
    }

    bool any_matched = false;

    // ── Method 1: WMI/CIM query (works for ALL users, no admin required) ──
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (SUCCEEDED(hr)) {
        // Initialize COM security
        hr = CoInitializeSecurity(nullptr, -1, nullptr, nullptr,
                                  RPC_C_AUTHN_LEVEL_DEFAULT,
                                  RPC_C_IMP_LEVEL_IMPERSONATE,
                                  nullptr, EOAC_NONE, nullptr);
        if (hr == RPC_E_TOO_LATE) hr = S_OK; // already initialized

        if (SUCCEEDED(hr)) {
            IWbemLocator* pLoc = nullptr;
            hr = CoCreateInstance(CLSID_WbemLocator, nullptr,
                                  CLSCTX_INPROC_SERVER, IID_IWbemLocator,
                                  (void**)&pLoc);
            if (SUCCEEDED(hr) && pLoc) {
                IWbemServices* pSvc = nullptr;
                hr = pLoc->ConnectServer(L"root\\cimv2", nullptr, nullptr,
                                         nullptr, 0, nullptr, nullptr, &pSvc);
                if (SUCCEEDED(hr) && pSvc) {
                    // For each drive letter, get partition info
                    DWORD drives = GetLogicalDrives();
                    for (int i = 0; i < 26; i++) {
                        if (!(drives & (1 << i))) continue;
                        char letter = 'A' + i;

                        // Query: SELECT * FROM Win32_LogicalDisk WHERE DeviceID='X:'
                        wchar_t wql[256];
                        swprintf(wql, 256,
                            L"ASSOCIATORS OF {Win32_LogicalDisk.DeviceID='%c:'} "
                            L"WHERE AssocClass=Win32_LogicalDiskToPartition",
                            letter);

                        IEnumWbemClassObject* pEnum = nullptr;
                        hr = pSvc->ExecQuery(L"WQL", wql,
                                             WBEM_FLAG_FORWARD_ONLY,
                                             nullptr, &pEnum);
                        if (SUCCEEDED(hr) && pEnum) {
                            IWbemClassObject* pObj = nullptr;
                            ULONG ret = 0;
                            while (pEnum->Next(WBEM_INFINITE, 1, &pObj, &ret) == S_OK && ret > 0) {
                                // Get the DeviceID property: "Disk #X, Partition #Y"
                                VARIANT vtProp;
                                VariantInit(&vtProp);
                                hr = pObj->Get(L"DeviceID", 0, &vtProp, nullptr, nullptr);
                                if (SUCCEEDED(hr) && vtProp.vt == VT_BSTR) {
                                    std::wstring dev_id = vtProp.bstrVal;
                                    // Parse "Disk #0, Partition #1" format
                                    int disk_num = -1, part_num = -1;
                                    if (swscanf(dev_id.c_str(), L"Disk #%d, Partition #%d",
                                                &disk_num, &part_num) >= 2) {
                                        // Map to /dev/sdX and partition Y+1
                                        char sd_letter = 'a' + disk_num;
                                        std::string dev_name = std::string("/dev/sd") + sd_letter
                                                              + std::to_string(part_num + 1);
                                        for (const auto& p : parts) {
                                            if (p.dev == dev_name) {
                                                hidden_devices_.erase(p.dev);
                                                // Update mount to volume path
                                                                                                std::string vol_path;
                                                vol_path += '\\';
                                                vol_path += '\\';
                                                vol_path += '.';
                                                vol_path += '\\';
                                                vol_path += (char)letter;
                                                vol_path += ':';
                                                mounts_[p.dev] = vol_path;
                                                any_matched = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                                VariantClear(&vtProp);
                                pObj->Release();
                            }
                            pEnum->Release();
                        }
                    }
                    pSvc->Release();
                }
                pLoc->Release();
            }
        }
        CoUninitialize();
    }

    // ── Method 2: IOCTL fallback (admin only, for fixed disks) ──
    if (!any_matched) {
        DWORD drives = GetLogicalDrives();
        for (int i = 0; i < 26; i++) {
            if (!(drives & (1 << i))) continue;

            std::string vol_path = std::string("\\\\.\\") + static_cast<char>('A' + i) + ":";
            HANDLE hVol = CreateFileA(vol_path.c_str(), GENERIC_READ,
                                      FILE_SHARE_READ | FILE_SHARE_WRITE,
                                      nullptr, OPEN_EXISTING, 0, nullptr);
            if (hVol == INVALID_HANDLE_VALUE) continue;

            char extent_buf[sizeof(VOLUME_DISK_EXTENTS) + sizeof(DISK_EXTENT)];
            DWORD returned = 0;
            BOOL ok = DeviceIoControl(hVol, IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS,
                                       nullptr, 0, extent_buf, sizeof(extent_buf),
                                       &returned, nullptr);
            if (ok && returned >= sizeof(VOLUME_DISK_EXTENTS)) {
                VOLUME_DISK_EXTENTS* extents = (VOLUME_DISK_EXTENTS*)extent_buf;
                if (extents->NumberOfDiskExtents >= 1) {
                    int disk_num = (int)extents->Extents[0].DiskNumber;
                    long long offset = extents->Extents[0].StartingOffset.QuadPart;
                    for (const auto& p : parts) {
                        if (p.disk == disk_num && p.offset == offset) {
                            hidden_devices_.erase(p.dev);
                            mounts_[p.dev] = vol_path;
                            any_matched = true;
                        }
                    }
                }
            }
            CloseHandle(hVol);
        }
    }

    // ── Fallback: partition 1 heuristic ──
    if (!any_matched) {
        for (const auto& p : parts) {
            if (p.dev.size() >= 6 && p.dev.substr(p.dev.size() - 1) == "1") {
                hidden_devices_.erase(p.dev);
            }
        }
    }
}

void PathManager::add_mount(const std::string& unix_path, const std::string& win_path) {
    mounts_[unix_path] = win_path;
}

void PathManager::remove_mount(const std::string& unix_path) {
    mounts_.erase(unix_path);
}

std::string PathManager::get_mount(const std::string& unix_path) const {
    auto it = mounts_.find(unix_path);
    if (it != mounts_.end()) return it->second;
    return {};
}
bool PathManager::is_dev_hidden(const std::string& unix_path) const {
    return hidden_devices_.count(unix_path) > 0;
}

// ─── load_fstab — /etc/fstab ──────────────────────────

void PathManager::load_fstab() {
    // The /etc directory is already created by build_mounts, so <root>\etc exists.
    std::string fstab_path = root_ + "\\etc\\fstab";

    namespace fs = std::filesystem;
    if (!fs::exists(fstab_path)) {
        // Create default fstab: enumerate Windows drives
        std::ofstream out(fstab_path, std::ios::binary);
        if (!out.is_open()) return;

        out << "# amsys fstab" << std::endl;
        out << "# <Windows-path>  <unix-mountpoint>" << std::endl;
        out << std::endl;

        // Add well-known virtual dirs as comments
        for (const auto& vd : well_known_virtual_dirs_) {
            out << "# " << vd << "  (virtual directory)" << std::endl;
        }
        out << std::endl;

        // Enumerate all Windows drive letters
        DWORD drives = GetLogicalDrives();
        for (int i = 0; i < 26; i++) {
            if (drives & (1 << i)) {
                char letter = static_cast<char>('A' + i);
                char root_path[4] = {letter, ':', '\\', '\0'};
                UINT type = GetDriveTypeA(root_path);
                if (type != DRIVE_NO_ROOT_DIR && type != DRIVE_CDROM) {
                    std::string device = std::string(1, letter) + ":\\";
                    std::string mount = std::string("/media/") +
                                        static_cast<char>(std::tolower(letter));
                    out << device << "  " << mount << std::endl;
                }
            }
        }
        out.flush();
        out.close();

        // Verify the file was created
        std::ifstream verify(fstab_path);
        if (!verify.is_open()) {
            std::cerr << "warn: fstab creation failed" << std::endl;
        }
    }

    // Read fstab
    std::ifstream in(fstab_path);
    if (!in.is_open()) return;

    std::string line;
    while (std::getline(in, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;

        // Split by whitespace (any amount) and filter empty parts
        std::vector<std::string> parts;
        {
            std::stringstream ss(line);
            std::string token;
            while (ss >> token) {
                parts.push_back(token);
            }
        }
        if (parts.size() < 2) continue;

        std::string device = parts[0];
        std::string mountpoint = parts[1];

        if (device.empty() || mountpoint.empty()) continue;

        // Normalize mountpoint (ensure starts with /)
        if (mountpoint[0] != '/') mountpoint = "/" + mountpoint;

        // Normalize device path
        device = to_windows_sep(device);

        // Check for .floder override on the mount point's real directory
        // For fstab entries, the device path IS the real path; check .floder on it
        std::string floder_path = read_floder(device);
        if (!floder_path.empty()) {
            device = to_windows_sep(floder_path);
            while (!device.empty() && device.back() == '\\') device.pop_back();
        }

        mounts_[mountpoint] = device;

        // Warn if mount target doesn't exist
        {
            std::wstring wdev = utf8_to_wide(acp_to_utf8(device));
            DWORD attr = GetFileAttributesW(wdev.c_str());
            if (attr == INVALID_FILE_ATTRIBUTES) {
                std::cerr << "unable to mount " << mountpoint << " (" << device << ")" << std::endl;
            }
        }
    }
}

// ─── Path resolution ──────────────────────────────────

std::string PathManager::normalize_unix(const std::string& path) const {
    if (path.empty()) return cwd_;

    std::string p = to_unix_sep(path);

    if (p[0] != '/') {
        p = cwd_ + "/" + p;
    }

    std::vector<std::string> parts = split(p, '/');
    std::vector<std::string> result;

    for (const auto& part : parts) {
        if (part.empty() || part == ".") continue;
        if (part == "..") {
            if (result.empty() || result.back() == "..") {
                if (block_dotdot_) return "";
                result.push_back("..");
            } else {
                result.pop_back();
            }
        } else {
            result.push_back(part);
        }
    }

    if (result.empty()) return "/";

    std::string canonical = "/";
    for (size_t i = 0; i < result.size(); i++) {
        canonical += result[i];
        if (i < result.size() - 1) canonical += "/";
    }
    return canonical;
}

bool PathManager::would_escape_root(const std::string& path) const {
    auto parts = split(path, '/');
    int depth = 0;
    for (const auto& p : parts) {
        if (p == "..") depth--;
        else if (!p.empty()) depth++;
        if (depth < 0) return true;
    }
    return false;
}

std::string PathManager::resolve(const std::string& unix_path) const {
    if (!block_dotdot_) {
        std::string p = normalize_unix(unix_path);
        return p.empty() ? "/" : p;
    }

    std::string p = to_unix_sep(unix_path);
    if (p.empty()) return cwd_;

    if (p[0] != '/') {
        p = cwd_ + "/" + p;
    }

    if (would_escape_root(p)) return "";

    return normalize_unix(p);
}

// ─── Virtual directory support ────────────────────────

bool PathManager::is_virtual_dir(const std::string& unix_path) const {
    std::string p = resolve(unix_path);
    if (p.empty() || p == "/") return false;

    // Well-known virtual dirs always exist
    if (well_known_virtual_dirs_.count(p)) return true;

    // Mount prefix check
    std::string prefix = p;
    if (prefix.back() != '/') prefix += '/';
    for (const auto& [mount_path, _] : mounts_) {
        if (starts_with(mount_path, prefix)) return true;
    }
    return false;
}

std::vector<std::string> PathManager::list_virtual_children(const std::string& unix_path) const {
    std::vector<std::string> children;
    std::string p = resolve(unix_path);
    if (p.empty()) return children;
    std::string prefix = p;
    if (prefix.back() != '/') prefix += '/';

    for (const auto& [mount_path, _] : mounts_) {
        if (starts_with(mount_path, prefix)) {
            std::string rest = mount_path.substr(prefix.size());
            auto slash = rest.find('/');
            std::string child = (slash == std::string::npos) ? rest : rest.substr(0, slash);
            if (!child.empty() &&
                std::find(children.begin(), children.end(), child) == children.end()) {
                children.push_back(child);
            }
        }
    }
    return children;
}

// ─── Special device helpers ───────────────────────────

bool PathManager::is_special_device(const std::string& unix_path) const {
    std::string p = resolve(unix_path);
    return (p == "/dev/null" || p == "/dev/zero");
}

bool PathManager::is_disk_device(const std::string& unix_path) const {
    std::string p = resolve(unix_path);
    if (!starts_with(p, "/dev/sd")) return false;
    // Must be /dev/sd[a-z] (single letter after sd)
    return p.size() == 8 && p[7] >= 'a' && p[7] <= 'z';
}

// ─── to_windows ───────────────────────────────────────

std::string PathManager::to_windows(const std::string& unix_path, bool* is_under_mnt) const {
    std::string resolved = resolve(unix_path);
    if (resolved.empty()) return "";

    if (resolved == "/") {
        if (is_under_mnt) *is_under_mnt = false;
        return root_ + "\\";
    }

    // Virtual directories have no real Windows path
    if (is_virtual_dir(resolved)) return "";

    std::string p = resolved.substr(1);
    if (p.empty()) {
        if (is_under_mnt) *is_under_mnt = false;
        return root_ + "\\";
    }

    // Handle /mnt/* — check mount table first for explicit fstab entries
    // Only treat as drive mount if next component is a single letter
    if ((starts_with(p, "mnt/") || starts_with(p, "media/")) ||
        (starts_with(p, "mnt\\") || starts_with(p, "media\\"))) {
        // Quick sanity: check that the component after the prefix is a single letter
        size_t sl = p.find_first_of("/\\");
        if (sl != std::string::npos) {
            size_t nsl = p.find_first_of("/\\", sl + 1);
            std::string comp = (nsl == std::string::npos) ? p.substr(sl + 1) : p.substr(sl + 1, nsl - sl - 1);
            bool valid = (comp.size() == 1 && ((comp[0] >= 'a' && comp[0] <= 'z') || (comp[0] >= 'A' && comp[0] <= 'Z')));
            if (!valid) {
                if (is_under_mnt) *is_under_mnt = false;
                goto normal_path_after_mnt;
            }
        }
        if (is_under_mnt) *is_under_mnt = true;
        
        // Check if this exact path is in mount table (set by fstab)
        auto it = mounts_.find(resolved);
        if (it != mounts_.end()) {
            std::string win = it->second;
            return win;
        }

        // Fallback: parse drive letter from /mnt/X/... or /media/X/...
        size_t prefix_len = 4;
        std::string unix_prefix = "/mnt/";
        if (starts_with(p, "media/") || starts_with(p, "media\\")) {
            prefix_len = 6;
            unix_prefix = "/media/";
        } else if (starts_with(p, "mnt\\")) {
            prefix_len = 4;
            unix_prefix = "/mnt/";
        }
        std::string remaining = p.substr(prefix_len);
        auto slash_pos = remaining.find_first_of("/\\");
        std::string drive_letter;
        std::string subpath;
        if (slash_pos == std::string::npos) {
            drive_letter = remaining;
            subpath = "";
        } else {
            drive_letter = remaining.substr(0, slash_pos);
            subpath = remaining.substr(slash_pos + 1);
        }

        std::string unix_mnt = unix_prefix + drive_letter;
        auto it2 = mounts_.find(unix_mnt);
        if (it2 != mounts_.end()) {
            std::string win = it2->second;
            if (!subpath.empty()) {
                if (!win.empty() && win.back() != '\\') win += "\\";
                win += to_windows_sep(utf8_to_acp(subpath));
            }
            return win;
        }
        // Ultimate fallback
        return drive_letter + ":\\" + to_windows_sep(utf8_to_acp(subpath));
    }

    normal_path_after_mnt:
    // Not under /mnt
    if (is_under_mnt) *is_under_mnt = false;

    auto slash_pos = p.find_first_of("/\\");
    std::string top_component;
    std::string rest;
    if (slash_pos == std::string::npos) {
        top_component = p;
        rest = "";
    } else {
        top_component = p.substr(0, slash_pos);
        rest = p.substr(slash_pos + 1);
    }

    std::string win_base = find_windows_for_unix_component(top_component, root_);

    std::string result = win_base;
    if (!rest.empty()) {
        if (!result.empty() && result.back() != '\\') result += "\\";
        result += to_windows_sep(utf8_to_acp(rest));
    }

    return result;
}

// ─── to_unix ──────────────────────────────────────────

std::string PathManager::to_unix(const std::string& windows_path) const {
    std::string win = to_windows_sep(windows_path);
    while (!win.empty() && win.back() == '\\') win.pop_back();

    if (win.empty()) return "/";

    // Mount table lookup — pick the LONGEST matching prefix
    std::string best_unix;
    std::string best_suffix;
    size_t best_len = 0;

    for (const auto& [unix_path, win_path] : mounts_) {
        std::string wp = to_windows_sep(win_path);
        while (!wp.empty() && wp.back() == '\\') wp.pop_back();

        if (starts_with(to_lower(win), to_lower(wp))) {
            std::string suffix = win.substr(wp.size());
            if (!suffix.empty() && suffix[0] == '\\') {
                suffix = suffix.substr(1);
            }
            if (wp.size() > best_len) {
                best_len = wp.size();
                best_unix = unix_path;
                best_suffix = suffix;
            }
        }
    }

    if (!best_unix.empty()) {
        std::string result = best_unix;
        if (!best_suffix.empty()) {
            result += "/" + to_unix_sep(acp_to_utf8(best_suffix));
        }
        return result;
    }

    // Fallback: construct relative to root
    if (starts_with(to_lower(win), to_lower(root_))) {
        std::string suffix = win.substr(root_.size());
        while (!suffix.empty() && suffix[0] == '\\') suffix.erase(suffix.begin());
        if (suffix.empty()) return "/";
        return "/" + to_unix_sep(acp_to_utf8(suffix));
    }

    // Under /mnt via drive letter
    if (win.size() >= 2 && win[1] == ':') {
        std::string result = std::string("/mnt/") + static_cast<char>(std::tolower(win[0]));
        if (win.size() > 3) {
            result += "/" + to_unix_sep(acp_to_utf8(win.substr(3)));
        }
        return result;
    }

    return "/mnt/" + to_unix_sep(acp_to_utf8(win));
}

// ─── set_cwd ──────────────────────────────────────────

bool PathManager::set_cwd(const std::string& unix_path) {
    std::string resolved = resolve(unix_path);
    if (resolved.empty()) return false;

    // Virtual directories and well-known dirs always allow cd
    if (is_virtual_dir(resolved)) {
        cwd_ = resolved;
        return true;
    }

    // Special device paths — can cd into /dev but not to a device file
    if (resolved == "/dev" || resolved == "/mnt" || resolved == "/media") {
        cwd_ = resolved;
        return true;
    }

    std::string win_path = to_windows(unix_path);
    if (win_path.empty()) return false;

    std::wstring wpath = utf8_to_wide(acp_to_utf8(win_path));
    DWORD attrs = GetFileAttributesW(wpath.c_str());
    if (attrs == INVALID_FILE_ATTRIBUTES || !(attrs & FILE_ATTRIBUTE_DIRECTORY)) {
        return false;
    }

    std::string canon = to_unix(win_path);
    cwd_ = (canon != resolved && !canon.empty()) ? canon : resolved;
    return true;
}

// ─── is_valid_path ────────────────────────────────────

bool PathManager::is_valid_path(const std::string& unix_path) const {
    std::string resolved = resolve(unix_path);
    if (resolved.empty()) return false;
    if (is_virtual_dir(resolved)) return true;
    if (is_special_device(resolved)) return true;

    std::string win_path = to_windows(unix_path);
    if (win_path.empty()) return false;

    std::wstring wpath = utf8_to_wide(acp_to_utf8(win_path));
    DWORD attrs = GetFileAttributesW(wpath.c_str());
    return (attrs != INVALID_FILE_ATTRIBUTES);
}

// ─── list_mounts ──────────────────────────────────────

void PathManager::list_mounts() const {
    std::vector<std::pair<std::string, std::string>> sorted(mounts_.begin(), mounts_.end());
    std::sort(sorted.begin(), sorted.end());

    std::cout << "Mount points:" << std::endl;
    for (const auto& [unix_p, win_p] : sorted) {
        std::cout << "  " << unix_p;
        if (unix_p.size() < 15) std::cout << std::string(16 - unix_p.size(), ' ');
        else std::cout << "  ";
        // For special devices like /dev/null, show empty path
        std::string display = win_p.empty() ? "(virtual)" : acp_to_utf8(win_p);
        std::cout << " -> " << display << std::endl;
    }
}

// ─── find_windows_for_unix_component ──────────────────

std::string PathManager::find_windows_for_unix_component(
    const std::string& component, const std::string& default_root) const
{
    std::string unix_mount = "/" + component;
    auto it = mounts_.find(unix_mount);
    if (it != mounts_.end()) return it->second;
    return default_root + "\\" + component;
}

} // namespace amsys
