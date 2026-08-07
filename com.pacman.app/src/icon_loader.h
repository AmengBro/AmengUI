#pragma once

#include <FL/Fl_Image.H>

#include <string>

struct IconResult {
    Fl_Image* img = nullptr;  // 需要 delete（PNG/JPEG/BMP/默认图标）
    uchar* owned = nullptr;   // 若非空，还需 delete[]（Fl_RGB_Image 的像素数据）
};

// 从文件加载图标（.png/.jpg/.jpeg/.bmp/.ico/.exe），失败返回空
IconResult loadIconImage(const std::string& path);

// 以指定尺寸加载 .ico/.exe 图标
IconResult loadIconImageSize(const std::string& path, int size);

// 生成 96x96 默认图标（优先 exe 同目录 Icon86.ico，失败回退自绘箱子）
IconResult loadDefaultIcon();
