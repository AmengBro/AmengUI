# AmengUI - 桌面登录界面应用

一个基于 Electron 框架开发的桌面登录界面应用，提供用户认证、主题切换、电源管理等功能。

## 功能特性

### 核心功能
- **用户登录系统**：支持多用户管理，密码验证登录
- **用户管理**：添加、删除、切换用户
- **主题切换**：支持暗色/亮色模式
- **电源菜单**：关机、重启、Shell模式模拟
- **桌面配置**：用户个性化桌面布局存储

### 界面特性
- 现代化的登录界面设计
- 毛玻璃效果的窗口组件
- 响应式布局适配
- 流畅的动画效果

## 技术栈

- **框架**: Electron 28.x
- **语言**: JavaScript (ES6+)
- **样式**: CSS3
- **图标**: SVG 内置图标
- **配置存储**: JSON 文件

## 项目结构

```
AmengUI/
├── src/
│   ├── index.js          # 主进程入口
│   ├── preload.js        # 预加载脚本
│   ├── renderer.js       # 渲染进程脚本
│   ├── config.js         # 配置管理模块
│   ├── index.html        # 登录界面
│   ├── index.css         # 登录界面样式
│   ├── dashboard.html    # 欢迎页面
│   ├── dashboard.css     # 欢迎页面样式
│   └── dashboard.js      # 欢迎页面脚本
├── config/               # 配置文件目录
│   ├── users.json        # 用户列表
│   ├── system.json       # 系统配置
│   └── {userid}/         # 用户个性化配置
│       ├── config.json   # 用户配置
│       └── desktop.json  # 桌面配置
├── package.json          # 项目配置
└── README.md             # 开发文档
```

## 安装与运行

### 环境要求
- Node.js >= 18.0.0
- npm >= 9.0.0

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
# Windows
npm run package:win

# macOS
npm run package:mac

# Linux
npm run package:linux
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
      "name": "bash",
      "start": "com.bash.app",
      "icon": "C:\\bash.ico"
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

## API 接口

### 配置管理 API

| 方法 | 说明 | 参数 |
|------|------|------|
| `getUsers()` | 获取用户列表 | 无 |
| `addUser(username, password, photo)` | 添加用户 | username: 用户名, password: 密码, photo: 头像路径 |
| `deleteUser(userId)` | 删除用户 | userId: 用户ID |
| `verifyUser(username, password)` | 验证用户密码 | username: 用户名, password: 密码 |
| `getSettings(userId)` | 获取用户设置 | userId: 用户ID |
| `setBackground(imagePath, userId)` | 设置登录背景 | imagePath: 图片路径, userId: 用户ID |
| `setTheme(theme, userId)` | 设置主题 | theme: 'dark'/'bright', userId: 用户ID |
| `setLastLoginUserId(userId)` | 保存最后登录用户 | userId: 用户ID |
| `getLastLoginUserId()` | 获取最后登录用户 | 无 |
| `getUserDesktop(userId)` | 获取桌面配置 | userId: 用户ID |
| `addDesktopApp(userId, app)` | 添加桌面应用 | userId: 用户ID, app: 应用对象 |

### 窗口操作 API

| 方法 | 说明 | 参数 |
|------|------|------|
| `openDashboard()` | 打开欢迎页面 | 无 |

## 使用说明

### 登录流程
1. 选择用户（点击右下角用户图标）
2. 输入密码
3. 点击登录按钮（→）
4. 登录成功后自动关闭登录窗口，打开欢迎页面

### 快捷键
- **ESC**: 关闭欢迎页面

### 主题切换
- 在欢迎页面点击"切换主题"按钮
- 主题设置自动保存到用户配置

### 电源菜单
- 点击左下角电源按钮打开菜单
- 支持关机、重启、Shell模式（均为模拟操作）

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

### 目录结构规范
- 配置文件存放在 `config/` 目录
- 用户配置按 `{userid}/` 目录隔离
- 静态资源存放在 `src/` 目录

### 安全规范
- 密码以明文形式存储（仅用于演示，生产环境应加密）
- 使用 Electron contextBridge 安全暴露 API
- 禁止直接在渲染进程中操作文件系统

## 许可证

MIT License

## 作者

AmengUI Development Team