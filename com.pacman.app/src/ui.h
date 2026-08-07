#pragma once

#include <FL/Fl.H>
#include <FL/Fl_Window.H>
#include <FL/Fl_Box.H>
#include <FL/Fl_Button.H>
#include <FL/Fl_Image.H>

#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "apm_core.h"
#include "package_info.h"

class AmsysPipe;

// 文件选择器的一行条目（Windows 枚举结果）
struct BrowseEntry {
    std::string name;
    bool isDir = false;
    long long size = 0;
};

class DeepButton;
class DeepTextButton;
class IconWidget;
class DownloadGlyph;
class DashLine;
class ProgressBar;
class Spinner;
class Fl_Select_Browser;
class Fl_Text_Display;
class Fl_Text_Buffer;

class PacmanWindow : public Fl_Window {
public:
    PacmanWindow();
    ~PacmanWindow() override;

    // 载入 .aup 包（命令行 / 拖拽入口）
    void openAupFile(const std::string& path);
    void dropFile(const std::string& path);  // WM_DROPFILES 入口
    void show() override;  // 圆角窗口

private:
    enum class View { Home, Preview, Log, Cleaning, Browse };
    enum class InstallMode { None, Fresh, Reinstall, Update, Downgrade };

    struct OpState {
        std::mutex m;
        std::vector<std::string> lines;
        bool finished = false;
        ApmResult result;
    };

    // .aup 预览（后台线程解压+解析，避免大包卡 UI）
    struct PreviewState {
        std::mutex m;
        AupPreview r;
        bool done = false;
    };

    static void close_cb(Fl_Widget*, void*);
    static void min_cb(Fl_Widget*, void*);
    static void install_cb(Fl_Widget*, void*);
    static void uninstall_cb(Fl_Widget*, void*);
    static void toggle_log_cb(Fl_Widget*, void*);
    static void done_cb(Fl_Widget*, void*);
    static void poll_op(void*);
    static void tick_progress(void*);
    static void poll_preview(void*);
    static void spin_tick(void*);
    static void cleaning_done_cb(void*);
    static void process_drop_cb(void*);
    static void choose_cb(Fl_Widget*, void*);
    static void browse_up_cb(Fl_Widget*, void*);
    static void browse_cancel_cb(Fl_Widget*, void*);
    static void browse_open_cb(Fl_Widget*, void*);
    static void browse_list_cb(Fl_Widget*, void*);

    void showHome();
    void showPreview();
    void showLog(bool expanded);
    void startInstall();
    void startUninstall();
    void finishOp(const ApmResult& r);
    void finishDone();
    void showCleaning();
    void closeAfterCleanup();
    void applyPreview(const AupPreview& r);
    void showBrowse();
    void leaveBrowse();
    void browseRefresh();
    void browseGoUp();
    void browseActivate();
    void onBrowseList();
    void setBusy(bool on);
    void cleanupTemp();
    void openDroppedPath(const std::string& path);
    int handle(int ev) override;

    // 标题栏
    DeepButton* minBtn_ = nullptr;
    DeepButton* closeBtn_ = nullptr;

    // 首页
    DownloadGlyph* homeIcon_ = nullptr;
    Fl_Box* homeHint_ = nullptr;
    DashLine* dashLine_ = nullptr;
    DeepButton* chooseBtn_ = nullptr;   // 「选择文件」由外部文件选择器接管
    Fl_Box* homeStatus_ = nullptr;      // 红色错误提示

    // 预览页
    IconWidget* pkgIcon_ = nullptr;
    Fl_Box* pkgName_ = nullptr;
    Fl_Box* pkgVersion_ = nullptr;
    Fl_Box* pkgDesc_ = nullptr;
    Fl_Box* warnBox_ = nullptr;         // 红色状态文字
    DeepButton* uninstallBtn_ = nullptr; // 规格：灰色禁用
    DeepButton* mainBtn_ = nullptr;

    // 日志页
    DeepTextButton* toggleLogBtn_ = nullptr;
    Fl_Text_Display* logView_ = nullptr;
    Fl_Text_Buffer* logBuf_ = nullptr;
    ProgressBar* progress_ = nullptr;
    Fl_Box* finishBox_ = nullptr;
    DeepButton* doneBtn_ = nullptr;   // 完成界面：进度条位置换成的“完成”按钮
    Spinner* cleaningSpinner_ = nullptr;
    Fl_Box* cleaningLabel_ = nullptr;

    // 文件选择器
    Fl_Box* browseAddr_ = nullptr;
    Fl_Select_Browser* browseList_ = nullptr;
    DeepButton* browseUpBtn_ = nullptr;
    DeepButton* browseCancelBtn_ = nullptr;
    DeepButton* browseOpenBtn_ = nullptr;

    ApmPaths paths_;
    PackageInfo pkg_;
    std::string installedVer_;
    std::string tempDir_;
    std::unique_ptr<AmsysPipe> browsePipe_;  // 浏览会话期间常驻的 amsys 管道
    std::string browseUnix_;                 // 当前 Unix 路径（如 "/"、"/bin"）
    std::string browseWin_;                  // 当前目录的 Windows 绝对路径（来自 amsys）
    std::vector<BrowseEntry> browseEntries_;
    std::string browseSelected_;
    InstallMode mode_ = InstallMode::None;
    View view_ = View::Home;
    bool busy_ = false;
    bool logExpanded_ = false;
    bool finished_ = false;          // 安装已结束：底部显示“完成”而非进度条
    bool cleaning_ = false;          // 清理缓存中：显示加载圈
    bool dragging_ = false;
    int dragDX_ = 0, dragDY_ = 0;
    double progressValue_ = 0.0;
    std::string pendingDrop_;      // 拖放入队（避免在 OLE 回调里做 UI 工作）
    std::shared_ptr<OpState> op_;
    std::shared_ptr<PreviewState> previewOp_;
    Fl_Image* titleIconImg_ = nullptr;  // 标题栏 pacman.ico（22x22）
    uchar* titleIconPix_ = nullptr;     // 对应像素缓冲
};
