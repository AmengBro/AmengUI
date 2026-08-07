#include "apm_core.h"
#include "amsys_client.h"

#include <windows.h>
#include <shellapi.h>

#include <algorithm>
#include <sstream>

namespace {

std::wstring utf8ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
    std::wstring w(n > 0 ? n : 0, L'\0');
    if (n > 0) MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], n);
    return w;
}

std::string wideToUtf8(const std::wstring& w) {
    if (w.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    std::string s(n > 0 ? n : 0, '\0');
    if (n > 0) WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), &s[0], n, nullptr, nullptr);
    return s;
}

std::string dirname(const std::string& p) {
    size_t pos = p.find_last_of("\\/");
    if (pos == std::string::npos) return ".";
    if (pos == 0) return p.substr(0, 1);
    return p.substr(0, pos);
}

bool readTextFile(const std::string& path, std::string& out) {
    std::wstring w = utf8ToWide(path);
    if (w.empty()) return false;
    HANDLE h = CreateFileW(w.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    std::string data;
    char buf[8192];
    DWORD n = 0;
    while (ReadFile(h, buf, sizeof(buf), &n, nullptr) && n > 0)
        data.append(buf, n);
    CloseHandle(h);
    out = std::move(data);
    return true;
}

bool writeTextFileUtf8(const std::string& path, const std::string& text) {
    std::wstring w = utf8ToWide(path);
    if (w.empty()) return false;
    HANDLE h = CreateFileW(w.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    DWORD written = 0;
    bool ok = WriteFile(h, text.data(), (DWORD)text.size(), &written, nullptr);
    CloseHandle(h);
    return ok;
}

// 递归创建目录（宽字符，支持中文路径）
bool ensureDirWide(const std::wstring& path) {
    if (path.empty()) return false;
    if (CreateDirectoryW(path.c_str(), nullptr)) return true;
    DWORD err = GetLastError();
    if (err == ERROR_ALREADY_EXISTS) return true;
    if (err != ERROR_PATH_NOT_FOUND) return false;
    size_t pos = path.find_last_of(L"\\/");
    if (pos == std::wstring::npos || pos <= 1) return false;  // "D:" 之类无法再拆分
    if (!ensureDirWide(path.substr(0, pos))) return false;
    return CreateDirectoryW(path.c_str(), nullptr) ||
           GetLastError() == ERROR_ALREADY_EXISTS;
}

bool fileExists(const std::string& p) { return fileExistsUtf8(p); }

std::string parseSystemRoot(const std::string& configPath) {
    std::string text;
    if (!readTextFile(configPath, text)) return "";
    std::string section;
    std::istringstream ss(text);
    std::string line;
    while (std::getline(ss, line)) {
        std::string t = trim(line);
        if (t.empty() || t[0] == ';' || t[0] == '#') continue;
        if (t[0] == '[') {
            size_t c = t.find(']');
            if (c != std::string::npos) section = trim(t.substr(1, c - 1));
            continue;
        }
        size_t eq = t.find('=');
        if (eq == std::string::npos) continue;
        std::string key = trim(t.substr(0, eq));
        std::string val = trim(t.substr(eq + 1));
        if (section == "system" && key == "root") return val;
    }
    return "";
}

// ── pacman.ini 配置 ──────────────────────────────

struct PacmanConfig {
    std::string amsys;
    std::string apm;
    std::string sevenzip;
};

std::string exeDir() {
    wchar_t buf[MAX_PATH] = {};
    DWORD n = GetModuleFileNameW(nullptr, buf, MAX_PATH);
    if (n == 0) return ".";
    std::wstring w(buf);
    size_t pos = w.find_last_of(L"\\/");
    return wideToUtf8(pos == std::wstring::npos ? w : w.substr(0, pos));
}

bool isDirectoryUtf8(const std::string& p) {
    if (p.empty()) return false;
    std::wstring w = utf8ToWide(p);
    DWORD a = GetFileAttributesW(w.c_str());
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

// 读取 pacman.ini 的 [paths] 节（amsys / apm / sevenzip）
PacmanConfig readPacmanConfig(const std::string& path) {
    PacmanConfig c;
    std::string text;
    if (!readTextFile(path, text)) return c;
    std::string section;
    std::istringstream ss(text);
    std::string line;
    while (std::getline(ss, line)) {
        std::string t = trim(line);
        if (t.empty() || t[0] == ';' || t[0] == '#') continue;
        if (t[0] == '[') {
            size_t cc = t.find(']');
            if (cc != std::string::npos) section = trim(t.substr(1, cc - 1));
            continue;
        }
        size_t eq = t.find('=');
        if (eq == std::string::npos) continue;
        std::string key = trim(t.substr(0, eq));
        std::string val = trim(t.substr(eq + 1));
        if (section == "paths") {
            if (key == "amsys") c.amsys = val;
            else if (key == "apm") c.apm = val;
            else if (key == "sevenzip" || key == "7z") c.sevenzip = val;
        }
    }
    return c;
}

// 首次运行自动生成 pacman.ini（已有文件不覆盖）
void ensureConfigFile(const std::string& path, const std::string& amsysExe) {
    if (fileExists(path)) return;
    std::string text =
        "; pacman.ini — 包管理器配置（UTF-8 编码）\n"
        "; 留空则自动探测；apm 默认与 amsys 同 root（root\\bin\\apm.exe）\n"
        "[paths]\n"
        "amsys = " + amsysExe + "\n"
        "apm =\n"
        "sevenzip =\n";
    writeTextFileUtf8(path, text);
}

// 自动定位 amsys.exe（同 apm 策略：本级/上级/上上级/PATH，优先带 config.ini）
std::string locateAmsys(const std::string& fromDir) {
    std::vector<std::string> cands;
    for (int up = 0; up <= 2; ++up) {
        std::string base = fromDir;
        for (int i = 0; i < up; ++i) base += "\\..";
        cands.push_back(base + "\\amsys.exe");
    }
    cands.push_back("amsys.exe");
    auto hasConfig = [](const std::string& exe) {
        std::string d = dirname(exe);
        return fileExists(d + "\\config.ini") || fileExists(d + "\\..\\config.ini") ||
               fileExists("config.ini");
    };
    for (auto& c : cands)
        if (fileExists(c) && hasConfig(c)) return c;
    for (auto& c : cands)
        if (fileExists(c)) return c;
    return "";
}

std::string lastLine(const std::string& text) {
    std::string out;
    size_t start = 0;
    while (start <= text.size()) {
        size_t nl = text.find('\n', start);
        std::string line = text.substr(
            start, nl == std::string::npos ? std::string::npos : nl - start);
        if (!line.empty() && line.back() == '\r') line.pop_back();
        std::string t = trim(line);
        if (!t.empty()) out = t;
        if (nl == std::string::npos) break;
        start = nl + 1;
    }
    return out;
}

struct ProcResult {
    bool started = false;
    long code = -1;
    std::string output;
};

// 隐藏窗口运行子进程，管道捕获 stdout+stderr，可增量回调输出行
ProcResult runProcess(const std::wstring& cmdline, const std::wstring& workdir,
                      const std::function<void(const std::string&)>& onLine) {
    ProcResult r;
    HANDLE hRead = nullptr, hWrite = nullptr;
    SECURITY_ATTRIBUTES sa{};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;
    if (!CreatePipe(&hRead, &hWrite, &sa, 0)) {
        r.output = "CreatePipe failed";
        return r;
    }
    SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    si.hStdOutput = hWrite;
    si.hStdError = hWrite;

    PROCESS_INFORMATION pi{};
    std::wstring cmd = cmdline;
    wchar_t* wd = workdir.empty() ? nullptr : const_cast<wchar_t*>(workdir.c_str());
    BOOL ok = CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, TRUE,
                             CREATE_NO_WINDOW, nullptr, wd, &si, &pi);
    CloseHandle(hWrite);
    if (!ok) {
        CloseHandle(hRead);
        r.output = "CreateProcessW failed, error=" + std::to_string(GetLastError());
        return r;
    }
    CloseHandle(pi.hThread);

    std::string out, full;
    auto flushLines = [&](const char* data, size_t len) {
        out.append(data, len);
        full.append(data, len);
        size_t nl;
        while ((nl = out.find('\n')) != std::string::npos) {
            std::string line = out.substr(0, nl);
            out.erase(0, nl + 1);
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (!line.empty() && onLine) onLine(line);
        }
    };

    char buf[8192];
    bool done = false;
    while (!done) {
        DWORD avail = 0;
        if (!PeekNamedPipe(hRead, nullptr, 0, nullptr, &avail, nullptr)) {
            for (;;) {
                DWORD n = 0;
                if (!ReadFile(hRead, buf, sizeof(buf), &n, nullptr) || n == 0) break;
                flushLines(buf, n);
            }
            done = true;
            break;
        }
        if (avail > 0) {
            DWORD n = 0;
            if (!ReadFile(hRead, buf, (DWORD)std::min<size_t>(avail, sizeof(buf)), &n, nullptr) ||
                n == 0) {
                done = true;
                break;
            }
            flushLines(buf, n);
        }
        if (WaitForSingleObject(pi.hProcess, 30) == WAIT_OBJECT_0) {
            for (;;) {
                DWORD n = 0;
                if (!ReadFile(hRead, buf, sizeof(buf), &n, nullptr) || n == 0) break;
                flushLines(buf, n);
            }
            done = true;
        }
    }
    if (!out.empty()) {
        if (!out.empty() && out.back() == '\r') out.pop_back();
        if (!out.empty() && onLine) onLine(out);
    }

    DWORD code = 0;
    GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hProcess);
    CloseHandle(hRead);
    r.started = true;
    r.code = (long)code;
    r.output = full;
    return r;
}

void loadAppMeta(const ApmPaths& paths, PackageInfo& info) {
    std::string dir = paths.amsysRoot + "\\usr\\share\\applications";
    WIN32_FIND_DATAW ffd;
    HANDLE h = FindFirstFileW((utf8ToWide(dir) + L"\\*.app").c_str(), &ffd);
    if (h == INVALID_HANDLE_VALUE) return;
    std::vector<std::string> files;
    do {
        if (wcscmp(ffd.cFileName, L".") != 0 && wcscmp(ffd.cFileName, L"..") != 0)
            files.push_back(wideToUtf8(ffd.cFileName));
    } while (FindNextFileW(h, &ffd));
    FindClose(h);

    auto tryMatch = [&](const std::string& fname) {
        std::string text;
        if (!readTextFile(dir + "\\" + fname, text)) return false;
        mergeAppJson(info, text);
        return true;
    };
    // 与 apm 卸载逻辑一致：先精确 name.app，再前缀匹配
    for (auto& f : files)
        if (f == info.pkgName + ".app") { if (tryMatch(f)) return; }
    for (auto& f : files)
        if (f.rfind(info.pkgName, 0) == 0) { if (tryMatch(f)) return; }
}

} // namespace

bool fileExistsUtf8(const std::string& p) {
    if (p.empty()) return false;
    int n = MultiByteToWideChar(CP_UTF8, 0, p.data(), (int)p.size(), nullptr, 0);
    if (n <= 0) return false;
    std::wstring w(n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, p.data(), (int)p.size(), &w[0], n);
    DWORD a = GetFileAttributesW(w.c_str());
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

ApmPaths findApmPaths() {
    ApmPaths p;
    std::string dir = exeDir();
    p.configFile = dir + "\\pacman.ini";

    // amsys：pacman.ini → 自动定位
    PacmanConfig cfg = readPacmanConfig(p.configFile);
    std::string amsys = cfg.amsys;
    if (!amsys.empty() && isDirectoryUtf8(amsys)) amsys += "\\amsys.exe";
    if (amsys.empty()) {
        // 已知项目默认位置优先（首个自动生成的配置会写这里，用户可再改）
        if (fileExists("D:\\Codewhale\\workspace\\amsys\\amsys.exe"))
            amsys = "D:\\Codewhale\\workspace\\amsys\\amsys.exe";
        else
            amsys = locateAmsys(dir);
    }
    ensureConfigFile(p.configFile, amsys);
    if (amsys.empty()) {
        p.error = "未找到 amsys.exe，请编辑 pacman.ini 填写 amsys 路径";
        return p;
    }
    p.amsysExe = amsys;
    std::string amsysDir = dirname(amsys);

    // apm：pacman.ini → 默认与 amsys 同 root（root\bin\apm.exe）→ PATH
    std::string apm = cfg.apm;
    if (!apm.empty() && isDirectoryUtf8(apm)) apm += "\\apm.exe";
    if (apm.empty()) apm = amsysDir + "\\root\\bin\\apm.exe";
    if (!fileExists(apm)) apm = amsysDir + "\\root\\usr\\bin\\apm.exe";
    if (!fileExists(apm)) {
        char found[MAX_PATH] = {};
        if (SearchPathA(nullptr, "apm.exe", nullptr, MAX_PATH, found, nullptr))
            apm = found;
    }
    if (apm.empty() || !fileExists(apm)) {
        p.error = "未找到 apm.exe，请编辑 pacman.ini 填写 apm 路径";
        return p;
    }
    p.apmExe = apm;

    // 虚拟根：amsys config.ini 的 [system] root → 默认 {amsysDir}\root
    std::string root;
    if (fileExists(amsysDir + "\\config.ini"))
        root = parseSystemRoot(amsysDir + "\\config.ini");
    if (root.empty()) {
        size_t pos = amsysDir.find("\\root\\bin");
        if (pos != std::string::npos) root = amsysDir.substr(0, pos) + "\\root";
    }
    if (root.empty()) root = amsysDir + "\\root";
    p.amsysRoot = root;

    // 7z：pacman.ini → amsys resolve /bin/7z/7z.exe → 候选路径（不硬编码）
    std::string sevenz = cfg.sevenzip;
    if (!sevenz.empty() && isDirectoryUtf8(sevenz)) sevenz += "\\7z.exe";
    if (sevenz.empty()) {
        AmsysPipe amsysClient(amsys);
        if (amsysClient.ok()) sevenz = amsysClient.resolve("/bin/7z/7z.exe");
        amsysClient.close();
    }
    if (sevenz.empty()) {
        for (auto& c : {root + "\\bin\\7z\\7z.exe", root + "\\usr\\bin\\7z\\7z.exe",
                        amsysDir + "\\bin\\7z\\7z.exe"})
            if (fileExists(c)) { sevenz = c; break; }
    }
    p.sevenZip = sevenz;

    p.valid = true;
    return p;
}

std::vector<PackageInfo> listInstalledPackages(const ApmPaths& paths) {
    std::vector<PackageInfo> out;
    if (!paths.valid) return out;
    std::string text;
    if (!readTextFile(paths.amsysRoot + "\\etc\\apmlist", text)) return out;
    std::istringstream ss(text);
    std::string line;
    while (std::getline(ss, line)) {
        std::string n = trim(line);
        if (!n.empty()) {
            PackageInfo info;
            info.pkgName = n;
            std::string rec;
            if (readTextFile(paths.amsysRoot + "\\etc\\" + n + "\\aminfo.ini", rec)) {
                PackageInfo am = parseAminfo(rec);
                if (!am.version.empty()) info.version = am.version;
                info.location = am.location;
                info.dirName = am.dirName;
            }
            loadAppMeta(paths, info);
            out.push_back(info);
        }
    }
    return out;
}

ApmResult runApm(const ApmPaths& paths, const std::vector<std::string>& args,
                 std::function<void(const std::string&)> onLine) {
    ApmResult r;
    if (!paths.valid) {
        r.error = paths.error;
        return r;
    }
    std::wstring cmd = L"\"" + utf8ToWide(paths.apmExe) + L"\"";
    for (auto& a : args) cmd += L" \"" + utf8ToWide(a) + L"\"";
    auto pr = runProcess(cmd, utf8ToWide(dirname(paths.apmExe)), onLine);
    r.started = pr.started;
    r.exitCode = pr.code;
    r.output = pr.output;
    if (!pr.started) r.error = pr.output;
    return r;
}

AupPreview previewAup(const ApmPaths& paths, const std::string& aupPath) {
    AupPreview r;
    auto fail = [&](const std::string& msg) { r.error = msg; return r; };
    if (!paths.valid) return fail(paths.error);
    if (!fileExistsUtf8(aupPath)) return fail("文件不存在：" + aupPath);

    // 通过管道从 amsys 获取 /tmp 的 Windows 绝对路径
    AmsysPipe amsys(paths.amsysExe);
    if (!amsys.ok()) return fail("无法启动 amsys.exe --pipe（检查 pacman.ini 的 amsys 路径）");
    std::string tmpWin = amsys.resolve("/tmp");
    if (tmpWin.empty()) return fail("无法通过 amsys 解析 /tmp 路径");

    // 7z：优先用配置，否则通过 amsys 解析 /bin/7z/7z.exe
    std::string sevenz = paths.sevenZip;
    if (sevenz.empty()) {
        sevenz = amsys.resolve("/bin/7z/7z.exe");
        if (sevenz.empty()) return fail("无法解析 /bin/7z/7z.exe（检查 pacman.ini 的 sevenzip）");
    }

    // 在 /tmp 下新建 pactemp 并解压整个 .aup
    std::string tmpDir = tmpWin + "\\pactemp";
    removeDirectoryRecursive(tmpDir);
    if (!ensureDirWide(utf8ToWide(tmpDir))) {
        DWORD err = GetLastError();
        return fail("无法创建临时目录：" + tmpDir + "（错误码 " + std::to_string(err) + "）");
    }

    std::wstring cmd = L"\"" + utf8ToWide(sevenz) + L"\" x \"" + utf8ToWide(aupPath) +
                       L"\" -o\"" + utf8ToWide(tmpDir) + L"\" -y -bso0 -bsp0";
    auto pr = runProcess(cmd, L"", nullptr);
    if (!pr.started || pr.code != 0) {
        std::string tail = lastLine(pr.output);
        removeDirectoryRecursive(tmpDir);
        return fail("7z 解压失败：" + (tail.empty() ? std::string("未知错误") : tail));
    }

    // 读取 aminfo.ini，必须拿到包名与版本号
    std::string iniText;
    if (!readTextFile(tmpDir + "\\aminfo.ini", iniText)) {
        removeDirectoryRecursive(tmpDir);
        return fail("包内缺少 aminfo.ini");
    }
    PackageInfo info = parseAminfo(iniText);
    if (info.pkgName.empty() || info.version.empty()) {
        removeDirectoryRecursive(tmpDir);
        return fail("aminfo.ini 缺少 [package] name 或 version");
    }

    // 按包名找 .app（精确 → 前缀 → 任意第一个）
    std::string chosen;
    if (fileExists(tmpDir + "\\" + info.pkgName + ".app"))
        chosen = info.pkgName + ".app";
    else {
        WIN32_FIND_DATAW ffd;
        HANDLE h = FindFirstFileW((utf8ToWide(tmpDir) + L"\\*.app").c_str(), &ffd);
        if (h != INVALID_HANDLE_VALUE) {
            std::vector<std::string> apps;
            do {
                if (wcscmp(ffd.cFileName, L".") != 0 && wcscmp(ffd.cFileName, L"..") != 0)
                    apps.push_back(wideToUtf8(ffd.cFileName));
            } while (FindNextFileW(h, &ffd));
            FindClose(h);
            for (auto& n : apps)
                if (n.rfind(info.pkgName, 0) == 0) { chosen = n; break; }
            if (chosen.empty() && !apps.empty()) chosen = apps[0];
        }
    }
    if (!chosen.empty()) {
        std::string j;
        if (readTextFile(tmpDir + "\\" + chosen, j)) mergeAppJson(info, j);
    }

    info.sourceAup = aupPath;
    r.ok = true;
    r.tempDir = tmpDir;
    r.pkg = std::move(info);
    return r;
}

void removeDirectoryRecursive(const std::string& path) {
    if (path.empty()) return;
    std::wstring w = utf8ToWide(path);
    w.push_back(L'\0');
    w.push_back(L'\0');
    SHFILEOPSTRUCTW op{};
    op.wFunc = FO_DELETE;
    op.pFrom = w.c_str();
    op.fFlags = FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI;
    SHFileOperationW(&op);
}
