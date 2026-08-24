# Fuck_wmic_plan：彻底丢弃 WMIC 依赖

> 2026-08-19 制定
> 目标：AmengUI 全链路（Electron 主进程 / PowerShell 脚本 / amsys C++）**零 `wmic.exe` 调用**，
> WMI 数据访问统一走 PowerShell CIM 或原生 Win32 API，保证 Windows 10 PE / Windows 11 24H2 全兼容。

---

## 一、为什么要干掉 wmic

1. **官方弃用 / 移除**
   - Windows 11 21H2 起 `wmic.exe` 标记为弃用；
   - Windows 11 24H2 起默认**不再安装**，调用直接报错 `'wmic' 不是内部或外部命令`；
   - Windows Server 2025 同样移除。
2. **PE 环境（hotPE2.5 等）不可用**
   - PE 精简镜像常缺 `wbem` 服务与 `wmic.exe`，一旦代码路径依赖它，功能静默失效或整段报错。
3. **性能与安全**
   - `wmic` 每次调用冷启动一个进程，慢且无缓存；
   - 历史上有大量 `wmic` 注入/滥用 CVE，安全扫描普遍将其列为应移除项。

> 注意概念区分：**`wmic.exe`（命令行工具）**与 **WMI（Windows Management Instrumentation，系统服务）**不是一回事。
> 本计划只禁 `wmic.exe`；通过 PowerShell `Get-CimInstance` / C++ `IWbemLocator` 访问 WMI 是合法且保留的替代路径。

---

## 二、现状审计（2026-08-19）

| 位置 | 现状 | 结论 |
|------|------|------|
| 全仓库（Electron/PS/C++/脚本/文档） | `rg -i "wmic"` **0 处** | 无 wmic.exe 调用，基础干净 |
| `src/scripts/sys.ps1` | 使用 `Get-CimInstance`（网络/蓝牙/亮度/时区等） | ✅ 符合方向 |
| `src/scripts/sys.ps1` `Get-BrightnessValue` | ~~`Get-WmiObject root\WMI WmiMonitorBrightness`~~ | ✅ 已迁移为 `Get-CimInstance`（本计划执行项 1） |
| `src/index.js` | 设备信息/磁盘/刷新率用 `Get-CimInstance` | ✅ 符合方向 |
| `com.amsys.app/src/path_manager.cpp` | 分区/挂载用 **WMI COM（IWbemLocator）**，非 wmic.exe | ✅ 不违反禁令；后续可评估迁移 IOCTL |
| `docs/`、`use-pipe.md`、README | 无 wmic 推荐用法 | ✅ 无文档污染 |

**结论：当前仓库没有 wmic 依赖，本计划的意义在于“保持为零”并固化纪律。**

---

## 三、替换映射表（守则：永远不写 wmic）

| 想做的事 | ❌ 禁止 | ✅ 推荐 |
|----------|--------|--------|
| 系统信息（型号/制造商） | `wmic computersystem get manufacturer,model` | `Get-CimInstance Win32_ComputerSystem` |
| 操作系统信息 | `wmic os get caption,version` | `Get-CimInstance Win32_OperatingSystem` 或 `[System.Environment]::OSVersion` |
| 磁盘列表 | `wmic logicaldisk get deviceid,size,freespace` | `Get-CimInstance Win32_LogicalDisk` 或原生 `GetDiskFreeSpaceEx` |
| 磁盘分区 | `wmic diskdrive list` | C++ 用 `DeviceIoControl(IOCTL_DISK_GET_DRIVE_LAYOUT_EX)` 优先，WMI COM 兜底 |
| 进程列表 | `wmic process list` | `Get-Process` / `CreateToolhelp32Snapshot` |
| 网络适配器 | `wmic nic get name,netconnectionid` | `Get-CimInstance Win32_NetworkAdapter`（已用） |
| 显示器亮度 | `wmic path WmiMonitorBrightness get CurrentBrightness` | `Get-CimInstance -Namespace root\WMI -ClassName WmiMonitorBrightness`（已用） |
| 电池 | `wmic path Win32_Battery get EstimatedChargeRemaining` | `Get-CimInstance Win32_Battery` / WinRT `Battery` API |
| CPU | `wmic cpu get name` | `Get-CimInstance Win32_Processor` 或注册表 `HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor` |

通用原则：
- PowerShell 一律用 **CIM 动词**（`Get-CimInstance` / `Invoke-CimMethod`），不用 `Get-WmiObject` / `Invoke-WmiMethod`；
- 进程内能拿到原生 API（Win32 P/Invoke、`[System.Environment]`）就不用再起子进程；
- 需要管理员权限的 WQL 查询优先找 IOCTL / 注册表替代，避免提权面。

---

## 四、行动清单

- [x] **1. 迁移最后一处 `Get-WmiObject`**
  `src/scripts/sys.ps1` `Get-BrightnessValue` 改为
  `Get-CimInstance -Namespace root\WMI -ClassName WmiMonitorBrightness`（CIM 走同一 WMI 提供程序，返回值不变）。
- [ ] **2. 建立防回潮检查**
  - 新增 `scripts/check-no-wmic.ps1`（也可接入发布前或 CI 检查）：
    ```powershell
    $hits = Get-ChildItem -Recurse -File -Path src, scripts, com.amsys.app -Exclude *.exe |
      Select-String -Pattern '\bwmic\b' -CaseSensitive:$false
    if ($hits) { $hits | ForEach-Object { Write-Error $_.ToString() }; exit 1 }
    ```
  - 需要时在发布前或 CI 阶段执行，命中即失败；日常开发和源码验证不以打包为前置条件。
- [ ] **3. AGENTS.md 增补纪律条目**
  在“关键开发对话与决策”后追加：**禁止引入 wmic.exe 调用**；新增系统查询一律使用
  `Get-CimInstance` / Win32 API，并在代码评审时 grep `wmic`。
- [ ] **4. 文档清理**
  复核 `docs/`、`use-pipe.md`、README 中是否存在把 wmic 当作可行方案的表述（审计为 0，保持）。
- [ ] **5. amsys C++ 路线评估**
  `path_manager.cpp` 的 WMI COM 查询保留（非 wmic），但标注后续可迁移项：
  分区枚举已先走 `IOCTL_DISK_GET_DRIVE_LAYOUT_EX`，仅非管理员环境回退 WMI——维持现状即可。
- [ ] **6. PE 实机回归**
  在 hotPE2.5 上回归：设置页设备信息、存储页磁盘列表、屏幕页亮度、网络/蓝牙能力探测。

---

## 五、验收标准

1. `rg -i "wmic" src scripts com.amsys.app docs README.md ReleaseNotes.md use-pipe.md` → **0 命中**；
2. `rg -i "Get-WmiObject|Invoke-WmiMethod" src scripts` → **0 命中**；
3. 普通 Windows 与 Windows 10 PE 下，以下功能行为一致：
   - 设置 → 主页（设备名称/型号）
   - 设置 → 系统 → 存储（磁盘列表）
   - 设置 → 系统 → 屏幕（亮度）
   - 控制中心（网络/蓝牙/亮度）
4. 若生成发布产物，产物内不携带任何 `wmic.exe` 依赖（本来也不携带）；未生成产物不影响源码验收。

---

## 六、风险与回退

- `Get-CimInstance -Namespace root\WMI -ClassName WmiMonitorBrightness` 在个别精简 PE 上可能无此
  提供程序：脚本已有 `-ErrorAction SilentlyContinue` 与 `$null` 兜底，返回 `unsupported`，UI 置灰，不崩溃。
- 若未来某设备信息无法用 CIM 表达：优先注册表/原生 API；**回退到 wmic 一律视为缺陷**。
