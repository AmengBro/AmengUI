#include "icon_loader.h"

#include <FL/Fl_PNG_Image.H>
#include <FL/Fl_JPEG_Image.H>
#include <FL/Fl_BMP_Image.H>

#include <windows.h>
#include <shellapi.h>

#include <algorithm>
#include <cctype>

namespace {

std::wstring utf8ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
    std::wstring w(n > 0 ? n : 0, L'\0');
    if (n > 0) MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], n);
    return w;
}

std::string toLower(const std::string& s) {
    std::string out = s;
    for (auto& c : out) c = (char)std::tolower((unsigned char)c);
    return out;
}

std::string wideToUtf8(const std::wstring& w) {
    if (w.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    std::string s(n > 0 ? n : 0, '\0');
    if (n > 0) WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), &s[0], n, nullptr, nullptr);
    return s;
}

bool endsWith(const std::string& s, const std::string& suf) {
    return s.size() >= suf.size() &&
           s.compare(s.size() - suf.size(), suf.size(), suf) == 0;
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

// HICON → Fl_RGB_Image（32bpp 含 alpha，去掉预乘）
IconResult iconToImage(HICON h) {
    IconResult r;
    ICONINFO ii{};
    if (!GetIconInfo(h, &ii)) return r;
    BITMAP bm{};
    if (ii.hbmColor) GetObjectW(ii.hbmColor, sizeof(bm), &bm);
    int w = bm.bmWidth > 0 ? bm.bmWidth : 32;
    int hh = bm.bmHeight > 0 ? bm.bmHeight : 32;

    BITMAPINFO bi{};
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = w;
    bi.bmiHeader.biHeight = -hh;
    bi.bmiHeader.biPlanes = 1;
    bi.bmiHeader.biBitCount = 32;
    bi.bmiHeader.biCompression = BI_RGB;

    HDC hdc = GetDC(nullptr);
    void* bits = nullptr;
    HBITMAP dib = CreateDIBSection(hdc, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
    if (dib && bits) {
        HDC mdc = CreateCompatibleDC(hdc);
        HGDIOBJ old = SelectObject(mdc, dib);
        DrawIconEx(mdc, 0, 0, h, w, hh, 0, nullptr, DI_NORMAL);
        SelectObject(mdc, old);
        DeleteDC(mdc);

        auto* px = new uchar[(size_t)w * hh * 4];
        for (int y = 0; y < hh; ++y)
            for (int x = 0; x < w; ++x) {
                const uchar* s = (const uchar*)bits + ((size_t)y * w + x) * 4;
                uchar* d = px + ((size_t)y * w + x) * 4;
                d[0] = s[2];
                d[1] = s[1];
                d[2] = s[0];
                d[3] = s[3];
            }
        for (int i = 0; i < w * hh; ++i) {
            uchar a = px[i * 4 + 3];
            if (a != 0 && a != 255) {
                px[i * 4 + 0] = (uchar)std::min(255, (int)px[i * 4 + 0] * 255 / a);
                px[i * 4 + 1] = (uchar)std::min(255, (int)px[i * 4 + 1] * 255 / a);
                px[i * 4 + 2] = (uchar)std::min(255, (int)px[i * 4 + 2] * 255 / a);
            }
        }
        r.img = new Fl_RGB_Image(px, w, hh, 4);
        r.owned = px;
        DeleteObject(dib);
    }
    if (ii.hbmColor) DeleteObject(ii.hbmColor);
    if (ii.hbmMask) DeleteObject(ii.hbmMask);
    ReleaseDC(nullptr, hdc);
    return r;
}

} // namespace

IconResult loadIconImageSize(const std::string& path, int size) {
    IconResult r;
    if (path.empty() || size <= 0) return r;
    std::wstring w = utf8ToWide(path);
    DWORD a = GetFileAttributesW(w.c_str());
    if (a == INVALID_FILE_ATTRIBUTES || (a & FILE_ATTRIBUTE_DIRECTORY)) return r;

    std::string lower = toLower(path);
    if (endsWith(lower, ".png")) {
        auto* im = new Fl_PNG_Image(path.c_str());
        if (im->w() > 0) { r.img = im; return r; }
        delete im;
        return r;
    }
    if (endsWith(lower, ".jpg") || endsWith(lower, ".jpeg")) {
        auto* im = new Fl_JPEG_Image(path.c_str());
        if (im->w() > 0) { r.img = im; return r; }
        delete im;
        return r;
    }
    if (endsWith(lower, ".bmp")) {
        auto* im = new Fl_BMP_Image(path.c_str());
        if (im->w() > 0) { r.img = im; return r; }
        delete im;
        return r;
    }

    // .ico / .exe → 系统图标提取
    HICON h = (HICON)LoadImageW(nullptr, w.c_str(), IMAGE_ICON, size, size, LR_LOADFROMFILE);
    if (!h) {
        SHFILEINFOW sfi{};
        if (SHGetFileInfoW(w.c_str(), 0, &sfi, sizeof(sfi),
                           SHGFI_ICON | (size > 32 ? SHGFI_LARGEICON : SHGFI_SMALLICON)))
            h = sfi.hIcon;
    }
    if (h) {
        r = iconToImage(h);
        DestroyIcon(h);
    }
    return r;
}

IconResult loadIconImage(const std::string& path) {
    return loadIconImageSize(path, 96);
}

IconResult loadDefaultIcon() {
    // 优先用 exe 同目录的 Icon86.ico
    IconResult r = loadIconImageSize(exeDirUtf8() + "\\Icon86.ico", 96);
    if (r.img) return r;

    // 回退：自绘默认图标（强调色圆角方块 + 白色箱子图形）
    const int S = 96, R = 22;
    auto* px = new uchar[S * S * 4];

    auto insideRounded = [&](int x, int y, int x0, int y0, int x1, int y1, int rr) {
        int cx = std::max(x0 + rr, std::min(x, x1 - rr));
        int cy = std::max(y0 + rr, std::min(y, y1 - rr));
        int dx = x - cx, dy = y - cy;
        return dx * dx + dy * dy <= rr * rr;
    };
    for (int y = 0; y < S; ++y)
        for (int x = 0; x < S; ++x) {
            uchar* d = px + (y * S + x) * 4;
            if (insideRounded(x, y, 0, 0, S - 1, S - 1, R)) {
                d[0] = 0x00; d[1] = 0x78; d[2] = 0xD4; d[3] = 255;
            } else {
                d[0] = d[1] = d[2] = d[3] = 0;
            }
        }

    auto fillWhite = [&](int x0, int y0, int x1, int y1) {
        for (int y = y0; y <= y1; ++y)
            for (int x = x0; x <= x1; ++x) {
                if (x < 0 || y < 0 || x >= S || y >= S) continue;
                uchar* d = px + (y * S + x) * 4;
                d[0] = d[1] = d[2] = 255;
                d[3] = 255;
            }
    };
    fillWhite(46, 28, 50, 36);  // 提手
    fillWhite(30, 36, 66, 48);  // 盖子
    fillWhite(34, 48, 62, 78);  // 箱体

    r.img = new Fl_RGB_Image(px, S, S, 4);
    r.owned = px;
    return r;
}
