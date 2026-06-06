/**
 * 预加载脚本
 * 通过 contextBridge 安全地暴露主进程 API 给渲染进程
 * 确保渲染进程只能访问指定的功能
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 接口给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置管理相关 API
  config: {
    /** 获取所有用户 */
    getUsers: () => ipcRenderer.invoke('config:getUsers'),
    /** 获取应用设置 */
    getSettings: (userId) => ipcRenderer.invoke('config:getSettings', userId),
    /** 验证用户登录 */
    verifyUser: (username, password) => ipcRenderer.invoke('config:verifyUser', username, password),
    /** 添加新用户 */
    addUser: (username, password, photo) => ipcRenderer.invoke('config:addUser', username, password, photo),
    /** 更新用户信息 */
    updateUser: (userid, updates) => ipcRenderer.invoke('config:updateUser', userid, updates),
    /** 删除用户 */
    deleteUser: (userid) => ipcRenderer.invoke('config:deleteUser', userid),
    /** 设置背景图片 */
    setBackground: (imagePath, userId) => ipcRenderer.invoke('config:setBackground', imagePath, userId),
    /** 设置主题模式 */
    setTheme: (theme, userId) => ipcRenderer.invoke('config:setTheme', theme, userId),
    /** 设置主题色 */
    setAccentColor: (color, userId) => ipcRenderer.invoke('config:setAccentColor', color, userId)
  },
  
  // 对话框相关 API
  dialog: {
    /** 打开图片选择对话框 */
    selectImage: () => ipcRenderer.invoke('dialog:selectImage')
  },
  
  // 系统命令执行 API
  system: {
    /** 执行系统命令 */
    exec: (command) => ipcRenderer.invoke('system:exec', command)
  },
  
  // 文件系统操作 API
  fs: {
    /** 读取文件内容 */
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    /** 写入文件 */
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    /** 读取目录内容 */
    readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath)
  },
  
  // 窗口操作 API
  window: {
    /** 打开欢迎页面 */
    openDashboard: () => ipcRenderer.invoke('window:openDashboard')
  }
});

