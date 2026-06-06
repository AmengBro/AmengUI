/**
 * 配置管理模块
 * 负责用户和应用设置的读写操作
 *
 * 目录结构：
 * /config/
 *   users.json          # 全局用户列表
 *   {userid}/
 *     config.json        # 用户个性化设置和登录信息
 */

const fs = require('fs').promises;
const path = require('path');

// 配置文件目录路径
const CONFIG_DIR = path.join(__dirname, '../config');
// 用户配置文件路径
const USERS_FILE = path.join(CONFIG_DIR, 'users.json');

// 默认用户列表
const defaultUsers = [
  {
    userid: 1,
    username: '管理员',
    photo: null,
    permi: 'root'
  },
];

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
 * 确保用户目录存在
 * @param {number} userId - 用户ID
 */
async function ensureUserDir(userId) {
  const userDir = path.join(CONFIG_DIR, String(userId));
  try {
    await fs.access(userDir);
  } catch {
    await fs.mkdir(userDir, { recursive: true });
  }
  return userDir;
}

/**
 * 获取用户配置目录路径
 * @param {number} userId - 用户ID
 */
function getUserConfigPath(userId) {
  return path.join(CONFIG_DIR, String(userId), 'config.json');
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
  const dir = path.dirname(filePath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 获取所有用户
 * @returns {Promise<Array>} 用户列表
 */
async function getUsers() {
  const data = await loadJSON(USERS_FILE, { users: defaultUsers });
  return data.users || defaultUsers;
}

/**
 * 保存用户列表
 * @param {Array} users - 用户列表
 */
async function saveUsers(users) {
  await saveJSON(USERS_FILE, { users });
}

/**
 * 获取用户配置（包含login和profile）
 * @param {number} userId - 用户ID
 * @returns {Promise<Object>} 用户配置
 */
async function getUserConfig(userId) {
  const userConfigPath = getUserConfigPath(userId);
  const defaultUserConfig = {
    login: {
      userid: userId,
      username: '',
      password: '',
      photo: null,
      permi: 'user'
    },
    profile: {
      loginbg: null,
      themebd: 'dark',
      themecolor: '#0078D4'
    }
  };
  
  const config = await loadJSON(userConfigPath, defaultUserConfig);
  
  // 确保login中的userid正确
  if (config.login && config.login.userid !== userId) {
    config.login.userid = userId;
    await saveUserConfig(userId, config);
  }
  
  return config;
}

/**
 * 保存用户配置
 * @param {number} userId - 用户ID
 * @param {Object} config - 用户配置
 */
async function saveUserConfig(userId, config) {
  const userConfigPath = getUserConfigPath(userId);
  await saveJSON(userConfigPath, config);
}

/**
 * 获取应用设置（兼容旧接口）
 * @param {number} userId - 可选，用户ID
 * @returns {Promise<Object>} 应用设置
 */
async function getSettings(userId = null) {
  if (userId) {
    const userConfig = await getUserConfig(userId);
    return {
      background: userConfig.profile.loginbg,
      theme: userConfig.profile.themebd,
      accentColor: userConfig.profile.themecolor
    };
  }
  
  return {
    background: null,
    theme: 'dark',
    accentColor: '#0078D4'
  };
}

/**
 * 添加新用户
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @param {string} photo - 头像路径（可选）
 * @returns {Promise<Object>} 新创建的用户
 */
async function addUser(username, password = '', photo = null) {
  const users = await getUsers();
  const newUser = {
    userid: Date.now(),
    username,
    photo,
    permi: 'user'
  };
  users.push(newUser);
  await saveUsers(users);
  
  // 为新用户创建配置目录和配置文件
  await ensureUserDir(newUser.userid);
  const userConfig = await getUserConfig(newUser.userid);
  userConfig.login.username = username;
  userConfig.login.password = password;
  userConfig.login.photo = photo;
  await saveUserConfig(newUser.userid, userConfig);
  
  return newUser;
}

/**
 * 更新用户信息
 * @param {number} userId - 用户ID
 * @param {Object} updates - 要更新的字段
 * @returns {Promise<Object|null>} 更新后的用户或null
 */
async function updateUser(userId, updates) {
  const users = await getUsers();
  const index = users.findIndex(u => u.userid === userId);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    await saveUsers(users);
    
    // 同步更新用户配置中的信息
    const userConfig = await getUserConfig(userId);
    if (updates.username !== undefined) {
      userConfig.login.username = updates.username;
    }
    if (updates.password !== undefined) {
      userConfig.login.password = updates.password;
    }
    if (updates.photo !== undefined) {
      userConfig.login.photo = updates.photo;
    }
    if (updates.permi !== undefined) {
      userConfig.login.permi = updates.permi;
    }
    await saveUserConfig(userId, userConfig);
    
    return users[index];
  }
  return null;
}

/**
 * 删除用户
 * @param {number} userId - 用户ID
 */
async function deleteUser(userId) {
  const users = await getUsers();
  const filtered = users.filter(u => u.userid !== userId);
  await saveUsers(filtered);
  
  // 删除用户配置目录
  const userDir = path.join(CONFIG_DIR, String(userId));
  try {
    await fs.rm(userDir, { recursive: true, force: true });
  } catch {
    // 忽略删除错误
  }
}

/**
 * 验证用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<Object|null>} 验证成功返回用户对象，失败返回null
 */
async function verifyUser(username, password) {
  const users = await getUsers();
  const user = users.find(u => u.username === username);
  if (user) {
    // 从用户配置中获取密码进行验证
    const userConfig = await getUserConfig(user.userid);
    if (userConfig.login.password === password) {
      return user;
    }
  }
  return null;
}

/**
 * 设置背景图片
 * @param {string} imagePath - 图片路径
 * @param {number} userId - 用户ID
 */
async function setBackground(imagePath, userId) {
  const userConfig = await getUserConfig(userId);
  userConfig.profile.loginbg = imagePath;
  await saveUserConfig(userId, userConfig);
}

/**
 * 设置主题模式
 * @param {string} theme - 主题模式：'dark' 或 'bright'
 * @param {number} userId - 用户ID
 */
async function setTheme(theme, userId) {
  if (theme === 'dark' || theme === 'bright') {
    const userConfig = await getUserConfig(userId);
    userConfig.profile.themebd = theme;
    await saveUserConfig(userId, userConfig);
  }
}

/**
 * 设置主题色
 * @param {string} color - 十六进制颜色值
 * @param {number} userId - 用户ID
 */
async function setAccentColor(color, userId) {
  const userConfig = await getUserConfig(userId);
  userConfig.profile.themecolor = color;
  await saveUserConfig(userId, userConfig);
}

/**
 * 设置用户权限
 * @param {number} userId - 用户ID
 * @param {string} permi - 权限级别：root/sudo/user/guest
 */
async function setPermission(userId, permi) {
  const validPermissions = ['root', 'sudo', 'user', 'guest'];
  if (validPermissions.includes(permi)) {
    const users = await getUsers();
    const user = users.find(u => u.userid === userId);
    if (user) {
      user.permi = permi;
      await saveUsers(users);
      
      const userConfig = await getUserConfig(userId);
      userConfig.login.permi = permi;
      await saveUserConfig(userId, userConfig);
    }
  }
}

// 导出模块接口
module.exports = {
  getUsers,
  saveUsers,
  getSettings,
  getUserConfig,
  saveUserConfig,
  addUser,
  updateUser,
  deleteUser,
  verifyUser,
  setBackground,
  setTheme,
  setAccentColor,
  setPermission,
  ensureUserDir
};
