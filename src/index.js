/**
 * Electron 主进程入口
 * 负责创建窗口、处理 IPC 通信和系统功能
 */

const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('node:path');
const os = require('os');
const fs = require('fs').promises;
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const config = require('./config');
const { getPathConverter } = require('./amsys/converter');

const PWSH_PATH = config.PWSH_PATH;

const execAsync = promisify(exec);
const IPC_TIMEOUT = 15000;

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
  
  console.log(`=== forceWindowToBottom start ===`);
  console.log(`hwnd (decimal): ${hwnd}`);
  console.log(`hwnd (hex): 0x${hwnd.toString(16)}`);
  
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
$SWP_SHOWWINDOW = 0x0040

$result = [User32]::SetWindowPos($hwndPtr, $HWND_BOTTOM, 0, 0, 0, 0, $SWP_NOSIZE -bor $SWP_NOMOVE -bor $SWP_NOACTIVATE -bor $SWP_SHOWWINDOW)

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
    console.log('Created temp script:', scriptPath);
    
    let powershellExe = 'powershell';
    try {
      await fs.access(PWSH_PATH);
      powershellExe = `"${PWSH_PATH}"`;
      console.log('Using built-in PowerShell 7:', PWSH_PATH);
    } catch {
      console.log('Built-in PowerShell 7 not found, using system powershell');
    }
    
    const command = `${powershellExe} -ExecutionPolicy Bypass -File "${scriptPath}" -hwnd ${hwnd}`;
    console.log(`Executing command: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    console.log('PowerShell stdout:', stdout);
    if (stderr) console.log('PowerShell stderr:', stderr);
    
    await fs.unlink(scriptPath);
    console.log('Cleaned up temp script');
    
    console.log(`=== forceWindowToBottom end (success) ===`);
    
  } catch (error) {
    console.error(`=== forceWindowToBottom end (failed) ===`);
    console.error('PowerShell execution failed:', error.message);
    console.error('Error code:', error.code);
    if (error.stdout) console.error('Partial stdout:', error.stdout);
    if (error.stderr) console.error('Partial stderr:', error.stderr);
  }
}

/**
 * 使用命令行工具 nircmd 设置窗口置底（备选方案）
 */
async function forceWindowToBottomWithNircmd(hwnd) {
  if (process.platform !== 'win32') return;
  
  console.log(`=== forceWindowToBottomWithNircmd start ===`);
  console.log(`hwnd: ${hwnd}`);
  
  try {
    // 尝试使用 nircmd（如果可用）
    const nircmdPath = 'nircmd.exe';
    const command = `"${nircmdPath}" win settopmost handle ${hwnd} 0`;
    console.log(`Trying nircmd: ${command}`);
    
    try {
      const { stdout, stderr } = await execAsync(command);
      console.log('nircmd stdout:', stdout);
      if (stderr) console.log('nircmd stderr:', stderr);
    } catch (e) {
      console.log('nircmd not available, skipping');
    }
    
    console.log(`=== forceWindowToBottomWithNircmd end ===`);
    
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
let controlCenterWindow = null;
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
  
  try {
    console.log(`=== setWindowToBottom ===`);
    
    // 方法1: 通过 PowerShell 调用 Windows API
    const hwnd = window.getNativeWindowHandle();
    console.log(`hwnd buffer length: ${hwnd.length}`);
    console.log(`hwnd buffer:`, hwnd);
    
    // 正确获取窗口句柄（兼容 32 位和 64 位系统）
    let hwndNumber;
    if (hwnd.length === 8) {
      // 64 位系统：从 Buffer 读取 64 位整数
      hwndNumber = hwnd.readUInt32LE(0); // 低 32 位就是窗口句柄
      console.log(`Window handle (64-bit): ${hwndNumber} (0x${hwndNumber.toString(16)})`);
    } else {
      // 32 位系统
      hwndNumber = hwnd.readUInt32LE(0);
      console.log(`Window handle (32-bit): ${hwndNumber} (0x${hwndNumber.toString(16)})`);
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
    console.log(`Window handle: 0x${hwndNumber.toString(16)}`);
    
    // 使用 Windows API 强制置底
    forceWindowToBottom(hwndNumber);
  }, 500);
}

// Electron 初始化完成后创建窗口
app.whenReady().then(async () => {
  // 初始化配置：迁移旧数据并确保用户目录存在
  await initConfig();
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
 * 初始化配置：迁移旧数据并确保用户目录存在
 */
async function initConfig() {
  try {
    const users = await config.getUsers();
    
    // 为所有现有用户创建配置目录
    for (const user of users) {
      await config.ensureUserDir(user.userid);
    }
    
    // 迁移旧的 settings.json 到第一个用户的配置（如果存在旧数据且用户目录没有配置）
    const oldSettingsPath = path.join(__dirname, '../config/settings.json');
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
  if (userId) {
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
        setWindowToBottom(dashboardWindow);
      }
    }, 2000);
  });
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

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

// 设置窗口
ipcMain.handle('settings:show', async (event, settingsData) => {
  console.log('[Settings IPC] settings:show received, settingsData:', JSON.stringify(settingsData));
  
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const iconPath = path.join(__dirname, '../favicon.ico');
  
  const settingsWindow = new BrowserWindow({
    width: 360,
    height: 520,
    x: Math.floor((width - 360) / 2),
    y: Math.floor((height - 520) / 2),
    frame: false,
    fullscreen: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  
  const theme = settingsData.theme || 'dark';
  const accentColor = settingsData.accentColor || '#0078D4';
  const isTaskbarFloating = settingsData.isTaskbarFloating !== undefined ? settingsData.isTaskbarFloating : true;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>临时设置</title>
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
        .section {
          margin-bottom: 20px;
        }
        .section-title {
          font-size: 12px;
          font-weight: 600;
          color: ${theme === 'dark' ? '#999' : '#666'};
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
        }
        .setting-label {
          font-size: 13px;
        }
        .toggle-switch {
          width: 44px;
          height: 24px;
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          transition: background 0.2s;
        }
        .toggle-switch.active {
          background: ${accentColor};
        }
        .toggle-switch::after {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          background: #fff;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: left 0.2s;
        }
        .toggle-switch.active::after {
          left: 22px;
        }
        .color-picker-wrapper {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        #accent-color-input {
          width: 40px;
          height: 32px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          background: transparent;
          padding: 2px;
        }
        #accent-color-input::-webkit-color-swatch-wrapper {
          padding: 0;
        }
        #accent-color-input::-webkit-color-swatch {
          border-radius: 6px;
          border: 2px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
        }
        .color-preview {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          border: 1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
        }
        .theme-options {
          display: flex;
          gap: 8px;
        }
        .theme-btn {
          flex: 1;
          padding: 10px;
          border: 2px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
          border-radius: 8px;
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
          color: ${theme === 'dark' ? '#fff' : '#333'};
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }
        .theme-btn:hover {
          border-color: ${accentColor};
        }
        .theme-btn.active {
          border-color: ${accentColor};
          background: ${accentColor}20;
        }
        .taskbar-options {
          display: flex;
          gap: 8px;
        }
        .taskbar-btn {
          flex: 1;
          padding: 10px;
          border: 2px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
          border-radius: 8px;
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
          color: ${theme === 'dark' ? '#fff' : '#333'};
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }
        .taskbar-btn:hover {
          border-color: ${accentColor};
        }
        .taskbar-btn.active {
          border-color: ${accentColor};
          background: ${accentColor}20;
        }
        .bg-preview {
          width: 100%;
          height: 100px;
          border-radius: 8px;
          border: 2px dashed ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          position: relative;
          overflow: hidden;
        }
        .bg-preview::before {
          content: '无背景';
          color: ${theme === 'dark' ? '#666' : '#999'};
          font-size: 13px;
        }
        .bg-preview.has-bg::before {
          display: none;
        }
        .bg-actions {
          display: flex;
          gap: 8px;
        }
        .bg-btn {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
          border-radius: 6px;
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
          color: ${theme === 'dark' ? '#fff' : '#333'};
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }
        .bg-btn:hover {
          background: ${accentColor}20;
          border-color: ${accentColor};
        }
        #bg-file-input {
          display: none;
        }
      </style>
    </head>
    <body>
      <div class="title-bar">
        <span class="title-text">临时设置</span>
        <button class="close-btn" onclick="window.close()">&times;</button>
      </div>
      <div class="content">
        <div class="section">
          <div class="section-title">主题</div>
          <div class="theme-options">
            <button class="theme-btn ${theme === 'dark' ? 'active' : ''}" onclick="changeTheme('dark')">暗色</button>
            <button class="theme-btn ${theme === 'bright' ? 'active' : ''}" onclick="changeTheme('bright')">亮色</button>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">主题色</div>
          <div class="setting-item">
            <span class="setting-label">颜色选择</span>
            <div class="color-picker-wrapper">
              <div class="color-preview" style="background: ${accentColor}"></div>
              <input type="color" id="accent-color-input" value="${accentColor}" onchange="changeAccentColor(this.value)">
            </div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">任务栏</div>
          <div class="taskbar-options">
            <button class="taskbar-btn ${isTaskbarFloating ? 'active' : ''}" onclick="changeTaskbarMode(true)">浮动</button>
            <button class="taskbar-btn ${!isTaskbarFloating ? 'active' : ''}" onclick="changeTaskbarMode(false)">停靠</button>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">桌面背景</div>
          <div class="bg-preview ${settingsData.desktopBackground ? 'has-bg' : ''}" id="bg-preview" ${settingsData.desktopBackground ? `style="background-image: url('${settingsData.desktopBackground}')"` : ''}></div>
          <div class="bg-actions">
            <button class="bg-btn" onclick="document.getElementById('bg-file-input').click()">选择图片</button>
            <button class="bg-btn" onclick="clearBackground()">清除背景</button>
          </div>
          <input type="file" id="bg-file-input" accept="image/*" onchange="selectBackground(event)">
        </div>
      </div>
      
      <script>
        const { ipcRenderer } = require('electron');
        
        function changeTheme(newTheme) {
          ipcRenderer.send('settings:change', { type: 'theme', value: newTheme });
        }
        
        function changeAccentColor(newColor) {
          ipcRenderer.send('settings:change', { type: 'accentColor', value: newColor });
          document.querySelector('.color-preview').style.background = newColor;
        }
        
        function changeTaskbarMode(isFloating) {
          ipcRenderer.send('settings:change', { type: 'taskbarMode', value: isFloating });
        }
        
        function selectBackground(event) {
          const file = event.target.files[0];
          if (file) {
            const bgUrl = 'file:///' + file.path.replaceAll('\\', '/');
            const preview = document.getElementById('bg-preview');
            preview.style.backgroundImage = 'url("' + bgUrl + '")';
            preview.classList.add('has-bg');
            ipcRenderer.send('settings:change', { type: 'desktopBackground', value: bgUrl });
          }
        }
        
        function clearBackground() {
          const preview = document.getElementById('bg-preview');
          preview.style.backgroundImage = '';
          preview.classList.remove('has-bg');
          ipcRenderer.send('settings:change', { type: 'desktopBackground', value: null });
        }
        
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') window.close();
        });
      </script>
    </body>
    </html>
  `;
  
  settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  
  settingsWindow.on('closed', () => {
    console.log('[Settings] Settings window closed');
  });
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
    alwaysOnTop: true,
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
 * 启动应用程序
 * @param {string} appName - .app 文件名（不含扩展名）
 */
ipcMain.handle('app:launch', async (_, appName) => {
  try {
    let appPath;
    
    try {
      const converter = await getPathConverter(APP_ROOT);
      const result = await converter.toWindows('/usr/share/applications');
      if (result.success && result.winPath) {
        appPath = path.join(result.winPath, `${appName}.app`);
        console.log('App path via converter:', appPath);
      } else {
        throw new Error('path conversion failed');
      }
    } catch (converterError) {
      console.warn('Failed to get app path via converter, using fallback:', converterError.message);
      appPath = path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications', `${appName}.app`);
    }
    
    console.log('Attempting to launch app:', appPath);
    
    const appDataRaw = await fs.readFile(appPath, 'utf-8');
    const appData = await convertAppDataPaths(JSON.parse(appDataRaw));
    console.log('App config loaded:', appData);
    
    if (!appData.exePath) {
      throw new Error('No exePath specified in app config');
    }
    
    console.log('Launching exe:', appData.exePath);
    
    const isTerminal = appData.exePath.toLowerCase().endsWith('cmd.exe') || 
                       appData.exePath.toLowerCase().endsWith('powershell.exe') ||
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
ipcMain.handle('app:getInfo', async (_, appName) => {
  try {
    let appPath;
    
    try {
      const converter = await getPathConverter(APP_ROOT);
      const result = await converter.toWindows('/usr/share/applications');
      if (result.success && result.winPath) {
        appPath = path.join(result.winPath, `${appName}.app`);
        console.log('App path via converter:', appPath);
      } else {
        throw new Error('path conversion failed');
      }
    } catch (converterError) {
      console.warn('Failed to get app path via converter, using fallback:', converterError.message);
      appPath = path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications', `${appName}.app`);
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
    
    let iconPath = appData.icon;
    
    if (iconPath) {
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
    }
    
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

// 列出 /usr/share/applications 下所有 .app 文件（开始菜单的完整应用来源）
ipcMain.handle('apps:listAll', async () => {
  try {
    let appsDir;
    try {
      const converter = await getPathConverter(APP_ROOT);
      const result = await converter.toWindows('/usr/share/applications');
      if (result.success && result.winPath) {
        appsDir = result.winPath;
      } else {
        throw new Error('path conversion failed');
      }
    } catch (converterError) {
      appsDir = path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications');
    }

    const entries = await fs.readdir(appsDir);
    const apps = [];
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.app')) continue;
      const appName = entry.replace(/\.app$/i, '');
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

let lockWindow = null;
let currentLoggedInUser = null;

ipcMain.handle('screen:lock', async () => {
  if (lockWindow) {
    return;
  }
  
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
    
    return {
      userId: currentLoggedInUser.userid,
      username: currentLoggedInUser.username,
      avatar: currentLoggedInUser.photo || null,
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
  const amsysPath = path.join(APP_ROOT, 'src', 'amsys', 'amsys.exe');
  const scriptPath = path.join(os.tmpdir(), `amengui_shell_${Date.now()}.ps1`);
  const scriptContent = [
    '$proc = Start-Process -FilePath $args[0] -WorkingDirectory $args[1] -PassThru',
    'Write-Output ("PID=" + $proc.Id)',
    '$proc.WaitForExit()',
    'Write-Output ("EXITCODE=" + $proc.ExitCode)'
  ].join('\r\n');
  
  fs.writeFile(scriptPath, scriptContent, 'utf-8')
    .then(async () => {
      const pwsh = await getPwshPath();
      const launcher = spawn(pwsh, [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        amsysPath,
        APP_ROOT
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
    controlCenterWindow.show();
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
  
  controlCenterWindow.on('closed', () => {
    controlCenterWindow = null;
  });
  
  controlCenterWindow.on('blur', () => {
    controlCenterWindow.hide();
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

async function getPwshPath() {
  try {
    await fs.access(PWSH_PATH);
    return PWSH_PATH;
  } catch {
    return 'powershell';
  }
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
    network: !(sysRes && sysRes.network === false),
    bluetooth: !(sysRes && sysRes.bluetooth === false),
    brightness: !(sysRes && sysRes.brightness === false),
    flightMode: !(sysRes && sysRes.flightMode === false),
    nightMode: !(sysRes && sysRes.nightMode === false),
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

ipcMain.handle('system:toggleNetwork', async () => {
  try {
    return await sysServer.command('networkToggle', [], 20000);
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
    return await sysServer.command('flightToggle', [], 15000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:toggleNightMode', async () => {
  try {
    return await sysServer.command('nightToggle', [], 15000);
  } catch (e) {
    return { success: false, error: e.message };
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
    return await sysServer.command('wifiPower', [!!enabled], 15000);
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

ipcMain.handle('system:connectWifi', async (_, ssid, password) => {
  try {
    return await sysServer.command('wifiConnect', [String(ssid || ''), String(password || '')], 20000);
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

ipcMain.handle('system:connectBluetoothDevice', async (_, instanceId) => {
  try {
    return await sysServer.command('btConnect', [String(instanceId || '')], 15000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:disconnectBluetoothDevice', async (_, instanceId) => {
  try {
    return await sysServer.command('btDisconnect', [String(instanceId || '')], 15000);
  } catch (e) {
    return { success: false, error: e.message };
  }
});

