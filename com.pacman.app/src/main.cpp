#include <FL/Fl.H>

#include <windows.h>

#include <string>

#include "ui.h"

static std::string wideToUtf8(const wchar_t* s) {
    if (!s || !*s) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, s, -1, nullptr, 0, nullptr, nullptr);
    std::string out(n > 1 ? n - 1 : 0, '\0');
    if (n > 1) WideCharToMultiByte(CP_UTF8, 0, s, -1, &out[0], n, nullptr, nullptr);
    return out;
}

int main(int argc, char** argv) {
    (void)argc;
    (void)argv;

    // 命令行参数可能是中文路径，统一用 UTF-16 入口解析
    int n = 0;
    LPWSTR* wargv = CommandLineToArgvW(GetCommandLineW(), &n);
    std::string aupArg;
    if (n > 1 && wargv && wargv[1]) aupArg = wideToUtf8(wargv[1]);
    if (wargv) LocalFree(wargv);

    // 中文字体优先用微软雅黑
    Fl::set_font(FL_HELVETICA, "Microsoft YaHei UI");

    PacmanWindow win;
    if (!aupArg.empty()) win.openAupFile(aupArg);
    win.show();
    return Fl::run();
}
