/**
 * 通知服务（消息面板数据源）
 *
 * 存储位置：{amsys_root}/etc/system/core/notifications.json
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

const STORE_PATH = path.join(config.CONFIG_DIR, 'notifications.json');
const MAX_ITEMS = 50;

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
  try {
    const data = JSON.parse(await fs.readFile(STORE_PATH, 'utf8'));
    if (Array.isArray(data.items)) return data.items;
  } catch {}
  return [];
}

/**
 * 写入通知存储（含目录确保 + 数量上限）
 */
async function writeStore(items) {
  try {
    await fs.mkdir(config.CONFIG_DIR, { recursive: true });
  } catch {}
  await fs.writeFile(STORE_PATH, JSON.stringify({ items: items.slice(0, MAX_ITEMS) }, null, 2), 'utf8');
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
    time: Date.now(),
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
  setChangeListener,
  listAll,
  add,
  dismiss,
  dismissAll,
  clearAll,
  unreadCount,
  STORE_PATH,
};
