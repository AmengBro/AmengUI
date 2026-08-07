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
- 开始菜单应用项新增右键菜单"发送到桌面"：
  - 已在该用户桌面则显示"已在桌面"（禁用态）
  - 否则调用 `config.addDesktopApp` 写入 `./config/{userid}/desktop.json`，网格级联自动定位（每行 5 个，间距 95x105），桌面已渲染则自动刷新
- `src/dashboard.css` 新增 `.context-menu-item-disabled` 样式

**实测**：`apps:listAll` 逻辑在 Node 中复现验证，当前生效根（D:\Codewhale）正确列出 browser/explorer/pacman/wps 四个应用及其转换后的 exePath/icon。

---

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
