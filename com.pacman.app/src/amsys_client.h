#pragma once

#include <string>
#include <vector>

// amsys list_dir 的一个条目（虚拟目录条目可能缺 size/mtime 字段）
struct AmsysEntry {
    std::string name;
    std::string type;   // "dir" / "file"
    long long size = 0;
    bool virtualEntry = false;
};

// amsys.exe --pipe 的最小客户端（JSON Lines 协议）。
// 构造时启动 amsys，close()/析构时结束进程；每次请求同步等待一行 JSON 响应。
class AmsysPipe {
public:
    explicit AmsysPipe(const std::string& amsysExe);
    ~AmsysPipe();

    bool ok() const { return ok_; }

    // resolve <unix_path> → Windows 绝对路径（失败返回空串）
    std::string resolve(const std::string& unixPath);

    // to_windows <unix_path> → Windows 绝对路径（失败返回空串）
    std::string toWindows(const std::string& unixPath);

    // list_dir <unix_path> → 目录条目（仅用于 resolve 不到真实路径的虚拟目录）
    std::vector<AmsysEntry> listDir(const std::string& unixPath);

    void close();

private:
    std::string sendCommand(const std::string& cmd);
    std::string extractWinPath(const std::string& json) const;

    void* hProc_ = nullptr;       // amsys 进程句柄
    void* hThread_ = nullptr;
    void* hStdinWrite_ = nullptr; // 我们写 amsys stdin
    void* hStdoutRead_ = nullptr; // 我们读 amsys stdout
    std::string readBuf_;         // 未消费的 stdout 字节
    bool ok_ = false;
};
