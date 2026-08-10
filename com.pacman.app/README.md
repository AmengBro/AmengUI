# com.pacman.app — Deepin 风格包管理器（C++ / FLTK）

用 FLTK 1.4.5 写的小型 GUI，界面按 Linux-DEB 图形化安装器规格实现，
后端调用 `D:\Codewhale\workspace\amsys` 里的 `apm` 完成安装/卸载。

## 界面

- 深炭黑 `#191919` 圆角单窗口，自定义标题栏（左侧 pacman 图标，右侧 ☰ 菜单、最小化、关闭）；
- 单窗口多视图：首页（拖拽 / 选择文件）→ 安装预览 → 解压日志页（可折叠）；
- 三种安装模式自动识别：全新安装、同版本重新安装、新版本更新（降级显示"安装旧版本"）；
- 蓝色圆角外边框是可操作按钮的选中标识；卸载按钮按规格为灰色禁用；
- 安装过程实时显示 apm 日志，进度条蓝色填充；
- `.aup` 预览在后台线程进行，大包（如 285MB 的 WPS）不会卡住界面。

## 构建

```bat
build.bat
```

产物是 `pacman.exe`，静态链接、单文件、无外部 DLL 依赖
（只依赖 Windows 系统自带的库）。要求本机已有 FLTK 1.4.5 并装进
`D:\TDM-GCC`（头文件 `include\FL`、静态库 `lib\libfltk*.a`）。

`pacman.rc` 通过 windres 编译后链接进 exe：包含 exe 图标
（项目根目录 `pacman.ico`）和版本信息（产品名/描述/版权等）。

## 使用

```bat
pacman.exe                                   # 打开主界面（首页）
pacman.exe D:\path\to\app.aup                # 直接载入 .aup 并进入安装预览
```

- 支持把 `.aup` 文件直接拖进窗口；
- 「选择文件」打开内置文件选择器（Win32 风格：地址栏 + 文件列表 + 上一级/取消/打开）；
- 载入包后按版本自动进入 安装 / 重新安装 / 更新 / 安装旧版本 页面。

标题栏 ☰ 菜单里有「自动关联 .aup 文件」开关：开启后每次启动 pacman 都会把 `.aup`
后缀绑定为用 pacman 打开（写入 `HKCU\Software\Classes`，无需管理员权限），关闭则自动解绑。

文件选择器的目录/文件路径一律来自 amsys：进入每层目录都用
`amsys.exe --pipe` 的 `resolve` 取该目录的 Windows 绝对路径，再用 Windows
文件 API 枚举；只有选定 `.aup` 时才由 amsys 解析该文件的绝对路径并开始解析。

## 配置文件（pacman.ini）

程序会在自己旁边自动生成 `pacman.ini`（UTF-8，已有则不覆盖），手动改路径即可切换 amsys：

```ini
; pacman.ini — 包管理器配置（UTF-8 编码）
; 留空则自动探测；apm 默认与 amsys 同 root（root\bin\apm.exe）
; apm / sevenzip 支持 Unix 风格（如 /bin/apm.exe），会自动经 amsys 转换
[paths]
amsys = D:\Codewhale\workspace\amsys\amsys.exe
apm =
sevenzip =

[settings]
assoc_aup = false
```

- `amsys`：amsys.exe 路径。留空时按 apm 的策略自动定位（程序目录向上两级 + PATH，优先能加载 config.ini 的那个）。
- `apm`：apm.exe 路径，支持 Windows 绝对路径或 Unix 风格（如 `/bin/apm.exe`，自动经 amsys 转成 Windows 路径）。留空时默认取 `{amsys目录}\root\bin\apm.exe`（即与 amsys 同 root），再退回 `root\usr\bin` 和 PATH。
- `sevenzip`：7z.exe 路径，同样支持 Unix 风格（如 `/bin/7z/7z.exe`）。留空时通过 amsys 管道 `resolve /bin/7z/7z.exe` 解析，不硬编码。

amsys 虚拟根从 `amsys.exe` 旁的 `config.ini` 的 `[system] root` 读取（缺省为 `{amsys目录}\root`）。

## .aup 预览流程（与 apm 安装流程同源）

1. 启动 `amsys.exe --pipe`，通过管道发送 `resolve /tmp` 取得 `/tmp` 的 Windows 绝对路径；
2. 在 `/tmp` 下新建（清空）`pactemp` 文件夹；
3. 用 7z 把整个 `.aup` 解压到 `pactemp`（7z 路径来自配置或 `resolve /bin/7z/7z.exe`）；
4. 读取 `pactemp\aminfo.ini`，必须拿到 `[package] name` 与 `version`；
5. 按包名在解压目录里找 `.app`（精确 → 前缀 → 任意第一个），解析出显示名/介绍/图标。

预览结束后 `pactemp` 会保留到下次打开包或退出时清理；安装仍由 `apm install <路径>` 完成（apm 自己会再次解压到 `/tmp/apmtemp`）。

## 文件说明

```text
src/main.cpp        入口：解析命令行 .aup 参数
src/ui.cpp/.h       窗口与自绘控件（标题栏/首页/预览/日志页）
src/apm_core.*      pacman.ini 配置、apm/amsys 定位、子进程调用、已安装列表、.aup 预览
src/amsys_client.*  amsys.exe --pipe 管道客户端（resolve /tmp、/bin/7z/7z.exe）
src/package_info.*  aminfo.ini 与 .app JSON 的解析 + 版本比较
src/icon_loader.*   PNG/JPEG/BMP/ICO/exe 图标加载 + 默认图标
```
