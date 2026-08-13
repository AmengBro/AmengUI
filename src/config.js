/**
 * 配置管理模块
 * 负责用户和应用设置的读写操作
 *
 * 目录结构（存储于 amsys 虚拟根 /etc/system/core，由 config.ini [system] root 决定）：
 * {amsys_root}/etc/system/core/
 *   users.json          # 全局用户列表
 *   system.json         # 系统状态（最后登录用户等）
 *   {userid}/
 *     config.json        # 用户个性化设置和登录信息
 *     desktop.json       # 用户桌面配置
 *
 * 用户身份数据源：/etc/passwd 与 /etc/shadow 为唯一权威（userid=UID、
 * username=nick、permi=permission、password=shadow md5hash），
 * users.json 与各 config.json 的 login 块均为其聚合视图/回填结果；
 * 用户增删改直接写 passwd/shadow，不再反向覆盖。
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function getAppRoot() {
  const isPackaged = require('electron').app?.isPackaged || false;
  
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
 * 解析 amsys 虚拟根目录：读取 {APP_ROOT}/config.ini 的 [system] root
 * （相对路径相对 APP_ROOT 解析，与 amsys 路径转换器逻辑一致），
 * 未配置或读取失败时回退到项目内 rootdir。
 * @returns {string} amsys 虚拟根 Windows 路径
 */
function getAmsysRoot() {
  try {
    const content = require('fs').readFileSync(path.join(APP_ROOT, 'config.ini'), 'utf-8');
    let inSystem = false;
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[system]')) {
        inSystem = true;
        continue;
      }
      if (inSystem && trimmed.startsWith('[')) break;
      if (inSystem) {
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          const key = trimmed.substring(0, eq).trim();
          const value = trimmed.substring(eq + 1).trim();
          if (key === 'root' && value) {
            return path.resolve(APP_ROOT, value);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to read config.ini, fallback to rootdir:', e.message);
  }
  return path.join(APP_ROOT, 'rootdir');
}

const AMSYS_ROOT = getAmsysRoot();

// 配置目录：amsys 虚拟根的 /etc/system/core
const CONFIG_DIR = path.join(AMSYS_ROOT, 'etc', 'system', 'core');
const USERS_FILE = path.join(CONFIG_DIR, 'users.json');
const SYSTEM_FILE = path.join(CONFIG_DIR, 'system.json');

// 旧版配置目录（迁移用）
const LEGACY_CONFIG_DIR = path.join(APP_ROOT, 'config');

const PWSH_PATH = path.join(APP_ROOT, 'PowerShell', '7', 'pwsh.exe');

// 无盐 MD5 密文：32 位十六进制（用于识别密文与旧版明文存储，以及迁移）
const MD5_RE = /^[0-9a-f]{32}$/;

/**
 * 密码加密：无盐 MD5，返回 32 位十六进制
 * 空密码保持空字符串不加密（保证 hasPassword 判断与空密码登录逻辑正常）
 * @param {string} password - 明文密码
 * @returns {string} 密文或空字符串
 */
function encryptPassword(password) {
  if (!password) return '';
  return crypto.createHash('md5').update(password).digest('hex');
}

/**
 * 规范化密码存储值：空串原样保留，明文加密为无盐 MD5
 * @param {string} password - 明文密码
 * @returns {string} 规范化的存储值
 */
function normalizePassword(password) {
  if (!password) return '';
  return encryptPassword(password);
}

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

// ==================== amsys 认证文件权威数据源（/etc/passwd 与 /etc/shadow） ====================
//
// 数据方向：passwd/shadow 为唯一权威，AmengUI 从中读取用户的
// userid(UID) / username(nick) / permi(permission) / password(shadow md5hash)，
// 并重建 users.json 聚合视图与各 config/{userid}/config.json 的 login 块。
// 用户增删改（addUser/updateUser/deleteUser/setPermission）直接写 passwd/shadow。

const PASSWD_FILE = path.join(AMSYS_ROOT, 'etc', 'passwd');
const SHADOW_FILE = path.join(AMSYS_ROOT, 'etc', 'shadow');

// 合法权限（passwd 第 2 位，root/sudo/user 三种）
const VALID_PERMISSIONS = ['root', 'sudo', 'user'];

/**
 * 读取 /etc/passwd 与 /etc/shadow，解析为按 UID 排序的用户记录数组。
 *
 * passwd（7 字段）：username:permission:UID:GID:nick:home:shell
 * shadow（8 字段）：username:md5hash:min:max:warn:inactive:expire:reserved
 *
 * 每条记录：{ userid(UID), loginName(字段1), username(nick, 字段5),
 *             permi(字段2), password(shadow 第2位), gid, home, shell }
 */
async function readPasswdShadow() {
  let passwdText = '';
  let shadowText = '';
  try { passwdText = await fs.readFile(PASSWD_FILE, 'utf8'); } catch {}
  try { shadowText = await fs.readFile(SHADOW_FILE, 'utf8'); } catch {}

  const hashByLogin = {};
  for (const line of shadowText.split(/\r?\n/)) {
    const parts = line.split(':');
    if (parts.length >= 2 && parts[0]) hashByLogin[parts[0]] = parts[1];
  }

  const users = [];
  for (const line of passwdText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = line.split(':');
    if (parts.length < 7 || !parts[0] || !/^\d+$/.test(parts[2])) continue;
    const [loginName, permission, uidStr, gidStr, nick, home, shell] = parts;
    const uid = Number(uidStr);
    users.push({
      userid: uid,
      loginName,
      username: nick || loginName,
      permi: VALID_PERMISSIONS.includes(permission) ? permission : 'user',
      password: hashByLogin[loginName] !== undefined ? hashByLogin[loginName] : '',
      gid: gidStr,
      home,
      shell
    });
  }
  users.sort((a, b) => a.userid - b.userid);
  return users;
}

/**
 * 读取 passwd/shadow 原始行（保留未管理的用户与注释），供写入层使用
 */
async function readAuthRawLines() {
  const lines = { passwd: [], shadow: [] };
  try { lines.passwd = (await fs.readFile(PASSWD_FILE, 'utf8')).split(/\r?\n/); } catch {}
  try { lines.shadow = (await fs.readFile(SHADOW_FILE, 'utf8')).split(/\r?\n/); } catch {}
  return lines;
}

/**
 * 序列化行数组回写文件（统一 \n 分隔、保证末尾换行）
 */
function serializeAuthLines(lines) {
  const arr = lines.slice();
  if (arr.length && arr[arr.length - 1] === '') arr.pop();
  return arr.join('\n') + (arr.length ? '\n' : '');
}

/**
 * 确保 /etc/passwd 与 /etc/shadow 存在（全新环境初始化 root）
 * root：UID/GID 0、home /root、权限 root、密码 root（无盐 MD5）
 * @returns {Promise<boolean>} 是否执行了初始化
 */
async function ensurePasswdShadowBootstrap() {
  let passwdExists = false;
  let shadowExists = false;
  try { await fs.access(PASSWD_FILE); passwdExists = true; } catch {}
  try { await fs.access(SHADOW_FILE); shadowExists = true; } catch {}
  if (passwdExists && shadowExists) return false;

  await fs.mkdir(path.join(AMSYS_ROOT, 'etc'), { recursive: true });
  if (!passwdExists) {
    await fs.writeFile(PASSWD_FILE, 'root:root:0:0:root:/root:/bin/amsys\n', 'utf8');
  }
  if (!shadowExists) {
    await fs.writeFile(SHADOW_FILE, 'root:63a9f0ea7bb98050796b649e85481845:0:99999:7:::\n', 'utf8');
  }
  console.log('[config] Bootstrapped /etc/passwd & /etc/shadow with root user');
  return true;
}

/**
 * 一次性迁移：config/{旧 userid} → config/{UID}（按用户名 nick 匹配 passwd 第 3 位），
 * 同时重映射 system.json 的 lastLoginUserId。
 * @returns {Promise<number>} 迁移的目录数
 */
async function migrateUserDirsToUid() {
  let oldUsers = [];
  try {
    const data = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
    if (Array.isArray(data.users)) oldUsers = data.users;
  } catch {}
  if (oldUsers.length === 0) return 0;

  const records = await readPasswdShadow();
  const uidByNick = {};
  for (const r of records) uidByNick[r.username] = r.userid;

  let moved = 0;
  for (const u of oldUsers) {
    const oldId = Number(u.userid);
    const newId = uidByNick[u.username];
    if (!Number.isInteger(newId) || newId === oldId) continue;
    const oldDir = path.join(CONFIG_DIR, String(oldId));
    const newDir = path.join(CONFIG_DIR, String(newId));
    try { await fs.access(oldDir); } catch { continue; }
    try { await fs.access(newDir); continue; } catch {}
    await fs.rename(oldDir, newDir);
    console.log(`[config] Migrated user dir ${oldId} -> ${newId} (${u.username})`);
    moved++;
  }

  // 重映射最后登录用户
  try {
    const sys = JSON.parse(await fs.readFile(SYSTEM_FILE, 'utf8'));
    const lastId = Number(sys.lastLoginUserId);
    const oldUser = oldUsers.find((u) => Number(u.userid) === lastId);
    if (oldUser && uidByNick[oldUser.username] !== undefined && Number(uidByNick[oldUser.username]) !== lastId) {
      sys.lastLoginUserId = uidByNick[oldUser.username];
      await saveJSON(SYSTEM_FILE, sys);
      console.log('[config] Remapped lastLoginUserId:', lastId, '->', sys.lastLoginUserId);
    }
  } catch {}

  return moved;
}

/**
 * 生成 passwd 行（第 2 位为权限）
 */
function makePasswdLine(loginName, permi, uid, nick, home) {
  return `${loginName}:${permi}:${uid}:${uid}:${nick}:${home}:/bin/amsys`;
}

/**
 * 生成 shadow 行（8 字段：username:md5hash:min:max:warn:inactive:expire:reserved）
 */
function makeShadowLine(loginName, hash) {
  return `${loginName}:${hash}:0:99999:7:::`;
}

/**
 * 重写 passwd/shadow 中指定用户的记录（保留其他行与顺序）。
 * @param {string} loginName - 新登录名（字段 1）
 * @param {string} passwdLine - 新 passwd 行
 * @param {string} shadowLine - 新 shadow 行
 * @param {string|null} prevLoginName - 改名前的旧登录名（用于替换旧行）
 */
async function rewriteAuthUser(loginName, passwdLine, shadowLine, prevLoginName = null) {
  const lines = await readAuthRawLines();
  const key = prevLoginName || loginName;
  const findIdx = (arr) => arr.findIndex((l) => {
    const t = l.trim();
    return t && !t.startsWith('#') && t.split(':')[0] === key;
  });
  let pwIdx = findIdx(lines.passwd);
  if (pwIdx >= 0) lines.passwd[pwIdx] = passwdLine;
  else lines.passwd.push(passwdLine);
  let shIdx = findIdx(lines.shadow);
  if (shIdx >= 0) lines.shadow[shIdx] = shadowLine;
  else lines.shadow.push(shadowLine);
  await fs.writeFile(PASSWD_FILE, serializeAuthLines(lines.passwd), 'utf8');
  await fs.writeFile(SHADOW_FILE, serializeAuthLines(lines.shadow), 'utf8');
}

/**
 * 从 passwd/shadow 重建聚合视图（幂等）：
 * 1. users.json = 用户列表（userid=UID, username=nick, permi=permission, photo 来自 config.json）
 * 2. 各 config/{userid}/config.json 的 login 块刷新为 passwd/shadow 值（保留 profile 与 photo）
 */
async function syncUsersFromPasswdShadow() {
  try {
    await ensureConfigDir();
    const records = await readPasswdShadow();
    const users = [];
    for (const r of records) {
      await ensureUserDir(r.userid);
      let config = null;
      try {
        config = JSON.parse(await fs.readFile(getUserConfigPath(r.userid), 'utf8'));
      } catch {}
      const photo = (config && config.login && config.login.photo !== undefined) ? config.login.photo : null;
      const login = {
        userid: r.userid,
        username: r.username,
        password: r.password,
        photo,
        permi: r.permi
      };
      const newConfig = config ? { ...config, login } : {
        login,
        profile: { loginbg: null, themebd: 'dark', themecolor: '#0078D4', taskbar: 'floating' }
      };
      const newContent = JSON.stringify(newConfig, null, 2);
      let oldContent = null;
      try { oldContent = await fs.readFile(getUserConfigPath(r.userid), 'utf8'); } catch {}
      if (oldContent !== newContent) {
        await saveJSON(getUserConfigPath(r.userid), newConfig);
      }
      users.push({ userid: r.userid, username: r.username, photo, permi: r.permi });
    }
    users.sort((a, b) => a.userid - b.userid);
    await saveUsers(users);
  } catch (error) {
    console.error('Failed to sync users from passwd/shadow:', error.message);
  }
}

/**
 * 将旧版 ./config 目录数据迁移到 amsys 虚拟根的 /etc/system/core，
 * 并将旧目录归档为 tar 保留。幂等：新位置已有数据则跳过。
 * @returns {Promise<boolean>} 是否执行了迁移
 */
async function migrateLegacyConfig() {
  try {
    // 新位置已有数据则无需迁移
    try {
      await fs.access(path.join(CONFIG_DIR, 'users.json'));
      return false;
    } catch {
      // 继续迁移
    }
    
    // 旧目录不存在或为空则跳过
    let legacyExists = false;
    try {
      await fs.access(path.join(LEGACY_CONFIG_DIR, 'users.json'));
      legacyExists = true;
    } catch {
      return false;
    }
    
    if (!legacyExists) return false;
    
    // 清理旧目录中的空目录（如 undefined）
    const entries = await fs.readdir(LEGACY_CONFIG_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !/^\d+$/.test(entry.name)) {
        try {
          await fs.rm(path.join(LEGACY_CONFIG_DIR, entry.name), { recursive: true, force: true });
          console.log('[config] Removed invalid legacy dir:', entry.name);
        } catch (e) {
          console.warn('[config] Failed to remove legacy dir:', entry.name, e.message);
        }
      }
    }
    
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    
    // 复制 users.json / system.json
    for (const file of ['users.json', 'system.json']) {
      try {
        await fs.copyFile(path.join(LEGACY_CONFIG_DIR, file), path.join(CONFIG_DIR, file));
      } catch {
        // 单个文件缺失可接受
      }
    }
    
    // 复制各用户目录
    for (const entry of entries) {
      if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
        await fs.cp(
          path.join(LEGACY_CONFIG_DIR, entry.name),
          path.join(CONFIG_DIR, entry.name),
          { recursive: true }
        );
      }
    }
    
    // 归档旧目录为 tar（Windows 10+ 自带 tar；输出文件名用相对路径避免
    // 含盘符冒号的路径被 bsdtar 误判为 host:path 远程主机）
    try {
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const tarName = `config-backup-${stamp}.tar`;
      execFileSync('tar', ['-cf', tarName, 'config'], {
        cwd: APP_ROOT,
        stdio: 'ignore'
      });
      console.log('[config] Archived legacy config to:', path.join(APP_ROOT, tarName));
    } catch (e) {
      console.warn('[config] Failed to archive legacy config (kept in place):', e.message);
    }
    
    console.log('[config] Migrated legacy config to:', CONFIG_DIR);
    return true;
  } catch (error) {
    console.error('Failed to migrate legacy config:', error.message);
    return false;
  }
}

// 运行时监听：跟踪 /etc/passwd 与 /etc/shadow 的修改时间，
// 变化时自动重建 users.json 并刷新各 config.json 的 login 块（无需重启即可生效）
const watchTimer = null;
let watchInterval = null;
let lastSeen = new Map();
let watchBusy = false;

/**
 * 收集认证文件的修改时间快照
 */
async function collectAuthSnapshot() {
  const snapshot = new Map();
  for (const p of [PASSWD_FILE, SHADOW_FILE]) {
    try {
      const st = await fs.stat(p);
      snapshot.set(p, st.mtimeMs);
    } catch {
      // 文件不存在，忽略
    }
  }
  return snapshot;
}

/**
 * 检查认证文件变更并重新同步
 */
async function checkConfigChanges() {
  if (watchBusy) return;
  const snapshot = await collectAuthSnapshot();
  let changed = snapshot.size !== lastSeen.size;
  if (!changed) {
    for (const [p, mt] of snapshot) {
      if (lastSeen.get(p) !== mt) {
        changed = true;
        break;
      }
    }
  }
  lastSeen = snapshot;
  if (!changed) return;
  
  watchBusy = true;
  try {
    console.log('[config] Detected passwd/shadow change, re-syncing...');
    await syncUsersFromPasswdShadow();
  } finally {
    watchBusy = false;
  }
}

/**
 * 启动运行时配置监听（轮询 mtime，间隔 2 秒）
 * 监听范围：{AMSYS_ROOT}/etc/passwd 与 /etc/shadow
 */
async function startConfigWatch() {
  if (watchInterval) return;
  lastSeen = await collectAuthSnapshot();
  watchInterval = setInterval(checkConfigChanges, 2000);
}

/**
 * 停止运行时配置监听
 */
function stopConfigWatch() {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
  }
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
 * 获取所有用户（以 /etc/passwd 为权威，photo 从 config.json 补齐）
 * @returns {Promise<Array>} 用户列表：[{ userid(UID), username(nick), photo, permi }]
 */
async function getUsers() {
  const records = await readPasswdShadow();
  const users = [];
  for (const r of records) {
    let photo = null;
    let hasPassword = false;
    try {
      const cfg = JSON.parse(await fs.readFile(getUserConfigPath(r.userid), 'utf8'));
      photo = (cfg.login && cfg.login.photo) || null;
      hasPassword = !!(cfg.login && cfg.login.password);
    } catch {}
    users.push({ userid: r.userid, username: r.username, photo, permi: r.permi, loginName: r.loginName, hasPassword });
  }
  return users;
}

/**
 * 保存用户列表（幂等：内容无变化则不写盘，避免无谓磁盘写入与监听自触发）
 * @param {Array} users - 用户列表
 */
async function saveUsers(users) {
  const content = JSON.stringify({ users }, null, 2);
  try {
    const existing = await fs.readFile(USERS_FILE, 'utf8');
    if (existing === content) return;
  } catch {
    // 文件不存在，直接写入
  }
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
      themecolor: '#0078D4',
      taskbar: 'floating'
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
      loginBackground: userConfig.profile.loginbg,
      theme: userConfig.profile.themebd,
      accentColor: userConfig.profile.themecolor,
      taskbar: userConfig.profile.taskbar || 'floating'
    };
  }
  
  return {
    background: null,
    theme: 'dark',
    accentColor: '#0078D4'
  };
}

/**
 * 添加新用户（直接写入 /etc/passwd 与 /etc/shadow，UID 从 1000 起取空闲值）
 * @param {string} username - 用户名（同时作为登录名与昵称 nick）
 * @param {string} password - 密码（明文，存为无盐 MD5 到 shadow）
 * @param {string} photo - 头像路径（可选，仅存 config.json）
 * @param {string} permi - 权限：root/sudo/user（默认 user）
 * @param {string} nickname - 全名（passwd 字段5），缺省时与用户名一致
 * @returns {Promise<Object|null>} 新创建的用户；用户名已存在返回 null
 */
async function addUser(username, password = '', photo = null, permi = 'user', nickname = null) {
  if (!username) return null;
  const perm = VALID_PERMISSIONS.includes(permi) ? permi : 'user';
  const loginName = String(username).trim();
  const nick = (nickname && String(nickname).trim()) || loginName;
  if (!loginName || !nick) return null;
  const records = await readPasswdShadow();
  if (records.some((r) => r.loginName === loginName || r.username === loginName || r.username === nick)) {
    return null; // 登录名/全名与现有用户冲突
  }

  let maxUid = 0;
  for (const r of records) if (r.userid > maxUid) maxUid = r.userid;
  const uid = Math.max(1000, maxUid + 1);
  const home = perm === 'root' ? '/root' : `/home/${loginName}`;
  const hash = normalizePassword(password);

  await rewriteAuthUser(
    loginName,
    makePasswdLine(loginName, perm, uid, nick, home),
    makeShadowLine(loginName, hash)
  );

  await ensureUserDir(uid);
  await saveJSON(getUserConfigPath(uid), {
    login: { userid: uid, username: nick, password: hash, photo, permi: perm },
    profile: { loginbg: null, themebd: 'dark', themecolor: '#0078D4', taskbar: 'floating' }
  });

  await syncUsersFromPasswdShadow();
  return { userid: uid, username: nick, loginName, photo, permi: perm };
}

/**
 * 更新用户信息（直接写 /etc/passwd 与 /etc/shadow）
 * @param {number} userId - 用户ID（UID）
 * @param {Object} updates - 要更新的字段（username/permi/password/photo/nickname）
 *   username：登录名（字段1），home 目录跟随登录名重命名
 *   nickname：仅改昵称（passwd 字段5/全名），登录名与 home 目录保持不变
 * @returns {Promise<Object|null>} 更新后的用户或null
 */
async function updateUser(userId, updates) {
  const records = await readPasswdShadow();
  const rec = records.find((r) => r.userid === userId);
  if (!rec) return null;
  const { password, ...safeUpdates } = updates;

  // 重名预检（排除自己）：登录名或全名与现有其他用户冲突时拒绝修改，
  // 避免改到一半（如 home 已重命名）才发现冲突
  const plannedLoginName = (safeUpdates.username !== undefined && safeUpdates.username !== rec.username)
    ? String(safeUpdates.username).trim()
    : rec.loginName;
  const plannedNickRaw = (safeUpdates.username !== undefined && safeUpdates.username !== rec.username)
    ? String(safeUpdates.username).trim()
    : rec.username;
  const plannedNick = (safeUpdates.nickname !== undefined && String(safeUpdates.nickname).trim()
    && String(safeUpdates.nickname).trim() !== rec.username)
    ? String(safeUpdates.nickname).trim()
    : plannedNickRaw;
  if (!plannedLoginName || !plannedNick) return null;
  if (records.some((r) => r.userid !== userId
    && (r.loginName === plannedLoginName || r.username === plannedNick))) {
    return null;
  }

  let loginName = rec.loginName;
  let nick = rec.username;
  let perm = rec.permi;
  let photo = null;
  try {
    const cfg = JSON.parse(await fs.readFile(getUserConfigPath(userId), 'utf8'));
    photo = (cfg.login && cfg.login.photo) || null;
  } catch {}

  if (safeUpdates.username !== undefined && safeUpdates.username !== rec.username) {
    nick = safeUpdates.username;
    loginName = safeUpdates.username; // 字段1 与昵称保持一致
    // home 目录跟随登录名迁移（root 的 /root 不迁移）
    if (userId !== 0) {
      const oldHomePath = rec.home === '/root' ? null : path.join(AMSYS_ROOT, String(rec.home || '').replace(/^[\\/]+/, ''));
      const newHomePath = path.join(AMSYS_ROOT, 'home', String(loginName).trim());
      if (oldHomePath && newHomePath !== oldHomePath) {
        try {
          await fs.access(oldHomePath);
          await fs.rename(oldHomePath, newHomePath);
        } catch {}
      }
    }
  }
  // 仅改昵称（passwd 字段5 / 全名）：不改登录名，home 目录保持跟随登录名
  if (safeUpdates.nickname !== undefined && String(safeUpdates.nickname).trim() !== rec.username) {
    const newNick = String(safeUpdates.nickname).trim();
    if (newNick) nick = newNick;
  }
  if (safeUpdates.permi !== undefined) {
    perm = VALID_PERMISSIONS.includes(safeUpdates.permi) ? safeUpdates.permi : 'user';
  }
  if (userId === 0) perm = 'root'; // root 恒为 root
  if (safeUpdates.photo !== undefined) {
    photo = safeUpdates.photo;
  }

  const hash = password !== undefined ? normalizePassword(password) : rec.password;
  const home = perm === 'root' ? '/root' : `/home/${loginName}`;
  const prevLoginName = loginName !== rec.loginName ? rec.loginName : null;

  await rewriteAuthUser(
    loginName,
    makePasswdLine(loginName, perm, userId, nick, home),
    makeShadowLine(loginName, hash),
    prevLoginName
  );

  let config = null;
  try {
    config = JSON.parse(await fs.readFile(getUserConfigPath(userId), 'utf8'));
  } catch {}
  const login = { userid: userId, username: nick, password: hash, photo, permi: perm };
  await saveJSON(getUserConfigPath(userId), config ? { ...config, login } : {
    login,
    profile: { loginbg: null, themebd: 'dark', themecolor: '#0078D4', taskbar: 'floating' }
  });

  await syncUsersFromPasswdShadow();
  return { userid: userId, username: nick, photo, permi: perm };
}

/**
 * 删除用户（同时从 /etc/passwd、/etc/shadow 与 config 目录移除；root 不可删除）
 * @param {number} userId - 用户ID（UID）
 */
async function deleteUser(userId) {
  const records = await readPasswdShadow();
  const rec = records.find((r) => r.userid === userId);
  if (!rec) return;
  if (userId === 0) {
    console.warn('[config] Refusing to delete root user');
    return;
  }

  const lines = await readAuthRawLines();
  const isTarget = (l) => {
    const t = l.trim();
    return t && !t.startsWith('#') && t.split(':')[0] === rec.loginName;
  };
  lines.passwd = lines.passwd.filter((l) => !isTarget(l));
  lines.shadow = lines.shadow.filter((l) => !isTarget(l));
  await fs.writeFile(PASSWD_FILE, serializeAuthLines(lines.passwd), 'utf8');
  await fs.writeFile(SHADOW_FILE, serializeAuthLines(lines.shadow), 'utf8');

  try {
    await fs.rm(path.join(CONFIG_DIR, String(userId)), { recursive: true, force: true });
  } catch {}

  await syncUsersFromPasswdShadow();
}

/**
 * 验证用户登录（以 /etc/passwd 昵称匹配、/etc/shadow md5hash 校验）
 * @param {string} username - 用户名（昵称 nick）
 * @param {string} password - 明文密码
 * @returns {Promise<Object|null>} 验证成功返回用户对象，失败返回null
 */
async function verifyUser(username, password) {
  const records = await readPasswdShadow();
  const user = records.find((r) => r.username === username);
  if (!user) return null;

  const hash = user.password;
  if (hash === '!' || hash === '*') return null; // 锁定账户

  let matched = false;
  if (hash === '') {
    matched = password === ''; // 空哈希 = 空密码
  } else if (MD5_RE.test(hash)) {
    matched = crypto.createHash('md5').update(password).digest('hex') === hash;
  }
  if (!matched) return null;

  let photo = null;
  try {
    const cfg = JSON.parse(await fs.readFile(getUserConfigPath(user.userid), 'utf8'));
    photo = (cfg.login && cfg.login.photo) || null;
  } catch {}
  return { userid: user.userid, username: user.username, photo, permi: user.permi };
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
 * 设置任务栏模式（floating=浮动 / docked=停靠）
 * @param {string} mode - 'floating' 或 'docked'
 * @param {number} userId - 用户ID
 */
async function setTaskbarMode(mode, userId) {
  const userConfig = await getUserConfig(userId);
  userConfig.profile.taskbar = mode === 'docked' ? 'docked' : 'floating';
  await saveUserConfig(userId, userConfig);
}

/**
 * 设置用户权限
 * @param {number} userId - 用户ID
 * @param {string} permi - 权限级别：root/sudo/user
 */
async function setPermission(userId, permi) {
  if (!VALID_PERMISSIONS.includes(permi)) return;
  const records = await readPasswdShadow();
  const rec = records.find((r) => r.userid === userId);
  if (!rec) return;

  const perm = userId === 0 ? 'root' : permi; // root 恒为 root
  const home = perm === 'root' ? '/root' : `/home/${rec.loginName}`;
  await rewriteAuthUser(
    rec.loginName,
    makePasswdLine(rec.loginName, perm, userId, rec.username, home),
    makeShadowLine(rec.loginName, rec.password)
  );

  let config = null;
  try {
    config = JSON.parse(await fs.readFile(getUserConfigPath(userId), 'utf8'));
  } catch {}
  if (config && config.login) {
    config.login.permi = perm;
    await saveJSON(getUserConfigPath(userId), config);
  }

  await syncUsersFromPasswdShadow();
}

/**
 * 获取系统配置
 * @returns {Promise<Object>} 系统配置
 */
async function getSystemConfig() {
  try {
    const data = await fs.readFile(SYSTEM_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { lastLoginUserId: null };
  }
}

/**
 * 保存系统配置
 * @param {Object} config - 系统配置
 */
async function saveSystemConfig(config) {
  await ensureConfigDir();
  await fs.writeFile(SYSTEM_FILE, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * 保存最后登录的用户ID
 * @param {number} userId - 用户ID
 */
async function setLastLoginUserId(userId) {
  const systemConfig = await getSystemConfig();
  systemConfig.lastLoginUserId = userId;
  await saveSystemConfig(systemConfig);
}

/**
 * 获取最后登录的用户ID
 * @returns {Promise<number|null>} 用户ID
 */
async function getLastLoginUserId() {
  const systemConfig = await getSystemConfig();
  return systemConfig.lastLoginUserId || null;
}

/**
 * 获取用户桌面配置
 * @param {number} userId - 用户ID
 * @returns {Promise<Object>} 桌面配置
 */
async function getUserDesktop(userId) {
  const desktopPath = path.join(CONFIG_DIR, String(userId), 'desktop.json');
  const defaultDesktop = {
    desktopapp: [],
    desktopbg: null
  };
  return await loadJSON(desktopPath, defaultDesktop);
}

/**
 * 保存用户桌面配置
 * @param {number} userId - 用户ID
 * @param {Object} desktopConfig - 桌面配置
 */
async function saveUserDesktop(userId, desktopConfig) {
  const desktopPath = path.join(CONFIG_DIR, String(userId), 'desktop.json');
  await saveJSON(desktopPath, desktopConfig);
}

/**
 * 添加桌面应用
 * @param {number} userId - 用户ID
 * @param {Object} app - 应用对象 {name, start, icon, x, y}
 * @returns {Promise<Object>} 添加的应用
 */
async function addDesktopApp(userId, app) {
  const desktop = await getUserDesktop(userId);
  const newApp = {
    id: Date.now(),
    x: app.x || 0,
    y: app.y || 0,
    name: app.name || 'New App',
    start: app.start || '',
    icon: app.icon || null
  };
  desktop.desktopapp.push(newApp);
  await saveUserDesktop(userId, desktop);
  return newApp;
}

/**
 * 更新桌面应用
 * @param {number} userId - 用户ID
 * @param {number} appId - 应用ID
 * @param {Object} updates - 更新字段 {x, y, name, start, icon}
 */
async function updateDesktopApp(userId, appId, updates) {
  const desktop = await getUserDesktop(userId);
  const appIndex = desktop.desktopapp.findIndex(a => a.id === appId);
  if (appIndex !== -1) {
    desktop.desktopapp[appIndex] = { ...desktop.desktopapp[appIndex], ...updates };
    await saveUserDesktop(userId, desktop);
  }
}

/**
 * 删除桌面应用
 * @param {number} userId - 用户ID
 * @param {number} appId - 应用ID
 */
async function removeDesktopApp(userId, appId) {
  const desktop = await getUserDesktop(userId);
  desktop.desktopapp = desktop.desktopapp.filter(a => a.id !== appId);
  await saveUserDesktop(userId, desktop);
}

/**
 * 设置桌面背景
 * @param {number} userId - 用户ID
 * @param {string} bgPath - 背景图片路径
 */
async function setDesktopBackground(userId, bgPath) {
  const desktop = await getUserDesktop(userId);
  desktop.desktopbg = bgPath;
  await saveUserDesktop(userId, desktop);
}

/**
 * 更新桌面应用位置
 * @param {number} userId - 用户ID
 * @param {number} appId - 应用ID
 * @param {number} x - 新的X坐标
 * @param {number} y - 新的Y坐标
 */
async function updateDesktopAppPosition(userId, appId, x, y) {
  const desktop = await getUserDesktop(userId);
  const app = desktop.desktopapp.find(a => a.id === appId);
  if (app) {
    app.x = x;
    app.y = y;
    await saveUserDesktop(userId, desktop);
    return true;
  }
  return false;
}

/**
 * 获取用户隐藏的应用列表（独立文件 hidden-apps.json）
 * @param {number} userId - 用户ID
 * @returns {Promise<string[]>} 隐藏的 .app 名数组（含后缀）
 */
async function getHiddenApps(userId) {
  const hiddenPath = path.join(CONFIG_DIR, String(userId), 'hidden-apps.json');
  try {
    const data = JSON.parse(await fs.readFile(hiddenPath, 'utf8'));
    return Array.isArray(data.hiddenApps) ? data.hiddenApps : [];
  } catch {
    return [];
  }
}

/**
 * 设置/解除应用的隐藏状态
 * @param {number} userId - 用户ID
 * @param {string} appName - .app 名（如 com.pacman.app）
 * @param {boolean} hidden - true=隐藏 / false=显示
 */
async function setHiddenApp(userId, appName, hidden) {
  const userDir = await ensureUserDir(userId);
  const hiddenPath = path.join(userDir, 'hidden-apps.json');
  let list = await getHiddenApps(userId);
  const name = String(appName || '').replace(/\.app$/i, '') + '.app';
  if (hidden) {
    if (!list.includes(name)) list.push(name);
  } else {
    list = list.filter((n) => n !== name);
  }
  await saveJSON(hiddenPath, { hiddenApps: list });
  return list;
}

// 导出模块接口
module.exports = {
  getUsers,
  saveUsers,
  readPasswdShadow,
  ensurePasswdShadowBootstrap,
  migrateUserDirsToUid,
  syncUsersFromPasswdShadow,
  migrateLegacyConfig,
  startConfigWatch,
  stopConfigWatch,
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
  setTaskbarMode,
  setPermission,
  ensureUserDir,
  setLastLoginUserId,
  getLastLoginUserId,
  getUserDesktop,
  saveUserDesktop,
  addDesktopApp,
  updateDesktopApp,
  removeDesktopApp,
  setDesktopBackground,
  updateDesktopAppPosition,
  getHiddenApps,
  setHiddenApp,
  AMSYS_ROOT,
  CONFIG_DIR,
  PASSWD_FILE,
  SHADOW_FILE,
  PWSH_PATH
};
