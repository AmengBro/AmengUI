/**
 * 配置管理模块
 * 负责用户和应用设置的读写操作
 * 所有配置文件保存在程序目录下的 config 文件夹中
 */

const fs = require('fs').promises;
const path = require('path');

// 配置文件目录路径
const CONFIG_DIR = path.join(__dirname, '../config');
// 用户配置文件路径
const USERS_FILE = path.join(CONFIG_DIR, 'users.json');
// 应用设置文件路径
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

// 默认用户列表
const defaultUsers = [
  { id: 1, username: 'Admin', password: '', avatar: null }
];

// 默认应用设置
const defaultSettings = {
  background: null,           // 自定义背景图片路径
  theme: 'dark',             // 主题模式：'dark' 深色模式，'light' 亮色模式
  accentColor: '#0078D4'      // 主题色（Windows 11 风格，默认蓝色）
};

/**
 * 确保配置目录存在
 */
async function ensureConfigDir() {
  try {
    await fs.access(CONFIG_DIR);
  } catch {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 加载 JSON 配置文件
 * @param {string} filePath - 配置文件路径
 * @param {Object} defaultData - 默认数据
 * @returns {Promise<Object>} 配置数据
 */
async function loadJSON(filePath, defaultData) {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    // 文件不存在或解析失败，使用默认数据并保存
    await saveJSON(filePath, defaultData);
    return defaultData;
  }
}

/**
 * 保存 JSON 配置文件
 * @param {string} filePath - 配置文件路径
 * @param {Object} data - 要保存的数据
 */
async function saveJSON(filePath, data) {
  await ensureConfigDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 获取所有用户
 * @returns {Promise<Array>} 用户列表
 */
async function getUsers() {
  return await loadJSON(USERS_FILE, defaultUsers);
}

/**
 * 保存用户列表
 * @param {Array} users - 用户列表
 */
async function saveUsers(users) {
  await saveJSON(USERS_FILE, users);
}

/**
 * 获取应用设置
 * @returns {Promise<Object>} 应用设置
 */
async function getSettings() {
  return await loadJSON(SETTINGS_FILE, defaultSettings);
}

/**
 * 保存应用设置
 * @param {Object} settings - 应用设置
 */
async function saveSettings(settings) {
  await saveJSON(SETTINGS_FILE, settings);
}

/**
 * 添加新用户
 * @param {string} username - 用户名
 * @param {string} password - 密码（可选）
 * @param {string} avatar - 头像路径（可选）
 * @returns {Promise<Object>} 新创建的用户
 */
async function addUser(username, password = '', avatar = null) {
  const users = await getUsers();
  const newUser = {
    id: Date.now(),
    username,
    password,
    avatar
  };
  users.push(newUser);
  await saveUsers(users);
  return newUser;
}

/**
 * 更新用户信息
 * @param {number} id - 用户ID
 * @param {Object} updates - 要更新的字段
 * @returns {Promise<Object|null>} 更新后的用户或null
 */
async function updateUser(id, updates) {
  const users = await getUsers();
  const index = users.findIndex(u => u.id === id);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    await saveUsers(users);
    return users[index];
  }
  return null;
}

/**
 * 删除用户
 * @param {number} id - 用户ID
 */
async function deleteUser(id) {
  const users = await getUsers();
  const filtered = users.filter(u => u.id !== id);
  await saveUsers(filtered);
}

/**
 * 验证用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<Object|null>} 验证成功返回用户对象，失败返回null
 */
async function verifyUser(username, password) {
  const users = await getUsers();
  return users.find(u => u.username === username && u.password === password);
}

/**
 * 设置背景图片
 * @param {string} imagePath - 图片路径
 */
async function setBackground(imagePath) {
  const settings = await getSettings();
  settings.background = imagePath;
  await saveSettings(settings);
}

/**
 * 设置主题模式
 * @param {string} theme - 主题模式：'dark' 或 'light'
 */
async function setTheme(theme) {
  const settings = await getSettings();
  if (theme === 'dark' || theme === 'light') {
    settings.theme = theme;
    await saveSettings(settings);
  }
}

/**
 * 设置主题色
 * @param {string} color - 十六进制颜色值，如 '#0078D4'
 */
async function setAccentColor(color) {
  const settings = await getSettings();
  settings.accentColor = color;
  await saveSettings(settings);
}

// 导出模块接口
module.exports = {
  getUsers,
  saveUsers,
  getSettings,
  saveSettings,
  addUser,
  updateUser,
  deleteUser,
  verifyUser,
  setBackground,
  setTheme,
  setAccentColor
};
