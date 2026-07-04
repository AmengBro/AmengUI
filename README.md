# AmengUI - 桌面环境模拟器

一个基于 Electron 框架开发的桌面环境模拟应用，提供用户登录认证、桌面交互、任务栏、开始菜单、应用启动等完整的桌面体验。

## 功能特性

### 核心功能
- **用户登录系统**：多用户管理，密码验证登录，记住上次登录用户
- **用户管理**：添加、删除、编辑用户信息，支持权限分级（root/sudo/user/guest）
- **桌面环境**：完整的桌面工作区，支持拖拽排列桌面图标
- **应用启动**：通过 `.app` 配置文件定义和启动真实的 Windows 应用程序
- **任务栏**：支持浮动/停靠两种模式，带时间和日期显示
- **开始菜单**：用户信息展示、应用列表、电源菜单（关机/重启/Shell模式）

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

### 打包构建

```bash
# 打包（输出到 out/ 目录）
npm run package

# 制作可分发的安装包
npm run make
```

## 配置文件说明

### 用户列表 (config/users.json)

```json
{
  "users": [
    {
      "userid": 1,
      "username": "管理员",
      "photo": null,
      "permi": "root"
    }
  ]
}
```

### 用户配置 (config/{userid}/config.json)

```json
{
  "login": {
    "userid": 1,
    "username": "管理员",
    "password": "123456",
    "photo": null,
    "permi": "root"
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
| `addUser(username, password, photo)` | 添加用户 | username, password, photo |
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

## 许可证

MIT License

## 作者

A萌菌 (Dingduanxu@163.com)
