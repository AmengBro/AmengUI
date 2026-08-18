# AmengUI 任务栏窗口管理技术方案

> 2026-08-18 讨论整理
> 问题：explorer 未启动时，所有程序最小化后只剩"标题栏"在屏幕底部，不美观；希望任务栏真正承担任务栏功能。

---

## 一、现象诊断（先搞清楚为什么会这样）

"explorer 没启动 → 最小化程序变成屏幕底部一条标题栏"——这不是 AmengUI 画错了，而是 **Windows 的默认回退（fallback）**：

- 任务栏（taskbar）属于 `explorer.exe`，是 Windows shell 的一部分。
- 一旦没有 shell 拥有任务栏，被最小化的顶级窗口没有地方"挂"按钮，Windows 就把它压成屏幕底部一条 1~2 行高的标题栏碎片。
- 你当前的症状证明：**AmengUI 的任务栏并没有真正枚举 / 管理原生窗口**，所以原生 app 最小化后直接掉回了系统的兜底行为。

结论：要让任务栏"真正承担任务栏功能"，必须让 AmengUI 自己枚举并管理所有顶级窗口（最小化 → 隐藏 + 任务栏按钮；点击按钮 → 还原）。

---

## 二、总体方案

在你的 **amsys（C++ 层，已用 stdin/stdout JSON 管道和 Electron 通信）** 里新增一个 **window 子系统**，承担三件事：

1. **枚举**所有顶级窗口（`EnumWindows`）；
2. **监听**窗口的创建 / 销毁 / 最小化 / 还原 / 激活（`SetWinEventHook`）；
3. **执行**最小化隐藏 / 还原 / 激活 / 关闭（`ShowWindow` + `SetForegroundWindow`）。

Electron 任务栏订阅这些数据渲染按钮；点击按钮反向驱动 amsys。

> 架构红利：你之前"窗口置底"是 2 秒轮询 + 聚焦推送，这次的 `SetWinEventHook` 同样能喂给置底逻辑（监听 Z 序变化）。**一套 Win32 事件基础设施，同时服务"窗口置底"和"任务栏"**，一举两得。

---

## 三、关键 Win32 调用

### 枚举与过滤
```cpp
// 枚举所有顶级窗口
EnumWindows([](HWND hwnd, LPARAM) -> BOOL {
    if (!IsWindowVisible(hwnd)) return TRUE;            // 排除不可见
    LONG ex = GetWindowLong(hwnd, GWL_EXSTYLE);
    if (ex & WS_EX_TOOLWINDOW) return TRUE;             // 排除工具窗口
    if (GetWindow(hwnd, GW_OWNER)) return TRUE;         // 排除 owned popup
    // 排除 AmengUI 自身窗口（按进程名 / 类名 / HWND 白名单）
    // 排除 DWM cloaked 窗口（虚拟桌面 / 任务视图里的）
    return TRUE;
}, 0);
```

过滤规则（避免脏数据）：
- 排除 `!WS_VISIBLE`、工具窗口 `WS_EX_TOOLWINDOW`、owned popup；
- 排除 DWM **cloaked** 窗口（虚拟桌面 / 任务视图里不可见的）；
- 排除 AmengUI 自己的窗口（进程名 / 类名 / HWND 白名单）。

### 状态与操作
```cpp
IsIconic(hwnd);                                  // 是否已最小化
ShowWindow(hwnd, SW_HIDE);                       // 真正隐藏，杜绝底部标题栏碎片
ShowWindow(hwnd, SW_RESTORE);                    // 还原
SetForegroundWindow(hwnd);                       // 置前（注意前台权限限制）
```

### 事件监听
```cpp
// 监听窗口生灭与状态变化
SetWinEventHook(
    EVENT_OBJECT_CREATE, EVENT_OBJECT_DESTROY,
    NULL, WinEventProc, 0, 0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
// STATECHANGE 里用 IsIconic() 区分 最小化 / 还原
```

---

## 四、amsys 管道协议（建议）

**请求（Electron → amsys）**
```json
{"cmd":"win:list"}
{"cmd":"win:minimize","hwnd":12345}
{"cmd":"win:restore","hwnd":12345}
{"cmd":"win:activate","hwnd":12345}
{"cmd":"win:close","hwnd":12345}
```

**事件（amsys → Electron，流式）**
```json
{"ev":"win:created","hwnd":12345,"title":"记事本","pid":888}
{"ev":"win:destroyed","hwnd":12345}
{"ev":"win:minimized","hwnd":12345}
{"ev":"win:restored","hwnd":12345}
{"ev":"win:activated","hwnd":12345}
```

---

## 五、Electron 任务栏侧

- 启动时 `win:list` 拉全量窗口，之后纯增量处理事件。
- 每个顶级窗口渲染一个按钮，点击逻辑（toggle）：
  - 未最小化 → 发 `win:minimize`（amsys 收到后 `SW_HIDE`，按钮保留）；
  - 已最小化 → 发 `win:restore` + `win:activate`；
  - 已激活且再次点击 → 最小化。
- 按钮区分三态样式：**运行中 / 已最小化 / 激活中**。

---

## 六、消除"底部标题栏"的核心 trick

在收到 `win:minimized` 事件的**同一回调里立即 `ShowWindow(SW_HIDE)`**。

因为窗口一旦被隐藏，Windows 根本不会画出那条底部碎片——任务栏按钮成为它的唯一代表。事件响应是毫秒级，肉眼看不到闪现。

若要**彻底零闪现**：用全局 **CBT 钩子**（`HCBT_MINMAX`）在 DLL 里拦截最小化，取消系统默认动作、改为自家隐藏。代价是要加载钩子 DLL、处理注入，复杂度更高——建议先上事件方案，够用再升级。

---

## 七、已知限制

- **UWP / 沉浸式应用**最小化走另一套（无传统标题栏），explorer 死掉时它们本身也会异常；第一阶段先覆盖 Win32 桌面程序，UWP 单独评估。
- **多桌面 / 任务视图**的 cloaked 窗口要过滤，否则会在错误桌面显示按钮。
- 必须**排除 AmengUI 自身窗口**，并把自身主窗口固定在桌面层（复用你已有的"窗口置底"逻辑）。

---

## 八、最小落地步骤

1. 在 amsys 加 `window` 子系统：`win:list` + `win:minimize/restore/activate/close` + 事件流。
2. Electron 任务栏接协议，渲染按钮 + toggle 逻辑。
3. 收到 `minimized` 立即 `SW_HIDE`，验证底部标题栏消失。
4. 把置底逻辑也从轮询迁到同一套 `SetWinEventHook`（Z 序监听）。
5. 过滤 cloaked / 工具窗口 / 自身窗口，补三态样式。
