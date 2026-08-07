/**
 * 预加载脚本
 * 通过 contextBridge 安全地暴露主进程 API 给渲染进程
 * 确保渲染进程只能访问指定的功能
 */

const { contextBridge, ipcRenderer } = require('electron');

// 设置变更回调（preload 作用域）
let settingsChangeCallback = null;
let lockscreenInitCallback = null;

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
    setAccentColor: (color, userId) => ipcRenderer.invoke('config:setAccentColor', color, userId),
    /** 保存最后登录的用户ID */
    setLastLoginUserId: (userId) => ipcRenderer.invoke('config:setLastLoginUserId', userId),
    /** 获取最后登录的用户ID */
    getLastLoginUserId: () => ipcRenderer.invoke('config:getLastLoginUserId'),
    /** 获取用户桌面配置 */
    getUserDesktop: (userId) => ipcRenderer.invoke('config:getUserDesktop', userId),
    /** 保存用户桌面配置 */
    saveUserDesktop: (userId, desktopConfig) => ipcRenderer.invoke('config:saveUserDesktop', userId, desktopConfig),
    /** 添加桌面应用 */
    addDesktopApp: (userId, app) => ipcRenderer.invoke('config:addDesktopApp', userId, app),
    /** 更新桌面应用 */
    updateDesktopApp: (userId, appId, updates) => ipcRenderer.invoke('config:updateDesktopApp', userId, appId, updates),
    /** 删除桌面应用 */
    removeDesktopApp: (userId, appId) => ipcRenderer.invoke('config:removeDesktopApp', userId, appId),
    /** 设置桌面背景 */
    setDesktopBackground: (userId, bgPath) => ipcRenderer.invoke('config:setDesktopBackground', userId, bgPath),
    /** 更新桌面应用位置 */
    updateDesktopAppPosition: (userId, appId, x, y) => ipcRenderer.invoke('config:updateDesktopAppPosition', userId, appId, x, y)
  },
  
  // 对话框相关 API
  dialog: {
    /** 打开图片选择对话框 */
    selectImage: () => ipcRenderer.invoke('dialog:selectImage')
  },
  
  // 系统命令执行 API
  system: {
    /** 执行系统命令 */
    exec: (command) => ipcRenderer.invoke('system:exec', command),
    /** 获取系统音量 */
    getVolume: () => ipcRenderer.invoke('system:getVolume'),
    /** 设置系统音量 */
    setVolume: (volume) => ipcRenderer.invoke('system:setVolume', volume),
    /** 切换主音量静音 */
    setMute: (mute) => ipcRenderer.invoke('system:setMute', mute),
    /** 获取屏幕亮度 */
    getBrightness: () => ipcRenderer.invoke('system:getBrightness'),
    /** 设置屏幕亮度 */
    setBrightness: (brightness) => ipcRenderer.invoke('system:setBrightness', brightness),
    /** 获取输出设备列表 */
    getAudioDevices: () => ipcRenderer.invoke('system:getAudioDevices'),
    /** 设置默认输出设备 */
    setDefaultAudioDevice: (id) => ipcRenderer.invoke('system:setDefaultAudioDevice', id),
    /** 获取音频会话（应用音量）列表 */
    getAudioSessions: () => ipcRenderer.invoke('system:getAudioSessions'),
    /** 设置指定应用的音量 */
    setSessionVolume: (pid, volume) => ipcRenderer.invoke('system:setSessionVolume', pid, volume),
    /** 设置指定应用的静音 */
    setSessionMute: (pid, mute) => ipcRenderer.invoke('system:setSessionMute', pid, mute),
    /** 切换网络状态 */
    toggleNetwork: () => ipcRenderer.invoke('system:toggleNetwork'),
    /** 切换蓝牙状态 */
    toggleBluetooth: () => ipcRenderer.invoke('system:toggleBluetooth'),
    /** 切换飞行模式 */
    toggleFlightMode: () => ipcRenderer.invoke('system:toggleFlightMode'),
    /** 切换夜间模式 */
    toggleNightMode: () => ipcRenderer.invoke('system:toggleNightMode'),
    /** 获取 WiFi 连接状态 */
    getWifiStatus: () => ipcRenderer.invoke('system:getWifiStatus'),
    /** 开关 WiFi 适配器 */
    setWifiPower: (enabled) => ipcRenderer.invoke('system:setWifiPower', enabled),
    /** 扫描可用 WiFi */
    scanWifi: () => ipcRenderer.invoke('system:scanWifi'),
    /** 连接 WiFi（无密码传空串） */
    connectWifi: (ssid, password) => ipcRenderer.invoke('system:connectWifi', ssid, password),
    /** 断开当前 WiFi */
    disconnectWifi: () => ipcRenderer.invoke('system:disconnectWifi'),
    /** 获取已配对蓝牙设备 */
    getBluetoothDevices: () => ipcRenderer.invoke('system:getBluetoothDevices'),
    /** 获取蓝牙开关状态 */
    getBluetoothStatus: () => ipcRenderer.invoke('system:getBluetoothStatus'),
    /** 连接蓝牙设备 */
    connectBluetoothDevice: (instanceId) => ipcRenderer.invoke('system:connectBluetoothDevice', instanceId),
    /** 断开蓝牙设备 */
    disconnectBluetoothDevice: (instanceId) => ipcRenderer.invoke('system:disconnectBluetoothDevice', instanceId),
    /** 获取系统能力（PE 兼容性探测） */
    getCapabilities: () => ipcRenderer.invoke('system:getCapabilities')
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
    openDashboard: () => ipcRenderer.invoke('window:openDashboard'),
    /** 获取当前窗口边界 */
    getCurrentWindowBounds: () => ipcRenderer.invoke('window:getBounds'),
    /** 设置窗口位置 */
    setWindowPosition: (x, y) => ipcRenderer.invoke('window:setPosition', x, y),
    /** 注销登录，返回登录界面 */
    logout: () => ipcRenderer.invoke('window:logout')
  },
  
  // 应用启动 API
  app: {
    /** 启动应用程序 */
    launch: (appName) => ipcRenderer.invoke('app:launch', appName),
    /** 获取应用信息 */
    getInfo: (appName) => ipcRenderer.invoke('app:getInfo', appName)
  },
  
  // 应用列表 API
  apps: {
    /** 列出 /usr/share/applications 下所有 .app 应用 */
    listAll: () => ipcRenderer.invoke('apps:listAll')
  },
  
  // 属性窗口 API
  properties: {
    /** 显示应用属性窗口 */
    show: (appData) => ipcRenderer.invoke('properties:show', appData)
  },
  
  // 设置窗口 API
  settings: {
    /** 显示临时设置窗口 */
    show: (settingsData) => ipcRenderer.invoke('settings:show', settingsData),
    /** 注册设置变更回调 */
    onChange: (callback) => { settingsChangeCallback = callback; }
  },
  
  // 屏幕锁定 API
  screen: {
    /** 锁定屏幕 */
    lock: () => ipcRenderer.invoke('screen:lock')
  },
  
  // 锁屏界面 API
  lockscreen: {
    /** 初始化锁屏，获取当前用户信息 */
    init: () => ipcRenderer.invoke('lockscreen:init'),
    /** 注册锁屏初始化回调 */
    onInit: (callback) => { lockscreenInitCallback = callback; },
    /** 解锁屏幕 */
    unlock: () => ipcRenderer.send('lockscreen:unlock')
  },
  
  // 电源管理 API
  power: {
    /** 关机 */
    shutdown: () => ipcRenderer.send('auth:shutdown'),
    /** 重启 */
    restart: () => ipcRenderer.send('auth:restart'),
    /** Shell模式 */
    shell: () => ipcRenderer.send('auth:shell')
  },
  
  // 控制中心 API
  controlCenter: {
    /** 显示控制中心 */
    show: () => ipcRenderer.invoke('control-center:show'),
    /** 隐藏控制中心 */
    hide: () => ipcRenderer.invoke('control-center:hide'),
    /** 调整控制中心窗口尺寸（如进入音量合成器视图） */
    resize: (width, height) => ipcRenderer.invoke('control-center:resize', width, height)
  },
  
  // 包管理器 API
  pkgManager: {
    /** 打开包管理器窗口 */
    show: (options) => ipcRenderer.invoke('pkgmanager:show', options),
    /** 监听主题下发（窗口加载后由主进程推送） */
    onTheme: (callback) => {
      ipcRenderer.on('pkgmanager:theme', (event, data) => callback(data));
    }
  }
});

// 监听设置变更事件
ipcRenderer.on('settings:change', (event, change) => {
  if (settingsChangeCallback) {
    settingsChangeCallback(change);
  }
});
