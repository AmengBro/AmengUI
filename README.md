# AmengUI - 桌面环境模拟器

一个基于 Electron 框架开发的 Windows 桌面环境模拟应用，在 Windows 之上构建一套类 Unix 风格的桌面壳层（Shell），提供用户登录认证、桌面交互、任务栏、开始菜单、应用启动、控制中心等完整的桌面体验，并通过 `amsys.exe` 实现 Unix 路径与 Windows 路径的双向映射。

## 项目设想与定位

AmengUI 的核心目标是构建一个**桌面环境模拟器**，而非简单的桌面美化工具：

- **Unix 风格壳层**：通过 `rootdir/` 模拟一个类 Unix 文件系统根目录（`/usr/share/applications`、`/home`、`/etc/fstab` 等），应用通过 `.app` 配置文件（仿 Linux `.desktop`）定义
- **路径映射层**：借助 `amsys.exe` 在 Unix 风格路径与 Windows 实际路径之间转换，让上层逻辑操作 `/usr/share/applications/com.browser.app`，底层自动解析为 Windows 绝对路径
- **系统壳层能力**：提供 Shell 模式（关闭 UI 进入纯 amsys 终端）、控制中心（音量/亮度/网络/蓝牙/飞行模式/夜间模式快捷开关）、锁屏、注销、关机、重启等完整电源与系统管理能力
- **跨版本兼容**：内置 PowerShell 7（`PowerShell\7\pwsh.exe`）保证系统脚本在任意 Windows 版本上行为一致，路径可通过常量配置
- **桌面级体验**：窗口置底模拟真实桌面覆盖层、毛玻璃效果、主题切换、自定义主题色

## 已实现功能

### 核心功能
- **用户登录系统**：多用户管理，密码验证登录，记住上次登录用户
- **用户管理**：添加、删除、编辑用户信息，支持权限分级（root/sudo/user）
- **桌面环境**：完整的桌面工作区，支持拖拽排列桌面图标
- **应用启动**：通过 `.app` 配置文件定义和启动真实的 Windows 应用程序，终端类程序自动以新窗口启动
- **任务栏**：支持浮动/停靠两种模式，带时间和日期显示，集成网络/音量/电池图标
- **开始菜单**：用户信息展示、应用列表、电源菜单（关机/重启/Shell模式）
- **路径转换层**：`src/amsys/converter.js` 读取 `config.ini` 与 `rootdir/etc/fstab`，将 Unix 路径映射到 Windows 绝对路径，转换失败时自动回退到 `path.join(APP_ROOT, 'rootdir', ...)`
- **Shell 模式**：关闭主界面与桌面窗口，启动独立控制台窗口的 amsys 终端；被强制关闭会自动重启（无法关闭），在 amsys 中输入 `exit` 主动退出并恢复主界面
- **控制中心**：右下角弹出面板，集成网络/蓝牙/飞行模式/夜间模式开关，亮度/音量滑块，音量合成器入口，电池状态显示；窗口失焦自动隐藏
- **电源管理**：关机、重启通过 `shutdown` 命令实现，Shell 模式通过 `taskkill /T` 清理进程树
- **锁屏**：独立锁屏窗口，支持解锁返回桌面
- **内置 PowerShell 7**：`PWSH_PATH` 常量定义内置 pwsh 路径，`getPwshCommand()` 优先使用内置版本，回退到系统 powershell

### 界面特性
- **主题切换**：暗色/亮色模式，支持自定义主题色（Accent Color）
- **右键菜单**：桌面空白处和应用图标的上下文菜单
- **剪贴板**：桌面应用的复制/剪切/粘贴
- **日历弹窗**：点击任务栏时间弹出日历
- **属性窗口**：查看桌面应用的详细属性
- **毛玻璃效果**：窗口组件的 backdrop-filter 半透明效果
- **窗口置底**：自动保持在桌面图标层之下，模拟真实桌面覆盖层

### 交互方式
- 桌面应用拖拽重排，位置自动保存
- 双击桌面应用启动对应程序
- 右键唤起上下文菜单
- 日历面板、用户子菜单、电源子菜单弹出式交互

## 技术栈

- **框架**: Electron 42.x
- **构建工具**: Electron Forge 7.x
- **语言**: JavaScript (ES6+)
- **样式**: CSS3（CSS 变量、backdrop-filter、flexbox）
- **图标**: 内联 SVG
- **配置存储**: JSON 文件（按用户目录隔离）
- **系统集成**: PowerShell 脚本调用 Windows API 实现窗口置底

## 项目结构

```
AmengUI/
├── src/
│   ├── index.js          # 主进程入口（窗口管理、IPC 处理、应用启动）
│   ├── preload.js        # 预加载脚本（contextBridge 安全 API）
│   ├── renderer.js       # 渲染进程脚本（登录界面逻辑）
│   ├── config.js         # 配置管理模块（用户、桌面、系统配置）
│   ├── index.html        # 登录界面
│   ├── index.css         # 登录界面样式
│   ├── dashboard.html    # 桌面主界面（任务栏、开始菜单、桌面区域）
│   ├── dashboard.css     # 桌面主界面样式
│   └── dashboard.js      # 桌面主界面脚本（右键菜单、拖拽、日历等）
├── config/               # 配置文件目录
│   ├── users.json        # 用户列表
│   ├── system.json       # 系统配置（最后登录用户等）
│   └── {userid}/         # 用户个性化配置目录
│       ├── config.json   # 用户登录信息和主题偏好
│       └── desktop.json  # 桌面布局和应用配置
├── rootdir/              # 模拟文件系统根目录
│   ├── usr/share/applications/  # .app 应用定义文件
│   │   ├── com.browser.app      # 浏览器应用
│   │   ├── com.explorer.app     # 资源管理器应用
│   │   └── com.terminal.app     # 终端应用
│   ├── home/             # 用户主目录（示例文件）
│   ├── opt/              # 第三方软件
│   ├── bin/              # 二进制文件
│   └── tmp/              # 临时文件
├── scripts/
│   └── setbottom.ps1     # PowerShell 窗口置底脚本
├── forge.config.js       # Electron Forge 打包配置
├── package.json          # 项目配置
└── README.md             # 开发文档
```

## 安装与运行

### 环境要求
- Node.js >= 18.0.0
- npm >= 9.0.0
- Windows 10/11（窗口置底功能依赖 PowerShell）

### 安装依赖

```bash
cd AmengUI
npm install
```

### 开发模式

```bash
npm start
```

### 可选：发布构建

开发和源码级验证不需要先打包。需要生成发布目录或安装包时，再执行以下命令：

```bash
# 打包（输出到 out/ 目录）
npm run package

# 制作可分发的安装包
npm run make
```

## 配置文件说明

### 用户列表 (config/users.json)

> `users.json` 是 `/etc/passwd` 的**聚合视图**，由 `syncUsersFromPasswdShadow()`
> 从 passwd/shadow 重建，`userid` 即 passwd 第 3 位 UID，`username` 取第 5 位昵称 nick，
> `permi` 取第 2 位权限。手动修改请直接改 passwd/shadow，应用每 2 秒监听自动跟随。

```json
{
  "users": [
    {
      "userid": 0,
      "username": "root",
      "photo": null,
      "permi": "root"
    }
  ]
}
```

### 用户配置 (config/{userid}/config.json)

> 目录以 UID 命名（如 `config/1000`）。`login` 块中的 `userid/username/password/permi`
> 由 passwd/shadow 读取后回填（password 为 shadow 第 2 位 md5hash），`photo` 与
> `profile`（主题、背景）仍由应用本地管理。

```json
{
  "login": {
    "userid": 1000,
    "username": "rot",
    "password": "e10adc3949ba59abbe56e057f20f883e",
    "photo": null,
    "permi": "user"
  },
  "profile": {
    "loginbg": null,
    "themebd": "dark",
    "themecolor": "#0078D4"
  }
}
```

### 桌面配置 (config/{userid}/desktop.json)

```json
{
  "desktopapp": [
    {
      "id": 1,
      "x": 15,
      "y": 15,
      "name": "浏览器",
      "start": "com.browser.app",
      "icon": "C:\\path\\to\\icon.ico"
    }
  ],
  "desktopbg": null
}
```

### 系统配置 (config/system.json)

```json
{
  "lastLoginUserId": 1
}
```

### 用户身份数据源（/etc/passwd 与 /etc/shadow）

**`/etc/passwd` 与 `/etc/shadow` 是用户身份/凭证的唯一权威**。AmengUI 启动及
passwd/shadow 变化时，`src/config.js` 从中读取数据并重建 `users.json` 聚合视图、
回填各用户 `config.json` 的 login 块；用户增删改（addUser/updateUser/deleteUser/
setPermission）也直接写这两个文件，不再从 config 反向覆盖。

`/etc/passwd` 使用 7 字段格式：

```
username:permission:UID:GID:nick:home:/bin/amsys
```

- `permission` 为权限字段，取值 **root / sudo / user**，记录在第 2 位
- 第 5 位 `nick` 为用户昵称，即应用内显示的 `username`
- 应用内 `userid` 直接继承第 3 位 UID；`root` 固定 UID/GID=0、home 为 `/root`

`/etc/shadow` 使用 8 字段格式：

```
username:md5hash:min:max:warn:inactive:expire:reserved
```

密码以无盐 MD5 存于第 2 位，登录校验直接比对 shadow；空哈希表示空密码，
`!` / `*` 表示账户锁定。

示例（root / sudo / user 三种权限各一行）：

```
root:root:0:0:root:/root:/bin/amsys
Ad:sudo:1003:1003:Ad:/home/Ad:/bin/amsys
rot:user:1000:1000:rot:/home/rot:/bin/amsys
```

### 应用定义文件 (rootdir/usr/share/applications/*.app)

```json
{
  "name": "浏览器",
  "description": "默认浏览器（Edge）",
  "exePath": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "icon": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
}
```

应用定义文件支持以下字段：
- `name`: 应用显示名称
- `description`: 应用描述
- `exePath`: 可执行文件路径
- `icon`: 图标路径（支持 exe 提取图标）

## API 接口

### 配置管理 API

| 方法 | 说明 | 参数 |
|------|------|------|
| `getUsers()` | 获取用户列表 | 无 |
| `addUser(username, password, photo, permi)` | 添加用户（直接写 passwd/shadow） | username, password, photo, permi(默认 user) |
| `updateUser(userid, updates)` | 更新用户信息 | userid, updates |
| `deleteUser(userId)` | 删除用户 | userId |
| `verifyUser(username, password)` | 验证用户密码 | username, password |
| `getSettings(userId)` | 获取用户设置 | userId |
| `setBackground(imagePath, userId)` | 设置登录背景 | imagePath, userId |
| `setTheme(theme, userId)` | 设置主题 | theme: 'dark'/'bright', userId |
| `setAccentColor(color, userId)` | 设置主题色 | color: 十六进制颜色值, userId |
| `setLastLoginUserId(userId)` | 保存最后登录用户 | userId |
| `getLastLoginUserId()` | 获取最后登录用户 | 无 |
| `getUserDesktop(userId)` | 获取桌面配置 | userId |
| `saveUserDesktop(userId, config)` | 保存桌面配置 | userId, config |
| `addDesktopApp(userId, app)` | 添加桌面应用 | userId, app |
| `updateDesktopApp(userId, appId, updates)` | 更新桌面应用 | userId, appId, updates |
| `removeDesktopApp(userId, appId)` | 删除桌面应用 | userId, appId |
| `setDesktopBackground(userId, bgPath)` | 设置桌面背景 | userId, bgPath |
| `updateDesktopAppPosition(userId, appId, x, y)` | 更新图标位置 | userId, appId, x, y |

### 窗口操作 API

| 方法 | 说明 | 参数 |
|------|------|------|
| `openDashboard()` | 打开桌面主界面 | 无 |
| `getCurrentWindowBounds()` | 获取窗口边界 | 无 |
| `setWindowPosition(x, y)` | 设置窗口位置 | x, y |

### 应用启动 API

| 方法 | 说明 | 参数 |
|------|------|------|
| `app:launch(appName)` | 启动应用程序 | appName: .app 文件名（不含扩展名） |
| `app:getInfo(appName)` | 获取应用信息 | appName: .app 文件名 |

### 属性窗口 API

| 方法 | 说明 | 参数 |
|------|------|------|
| `properties:show(appData)` | 显示应用属性窗口 | appData: 应用对象 |

### 对话框 API

| 方法 | 说明 | 参数 |
|------|------|------|
| `dialog:selectImage()` | 打开图片选择对话框 | 无 |

### 系统命令 API

| 方法 | 说明 | 参数 |
|------|------|------|
| `system:exec(command)` | 执行系统命令 | command |
| `fs:readFile(filePath)` | 读取文件 | filePath |
| `fs:writeFile(filePath, content)` | 写入文件 | filePath, content |
| `fs:readDir(dirPath)` | 读取目录 | dirPath |

## 使用说明

### 登录流程
1. 选择用户（点击顶部用户图标）
2. 输入密码
3. 按回车或点击登录按钮
4. 登录成功后自动进入桌面环境

### 桌面操作
- **启动应用**：双击桌面图标
- **移动图标**：拖拽桌面应用到新位置，位置自动保存
- **右键菜单**：右键桌面空白处（刷新/设置/粘贴）或应用图标（打开/复制/剪切/属性）
- **切换任务栏模式**：点击"切换任务栏模式"按钮在浮动和停靠间切换

### 任务栏
- **开始按钮**：点击打开开始菜单，显示用户信息和应用列表
- **时间按钮**：点击弹出日历面板
- **主题切换**：点击"切换主题"按钮切换暗色/亮色模式

### 开始菜单
- **用户区域**：显示当前登录用户和权限，点击箭头展开锁定/注销操作
- **所有应用**：列出系统中所有可用应用，点击即可启动
- **电源菜单**：点击电源按钮展开关机/重启/Shell模式选项

### 快捷键
- **ESC**：关闭桌面环境窗口
- 登录界面中 **回车** 提交登录

## 默认用户

| 用户名 | 密码 | 权限 |
|--------|------|------|
| 管理员 | 123456 | root |
| Admin | 123456 | user |
| root | root | root |

## 开发规范

### 代码风格
- 使用 ES6+ 语法
- 使用 `async/await` 处理异步操作
- 使用 `const/let` 代替 `var`
- 使用 JSDoc 注释函数

### 目录结构规范
- 配置文件存放在 `config/` 目录
- 用户配置按 `{userid}/` 目录隔离
- 静态资源存放在 `src/` 目录
- 应用定义文件存放在 `rootdir/usr/share/applications/`
- PowerShell 脚本存放在 `scripts/` 目录

### 安全规范
- 密码以明文形式存储（仅用于演示，生产环境应加密）
- 使用 Electron contextBridge 安全暴露 API 给渲染进程
- 禁止直接在渲染进程中操作文件系统
- 应用启动使用 `spawn` + `detached` 模式，与主进程生命周期隔离

## 现有不足与待解决问题

### 功能性不足
1. **amsys 管道模式未启用**：当前路径转换由 Node.js 原生实现（`src/amsys/converter.js`），`amsys --pipe` 模式启动后立即退出的问题仍未排查根因，`client.js` 处于备用状态，未实际调用 amsys 二进制
2. **Shell 模式 UI 退出入口缺失**：现可在 amsys 中输入 `exit` 主动退出并恢复主界面；`auth:exit-shell` IPC 已实现但 UI 上仍无入口触发
3. **控制中心状态不同步**：网络/蓝牙/飞行模式/夜间模式开关仅显示点击后的预期状态，未与系统真实状态轮询同步，重启后状态可能不准确
4. **音量控制兼容性差**：Core Audio API（`System.Windows.Media.AudioVolume`）在部分 Windows 版本上行为不一致，SendKeys 模拟音量键的回退方案体验差且不可靠
5. **关机/重启静默执行**：`shutdown /s /t 0` 无任何确认提示，误点击会立即关机

### 权限与兼容性问题
6. **管理员权限要求**：亮度调节、网络切换、飞行模式切换均需要管理员权限，普通用户运行会静默失败，未做权限检测与友好提示
7. **亮度控制依赖 WMI**：仅支持 WMI 兼容的显示器，外接显示器或部分笔记本可能无法调节亮度
8. **蓝牙控制依赖服务**：`bthserv` 服务操作需要管理员权限，且部分精简版 Windows 无此服务
9. **密码明文存储**：`config/users.json` 中密码以明文形式存储，仅适用于演示场景

### 架构与代码问题
10. **发布配置不完整**：如果生成安装包，`forge.config.js` 的 `ignore` 规则会排除 `rootdir/` 与 `config/`，安装后首次运行需手动创建这些目录；开发模式不受影响
11. **窗口置底性能开销**：每 2 秒通过 PowerShell 调用 Windows API 强制置底，频繁启动 PowerShell 进程，存在性能与资源开销
12. **临时脚本文件清理**：控制中心系统控制功能会在 `os.tmpdir()` 创建临时 `.ps1` 文件，异常退出时可能残留
13. **开发模式 DevTools 默认开启**：`mainWindow.webContents.openDevTools()` 与 `dashboardWindow.webContents.openDevTools()` 在生产环境应关闭

### 未来计划
- 排查 amsys `--pipe` 模式启动失败的根本原因，恢复原生路径转换
- 引入 `nircmd.exe` 或原生 Node 扩展作为音量控制的可靠方案
- 控制中心增加实时状态轮询，与系统真实状态同步
- 完善 `.app` 文件格式，支持参数、工作目录、环境变量等字段
- 发布构建时自动创建 `rootdir/` 与 `config/` 目录结构
- 生产环境关闭 DevTools，密码加密存储

## 开发对话与决策记录

项目开发过程中的关键对话、技术决策、问题排查与演进历程已归档至 [agents.md](./agents.md)，便于后续维护者理解项目背景与设计取舍。

## 许可证

MIT License

## 作者

A萌菌 (Dingduanxu@163.com)
