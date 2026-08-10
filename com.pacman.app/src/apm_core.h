#pragma once

#include <functional>
#include <string>
#include <vector>

#include "package_info.h"

struct ApmPaths {
    std::string configFile;    // pacman.ini（pacman.exe 同目录）
    std::string apmExe;      // apm.exe 完整路径
    std::string amsysExe;    // amsys.exe（--pipe 用）
    std::string amsysRoot;   // amsys 虚拟根（如 D:\Codewhale\workspace\amsys\root）
    std::string sevenZip;    // 7z.exe 完整路径
    std::string cfgAmsys;    // pacman.ini 原始值（保留用户写法）
    std::string cfgApm;
    std::string cfgSevenzip;
    bool assocAup = false;   // [settings] 自动关联 .aup 打开方式
    bool valid = false;
    std::string error;
};

struct ApmResult {
    bool started = false;
    long exitCode = -1;
    std::string output;      // stdout+stderr 合并（UTF-8）
    std::string error;       // 启动失败信息
    bool success() const { return started && exitCode == 0; }
};

// .aup 预览结果：已解压的 pactemp 目录 + 解析出的包信息
struct AupPreview {
    bool ok = false;
    std::string error;
    std::string tempDir;     // {amsys /tmp}\pactemp，用后需 removeDirectoryRecursive
    PackageInfo pkg;
};

// UTF-8 路径是否存在且为文件（内部走宽字符 API，支持中文路径）
bool fileExistsUtf8(const std::string& p);

// 写入 pacman.ini 的 [settings] assoc_aup（保留 paths 原始写法）
bool saveAssocAup(const ApmPaths& paths, bool on);

// 绑定/解绑 .aup 文件关联（HKCU\Software\Classes，无需管理员）
void applyAupAssociation(bool enable);

// 定位 apm.exe / amsys 虚拟根 / 7z.exe
ApmPaths findApmPaths();

// 读取已安装包列表（名字 + 版本 + .app 显示元数据）
std::vector<PackageInfo> listInstalledPackages(const ApmPaths& paths);

// 执行 apm 命令，可增量回调输出行（UTF-8，不含换行）
ApmResult runApm(const ApmPaths& paths, const std::vector<std::string>& args,
                 std::function<void(const std::string&)> onLine = nullptr);

// 预览 .aup：通过 amsys --pipe 解析 /tmp 与 /bin/7z/7z.exe，
// 解压到 {tmp}\pactemp，读取 aminfo.ini 并按包名匹配 .app（找不到则取第一个）
AupPreview previewAup(const ApmPaths& paths, const std::string& aupPath);

// 递归删除目录（含文件），用于清理预览临时目录
void removeDirectoryRecursive(const std::string& path);
