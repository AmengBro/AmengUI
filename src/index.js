/**
 * Electron 主进程入口
 * 负责创建窗口、处理 IPC 通信和系统功能
 */

const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('node:path');
const fs = require('fs').promises;
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const config = require('./config');

const execAsync = promisify(exec);

/**
 * 使用 Windows API 强制将窗口置底
 * @param {number} hwnd - 窗口句柄
 */
async function forceWindowToBottom(hwnd) {
  if (process.platform !== 'win32') return;
  
  console.log(`=== forceWindowToBottom start ===`);
  console.log(`hwnd (decimal): ${hwnd}`);
  console.log(`hwnd (hex): 0x${hwnd.toString(16)}`);
  
  const scriptPath = path.join(__dirname, '../scripts/setbottom.ps1');
  
  try {
    // 确保脚本目录存在
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    
    // 执行脚本（使用 -ExecutionPolicy Bypass，并传递窗口句柄参数）
    const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -hwnd ${hwnd}`;
    console.log(`Executing command: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    console.log('PowerShell stdout:', stdout);
    if (stderr) console.log('PowerShell stderr:', stderr);
    
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
    skipTaskbar: true,      // 不在任务栏显示
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

// ==================== IPC 处理器 ====================

// 配置相关
ipcMain.handle('config:getUsers', async () => {
  return await config.getUsers();
});

ipcMain.handle('config:getSettings', async (_, userId) => {
  return await config.getSettings(userId);
});

ipcMain.handle('config:verifyUser', async (_, username, password) => {
  return await config.verifyUser(username, password);
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
ipcMain.handle('window:openDashboard', async () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // 应用图标路径
  const iconPath = path.join(__dirname, '../favicon.ico');
  
  const dashboardWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    fullscreen: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: false,
    icon: iconPath,         // 应用图标
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  
  // 加载 dashboard 页面
  dashboardWindow.loadFile(path.join(__dirname, 'dashboard.html'));
  
  // 打开开发者工具（调试用）
  dashboardWindow.webContents.openDevTools();
  
  // 设置 dashboard 窗口置底
  dashboardWindow.webContents.on('did-finish-load', () => {
    console.log('Dashboard loaded, setting to bottom');
    setWindowToBottom(dashboardWindow);
    
    // 定期检查并保持置底状态
    setInterval(() => {
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        setWindowToBottom(dashboardWindow);
      }
    }, 2000);
  });
  
  // 关闭登录窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
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
 * 启动应用程序
 * @param {string} appName - .app 文件名（不含扩展名）
 */
ipcMain.handle('app:launch', async (_, appName) => {
  try {
    // 构建 .app 文件路径（rootdir 在 AmengUI 目录内）
    const appPath = path.join(__dirname, '..', 'rootdir', 'usr', 'share', 'applications', `${appName}.app`);
    console.log('Attempting to launch app:', appPath);
    
    // 读取 .app 文件内容
    const appDataRaw = await fs.readFile(appPath, 'utf-8');
    const appData = JSON.parse(appDataRaw);
    console.log('App config loaded:', appData);
    
    // 检查 exePath 是否存在
    if (!appData.exePath) {
      throw new Error('No exePath specified in app config');
    }
    
    // 启动应用
    console.log('Launching exe:', appData.exePath);
    
    // 使用 spawn 启动应用（不阻塞）
    const child = spawn(appData.exePath, [], {
      detached: true,
      stdio: 'ignore'
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
    // 构建 .app 文件路径（rootdir 在 AmengUI 目录内）
    const appPath = path.join(__dirname, '..', 'rootdir', 'usr', 'share', 'applications', `${appName}.app`);
    console.log('Getting app info:', appPath);
    
    // 读取 .app 文件内容
    const appDataRaw = await fs.readFile(appPath, 'utf-8');
    const appData = JSON.parse(appDataRaw);
    
    return {
      success: true,
      name: appData.name,
      description: appData.description,
      exePath: appData.exePath,
      icon: appData.icon
    };
    
  } catch (error) {
    console.error('Failed to get app info:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

