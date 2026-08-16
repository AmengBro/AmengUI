/**
 * Electron 主进程入口
 * 负责创建窗口、处理 IPC 通信和系统功能
 */

const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('node:path');
const os = require('os');
const fs = require('fs').promises;
const { exec, spawn, spawnSync } = require('child_process');
const { promisify } = require('util');
const config = require('./config');
const { getPathConverter } = require('./amsys/converter');

const PWSH_PATH = config.PWSH_PATH;

const execAsync = promisify(exec);
const IPC_TIMEOUT = 15000;

/**
 * 输出管道关闭保护：当程序从控制台启动且控制台被关闭时，console 写 stdout 会抛
 * EPIPE（broken pipe）。忽略这类错误，避免弹出“主进程 JavaScript 错误”对话框；
 * 其余未捕获异常移除本监听后恢复 Electron 默认处理。
 */
function onMainProcessUncaughtException(err) {
  if (err && err.code === 'EPIPE' && /broken pipe/i.test(err.message || '')) {
    return;
  }
  process.removeListener('uncaughtException', onMainProcessUncaughtException);
  throw err;
}
process.on('uncaughtException', onMainProcessUncaughtException);

function getScriptsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'scripts');
  }
  return path.join(__dirname, 'scripts');
}

const SCRIPTS_DIR = getScriptsDir();
const AUDIO_SCRIPT = path.join(SCRIPTS_DIR, 'audio.ps1');
const SYS_SCRIPT = path.join(SCRIPTS_DIR, 'sys.ps1');

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

const APP_ROOT = getAppRoot();

/**
 * 使用 Windows API 强制将窗口置底
 * @param {number} hwnd - 窗口句柄
 */
async function forceWindowToBottom(hwnd) {
  if (process.platform !== 'win32') return;
  
  const os = require('os');
  const scriptContent = `param(
    [Parameter(Mandatory=$true)]
    [int]$hwnd
)

Write-Host "Attempting to set window $hwnd to bottom..."

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class User32 {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@

$hwndPtr = [IntPtr]$hwnd
$HWND_BOTTOM = [IntPtr]1
$SWP_NOSIZE = 0x0001
$SWP_NOMOVE = 0x0002
$SWP_NOACTIVATE = 0x0010

$result = [User32]::SetWindowPos($hwndPtr, $HWND_BOTTOM, 0, 0, 0, 0, $SWP_NOSIZE -bor $SWP_NOMOVE -bor $SWP_NOACTIVATE)

Write-Host "SetWindowPos result: $result"

if ($result) {
    Write-Host "Successfully set window to bottom"
} else {
    Write-Host "Failed to set window to bottom"
    [System.Environment]::Exit(1)
}`;
  
  try {
    const tempDir = os.tmpdir();
    const scriptPath = path.join(tempDir, `amengui_setbottom_${hwnd}_${Date.now()}.ps1`);
    
    await fs.writeFile(scriptPath, scriptContent, 'utf-8');
    
    // 复用 getPwshPath()：内置 pwsh7 → 系统 pwsh（PATH）→ 系统 powershell，避免硬依赖 PS5
    const powershellExe = `"${await getPwshPath()}"`;
    
    const command = `${powershellExe} -ExecutionPolicy Bypass -File "${scriptPath}" -hwnd ${hwnd}`;
    
    const { stdout, stderr } = await execAsync(command);
  } catch (error) {
    console.error('PowerShell execution failed:', error.message);
    console.error('Error code:', error.code);
    if (error.stdout) console.error('Partial stdout:', error.stdout);
    if (error.stderr) console.error('Partial stderr:', error.stderr);
  } finally {
    // 无论成败都清理临时脚本，避免长期运行积累大量 .ps1
    await fs.unlink(scriptPath).catch(() => {});
  }
}

/**
 * 使用命令行工具 nircmd 设置窗口置底（备选方案）
 */
async function forceWindowToBottomWithNircmd(hwnd) {
  if (process.platform !== 'win32') return;
  
  try {
    // 尝试使用 nircmd（如果可用）
    const nircmdPath = 'nircmd.exe';
    const command = `"${nircmdPath}" win settopmost handle ${hwnd} 0`;
    
    try {
      const { stdout, stderr } = await execAsync(command);
    } catch (e) {
      // nircmd 不可用属正常情况，静默跳过
    }
  } catch (error) {
    console.error('forceWindowToBottomWithNircmd failed:', error.message);
  }
}

// 处理 Windows 安装/卸载时的快捷方式
if (require('electron-squirrel-startup')) {
  app.quit();
}

// 主窗口引用
let mainWindow = null;
let dashboardWindow = null;
let dashboardBottomPushBusy = false;
let controlCenterWindow = null;
let startMenuWindow = null;
let calendarWindow = null;
let amsysProcess = null;
let amsysShellPid = null;
let isShellMode = false;

/**
 * 创建应用主窗口
 */
const createWindow = () => {
  // 获取屏幕尺寸
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // 应用图标路径
  const iconPath = path.join(__dirname, '../favicon.ico');

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    frame: false,           // 无边框窗口
    fullscreen: false,      // 不使用全屏模式（避免影响 Z 顺序）
    maximizable: false,     // 禁止最大化
    minimizable: false,     // 禁止最小化
    skipTaskbar: false,      // 不在任务栏显示
    resizable: false,       // 禁止调整大小
    icon: iconPath,         // 应用图标
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 设置窗口位置和大小覆盖整个屏幕
  mainWindow.setPosition(0, 0);
  mainWindow.setSize(width, height);

  // 加载登录界面
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // 打开开发者工具（调试用）
  mainWindow.webContents.openDevTools();

  // 监听窗口显示事件
  mainWindow.on('show', () => {
    console.log('Window shown');
    setWindowToBottom();
  });

  // 监听窗口就绪事件
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded');
    setWindowToBottom();
  });

  // 定期检查并保持置底状态
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      setWindowToBottom();
    }
  }, 2000);

  // 监听键盘事件，ESC 键关闭窗口
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && !input.control && !input.alt && !input.meta) {
      mainWindow.close();
    }
  });
};

/**
 * 设置窗口置底的综合方法
 * @param {BrowserWindow} window - 要置底的窗口（默认使用mainWindow）
 */
async function setWindowToBottom(window = mainWindow) {
  if (!window || window.isDestroyed()) return;
  // 隐藏中的窗口不处理：置底脚本带 SWP_SHOWWINDOW 标志，会误把 Shell 模式下隐藏的界面重新显示
  if (!window.isVisible()) return;
  
  try {
    // 方法1: 通过 PowerShell 调用 Windows API
    const hwnd = window.getNativeWindowHandle();
    
    // 正确获取窗口句柄（兼容 32 位和 64 位系统）
    let hwndNumber;
    if (hwnd.length === 8) {
      // 64 位系统：从 Buffer 读取 64 位整数
      hwndNumber = hwnd.readUInt32LE(0); // 低 32 位就是窗口句柄
    } else {
      // 32 位系统
      hwndNumber = hwnd.readUInt32LE(0);
    }
    
    // 调用 PowerShell 脚本
    await forceWindowToBottom(hwndNumber);
    
    // 额外尝试 nircmd 方法
    await forceWindowToBottomWithNircmd(hwndNumber);
    
  } catch (error) {
    console.error('Error setting window to bottom:', error.message);
    console.error('Error stack:', error.stack);
  }
}

/**
 * 延迟执行窗口置底（确保窗口完全就绪）
 */
function forceWindowToBottomDelayed() {
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    const hwnd = mainWindow.getNativeWindowHandle();
    const hwndNumber = hwnd.readUInt32LE(0); // 正确获取 32 位窗口句柄
    
    // 使用 Windows API 强制置底
    forceWindowToBottom(hwndNumber);
  }, 500);
}

// Electron 初始化完成后创建窗口
app.whenReady().then(async () => {
  // 初始化配置：迁移旧数据并确保用户目录存在
  await initConfig();
  // 运行时监听：passwd/shadow 变化后自动重建 users.json 并刷新 config.json 的 login 块
  config.startConfigWatch();
  createWindow();
  // 后台预热：启动音频/系统常驻服务并预取能力，避免用户打开控制中心时冷启动等待
  prewarmSystemServices();

  // macOS 特性：点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * 初始化配置：迁移旧数据、同步 amsys 认证文件并确保用户目录存在
 */
async function initConfig() {
  try {
    // 迁移旧版 ./config 数据到 amsys 虚拟根 /etc/system/core（含 tar 归档）
    await config.migrateLegacyConfig();
    
    // /etc/passwd 与 /etc/shadow 为权威：
    // 1) 缺失时初始化 root；2) 用户配置目录按 UID 重映射（一次性）；
    // 3) 从认证文件重建 users.json 聚合视图并刷新各 config.json 的 login 块
    await config.ensurePasswdShadowBootstrap();
    await config.migrateUserDirsToUid();
    await config.syncUsersFromPasswdShadow();

    const users = await config.getUsers();
    
    // 为所有现有用户创建配置目录
    for (const user of users) {
      await config.ensureUserDir(user.userid);
    }
    
    // 迁移旧的 settings.json 到第一个用户的配置（如果存在旧数据且用户目录没有配置）
    const oldSettingsPath = path.join(config.CONFIG_DIR, 'settings.json');
    try {
      const oldData = await fs.readFile(oldSettingsPath, 'utf8');
      const oldSettings = JSON.parse(oldData);
      
      if (users.length > 0 && oldSettings.background) {
        // 检查用户配置是否已存在
        const userConfig = await config.getUserConfig(users[0].userid);
        if (!userConfig.profile.loginbg && oldSettings.background) {
          // 迁移旧设置到用户配置
          userConfig.profile.loginbg = oldSettings.background;
          userConfig.profile.themebd = oldSettings.theme || 'dark';
          userConfig.profile.themecolor = oldSettings.accentColor || '#0078D4';
          await config.saveUserConfig(users[0].userid, userConfig);
          console.log('Migrated old settings to user config');
        }
      }
    } catch {
      // 没有旧设置文件，无需迁移
    }
  } catch (error) {
    console.error('Failed to init config:', error);
  }
}

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 退出前关闭常驻服务进程
app.on('before-quit', () => {
  config.stopConfigWatch();
  if (audioServer) {
    audioServer.kill();
  }
  if (sysServer) {
    sysServer.kill();
  }
});

// ==================== IPC 处理器 ====================

// 配置相关
ipcMain.handle('config:getUsers', async () => {
  return await config.getUsers();
});

ipcMain.handle('config:getSettings', async (_, userId) => {
  return await config.getSettings(userId);
});

ipcMain.handle('config:getUserHasPassword', async (_, userId) => {
  try {
    const userConfig = await config.getUserConfig(userId);
    return !!(userConfig.login && userConfig.login.password);
  } catch {
    return false;
  }
});

ipcMain.handle('config:verifyUser', async (_, username, password) => {
  const result = await config.verifyUser(username, password);
  return result;
});

ipcMain.handle('config:addUser', async (_, username, password, avatar) => {
  return await config.addUser(username, password, avatar);
});

ipcMain.handle('config:updateUser', async (_, userid, updates) => {
  return await config.updateUser(userid, updates);
});

/**
 * 修改密码：校验当前密码后写回虚拟根 /etc/shadow 的 md5 字段（空密码 = 关闭密码）
 * @param {{ userId: number, nickname: string, currentPassword: string, newPassword: string, verifyCurrent: boolean }} payload
 */
ipcMain.handle('config:changePassword', async (_, payload = {}) => {
  const { userId, nickname, currentPassword, newPassword, verifyCurrent = true } = payload;
  try {
    if (verifyCurrent) {
      const verified = await config.verifyUser(nickname, currentPassword || '');
      if (!verified || verified.userid !== userId) {
        return { success: false, code: 'current_password_wrong' };
      }
    }
    if (typeof newPassword !== 'string') {
      return { success: false, code: 'invalid_password' };
    }
    const updated = await config.updateUser(userId, { password: newPassword });
    if (!updated) {
      return { success: false, code: 'update_failed' };
    }
    return { success: true };
  } catch (err) {
    console.error('[config:changePassword]', err.message);
    return { success: false, code: 'error', message: err.message };
  }
});

ipcMain.handle('config:deleteUser', async (_, userid) => {
  return await config.deleteUser(userid);
});

ipcMain.handle('config:setBackground', async (_, imagePath, userId) => {
  return await config.setBackground(imagePath, userId);
});

ipcMain.handle('config:setTheme', async (_, theme, userId) => {
  return await config.setTheme(theme, userId);
});

ipcMain.handle('config:setAccentColor', async (_, color, userId) => {
  return await config.setAccentColor(color, userId);
});

ipcMain.handle('config:setTaskbarMode', async (_, mode, userId) => {
  return await config.setTaskbarMode(mode, userId);
});

ipcMain.handle('config:setDisplayProfile', async (_, profile, userId) => {
  const result = await config.setDisplayProfile(profile, userId);
  // 即时把色温配置广播给桌面窗口应用
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('display:profile', profile);
  }
  return result;
});

ipcMain.handle('config:setNotificationPref', async (_, key, value, userId) => {
  return await config.setNotificationPref(key, value, userId);
});

ipcMain.handle('config:setLastLoginUserId', async (_, userId) => {
  return await config.setLastLoginUserId(userId);
});

ipcMain.handle('config:getLastLoginUserId', async () => {
  return await config.getLastLoginUserId();
});

ipcMain.handle('config:getUserDesktop', async (_, userId) => {
  return await config.getUserDesktop(userId);
});

ipcMain.handle('config:saveUserDesktop', async (_, userId, desktopConfig) => {
  return await config.saveUserDesktop(userId, desktopConfig);
});

ipcMain.handle('config:addDesktopApp', async (_, userId, app) => {
  return await config.addDesktopApp(userId, app);
});

ipcMain.handle('config:updateDesktopApp', async (_, userId, appId, updates) => {
  return await config.updateDesktopApp(userId, appId, updates);
});

ipcMain.handle('config:removeDesktopApp', async (_, userId, appId) => {
  return await config.removeDesktopApp(userId, appId);
});

ipcMain.handle('config:setDesktopBackground', async (_, userId, bgPath) => {
  return await config.setDesktopBackground(userId, bgPath);
});

ipcMain.handle('config:updateDesktopAppPosition', async (_, userId, appId, x, y) => {
  return await config.updateDesktopAppPosition(userId, appId, x, y);
});

// 对话框相关
ipcMain.handle('dialog:selectImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

// 系统命令执行
ipcMain.handle('system:exec', async (_, command) => {
  try {
    const { stdout, stderr } = await execAsync(command);
    return { success: true, stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 文件系统操作
ipcMain.handle('fs:readFile', async (_, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:readDir', async (_, dirPath) => {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const result = files.map(f => ({
      name: f.name,
      isDirectory: f.isDirectory(),
      isFile: f.isFile()
    }));
    return { success: true, files: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 窗口操作
ipcMain.handle('window:openDashboard', async (_, userId) => {
  if (userId != null) {
    const users = await config.getUsers();
    currentLoggedInUser = users.find(u => u.userid === userId);
  }
  
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  const iconPath = path.join(__dirname, '../favicon.ico');
  
  dashboardWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    fullscreen: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  
  dashboardWindow.loadFile(path.join(__dirname, 'dashboard.html'));
  
  dashboardWindow.webContents.openDevTools();
  
  dashboardWindow.webContents.on('did-finish-load', () => {
    console.log('Dashboard loaded, setting to bottom');
    setWindowToBottom(dashboardWindow);
    
    setInterval(() => {
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        pushDashboardToBottom();
      }
    }, 2000);
  });

  // 激活（点击桌面/浮层关闭后焦点回落）会把桌面抬到所有普通窗口之上，
  // 聚焦后延迟置底，保证桌面始终位于已启动应用之下
  dashboardWindow.on('focus', () => {
    setTimeout(() => {
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        pushDashboardToBottom();
      }
    }, 200);
  });
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

/**
 * 桌面窗口置底（带防重入锁：聚焦推送与 2 秒轮询可能叠加，避免 PowerShell 进程堆积）
 */
async function pushDashboardToBottom() {
  if (dashboardBottomPushBusy) return;
  dashboardBottomPushBusy = true;
  try {
    await setWindowToBottom(dashboardWindow);
  } finally {
    dashboardBottomPushBusy = false;
  }
}

ipcMain.handle('window:logout', async () => {
  currentLoggedInUser = null;
  
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const iconPath = path.join(__dirname, '../favicon.ico');
  
  const allWindows = BrowserWindow.getAllWindows();
  for (const win of allWindows) {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
  
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    fullscreen: false,
    maximizable: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  
  mainWindow.setPosition(0, 0);
  mainWindow.setSize(width, height);
  
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  mainWindow.webContents.openDevTools();
  
  mainWindow.on('show', () => {
    setWindowToBottom();
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    setWindowToBottom();
  });
  
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      setWindowToBottom();
    }
  }, 2000);
  
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && !input.control && !input.alt && !input.meta) {
      mainWindow.close();
    }
  });
});

// ==================== 浮层窗口（开始菜单 / 日历，悬浮于所有窗口之上） ====================

/**
 * 解析当前登录用户（设置/开始菜单账户卡片共用）
 */
async function resolveAccount() {
  let account = { username: '用户', email: '', roleLabel: '本地账户', avatar: null };
  try {
    const users = await config.getUsers();
    let user = null;
    if (currentLoggedInUser) {
      user = currentLoggedInUser;
    } else {
      const lastUserId = await config.getLastLoginUserId();
      user = (lastUserId && users.find((u) => u.userid === lastUserId)) || users[0] || null;
    }
    if (user) {
      // 角色徽章：root/sudo 显示管理员，普通用户显示用户
      const roleLabel = (user.permi === 'root' || user.permi === 'sudo') ? '管理员' : '用户';
      let hasPassword = false;
      try {
        const userConfig = await config.getUserConfig(user.userid);
        hasPassword = !!(userConfig.login && userConfig.login.password);
      } catch {}
      account = {
        userId: user.userid,
        username: user.username || '用户',       // 昵称（兼容旧调用方）
        loginName: user.loginName || user.username || '',
        nickname: user.username || '用户',
        hasPassword,
        email: user.email || '',
        roleLabel,
        avatar: user.photo || null,
        permi: user.permi || 'user',
      };
    }
  } catch (err) {
    console.warn('[Floating] 解析账户信息失败:', err.message);
  }
  return account;
}

/**
 * 解析当前用户 ID（统一来源）：设置页与开始菜单都用它，
 * 避免 currentLoggedInUser 与 lastLoginUserId 不一致导致隐藏状态读写分家
 */
async function resolveCurrentUserId() {
  if (currentLoggedInUser && currentLoggedInUser.userid !== undefined) {
    return currentLoggedInUser.userid;
  }
  const lastUserId = await config.getLastLoginUserId();
  if (lastUserId) return lastUserId;
  const users = await config.getUsers();
  return users && users.length > 0 ? users[0].userid : null;
}

/**
 * 解析当前用户的主题设置（浮层窗口使用）
 */
async function resolveUserTheme(account) {
  let theme = 'dark';
  let accentColor = '#0078D4';
  try {
    if (account && account.userId) {
      const settings = await config.getSettings(account.userId);
      theme = settings.theme || theme;
      accentColor = settings.accentColor || accentColor;
    }
  } catch (err) {
    console.warn('[Floating] 解析主题失败:', err.message);
  }
  return { theme, accentColor };
}

/**
 * 任务栏上沿高度：浮动任务栏 bottom 8px + 高 48px；停靠任务栏 bottom 0 + 高 48px
 */
function getTaskbarTop(isFloating) {
  return isFloating ? 56 : 48;
}

function broadcastStartMenuState(open) {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('startmenu:state', open);
  }
}

function broadcastCalendarState(open) {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('calendar:state', open);
  }
}

// ---- 开始菜单窗口 ----
let startMenuHideTimer = null;
let startMenuModalOpen = false; // 开始菜单内部确认弹窗（自定义悬浮窗）是否打开

function positionStartMenuWindow(isFloating) {
  if (!startMenuWindow || startMenuWindow.isDestroyed()) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const taskbarTop = getTaskbarTop(isFloating);
  // 高度自适应屏幕：应用列表在窗口内部滚动，避免开始菜单过高超出屏幕
  const W = 400;
  const H = Math.min(500, Math.max(320, height - taskbarTop - 16));
  startMenuWindow.setSize(W, H);
  startMenuWindow.setPosition(8, Math.max(0, height - H - taskbarTop - 8));
}

async function pushStartMenuTheme() {
  const account = await resolveAccount();
  const { theme, accentColor } = await resolveUserTheme(account);
  if (startMenuWindow && !startMenuWindow.isDestroyed()) {
    startMenuWindow.webContents.send('startmenu:theme', { theme, accentColor, account });
  }
}

function showStartMenuWindow(opts = {}) {
  const isFloating = opts.isTaskbarFloating !== false;

  if (!startMenuWindow || startMenuWindow.isDestroyed()) {
    startMenuWindow = new BrowserWindow({
      width: 400,
      height: 500,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    startMenuWindow.loadFile(path.join(__dirname, 'start-menu.html'));

    startMenuWindow.webContents.on('did-finish-load', () => {
      // 页面重新加载后弹窗必然关闭，重置状态
      startMenuModalOpen = false;
      pushStartMenuTheme();
    });
    startMenuWindow.on('blur', () => {
      // 延迟隐藏：避免点击任务栏开始按钮时 blur 先触发导致“关不掉”
      clearTimeout(startMenuHideTimer);
      startMenuHideTimer = null;
      // 确认弹窗（自定义悬浮窗）打开时不关闭开始菜单
      if (startMenuModalOpen) return;
      startMenuHideTimer = setTimeout(() => {
        startMenuHideTimer = null;
        hideStartMenuWindow();
      }, 200);
    });
    startMenuWindow.on('closed', () => {
      startMenuWindow = null;
      startMenuModalOpen = false;
    });
  }

  positionStartMenuWindow(isFloating);
  startMenuWindow.show();
  startMenuWindow.focus();
  broadcastStartMenuState(true);

  // 每次打开都重新读取 /usr/share/applications（虚拟根），
  // 保证 Pacman 等安装器新增的 .app 立即可见；
  // 窗口还在首次加载时跳过（init 会做初次加载）。
  if (startMenuWindow && !startMenuWindow.isDestroyed() && !startMenuWindow.webContents.isLoading()) {
    startMenuWindow.webContents.send('startmenu:refresh');
  }
}

function hideStartMenuWindow() {
  clearTimeout(startMenuHideTimer);
  startMenuHideTimer = null;
  if (startMenuWindow && !startMenuWindow.isDestroyed() && startMenuWindow.isVisible()) {
    startMenuWindow.hide();
    broadcastStartMenuState(false);
  }
}

ipcMain.handle('startmenu:toggle', async (event, opts = {}) => {
  clearTimeout(startMenuHideTimer);
  startMenuHideTimer = null;
  if (startMenuWindow && !startMenuWindow.isDestroyed() && startMenuWindow.isVisible()) {
    // 确认弹窗打开时不允许通过任务栏按钮关闭开始菜单
    if (!startMenuModalOpen) {
      hideStartMenuWindow();
      return { open: false };
    }
    return { open: true };
  }
  showStartMenuWindow(opts);
  return { open: true };
});

ipcMain.on('startmenu:hide', () => {
  hideStartMenuWindow();
});

// 开始菜单内部确认弹窗状态：弹窗打开时跳过失焦自动隐藏与任务栏按钮关闭
ipcMain.on('startmenu:modal-open', (event, open) => {
  startMenuModalOpen = !!open;
  if (startMenuModalOpen) {
    clearTimeout(startMenuHideTimer);
    startMenuHideTimer = null;
  }
});

// 开始菜单“发送到桌面”后通知桌面窗口刷新
ipcMain.on('startmenu:desktop-added', () => {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('desktop:refresh');
  }
});

/**
 * 通知开始菜单窗口刷新应用列表（隐藏/卸载后即时生效）
 */
function notifyStartMenuRefresh() {
  if (startMenuWindow && !startMenuWindow.isDestroyed() && !startMenuWindow.webContents.isLoading()) {
    startMenuWindow.webContents.send('startmenu:refresh');
  }
}

// ---- 日历窗口 ----
let calendarHideTimer = null;

function positionCalendarWindow(isFloating) {
  if (!calendarWindow || calendarWindow.isDestroyed()) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const W = 280;
  const H = 384;
  const taskbarTop = getTaskbarTop(isFloating);
  calendarWindow.setPosition(width - W - 8, Math.max(0, height - H - taskbarTop - 8));
}

async function pushCalendarTheme() {
  const account = await resolveAccount();
  const { theme, accentColor } = await resolveUserTheme(account);
  if (calendarWindow && !calendarWindow.isDestroyed()) {
    calendarWindow.webContents.send('calendar:theme', { theme, accentColor });
  }
}

function showCalendarWindow(opts = {}) {
  const isFloating = opts.isTaskbarFloating !== false;

  if (!calendarWindow || calendarWindow.isDestroyed()) {
    calendarWindow = new BrowserWindow({
      width: 280,
      height: 384,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    calendarWindow.loadFile(path.join(__dirname, 'calendar.html'));

    calendarWindow.webContents.on('did-finish-load', () => {
      pushCalendarTheme();
    });
    calendarWindow.on('blur', () => {
      clearTimeout(calendarHideTimer);
      calendarHideTimer = setTimeout(() => {
        calendarHideTimer = null;
        hideCalendarWindow();
      }, 200);
    });
    calendarWindow.on('closed', () => {
      calendarWindow = null;
    });
  }

  positionCalendarWindow(isFloating);
  calendarWindow.show();
  calendarWindow.focus();
  broadcastCalendarState(true);
}

function hideCalendarWindow() {
  clearTimeout(calendarHideTimer);
  calendarHideTimer = null;
  if (calendarWindow && !calendarWindow.isDestroyed() && calendarWindow.isVisible()) {
    calendarWindow.hide();
    broadcastCalendarState(false);
  }
}

ipcMain.handle('calendar:toggle', async (event, opts = {}) => {
  clearTimeout(calendarHideTimer);
  calendarHideTimer = null;
  if (calendarWindow && !calendarWindow.isDestroyed() && calendarWindow.isVisible()) {
    hideCalendarWindow();
    return { open: false };
  }
  showCalendarWindow(opts);
  return { open: true };
});

ipcMain.on('calendar:hide', () => {
  hideCalendarWindow();
});

/**
 * 隐藏所有浮层窗口（Shell 模式 / 锁屏时调用）
 */
function hideOverlayWindows() {
  hideStartMenuWindow();
  hideCalendarWindow();
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
    controlCenterWindow.hide();
  }
}

// 设置窗口
let settingsWindow = null;

/**
 * 打开设置窗口（任务栏右键“设置”入口与“设置”默认程序共用）
 */
async function openSettingsWindow(settingsData = {}) {
  console.log('[Settings] openSettingsWindow:', JSON.stringify(settingsData));
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return { success: true };
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const iconPath = path.join(__dirname, '../favicon.ico');
  const theme = settingsData.theme || 'dark';
  const accentColor = settingsData.accentColor || '#0078D4';
  const isTaskbarFloating = settingsData.isTaskbarFloating !== undefined ? settingsData.isTaskbarFloating : true;

  const WIN_W = Math.max(860, Math.min(1040, Math.floor(width * 0.82)));
  const WIN_H = Math.max(560, Math.min(720, Math.floor(height * 0.82)));

  settingsWindow = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: Math.max(0, Math.floor((width - WIN_W) / 2)),
    y: Math.max(0, Math.floor((height - WIN_H) / 2)),
    minWidth: 860,
    minHeight: 560,
    frame: false,
    fullscreen: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: true,
    maximizable: true,
    icon: iconPath,
    backgroundColor: theme === 'bright' ? '#F3F3F3' : '#202020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  // 解析账户信息（当前登录用户，未登录时取最近登录用户）
  const account = await resolveAccount();

  const pushTheme = async () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    let loginBackground = null;
    let displayProfile = 'default';
    let notifyApps = true;
    let notifySystem = true;
    let notifyDnd = false;
    try {
      const settings = await config.getSettings(account.userId);
      loginBackground = settings.loginBackground || null;
      displayProfile = settings.displayProfile || 'default';
      notifyApps = settings.notifyApps !== false;
      notifySystem = settings.notifySystem !== false;
      notifyDnd = !!settings.notifyDnd;
    } catch {}
    settingsWindow.webContents.send('settings:theme', {
      theme,
      accentColor,
      isTaskbarFloating,
      desktopBackground: settingsData.desktopBackground || null,
      loginBackground,
      displayProfile,
      notifyApps,
      notifySystem,
      notifyDnd,
      deviceName: os.hostname(),
      account,
    });
  };

  settingsWindow.webContents.on('did-finish-load', pushTheme);

  const pushMaximized = () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    settingsWindow.webContents.send('settings:maximized', settingsWindow.isMaximized());
  };
  settingsWindow.on('maximize', pushMaximized);
  settingsWindow.on('unmaximize', pushMaximized);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return { success: true };
}

ipcMain.handle('settings:show', async (event, settingsData = {}) => {
  return await openSettingsWindow(settingsData);
});

// 设置窗口控制（最小化 / 最大化 / 关闭）
ipcMain.on('settings:windowAction', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'minimize') {
    win.minimize();
  } else if (action === 'maximize') {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } else if (action === 'close') {
    win.close();
  }
});

// 设备名称与型号（WMI 查询，会话级缓存）
let deviceInfoCache = null;
let deviceInfoPromise = null;

ipcMain.handle('settings:getDeviceInfo', async () => {
  if (deviceInfoCache) return deviceInfoCache;
  if (!deviceInfoPromise) {
    deviceInfoPromise = (async () => {
      const info = { name: os.hostname(), manufacturer: '', model: '' };
      try {
        const pwsh = await getPwshPath();
        // 用 -EncodedCommand 传输，避免 cmd/引号把 $ 变量或格式串吃掉
        const psCmd = '$c = Get-CimInstance Win32_ComputerSystem; "{0}|{1}" -f $c.Manufacturer,$c.Model';
        const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');
        const { stdout } = await execAsync(
          `"${pwsh}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
          { timeout: 8000, windowsHide: true, encoding: 'utf8' }
        );
        const [manufacturer, model] = String(stdout || '').trim().split('|');
        info.manufacturer = (manufacturer || '').trim();
        info.model = (model || '').trim();
      } catch (err) {
        console.warn('[Settings] 设备型号查询失败:', err.message);
      }
      deviceInfoCache = info;
      return info;
    })().catch((err) => {
      deviceInfoPromise = null;
      throw err;
    });
  }
  return deviceInfoPromise;
});

// ==================== 高级管理：新建用户独立窗口 ====================
let userFormWindow = null;

ipcMain.handle('usermgr:show-new', async () => {
  if (userFormWindow && !userFormWindow.isDestroyed()) {
    userFormWindow.focus();
    return { success: true };
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const W = 420;
  const H = 540;
  userFormWindow = new BrowserWindow({
    width: W,
    height: H,
    x: Math.max(0, Math.floor((width - W) / 2)),
    y: Math.max(0, Math.floor((height - H) / 2)),
    frame: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  userFormWindow.loadFile(path.join(__dirname, 'user-form.html'));

  userFormWindow.webContents.on('did-finish-load', async () => {
    const account = await resolveAccount();
    const { theme, accentColor } = await resolveUserTheme(account);
    if (userFormWindow && !userFormWindow.isDestroyed()) {
      userFormWindow.webContents.send('userform:theme', { theme, accentColor });
    }
  });

  userFormWindow.on('closed', () => {
    userFormWindow = null;
  });

  return { success: true };
});

ipcMain.on('usermgr:close', () => {
  if (userFormWindow && !userFormWindow.isDestroyed()) {
    userFormWindow.close();
  }
});

/**
 * 新建用户：仅允许 user/sudo 权限（root 不可由界面创建）
 */
ipcMain.handle('usermgr:create', async (_, payload = {}) => {
  const { username, nickname, permi, password } = payload;
  try {
    const perm = permi === 'sudo' ? 'sudo' : 'user';
    const created = await config.addUser(
      String(username || '').trim(),
      String(password || ''),
      null,
      perm,
      String(nickname || '').trim() || null
    );
    if (!created) {
      return { success: false, code: 'duplicate' };
    }
    // 通知设置窗口刷新高级管理列表
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('admin:refresh');
    }
    return { success: true, user: created };
  } catch (err) {
    console.error('[usermgr:create]', err.message);
    return { success: false, code: 'error', message: err.message };
  }
});

// ==================== 存储（磁盘空间 / 快速清理） ====================

// 磁盘信息缓存（30 秒）
let drivesCache = null;
let drivesCacheTime = 0;

/**
 * 解析虚拟根 /etc/fstab 的挂载映射：Windows 盘符 -> Unix 挂载点
 * 格式：C:\  /media/c
 * @returns {Promise<Object<string, string>>} { 'C': '/media/c', ... }
 */
async function readFstabMounts() {
  const mounts = {};
  try {
    const fstabPath = path.join(config.AMSYS_ROOT, 'etc', 'fstab');
    const text = await fs.readFile(fstabPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const parts = t.split(/\s+/);
      if (parts.length < 2) continue;
      const m = /^([A-Za-z]):\\?$/.exec(parts[0].trim());
      if (m) mounts[m[1].toUpperCase()] = parts[1];
    }
  } catch (err) {
    console.warn('[storage] 读取 fstab 失败:', err.message);
  }
  return mounts;
}

ipcMain.handle('storage:getDrives', async () => {
  if (drivesCache && Date.now() - drivesCacheTime < 30000) {
    return { success: true, drives: drivesCache };
  }
  try {
    const mounts = await readFstabMounts();
    const pwsh = await getPwshPath();
    const psCmd = 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { "{0}|{1}|{2}|{3}" -f $_.DeviceID,$_.VolumeName,$_.Size,$_.FreeSpace }';
    const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `"${pwsh}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout: 10000, windowsHide: true, encoding: 'utf8' }
    );
    const drives = String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [letter, label, sizeStr, freeStr] = line.split('|');
        const size = Number(sizeStr) || 0;
        const freeSpace = Number(freeStr) || 0;
        return {
          letter: letter || '',
          label: label || '',
          size,
          freeSpace,
          used: Math.max(0, size - freeSpace),
          mount: mounts[String(letter || '').replace(':', '').toUpperCase()] || null,
        };
      })
      .filter((d) => d.letter && d.size > 0);
    drivesCache = drives;
    drivesCacheTime = Date.now();
    return { success: true, drives };
  } catch (err) {
    console.error('[storage:getDrives]', err.message);
    return { success: false, error: err.message, drives: [] };
  }
});

/**
 * 递归统计目录大小（带文件数上限，避免超大临时目录卡死）
 */
async function dirSize(dir, budget = { files: 0, max: 80000 }) {
  let total = 0;
  const stack = [dir];
  while (stack.length && budget.files < budget.max) {
    const d = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (budget.files >= budget.max) return total;
      budget.files++;
      const p = path.join(d, e.name);
      try {
        if (e.isDirectory()) stack.push(p);
        else total += (await fs.stat(p)).size;
      } catch {}
    }
  }
  return total;
}

ipcMain.handle('storage:getCleanupTargets', async () => {
  const targets = [];
  const candidates = [
    { path: os.tmpdir(), label: '用户临时文件 (%TEMP%)' },
    { path: path.join(config.AMSYS_ROOT, 'tmp'), label: '系统临时目录 (/tmp)' },
  ];
  for (const t of candidates) {
    try {
      await fs.access(t.path);
      targets.push(t);
    } catch {}
  }
  return { success: true, targets };
});

ipcMain.handle('storage:quickCleanup', async () => {
  const candidates = [
    os.tmpdir(),
    path.join(config.AMSYS_ROOT, 'tmp'),
  ];
  const cleaned = [];
  let freedBytes = 0;
  for (const dir of candidates) {
    try {
      await fs.access(dir);
    } catch {
      continue;
    }
    let before = 0;
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const p = path.join(dir, e.name);
        try {
          if (e.isDirectory()) before += await dirSize(p);
          else before += (await fs.stat(p)).size;
        } catch {}
      }
      for (const e of entries) {
        try {
          await fs.rm(path.join(dir, e.name), { recursive: true, force: true });
        } catch {}
      }
    } catch (err) {
      console.warn('[storage:quickCleanup]', dir, err.message);
    }
    cleaned.push({ path: dir, freedBytes: before });
    freedBytes += before;
  }
  return { success: true, freedBytes, cleaned };
});

// 设置变更事件
ipcMain.on('settings:change', (event, change) => {
  console.log('[Settings IPC] settings:change received:', change);
  // 发送到 dashboard 窗口
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(win => {
    if (win.webContents.getURL().includes('dashboard')) {
      win.webContents.send('settings:change', change);
    }
  });
});

// 包管理器窗口（仅 UI 外壳，安装/卸载逻辑后续接入）
let pkgManagerWindow = null;

ipcMain.handle('pkgmanager:show', async (event, options = {}) => {
  if (pkgManagerWindow && !pkgManagerWindow.isDestroyed()) {
    pkgManagerWindow.focus();
    return { success: true };
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const WIN_W = 420;
  const WIN_H = 560;
  const theme = options.theme || 'dark';
  const accentColor = options.accentColor || '#0078D4';
  const iconPath = path.join(__dirname, '../favicon.ico');

  pkgManagerWindow = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: Math.floor((width - WIN_W) / 2),
    y: Math.floor((height - WIN_H) / 2),
    frame: false,
    fullscreen: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    maximizable: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  pkgManagerWindow.loadFile(path.join(__dirname, 'package-manager.html'));

  pkgManagerWindow.webContents.on('did-finish-load', () => {
    if (!pkgManagerWindow || pkgManagerWindow.isDestroyed()) return;
    pkgManagerWindow.webContents.send('pkgmanager:theme', { theme, accentColor });
  });

  pkgManagerWindow.on('closed', () => {
    pkgManagerWindow = null;
  });

  return { success: true };
});

// 属性窗口
ipcMain.handle('properties:show', async (event, appData) => {
  console.log('[Properties IPC] properties:show received, appData:', JSON.stringify(appData));
  
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const iconPath = path.join(__dirname, '../favicon.ico');
  
  const propsWindow = new BrowserWindow({
    width: 360,
    height: 380,
    x: Math.floor((width - 360) / 2),
    y: Math.floor((height - 380) / 2),
    frame: false,
    fullscreen: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  
  const theme = appData.theme || 'dark';
  const accentColor = appData.accentColor || '#0078D4';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${appData.name} - 属性</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: ${theme === 'dark' ? 'rgba(32, 32, 32, 0.95)' : 'rgba(255, 255, 255, 0.98)'};
          color: ${theme === 'dark' ? '#fff' : '#333'};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
        }
        .title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
          border-bottom: 1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
          cursor: move;
          -webkit-app-region: drag;
        }
        .title-text {
          font-size: 14px;
          font-weight: 500;
        }
        .close-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: ${theme === 'dark' ? '#999' : '#666'};
          font-size: 20px;
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
          -webkit-app-region: no-drag;
        }
        .close-btn:hover {
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
          color: ${theme === 'dark' ? '#fff' : '#333'};
        }
        .content {
          padding: 16px;
          max-height: calc(100vh - 48px);
          overflow-y: auto;
        }
        .content::-webkit-scrollbar { width: 6px; }
        .content::-webkit-scrollbar-track { background: transparent; }
        .content::-webkit-scrollbar-thumb { 
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}; 
          border-radius: 3px; 
        }
        .prop-row {
          display: flex;
          margin-bottom: 12px;
        }
        .prop-label {
          width: 80px;
          color: ${theme === 'dark' ? '#999' : '#666'};
          font-size: 13px;
          flex-shrink: 0;
        }
        .prop-value {
          flex: 1;
          font-size: 13px;
          word-break: break-all;
        }
      </style>
    </head>
    <body>
      <div class="title-bar">
        <span class="title-text">${appData.name} - 属性</span>
        <button class="close-btn" onclick="window.close()">&times;</button>
      </div>
      <div class="content">
        <div class="prop-row"><span class="prop-label">名称</span><span class="prop-value">${appData.name}</span></div>
        <div class="prop-row"><span class="prop-label">ID</span><span class="prop-value">${appData.id}</span></div>
        <div class="prop-row"><span class="prop-label">启动文件</span><span class="prop-value">${appData.start}</span></div>
        <div class="prop-row"><span class="prop-label">描述</span><span class="prop-value">${appData.description || '无'}</span></div>
        <div class="prop-row"><span class="prop-label">执行路径</span><span class="prop-value">${appData.exePath || '无'}</span></div>
        <div class="prop-row"><span class="prop-label">图标路径</span><span class="prop-value">${appData.icon || '无'}</span></div>
      </div>
      <script>
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') window.close();
        });
      </script>
    </body>
    </html>
  `;
  
  propsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  console.log('[Properties IPC] Properties window created');
  
  propsWindow.on('closed', () => {
    console.log('[Properties IPC] Properties window closed');
  });
});

// 窗口边界和位置操作
ipcMain.handle('window:getBounds', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    return win.getBounds();
  }
  return { x: 0, y: 0, width: 0, height: 0 };
});

ipcMain.handle('window:setPosition', async (event, x, y) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setPosition(Math.floor(x), Math.floor(y));
  }
});

// ==================== 应用启动功能 ====================

/**
 * 将单个 Unix 风格路径转换为 Windows 路径
 * Windows 路径（C:\、C:/、相对路径、UNC）原样返回
 */
async function convertAppPath(value) {
  if (typeof value !== 'string' || value.trim() === '') return value;
  const p = value.trim();
  if (!p.startsWith('/')) return value;  // 已是 Windows 路径或相对路径
  if (p.startsWith('//')) return value;  // UNC 路径 \\server\share
  try {
    const converter = await getPathConverter(APP_ROOT);
    const result = await converter.toWindows(p);
    if (result.success && result.winPath) {
      return result.winPath;
    }
  } catch (e) {
    console.warn('Failed to convert unix path:', p, e.message);
  }
  return value;
}

/**
 * 转换 .app 配置中的 Unix 风格路径字段（exePath / icon / cwd / args）
 */
async function convertAppDataPaths(appData) {
  if (!appData || typeof appData !== 'object') return appData;
  const converted = { ...appData };
  converted.exePath = await convertAppPath(appData.exePath);
  if (appData.icon) converted.icon = await convertAppPath(appData.icon);
  if (appData.cwd) converted.cwd = await convertAppPath(appData.cwd);
  if (Array.isArray(appData.args)) {
    converted.args = await Promise.all(appData.args.map(async (a) => {
      // 只转换形如 /xxx/yyy 的路径参数，避免误伤 /flag 形式的参数
      if (typeof a === 'string' && a.startsWith('/') && a.indexOf('/', 1) > 0) {
        return await convertAppPath(a);
      }
      return a;
    }));
  }
  return converted;
}

/**
 * 动态解析 amsys 可执行文件路径：
 * - 读取 config.ini 中的 amsys 键（支持 Unix 风格，如 amsys=/bin/com.amsys.app/amsys.exe，
 *   经内嵌路径转换解析为 Windows 路径；也支持直接写 Windows 路径）
 * - 未配置或路径无效时回退内嵌 amsys（src/amsys/amsys.exe）
 */
let amsysPathCache = null;

async function getAmsysPath() {
  if (amsysPathCache) return amsysPathCache;
  const embedded = path.join(APP_ROOT, 'src', 'amsys', 'amsys.exe');
  let resolved = embedded;
  try {
    const configContent = await fs.readFile(path.join(APP_ROOT, 'config.ini'), 'utf-8');
    let configured = null;
    for (const line of configContent.split(/\r?\n/)) {
      const m = line.match(/^\s*amsys\s*=\s*(.+?)\s*$/i);
      if (m) {
        configured = m[1].trim();
        break;
      }
    }
    if (configured) {
      let candidate = configured;
      if (configured.startsWith('/')) {
        const converter = await getPathConverter(APP_ROOT);
        const r = await converter.toWindows(configured);
        if (r.success && r.winPath) candidate = r.winPath;
      }
      await fs.access(candidate);
      resolved = candidate;
    }
  } catch (e) {
    console.warn('Failed to resolve external amsys, using embedded:', e.message);
  }
  amsysPathCache = resolved;
  console.log('Resolved amsys path:', resolved);
  return resolved;
}

/**
 * 若 exePath 指向内嵌 amsys，则替换为动态解析出的 amsys 路径
 */
async function resolveAmsysIfEmbedded(exePath) {
  if (typeof exePath === 'string' && exePath.replace(/\\/g, '/').toLowerCase().endsWith('src/amsys/amsys.exe')) {
    return await getAmsysPath();
  }
  return exePath;
}

/**
 * 规范化 .app 应用名：兼容传入带或不带 .app 后缀的名称
 * （例如 "com.sysinformer" 与 "com.sysinformer.app" 均指向同一配置文件）
 * @param {string} appName - 原始应用名
 * @returns {string} 去掉尾部 .app 后缀的应用名
 */
function normalizeAppName(appName) {
  return String(appName || '').replace(/\.app$/i, '');
}

/**
 * 启动应用程序
 * @param {string} appName - .app 文件名（不含扩展名）
 */
ipcMain.handle('app:launch', async (_, appName) => {
  try {
    const normalizedName = normalizeAppName(appName);
    let appPath;
    
    try {
      const converter = await getPathConverter(APP_ROOT);
      const result = await converter.toWindows('/usr/share/applications');
      if (result.success && result.winPath) {
        appPath = path.join(result.winPath, `${normalizedName}.app`);
        console.log('App path via converter:', appPath);
      } else {
        throw new Error('path conversion failed');
      }
    } catch (converterError) {
      console.warn('Failed to get app path via converter, using fallback:', converterError.message);
      appPath = path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications', `${normalizedName}.app`);
    }
    
    console.log('Attempting to launch app:', appPath);
    
    const appDataRaw = await fs.readFile(appPath, 'utf-8');
    const appData = await convertAppDataPaths(JSON.parse(appDataRaw));
    appData.exePath = await resolveAmsysIfEmbedded(appData.exePath);
    console.log('App config loaded:', appData);

    // 内置应用（无外部 exe，走程序内窗口）：如设置（internal:settings）
    if (typeof appData.exePath === 'string' && appData.exePath.startsWith('internal:')) {
      const internalName = appData.exePath.slice('internal:'.length);
      if (internalName === 'settings') {
        await openSettingsWindow({});
        return { success: true, appName: appData.name || '设置' };
      }
      throw new Error(`Unsupported internal app: ${internalName}`);
    }
    
    if (!appData.exePath) {
      throw new Error('No exePath specified in app config');
    }
    
    console.log('Launching exe:', appData.exePath);
    
    const isTerminal = appData.exePath.toLowerCase().endsWith('cmd.exe') || 
                       appData.exePath.toLowerCase().endsWith('powershell.exe') ||
                       appData.exePath.toLowerCase().endsWith('pwsh.exe') ||
                       appData.exePath.toLowerCase().endsWith('amsys.exe');
    
    const child = spawn(appData.exePath, appData.args || [], {
      detached: true,
      stdio: isTerminal ? 'inherit' : 'ignore',
      shell: isTerminal,
      cwd: appData.cwd || undefined
    });
    
    child.unref();
    console.log('App launched successfully');
    
    return { success: true, appName: appData.name };
    
  } catch (error) {
    console.error('Failed to launch app:', error.message);
    console.error('Error stack:', error.stack);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 获取应用信息
async function extractAppIcon(appData, appName) {
  let iconPath = appData.icon;
  if (!iconPath) return iconPath;
  try {
    const nativeImage = require('electron').nativeImage;
    let icon = null;
    if (/\.(png|jpg|jpeg|gif)$/i.test(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    } else if (/\.ico$/i.test(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        icon = await app.getFileIcon(iconPath, { size: 'large' });
      }
    } else {
      // exe 等程序图标：nativeImage.createFromPath 不支持 exe，必须用 app.getFileIcon
      icon = await app.getFileIcon(iconPath, { size: 'large' });
    }
    if (!icon.isEmpty()) {
      const tempIconPath = path.join(os.tmpdir(), `${appName}-icon.png`);
      await fs.writeFile(tempIconPath, icon.toPNG());
      iconPath = tempIconPath;
    }
  } catch (iconError) {
    console.warn('Failed to extract icon:', iconError.message);
  }
  return iconPath;
}

ipcMain.handle('app:getInfo', async (_, appName) => {
  try {
    const normalizedName = normalizeAppName(appName);
    let appPath;
    
    try {
      const converter = await getPathConverter(APP_ROOT);
      const result = await converter.toWindows('/usr/share/applications');
      if (result.success && result.winPath) {
        appPath = path.join(result.winPath, `${normalizedName}.app`);
        console.log('App path via converter:', appPath);
      } else {
        throw new Error('path conversion failed');
      }
    } catch (converterError) {
      console.warn('Failed to get app path via converter, using fallback:', converterError.message);
      appPath = path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications', `${normalizedName}.app`);
    }
    
    console.log('Getting app info:', appPath);
    
    let appData;
    try {
      const appDataRaw = await fs.readFile(appPath, 'utf-8');
      appData = JSON.parse(appDataRaw);
    } catch (readError) {
      console.warn('.app file not found, using built-in app mapping:', readError.message);
      const appMappings = {
        'com.browser': {
          name: '浏览器',
          description: '默认浏览器（Edge）',
          exePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          icon: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        },
        'com.terminal': {
          name: '终端',
          description: 'Ameng Shell 终端',
          exePath: path.join(APP_ROOT, 'src', 'amsys', 'amsys.exe'),
          icon: 'C:\\Windows\\System32\\cmd.exe'
        },
        'com.explorer': {
          name: '资源管理器',
          description: '文件资源管理器',
          exePath: 'C:\\Windows\\explorer.exe',
          icon: 'C:\\Windows\\explorer.exe'
        },
        'com.notepad': {
          name: '记事本',
          description: '文本编辑器',
          exePath: 'C:\\Windows\\notepad.exe',
          icon: 'C:\\Windows\\notepad.exe'
        },
        'com.calculator': {
          name: '计算器',
          description: 'Windows 计算器',
          exePath: 'C:\\Windows\\System32\\calc.exe',
          icon: 'C:\\Windows\\System32\\calc.exe'
        }
      };
      appData = appMappings[appName];
      if (!appData) {
        return { 
          success: false, 
          error: 'App not found in mapping' 
        };
      }
    }
    
    // 支持 .app 配置中的 Unix 风格路径（/usr、/opt、/mnt/c 等）
    appData = await convertAppDataPaths(appData);
    appData.exePath = await resolveAmsysIfEmbedded(appData.exePath);
    
    const iconPath = await extractAppIcon(appData, appName);
    
    return {
      success: true,
      name: appData.name,
      description: appData.description,
      exePath: appData.exePath,
      icon: iconPath
    };
    
  } catch (error) {
    console.error('Failed to get app info:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

/**
 * 解析 /usr/share/applications 的 Windows 绝对路径（amsys 转换，失败回退 rootdir）
 */
async function getApplicationsDir() {
  try {
    const converter = await getPathConverter(APP_ROOT);
    const result = await converter.toWindows('/usr/share/applications');
    if (result.success && result.winPath) {
      return result.winPath;
    }
    throw new Error('path conversion failed');
  } catch (converterError) {
    return path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications');
  }
}

// 列出 /usr/share/applications 下所有 .app 文件（开始菜单的完整应用来源；可按用户过滤隐藏）
ipcMain.handle('apps:listAll', async (_, userId) => {
  try {
    const appsDir = await getApplicationsDir();
    const uid = (await resolveCurrentUserId()) || userId;
    const hidden = uid != null ? await config.getHiddenApps(uid) : [];
    const hiddenPkgs = hidden
      .map((h) => String(h).replace(/\.app$/i, '').split('.').slice(1).join('.').toLowerCase())
      .filter(Boolean);
    const entries = await fs.readdir(appsDir);
    const apps = [];
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.app')) continue;
      const appName = entry.replace(/\.app$/i, '');
      if (hidden.some((h) => h.toLowerCase() === `${appName}.app`.toLowerCase())) continue;
      // 按包过滤：com.wps.app 被隐藏时，word/ppt/excel.wps.app 一并隐藏
      const pkg = appName.split('.').slice(1).join('.').toLowerCase();
      if (pkg && hiddenPkgs.includes(pkg)) continue;
      try {
        const raw = await fs.readFile(path.join(appsDir, entry), 'utf-8');
        const data = await convertAppDataPaths(JSON.parse(raw));
        apps.push({
          appName,
          name: data.name || appName,
          description: data.description || '',
          exePath: data.exePath || '',
          icon: data.icon || null,
        });
      } catch (parseError) {
        console.warn('Failed to parse app file:', entry, parseError.message);
      }
    }
    return { success: true, apps };
  } catch (error) {
    console.error('Failed to list apps:', error.message);
    return { success: false, error: error.message, apps: [] };
  }
});

/**
 * 读取已安装包元信息：版本（aminfo.ini）与系统标记（system.flag）
 */
async function readPackageMeta(appName) {
  const etcDir = path.join(config.AMSYS_ROOT, 'etc', String(appName).replace(/\.app$/i, '') + '.app');
  let version = '';
  let system = false;
  try {
    const ini = await fs.readFile(path.join(etcDir, 'aminfo.ini'), 'utf8');
    const m = ini.match(/^\s*version\s*=\s*(.+?)\s*$/mi);
    if (m) version = m[1].trim();
  } catch {}
  try {
    const flag = await fs.readFile(path.join(etcDir, 'system.flag'), 'utf8');
    system = flag.trim().toLowerCase() === 'system';
  } catch {}
  return { version, system };
}

// 列出已安装应用（/etc/apmlist 权威；按用户标注隐藏状态）
ipcMain.handle('apps:listInstalled', async (_, userId) => {
  try {
    const uid = (await resolveCurrentUserId()) || userId;
    const apmListPath = path.join(config.AMSYS_ROOT, 'etc', 'apmlist');
    let lines = [];
    try {
      lines = (await fs.readFile(apmListPath, 'utf8'))
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    } catch (e) {
      return { success: false, error: `apmlist 不可读: ${e.message}`, apps: [] };
    }

    const hidden = uid != null ? await config.getHiddenApps(uid) : [];
    const appsDir = await getApplicationsDir();
    const apps = [];
    for (const appName of lines) {
      const base = appName.replace(/\.app$/i, '');
      let name = base;
      let description = '';
      let icon = null;
      try {
        const raw = await fs.readFile(path.join(appsDir, `${base}.app`), 'utf-8');
        const data = await convertAppDataPaths(JSON.parse(raw));
        name = data.name || base;
        description = data.description || '';
        icon = await extractAppIcon(data, base);
      } catch (e) {
        console.warn('已安装应用缺少 .app 配置:', appName, e.message);
      }
      const { version, system } = await readPackageMeta(appName);
      apps.push({
        appName,
        name,
        description,
        icon,
        version,
        system,
        hidden: hidden.some((h) => h.toLowerCase() === appName.toLowerCase()),
      });
    }
    return { success: true, apps };
  } catch (error) {
    console.error('Failed to list installed apps:', error.message);
    return { success: false, error: error.message, apps: [] };
  }
});

ipcMain.handle('apps:getHidden', async (_, userId) => {
  const uid = (await resolveCurrentUserId()) || userId;
  return { success: true, hiddenApps: await config.getHiddenApps(uid) };
});

ipcMain.handle('apps:setHidden', async (_, userId, appName, hidden) => {
  const uid = (await resolveCurrentUserId()) || userId;
  const list = await config.setHiddenApp(uid, appName, hidden);
  // 即时刷新开始菜单（隐藏/解除隐藏立刻生效）
  notifyStartMenuRefresh();
  return { success: true, hiddenApps: list };
});

/**
 * 卸载后清理所有用户桌面快捷方式中指向该应用的条目
 */
async function removeDesktopShortcuts(appName) {
  const base = String(appName || '').replace(/\.app$/i, '');
  try {
    const entries = await fs.readdir(config.CONFIG_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue;
      const desktopPath = path.join(config.CONFIG_DIR, e.name, 'desktop.json');
      try {
        const data = JSON.parse(await fs.readFile(desktopPath, 'utf8'));
        if (!Array.isArray(data.desktopapp)) continue;
        const before = data.desktopapp.length;
        data.desktopapp = data.desktopapp.filter(
          (a) => String(a.start || '').replace(/\.app$/i, '') !== base
        );
        if (data.desktopapp.length !== before) {
          await fs.writeFile(desktopPath, JSON.stringify(data, null, 2), 'utf8');
        }
      } catch {}
    }
  } catch (err) {
    console.warn('清理桌面快捷方式失败:', err.message);
  }
}

// 卸载应用（调用 amsys 的 apm uninstall）
ipcMain.handle('apps:uninstall', async (_, appName) => {
  const apmPath = path.join(config.AMSYS_ROOT, 'bin', 'apm.exe');
  try {
    await fs.access(apmPath);
  } catch (e) {
    return { success: false, error: 'apm 未找到' };
  }
  const name = String(appName || '').replace(/\.app$/i, '') + '.app';
  try {
    const result = await new Promise((resolve) => {
      const child = spawn(apmPath, ['uninstall', name], { windowsHide: true });
      let output = '';
      child.stdout.on('data', (d) => { output += d; });
      child.stderr.on('data', (d) => { output += d; });
      child.on('error', (err) => resolve({ success: false, error: err.message }));
      child.on('close', (code) => resolve({ success: code === 0, code, output }));
    });
    if (result.success) {
      await removeDesktopShortcuts(name);
      // 即时刷新开始菜单（卸载后立刻消失）
      notifyStartMenuRefresh();
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

let lockWindow = null;
let currentLoggedInUser = null;

ipcMain.handle('screen:lock', async () => {
  if (lockWindow) {
    return;
  }

  // 锁屏时隐藏所有浮层窗口
  hideOverlayWindows();
  
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  lockWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    fullscreen: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  
  lockWindow.loadFile(path.join(__dirname, 'lockscreen.html'));
  
  lockWindow.on('closed', () => {
    lockWindow = null;
  });
  
  lockWindow.on('blur', () => {
    if (lockWindow) {
      lockWindow.focus();
    }
  });
});

ipcMain.handle('lockscreen:init', async () => {
  if (!currentLoggedInUser) {
    const lastUserId = await config.getLastLoginUserId();
    if (lastUserId) {
      const users = await config.getUsers();
      currentLoggedInUser = users.find(u => u.userid === lastUserId);
    }
  }
  
  if (currentLoggedInUser) {
    const settings = await config.getSettings(currentLoggedInUser.userid);
    const desktop = await config.getUserDesktop(currentLoggedInUser.userid);
    const userConfig = await config.getUserConfig(currentLoggedInUser.userid);
    
    return {
      userId: currentLoggedInUser.userid,
      username: currentLoggedInUser.username,
      avatar: currentLoggedInUser.photo || null,
      hasPassword: !!(userConfig.login && userConfig.login.password),
      theme: settings.theme || 'dark',
      accentColor: settings.accentColor || '#0078D4',
      background: desktop.desktopbg || null
    };
  }
  return null;
});

ipcMain.on('lockscreen:unlock', () => {
  if (lockWindow) {
    lockWindow.close();
    lockWindow = null;
  }
});

/**
 * 启动 amsys Shell 窗口（Shell 模式）
 *
 * 通过 Start-Process 让 amsys 运行在独立控制台窗口中（而非继承 Electron
 * 的控制台或没有窗口），并拿到真实 PID 以便后续强制清理。
 *
 * 关闭语义：
 * - 用户点击窗口 X / 任务管理器强杀 → amsys 退出码非 0 → 视为"被关闭"，
 *   Shell 模式期间自动重启，保证窗口无法被关闭；
 * - 用户在 amsys 中输入 exit 正常退出 → 退出码 0 → 视为"主动退出"，
 *   自动结束 Shell 模式并恢复主界面。
 */
function startAmsysProcess() {
  const scriptPath = path.join(os.tmpdir(), `amengui_shell_${Date.now()}.ps1`);
  const scriptContent = [
    '$proc = Start-Process -FilePath $args[0] -WorkingDirectory $args[1] -PassThru',
    'Write-Output ("PID=" + $proc.Id)',
    '$proc.WaitForExit()',
    'Write-Output ("EXITCODE=" + $proc.ExitCode)'
  ].join('\r\n');
  
  fs.writeFile(scriptPath, scriptContent, 'utf-8')
    .then(async () => {
      const amsysPath = await getAmsysPath();
      const pwsh = await getPwshPath();
      // 工作目录：外部 amsys 通常与其 config.ini 同目录，优先使用；否则回退项目根
      let workDir = APP_ROOT;
      try {
        await fs.access(path.join(path.dirname(amsysPath), 'config.ini'));
        workDir = path.dirname(amsysPath);
      } catch {
        // 使用默认 APP_ROOT
      }
      const launcher = spawn(pwsh, [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        amsysPath,
        workDir
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
      
      amsysProcess = launcher;
      amsysShellPid = null;
      
      let launcherStdout = '';
      launcher.stdout.on('data', (data) => {
        const text = data.toString();
        launcherStdout += text;
        const pidMatch = text.match(/PID=(\d+)/);
        if (pidMatch) {
          amsysShellPid = parseInt(pidMatch[1], 10);
          console.log('amsys window started, pid:', amsysShellPid);
        }
      });
      launcher.stderr.on('data', (data) => {
        console.error('[amsys launcher stderr]', data.toString());
      });
      
      launcher.on('exit', () => {
        fs.unlink(scriptPath, () => {});
        const pidMatch = launcherStdout.match(/PID=(\d+)/);
        const codeMatch = launcherStdout.match(/EXITCODE=(\d+)/);
        const amsysPid = pidMatch ? parseInt(pidMatch[1], 10) : null;
        const amsysExitCode = codeMatch ? parseInt(codeMatch[1], 10) : null;
        
        console.log(`amsys (pid ${amsysPid}) exited with code: ${amsysExitCode}`);
        amsysProcess = null;
        amsysShellPid = null;
        
        if (!isShellMode) return;
        
        if (amsysExitCode === 0) {
          // 主动输入 exit：结束 Shell 模式，恢复主界面
          console.log('amsys exited normally (exit), leaving shell mode...');
          exitShellMode();
          showMainUI();
        } else {
          // 被强制关闭：自动重启，保证 Shell 无法被关闭
          console.log('amsys was closed forcefully, restarting in 1s...');
          setTimeout(() => {
            if (isShellMode) startAmsysProcess();
          }, 1000);
        }
      });
      
      launcher.on('error', (err) => {
        console.error('Failed to start amsys launcher:', err.message);
        fs.unlink(scriptPath, () => {});
        amsysProcess = null;
        if (isShellMode) {
          setTimeout(() => {
            if (isShellMode) startAmsysProcess();
          }, 1000);
        }
      });
    })
    .catch((err) => {
      console.error('Failed to write amsys shell script:', err.message);
      if (isShellMode) {
        setTimeout(() => {
          if (isShellMode) startAmsysProcess();
        }, 1000);
      }
    });
}

function showMainUI() {
  // 优先恢复进入 Shell 模式时被隐藏的窗口（桌面或登录页）
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show();
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  } else {
    createWindow();
  }
}

ipcMain.on('auth:shell', () => {
  console.log('=== Entering Shell Mode ===');
  
  isShellMode = true;

  // 隐藏所有浮层窗口
  hideOverlayWindows();
  
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.hide();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
  
  startAmsysProcess();
});

ipcMain.on('auth:exit-shell', () => {
  exitShellMode();
  showMainUI();
});

ipcMain.on('auth:shutdown', () => {
  console.log('=== System Shutdown ===');
  spawn('shutdown', ['/s', '/t', '0'], { detached: true });
});

ipcMain.on('auth:restart', () => {
  console.log('=== System Restart ===');
  spawn('shutdown', ['/r', '/t', '0'], { detached: true });
});

function exitShellMode() {
  console.log('=== Exiting Shell Mode ===');
  isShellMode = false;
  if (amsysShellPid) {
    console.log('Killing amsys process tree, pid:', amsysShellPid);
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(amsysShellPid)], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (e) {
      console.error('Failed to kill amsys process:', e);
    }
    amsysShellPid = null;
  }
  amsysProcess = null;
}

ipcMain.handle('control-center:show', async () => {
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
    // 开发模式下每次显示都重载窗口，确保加载最新的 control-center.js，
    // 避免"窗口创建一次后永久复用"导致旧逻辑残留（历史调试陷阱）
    if (!app.isPackaged) {
      controlCenterWindow.webContents.reload();
      // 重载后必然回到主视图，重置为原始尺寸，避免混音器残留的 340x520
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: sw, height: sh } = primaryDisplay.workAreaSize;
      const BOTTOM_MARGIN = 68;
      controlCenterWindow.setSize(320, 420);
      controlCenterWindow.setPosition(sw - 320 - 16, sh - 420 - BOTTOM_MARGIN);
    }
    // 每次显示重新断言置顶，防止某些情况下丢失 WS_EX_TOPMOST
    controlCenterWindow.setAlwaysOnTop(true);
    controlCenterWindow.show();
    controlCenterWindow.focus();
    return;
  }
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const CONTROL_CENTER_WIDTH = 320;
  const CONTROL_CENTER_HEIGHT = 420;
  // 悬浮任务栏：底部 8px 起、高 48px，面板定位在其上方并留 12px 间距
  const BOTTOM_MARGIN = 68;
  
  controlCenterWindow = new BrowserWindow({
    width: CONTROL_CENTER_WIDTH,
    height: CONTROL_CENTER_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  
  controlCenterWindow.setPosition(width - CONTROL_CENTER_WIDTH - 16, height - CONTROL_CENTER_HEIGHT - BOTTOM_MARGIN);
  controlCenterWindow.loadFile(path.join(__dirname, 'control-center.html'));
  // 开发模式打开 DevTools，便于查看控制中心日志与错误（否则日志打在不可见窗口）
  if (!app.isPackaged) {
    controlCenterWindow.webContents.openDevTools({ mode: 'detach' });
  }
  
  controlCenterWindow.on('closed', () => {
    controlCenterWindow = null;
  });
  
  controlCenterWindow.on('blur', () => {
    controlCenterWindow.hide();
  });

  controlCenterWindow.on('show', () => {
    if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
      controlCenterWindow.setAlwaysOnTop(true);
    }
  });
});

ipcMain.handle('control-center:hide', async () => {
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
    controlCenterWindow.hide();
  }
});

ipcMain.handle('control-center:resize', async (_, width, height) => {
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
    const w = Math.max(280, Math.min(480, parseInt(width) || 320));
    const h = Math.max(320, Math.min(900, parseInt(height) || 420));
    controlCenterWindow.setSize(w, h);
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = primaryDisplay.workAreaSize;
    const BOTTOM_MARGIN = 68;
    controlCenterWindow.setPosition(sw - w - 16, sh - h - BOTTOM_MARGIN);
    return { success: true };
  }
  return { success: false };
});

// 已解析的 PowerShell 路径缓存（解析一次即可，全程复用）
let resolvedPwshPath = null;

/**
 * 解析可用的 PowerShell 可执行文件，优先级：
 *   1. config.ini [paths] 节的 pwsh 键（支持便携版/外部 pwsh7：
 *      Unix 风格路径如 pwsh=/opt/pwsh/pwsh.exe 会经内嵌转换解析，
 *      也支持 Windows 绝对路径；相对路径按项目根解析）
 *   2. 内置 PowerShell 7（PowerShell/7/pwsh.exe）
 *   3. 系统 PATH 上的 pwsh（PowerShell 7）
 *   4. 系统 Windows PowerShell 5.1（powershell）——仅当 1/2/3 都不存在时才回退，
 *      避免在未安装 PS5 的环境（Nano Server / 精简 PE / 仅装 pwsh7 的机器）下报错
 * 返回裸可执行名/路径（供 spawn 使用，非 cmd 引用串）。
 */
async function getPwshPath() {
  if (resolvedPwshPath) return resolvedPwshPath;

  // 1. config.ini 中显式配置的 pwsh 路径（便携版/外部 pwsh7，优先于一切内置路径）
  try {
    const configContent = await fs.readFile(path.join(APP_ROOT, 'config.ini'), 'utf-8');
    for (const line of configContent.split(/\r?\n/)) {
      const m = line.match(/^\s*pwsh\s*=\s*(.+?)\s*$/i);
      if (!m) continue;
      let candidate = m[1].trim();
      if (!candidate) continue;
      if (candidate.startsWith('/')) {
        // Unix 风格路径：经内嵌转换解析为 Windows 路径
        const converter = await getPathConverter(APP_ROOT);
        const r = await converter.toWindows(candidate);
        if (r.success && r.winPath) candidate = r.winPath;
      } else if (!path.isAbsolute(candidate)) {
        // 相对路径按项目根解析
        candidate = path.resolve(APP_ROOT, candidate);
      }
      try {
        await fs.access(candidate);
        resolvedPwshPath = candidate;
        console.log('Resolved pwsh path (config.ini):', resolvedPwshPath);
        return resolvedPwshPath;
      } catch {
        console.warn(`[pwsh] config.ini 配置的 pwsh 路径无效，忽略: ${candidate}`);
      }
    }
  } catch { /* config.ini 不存在或不可读，继续内置路径 */ }

  // 2. 内置 pwsh7
  try {
    await fs.access(PWSH_PATH);
    resolvedPwshPath = PWSH_PATH;
    return resolvedPwshPath;
  } catch { /* 继续尝试系统 pwsh */ }

  // 3. 系统 PATH 上的 pwsh（仅当确实能找到时才采用，避免误伤仅装 PS5 的机器）
  try {
    const r = spawnSync('where', ['pwsh'], { encoding: 'utf8', windowsHide: true });
    const hit = String(r.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && /\.exe$/i.test(s));
    if (hit) {
      resolvedPwshPath = hit;
      return resolvedPwshPath;
    }
  } catch { /* 继续回退 */ }

  // 4. 回退系统 Windows PowerShell 5.1（最后手段，仅提示一次）
  resolvedPwshPath = 'powershell';
  console.warn('[pwsh] 未找到配置/内置/系统 pwsh，回退到系统 powershell（5.1）');
  return resolvedPwshPath;
}

/**
 * 常驻 PowerShell 服务：避免每次操作都冷启动 pwsh（冷启动 + 模块枚举可达数秒）
 * 通过 stdin/stdout 的 JSON Lines 协议通信；进程内缓存由脚本自身维护
 */
class PwshServer {
  constructor(scriptPath) {
    this.scriptPath = scriptPath;
    this.child = null;
    this.pending = new Map();
    this.seq = 0;
    this.buffer = '';
    this.starting = null;
  }

  ensureStarted() {
    if (this.child && this.child.exitCode === null) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.start().finally(() => { this.starting = null; });
    return this.starting;
  }

  async start() {
    const pwshPath = await getPwshPath();
    const child = spawn(pwshPath, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath, '-Server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.onData(chunk));
    child.stderr.on('data', (d) => console.error('[pwsh-server]', String(d).trim()));
    child.on('exit', () => {
      this.child = null;
      const err = new Error('pwsh server exited');
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
    });
    child.on('error', () => {
      this.child = null;
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) {
        p.resolve(msg.data);
      } else {
        p.reject(new Error(msg.error || 'pwsh command failed'));
      }
    }
  }

  command(cmd, args = [], timeoutMs = IPC_TIMEOUT) {
    return this.ensureStarted().then(() => {
      if (!this.child || this.child.exitCode !== null) {
        return Promise.reject(new Error('pwsh server unavailable'));
      }
      const id = ++this.seq;
      const payload = JSON.stringify({ id, cmd, args });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`pwsh command timeout: ${cmd}`));
        }, timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        try {
          this.child.stdin.write(payload + '\n');
        } catch (e) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(e);
        }
      });
    });
  }

  kill() {
    if (this.child && this.child.exitCode === null) {
      try { this.child.stdin.end(); } catch {}
      try { this.child.kill(); } catch {}
    }
  }
}

const audioServer = new PwshServer(AUDIO_SCRIPT);
const sysServer = new PwshServer(SYS_SCRIPT);

// 能力探测缓存（10 分钟；应用启动时已后台预热）
let capabilitiesCache = null;
let capabilitiesCacheAt = 0;

async function getCapabilities(force = false) {
  const now = Date.now();
  if (!force && capabilitiesCache && now - capabilitiesCacheAt < 600000) {
    return capabilitiesCache;
  }
  const [sysRes, audioRes] = await Promise.all([
    sysServer.command('capabilities', [], 20000).catch(() => ({})),
    audioServer.command('capabilities', [], 30000).catch(() => ({})),
  ]);
  // 探测失败时按"可用"处理（UI 仍尝试），仅显式返回 false 才禁用
  const caps = {
    audio: !(audioRes && audioRes.audio === false),
    brightness: !(sysRes && sysRes.brightness === false),
    isLaptop: !!(sysRes && sysRes.isLaptop),
  };
  capabilitiesCache = caps;
  capabilitiesCacheAt = now;
  return caps;
}

/**
 * 应用启动时后台预热：拉起音频/系统常驻服务并预取能力与设备状态，
 * 让控制中心打开和开关操作不再经历冷启动
 */
function prewarmSystemServices() {
  // 音频服务首启会编译 Core Audio COM 互操作代码（数秒），提前完成
  audioServer.command('capabilities', [], 30000).catch((e) => {
    console.error('Audio prewarm failed:', e.message);
  });
  // 系统服务首启 + 能力枚举 + 亮度/网络/蓝牙状态预热（WMI/PnP 首次调用较慢）
  getCapabilities()
    .then(() => sysServer.command('getBrightness', [], 15000))
    .then(() => sysServer.command('networkStatus', [], 15000))
    .then(() => sysServer.command('bluetoothStatus', [], 20000))
    .then(() => sysServer.command('wifiStatus', [], 15000))
    .then(() => sysServer.command('btDevices', [], 20000))
    .then(() => audioServer.command('getVolume', [], 15000))
    .catch((e) => {
      console.error('System prewarm failed:', e.message);
    });
}

ipcMain.handle('system:getVolume', async () => {
  try {
    const r = await audioServer.command('getVolume', [], 30000);
    return {
      success: !!(r && r.success),
      volume: r && typeof r.volume === 'number' ? Math.round(r.volume) : -1,
      mute: !!(r && r.mute),
      deviceName: (r && r.deviceName) || '',
    };
  } catch (e) {
    return { success: false, volume: -1, mute: false, deviceName: '', error: e.message };
  }
});

ipcMain.handle('system:setVolume', async (_, volume) => {
  try {
    const v = Math.max(0, Math.min(100, parseInt(volume) || 0));
    const r = await audioServer.command('setVolume', [v], 20000);
    return { success: !!(r && r.success) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:setMute', async (_, mute) => {
  try {
    const r = await audioServer.command('setMute', [!!mute], 15000);
    return { success: !!(r && r.success) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:getAudioDevices', async () => {
  try {
    const r = await audioServer.command('getDevices', [], 15000);
    return { success: true, defaultId: (r && r.defaultId) || null, devices: (r && r.devices) || [] };
  } catch (e) {
    return { success: false, error: e.message, devices: [] };
  }
});

ipcMain.handle('system:setDefaultAudioDevice', async (_, id) => {
  try {
    const r = await audioServer.command('setDefaultDevice', [String(id || '')], 15000);
    return { success: !!(r && r.success) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:getAudioSessions', async () => {
  try {
    const r = await audioServer.command('getSessions', [], 20000);
    return { success: true, sessions: (r && r.sessions) || [] };
  } catch (e) {
    return { success: false, error: e.message, sessions: [] };
  }
});

ipcMain.handle('system:setSessionVolume', async (_, pid, volume) => {
  try {
    const v = Math.max(0, Math.min(100, parseInt(volume) || 0));
    const r = await audioServer.command('setSessionVolume', [parseInt(pid) || 0, v], 15000);
    return { success: !!(r && r.success) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:setSessionMute', async (_, pid, mute) => {
  try {
    const r = await audioServer.command('setSessionMute', [parseInt(pid) || 0, !!mute], 15000);
    return { success: !!(r && r.success) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:getCapabilities', async () => {
  return await getCapabilities();
});

ipcMain.handle('system:getBrightness', async () => {
  try {
    const r = await sysServer.command('getBrightness', [], 15000);
    if (!(r && r.success)) return { success: false, brightness: -1, error: (r && r.error) || 'unavailable' };
    return { success: true, brightness: r.brightness };
  } catch (e) {
    return { success: false, brightness: -1, error: e.message };
  }
});

ipcMain.handle('system:setBrightness', async (_, brightness) => {
  try {
    const v = Math.max(0, Math.min(100, parseInt(brightness) || 0));
    const r = await sysServer.command('setBrightness', [v], 15000);
    return { success: !!(r && r.success) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 显示器列表（Electron screen + 刷新率 best-effort）
let refreshRateCache = null;
ipcMain.handle('system:getDisplays', async () => {
  try {
    const displays = screen.getAllDisplays().map((d) => ({
      id: String(d.id),
      primary: d.id === screen.getPrimaryDisplay().id,
      label: `${d.size.width}×${d.size.height}`,
      scaleFactor: d.scaleFactor,
      x: d.bounds.x,
      y: d.bounds.y,
      refreshRate: null,
    }));
    // 刷新率经 pwsh 查询（缓存，失败不影响列表）
    if (!refreshRateCache) {
      try {
        const pwsh = await getPwshPath();
        const psCmd = '(Get-CimInstance Win32_VideoController | Where-Object { $_.CurrentRefreshRate -gt 0 } | Select-Object -First 1).CurrentRefreshRate';
        const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');
        const { stdout } = await execAsync(
          `"${pwsh}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
          { timeout: 6000, windowsHide: true, encoding: 'utf8' }
        );
        const rate = parseInt(String(stdout || '').trim(), 10);
        if (!Number.isNaN(rate) && rate > 0) refreshRateCache = rate;
      } catch {}
    }
    if (refreshRateCache) {
      displays.forEach((d) => { d.refreshRate = refreshRateCache; });
    }
    return { success: true, displays };
  } catch (err) {
    console.error('[system:getDisplays]', err.message);
    return { success: false, error: err.message, displays: [] };
  }
});

// 夜间模式（注册表 bluelightreductionstate；PE 不支持，键缺失时自动创建）
const NIGHT_MODE_REG =
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreductionstate';

/**
 * 检测是否运行在 Windows PE（SystemStartOptions 含 MININT）
 */
async function isWindowsPE() {
  try {
    const pwsh = await getPwshPath();
    const psCmd = '((Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SystemStartOptions" -ErrorAction SilentlyContinue).SystemStartOptions -match "MININT")';
    const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `"${pwsh}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout: 6000, windowsHide: true, encoding: 'utf8' }
    );
    return String(stdout || '').trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

/**
 * 确保夜间模式注册表键存在（普通 Windows 首次使用前键不存在，需创建）
 */
async function ensureNightModeKey() {
  try {
    const pwsh = await getPwshPath();
    const psCmd = `
      $p = '${NIGHT_MODE_REG}'
      try {
        if (-not (Test-Path $p)) {
          New-Item -Path $p -Force | Out-Null
          New-ItemProperty -Path $p -Name Data -Value ([byte[]]@(0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00)) -PropertyType Binary -Force | Out-Null
          New-ItemProperty -Path $p -Name Version -Value 1 -PropertyType DWord -Force | Out-Null
        }
        Write-Host 'ok'
      } catch { Write-Host 'fail' }`;
    const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `"${pwsh}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout: 8000, windowsHide: true, encoding: 'utf8' }
    );
    return String(stdout || '').trim() === 'ok';
  } catch {
    return false;
  }
}

async function readNightMode() {
  const pwsh = await getPwshPath();
  const psCmd = `
    $p = '${NIGHT_MODE_REG}'
    try {
      $v = Get-ItemProperty -Path $p -Name Data -ErrorAction Stop
      if ($null -eq $v.Data) { Write-Host 'missing'; exit }
      $b = [byte[]]$v.Data
      if ($b.Length -ge 5) { Write-Host $(if ($b[4] -eq 1) { 'on' } else { 'off' }) }
      else { Write-Host 'off' }
    } catch { Write-Host 'missing' }`;
  const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');
  const { stdout } = await execAsync(
    `"${pwsh}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    { timeout: 8000, windowsHide: true, encoding: 'utf8' }
  );
  const out = String(stdout || '').trim();
  if (out === 'on') return { supported: true, enabled: true };
  if (out === 'off') return { supported: true, enabled: false };
  return { supported: false, enabled: false };
}

ipcMain.handle('system:getNightMode', async () => {
  try {
    if (await isWindowsPE()) {
      return { supported: false, enabled: false, reason: 'pe' };
    }
    let state = await readNightMode();
    if (!state.supported) {
      // 键缺失：尝试创建后重读（普通 Windows 下可用）
      if (await ensureNightModeKey()) {
        state = await readNightMode();
      }
    }
    return state;
  } catch (err) {
    return { supported: false, enabled: false, error: err.message };
  }
});

ipcMain.handle('system:setNightMode', async (_, enabled) => {
  try {
    if (await isWindowsPE()) {
      return { success: false, unsupported: true, reason: 'pe' };
    }
    const state = await readNightMode();
    if (!state.supported && !(await ensureNightModeKey())) {
      return { success: false, unsupported: true };
    }
    const pwsh = await getPwshPath();
    const on = !!enabled ? '01' : '00';
    const psCmd = `
      $p = '${NIGHT_MODE_REG}'
      try {
        $v = Get-ItemProperty -Path $p -Name Data -ErrorAction Stop
        $b = [byte[]]@(0x01,0x00,0x00,0x00,0x${on},0x00,0x00,0x00)
        Set-ItemProperty -Path $p -Name Data -Value $b
        Write-Host 'ok'
      } catch { Write-Host 'fail' }`;
    const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `"${pwsh}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout: 8000, windowsHide: true, encoding: 'utf8' }
    );
    return { success: String(stdout || '').trim() === 'ok' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 输入音频设备（audio.ps1 扩展的 eCapture 枚举）
ipcMain.handle('system:getInputDevices', async () => {
  try {
    const r = await audioServer.command('getInputDevices', [], 15000);
    return { success: true, defaultId: (r && r.defaultId) || null, devices: (r && r.devices) || [] };
  } catch (e) {
    return { success: false, error: e.message, devices: [] };
  }
});

ipcMain.handle('system:setDefaultInputDevice', async (_, id) => {
  try {
    const r = await audioServer.command('setDefaultInputDevice', [String(id || '')], 15000);
    return { success: !!(r && r.success) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:toggleBluetooth', async () => {
  try {
    return await sysServer.command('bluetoothToggle', [], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:toggleFlightMode', async () => {
  try {
    // 切换需轮询等待全部无线电状态收敛（最长 15 秒），给足超时
    return await sysServer.command('flightToggle', [], 40000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:getFlightStatus', async () => {
  try {
    return await sysServer.command('flightStatus', [], 15000);
  } catch (e) {
    return { success: false, enabled: null, error: e.message };
  }
});

ipcMain.handle('system:getHotspotStatus', async () => {
  try {
    return await sysServer.command('hotspotStatus', [], 15000);
  } catch (e) {
    return { success: false, enabled: null, error: e.message };
  }
});

ipcMain.handle('system:toggleHotspot', async () => {
  try {
    // 切换最长需轮询等待状态收敛（约 1~30 秒），给足超时
    return await sysServer.command('hotspotToggle', [], 40000);
  } catch (e) {
    return { success: false, enabled: null, error: e.message };
  }
});

ipcMain.handle('system:getWifiStatus', async () => {
  try {
    return await sysServer.command('wifiStatus', [], 15000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:setWifiPower', async (_, enabled) => {
  try {
    // wlanapi 无线电状态切换；驱动异步生效（开启可能需约 10~30 秒），
    // sys.ps1 内部轮询等待收敛（最长 35 秒），这里给足超时
    return await sysServer.command('wifiPower', [!!enabled], 60000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:scanWifi', async () => {
  try {
    return await sysServer.command('wifiScan', [], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:connectWifi', async (_, ssid, password, hidden) => {
  try {
    // hidden：连接隐藏 SSID 网络时生成的配置文件带 nonBroadcast 标记
    return await sysServer.command(
      'wifiConnect',
      [String(ssid || ''), String(password || ''), !!hidden],
      20000
    );
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:getWifiKnownNetworks', async () => {
  try {
    return await sysServer.command('wifiKnownNetworks', [], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:disconnectWifi', async () => {
  try {
    return await sysServer.command('wifiDisconnect', [], 15000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:getBluetoothDevices', async () => {
  try {
    return await sysServer.command('btDevices', [], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:getBluetoothStatus', async () => {
  try {
    return await sysServer.command('bluetoothStatus', [], 15000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:connectBluetoothDevice', async (_, address) => {
  try {
    return await sysServer.command('btConnect', [String(address || '')], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:disconnectBluetoothDevice', async (_, address) => {
  try {
    return await sysServer.command('btDisconnect', [String(address || '')], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:discoverBluetoothDevices', async () => {
  try {
    // 蓝牙查询（inquiry）约 4~10 秒，给足超时
    return await sysServer.command('btDiscover', [], 40000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:pairBluetoothDevice', async (_, address, pin) => {
  try {
    // 配对为同步阻塞操作（自动尝试常用码或等待用户配对码），给足超时
    return await sysServer.command('btPair', [String(address || ''), String(pin || '')], 60000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:unpairBluetoothDevice', async (_, address) => {
  try {
    return await sysServer.command('btUnpair', [String(address || '')], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:getBluetoothDeviceInfo', async (_, address) => {
  try {
    return await sysServer.command('btInfo', [String(address || '')], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:forgetWifi', async (_, ssid) => {
  try {
    return await sysServer.command('wifiForget', [String(ssid || '')], 20000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});


