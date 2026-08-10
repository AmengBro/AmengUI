#include "ui.h"
#include "amsys_client.h"

#include <FL/fl_draw.H>
#include <FL/Fl_Select_Browser.H>
#include <FL/Fl_Text_Display.H>
#include <FL/Fl_Text_Buffer.H>
#include <FL/platform.H>

#include <windows.h>
#include <shellapi.h>
#include <objidl.h>
#include <oleidl.h>

#include <algorithm>
#include <cstdio>
#include <memory>
#include <string>
#include <thread>

#include "icon_loader.h"

namespace {

const char* kAppVersion = "1.0.1.0";

const Fl_Color C_BG         = fl_rgb_color(0x1e, 0x1e, 0x1e);
const Fl_Color C_PANEL      = fl_rgb_color(0x24, 0x24, 0x24);
const Fl_Color C_BTN        = fl_rgb_color(0x3c, 0x3c, 0x3c);
const Fl_Color C_BTN_DIS    = fl_rgb_color(0x26, 0x26, 0x26);
const Fl_Color C_TEXT       = fl_rgb_color(0xff, 0xff, 0xff);
const Fl_Color C_SECONDARY  = fl_rgb_color(0xb0, 0xb0, 0xb0);
const Fl_Color C_MUTED      = fl_rgb_color(0x7a, 0x7a, 0x7a);
const Fl_Color C_RED        = fl_rgb_color(0xe5, 0x45, 0x45);
const Fl_Color C_BLUE       = fl_rgb_color(0x3d, 0x9b, 0xff);
const Fl_Color C_ACCENT     = fl_rgb_color(0x00, 0x78, 0xd4);
const Fl_Color C_TRACK      = fl_rgb_color(0x33, 0x33, 0x33);
const Fl_Color C_HOVER      = fl_rgb_color(0x4a, 0x4a, 0x4a);
const Fl_Color C_MENU       = fl_rgb_color(0x2e, 0x2e, 0x2e);
const Fl_Color C_DASH       = fl_rgb_color(0x55, 0x55, 0x55);
const Fl_Color C_ICON_GRAY  = fl_rgb_color(0x8a, 0x8a, 0x8a);
const Fl_Color C_LOG_TEXT   = fl_rgb_color(0xc8, 0xc8, 0xc8);

Fl_Color blendToWhite(Fl_Color c, float t) {
    int r = (c >> 16) & 0xff;
    int g = (c >> 8) & 0xff;
    int b = c & 0xff;
    r = (int)(r + (255 - r) * t);
    g = (int)(g + (255 - g) * t);
    b = (int)(b + (255 - b) * t);
    return fl_rgb_color((uchar)r, (uchar)g, (uchar)b);
}

std::string lastNonEmptyLine(const std::string& text) {
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

std::string baseName(const std::string& p) {
    size_t pos = p.find_last_of("\\/");
    return pos == std::string::npos ? p : p.substr(pos + 1);
}

bool endsWithIgnoreCase(const std::string& s, const std::string& suf) {
    if (s.size() < suf.size()) return false;
    auto ci = [](char c) { return (char)::tolower((unsigned char)c); };
    for (size_t i = 0; i < suf.size(); ++i)
        if (ci(s[s.size() - suf.size() + i]) != ci(suf[i])) return false;
    return true;
}

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

// exe 所在目录（UTF-8，宽字符取路径以支持中文目录）
std::string exeDirUtf8() {
    wchar_t buf[MAX_PATH] = {};
    DWORD n = GetModuleFileNameW(nullptr, buf, MAX_PATH);
    if (n == 0) return ".";
    std::wstring w(buf);
    size_t pos = w.find_last_of(L"\\/");
    return wideToUtf8(pos == std::wstring::npos ? w : w.substr(0, pos));
}

// Unix 路径的上一级（"/bin" → "/"，"/" → "/"）
std::string parentUnix(const std::string& p) {
    if (p.empty() || p == "/") return "/";
    size_t pos = p.find_last_of('/');
    if (pos == std::string::npos || pos == 0) return "/";
    return p.substr(0, pos);
}

std::string formatSize(long long bytes) {
    char buf[48];
    if (bytes >= (1LL << 30))
        snprintf(buf, sizeof(buf), "%.1f GB", bytes / (double)(1LL << 30));
    else if (bytes >= (1LL << 20))
        snprintf(buf, sizeof(buf), "%.1f MB", bytes / (double)(1LL << 20));
    else if (bytes >= (1LL << 10))
        snprintf(buf, sizeof(buf), "%.1f KB", bytes / (double)(1LL << 10));
    else
        snprintf(buf, sizeof(buf), "%lld B", bytes);
    return buf;
}

// file:///C:/... 或 text/uri-list → 本地路径
std::string uriToPath(const std::string& u) {
    if (u.rfind("file:///", 0) == 0) {
        std::string p = u.substr(8);
        std::string dec;
        for (size_t i = 0; i < p.size(); ++i) {
            if (p[i] == '%' && i + 2 < p.size()) {
                auto hex = [](char c) -> int {
                    if (c >= '0' && c <= '9') return c - '0';
                    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
                    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
                    return -1;
                };
                int hi = hex(p[i + 1]), lo = hex(p[i + 2]);
                if (hi >= 0 && lo >= 0) {
                    dec += (char)((hi << 4) | lo);
                    i += 2;
                    continue;
                }
            }
            dec += p[i];
        }
        p = dec;
        if (p.size() >= 2 && p[1] == ':') p = p.substr(1);  // file:///C:/... → C:/...
        return p;
    }
    return u;
}

void dndLog(const std::string& s) {
    const char* tmp = getenv("TEMP");
    std::string p = (tmp && *tmp ? tmp : ".") + std::string("\\pacman_dnd.log");
    FILE* f = fopen(p.c_str(), "a");
    if (f) {
        fprintf(f, "%s\n", s.c_str());
        fclose(f);
    }
}

} // namespace

// ── 文件拖放（WM_DROPFILES）─────────────────

static PacmanWindow* g_dropWindow = nullptr;
static WNDPROC g_oldWndProc = nullptr;

static LRESULT CALLBACK DropWndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    if (msg == WM_DROPFILES) {
        HDROP hDrop = (HDROP)wp;
        wchar_t path[MAX_PATH];
        if (DragQueryFileW(hDrop, 0, path, MAX_PATH) > 0) {
            int len = WideCharToMultiByte(CP_UTF8, 0, path, -1, nullptr, 0, nullptr, nullptr);
            if (len > 1) {
                std::string utf8(len - 1, '\0');
                WideCharToMultiByte(CP_UTF8, 0, path, -1, &utf8[0], len, nullptr, nullptr);
                dndLog("[WM_DROPFILES] " + utf8);
                if (g_dropWindow) g_dropWindow->dropFile(utf8);
            }
        }
        DragFinish(hDrop);
        return 0;
    }
    return CallWindowProcW(g_oldWndProc, hwnd, msg, wp, lp);
}

// ── 自研 OLE 拖放目标（绕开 FLTK 的 DPI 换算问题）─────────────────

class AupDropTarget : public IDropTarget {
public:
    explicit AupDropTarget(PacmanWindow* w) : win_(w) {}

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == IID_IUnknown || riid == IID_IDropTarget) {
            *ppv = this;
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++ref_; }
    ULONG STDMETHODCALLTYPE Release() override {
        ULONG r = --ref_;
        if (r == 0) delete this;
        return r;
    }

    HRESULT STDMETHODCALLTYPE DragEnter(IDataObject*, DWORD, POINTL, DWORD* pdwEffect) override {
        dndLog("[OLE] DragEnter accept");
        *pdwEffect = DROPEFFECT_COPY;
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE DragOver(DWORD, POINTL, DWORD* pdwEffect) override {
        *pdwEffect = DROPEFFECT_COPY;
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE DragLeave() override { return S_OK; }

    HRESULT STDMETHODCALLTYPE Drop(IDataObject* pData, DWORD, POINTL, DWORD*) override {
        dndLog("[OLE] Drop");
        FORMATETC fmt{};
        fmt.cfFormat = CF_HDROP;
        fmt.ptd = nullptr;
        fmt.dwAspect = DVASPECT_CONTENT;
        fmt.lindex = -1;
        fmt.tymed = TYMED_HGLOBAL;
        STGMEDIUM med{};
        if (pData && SUCCEEDED(pData->GetData(&fmt, &med))) {
            HDROP h = (HDROP)med.hGlobal;
            wchar_t path[MAX_PATH];
            if (DragQueryFileW(h, 0, path, MAX_PATH) > 0) {
                int len = WideCharToMultiByte(CP_UTF8, 0, path, -1, nullptr, 0, nullptr, nullptr);
                if (len > 1) {
                    std::string utf8(len - 1, '\0');
                    WideCharToMultiByte(CP_UTF8, 0, path, -1, &utf8[0], len, nullptr, nullptr);
                    dndLog("[OLE] path: " + utf8);
                    if (win_) win_->dropFile(utf8);
                }
            }
            ReleaseStgMedium(&med);
        } else {
            dndLog("[OLE] GetData(CF_HDROP) failed");
        }
        return S_OK;
    }

private:
    PacmanWindow* win_;
    ULONG ref_ = 1;
};

// ── 自绘控件 ──────────────────────────────

class DeepButton : public Fl_Button {
public:
    enum Style { Primary, Plain, Icon };
    DeepButton(int x, int y, int w, int h, const char* label, Style s)
        : Fl_Button(x, y, w, h, label), style_(s) {
        box(FL_NO_BOX);
        labelfont(FL_HELVETICA);
        labelsize(13);
    }

    int handle(int ev) override {
        if (ev == FL_ENTER) { hover_ = true; redraw(); return 1; }
        if (ev == FL_LEAVE) { hover_ = false; redraw(); return 1; }
        return Fl_Button::handle(ev);
    }

    void draw() override {
        bool on = active_r();
        if (style_ == Icon) {
            fl_draw_box(FL_FLAT_BOX, x(), y(), w(), h(),
                        on && hover_ ? C_HOVER : C_BG);
            fl_color(on ? C_TEXT : C_MUTED);
            fl_font(labelfont(), labelsize());
            fl_draw(label(), x(), y(), w(), h(), FL_ALIGN_CENTER);
            return;
        }
        if (style_ == Plain) {
            fl_draw_box(FL_ROUNDED_BOX, x(), y(), w(), h(),
                        on ? (hover_ ? C_HOVER : C_BTN) : C_BTN_DIS);
            fl_color(on ? C_TEXT : C_MUTED);
            fl_font(labelfont(), labelsize());
            fl_draw(label(), x(), y(), w(), h(), FL_ALIGN_CENTER);
            return;
        }
        // Primary：灰色底 + 蓝色圆角外描边；禁用：低对比深灰
        Fl_Color bg = on ? (hover_ ? C_HOVER : C_BTN) : C_BTN_DIS;
        Fl_Color fg = on ? C_TEXT : C_MUTED;
        if (on) {
            fl_draw_box(FL_ROUNDED_BOX, x(), y(), w(), h(), C_BLUE);
            fl_draw_box(FL_ROUNDED_BOX, x() + 2, y() + 2, w() - 4, h() - 4, bg);
        } else {
            fl_draw_box(FL_ROUNDED_BOX, x(), y(), w(), h(), bg);
        }
        fl_color(fg);
        fl_font(labelfont(), labelsize());
        fl_draw(label(), x(), y(), w(), h(), FL_ALIGN_CENTER);
    }

private:
    Style style_;
    bool hover_ = false;
};

class DeepTextButton : public Fl_Button {
public:
    DeepTextButton(int x, int y, int w, int h, const char* label)
        : Fl_Button(x, y, w, h, label) {
        box(FL_NO_BOX);
        labelfont(FL_HELVETICA);
        labelsize(13);
    }

    int handle(int ev) override {
        if (ev == FL_ENTER) { hover_ = true; redraw(); return 1; }
        if (ev == FL_LEAVE) { hover_ = false; redraw(); return 1; }
        return Fl_Button::handle(ev);
    }

    void draw() override {
        fl_color(active_r() ? (hover_ ? blendToWhite(C_BLUE, 0.35f) : C_BLUE) : C_MUTED);
        fl_font(labelfont(), labelsize());
        fl_draw(label(), x(), y(), w(), h(), FL_ALIGN_CENTER);
    }

private:
    bool hover_ = false;
};

// 自绘汉堡菜单按钮（三条横线，避免 ☰ 字形渲染不完整）
class HamburgerButton : public Fl_Button {
public:
    HamburgerButton(int x, int y, int w, int h) : Fl_Button(x, y, w, h, nullptr) {
        box(FL_FLAT_BOX);
        color(C_MENU);
    }

    int handle(int ev) override {
        if (ev == FL_ENTER) { hover_ = true; redraw(); return 1; }
        if (ev == FL_LEAVE) { hover_ = false; redraw(); return 1; }
        return Fl_Button::handle(ev);
    }

    void draw() override {
        fl_draw_box(FL_FLAT_BOX, x(), y(), w(), h(), hover_ ? C_HOVER : C_BG);
        fl_color(active_r() ? C_TEXT : C_MUTED);
        int cx = x() + w() / 2;
        int cy = y() + h() / 2;
        int lw = 13;
        fl_rectf(cx - lw / 2, cy - 8, lw, 3);
        fl_rectf(cx - lw / 2, cy - 1, lw, 3);
        fl_rectf(cx - lw / 2, cy + 6, lw, 3);
    }

private:
    bool hover_ = false;
};

// Deepin 风格开关：圆角轨道 + 圆形滑块
class ToggleSwitch : public Fl_Widget {
public:
    ToggleSwitch(int x, int y, int w, int h) : Fl_Widget(x, y, w, h) { box(FL_NO_BOX); }

    bool on = false;

    int handle(int ev) override {
        if (ev == FL_PUSH && Fl::event_button() == 1) {
            if (!active_r()) return 1;
            on = !on;
            redraw();
            do_callback();
            return 1;
        }
        return 0;
    }

    void draw() override {
        fl_draw_box(FL_ROUNDED_BOX, x(), y(), w(), h(), on ? C_ACCENT : C_TRACK);
        int k = h() - 8;
        int kx = on ? x() + w() - k - 4 : x() + 4;
        fl_color(C_TEXT);
        fl_pie(kx, y() + 4, k, k, 0.0, 360.0);
    }
};

class IconWidget : public Fl_Widget {
public:
    IconWidget(int x, int y, int w, int h) : Fl_Widget(x, y, w, h) {}
    ~IconWidget() override { delete img_; delete[] owned_; }

    void setImage(Fl_Image* img, uchar* owned) {
        delete img_;
        delete[] owned_;
        img_ = img;
        owned_ = owned;
        redraw();
    }

    void draw() override {
        if (img_) {
            img_->draw(x(), y(), w(), h());
            return;
        }
        fl_draw_box(FL_ROUNDED_BOX, x(), y(), w(), h(), C_ACCENT);
        fl_color(C_TEXT);
        fl_rectf(x() + w() / 2 - 2, y() + 14, 4, 10);   // 提手
        fl_rectf(x() + 16, y() + 20, w() - 32, 12);      // 盖子
        fl_rectf(x() + 20, y() + 30, w() - 40, h() - 40);// 箱体
    }

private:
    Fl_Image* img_ = nullptr;
    uchar* owned_ = nullptr;
};

// 下载方块图标：灰色线框箱 + 向下箭头
class DownloadGlyph : public Fl_Widget {
public:
    DownloadGlyph(int x, int y, int w, int h, bool big = false)
        : Fl_Widget(x, y, w, h), big_(big) {}

    void draw() override {
        fl_color(C_ICON_GRAY);
        int inset = big_ ? 10 : 3;
        fl_rect(x() + inset, y() + inset, w() - inset * 2, h() - inset * 2 - 3);
        int cx = x() + w() / 2;
        int top = y() + inset + (big_ ? 12 : 5);
        int bottom = y() + h() - inset - 3 - (big_ ? 6 : 3);
        fl_line(cx, top, cx, bottom);
        fl_line(cx, bottom, cx - (big_ ? 5 : 3), bottom - (big_ ? 6 : 3));
        fl_line(cx, bottom, cx + (big_ ? 5 : 3), bottom - (big_ ? 6 : 3));
    }

private:
    bool big_;
};

class DashLine : public Fl_Widget {
public:
    DashLine(int x, int y, int w, int h) : Fl_Widget(x, y, w, h) {}
    void draw() override {
        fl_color(C_DASH);
        for (int xx = x(); xx + 5 <= x() + w(); xx += 9)
            fl_rectf(xx, y(), 5, h());
    }
};

class ProgressBar : public Fl_Widget {
public:
    ProgressBar(int x, int y, int w, int h) : Fl_Widget(x, y, w, h) {}
    void setValue(double v) {
        v = v < 0 ? 0 : (v > 1 ? 1 : v);
        if (v != value_) { value_ = v; redraw(); }
    }
    void draw() override {
        fl_draw_box(FL_ROUNDED_BOX, x(), y(), w(), h(), C_TRACK);
        if (value_ > 0.001) {
            int fw = (int)((w() - 4) * value_);
            if (fw < 2) fw = 2;
            fl_draw_box(FL_ROUNDED_BOX, x() + 2, y() + 2, fw, h() - 4, C_ACCENT);
        }
    }
private:
    double value_ = 0.0;
};

// 清理缓存时的加载圈（旋转的蓝色弧线）
class Spinner : public Fl_Widget {
public:
    Spinner(int x, int y, int w, int h) : Fl_Widget(x, y, w, h) { box(FL_NO_BOX); }
    float angle_ = 0.0f;
    void draw() override {
        fl_line_style(FL_SOLID, 3);
        fl_color(C_TRACK);
        fl_arc(x(), y(), w(), h(), 0.0, 360.0);
        fl_color(C_ACCENT);
        fl_arc(x(), y(), w(), h(), angle_, angle_ + 100.0);
        fl_line_style(FL_SOLID, 0);
    }
    int handle(int) override { return 0; }
};

// ── 主窗口 ──────────────────────────────────

PacmanWindow::PacmanWindow()
    : Fl_Window(440, 380, "包管理器"), paths_(findApmPaths()) {
    box(FL_FLAT_BOX);
    color(C_BG);
    clear_border();
    Fl::set_color(FL_SELECTION_COLOR, 0x00, 0x78, 0xd4);

    // 标题栏：左侧 pacman.ico；右侧 最小化 关闭
    {
        IconResult titleIcon = loadIconImageSize(exeDirUtf8() + "\\pacman.ico", 22);
        titleIconImg_ = titleIcon.img;
        titleIconPix_ = titleIcon.owned;
        if (titleIconImg_) {
            auto* box = new Fl_Box(16, 11, 22, 22);
            box->image(titleIconImg_);
        } else {
            new DownloadGlyph(16, 11, 22, 22);  // 回退：自绘下载方块
        }
    }

    hamburger_ = new HamburgerButton(440 - 112, 8, 28, 28);
    hamburger_->callback(hamburger_cb, this);

    minBtn_ = new DeepButton(440 - 76, 8, 28, 28, "—", DeepButton::Icon);
    minBtn_->callback(min_cb, this);
    minBtn_->labelsize(14);

    closeBtn_ = new DeepButton(440 - 40, 8, 28, 28, "×", DeepButton::Icon);
    closeBtn_->callback(close_cb, this);
    closeBtn_->labelsize(18);

    // 首页
    homeIcon_ = new DownloadGlyph(172, 96, 96, 96, true);
    homeHint_ = new Fl_Box(0, 212, 440, 20, "拖拽软件包到此");
    homeHint_->box(FL_NO_BOX);
    homeHint_->align(FL_ALIGN_CENTER | FL_ALIGN_INSIDE);
    homeHint_->labelfont(FL_HELVETICA);
    homeHint_->labelsize(13);
    homeHint_->labelcolor(C_SECONDARY);

    dashLine_ = new DashLine(140, 250, 160, 2);

    chooseBtn_ = new DeepButton(160, 282, 120, 34, "选择文件", DeepButton::Primary);
    chooseBtn_->callback(choose_cb, this);

    homeStatus_ = new Fl_Box(0, 330, 440, 20);
    homeStatus_->box(FL_NO_BOX);
    homeStatus_->align(FL_ALIGN_CENTER | FL_ALIGN_INSIDE);
    homeStatus_->labelfont(FL_HELVETICA);
    homeStatus_->labelsize(12);
    homeStatus_->labelcolor(C_RED);
    homeStatus_->hide();

    // 预览页
    pkgIcon_ = new IconWidget(34, 70, 56, 56);
    pkgName_ = new Fl_Box(100, 72, 320, 26);
    pkgName_->box(FL_NO_BOX);
    pkgName_->align(FL_ALIGN_LEFT | FL_ALIGN_INSIDE);
    pkgName_->labelfont(FL_HELVETICA);
    pkgName_->labelsize(16);
    pkgName_->labelcolor(C_TEXT);

    pkgVersion_ = new Fl_Box(100, 100, 320, 18);
    pkgVersion_->box(FL_NO_BOX);
    pkgVersion_->align(FL_ALIGN_LEFT | FL_ALIGN_INSIDE);
    pkgVersion_->labelfont(FL_HELVETICA);
    pkgVersion_->labelsize(12);
    pkgVersion_->labelcolor(C_MUTED);

    pkgDesc_ = new Fl_Box(34, 138, 372, 74);
    pkgDesc_->box(FL_NO_BOX);
    pkgDesc_->align(FL_ALIGN_LEFT | FL_ALIGN_WRAP | FL_ALIGN_INSIDE);
    pkgDesc_->labelfont(FL_HELVETICA);
    pkgDesc_->labelsize(12);
    pkgDesc_->labelcolor(C_SECONDARY);

    warnBox_ = new Fl_Box(0, 220, 440, 20);
    warnBox_->box(FL_NO_BOX);
    warnBox_->align(FL_ALIGN_CENTER | FL_ALIGN_INSIDE);
    warnBox_->labelfont(FL_HELVETICA);
    warnBox_->labelsize(13);
    warnBox_->labelcolor(C_RED);

    uninstallBtn_ = new DeepButton(128, 322, 84, 34, "卸载", DeepButton::Primary);
    uninstallBtn_->callback(uninstall_cb, this);

    mainBtn_ = new DeepButton(224, 322, 96, 34, "安装", DeepButton::Primary);
    mainBtn_->callback(install_cb, this);

    // 日志页
    toggleLogBtn_ = new DeepTextButton(0, 288, 440, 18, "⌄ 显示详细信息");
    toggleLogBtn_->callback(toggle_log_cb, this);

    logBuf_ = new Fl_Text_Buffer();
    logView_ = new Fl_Text_Display(24, 88, 392, 196);
    logView_->buffer(logBuf_);
    logView_->box(FL_ROUNDED_BOX);
    logView_->color(C_PANEL);
    logView_->textcolor(C_LOG_TEXT);
    logView_->textsize(12);
    logView_->textfont(FL_HELVETICA);

    progress_ = new ProgressBar(24, 310, 392, 8);

    finishBox_ = new Fl_Box(0, 332, 440, 20);
    finishBox_->box(FL_NO_BOX);
    finishBox_->align(FL_ALIGN_CENTER | FL_ALIGN_INSIDE);
    finishBox_->labelfont(FL_HELVETICA);
    finishBox_->labelsize(12);
    finishBox_->labelcolor(C_TEXT);
    finishBox_->hide();

    doneBtn_ = new DeepButton(160, 306, 120, 34, "完成", DeepButton::Primary);
    doneBtn_->callback(done_cb, this);
    doneBtn_->hide();

    cleaningSpinner_ = new Spinner(206, 200, 28, 28);
    cleaningSpinner_->hide();
    cleaningLabel_ = new Fl_Box(0, 242, 440, 20, "正在清理缓存…");
    cleaningLabel_->box(FL_NO_BOX);
    cleaningLabel_->align(FL_ALIGN_CENTER | FL_ALIGN_INSIDE);
    cleaningLabel_->labelfont(FL_HELVETICA);
    cleaningLabel_->labelsize(13);
    cleaningLabel_->labelcolor(C_SECONDARY);
    cleaningLabel_->hide();

    // 文件选择器（Win32 风格：地址栏 + 列表 + 底部按钮）
    browseAddr_ = new Fl_Box(20, 54, 400, 22);
    browseAddr_->box(FL_NO_BOX);
    browseAddr_->align(FL_ALIGN_LEFT | FL_ALIGN_INSIDE);
    browseAddr_->labelfont(FL_HELVETICA);
    browseAddr_->labelsize(12);
    browseAddr_->labelcolor(C_SECONDARY);
    browseAddr_->hide();

    browseList_ = new Fl_Select_Browser(24, 82, 392, 208);
    browseList_->box(FL_ROUNDED_BOX);
    browseList_->color(C_PANEL);
    browseList_->textcolor(C_TEXT);
    browseList_->textsize(13);
    browseList_->textfont(FL_HELVETICA);
    browseList_->when(FL_WHEN_RELEASE_ALWAYS);
    browseList_->callback(browse_list_cb, this);
    browseList_->hide();

    browseUpBtn_ = new DeepButton(24, 302, 84, 34, "上一级", DeepButton::Plain);
    browseUpBtn_->callback(browse_up_cb, this);
    browseUpBtn_->hide();

    browseCancelBtn_ = new DeepButton(250, 302, 80, 34, "取消", DeepButton::Plain);
    browseCancelBtn_->callback(browse_cancel_cb, this);
    browseCancelBtn_->hide();

    browseOpenBtn_ = new DeepButton(336, 302, 80, 34, "打开", DeepButton::Primary);
    browseOpenBtn_->callback(browse_open_cb, this);
    browseOpenBtn_->deactivate();
    browseOpenBtn_->hide();

    // 菜单覆盖页（汉堡菜单）：覆盖整个内容区
    menuPanel_ = new Fl_Box(0, 44, 440, 336);
    menuPanel_->box(FL_FLAT_BOX);
    menuPanel_->color(C_MENU);
    menuPanel_->hide();

    menuTitle_ = new Fl_Box(24, 60, 120, 26, "菜单");
    menuTitle_->box(FL_NO_BOX);
    menuTitle_->align(FL_ALIGN_LEFT | FL_ALIGN_INSIDE);
    menuTitle_->labelfont(FL_HELVETICA);
    menuTitle_->labelsize(16);
    menuTitle_->labelcolor(C_TEXT);
    menuTitle_->hide();

    Fl_Box* assocLabel = new Fl_Box(24, 116, 260, 28, "自动关联 .aup 文件");
    assocLabel->box(FL_NO_BOX);
    assocLabel->align(FL_ALIGN_LEFT | FL_ALIGN_INSIDE);
    assocLabel->labelfont(FL_HELVETICA);
    assocLabel->labelsize(14);
    assocLabel->labelcolor(C_TEXT);
    assocLabel->hide();

    assocSwitch_ = new ToggleSwitch(336, 117, 72, 26);
    assocSwitch_->callback(assoc_switch_cb, this);
    assocSwitch_->hide();

    assocHint_ = new Fl_Box(24, 146, 392, 18, "开启后，双击 .aup 文件将直接用包管理器打开");
    assocHint_->box(FL_NO_BOX);
    assocHint_->align(FL_ALIGN_LEFT | FL_ALIGN_INSIDE);
    assocHint_->labelfont(FL_HELVETICA);
    assocHint_->labelsize(12);
    assocHint_->labelcolor(C_SECONDARY);
    assocHint_->hide();

    Fl_Box* menuDivider = new Fl_Box(24, 190, 392, 1);
    menuDivider->box(FL_FLAT_BOX);
    menuDivider->color(C_DASH);
    menuDivider->hide();

    Fl_Box* menuAppName = new Fl_Box(24, 216, 200, 26, "包管理器");
    menuAppName->box(FL_NO_BOX);
    menuAppName->align(FL_ALIGN_LEFT | FL_ALIGN_INSIDE);
    menuAppName->labelfont(FL_HELVETICA);
    menuAppName->labelsize(14);
    menuAppName->labelcolor(C_TEXT);
    menuAppName->hide();

    menuVersion_ = new Fl_Box(24, 244, 260, 18, "");
    menuVersion_->box(FL_NO_BOX);
    menuVersion_->align(FL_ALIGN_LEFT | FL_ALIGN_INSIDE);
    menuVersion_->labelfont(FL_HELVETICA);
    menuVersion_->labelsize(12);
    menuVersion_->labelcolor(C_MUTED);
    menuVersion_->copy_label((std::string("版本 ") + kAppVersion).c_str());
    menuVersion_->hide();

    menuBackBtn_ = new DeepButton(160, 318, 120, 34, "返回", DeepButton::Plain);
    menuBackBtn_->callback(hamburger_cb, this);
    menuBackBtn_->hide();

    end();
    resizable(nullptr);

    showHome();
    if (!paths_.valid) {
        homeStatus_->label(paths_.error.c_str());
        homeStatus_->show();
    }

    // 启动时按开关绑定/解绑 .aup 文件关联
    applyAupAssociation(paths_.assocAup);
}

PacmanWindow::~PacmanWindow() {
    cleanupTemp();
    if (titleIconImg_) delete titleIconImg_;
    if (titleIconPix_) delete[] titleIconPix_;
}

void PacmanWindow::show() {
    Fl_Window::show();
    HWND hwnd = fl_xid(this);
    if (!hwnd) return;
    // 无边框窗口强制为应用窗口：出现在任务栏、最小化恢复正常
    LONG_PTR ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    ex &= ~WS_EX_TOOLWINDOW;
    ex |= WS_EX_APPWINDOW;
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
    // 接收文件拖放
    DragAcceptFiles(hwnd, TRUE);
    // 撤销 FLTK 自带的 OLE 拖放目标，换成我们自己的（规避 DPI 换算导致拖放无效）
    static bool oleInited = false;
    if (!oleInited) {
        HRESULT hr = OleInitialize(nullptr);  // 进程内只需一次；重复调用会返回 S_FALSE
        dndLog(std::string("[OLE] OleInitialize hr=0x") + [&] {
            char b[16];
            sprintf(b, "%08X", (unsigned)hr);
            return std::string(b);
        }());
        oleInited = true;
    }
    HRESULT hrRevoke = RevokeDragDrop(hwnd);
    dndLog(std::string("[OLE] RevokeDragDrop hr=0x") + [&] {
        char b[16];
        sprintf(b, "%08X", (unsigned)hrRevoke);
        return std::string(b);
    }());
    static AupDropTarget* dropTarget = nullptr;
    if (!dropTarget) dropTarget = new AupDropTarget(this);
    HRESULT hrReg = RegisterDragDrop(hwnd, dropTarget);
    dndLog(std::string("[OLE] RegisterDragDrop hr=0x") + [&] {
        char b[16];
        sprintf(b, "%08X", (unsigned)hrReg);
        return std::string(b);
    }());
    if (!g_oldWndProc) {
        g_dropWindow = this;
        g_oldWndProc = (WNDPROC)GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
        SetWindowLongPtrW(hwnd, GWLP_WNDPROC, (LONG_PTR)DropWndProc);
    }
    // 圆角窗口：按真实像素尺寸裁切（兼容显示缩放）
    RECT r;
    if (GetWindowRect(hwnd, &r)) {
        int rw = r.right - r.left;
        int rh = r.bottom - r.top;
        double s = w() > 0 ? (double)rw / w() : 1.0;
        HRGN rgn = CreateRoundRectRgn(0, 0, rw + 1, rh + 1,
                                      (int)(14 * s + 0.5), (int)(14 * s + 0.5));
        if (rgn) SetWindowRgn(hwnd, rgn, TRUE);
    }
}

int PacmanWindow::handle(int ev) {
    // 文件拖拽（.aup）
    if (ev == FL_DND_ENTER || ev == FL_DND_DRAG || ev == FL_DND_RELEASE) return 1;
    if (ev == FL_PASTE) {
        const char* t = Fl::event_text();
        openDroppedPath(t ? t : "");
        return 1;
    }
    // 标题栏拖拽移动
    if (ev == FL_PUSH && Fl::event_button() == 1 && Fl::event_y() <= 44 &&
        Fl::event_x() <= 440 - 116) {
        dragging_ = true;
        dragDX_ = Fl::event_x_root() - x();
        dragDY_ = Fl::event_y_root() - y();
        return 1;
    }
    if (ev == FL_DRAG && dragging_) {
        position(Fl::event_x_root() - dragDX_, Fl::event_y_root() - dragDY_);
        return 1;
    }
    if (ev == FL_RELEASE && dragging_) {
        dragging_ = false;
        return 1;
    }
    return Fl_Window::handle(ev);
}

void PacmanWindow::close_cb(Fl_Widget*, void* d) { ((PacmanWindow*)d)->hide(); }

void PacmanWindow::min_cb(Fl_Widget*, void* d) { ((PacmanWindow*)d)->iconize(); }

void PacmanWindow::install_cb(Fl_Widget*, void* d) {
    auto* w = (PacmanWindow*)d;
    if (!w->busy_) w->startInstall();
}

void PacmanWindow::uninstall_cb(Fl_Widget*, void* d) {
    auto* w = (PacmanWindow*)d;
    if (!w->busy_) w->startUninstall();
}

void PacmanWindow::toggle_log_cb(Fl_Widget*, void* d) {
    auto* w = (PacmanWindow*)d;
    w->showLog(!w->logExpanded_);
}

void PacmanWindow::done_cb(Fl_Widget*, void* d) { ((PacmanWindow*)d)->finishDone(); }

void PacmanWindow::choose_cb(Fl_Widget*, void* d) { ((PacmanWindow*)d)->showBrowse(); }

void PacmanWindow::hamburger_cb(Fl_Widget*, void* d) {
    auto* w = (PacmanWindow*)d;
    if (w->busy_) return;
    w->showMenuOverlay(w->view_ != View::Menu);
}

void PacmanWindow::assoc_switch_cb(Fl_Widget*, void* d) {
    ((PacmanWindow*)d)->toggleAssocAup();
}

void PacmanWindow::toggleAssocAup() {
    bool on = !paths_.assocAup;
    paths_.assocAup = on;
    saveAssocAup(paths_, on);
    applyAupAssociation(on);
    if (assocSwitch_) {
        assocSwitch_->on = on;
        assocSwitch_->redraw();
    }
}

void PacmanWindow::showMenuOverlay(bool open) {
    if (open) {
        if (busy_) return;
        viewBeforeMenu_ = view_;
        view_ = View::Menu;

        // 隐藏所有页面控件
        homeIcon_->hide();
        homeHint_->hide();
        dashLine_->hide();
        chooseBtn_->hide();
        homeStatus_->hide();
        pkgIcon_->hide();
        pkgName_->hide();
        pkgVersion_->hide();
        pkgDesc_->hide();
        warnBox_->hide();
        uninstallBtn_->hide();
        mainBtn_->hide();
        toggleLogBtn_->hide();
        logView_->hide();
        progress_->hide();
        finishBox_->hide();
        doneBtn_->hide();
        cleaningSpinner_->hide();
        cleaningLabel_->hide();
        browseAddr_->hide();
        browseList_->hide();
        browseUpBtn_->hide();
        browseCancelBtn_->hide();
        browseOpenBtn_->hide();

        assocSwitch_->on = paths_.assocAup;
        menuPanel_->show();
        menuTitle_->show();
        assocSwitch_->show();
        assocHint_->show();
        menuVersion_->show();
        menuBackBtn_->show();
        redraw();
    } else {
        hideMenuOverlay();
        switch (viewBeforeMenu_) {
            case View::Preview: showPreview(); break;
            case View::Log: showLog(logExpanded_); break;
            case View::Browse: showBrowse(); break;
            default: showHome(); break;
        }
    }
}

void PacmanWindow::hideMenuOverlay() {
    if (!menuPanel_) return;
    menuPanel_->hide();
    menuTitle_->hide();
    assocSwitch_->hide();
    assocHint_->hide();
    menuVersion_->hide();
    menuBackBtn_->hide();
}

void PacmanWindow::browse_up_cb(Fl_Widget*, void* d) {
    auto* w = (PacmanWindow*)d;
    w->browseGoUp();
}

void PacmanWindow::browse_cancel_cb(Fl_Widget*, void* d) {
    auto* w = (PacmanWindow*)d;
    w->leaveBrowse();
    w->showHome();
}

void PacmanWindow::browse_open_cb(Fl_Widget*, void* d) {
    auto* w = (PacmanWindow*)d;
    w->browseActivate();
}

void PacmanWindow::browse_list_cb(Fl_Widget*, void* d) {
    ((PacmanWindow*)d)->onBrowseList();
}

void PacmanWindow::showHome() {
    view_ = View::Home;
    hideMenuOverlay();
    homeIcon_->show();
    homeHint_->show();
    dashLine_->show();
    chooseBtn_->show();
    pkgIcon_->hide();
    pkgName_->hide();
    pkgVersion_->hide();
    pkgDesc_->hide();
    warnBox_->hide();
    uninstallBtn_->hide();
    mainBtn_->hide();
    doneBtn_->hide();
    toggleLogBtn_->hide();
    logView_->hide();
    progress_->hide();
    finishBox_->hide();
    browseAddr_->hide();
    browseList_->hide();
    browseUpBtn_->hide();
    browseCancelBtn_->hide();
    browseOpenBtn_->hide();
    if (!homeStatus_->label() || !*homeStatus_->label()) homeStatus_->hide();
    else homeStatus_->show();
    redraw();
}

void PacmanWindow::showPreview() {
    view_ = View::Preview;
    hideMenuOverlay();

    // 图标：包内与 icon/exe 同名的文件，否则默认图标
    std::string cand;
    for (auto& p : { pkg_.iconPath, pkg_.exePath }) {
        if (p.empty()) continue;
        std::string c = tempDir_ + "\\" + baseName(p);
        if (fileExistsUtf8(c)) {
            cand = c;
            break;
        }
    }
    IconResult ir = cand.empty() ? IconResult{} : loadIconImage(cand);
    if (!ir.img) ir = loadDefaultIcon();
    pkgIcon_->setImage(ir.img, ir.owned);

    pkgName_->copy_label((pkg_.displayName.empty() ? pkg_.pkgName : pkg_.displayName).c_str());
    pkgVersion_->copy_label(("版本: " + pkg_.version).c_str());
    pkgDesc_->copy_label(pkg_.description.empty() ? "（无介绍）" : pkg_.description.c_str());

    switch (mode_) {
        case InstallMode::Fresh:
            warnBox_->label("");
            warnBox_->hide();
            uninstallBtn_->hide();
            mainBtn_->label("安装");
            mainBtn_->resize(160, 322, 120, 34);
            break;
        case InstallMode::Reinstall:
            warnBox_->label("已安装相同版本");
            warnBox_->show();
            uninstallBtn_->show();
            mainBtn_->label("重新安装");
            mainBtn_->resize(224, 322, 96, 34);
            break;
        case InstallMode::Update:
            warnBox_->copy_label(("已安装较早的版本: " + installedVer_).c_str());
            warnBox_->show();
            uninstallBtn_->show();
            mainBtn_->label("更新");
            mainBtn_->resize(224, 322, 96, 34);
            break;
        case InstallMode::Downgrade:
            warnBox_->copy_label(("已安装较新的版本: " + installedVer_).c_str());
            warnBox_->show();
            uninstallBtn_->show();
            mainBtn_->label("安装旧版本");
            mainBtn_->resize(204, 322, 116, 34);
            break;
        default:
            break;
    }

    homeIcon_->hide();
    homeHint_->hide();
    dashLine_->hide();
    chooseBtn_->hide();
    homeStatus_->hide();
    pkgIcon_->show();
    pkgName_->show();
    pkgVersion_->show();
    pkgDesc_->show();
    mainBtn_->show();
    toggleLogBtn_->hide();
    logView_->hide();
    progress_->hide();
    if (!finished_) finishBox_->hide();
    browseAddr_->hide();
    browseList_->hide();
    browseUpBtn_->hide();
    browseCancelBtn_->hide();
    browseOpenBtn_->hide();
    redraw();
}

void PacmanWindow::showLog(bool expanded) {
    view_ = View::Log;
    hideMenuOverlay();
    logExpanded_ = expanded;
    toggleLogBtn_->label(expanded ? "⌃ 收起" : "⌄ 显示详细信息");
    if (finished_) {
        progress_->hide();
        doneBtn_->show();
        toggleLogBtn_->hide();  // 完成后底部让位给“完成”按钮
    } else {
        progress_->show();
        doneBtn_->hide();
        toggleLogBtn_->show();
    }
    homeIcon_->hide();
    homeHint_->hide();
    dashLine_->hide();
    chooseBtn_->hide();
    homeStatus_->hide();
    uninstallBtn_->hide();
    mainBtn_->hide();
    browseAddr_->hide();
    browseList_->hide();
    browseUpBtn_->hide();
    browseCancelBtn_->hide();
    browseOpenBtn_->hide();
    if (expanded) {
        pkgIcon_->hide();
        pkgName_->hide();
        pkgVersion_->hide();
        pkgDesc_->hide();
        warnBox_->hide();
        logView_->show();
    } else {
        pkgIcon_->show();
        pkgName_->show();
        pkgVersion_->show();
        pkgDesc_->show();
        warnBox_->show();
        logView_->hide();
    }
    if (!finished_) finishBox_->hide();
    redraw();
}

void PacmanWindow::openDroppedPath(const std::string& raw) {
    // 可能是 text/uri-list（多行），取第一行
    std::string p = raw;
    size_t nl = p.find_first_of("\r\n");
    if (nl != std::string::npos) p = p.substr(0, nl);
    while (!p.empty() && (p.back() == '\r' || p.back() == '\n' || p.back() == ' '))
        p.pop_back();
    if (!p.empty() && p.front() == '"' && p.back() == '"') {
        p = p.substr(1, p.size() - 2);
    }
    p = uriToPath(p);
    if (p.empty()) return;
    dndLog("[openDroppedPath] " + p);
    if (!endsWithIgnoreCase(p, ".aup")) {
        dndLog("[openDroppedPath] rejected: not .aup");
        homeStatus_->label("只支持 .aup 包文件");
        homeStatus_->show();
        showHome();
        return;
    }
    openAupFile(p);
    dndLog("[openDroppedPath] ok");
}

void PacmanWindow::dropFile(const std::string& path) {
    // 不能在 OLE 拖放回调里直接做 UI 工作（重入/阻塞会导致程序卡死），
    // 先入队，等事件循环恢复后再处理。
    pendingDrop_ = path;
    Fl::awake(process_drop_cb, this);
}

void PacmanWindow::process_drop_cb(void* d) {
    auto* w = (PacmanWindow*)d;
    if (!w) return;
    std::string p;
    std::swap(p, w->pendingDrop_);
    if (!p.empty()) w->openDroppedPath(p);
}

void PacmanWindow::openAupFile(const std::string& path) {
    if (busy_) return;
    leaveBrowse();  // 若正处于文件选择器，先退出
    if (!fileExistsUtf8(path)) {
        homeStatus_->labelcolor(C_RED);
        homeStatus_->copy_label(("文件不存在：" + path).c_str());
        homeStatus_->show();
        showHome();
        return;
    }

    // 旧 pactemp 交给后台线程删除，避免在 UI 线程同步删大目录卡死
    std::string oldTemp;
    std::swap(oldTemp, tempDir_);

    // 后台线程执行：删旧缓存 → amsys 管道解析 /tmp → pactemp 解压 → 读 aminfo.ini + .app
    busy_ = true;
    finished_ = false;
    setBusy(true);
    homeStatus_->labelcolor(C_SECONDARY);
    homeStatus_->label("正在解析 .aup 包…");
    homeStatus_->show();
    showHome();

    previewOp_ = std::make_shared<PreviewState>();
    auto op = previewOp_;
    ApmPaths paths = paths_;
    std::thread([paths, path, op, oldTemp]() {
        if (!oldTemp.empty()) removeDirectoryRecursive(oldTemp);
        AupPreview r = previewAup(paths, path);
        std::lock_guard<std::mutex> lk(op->m);
        op->r = std::move(r);
        op->done = true;
    }).detach();
    Fl::add_timeout(0.1, poll_preview, this);
}

void PacmanWindow::poll_preview(void* d) {
    auto* w = (PacmanWindow*)d;
    auto op = w->previewOp_;
    if (!op) return;
    bool done = false;
    AupPreview r;
    {
        std::lock_guard<std::mutex> lk(op->m);
        done = op->done;
        if (done) r = std::move(op->r);
    }
    if (done) {
        w->previewOp_.reset();
        w->applyPreview(r);
        return;
    }
    Fl::repeat_timeout(0.1, poll_preview, w);
}

void PacmanWindow::applyPreview(const AupPreview& r) {
    busy_ = false;
    setBusy(false);
    if (!r.ok) {
        homeStatus_->labelcolor(C_RED);
        homeStatus_->copy_label(r.error.empty() ? "无法读取 .aup 包" : r.error.c_str());
        homeStatus_->show();
        showHome();
        return;
    }
    tempDir_ = r.tempDir;
    pkg_ = r.pkg;

    // 判定安装模式：全新 / 同版本重装 / 更新 / 降级
    installedVer_.clear();
    for (auto& ip : listInstalledPackages(paths_))
        if (ip.pkgName == pkg_.pkgName) { installedVer_ = ip.version; break; }
    if (installedVer_.empty())
        mode_ = InstallMode::Fresh;
    else {
        int cmp = compareVersions(pkg_.version, installedVer_);
        if (cmp == 0) mode_ = InstallMode::Reinstall;
        else if (cmp > 0) mode_ = InstallMode::Update;
        else mode_ = InstallMode::Downgrade;
    }
    homeStatus_->hide();
    showPreview();
}

void PacmanWindow::startInstall() {
    if (busy_ || pkg_.sourceAup.empty()) return;
    busy_ = true;
    finished_ = false;
    setBusy(true);
    logBuf_->text("");
    finishBox_->hide();
    progressValue_ = 0.0;
    progress_->setValue(0.0);
    showLog(false);  // 默认收起日志

    op_ = std::make_shared<OpState>();
    ApmPaths paths = paths_;
    std::string aup = pkg_.sourceAup;
    auto op = op_;
    std::thread([paths, aup, op]() {
        auto r = runApm(paths, {"install", aup}, [op](const std::string& line) {
            std::lock_guard<std::mutex> lk(op->m);
            op->lines.push_back(line);
        });
        std::lock_guard<std::mutex> lk(op->m);
        op->result = r;
        op->finished = true;
    }).detach();
    Fl::add_timeout(0.05, tick_progress, this);
    Fl::add_timeout(0.1, poll_op, this);
}

void PacmanWindow::startUninstall() {
    if (busy_ || pkg_.pkgName.empty()) return;
    busy_ = true;
    finished_ = false;
    setBusy(true);
    logBuf_->text("");
    finishBox_->hide();
    progressValue_ = 0.0;
    progress_->setValue(0.0);
    showLog(false);  // 默认收起日志

    op_ = std::make_shared<OpState>();
    ApmPaths paths = paths_;
    std::string name = pkg_.pkgName;
    auto op = op_;
    std::thread([paths, name, op]() {
        auto r = runApm(paths, {"uninstall", name}, [op](const std::string& line) {
            std::lock_guard<std::mutex> lk(op->m);
            op->lines.push_back(line);
        });
        std::lock_guard<std::mutex> lk(op->m);
        op->result = r;
        op->finished = true;
    }).detach();
    Fl::add_timeout(0.05, tick_progress, this);
    Fl::add_timeout(0.1, poll_op, this);
}

void PacmanWindow::tick_progress(void* d) {
    auto* w = (PacmanWindow*)d;
    if (!w->busy_) return;
    if (w->progressValue_ < 0.85) {
        w->progressValue_ += 0.012;
        w->progress_->setValue(w->progressValue_);
    }
    Fl::repeat_timeout(0.05, tick_progress, w);
}

void PacmanWindow::poll_op(void* d) {
    auto* w = (PacmanWindow*)d;
    auto op = w->op_;
    if (!op) return;
    std::vector<std::string> lines;
    bool finished = false;
    ApmResult res;
    {
        std::lock_guard<std::mutex> lk(op->m);
        lines.swap(op->lines);
        finished = op->finished;
        res = op->result;
    }
    for (auto& ln : lines) w->logBuf_->append((ln + "\n").c_str());
    w->logView_->insert_position(w->logBuf_->length());
    w->logView_->show_insert_position();
    if (finished) {
        w->finishOp(res);
        return;
    }
    Fl::repeat_timeout(0.1, poll_op, w);
}

void PacmanWindow::finishOp(const ApmResult& r) {
    busy_ = false;
    finished_ = true;
    setBusy(false);
    std::string detail = lastNonEmptyLine(r.output);
    if (detail.empty()) detail = r.error;
    if (detail.empty()) detail = r.success() ? "完成" : "未知错误";
    progress_->hide();
    if (r.success()) {
        // 完成界面：进度条位置换成“完成”按钮
        finishBox_->hide();
        doneBtn_->resize(160, 306, 120, 34);
        doneBtn_->show();
    } else {
        finishBox_->resize(0, 300, 440, 20);
        finishBox_->copy_label(("✗ 失败：" + detail).c_str());
        finishBox_->labelcolor(C_RED);
        finishBox_->show();
        doneBtn_->resize(160, 324, 120, 32);
        doneBtn_->show();
    }
    op_.reset();
    redraw();
}

void PacmanWindow::finishDone() {
    finished_ = false;
    doneBtn_->hide();
    finishBox_->hide();
    showCleaning();
}

void PacmanWindow::showCleaning() {
    view_ = View::Cleaning;
    hideMenuOverlay();
    cleaning_ = true;
    busy_ = true;          // 清理期间忽略新拖放
    setBusy(true);         // 禁用关闭/最小化等按钮

    // 隐藏所有页面控件，只留加载圈 + 提示文字
    homeIcon_->hide();
    homeHint_->hide();
    dashLine_->hide();
    chooseBtn_->hide();
    homeStatus_->hide();
    pkgIcon_->hide();
    pkgName_->hide();
    pkgVersion_->hide();
    pkgDesc_->hide();
    warnBox_->hide();
    uninstallBtn_->hide();
    mainBtn_->hide();
    toggleLogBtn_->hide();
    logView_->hide();
    progress_->hide();
    finishBox_->hide();
    doneBtn_->hide();
    browseAddr_->hide();
    browseList_->hide();
    browseUpBtn_->hide();
    browseCancelBtn_->hide();
    browseOpenBtn_->hide();
    cleaningSpinner_->show();
    cleaningLabel_->show();
    redraw();

    Fl::add_timeout(0.05, spin_tick, this);

    // 后台线程删除 pactemp，完成后回到主线程关程序
    std::string dir;
    std::swap(dir, tempDir_);
    std::thread([dir, this]() {
        removeDirectoryRecursive(dir);
        Fl::awake(cleaning_done_cb, this);
    }).detach();
}

void PacmanWindow::spin_tick(void* d) {
    auto* w = (PacmanWindow*)d;
    if (!w->cleaning_ || !w->cleaningSpinner_) return;
    w->cleaningSpinner_->angle_ += 20.0f;
    w->cleaningSpinner_->redraw();
    Fl::repeat_timeout(0.05, spin_tick, w);
}

void PacmanWindow::cleaning_done_cb(void* d) {
    auto* w = (PacmanWindow*)d;
    if (w) w->closeAfterCleanup();
}

void PacmanWindow::closeAfterCleanup() {
    cleaning_ = false;
    hide();  // 全部窗口关闭 → Fl::run() 返回 → main 结束（tempDir_ 已清空）
}

// ── 文件选择器（路径一律从 amsys resolve，目录用 Windows API 枚举）────

void PacmanWindow::showBrowse() {
    if (busy_) return;
    view_ = View::Browse;
    hideMenuOverlay();

    homeIcon_->hide();
    homeHint_->hide();
    dashLine_->hide();
    chooseBtn_->hide();
    homeStatus_->hide();
    pkgIcon_->hide();
    pkgName_->hide();
    pkgVersion_->hide();
    pkgDesc_->hide();
    warnBox_->hide();
    uninstallBtn_->hide();
    mainBtn_->hide();
    doneBtn_->hide();
    toggleLogBtn_->hide();
    logView_->hide();
    progress_->hide();
    finishBox_->hide();
    cleaningSpinner_->hide();
    cleaningLabel_->hide();

    browseAddr_->show();
    browseList_->show();
    browseUpBtn_->show();
    browseCancelBtn_->show();
    browseOpenBtn_->show();

    browsePipe_ = std::make_unique<AmsysPipe>(paths_.amsysExe);
    if (!browsePipe_->ok()) {
        leaveBrowse();
        homeStatus_->labelcolor(C_RED);
        homeStatus_->label("无法启动 amsys（检查 pacman.ini 的 amsys 路径）");
        homeStatus_->show();
        showHome();
        return;
    }
    browseUnix_ = "/";
    browseRefresh();
    redraw();
}

void PacmanWindow::leaveBrowse() {
    browsePipe_.reset();
    browseAddr_->hide();
    browseList_->hide();
    browseUpBtn_->hide();
    browseCancelBtn_->hide();
    browseOpenBtn_->hide();
    browseList_->clear();
    browseSelected_.clear();
}

void PacmanWindow::browseRefresh() {
    if (!browsePipe_ || !browsePipe_->ok()) return;

    // 每一层目录的绝对路径都从 amsys 获取
    browseWin_ = browsePipe_->resolve(browseUnix_);
    browseEntries_.clear();
    browseSelected_.clear();
    browseList_->clear();
    browseOpenBtn_->deactivate();

    browseAddr_->copy_label(("位置: " + (browseWin_.empty() ? browseUnix_ : browseWin_)).c_str());

    if (!browseWin_.empty()) {
        // 用 Windows 文件 API 枚举真实目录
        WIN32_FIND_DATAW ffd;
        HANDLE h = FindFirstFileW((utf8ToWide(browseWin_) + L"\\*").c_str(), &ffd);
        if (h != INVALID_HANDLE_VALUE) {
            do {
                std::wstring nm = ffd.cFileName;
                if (nm == L"." || nm == L"..") continue;
                BrowseEntry e;
                e.name = wideToUtf8(nm);
                e.isDir = (ffd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
                e.size = ((long long)ffd.nFileSizeHigh << 32) | ffd.nFileSizeLow;
                browseEntries_.push_back(std::move(e));
            } while (FindNextFileW(h, &ffd));
            FindClose(h);
        }
    } else {
        // 虚拟目录（/media、/dev 等）没有真实路径，用 amsys list_dir 列子项
        for (auto& e : browsePipe_->listDir(browseUnix_)) {
            BrowseEntry be;
            be.name = e.name;
            be.isDir = (e.type == "dir");
            be.size = e.size;
            browseEntries_.push_back(std::move(be));
        }
    }

    // 目录在前、文件在后，名称不区分大小写
    std::stable_sort(browseEntries_.begin(), browseEntries_.end(),
                     [](const BrowseEntry& a, const BrowseEntry& b) {
        if (a.isDir != b.isDir) return a.isDir;
        std::string al = a.name, bl = b.name;
        for (auto& c : al) c = (char)::tolower((unsigned char)c);
        for (auto& c : bl) c = (char)::tolower((unsigned char)c);
        return al < bl;
    });

    for (auto& e : browseEntries_) {
        std::string icon = e.isDir ? "📁 " : (endsWithIgnoreCase(e.name, ".aup") ? "📦 " : "📄 ");
        std::string row = icon + e.name;
        if (!e.isDir) row += "    " + formatSize(e.size);
        browseList_->add(row.c_str());
    }

    browseUpBtn_->activate();
    if (browseUnix_ == "/") browseUpBtn_->deactivate();
    redraw();
}

void PacmanWindow::browseGoUp() {
    browseUnix_ = parentUnix(browseUnix_);
    browseRefresh();
}

void PacmanWindow::onBrowseList() {
    int idx = browseList_->value();
    if (idx < 1 || (size_t)idx > browseEntries_.size()) {
        browseSelected_.clear();
        browseOpenBtn_->deactivate();
        return;
    }
    const BrowseEntry& e = browseEntries_[idx - 1];
    browseSelected_ = e.name;
    if (e.isDir || endsWithIgnoreCase(e.name, ".aup"))
        browseOpenBtn_->activate();
    else
        browseOpenBtn_->deactivate();
    if (Fl::event_clicks()) browseActivate();  // 双击：进入目录 / 直接打开
}

void PacmanWindow::browseActivate() {
    if (browseSelected_.empty() || !browsePipe_ || !browsePipe_->ok()) return;
    const BrowseEntry* e = nullptr;
    for (auto& x : browseEntries_)
        if (x.name == browseSelected_) { e = &x; break; }
    if (!e) return;

    std::string unixPath = (browseUnix_ == "/" ? "/" : browseUnix_ + "/") + e->name;
    if (e->isDir) {
        browseUnix_ = unixPath;
        browseRefresh();
        return;
    }
    if (!endsWithIgnoreCase(e->name, ".aup")) return;

    // 只有选定 .aup 时才从 amsys 解析它的绝对路径
    std::string win = browsePipe_->resolve(unixPath);
    if (win.empty()) {
        homeStatus_->labelcolor(C_RED);
        homeStatus_->label("无法解析所选包路径");
        homeStatus_->show();
        return;
    }
    leaveBrowse();
    openAupFile(win);
}

void PacmanWindow::setBusy(bool on) {
    if (on) {
        closeBtn_->deactivate();
        minBtn_->deactivate();
        hamburger_->deactivate();
        hamburger_->hide();
        chooseBtn_->deactivate();
        uninstallBtn_->deactivate();
        mainBtn_->deactivate();
    } else {
        closeBtn_->activate();
        minBtn_->activate();
        hamburger_->activate();
        hamburger_->show();
        chooseBtn_->activate();
        uninstallBtn_->activate();
        mainBtn_->activate();
    }
}

void PacmanWindow::cleanupTemp() {
    if (!tempDir_.empty()) {
        removeDirectoryRecursive(tempDir_);
        tempDir_.clear();
    }
}
