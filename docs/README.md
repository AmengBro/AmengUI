# AmengUI 分析与技术方案存档

> 本目录收录由小buddy 协助产出的项目分析报告与技术设计方案，按时间线与逻辑顺序排列。
> 原始仓库：AmengUI（Electron 桌面环境模拟器）、AmengExplorer（文件管理器子项目）。

---

## 阅读顺序建议

1. **[AmengUI_AmengExplorer_分析.md](./AmengUI_AmengExplorer_分析.md)** — 起点
   项目全貌核对 + HWL OS 风波对照 + 技术短板清单 + 战略建议。先把"为什么做 UI 不丢人""鄙视链到底在鄙视什么"这件事理顺。

2. **[AmengUI_优化方向路线图.md](./AmengUI_优化方向路线图.md)** — 方向
   P0–P3 优先级清单，回答"优化交给包管理器还是自己写"。核心结论：shell 命根子留核心，可变模块走扩展。

3. **[AmengUI_任务栏窗口管理技术方案.md](./AmengUI_任务栏窗口管理技术方案.md)** — 工程线 A
   explorer 未启动时最小化窗口掉成底部标题栏的诊断与修复方案（amsys window 子系统 + SetWinEventHook）。

4. **[AmengUI_托盘接管技术方案.md](./AmengUI_托盘接管技术方案.md)** — 工程线 B
   通知区域接管方案。关键坑：Electron 自身 Tray 也依赖 explorer；路线 A（生态内自建）vs 路线 B（注入接管原生，需应对 Win11 PPL/HVCI）。

---

## 贯穿几条主线（读的时候心里有数）

- **HWL OS 教训**：翻车不是因为"不够底层"，而是用低层硬核外衣包装没含量的东西 + 谎称自研 OS。AmengUI 的纪律是**永远叫"桌面环境模拟器"，不叫 OS**；PE 底座公开说、不藏。
- **PE / 可启动底座**：现实路径是「WinPE 映像 + Electron 当 shell（Winpeshl.ini 自启动）+ 补齐 dxgi/d3d9/dxva2/msdmo 依赖 DLL」，不存在"等 Electron on EFI"；"全功能 UWP PE"在定义上不成立（WinPE 不支持 UWP）。
- **替代 explorer 工程线**：任务栏 + 托盘是同一坑两半，都需要让 AmengUI 自己接管原生窗口/图标；先把能跑的（生态内）做出来，再谈接管世界。

---

*最后更新：2026-08-18*
