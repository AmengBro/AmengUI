#pragma once

#include <string>

struct PackageInfo {
    std::string pkgName;      // [package] name
    std::string version;      // [package] version
    std::string location;     // [install] location (/opt 或 /bin)
    std::string dirName;      // [install] name（安装目录名）
    std::string displayName;  // .app 的 "name"
    std::string description;  // .app 的 "description"
    std::string iconPath;     // .app 的 "icon"
    std::string exePath;      // .app 的 "exePath"
    std::string sourceAup;    // 安装模式下 .aup 的 Windows 绝对路径

    std::string comboLabel() const;
};

// 解析 aminfo.ini 文本（[package] name/version，[install] location/name）
PackageInfo parseAminfo(const std::string& text);

// 解析 .app JSON 的四个字段并合并进 info
void mergeAppJson(PackageInfo& info, const std::string& jsonText);

// 比较两个版本号（按数字段逐段比较），a<b 返回 -1，相等 0，a>b 返回 1
int compareVersions(const std::string& a, const std::string& b);

// 去首尾空白（含 UTF-8 BOM 与 \r\n）
std::string trim(const std::string& s);
