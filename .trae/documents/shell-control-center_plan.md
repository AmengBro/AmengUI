# Shell模式与控制中心实现计划

## 一、需求分析

### 1. Shell模式
- 关闭当前程序界面（主窗口）
- 创建一个无法关闭的amsys窗口
- 直到主界面重新打开才关闭amsys窗口

### 2. 控制中心
参考用户提供的图片，需要实现：
- **音量调节**：滑块控制系统音量
- **音量合成器**：打开系统音量合成器
- **亮度调节**：滑块控制屏幕亮度
- **网络切换**：开启/关闭网络
- **蓝牙切换**：开启/关闭蓝牙
- **飞行模式切换**：开启/关闭飞行模式
- **夜间模式切换**：开启/关闭夜间模式

## 二、现有代码分析

### 文件结构
```
src/
├── index.js          # 主进程入口，包含窗口创建和IPC处理
├── preload.js        # 预加载脚本，暴露API给渲染进程
├── dashboard.html    # 主界面（桌面）
├── dashboard.js      # 主界面逻辑
├── index.html        # 登录界面
├── renderer.js       # 登录界面逻辑
├── config.js         # 配置管理
└── amsys/
    ├── amsys.exe     # amsys可执行文件
    └── converter.js  # 路径转换器
```

### 关键发现
1. 已存在"Shell模式"按钮在电源菜单中（index.html和dashboard.html）
2. preload.js中已定义`power.shell()` API，但index.js中未实现对应的IPC处理
3. 需要创建控制中心窗口和相关逻辑

## 三、实现方案

### 1. Shell模式实现

**修改文件**: `src/index.js`

**实现步骤**:
- 添加`amsysWindow`变量用于存储amsys窗口引用
- 添加`isShellMode`状态变量
- 实现`auth:shell` IPC处理：
  - 隐藏/关闭主窗口
  - 启动amsys.exe作为子进程，创建终端窗口
  - 监听主窗口重新打开事件，关闭amsys进程

### 2. 控制中心实现

**新增文件**:
- `src/control-center.html` - 控制中心HTML界面
- `src/control-center.js` - 控制中心渲染进程逻辑
- `src/control-center.css` - 控制中心样式

**修改文件**:
- `src/index.js` - 添加控制中心窗口管理和系统控制IPC处理
- `src/preload.js` - 添加控制中心相关API
- `src/dashboard.html` - 添加任务栏控制中心图标
- `src/dashboard.js` - 添加控制中心显示逻辑

### 3. 系统控制功能实现

使用Node.js调用Windows系统命令实现：

| 功能 | Windows命令/API |
|------|-----------------|
| 音量调节 | `powershell -Command (New-Object System.Windows.Forms.VolumeControl).Volume = X` |
| 音量合成器 | `sndvol.exe` |
| 亮度调节 | `powershell -Command (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,X)` |
| 网络切换 | `netsh interface set interface "以太网" admin=disabled/enabled` |
| 蓝牙切换 | `powershell -Command (Get-Service bthserv).Stop()` / `Start()` |
| 飞行模式切换 | `powershell -Command Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState" -Name "SystemRadioState" -Value X` |
| 夜间模式切换 | 修改注册表 `HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CloudStore\Store\Cache\DefaultAccount\$$windows.data.bluelightreduction.bluelightreductionstate\Current` |

## 四、详细实现步骤

### 步骤1：实现Shell模式

**修改 `src/index.js`**:
- 添加amsys窗口管理变量
- 实现`ipcMain.on('auth:shell', ...)`处理函数
- 启动amsys进程并创建终端窗口
- 添加重新打开主窗口时关闭amsys的逻辑

### 步骤2：创建控制中心HTML

**创建 `src/control-center.html`**:
- 设计类似Windows 11快速设置的UI布局
- 包含网络、蓝牙、飞行模式等开关按钮
- 包含亮度和音量滑块
- 包含音量合成器按钮

### 步骤3：创建控制中心样式

**创建 `src/control-center.css`**:
- 深色主题样式
- 响应式布局
- 开关按钮样式
- 滑块样式

### 步骤4：创建控制中心渲染逻辑

**创建 `src/control-center.js`**:
- 实现开关切换逻辑
- 实现滑块调节逻辑
- 调用主进程API执行系统控制

### 步骤5：修改主进程添加系统控制

**修改 `src/index.js`**:
- 添加控制中心窗口管理
- 添加系统控制IPC处理函数：
  - `control-center:show` - 显示控制中心
  - `control-center:hide` - 隐藏控制中心
  - `system:setVolume` - 设置音量
  - `system:getVolume` - 获取音量
  - `system:setBrightness` - 设置亮度
  - `system:getBrightness` - 获取亮度
  - `system:toggleNetwork` - 切换网络
  - `system:toggleBluetooth` - 切换蓝牙
  - `system:toggleFlightMode` - 切换飞行模式
  - `system:toggleNightMode` - 切换夜间模式
  - `system:openVolumeMixer` - 打开音量合成器

### 步骤6：修改preload添加API

**修改 `src/preload.js`**:
- 在`electronAPI`中添加`controlCenter`对象
- 添加系统控制相关API

### 步骤7：修改任务栏添加控制中心入口

**修改 `src/dashboard.html`**:
- 在任务栏时间按钮附近添加控制中心图标（网络、音量、电池图标）

**修改 `src/dashboard.js`**:
- 添加控制中心显示/隐藏逻辑

## 五、潜在依赖与注意事项

### 1. Windows权限要求
- 亮度调节需要管理员权限
- 网络切换需要管理员权限
- 飞行模式切换需要管理员权限

### 2. 兼容性
- 音量控制在不同Windows版本可能有差异
- 亮度控制只支持WMI兼容的显示器
- 蓝牙控制需要蓝牙服务运行

### 3. 错误处理
- 需要处理命令执行失败的情况
- 需要处理权限不足的情况
- 需要提供回退方案

## 六、风险处理

1. **权限不足**：检测权限，提供友好提示
2. **命令执行失败**：捕获异常，记录日志，使用默认值
3. **amsys进程管理**：确保进程正确启动和关闭，避免僵尸进程
4. **窗口状态管理**：确保控制中心窗口正确显示和隐藏，避免多个实例

## 七、测试计划

1. **Shell模式测试**：
   - 点击Shell模式按钮，确认主窗口关闭，amsys窗口打开
   - 关闭amsys窗口，确认自动重新打开
   - 重新启动应用，确认主窗口打开后amsys窗口关闭

2. **控制中心测试**：
   - 点击任务栏图标，确认控制中心显示
   - 调节音量滑块，确认系统音量变化
   - 点击音量合成器，确认打开系统音量合成器
   - 调节亮度滑块，确认屏幕亮度变化
   - 切换网络/蓝牙/飞行模式/夜间模式，确认系统状态变化

3. **异常测试**：
   - 无管理员权限时测试亮度和网络切换
   - 无蓝牙设备时测试蓝牙切换
   - 命令执行失败时测试错误处理

## 八、文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/index.js` | 修改 | 添加Shell模式和系统控制逻辑 |
| `src/preload.js` | 修改 | 添加控制中心API |
| `src/dashboard.html` | 修改 | 添加任务栏控制中心图标 |
| `src/dashboard.js` | 修改 | 添加控制中心显示逻辑 |
| `src/control-center.html` | 新建 | 控制中心界面 |
| `src/control-center.css` | 新建 | 控制中心样式 |
| `src/control-center.js` | 新建 | 控制中心逻辑 |