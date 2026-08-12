# AmengUI 开发对话与决策记录

> 本文档记录 AmengUI 项目开发过程中的关键对话、技术决策、问题排查与演进历程，便于后续维护者理解项目背景与设计取舍。

---

## 一、项目愿景与定位

AmengUI 是一个基于 Electron 的 Windows 桌面环境模拟器，目标是构建一套类 Unix 风格的桌面壳层（Shell），在 Windows 之上提供：

- 完整的登录、桌面、任务栏、开始菜单体验
- 通过 `amsys.exe` 实现 Unix 路径与 Windows 路径的双向映射
- 通过 `.app` 配置文件（仿 Linux `.desktop`）定义可启动应用
- 内置 PowerShell 7 保证系统脚本跨版本兼容
- 控制中心集成音量、亮度、网络、蓝牙等系统快捷开关
- Shell 模式可关闭 UI 进入纯 amsys 终端环境

---

## 二、关键开发对话与决策

### 1. 终端程序启动无响应问题

**用户反馈**：
> 启动终端程序（如 cmd）总是会出现没反应，是否是因为没有创建为新窗口的终端程序？

**排查与结论**：
- 原因：`spawn` 启动 cmd/powershell/amsys 这类控制台程序时，默认 stdio 配置会让它们认为没有控制台，从而不弹窗
- 解决方案：对终端类程序使用 `stdio: 'inherit'` + `shell: true`，让子进程继承父进程的控制台或通过 shell 启动新窗口

**关键代码**（`src/index.js`）：
```javascript
const isTerminal = appData.exePath.toLowerCase().endsWith('cmd.exe') || 
                   appData.exePath.toLowerCase().endsWith('powershell.exe') ||
                   appData.exePath.toLowerCase().endsWith('amsys.exe');

const child = spawn(appData.exePath, [], {
  detached: true,
  stdio: isTerminal ? 'inherit' : 'ignore',
  shell: isTerminal
});
```

---

### 2. amsys 管道模式集成（`--pipe`）

**用户需求**：
> 现在有一个 amsys.exe，它提供了管道方式来把 unix 风格路径转换为 windows 路径，所以现在需要加一层转译，就是读取 .app 文件时要先用 amsys 获取 /usr/share/applications 绝对 windows 路径然后再访问。具体调用方式请参阅 use-pipe.md

**设计决策**：
- 最初尝试按 `use-pipe.md` 用 `--pipe` 模式启动 amsys 子进程，通过 JSON Lines 协议双向通信
- 遇到问题：amsys 在 `--pipe` 模式下进程启动后立即退出，管道连接逻辑异常
- 经过反复排查，最终采用 **Node.js 原生实现路径转换** 的方案（`src/amsys/converter.js`），直接读取 `config.ini` 与 `rootdir/etc/fstab` 完成映射，保留 `client.js` 作为备用封装

**amsys 配置文件**（`config.ini`）：
```ini
[system]
root = rootdir
block_dotdot = true

[mounts]
home = 
usr = 
tmp = 
var = 
etc = 
opt = 
bin = 
lib = 
```

**路径转换流程**：
1. `getPathConverter(APP_ROOT)` 单例初始化 `PathConverter`
2. 读取 `config.ini` 确定 `root = rootdir`（相对于项目根目录）
3. 读取 `rootdir/etc/fstab` 加载挂载点映射
4. `toWindows('/usr/share/applications')` → 项目根目录下的 `rootdir\usr\share\applications`
5. 转换失败时回退到 `path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications', ...)`

**回退机制**（`src/index.js` `app:launch`）：
```javascript
try {
  const converter = await getPathConverter(APP_ROOT);
  const result = await converter.toWindows('/usr/share/applications');
  if (result.success && result.winPath) {
    appPath = path.join(result.winPath, `${appName}.app`);
  } else {
    throw new Error('path conversion failed');
  }
} catch (converterError) {
  appPath = path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications', `${appName}.app`);
}
```

---

### 3. 内置 PowerShell 7 支持

**用户需求**：
> 现在你需要支持外部 pwsh7：为了保证兼容性，程序会内置一个 powershell7 来确保置底脚本正常执行，路径一般为 .\PowerShell\7\pwsh.exe 但是这个路径可以通过常量更改，常量为 windows 路径

**实现方案**：
- 在 `src/config.js` 中定义常量 `PWSH_PATH = path.join(APP_ROOT, 'PowerShell', '7', 'pwsh.exe')`
- 在 `src/index.js` 中实现 `getPwshCommand()` 辅助函数：优先检测内置 pwsh7 是否存在，不存在则回退到系统 `powershell`
- 所有需要执行 PowerShell 脚本的场景（置底、控制中心系统控制）都通过该函数获取命令

```javascript
async function getPwshCommand() {
  try {
    await fs.access(PWSH_PATH);
    return `"${PWSH_PATH}"`;
  } catch {
    return 'powershell';
  }
}
```

---

### 4. 并发临时脚本冲突修复

**问题**：
- 多个 `forceWindowToBottom` 调用同时写入同一临时脚本文件 `amengui_setbottom.ps1`，导致并发写入错误

**修复**：
- 在临时脚本文件名中加入 `hwnd` 和 `Date.now()` 保证唯一性
```javascript
const scriptPath = path.join(tempDir, `amengui_setbottom_${hwnd}_${Date.now()}.ps1`);
```

---

### 5. 打包后路径转换失败

**问题**：
- `forge.config.js` 的 `ignore` 规则把 `rootdir/` 排除在打包范围外，导致生产环境 amsys 找不到 `config.ini` 与 `fstab`
- 同时 `APP_ROOT` 在打包后路径计算错误

**修复**：
- 调整 `forge.config.js` 的 `ignore` 规则，确保 `src/amsys/` 被打包
- 在 `index.js` 与 `config.js` 中通过 `getAppRoot()` 动态计算根目录，兼容开发与打包环境

```javascript
function getAppRoot() {
  const isPackaged = app?.isPackaged || false;
  if (!isPackaged) {
    return path.join(__dirname, '..');
  }
  const exePath = process.execPath;
  const appRoot = path.dirname(exePath);
  if (appRoot.endsWith('resources')) {
    return path.join(appRoot, '..');
  }
  return appRoot;
}
```

---

### 6. Shell 模式实现

**用户需求**：
> 添加 shell 模式，会关闭当前程序界面并且创建一个无法关闭的 amsys 窗口直到主界面重新打开

**实现方案**：
- 提取 `startAmsysProcess()` 函数：启动 amsys 子进程并绑定 `exit`/`error` 事件
- 通过 PowerShell `Start-Process -PassThru` 启动 amsys，使其运行在**独立控制台窗口**中（而非继承 Electron 控制台），并拿到真实 PID
- 关闭语义：用户在 amsys 中输入 `exit` 正常退出（退出码 0）视为**主动退出**，自动结束 Shell 模式并恢复主界面；窗口被强制关闭（点 X / 任务管理器）时退出码非 0，Shell 模式期间自动重启，确保"无法关闭"
- 通过 `auth:shell` IPC 进入 Shell 模式，隐藏主窗口与桌面窗口
- 通过 `auth:exit-shell` IPC 退出 Shell 模式（备用入口），调用 `exitShellMode()` 用 `taskkill /T` 杀掉 amsys 进程树并恢复主界面

**关键代码**（`src/index.js`）：
```javascript
function startAmsysProcess() {
  const amsysPath = path.join(APP_ROOT, 'src', 'amsys', 'amsys.exe');
  amsysProcess = spawn(amsysPath, [], {
    stdio: ['inherit', 'inherit', 'inherit'],
    detached: true,
    cwd: APP_ROOT
  });
  
  amsysProcess.on('exit', (code) => {
    if (isShellMode) {
      startAmsysProcess();  // 重新绑定事件并重启
    }
  });
  
  amsysProcess.on('error', (err) => {
    if (isShellMode) {
      setTimeout(() => startAmsysProcess(), 1000);
    }
  });
}

function exitShellMode() {
  if (isShellMode && amsysProcess) {
    isShellMode = false;
    try {
      process.kill(-amsysProcess.pid);  // 杀整个进程组
    } catch (e) {
      console.error('Failed to kill amsys process:', e);
    }
    amsysProcess = null;
  }
}
```

**修复记录**：
- 初版在 `exit` 回调内直接 `spawn` 新进程，但**未重新绑定事件处理器**，导致后续退出无法触发重启
- 重构为 `startAmsysProcess()` 函数后，每次重启都会重新绑定事件，问题解决
- 后续发现 `stdio: ['inherit', ...]` 会让 amsys 附着在 Electron 控制台上（开发态）或无窗口（打包态），且 `stdio: 'ignore'` 会让 amsys 因 stdin EOF 立即退出；最终改为 `Start-Process` 独立控制台窗口方案
- 退出码语义：`exit` 命令返回 0（主动退出 → 回桌面），强杀返回非 0（被关闭 → 自动重启）

---

### 7. 控制中心实现

**用户需求**：
> 添加"控制中心"用于调节设置，必须实现音量、亮度调节，音量合成器，网络、蓝牙、飞行模式、夜间模式切换等

**实现方案**：
- 新建独立窗口 `controlCenterWindow`：无边框、透明、置顶、跳过任务栏，定位到屏幕**右下角**（悬浮任务栏上方，留 12px 间距）
- 新建三文件：`control-center.html` / `control-center.css` / `control-center.js`
- 任务栏新增网络、音量、电池三个图标，点击任一图标唤起控制中心
- 控制中心窗口 `blur` 时自动隐藏（点击外部即关闭）

**系统控制 IPC 清单**：

| IPC Channel | 功能 | 实现方式 |
|-------------|------|----------|
| `system:getVolume` | 获取音量 | `Get-WmiObject Win32_ComputerSystem` |
| `system:setVolume` | 设置音量 | Core Audio API，失败回退 `WScript.Shell` SendKeys 模拟音量键 |
| `system:getBrightness` | 获取亮度 | `WmiMonitorBrightness` |
| `system:setBrightness` | 设置亮度 | `WmiMonitorBrightnessMethods.WmiSetBrightness` |
| `system:openVolumeMixer` | 音量合成器 | `sndvol.exe` |
| `system:toggleNetwork` | 网络开关 | `Get-NetAdapter` + `netsh interface set interface` |
| `system:toggleBluetooth` | 蓝牙开关 | `Start/Stop-Service bthserv` |
| `system:toggleFlightMode` | 飞行模式 | 修改注册表 `SystemRadioState` |
| `system:toggleNightMode` | 夜间模式 | 修改注册表 `CloudStore\...\bluelightreductionstate` |

**关键修复 — PowerShell `$` 转义问题**：
- 初版直接用 `pwsh -Command "..."` 传递含 `$` 的 PowerShell 命令，JavaScript 模板字符串把 `$path` 误解析为变量，导致语法错误
- 进一步尝试用反引号转义 `` \$path ``，但 PowerShell 收到的是字面 `\$path`，命令失效
- **最终方案**：将复杂 PowerShell 命令写入临时 `.ps1` 文件，通过 `-ExecutionPolicy Bypass -File` 执行，彻底规避命令行参数解析问题

```javascript
const scriptPath = path.join(os.tmpdir(), `amengui_nightmode_${Date.now()}.ps1`);
const scriptContent = `
\$path = 'HKCU:\\SOFTWARE\\...'
\$val = Get-ItemProperty -Path \$path
if (\$val.Data -match '01') {
  Set-ItemProperty -Path \$path -Name Data -Value ([byte[]]@(0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00))
} else {
  Set-ItemProperty -Path \$path -Name Data -Value ([byte[]]@(0x01,0x00,0x00,0x00,0x01,0x00,0x00,0x00))
}
`.trim();

await fs.writeFile(scriptPath, scriptContent);
try {
  await execAsync(`${pwsh} -ExecutionPolicy Bypass -File "${scriptPath}"`);
} finally {
  fs.unlink(scriptPath, () => {});
}
```

**关键修复 — 不存在的 VolumeControl 类**：
- 初版使用 `System.Windows.Forms.VolumeControl`，该类在 .NET 中实际不存在
- 改为 Core Audio COM API（`System.Windows.Media.AudioVolume`）作为主方案，`WScript.Shell` SendKeys 模拟音量键作为回退

---

### 8. 关机/重启 IPC 补全

**问题**：
- `preload.js` 中暴露了 `power.shutdown()` 和 `power.restart()`，但 `index.js` 中未实现对应的 `auth:shutdown` / `auth:restart` IPC 处理器

**修复**：
```javascript
ipcMain.on('auth:shutdown', () => {
  spawn('shutdown', ['/s', '/t', '0'], { detached: true });
});

ipcMain.on('auth:restart', () => {
  spawn('shutdown', ['/r', '/t', '0'], { detached: true });
});
```

---

### 9. 控制中心 PE 兼容与自制音量合成器

**用户需求**：
> 控制中心需要 windows10PE（hotPE2.5）兼容性，需要改进实现方式。开关需要反应的时间太久，建议加上加载或异步处理。蓝牙与网络尽量使用不依赖第三方方式解决。音量合成器图标不够合适，而且不应该是"打开音量合成器"而是"打开自制音量合成器面板"。

**设计决策**：
- 新增 `src/scripts/audio.ps1`：自包含 C# Core Audio COM 互操作（IMMDeviceEnumerator / IMMDevice / IAudioEndpointVolume / IAudioSessionManager2 / ISimpleAudioVolume / IPolicyConfig），仅依赖 Windows 原生 API，不引入任何第三方库
  - 图标提取使用 `ExtractIconEx`（shell32）+ gdiplus 扁平 API 直接输出 PNG data URL，避免 System.Drawing 在 PowerShell 7/.NET 下的程序集引用问题
  - 支持 `-Server` 常驻模式：主进程通过 JSON Lines（stdin/stdout）协议通信，避免每次音量操作都重新编译 COM 互操作代码，显著降低延迟
- 新增 `src/scripts/syscheck.ps1`：探测网络/蓝牙/亮度/飞行模式/夜间模式在当前环境是否可用（PE 中蓝牙服务、亮度 WMI、CloudStore 等往往不存在），主进程缓存 60 秒并通过 `system:getCapabilities` 下发
- 所有开关操作增加加载态：按钮禁用 + 右上角转圈，处理中显示"处理中…"，失败显示"失败/不支持"并回退
- 网络切换不再依赖 `Get-NetAdapter` 模块（PE 可能缺失）：优先物理网卡 + `netsh interface set interface`，回退 WMI `Win32_NetworkAdapter`
- 蓝牙切换优先 `Get-PnpDevice` + `pnputil /disable-device`（Win11 式无线电开关），回退 `bthserv` 服务，两者皆无则返回 `unsupported`
- 飞行模式/夜间模式先检查注册表键是否存在，不存在返回 `unsupported`，由 UI 置灰
- 所有 PowerShell 调用统一带超时（`execPwsh`），防止系统命令卡死
- 自制音量合成器面板（窗口内第二视图，非 sndvol.exe）：
  - 顶部 WinUI3 风格"输出设备选择"下拉，切换默认设备走 `IPolicyConfig::SetDefaultEndpoint`
  - 下方会话列表：左应用图标（右下角静音角标）、中应用名与百分比、右音量条；点击图标切换静音
  - 入口从音量标题行移到音量条右侧（调音图标 + tooltip"打开自制音量合成器面板"），音量条因此缩短
  - 进入合成器视图时窗口从 320x420 动态调整为 340x520（新增 `control-center:resize` IPC）
- 打包适配：`forge.config.js` 的 `asarUnpack` 加入 `src/scripts/**`，打包后脚本位于 `app.asar.unpacked/src/scripts`，供外部 pwsh 进程直接读取

**关键修复记录**：
- `ExtractIconEx` 位于 `shell32.dll` 而非 `user32.dll`
- PowerShell 7 的 `Add-Type -ReferencedAssemblies` 会替换默认引用，曾导致 `List<>` 无法解析；最终通过 gdiplus 扁平 API 完全绕开 System.Drawing
- 同一进程可持有多个音频会话（系统声音在本机多达 8 个），`getSessions` 按 PID 去重合并为一行
- PowerShell 5.1 兼容（系统 powershell 回退路径）：
  - 不要在 switch 子句内联多行 hashtable/ForEach-Object 管道，5.1 解析器存在怪癖；命令分发改用 if/elseif
  - COM 接口不要用接口继承声明，.NET Framework 下会导致 vtable 调度错误（AccessViolation）；`IAudioSessionControl2` 改为扁平声明完整 vtable
  - `audio.ps1` 保存为 UTF-8 带 BOM，否则 5.1 按 ANSI 误读中文导致解析错乱

### 10. 控制中心加载与开关速度优化（预处理）

**用户反馈**：
> 加载时间太长了！设置 WiFi 和蓝牙太久了！搞点预处理！或者用别的方法

**根因**：
- 每次打开控制中心都要冷启动 PowerShell 探测能力（`Get-NetAdapter`/`Get-PnpDevice`/`Get-CimClass` 等枚举耗时 4~6 秒），且 UI 阻塞在能力探测完成前
- 每次开关 WiFi/蓝牙都冷启动 pwsh 并重新枚举设备，单次操作可达 5~8 秒
- 音频服务首启要编译 Core Audio COM 互操作代码（数秒），首次调用音量接口必然等待

**优化方案**：
- 泛化 `AudioServer` 为 `PwshServer(scriptPath)`：常驻 PowerShell 服务，stdin/stdout JSON Lines 协议；新增 `sysServer`（`src/scripts/sys.ps1`）承载能力探测 + 网络/蓝牙/飞行/夜间/亮度全部命令，替代原先每次冷启动的一次性临时脚本
- **启动预热**：`app.whenReady` 后后台执行 `prewarmSystemServices()`——拉起两个常驻服务、预取能力、预热亮度/网络/蓝牙状态（WMI/PnP 首次调用最慢，提前完成），能力缓存 TTL 60s → 10 分钟
- **控制中心非阻塞**：打开立即渲染，加载遮罩直接隐藏，能力与数值异步填充；能力未返回前不误判"不支持"
- **设备名/状态缓存**：`sys.ps1` 进程内缓存网卡名与蓝牙设备 InstanceId，首次枚举后开关不再重新枚举；蓝牙状态用进程内缓存翻转，未知才查询一次
- 蓝牙状态查询改用 `Win32_PnPEntity`（WMI，约 0.6s）替代 `Get-PnpDevice`（约 1.9s）；无线电设备选取排除 `BTHLEDEVICE\*` 伪设备、回退 `USB\*`

**实测效果**（本机）：
- 热命令：`networkStatus` 约 85ms，`bluetoothStatus` 约 0.6s
- 开关剩余耗时主要是 `netsh`/`pnputil` 系统操作本身（1~2 秒），无法再压缩

### 11. .app 文件支持 Unix 风格路径

**用户反馈**：
> .app文件的解析不支持unix风格路径，需要添加支持

**实现方案**：
- `app:launch` / `app:getInfo` 解析 .app 后统一经过 `convertAppDataPaths()`（`src/index.js`）
  - `exePath`、`icon`、`cwd` 若以 `/` 开头（且非 UNC `//`），经 amsys `PathConverter.toWindows()` 转换为 Windows 路径
  - `args` 数组中形如 `/xxx/yyy` 的多段路径参数同样转换，单段 `/flag` 形式参数不转换
  - Windows 路径（`C:\`、`C:/`）、相对路径、UNC 原样保留
- 启动时新增支持 `cwd`（工作目录）与 `args`（启动参数）字段

**顺带修复**：`PathConverter.toWindows()` 的 `/mnt/`、`/media/` 盘符映射存在重复盘符 bug（`/mnt/c/xxx` 曾错误转换为 `C:c\xxx`），已改为按路径段正确拼接（`/mnt/c/Users/a.exe` → `C:\Users\a.exe`）

**支持示例**：
```json
{
  "name": "文件管理器",
  "exePath": "/opt/FileExplorer/OneCommander.exe",
  "icon": "/opt/FileExplorer/FileExplorer.ico",
  "cwd": "/opt/FileExplorer",
  "args": ["/mnt/c/Users/me/Desktop"]
}
```

### 12. 包管理器默认程序 UI（独立窗口，仅界面）

**用户需求**：
> 添加一个默认程序（以独立windows窗口呈现）。包管理器：样式参考Deepin的包管理器。布局：图标 / appname / (ver 小字) / (介绍 小字) / (取消)(安装)；小字可换成 卸载/升级/降级/重装。只写 ui 不写逻辑。

**实现方案**：
- 新增 `src/package-manager.html` / `package-manager.css` / `package-manager.js`：Deepin 安装确认风格的单应用卡片
  - 标题栏"包管理器"+ 关闭 ×，可拖动（`-webkit-app-region: drag`）
  - 主体居中：96px 图标（内置 SVG 占位）、应用名（普通字重）、版本小字、介绍小字
  - 底部右侧：取消（幽灵按钮）+ 安装（主题色填充按钮）；按钮处留注释，卸载/升级/降级/重装仅需替换标签
  - 主题跟随项目惯例：`body.theme-bright` 切浅色，主色 `--accent-color`（默认 `#0078D4`）
- `src/index.js` 新增 `pkgmanager:show` IPC：仿 `properties:show` 创建无边框窗口（420x560、居中、任务栏可见、非置顶、不可缩放），加载 package-manager.html，并在 `did-finish-load` 后下发主题
- `src/preload.js` 暴露 `pkgManager.show(options)` 与 `pkgManager.onTheme(callback)`
- 演示数据为 `package-manager.js` 顶部硬编码占位常量（应用名/版本/介绍），后续接真实数据时替换即可；取消/× 关闭窗口，安装按钮无逻辑

**说明**：按约定交付范围为 UI + 最小窗口外壳（不含 .app 入口、开始菜单接入与安装逻辑）；调用方式：`window.electronAPI.pkgManager.show()`，支持 `{ theme, accentColor }`。

---

### 13. 控制中心 WiFi / 蓝牙连接选择界面与笔记本亮度

**用户需求**：
> 选择 wifi 连接那个界面做出来。还有选择蓝牙连接的界面。并且要支持亮度调节如果用户是笔记本电脑。控制中心的生效速度真是太慢了。

**实现方案**：
- 控制中心新增两个选择视图（复用音量合成器的窗口内视图模式，动态调整窗口高度）：
  - **网络视图**（点击主面板"网络"进入）：状态卡（当前连接、信号、认证方式、WiFi 开关）+ 可用网络列表（信号格、加密标记、已连接/连接按钮）；加密且无已存配置的网络点击后内联弹出密码输入框，通过 `netsh wlan add profile` + `connect` 连接（原生，无第三方依赖）；有已存配置的直接连接
  - **蓝牙视图**（点击主面板"蓝牙"进入）：状态卡（蓝牙开关）+ 已配对设备列表（名称、状态、连接/断开按钮）；连接/断开走 `pnputil /enable-device|/disable-device`
- `sys.ps1` 新增命令：`wifiStatus`（含 `adapterEnabled`）、`wifiPower`、`wifiScan`（含 `hasProfile`，10 秒缓存）、`wifiConnect`/`wifiDisconnect`、`btDevices`（10 秒缓存）、`btConnect`/`btDisconnect`、`bluetoothStatus`（5 秒缓存）
  - `netsh wlan` 输出解析同时匹配中英文标签（SSID/State/信号/Authentication 等），兼容中文系统
  - 蓝牙配对设备通过 `BLUETOOTHDEVICE_` / `BTHLE\DEV_` 过滤并去重，排除服务配置文件
- **笔记本亮度**：能力探测新增 `isLaptop`（`Win32_ComputerSystem.PCSystemType = 2`），亮度滑块在 `brightness || isLaptop` 时显示
- **生效速度**：
  - 开关与视图内开关全部改为乐观更新（点击立即切换预期状态，操作完成后校准，失败回滚）
  - 启动预热链追加 `wifiStatus` / `btDevices` / `getVolume`
  - 服务端为 `wifiStatus` / `wifiScan` / `btDevices` / `bluetoothStatus` 增加 5~10 秒缓存，重复刷新不再触发慢查询（实测：`btDevices` 热缓存 16ms、`bluetoothStatus` 热缓存 2ms、`wifiStatus` 热缓存约 600ms）

**说明**：WiFi 连接使用 `netsh`（含 WPA2PSK 配置文件创建），蓝牙连接使用 PnP 设备启用/禁用，均为 Windows 原生方式；蓝牙"连接"语义为启用该配对设备。

---

### 14. 修复桌面/开始菜单应用图标全部回退默认

**用户反馈**：
> com.pacman.app 已经安装了，但是有一个问题：桌面上所有的图标都变成了默认的，没有动态使用图标。

**根因**：
- `app:getInfo` 用 `nativeImage.createFromPath()` 提取 exe 图标，但该 API 不支持 `.exe`（实测对 cmd.exe / msedge.exe / pacman.exe 均返回空图），图标仍以 exe 路径返回，被渲染端 `isValidImagePath()` 判为无效后全部回退 `difproico.png`
- `com.explorer.app` 指向的 `rootdir/opt/FileExplorer` 已被移除（现为 `Sigma File Manager`），该应用独立失效
- 桌面与开始菜单共用 `app:getInfo` 图标链路，一处修复两处生效

**修复**：
- `app:getInfo` 图标提取改为：
  - 图片扩展（png/jpg/jpeg/gif）用 `nativeImage.createFromPath` 快路径
  - `.ico` 用 `createFromPath`，空图时回退 `app.getFileIcon`
  - `.exe` 等程序文件用 Electron 官方 `app.getFileIcon(iconPath, { size: 'large' })`
  - 提取成功写临时 PNG（`${appName}-icon.png`）返回路径；失败保持原路径回退默认，不报错
- `com.explorer.app` 的 `exePath` / `icon` 修正为 `rootdir\opt\Sigma File Manager\sigma-file-manager.exe`

**实测**（隐藏 Electron）：`getFileIcon` 对 cmd.exe → 48x48、sigma-file-manager.exe → 32x32、desktop.ico → 256x256、png → 1024x1024，全部提取成功；裸 Windows 路径作为 `<img src>` 可正常加载，无需改渲染端。

**额外发现**：pacman 安装器把 `config.ini` 的 `root` 从 `rootdir` 改成了 `D:\Codewhale\workspace\amsys\root`（该目录为另一套 amsys 根，内含 browser/explorer/pacman/wps/testapp 等 .app 与对应 exe）。当前生效的 .app 来源是 D:\Codewhale 根，因此 `com.explorer.app` 的失效路径在**两处**（`rootdir` 与 `D:\Codewhale\workspace\amsys\root`）都已修正为 Sigma File Manager；此配置变更保留未回退（回退会隐藏已安装的 pacman/wps）。

---

### 15. 开始菜单显示全部应用 + 右键发送到桌面

**用户反馈**：
> 开始菜单里理应显示 /usr/share/applications 里面的所有 APP 文件，而不是只显示用户在桌面上有快捷方式的软件。添加功能：开始菜单里对软件图标右键可以发送到桌面并写入 ./config/{userid}/desktop.json。

**实现方案**：
- `src/index.js` 新增 `apps:listAll` IPC：经 amsys 转换器解析 `/usr/share/applications`（失败回退 `APP_ROOT/rootdir/usr/share/applications`），读取全部 `*.app`，经 `convertAppDataPaths` 转换 Unix 路径后返回 `{ appName, name, description, exePath, icon }` 数组
- `src/preload.js` 暴露 `apps.listAll()`
- `src/dashboard.js` `loadStartMenuApps()` 改为合并去重：`/usr/share/applications` 全部应用优先 + 用户桌面快捷方式补全（按 `start` 去重），不再只显示桌面快捷方式
- 开始菜单应用项新增右键菜单"发送到桌面"：调用 `config.addDesktopApp` 写入 `./config/{userid}/desktop.json`，网格级联自动定位（每行 5 个，间距 95x105），桌面已渲染则自动刷新；**允许重复添加**（桌面本就允许多个相同图标，不做禁用/去重）
- `src/dashboard.css` 新增 `.context-menu-item-disabled` 样式

**实测**：`apps:listAll` 逻辑在 Node 中复现验证，当前生效根（D:\Codewhale）正确列出 browser/explorer/pacman/wps 四个应用及其转换后的 exePath/icon。

**修复记录**：关机/重启/Shell 模式的确认弹窗弹出时开始菜单不再被自动关闭——移除三个电源按钮处理器中的 `closePowerSubmenu()/closeStartMenu()`，并让开始菜单外点关闭与电源子菜单外点关闭逻辑忽略弹窗（`.modal-overlay`）内的点击，ESC 在弹窗打开时也不再关闭开始菜单；弹窗取消后开始菜单保持原样，点击弹窗外部区域照常关闭。

**补充**：桌面图标右键菜单新增"移除"项（垃圾桶图标）——调用 `config.removeDesktopApp(userId, appId)` 从 `./config/{userid}/desktop.json` 删除对应快捷方式并刷新桌面；仅移除快捷方式，不影响应用本体与开始菜单条目。

---

### 16. Shell 模式界面被强制重新显示 & 内置窗口置顶修正

**用户反馈**：
> 进入 shell 模式后程序应当被直接最小化直到 amsys 关闭，但 amsys 启动后程序依然被强制显示。临时设置窗口没有做成独立的普通窗口，属性变成了置顶，不符合要求。

**修复**：
- Shell 模式：主窗口与桌面窗口每 2 秒的置底定时器会调用 `setWindowToBottom()`，其 PowerShell 置底脚本带 `SWP_SHOWWINDOW` 标志，会把 Shell 模式下已隐藏的窗口重新显示出来
  - `setWindowToBottom()` 增加 `isVisible()` 保护：隐藏窗口不再处理
  - 置底脚本的 `SetWindowPos` 标志去掉 `SWP_SHOWWINDOW`，消除"检查后、脚本执行前被隐藏"的竞态（对可见窗口无影响，置底行为不变）
- 内置窗口置顶修正：设置窗口（`settings:show`）与属性窗口（`properties:show`）`alwaysOnTop` 改为 `false`，成为普通窗口；锁屏、控制中心这类功能性弹窗保持置顶不变

---

### 17. amsys 路径动态解析（支持外部 amsys）

**用户需求**：
> 添加 amsys 路径的动态解析。通过内嵌的 amsys，读取配置文件里外部 amsys 的路径，然后程序调用外部 amsys。比如 amsys=/bin/com.amsys.app/amsys.exe

**实现方案**：
- `src/index.js` 新增 `getAmsysPath()`（带缓存）：
  - 读取项目根 `config.ini` 中的 `amsys =` 键（节无关，推荐放在 `[paths]`，与 pacman.ini 约定一致）
  - 值以 `/` 开头视为 Unix 风格路径，经内嵌路径转换（`PathConverter`）解析为 Windows 路径；也支持直接写 Windows 路径
  - 用 `fs.access` 校验存在性，未配置/无效时回退内嵌 `src/amsys/amsys.exe`
- 应用位置：
  - `startAmsysProcess()`（Shell 模式）改用动态路径；工作目录优先取外部 amsys 所在目录（其 `config.ini` 通常同目录），否则回退项目根
  - `app:launch` / `app:getInfo` 经 `resolveAmsysIfEmbedded()` 把指向内嵌 amsys 的 exePath（含内置 com.terminal 映射）替换为动态路径
- `config.ini` 新增 `[paths]` 节与注释模板（示例路径 `/bin/com.amsys.app/amsys.exe` 当前在生效根中不存在，未启用，注释保留）

**实测**（Node 复现）：无键→内嵌；Windows 路径存在（D:\Codewhale amsys）→ 使用外部；Unix 路径不存在→转换后校验失败回退内嵌；注释行不生效。

---

### 18. WiFi 开关事故与安全修复（严重：曾禁用整个无线网卡）

**决定性根因（第五轮实机反馈后定位，解释整场事故）**：
`sys.ps1` 的 `Invoke-SysCommand` 与 `audio.ps1` 的 `Invoke-AudioCommand` 的参数名
写作 `param([object[]]$args)`——**`$args` 是 PowerShell 自动变量，函数内永远指向
未绑定参数列表（空），根本拿不到调用方传入的值**。导致：
- `wifiPower` 的 `$args[0]` 恒为 `$null` → 分发逻辑永远算出 `enable=$false` →
  **无论 UI 点"开"还是"关"，程序实际执行的永远是"关闭无线电"**！
  这就是"关有效、开必败/回弹、外部正常内部不正常"的总根源——
  无线电从未被程序真正打开过，之前看到的"开启"都是驱动自恢复或外部开关所为
- `wifiConnect` 的 ssid 恒为空 → 连接任何网络都报 `no_ssid`（用户早期反馈的"无法连接"）
- `btConnect` / `btDisconnect` 恒拿到空 instanceId → 蓝牙设备连接/断开失效
- `setBrightness` 恒收到 `$null` → 亮度被设为 0
- `audio.ps1` 的 `setVolume`/`setMute`/`setDefaultDevice`/`setSessionVolume`/`setSessionMute`
  同样全部失效（setVolume 恒设为 0）

**修复**：两个文件的参数名改为 `$cmdArgs`，全部引用同步更新；
用只读/幂等测试验证：服务端 `wifiPower [true]`（无线电已开启）返回
`{"success":true,"enabled":true}` 且无线电保持开启（修复前同调用返回
`enabled:false` 并把无线电关掉）；audio `setVolume` 以当前值写回成功。
**教训：PowerShell 函数参数严禁命名为 `$args`。**

**连接状态同步修复（第六轮）**：
- 根因：`netsh wlan connect` 返回成功只是"命令被接受"，实际关联需数秒；
  界面只刷新一次就读到"未连接"且不再更新，造成"已连上但界面不显示"
- 修复：`wifiStatus` 新增 `connecting` 字段（匹配 associating/authenticating/
  正在连接/正在验证等状态）；连接成功后 UI 每 1.5s 轮询状态（最多约 18s）
  直到同步为"已连接"，期间状态卡显示"正在连接…"
- 密码入口：加密且无已存配置的网络按钮文案"连接"，
  点击弹出密码框（`showPasswordBox` 功能一直存在，`$cmdArgs` 修复后已可用）
- 清理控制中心的调试日志（build 标记、WiFi 开关成功路径日志），保留失败 console.error

**网络/蓝牙视图滚动与尺寸（第七轮）**：
- 根因：`html/body` 未设 `height: 100%`，`.view` 的 `height: 100%` 失效，
  列表撑出窗口后被 `body { overflow: hidden }` 裁掉，滚轮永远无内容可滚
- 修复：`html, body { height: 100% }` 补齐高度链，`.sessions-list`
  （`overflow-y: auto; flex: 1; min-height: 0`）成为真正的滚动容器，滚轮可滚动查看更多 WiFi
- 尺寸：网络/蓝牙视图打开时不再放大窗口（`resize(340,560/540)` → `resize(320,420)`），
  与原控制中心保持一致；音量合成器视图仍保持 340x520

**蓝牙配对套件 + WiFi 右键菜单（第八轮）**：
- 已配对列表重构：Win32 `BluetoothFindFirstDevice`（remembered）为主、注册表
  `BTHPORT\Parameters\Devices` 兜底/地址规范源；地址统一为注册表/PnP 显示序
  （API ulong 按大端存显示序）；按名称去重并优先规范地址；状态仅 未连接/已连接
- 新命令：`btDiscover`（inquiry≈4s，过滤已配对）、`btPair(address,pin)`（空 pin 自动试
  空串/0000/1234，需配对码时返回 `pinRequired` 由 UI 弹输入框）、`btUnpair`、
  `btInfo`（名称/地址/类别/连接/认证/服务）、`wifiForget`（netsh delete profile，
  需检查输出文本——netsh 对不存在的配置也返回 0）
- `btConnect/btDisconnect` 入参改为 MAC 地址，服务端解析对应 PnP 实例后沿用 pnputil
- UI：蓝牙默认只显示已配对（连接/断开按钮）；底部"显示所有设备"切换显示未配对设备
  （状态"未配对"+配对按钮）；右键菜单（蓝牙=连接/断开、取消配对、属性；WiFi=连接/断开、
  忘记、属性）；配对码弹窗；属性弹窗；忘记/取消配对带确认弹窗
- **pwsh7 预留**：`$script:IsPwsh7` 检测 + `$script:btWinRtEnabled=false` 开关；
  `btDiscover/btPair/btUnpair/btInfo` 均为薄封装，WinRT 分支（`*-WinRT` 桩）已写好
  契约注释（FindAllAsync(BluetoothDevice.GetDeviceSelector) + ProvidePin/PairingRequested），
  将来内置 pwsh7 置开关为 true 即可，UI/IPC 不变；Win32 路径在 pwsh7 下同样可编译运行
- **连接/断开 `action_failed` 修复（第九轮）**：pnputil 启用/禁用设备需要管理员权限，
  非提权运行时全部失败。改为**首选 `BluetoothSetServiceState`**（Win32 服务连接 API，
  无需管理员、语义正确——手机等设备按服务连接），遍历设备已安装服务（无则回退
  OPP/OBEX FTP/PBAP/A2DP/HFP/SPP/HID 常用 GUID）；失败再回退 pnputil 并检测管理员
  返回 `admin_required` 友好错误。注意 C# 中 foreach 迭代变量不能按 ref 传参（CS1657）
- **"成功但未连接 / 二次点击 action_failed"修复（第十轮）**：
  - `BluetoothSetServiceState` 对不在范围/不支持服务的设备也会返回 0（命令被接受≠已连接），
    故连接后必须复查 `BluetoothGetDeviceInfo.fConnected`，如实返回 `connected` + 说明文案
  - 服务已启用后再次启用会报错并落到 pnputil → `action_failed`；改为**先查已连接则直接成功**，
    失败时把服务错误放入 `detail` 供界面展示
  - 手机类设备语义：按服务连接（OBEX 传文件/A2DP 音频），不存在持久"已连接"；
    UI 在"已发送请求但未连接"时显示说明而非报错
- **ERROR_SERVICE_NOT_FOUND(0x424) 处理（第十一轮）**：手机（如 AmengBro）未注册可被
  `BluetoothSetServiceState` 激活的经典服务，所有 GUID 均返回 0x424。识别该错误后
  不再落到无意义的 pnputil，返回 `service_not_found` + 说明文案，UI 提供
  "打开蓝牙文件传输"按钮一键启动 `fsquirt.exe`（Windows 原生 OBEX 向导）；
  pnputil 兜底仅保留给 BTHLE 设备
- **BLE 设备 0x80070057 + 报错框布局（第十二轮）**：
  - 无名/LE 设备（BTHLE）地址在经典 Win32 API 下查找即返回 E_INVALIDARG(0x80070057)；
    `btConnect/btDisconnect` 改为**先判断实例类型，BTHLE 直接走 pnputil**（跳过经典 API），
    并附说明"需管理员权限"
  - 报错框长文本会压缩按钮：`service_not_found` 提示改为**文案内嵌可点击链接**
    "蓝牙文件传输"（`.link-text` 样式）一键启动 fsquirt，不再使用独立按钮；
    `.mixer-error span` 允许换行
- **连接失败提示简化（第十三轮）**：管理员模式下部分设备仍无法连接（设备拒绝或需专门软件）。
  除 `service_not_found`（内嵌文件传输链接）与 `admin_required` 外，一律显示
  "设备拒绝连接或需要专门软件"；原始错误码仅进 console 与报错框 title（悬停可见），
  避免长文本撑爆 320px 提示框（`.mixer-error span` 加 word-break/overflow-wrap）

**用户反馈**：
> 你的 wifi 开关有严重问题，直接让我的电脑 wifi 瘫痪了，原本系统的 wifi 开关已经完全消失了。
> 我终于发现了你的 wifi 开关根本不是控制 wifi 是否启用，而是控制是否启用用户的 wifi 适配器！

**事故根因**：
- `src/scripts/sys.ps1` 旧 `Invoke-WifiPower` 用 `netsh interface set interface name="WLAN" admin=disabled/enabled`
  直接停用/启用整个无线网卡适配器。禁用适配器后，Windows 设置中的 WiFi 开关消失，
  与系统"WiFi 开关"（软件无线电状态）完全是两回事。
- 另一处隐患：`Get-NetAdapterName()` 会选中任意"Up 的有线物理网卡"，在纯 WiFi 笔记本上
  会选中 WLAN 适配器，导致 `networkToggle`（`system:toggleNetwork`）同样可能禁用无线网卡。

**修复方案（最终采用）**：
- **WiFi 开关**（`Invoke-WifiPower` / `wifiPower` 命令）：wlanapi `WlanSetInterface`
  radio_state（opcode=4）切换软件无线电状态，与 Windows 系统 WiFi 开关等效：
- **逐个写入所有有效 PHY**（12 字节 `WLAN_PHY_RADIO_STATE`：dwPhyIndex + software + hardware，hardware 忽略）；
  先做幂等判断（当前状态已等于目标则直接返回），切换时才写——
  这既避免了"已开启时重复写 ON 触发驱动异常关断"（历史事故），
  又解决了"只写首个 PHY 无法把无线电重新打开"（AX201 实测：上电必须写全部 PHY，
  用户实机曾因此出现"开启后开关反弹"）
  - 写入后轮询查询状态直到收敛（关闭约 1~2 秒、开启约 10 秒，最长等 25 秒），返回真实最终状态
  - 无需管理员权限、不依赖 netsh 接口可见性；网卡适配器与系统 WiFi 开关完全不受影响
- **连接即开启**：`wifiConnect` 前先用 wlanapi 确保无线电开启，再尝试恢复 `autoconfig enabled=yes`
  （需要管理员，失败忽略），最后 `netsh wlan connect`（失败时返回 netsh 原文便于排查）
- **网络开关**（`Invoke-NetworkToggle` / `networkToggle`）：`Get-NetAdapterName()` 增加
  `-notmatch 'Wireless|Wi-Fi|WLAN|无线|Bluetooth'` 过滤，只能操作有线网卡，任何情况下都不可能再碰无线网卡
- **状态展示**：`wifiStatus` 返回 `radioEnabled`/`hardwareEnabled`（wlanapi 只读查询）、
  `autoConfigEnabled`（`netsh wlan show settings` 解析，仅作提示）；UI 开关直接反映无线电状态
- **消除开关反弹**：开关点击后乐观更新 + loading，失败时显示具体错误（不再盲目回滚），
  操作结束统一以服务端返回的真实状态重新渲染
- **"开关无法停在开启位置"根因（第二轮实机反馈）**：状态读取与收敛判断曾使用"全部 PHY 都 on"
  作为无线电开启标准；多 PHY 网卡（AX201 有 6 个 PHY）上若个别从属 PHY 保持 off，
  会导致 35 秒收敛超时→判失败→开关弹回，而 Windows 只看主 PHY（外部开关正常）。
  已改为**状态与收敛只取首个有效 PHY**（与 managednativewifi / Windows 判定一致），
  写入仍写全部 PHY（上电必需）
- **日志降噪**：`forceWindowToBottom` / `setWindowToBottom` / `forceWindowToBottomWithNircmd`
  每 2 秒执行一次且打印约 20 行调试日志，已全部移除（保留失败时的 console.error）
- **"瞬间回弹且无报错"根因（第三轮实机反馈）**：开关失败时错误框先显示、随后被
  `loadNetwork(true)` 立即隐藏，用户看不到任何错误。已改为"先渲染实际状态、再显示错误"，
  错误信息保持可见；另给 `WlanSetInterface` 增加 500ms 单次重试以吸收驱动瞬时错误
- **"无任何输出"排查（第四轮）**：确认绑定链路完整（`initControlCenter`→`bindNetworkView`→
  `btn-wifi-power`，preload 经 contextBridge 暴露 `setWifiPower`）。
  真正的隐患是**控制中心窗口创建一次后永久复用**（`control-center:show` 直接 show 不重载），
  且 sysServer 在应用启动时加载旧 `sys.ps1`——未完全重启时窗口/服务器均为旧代码。
  已修复：开发模式下每次显示控制中心强制 `webContents.reload()`；
  控制中心启动打印版本标记（`[控制中心] build: 2026-08-10-r3`）；
  开关操作打印 `[WiFi开关] 点击/IPC 返回/异常` 日志；绑定函数逐个 try/catch 防中断
- **自动配置处理（"找不到网络"根因）**：自动配置关闭时 `netsh wlan show networks` 失败，
  程序会误显示"未扫描到可用网络"。新增 `Enable-AutoConfig`：扫描/连接/开启 WiFi 前自动尝试
  `netsh wlan set autoconfig enabled=yes`（需要管理员权限）；失败时 `wifiScan` 返回
  `autoConfigOff=true`，UI 明确提示"自动配置已关闭"并给出管理员命令，不再误导用户

**wlanapi 无线电状态写入试验记录（重要，勿重蹈覆辙）**：
- 曾按社区方案实现 `WlanSetInterface`（opcode `wlan_intf_opcode_radio_state`=4），
  数据为单个 `WLAN_PHY_RADIO_STATE`（12 字节：dwPhyIndex + software + hardware），需逐 PHY 调用；
  `WLAN_RADIO_STATE` 查询结构固定 64 项（`WLAN_MAX_PHY_INDEX`），返回 4+64*12=772 字节
- `DOT11_RADIO_STATE`：unknown=0 / on=1 / off=2（off 不是 0）
- 实测（AX201，6 PHY）发现：**无幂等保护时循环写全部 PHY 是"开启请求触发关断"的元凶**
  （与 CLI 布尔解析 `[bool]'false'=$true` 叠加造成多次误操作）；
  但**只写首个 PHY 时无线电无法重新上电**（用户实机反馈：程序内开启后开关反弹、
  外部系统开关正常），最终方案为"幂等判断 + 全部 PHY 写入 + 收敛轮询（35 秒上限）"
- **netsh autoconfig 方案已被否决**（曾短暂采用）：`netsh wlan set autoconfig` 需要管理员权限，
  非提权运行时必定失败；且 autoconfig 关闭后 netsh wlan 会"丢失"接口，后续 `set autoconfig`/
  `connect` 全部报参数错误，必须重启适配器才能恢复（用户实机踩坑）
- 结论：**最终方案 = wlanapi 无线电状态写入（幂等判断 + 全部 PHY）+ 收敛轮询**，无需管理员、不依赖 netsh

**控制中心全面审核结果**：
- **WiFi 开关（`wifiPower`）**：wlanapi 无线电状态，幂等判断 + 全部 PHY 写入；
  实测适配器 AdminStatus 全程保持 Up，系统设置 WiFi 开关不受影响；
  属于"关断无线电"的正常开关行为，无适配器级危险
- **网络开关（`networkToggle`）**：`netsh interface set interface admin=disabled/enabled` 仍存在，
  但 `Get-NetAdapterName()` 已排除无线/蓝牙网卡，只能操作有线网卡；且 UI 无任何调用（仅 preload 暴露）
- **关机/重启（`auth:shutdown`/`auth:restart`）**：`spawn shutdown /s|/r /t 0` 是即时关机命令；
  当前 renderer.js 的 `handleShutdown`/`handleRestart` 只弹确认窗、**并未调用** `power.shutdown()/restart()`，
  所以当前不可达（属功能 bug，不是危险源）；若日后接上必须保留确认弹窗
- **蓝牙开关（`bluetoothToggle`）**：`pnputil /disable-device` 禁用蓝牙无线电设备（同类模式、可恢复，
  不影响 WiFi），建议后续迁移到 Windows RadioManagement API
- **飞行模式（`flightToggle`）**：注册表 `SystemRadioState`，会按预期同时关闭/开启 WiFi 与蓝牙无线电
- **`system:exec`（`src/index.js`）**：任意命令执行 IPC 且 preload 暴露给渲染层，存在安全隐患；
  当前 UI 无任何调用，建议后续移除或加白名单
- 夜间模式（CloudStore）、亮度（WMI）实现安全，无需修改
- 音量合成器（Core Audio COM 互操作）不涉及网卡/系统开关，安全

**恢复命令（用户实机若再遇适配器被禁用）**：
```powershell
Get-NetAdapter -Name *Wi* | Enable-NetAdapter
# 或
netsh interface set interface name="WLAN" admin=enabled
```

**注意**：修改 `sys.ps1` 后必须重启 AmengUI（常驻 PowerShell 服务进程内仍是旧代码），
修复才能生效；`sys.ps1` 需保持 UTF-8 带 BOM（PowerShell 5.1 中文解析要求）。

---

### 19. pwsh7 路径可配置（支持便携版）

**用户需求**：
> 程序逻辑里面调用 pwsh7 的部分采用可配置路径，可以使用便携版的 PWSH

**背景**：此前 `getPwshPath()` 的解析链为 内置 `PowerShell/7/pwsh.exe` → 系统 PATH `pwsh` →
`powershell`（5.1）。仓库中并未实际内置 pwsh7，因此多数环境实际跑在系统 PowerShell 上；
且用户希望能在不安装 pwsh7、不依赖系统 PowerShell 的前提下，直接指向自己的便携版 pwsh。

**实现方案**（与 amsys 路径动态解析同模式，`config.ini` 的 `[paths]` 节）：
- `config.ini` 新增 `pwsh =` 键（注释模板）：支持 Unix 风格路径（如 `pwsh=/opt/pwsh/pwsh.exe`，
  经内嵌转换解析）、Windows 绝对路径、相对项目根的相对路径三种写法
- `getPwshPath()` 解析链调整为：
  1. `config.ini` 中 `pwsh =` 配置的路径（`fs.access` 校验存在性，无效则警告并忽略）
  2. 内置 `PowerShell/7/pwsh.exe`
  3. 系统 PATH 上的 `pwsh`（`where pwsh` 验证存在才采用，避免误伤仅装 PS5 的机器）
  4. 回退 `powershell`（5.1，最后手段，解析时 console.warn 提示一次）
- 结果缓存于 `resolvedPwshPath`，全程只解析一次；所有调用点（控制中心常驻服务
  `PwshServer`、Shell 模式 `startAmsysProcess`、置底 `forceWindowToBottom`）都经
  `getPwshPath()`，一处修改全部生效
- 顺带：`isTerminal` 终端程序检测补充 `pwsh.exe`，`.app` 指向便携版 pwsh 时也能正确分配控制台

**实测**（Node 复现解析逻辑）：配置存在路径→优先使用；配置无效→警告后回退；
`pwsh` 键被注释/无 config.ini→系统 PATH pwsh；解析链自上而下逐级降级，无空档。

---

### 19. 真正的设置页面（WinUIonWeb 风格，独立窗口）

**用户需求**：
> 为这个程序制作一个真正的设置页面，提供界面布局（左侧账户 + 分类导航，右侧主页
> 含设备卡片与推荐设置），风格设计为 WinUIonWeb，内部的设置项先为空（除了个性化）。

**实现方案**：
- 新增四文件：
  - `src/winui-theme.css`：从 winui-web-design skill 拷贝的完整 Fluent 2 明暗主题令牌
    （`--app-bg`/`--card-bg`/`--subtle-*`/`--accent-base` 等，全部组件只消费令牌）
  - `src/settings.html` / `src/settings.css` / `src/settings.js`：设置页 UI 与逻辑
- 窗口外壳：无边框 1040x720（最小 860x560，可缩放/最大化），自定义标题栏
  （`-webkit-app-region: drag` + 搜索框 + 最小化/最大化/关闭按钮），`settings:windowAction`
  控制窗口、`settings:maximized` 同步按钮状态
- 布局与交互：
  - 左侧 280px 导航：账户卡片（当前登录用户/最近登录用户：用户名、邮箱、头像、角色）
    + 12 个分类项（主页/系统/蓝牙/网络/个性化/应用/账户/时间/游戏/辅助功能/隐私/更新），
    选中项左侧 3px 强调色指示条 + subtle 填充；支持方向键/Home/End 键盘导航
  - 标题栏"查找设置"实时过滤导航项，Enter 跳转首个结果，无结果显示"未找到…"
  - 主页：设备卡片（Windows 图标 + `os.hostname()` 设备名 + WMI 型号 + 重命名对话框
    （演示）+ WiFi 状态行（复用 `system:getWifiStatus`，显示已连接 SSID））+ 推荐设置
    卡片（安装的应用→应用页、存储→系统页、个性化→个性化页）
  - 个性化：背景（`dialog:selectImage` 选图/清除）、颜色（亮/暗主题单选卡 + 19 个
    强调色预设 + 自定义取色器）、任务栏（浮动/停靠）；变更经原有 `settings:change`
    IPC 广播给 dashboard 持久化生效
  - 其余页面为 WinUI 风格空状态占位（"设置项为空"，后续版本填充）
- 主进程改造：`settings:show` 由内嵌 346 行临时 HTML 改为加载 `settings.html` 并
  `did-finish-load` 后推送 `settings:theme`（主题/强调色/任务栏/背景/设备名/账户）；
  `settings:getDeviceInfo` 经 `getPwshPath()` + `Get-CimInstance Win32_ComputerSystem`
  查询型号（8s 超时，会话级缓存）；`preload.js` 新增
  `settings.change/onTheme/onMaximized/windowAction/getDeviceInfo`
- 设计规则：控件高 32px、圆角 4px、状态填充用 subtle 令牌而非换色、卡片 8px 圆角、
  Segoe UI Variable 字体栈、页面切换 200ms 淡入位移（`prefers-reduced-motion` 下禁用）

**实测**（独立 Electron harness，stub preload）：22 项 DOM/交互断言全部通过——导航 12 项、
默认主页、暗/亮主题切换与强调色覆盖（`--accent-user`）、色板 19 色、任务栏/主题选项同步、
空页面生成、搜索过滤、重命名对话框预填与本地更新、`settings:change` IPC 发出；
计算样式复核：暗色 `#202020`/内容区 `rgba(48,48,48,.3)`、亮色 `#F3F3F3`、
选中项强调指示条与设备徽标均随 `--accent-user` 变化。

**说明**：设备重命名为界面演示（确认后仅本地更新标签，系统级重命名需管理员权限，后续接入）；
账户卡片的邮箱字段读取 `user.email`，用户模型暂无该字段时显示角色（管理员/标准用户）。

---

### 20. 浮层窗口层级修复：开始菜单 / 日期菜单 / 控制中心悬浮于所有窗口之上

**用户反馈**：
> 部分窗口层级不对，比如说开始菜单、日期菜单、控制中心理应可以悬浮在所有窗口之上，
> 不应该受到置于底部的限制。

**根因**：
- 开始菜单与日历原本是 dashboard 窗口内的 DOM 弹窗，而 dashboard 每 2 秒被
  `SetWindowPos(HWND_BOTTOM)` 压到底部（桌面必须保持在应用之下），因此弹窗必然被
  任何应用窗口盖住——同一窗口内无法同时满足"桌面置底"与"菜单置顶"
- 控制中心已是独立 `alwaysOnTop` 窗口，但显示时未重新断言置顶，个别场景可能丢失
  `WS_EX_TOPMOST`

**实现方案**：
- 开始菜单与日历抽为独立置顶透明窗口（与控制中心同构）：
  - 新增 `src/start-menu.html/css/js`（400x500，主屏左下角）与
    `src/calendar.html/css/js`（280x384，主屏右下角），样式沿用原内嵌弹窗视觉
  - 窗口参数：`frame:false`、`transparent:true`、`alwaysOnTop:true`、
    `skipTaskbar:true`、不可缩放；`blur` 延迟 200ms 隐藏（避免点击任务栏按钮时
    blur 先触发导致"关不掉"的竞态，toggle 处理器会先清掉待执行的隐藏定时器）；
    ESC 隐藏（确认弹窗打开时除外）
  - 位置随任务栏模式浮动/停靠（上沿 56/48px + 8px 间距），每次显示时按
    dashboard 传入的 `isTaskbarFloating` 重新定位
- 主进程新增 IPC：`startmenu:toggle/hide/desktop-added`、
  `calendar:toggle/hide`；`startmenu:desktop-added` 转发 `desktop:refresh` 给
  dashboard 刷新桌面网格；`startmenu:theme` / `calendar:theme` 在
  `did-finish-load` 后推送主题/强调色/账户（复用 settings 的推送模式，账户解析抽为
  `resolveAccount()` 与 settings 共用）
- preload 新增 `startMenu` / `calendar` / `desktop.onRefresh` API；
  dashboard 移除旧弹窗 DOM/CSS/逻辑，开始按钮/时间按钮改为 toggle 调用，并通过
  `startmenu:state` / `calendar:state` 同步按钮高亮态
- 控制中心加固：`control-center:show` 与 `on('show')` 时 `setAlwaysOnTop(true)` +
  `focus()`；Shell 模式进入与锁屏时统一 `hideOverlayWindows()` 清理三个浮层

**实测**（Electron harness + stub preload，28 项断言全部通过）：开始菜单用户名/应用
列表合并去重/启动应用/右键发送到桌面/电源子菜单/ESC 与弹窗守卫；日历 42 格/月份切换/
时钟刷新/亮色主题与强调色；dashboard 按钮 toggle 调用与高亮同步、旧弹窗移除。
窗口置顶与 Z 序需实机人工验收（见测试计划）。

**说明**：任务栏本身仍在置底桌面窗口内（最大化应用会盖住任务栏），本次按范围约定未处理；
电源按钮"关机/重启"仍保持迁移前的确认弹窗行为，未真正调用系统关机（既有问题，未在本次修复）。

---

### 21. 任务栏右键菜单（设置 / 任务管理器）+ SystemInformer 路径修复

**用户需求**：
> 右击任务栏时有两个选项：设置、任务管理器。任务管理器已经通过包管理器安装。
> （随后反馈启动报错：spawn ...\opt\com.sysinformer.app\SystemInformer.exe ENOENT）

**根因**：
- 任务栏此前没有任何右键菜单
- 包管理器安装的 `com.sysinformer.app` 配置里的目录名写成了单点
  `com.sysinformer.app`，而实际安装目录是**双点** `com.sysinformer..app`，
  导致 `app:launch` spawn 时 ENOENT；图标也指向了不存在的 exe 路径

**修复**：
- 修正 `D:\Codewhale\workspace\amsys\root\usr\share\applications\com.sysinformer.app`：
  `exePath` 改为 `...\opt\com.sysinformer..app\SystemInformer.exe`，
  `icon` 改为同目录现成的 `icon.png`（当前生效根由 config.ini 指向 D:\Codewhale，
  项目自身 rootdir 无此应用，无需同步）
- dashboard 新增任务栏右键菜单（复用 `.context-menu` 样式与 `closeContextMenu()`）：
  - **设置** → 现有 `openSettings()`（WinUI 设置窗口）
  - **任务管理器** → `app.launch('com.sysinformer.app')`，失败弹 alert
  - `MENU_ICONS` 新增 `taskManager` 图标；`bindTaskbarContextMenu()` 挂在
    `#taskbar` 的 `contextmenu` 上（preventDefault + stopPropagation，与桌面
    `#desktop-apps` 的右键菜单互不干扰）

**实测**（Electron harness + stub preload，7 项断言全通过）：右键任务栏弹出菜单且含
“设置/任务管理器”；点击任务管理器调用 `launch('com.sysinformer.app')`；点击设置调用
`settings.show`；点击后菜单关闭；桌面空白处右键仍为桌面菜单。`.app` 修正后
`Test-Path` 确认 exe/icon 均存在，开始菜单应用列表也会随之出现该项。

**后续修复（第二轮反馈）**：
- **右键菜单超出窗口/屏幕边缘**：新增 `clampContextMenuToViewport()`，菜单插入 DOM 后按
  视口尺寸钳制（四周留 8px），任务栏菜单与桌面菜单统一生效
- **启动任务管理器报后缀重复（com.sysinformer.app.app）**：任务栏菜单直接传了带 `.app`
  的完整名，而 `app:launch` / `app:getInfo` 会无条件再拼 `.app`。在 IPC 层新增
  `normalizeAppName()`（去掉尾部 `.app`，大小写不敏感），两个处理器统一使用，
  带不带后缀的调用方均兼容
- 实测：钳制 6 项断言全通过（右/下/左边缘）；`normalizeAppName` 单测覆盖
  `com.sysinformer.app` / `com.sysinformer` / `COM.TERMINAL.APP`

---

### 22. 设置-账户主页（WinUI 卡片风格）

**用户需求**：
> 接下来做账户界面：账户主页 = 头像 + 用户名 + 角色徽章【管理员】（或所有者/用户），
> 下方“账户设置”三个入口：你的信息（个人资料/头像）、登录选项（密码）、
> 其他账户（管理此电脑上的其他用户，仅对 sudo/root 开放）。

**实现方案**：
- settings.html 新增静态账户页 `<section data-page="accounts">`（复用 WinUI 卡片体系）：
  - 账户信息卡：64px 圆形头像（有 photo 显示图片，否则强调色占位图标）+ 20px 用户名
    + 角色徽章胶囊（12px、subtle 填充、圆角）
  - “账户设置”三张 SettingsCard：你的信息 / 登录选项 / 其他账户，均带图标与 chevron，
    可点击（hover/pressed/focus 状态），子页面后续版本实现（title 提示“功能开发中”）
- settings.js 收到 `settings:theme` 的 account 后填充主页名称/徽章/头像，并按
  `account.permi` 控制“其他账户”卡片显隐（root/sudo 显示，user 隐藏）
- index.js `resolveAccount()` 新增 `permi` 字段；角色徽章映射统一为
  root/sudo → “管理员”，user → “用户”（替代原“超级用户/标准用户”文案）

**实测**（Electron harness，11 项断言全通过）：标题/用户名/管理员徽章、root 可见
“其他账户”、三行设置项与 chevron、返回按钮；切换普通用户后名称/徽章更新且“其他账户”
隐藏；返回主页正常。

**第二轮（账户页长格式与个人资料编辑）**：
- 展示用户名改为长格式 `Nick(username)`（昵称=passwd 字段5，登录名=字段1）；
  `resolveAccount()` 新增 `loginName` / `nickname` 字段，`getUsers()` 补充
  `loginName`（均为增量字段，不破坏旧调用方）
- “你的信息”卡片改为可展开面板（grid 0fr→1fr 展开动画，chevron 旋转）：
  - 个人信息区：用户名（登录名）/ 用户编号（UID）/ 你的权限（角色徽章）
  - 全名输入框 + 【更改】；更改我的头像 + 【更改】；操作结果用内联状态提示
- 全名修改走 `config.updateUser(userId, { nickname })`：新增 nickname 更新路径，
  只改 passwd 字段5（全名）与 home 目录（`/home/{昵称}` 跟随重命名），登录名不变；
  写回 passwd/shadow 后经 `syncUsersFromPasswdShadow()` 重建 users.json 与
  config.json login 块——保证 2 秒配置监听（`checkConfigChanges`）不会把改动覆盖掉
- 头像修改走 `config.updateUser(userId, { photo })`（photo 仅存 config.json，
  passwd/shadow 不变）
- 实测：config 层真机写入测试（临时用户 add → nickname 改 → passwd/getUsers 断言 →
  delete 清理）通过：登录名不变、昵称与 home 更新、清理干净；设置页 harness 13 项
  断言全通过（长格式、展开内容、改名/头像调用与渲染、收起）

---

**控制中心尺寸/桌面右键/开始菜单右键（第十四轮）**：
- 音量合成器开关后面板尺寸残留：`closeMixer` 改为 await resize(320,420)；
  开发模式 `control-center:show` 重载后重置窗口为 320x420（重载必然回主视图）
- 桌面无图标时空白右键失效：`loadDesktopApps` 此前在无应用时提前 return，
  容器与 contextmenu 监听从未创建；改为**先建容器再判断**，空桌面也可右键
- 开始菜单程序右键菜单新增"打开"（launch）与"属性"（properties 窗口），
  带分隔符与图标；`showStartMenuProperties` 复用 getAppInfo/getSettings 组装数据
- **混音器尺寸方案定稿（第十五轮）**：用户要求**打开音量合成器不再改变面板尺寸**。
  移除 `openMixer/closeMixer` 的全部 resize 调用，所有视图恒定 320x420；
  混音器会话列表在 320 宽度下滚动显示，杜绝尺寸残留（原 340x520 切换方案废弃）

---

### 23. 配置目录迁移至 amsys 虚拟根 + 密码/用户名同步（MD5 无盐 + 完全重建）

**用户需求**：
> 为了与后端接轨，请把 ./config 目录改为 amsys 虚拟根的 /etc/system/core。
> 每个用户的密码会在启动时从 config 同步到 /etc/shadow，用户名也会同步到 passwd。
> 两个配置文件存储格式参考 amsys README 的说明。

**决策确认**：
1. 同步策略 = **完全重建**（以 AmengUI config 为唯一权威，清掉 amsys 其他用户）
2. 旧 `./config/` 目录**保留**，迁移后归档为 tar
3. UID 分配**遵循 amsys 规则**（同用户名沿用原 UID，新用户从 1000 递增）

**实现方案**（`src/config.js`）：
- `getAmsysRoot()`：同步读取 `config.ini` 的 `[system] root`（相对路径相对 APP_ROOT 解析，
  与 amsys 路径转换器逻辑一致），失败回退项目内 `rootdir`；导出 `AMSYS_ROOT`
- `CONFIG_DIR` 由 `{APP_ROOT}/config` 改为 `{AMSYS_ROOT}/etc/system/core`，
  所有读写（users.json / system.json / {userid}/config.json / desktop.json）自动跟随
- `syncPasswdShadow()`：完全重建 amsys 的 `/etc/passwd` 与 `/etc/shadow`
  - passwd（7 字段）：`username:PERM:UID:GID:comment:home:/bin/amsys`，
    PERM 为权限（root/sudo/user）记录在第 2 位，按 UID 排序
  - shadow（8 字段）：`username:md5hash:0:99999:7:::`，空密码字段留空
  - UID：root（permi=root）固定 0、home `/root`；普通用户从 1000 递增，
    同名用户沿用现有 passwd 的 UID（跨重建保持一致），新用户取空闲值
  - 空用户名（脏数据，如 userid 1 空名）不写入 passwd/shadow
  - 写入前备份现有文件为 `.bak`（沿用 amsys 的 shadow.bak 惯例）
- 同步触发：启动 `initConfig()` + `addUser`/`updateUser`/`deleteUser`/`setPermission` 后
- `migrateLegacyConfig()`：幂等迁移旧 `./config` 数据到新位置，并用 Windows 自带 tar
  归档为 `config-backup-{ts}.tar`（输出文件名用相对路径 + cwd，
  避免含盘符冒号的绝对路径被 bsdtar 误判为 host:path 远程主机）；
  顺带清理旧目录中的无效空目录（如 `undefined`）

**实测**（Node 直测，全部通过）：
- 迁移：旧 config → `D:\Codewhale\workspace\amsys\root\etc\system\core`，
  目录结构（users.json/system.json/{userid}/config.json/desktop.json）完整；
  幂等（二次调用返回 false）；`undefined` 空目录被清理；tar 归档成功
- 同步：全新环境 UID 从 1000 分配（Ad=1000/root1=1001/root2=1002）；
  root 固定 UID 0 且 home=/root；同名用户沿用旧 UID
- 增删改链路：addUser 即时写入 passwd/shadow；updateUser 改密 → shadow 哈希更新；
  提升 root → passwd home 变 /root 且 UID 0；deleteUser 同时从两文件移除
- 空密码用户 shadow 行 `user::0:99999:7:::`；空用户名不进 passwd
- 登录回归：root/root、Ad/123456 均通过；桌面配置读写正常（user2 桌面 7 个应用）

**说明**：密码仍是无盐 MD5（`config.json` 与 `/etc/shadow` 共用同一密文），
与 amsys 后端格式一致；`users.json` 仍不存密码。

**后续修复（第二轮反馈）**：
- **运行时 config 变更即时同步**：原实现只在启动（`initConfig`）与增删改时同步，
  用户在应用运行中直接改 `config.json` 的 username 后不会同步到 passwd。
  新增 `startConfigWatch()`：每 2 秒轮询 `users.json` 与各 `{userid}/config.json`
  的 mtime，变化时自动重建 users.json 并同步 passwd/shadow；
  `index.js` 在 `initConfig()` 后启动、`before-quit` 时停止
- **UID 冲突修复**：原分配逻辑 `uidSet` 初始为空，新用户直接抢占 1000，
  与同名沿用用户冲突（复现：rot 与 Ad 同为 UID 1000）。改为两遍分配——
  第一遍收集 root 固定 0 与同名沿用候选并按 userid 排序、同一 UID 只给第一个；
  第二遍其余用户从 1000 取空闲值；损坏数据自动收敛且二次同步幂等稳定
- **幂等写盘**：`saveUsers` 与 `syncPasswdShadow` 内容无变化时不写盘，
  消除监听自触发循环（同步重写 users.json → 触发再同步）

**实测**：监听启动后改 `config/1/config.json` 的 username → 约 2 秒内自动同步
到 passwd（仅触发一次，无自触发循环）；UID 重复检测通过；二次同步稳定。

---

### 24. /etc/passwd 权限字段迁移（第 2 位记录权限）

**用户反馈**：
> /etc/passwd 原本用来记录用户权限的那一位现在变成了用户昵称记录位，
> 需要把原来的密码记录位（如今全部为 x 的那一位）用于记录用户权限，
> 提供 root、sudo 和 user 三种权限。

**背景**：
- 旧格式 `username:x:UID:GID:comment:home:/bin/amsys` 中第 2 位是密码占位 `x`
  （密码实际存于 `/etc/shadow`），第 5 位 comment 被用于存放用户昵称（用户名）
- 权限此前只存在于 `users.json` 的 `permi` 字段，passwd 中无权限信息

**变更**：
- passwd 新格式（7 字段）：`username:PERM:UID:GID:nickname:home:/bin/amsys`
  - 第 2 位由密码占位 `x` 改为权限字段 PERM，取值 **root / sudo / user**
  - 第 5 位 comment 继续作为用户昵称
  - 权限不在三值范围内的旧数据（含 guest）统一归一为 `user`
- `setPermission()` 权限集合由 root/sudo/user/guest 收敛为 **root/sudo/user**
- 写入端同步更新：
  - `src/config.js syncPasswdShadow()`：从 `users.json` 按 `permi` 写入第 2 位
  - `com.amsys.app/src/shell.cpp ensure_passwd()`：重建时保留已有权限字段，
    新用户默认 `user`、root 固定 `root`，当前用户取 `user.yaml` 的 permission
  - `com.amsys.app/launcher/passwd_shadow.cpp create_initial_root()`：root 条目
    改为 `root:root:0:0:root:/root:/bin/amsys`
- 登录验证不受影响：launcher 只读取 passwd 第 1 位用户名与 shadow 哈希

**说明**：amsys shell 自身的命令级权限仍以 `~/.config/amsys/user.yaml` 的
`permission` 为准（root/sudo 才能执行特权命令）；passwd 第 2 位是应用侧统一的
权限记录位，两者暂未互相读取。

---

### 25. 身份数据源反转：passwd/shadow 权威，config.json 改为读取方

**用户需求**：
> 把每个用户 config.json 里面的数据改为从 passwd 和 shadow 文件读取，
> 而不是从 config 里面读取值去覆盖。userid 直接继承 UID，username 继承
> passwd 的 nick 字段，permi 继承 passwd 的 permission，password 继承
> shadow 的 md5hash。

**决策确认**：
1. 用户增删改由 AmengUI 直接写 passwd/shadow（方案 1，不调 amsys 命令，
   因为 amsys 管道/命令不提供完整操作）
2. amsys 启动时会自行检查并同步 user.yaml（amsys 侧已完成，AmengUI 不改其代码）
3. userid 即 UID，config 目录以 UID 命名（如 `etc/system/core/1000`）

**实现**（`src/config.js`）：
- 删除原 `syncPasswdShadow()`（config → passwd/shadow 的完全重建覆盖方向）
  与 `syncUsersFromConfig()`/`ensureLoginConfig()`，方向整体反转
- 新增权威数据源层：
  - `readPasswdShadow()`：解析 passwd（`username:permission:UID:GID:nick:home:shell`）
    与 shadow（`username:md5hash:min:max:warn:inactive:expire:reserved`），
    产出 `{ userid(UID), loginName, username(nick), permi, password, gid, home, shell }`
  - `ensurePasswdShadowBootstrap()`：文件缺失时初始化 root（密码 root）
  - `migrateUserDirsToUid()`：一次性把 `config/{旧 userid}` 按用户名（nick）
    重映射到 `config/{UID}`，并重映射 system.json 的 lastLoginUserId
  - `syncUsersFromPasswdShadow()`：重建 users.json 聚合视图 +
    回填各 config.json 的 login 块（保留 photo/profile/desktop）
  - `rewriteAuthUser()`：写入层，只改目标用户行，保留 passwd/shadow 中
    其他未管理用户与顺序
- 增删改查全部改为以 passwd/shadow 为准：
  - `addUser`：写入 passwd/shadow（UID 从 1000 取空闲），用户名重复返回 null
  - `updateUser`：改用户名（同时改字段 1 与 nick、迁移 home 目录）、改密（shadow）、
    改权限（passwd 第 2 位）；root 恒为 root、不可删除
  - `deleteUser`：从 passwd/shadow 移除行 + 删除 config 目录
  - `setPermission`：直接改 passwd 第 2 位（root 用户强制 root）
  - `verifyUser`：按 nick 匹配，直接比对 shadow md5hash（空哈希=空密码，
    `!`/`*`=锁定），不再读 config.json 密码
- 运行时监听反转：`startConfigWatch()` 改为轮询 passwd/shadow 的 mtime，
  变化时执行 `syncUsersFromPasswdShadow()`

**实测**（Node 直测，全部通过）：
- 5 个旧目录 `core/1..5` 按用户名迁移到 `core/0/1000/1001/1002/1003`，
  Ad 的主题色（#FF6B00）等 profile 数据完整保留；lastLoginUserId 1→1000
- 登录回归：root/root、Ad/123456、rot/空密码 全部通过；错误密码拒绝
- 增删改回路：addUser（UID 分配/重复拒绝）→ setPermission（passwd 第 2 位
  变为 sudo）→ 登录校验通过 → updateUser 改名（passwd 字段 1/5 与 home 同步）→
  deleteUser（passwd/shadow/config 目录全清）
- 删除 root 被拒绝

**顺带清理**：amsys 此前用错误编码扫描 home 目录产生的乱码用户
（如 `娴嬭瘯涓枃鐩綍`）已从 passwd/shadow 白名单清除，对应乱码 home 目录与
孤儿 config 目录隔离到 amsys root 下的 `.garbage-20260811/`（未删除，可恢复）；
amys 侧如未修复 home 扫描编码，后续仍可能再生成，建议在 amsys 侧跟进。

### 26. 桌面窗口层级修复：激活会把桌面抬到普通窗口之上

**用户反馈**：
> 在前台没有打开设置时，主程序桌面没有成功置于底部，反而变成了置顶。

**根因（探针实测）**：
- 独立 Electron 探针复刻 `setWindowToBottom` 的 PowerShell 调用（SetWindowPos
  HWND_BOTTOM + SWP_NOACTIVATE）确认：置底本身有效（窗口 Z 序 rel 从 +1 掉到
  +358），但**窗口被激活（focus()/点击桌面/浮层或设置关闭后焦点回落）时，Windows
  会把桌面抬到所有普通窗口之上**（rel 变为 -3），且它并非 WS_EX_TOPMOST，只是普通
  Z 序被抬高
- 原有每 2 秒轮询置底存在空窗：激活后若轮询延迟/失败，桌面就一直盖住已启动的应用，
  表现为“置顶”

**修复**：
- `window:openDashboard` 给 dashboardWindow 增加 `focus` 监听：聚焦后延迟 200ms
  置底，直接抵消“激活即抬高”机制（设置关闭、浮层隐藏、点击桌面后桌面都会在约 1 秒内
  回到应用之下）
- 新增 `pushDashboardToBottom()` 防重入锁：聚焦推送与 2 秒轮询可能叠加，统一串行化，
  避免 PowerShell 进程堆积
- 顺带修复 `forceWindowToBottom` 临时脚本泄漏：无论 PowerShell 成败都在 `finally`
  中清理 `amengui_setbottom_*.ps1`，避免长期运行积累临时文件

**实测**（Z 序探针）：加 focus 置底后，桌面被激活（focus）与设置窗口关闭焦点回落两种
场景，桌面 Z 序均稳定回到应用之下（rel=+358），且 `topmost=false`（非 WS_EX_TOPMOST）。

## 三、待解决问题与未来方向

### 已知不足
1. **amsys 管道模式未启用**：当前路径转换由 Node.js 原生实现，`amsys --pipe` 模式仍未可用，`client.js` 处于备用状态
2. **权限要求**：亮度、网络、蓝牙（pnputil）、飞行模式切换需要管理员权限，普通用户运行会静默失败或返回失败
3. **控制中心状态同步**：开关按钮状态未与系统实时同步，仅显示点击后的预期状态
4. **Shell 模式退出入口**：现可在 amsys 中输入 `exit` 主动退出并恢复主界面；`auth:exit-shell` IPC 保留为备用入口，UI 上仍无入口触发

### 未来计划
- 排查 amsys `--pipe` 模式启动失败的根本原因，恢复原生路径转换
- 控制中心增加实时状态轮询，与系统真实状态同步
- 完善 `.app` 文件格式，支持参数、工作目录、环境变量等字段
