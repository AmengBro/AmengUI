# AmengUI 托盘（通知区域）接管技术方案

> 配套文档：AmengUI_任务栏窗口管理技术方案.md
> 核心前提：explorer.exe 未启动时，系统托盘（通知区域）和任务栏一样，都不存在。

---

## 一、先戳破一个隐藏的坑：连 Electron 自己的 Tray 都画不出来

这是很多人第一反应会忽略的致命点：

- 系统托盘（通知区域）和任务栏**都是 explorer.exe 的子组件**。explorer 没启动，原生托盘窗口（`Shell_TrayWnd` / `NotifyIconHost`）根本不存在。
- **关键坑**：Electron 的 `Tray` API 底层也是调用 `Shell_NotifyIcon(NIM_ADD, ...)` 往 explorer 注册图标。也就是说——**在没有 explorer 的环境里，连你自己的 Electron Tray 图标都无处可去，照样画不出来**。
- 结论：AmengUI **不能指望任何现成的 Tray 组件**（Electron Tray、系统 API 都不行）。必须在任务栏上**自己画一个"通知区域" UI**，并想办法把图标抓进来。

---

## 二、两条路线：务实 vs 完整

### 路线 A：生态内托盘（推荐第一阶段，诚实可落地）★

**思路**：AmengUI 在任务栏右端画一个自建"通知区域"（普通 div + 图标列表），**完全不调用 Shell_NotifyIcon**。

**做法**：
1. 任务栏右侧留一块区域，渲染一组图标（hover 显示 tooltip，点击弹菜单）。
2. 自己的应用 / pacman 扩展通过 **amsys 管道或 Electron IPC** 注册托盘项：
   - `icon`（base64 或路径）、`tooltip`、`onClick`、`onContextMenu`（右键菜单树）。
3. 在 pacman **扩展清单**里加 `tray` 字段，允许扩展声明托盘图标 + 菜单 + 事件。这样 AmengUI 生态内的应用（包管理器、文件管理器、控制中心…）就能统一在通知区露脸。
4. **明确边界**：QQ、杀软等第三方原生程序的托盘图标**第一阶段不接管**，文档写清"原生托盘需 explorer"。

**优点**：
- 零注入、零提权、杀软友好、立刻能用；
- 把"AmengUI 生态的托盘"先立起来，体验闭环完整；
- 不涉及 PPL/HVCI 雷区。

**代价**：原生程序托盘暂时缺席——但这是诚实的工程边界，不是吹牛。

---

### 路线 B：真正接管原生托盘（高级，风险高）⚠

**为什么必须注入**：原生程序调用 `Shell_NotifyIcon()` 时，参数通过 `WM_COPYDATA` 发往 explorer 的 `Shell_TrayWnd`。explorer 不在，这些调用直接失败，图标不会出现。要接管，必须在**每个有托盘的进程里**拦截这个调用。

**标准做法**（已被开源验证可行）：
1. 用 `SetWindowsHookEx` 注入一个 DLL 到目标进程（WH_SHELL / 或 IAT hook `Shell_NotifyIconW`）。
2. 在调用方进程 Hook `Shell_NotifyIcon` 入口，记录每次 `NIM_ADD / MODIFY / DELETE` 的原始参数（`NOTIFYICONDATA`：hIcon、tip、回调 hwnd、消息 ID）。
3. 把图标数据（hIcon 需 `DuplicateHandle` 跨进程复制）回传 amsys。
4. amsys 在自己的通知区域 UI 渲染；用户点击时 `PostMessage` 回原程序的回调 hwnd，**模拟鼠标事件**转发给原生程序。

**真实风险（务必心里有数）**：
- **Windows 11 防护**：explorer 是高完整性进程（High IL）+ PPL（Protected Process Light），HVCI 开启时常规 `CreateRemoteThread` 注入被阻止，要走挂起进程注入 / APC 注入 / 调试注入等更脏的路子（参考 SysNotifyHooker、Windhawk）。
- **32/64 位**：必须同时提供两套注入 DLL。
- **UAC 提权进程**：注入不了，管理员程序的托盘会丢。
- **稳定性**：注入一个进程崩溃可能拖垮一片；杀软把注入当恶意行为，极易误报。
- 这是 Open-Shell / StartAllBack / Windhawk / LiteStep 这类 Explorer 替代的**核心 hack**，可行但工程量大、维护成本高。

**开源参考**（可直接借鉴思路，注意许可）：
- `katahiromz/SysNotifyHooker`：注入 explorer 钩 Shell_NotifyIcon。
- `Ceiridge/Tray-Icon-Replacer`：DLL 钩 Shell_NotifyIcon 替换图标。
- `Windhawk`：Detours 式 inline hook，工业级实现。

---

## 三、和任务栏方案的协同

- 任务栏方案的 **window 子系统**已经要监听窗口事件（`SetWinEventHook`，本进程即可，无需注入）。
- 托盘路线 B 则需要**注入 DLL**。建议：**第一阶段用路线 A**，托盘和任务栏都不碰注入；等任务栏接管做稳、架构理顺后，再统一上**一个注入 DLL**，同时服务"窗口事件枚举"和"Shell_NotifyIcon 拦截"两件事，避免两套注入基础设施打架。

---

## 四、建议落地顺序

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P1 | 任务栏右端自建通知区域 UI + 扩展 tray 规范（路线 A） | 任务栏 window 子系统 |
| P2 | 任务栏接管（窗口枚举/最小化隐藏）做稳 | — |
| P3 | 评估路线 B：统一注入 DLL，接管原生托盘 | P1+P2 稳定后 |

---

## 五、一句话收口

托盘比任务栏更难，因为它是**跨进程**的活，还要跟 Windows 11 的 PPL/HVCI 防护正面刚。**聪明的起步是先在自家生态里把托盘立起来（路线 A，不依赖 explorer），原生托盘接管作为进阶的大工程**——而不是一上来就 promise"完美接管所有托盘图标"，那正是 HWL OS 式吹牛的苗头。先把能跑的做出来，再谈接管世界。

---

*相关文件：AmengUI_任务栏窗口管理技术方案.md、AmengUI_优化方向路线图.md*
