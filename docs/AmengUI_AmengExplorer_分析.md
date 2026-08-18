# AmengUI / AmengExplorer 项目分析报告

> 分析日期：2026-08-16
> 分析对象：https://github.com/AmengBro/AmengUI （27 commits，MIT）
> 分析对象：https://github.com/AmengBro/AmengExplorer （15 commits，MIT）

---

## 1. 项目到底是什么（已核对真实文件树，不是只看 README）

两个项目是**同源拆分**的关系——AmengExplorer 的提交历史里明确有一步 `项目重命名 amengui → AmengExplorer`，共享同一套原生核心 `com.amsys.app/`（C++）。

### AmengUI —— Windows 上的 Unix 风格桌面环境模拟器
- Electron 42/43 外壳，渲染层是原生的 HTML/CSS/JS，**没有用前端框架**，自己撸了一整套窗口体系：`dashboard`（桌面）、`control-center`（控制中心）、`start-menu`、`lockscreen`、`settings`、`package-manager`、`user-form`、`calendar`、`win-switch`、`win-combo`……
- 真正的**原生 C++ 核心**（`com.amsys.app/`）：`path_manager.cpp`（Unix/Windows 路径翻译）、`shell.cpp`、`passwd_shadow.cpp`（/etc/passwd + /etc/shadow 用户体系）、`md5.h`/`sha1.h`、`installer`、`launcher`，以及一个独立的包管理器 `com.pacman.app/`（apm_core、package_info、ui）。
- 靠 PowerShell 7（`scripts/audio.ps1`、`sys.ps1`、`winrt.ps1`、`setbottom.ps1`）桥接 Windows 系统能力。

### AmengExplorer —— Unix 风格文件管理器
- 同样基于 Electron + 同一套 `amsys` C++ 路径引擎，前端模块化：`virtual-fs.js`、`amsys-client.js`、`amsys-resolver.js`、`search-index-worker.js`、`size-worker.js`（Worker 线程算文件夹大小）、`user-config.js`。
- 虚拟文件系统：`/home`、`/media/c`、`/dev` 映射，fstab 挂载，`.floder` 重定向，独立回收站，双面板/三视图/多标签页。

**结论：这不是"套壳玩具"，是有真实架构、有原生代码、有文件系统层、有用户体系、有包管理的完整工程。** 文档（`filesystem-architecture.md`、`use-pipe.md`、`.trae/documents/*`）也比一般个人项目认真。

---

## 2. 关于 HWL OS 风波，以及"写 UI 会被鄙视"这个心结

先把 HWL OS 的事掰清楚，因为它和你的担心正好**相反**：

HWL OS 当年被钉在耻辱柱上，不是因为它"不够底层"，而是因为它**谎称自己从零写了操作系统**，结果被扒出是基于 HotPE（Windows PE 魔改）：图标是透明的（没做 PNG 处理）、目录里直接有 Windows 文件夹、满屏 HotPE 图标。它的原罪是**用"低层/硬核"的外衣包装一个其实没技术含量的东西**，靠虚荣往上爬。

所以真正让人鄙视的不是"做 UI"，而是**虚假深度 / 过度吹嘘**。你担心的鄙视链，恰恰就是催生 HWL OS 那种项目的土壤——谁越往上（内核/UEFI/OS）爬，谁越显得"高级"。但那条链子本身是幼稚的产物。

几个能帮你卸下心结的事实：

1. **桌面环境本身就是巨型硬核项目。** KDE、GNOME、Hyprland 都是被整个行业尊重的项目，它们 90% 的篇幅就是 shell / UI / 交互，不是内核。你做的"Windows 上的 Unix 壳层"和它们是同一类东西，只是体量小。
2. **"Scratch 里写 UEFI 编译成 img"是教学玩具。** 它酷、有表演性，但本质是给新手演示用的 spectacle，不等于"更有技术含量"。拿它当标尺来贬低自己的可用桌面软件，是拿烟花比灯泡。
3. **你的东西是真有用的。** "在 Windows 上用 Unix 习惯工作"这个 niche 是有真实用户的（WSL 党、Unix  workflow 党）。能跑起来、有文档、有功能的桌面层，比一堆编译出来的 img  demo 实在得多。

一句话：**别为了爬那条虚的链子，把自己变成下一个 HWL OS。** 你已经在做的事，诚实、能跑、有架构，就已经在鄙视链该被尊重的那一侧了。

---

## 3. 真正该被认真挑刺的技术短板（这部分才是会掉分的）

| 问题 | 现状 | 风险 |
|---|---|---|
| **密码安全** | shadow 里是无盐 MD5，README 自认"演示用" | 一旦你对外宣称"多用户安全桌面"，这是第一个会被扒的洞。要么上 bcrypt/argon2 + salt，要么在 README 首页用大字写死"仅演示，勿用于真实凭据" |
| **原生核心重复** | `com.amsys.app/`（C++ 全套）在 AmengUI 和 AmengExplorer 里各维护一份 | 典型的双份技术债，改一处忘一处。应抽成独立 repo / git submodule，两个项目引用同一份 |
| **打包残缺** | README 承认 `rootdir/` 和 `config/` 被排除出构建，首次运行要手动建目录 | 别人 clone 下来跑不起来，第一印象直接崩。首次运行应有自动初始化 |
| **性能 hack** | 每 2 秒跑一次 PowerShell 强制置底窗口 | 轮询 Windows 窗口层级是权宜之计，应用 Win32 hook 或 Electron 自带窗口 API 更稳 |
| **二进制直接进 git** | `amsys.exe` 在多处提交；AmengExplorer 的 `root/root/` 里还提交了 `WinNTSetup 5.2.3.zip` | 仓库膨胀、不可复现（二进制没构建脚本）、第三方工具直接打包有 licensing 隐患。应只提交源码 + CMake，二进制靠 CI 产出 |
| **管理员权限强依赖** | 亮度/网络/飞行模式要管理员，普通用户静默失败 | 普通用户体验断裂，且安全模型不友好 |

---

## 4. 给你的战略建议（按性价比排序）

1. **先把共享的 `amsys` C++ 核心抽成独立仓库**，AmengUI / AmengExplorer 用 submodule 引用。这一个动作能消掉你最大的隐性维护成本，也让项目结构看起来更"专业"。
2. **把密码安全说清楚或做对**。这是你项目里唯一一个"如果别人认真看会笑"的点，反而比加十个小功能都影响观感。演示就明确标演示，要认真就上 salted hash。
3. **修首次运行体验**：clone → `npm install` → `npm start` 就能跑，不要让人手动建目录。这是开源项目留存率的关键。
4. **继续强化你的差异化叙事**：你不是在"写 UI"，你是在 Windows 上构建一层 **Unix 兼容桌面层**（路径映射 + 虚拟文件系统 + passwd/shadow 用户体系 + 包管理）。这个定位比"一个好看的文件管理器"值钱，也更容易被技术社区正眼看待。
5. **保持文档的诚实度**。你现在 README 已经很详细，这是加分项。永远不要把"想做"写成"已做"——HWL OS 的反面教材就是吹过了头。

---

## 5. 一句话总结

你的项目是**真东西**，和 HWL OS 那种"假硬核"处在鄙视链的两端。写 UI / 桌面环境一点都不丢人，丢人的是虚假深度。把共享核心收拢、把密码安全说清、把首次运行做顺，你这套"Windows 上的 Unix 壳层"会比一堆编译出来的 img 玩具更有长期价值喵~
