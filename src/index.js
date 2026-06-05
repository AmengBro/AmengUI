/**
 * Electron 主进程入口
 * 负责创建窗口、处理 IPC 通信和系统功能
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('./config');

// 将 exec 转换为 Promise 形式
const execAsync = promisify(exec);

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
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,           // 无边框窗口
    fullscreen: true,       // 全屏模式
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 加载登录界面
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // 打开开发者工具（调试用）
  mainWindow.webContents.openDevTools();

  // 设置窗口始终置底（在窗口创建后显式调用确保生效）
  mainWindow.setAlwaysOnBottom(true);

  // 监听键盘事件，ESC 键关闭窗口
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && !input.control && !input.alt && !input.meta) {
      mainWindow.close();
    }
  });
};

// Electron 初始化完成后创建窗口
app.whenReady().then(() => {
  createWindow();

  // macOS 特性：点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

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

ipcMain.handle('config:getSettings', async () => {
  return await config.getSettings();
});

ipcMain.handle('config:verifyUser', async (_, username, password) => {
  return await config.verifyUser(username, password);
});

ipcMain.handle('config:addUser', async (_, username, password, avatar) => {
  return await config.addUser(username, password, avatar);
});

ipcMain.handle('config:updateUser', async (_, id, updates) => {
  return await config.updateUser(id, updates);
});

ipcMain.handle('config:deleteUser', async (_, id) => {
  return await config.deleteUser(id);
});

ipcMain.handle('config:setBackground', async (_, imagePath) => {
  return await config.setBackground(imagePath);
});

ipcMain.handle('config:setTheme', async (_, theme) => {
  return await config.setTheme(theme);
});

ipcMain.handle('config:setAccentColor', async (_, color) => {
  return await config.setAccentColor(color);
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

