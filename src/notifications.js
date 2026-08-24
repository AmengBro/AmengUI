/**
 * 通知服务（消息面板数据源）
 *
 * 存储位置：当前用户 home 下的 ~/.config/system/core/notifications.json
 * 结构：{ items: Notification[] }，新通知在前，最多保留 50 条。
 *
 * Notification: {
 *   id: string,          // 唯一 ID
 *   source: 'system'|'app',
 *   appName: string,     // 可选，来源应用 .app 名
 *   title: string,
 *   body: string,
 *   icon: string|null,   // 可选，图标路径 / data URL
 *   time: number,        // 通知时间（epoch ms）
 *   read: boolean        // 是否已读（请勿打扰模式下直接标记已读）
 * }
 */

const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

const MAX_ITEMS = 50;

// The active user can change without reloading the main process. Resolve the
// path at operation time instead of freezing it when this module is required.
let storePathResolver = null;

function setStorePathResolver(fn) {
  storePathResolver = typeof fn === 'function' ? fn : null;
}

async function getStorePath() {
  if (storePathResolver) {
    try {
      const resolved = await storePathResolver();
      if (resolved) return resolved;
    } catch {}
  }
  // Safe bootstrap fallback before a login user is available.
  return path.join(config.AMSYS_ROOT, 'root', '.config', 'system', 'core', 'notifications.json');
}

async function hasStore() {
  try {
    await fs.access(await getStorePath());
    return true;
  } catch {
    return false;
  }
}

/** Copy the pre-user global store into the current user's home once. */
async function migrateLegacyStore(legacyPath) {
  const targetPath = await getStorePath();
  if (!legacyPath || path.resolve(legacyPath) === path.resolve(targetPath)) return false;
  try {
    await fs.access(targetPath);
    return false;
  } catch {}
  try {
    const legacy = await fs.readFile(legacyPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, legacy);
    return true;
  } catch {
    return false;
  }
}

// 存储变更监听器（主进程注册，用于广播到各窗口）
let changeListener = null;

function setChangeListener(fn) {
  changeListener = fn;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 读取通知存储（文件缺失/损坏时返回空列表）
 */
async function readStore() {
  const storePath = await getStorePath();
  try {
    const data = JSON.parse(await fs.readFile(storePath, 'utf8'));
    if (Array.isArray(data.items)) return data.items;
  } catch {}
  return [];
}

/**
 * 写入通知存储（含目录确保 + 数量上限）
 */
async function writeStore(items) {
  const storePath = await getStorePath();
  try {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
  } catch {}
  await fs.writeFile(storePath, JSON.stringify({ items: items.slice(0, MAX_ITEMS) }, null, 2), 'utf8');
}

/**
 * 获取全部通知（新在前）
 */
async function listAll() {
  return await readStore();
}

/**
 * 新增通知
 * @param {{source?: 'system'|'app', appName?: string, title: string, body?: string, icon?: string|null, read?: boolean}} payload
 * @returns {Promise<object|null>} 保存后的通知对象
 */
async function add(payload) {
  const item = {
    id: makeId(),
    source: payload.source === 'app' ? 'app' : 'system',
    appName: payload.appName || null,
    title: String(payload.title || '通知'),
    body: String(payload.body || ''),
    icon: payload.icon || null,
    time: Number.isFinite(Number(payload.time)) ? Number(payload.time) : Date.now(),
    read: !!payload.read,
  };
  const items = await readStore();
  items.unshift(item);
  await writeStore(items);
  if (changeListener) changeListener({ type: 'add', item });
  return item;
}

/**
 * 将单条通知标记为已读
 * @returns {Promise<boolean>} 是否找到并更新
 */
async function dismiss(id) {
  const items = await readStore();
  const target = items.find((n) => n.id === id);
  if (!target) return false;
  if (!target.read) {
    target.read = true;
    await writeStore(items);
    if (changeListener) changeListener({ type: 'update', item: target });
  }
  return true;
}

/**
 * 全部标记为已读
 */
async function dismissAll() {
  const items = await readStore();
  let changed = false;
  for (const n of items) {
    if (!n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) {
    await writeStore(items);
    if (changeListener) changeListener({ type: 'clear' });
  }
}

/**
 * 清空全部通知（含已读）
 */
async function clearAll() {
  const items = await readStore();
  if (items.length === 0) return;
  await writeStore([]);
  if (changeListener) changeListener({ type: 'clear' });
}

/**
 * 未读数量
 */
async function unreadCount() {
  const items = await readStore();
  return items.filter((n) => !n.read).length;
}

module.exports = {
  setStorePathResolver,
  getStorePath,
  hasStore,
  migrateLegacyStore,
  setChangeListener,
  listAll,
  add,
  dismiss,
  dismissAll,
  clearAll,
  unreadCount,
  // Kept as a compatibility marker for callers that only need to identify the
  // old location. New code must use getStorePath(), since it is user-scoped.
  STORE_PATH: path.join(config.CONFIG_DIR, 'notifications.json'),
  LEGACY_STORE_PATH: path.join(config.CONFIG_DIR, 'notifications.json'),
};
