/**
 * 设置页面逻辑
 * - 左侧导航（WinUI NavigationView 风格）+ 搜索过滤
 * - 主页：设备卡片（名称/型号/WiFi 状态）+ 推荐设置
 * - 个性化：背景 / 颜色（主题 + 强调色）/ 任务栏（已接入真实设置）
 * - 其余设置页：空状态占位，后续版本填充
 */

const NAV_ITEMS = [
  {
    id: 'home',
    label: '主页',
    icon: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
  },
  {
    id: 'system',
    label: '系统',
    icon: '<path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/>',
  },
  {
    id: 'bluetooth',
    label: '蓝牙和其他设备',
    icon: '<path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>',
  },
  {
    id: 'network',
    label: '网络和Internet',
    icon: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>',
  },
  {
    id: 'personalization',
    label: '个性化',
    icon: '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>',
  },
  {
    id: 'apps',
    label: '应用',
    icon: '<path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>',
  },
  {
    id: 'accounts',
    label: '账户',
    icon: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  },
  {
    id: 'time',
    label: '时间和语言',
    icon: '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>',
  },
  {
    id: 'gaming',
    label: '游戏',
    icon: '<path d="M15 7.5V2H9v5.5l3 3 3-3zM7.5 9H2v6h5.5l3-3-3-3zm9 0l-3 3 3 3H22V9h-5.5zM9 16.5V22h6v-5.5l-3-3-3 3z"/>',
  },
  {
    id: 'accessibility',
    label: '辅助功能',
    icon: '<path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z"/>',
  },
  {
    id: 'privacy',
    label: '隐私和安全性',
    icon: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>',
  },
  {
    id: 'update',
    label: 'Windows 更新',
    icon: '<path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>',
  },
];

const ACCENT_PRESETS = [
  '#0078D4', '#0067C0', '#C42B1C', '#D13438', '#E81123',
  '#C239B3', '#B146C2', '#881798', '#00B7C3', '#038387',
  '#00CC6A', '#10893E', '#9A0089', '#F7630C', '#FF8C00',
  '#CA5010', '#DA3B01', '#FFB900', '#8764B8',
];

const EMPTY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="64" height="64" aria-hidden="true">' +
  '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>' +
  '</svg>';

// 不在左侧导航中的子页面（高级管理、已安装的应用等）
const SUB_PAGES = ['admin', 'apps-installed'];

const BACK_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">' +
  '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' +
  '</svg>';

let currentPage = 'home';
let searchActive = false;
// 密码操作悬浮窗模式：close=关闭密码 / enable=开启密码 / change=修改密码
let pwdDialogMode = null;
// 密码操作目标用户（默认当前账户；高级管理操作其他用户时指向目标用户）
let pwdDialogTarget = null;
// 高级管理：用户列表与行状态
let adminUsers = [];
const adminRowState = new Map(); // userId -> { expanded, editing, pendingDelete }
// 已安装的应用：列表与行状态
let installedApps = [];
const installedRowState = new Map(); // appName -> { expanded, pendingUninstall }

const state = {
  theme: 'dark',
  accentColor: '#0078D4',
  isTaskbarFloating: true,
  desktopBackground: null,
  loginBackground: null,
  deviceName: '',
  deviceModel: '',
  account: { username: '用户', email: '', roleLabel: '本地账户', avatar: null },
};

/* ============================================================
   主题
   ============================================================ */
function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function applyTheme() {
  const root = document.documentElement;
  root.classList.toggle('theme-light', state.theme === 'bright');
  root.classList.toggle('theme-dark', state.theme !== 'bright');
  root.style.setProperty('--accent-user', state.accentColor);
  root.style.setProperty('--accent-hover', hexToRgba(state.accentColor, 0.9));
  root.style.setProperty('--accent-pressed', hexToRgba(state.accentColor, 0.8));
  document.getElementById('accent-input').value = state.accentColor;

  // 同步选项选中态
  document.querySelectorAll('#theme-options .option-card').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.theme === state.theme);
  });
  document.querySelectorAll('#taskbar-options .option-card').forEach((btn) => {
    btn.classList.toggle(
      'selected',
      (btn.dataset.taskbar === 'floating') === !!state.isTaskbarFloating
    );
  });
  document.querySelectorAll('#swatches .swatch').forEach((sw) => {
    sw.classList.toggle('selected', sw.dataset.color.toLowerCase() === state.accentColor.toLowerCase());
  });
}

/* ============================================================
   导航
   ============================================================ */
function buildNav() {
  const list = document.getElementById('nav-list');
  list.innerHTML = '';
  NAV_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-item';
    btn.dataset.nav = item.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `page-${item.id}`);
    btn.innerHTML = `
      <span class="nav-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">${item.icon}</svg>
      </span>
      <span class="nav-label">${item.label}</span>
    `;
    btn.addEventListener('click', () => navigateTo(item.id));
    list.appendChild(btn);
  });
}

function ensurePage(id) {
  let section = document.querySelector(`.page[data-page="${id}"]`);
  if (section) return section;

  const item = NAV_ITEMS.find((n) => n.id === id);
  if (!item) return null;

  section = document.createElement('section');
  section.className = 'page hidden';
  section.dataset.page = id;
  section.id = `page-${id}`;
  section.innerHTML = `
    <div class="page-header">
      <button class="win-btn SubtleButtonStyle back-btn" data-back type="button" aria-label="返回主页">${BACK_ICON}</button>
      <h1 class="page-title">${item.label}</h1>
    </div>
    <div class="empty-state">
      <div class="empty-icon">${EMPTY_ICON}</div>
      <div class="empty-title">设置项为空</div>
      <div class="empty-desc">“${item.label}”页面的设置项将在后续版本中添加。</div>
    </div>
  `;
  section.querySelector('[data-back]').addEventListener('click', () => navigateTo('home'));
  document.getElementById('content').appendChild(section);
  return section;
}

function navigateTo(id) {
  if (!NAV_ITEMS.some((n) => n.id === id) && !SUB_PAGES.includes(id)) return;
  const prevPage = currentPage;
  // 离开高级管理页：未保存编辑丢弃、删除确认默认取消
  if (prevPage === 'admin' && id !== 'admin') {
    resetAdminRowStates();
  }
  // 离开“已安装的应用”：复位行状态
  if (prevPage === 'apps-installed' && id !== 'apps-installed') {
    installedRowState.clear();
  }
  const target = ensurePage(id);
  if (!target) return;

  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  target.classList.remove('hidden');
  target.classList.remove('page-enter');
  void target.offsetWidth; // 重新触发进入动画
  target.classList.add('page-enter');

  // 子页面保持父级（账户）高亮，不修改导航选中态
  if (!SUB_PAGES.includes(id)) {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      const active = btn.dataset.nav === id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
      btn.setAttribute('tabindex', active ? '0' : '-1');
    });
  }

  currentPage = id;
  if (id === 'admin') {
    loadAdminUsers();
  }
  if (id === 'apps-installed') {
    loadInstalledApps();
  }
  document.getElementById('content').scrollTop = 0;
}

/* ============================================================
   查找设置（过滤导航）
   ============================================================ */
function applySearch(query) {
  const q = query.trim().toLowerCase();
  searchActive = q.length > 0;
  const navList = document.getElementById('nav-list');
  const empty = document.getElementById('nav-empty');
  let visible = 0;

  navList.querySelectorAll('.nav-item').forEach((btn) => {
    const label = btn.querySelector('.nav-label').textContent.toLowerCase();
    const match = !searchActive || label.includes(q);
    btn.classList.toggle('hidden', !match);
    if (match) visible += 1;
  });

  empty.classList.toggle('hidden', visible > 0);
  if (visible === 0 && searchActive) {
    document.getElementById('nav-empty-text').textContent = `未找到与“${query.trim()}”匹配的设置`;
  }
}

/* ============================================================
   设备信息
   ============================================================ */
async function loadDeviceInfo() {
  const nameEl = document.getElementById('device-name');
  const modelEl = document.getElementById('device-model');

  if (state.deviceName) {
    nameEl.textContent = state.deviceName;
  }

  try {
    const info = await window.electronAPI.settings.getDeviceInfo();
    if (info && info.model) {
      state.deviceModel = [info.manufacturer, info.model].filter(Boolean).join(' ');
      modelEl.textContent = state.deviceModel;
    } else {
      modelEl.textContent = '此设备';
    }
  } catch (err) {
    console.error('[Settings] 获取设备信息失败:', err);
    modelEl.textContent = '此设备';
  }
}

async function loadWifiStatus() {
  const labelEl = document.getElementById('wifi-label');
  const subEl = document.getElementById('wifi-sub');
  try {
    const res = await window.electronAPI.system.getWifiStatus();
    if (res && res.success !== false) {
      if (res.connected && res.ssid) {
        labelEl.textContent = res.ssid;
        subEl.textContent = '已连接';
        return;
      }
      if (res.connecting) {
        labelEl.textContent = 'WiFi';
        subEl.textContent = '正在连接…';
        return;
      }
      if (res.radioEnabled === false || res.enabled === false) {
        labelEl.textContent = 'WiFi';
        subEl.textContent = 'WiFi 已关闭';
        return;
      }
    }
    labelEl.textContent = 'WiFi';
    subEl.textContent = '未连接';
  } catch (err) {
    console.error('[Settings] 获取 WiFi 状态失败:', err);
    labelEl.textContent = 'WiFi';
    subEl.textContent = '无法获取网络状态';
  }
}

/* ============================================================
   个性化控制
   ============================================================ */
function buildSwatches() {
  const row = document.getElementById('swatches');
  ACCENT_PRESETS.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.dataset.color = color;
    btn.style.background = color;
    btn.title = color;
    btn.setAttribute('aria-label', `主题色 ${color}`);
    btn.addEventListener('click', () => {
      state.accentColor = color;
      applyTheme();
      sendChange({ type: 'accentColor', value: color });
    });
    row.appendChild(btn);
  });
}

function sendChange(change) {
  if (window.electronAPI && window.electronAPI.settings) {
    window.electronAPI.settings.change(change);
  }
}

function applyBackgroundToPreview(url) {
  const preview = document.getElementById('bg-preview');
  state.desktopBackground = url;
  if (url) {
    preview.style.backgroundImage = `url('${url}')`;
    preview.classList.add('has-bg');
  } else {
    preview.style.backgroundImage = '';
    preview.classList.remove('has-bg');
  }
}

/**
 * 应用登录背景预览（登录页使用 profile.loginbg）
 */
function applyLoginBgPreview() {
  const preview = document.getElementById('login-bg-preview');
  if (!preview) return;
  if (state.loginBackground) {
    preview.style.backgroundImage = `url('${state.loginBackground}')`;
    preview.classList.add('has-bg');
  } else {
    preview.style.backgroundImage = '';
    preview.classList.remove('has-bg');
  }
}

/* ============================================================
   重命名对话框
   ============================================================ */
function openRenameDialog() {
  const overlay = document.getElementById('dialog-overlay');
  const input = document.getElementById('dialog-input');
  input.value = state.deviceName || '';
  overlay.classList.remove('hidden');
  input.focus();
  input.select();
}

function closeRenameDialog() {
  document.getElementById('dialog-overlay').classList.add('hidden');
}

/* ============================================================
   账户页：你的信息（长格式名称 / 展开面板 / 全名与头像修改）
   ============================================================ */

/**
 * 渲染账户信息（左侧卡片 + 账户主页 + “你的信息”面板）
 */
function renderAccountInfo() {
  // 左侧账户卡片
  const nameEl = document.getElementById('account-name');
  const subEl = document.getElementById('account-sub');
  const avatarBox = document.getElementById('account-avatar');
  if (nameEl) nameEl.textContent = state.account.nickname || state.account.username || '用户';
  if (subEl) subEl.textContent = state.account.email || state.account.roleLabel || '本地账户';
  if (avatarBox) {
    avatarBox.innerHTML = state.account.avatar
      ? `<img src="${state.account.avatar}" alt="">`
      : '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  }
  // 无头像时禁用“清除头像”
  const btnClearAvatar = document.getElementById('btn-clear-avatar');
  if (btnClearAvatar) btnClearAvatar.disabled = !state.account.avatar;

  // 账户主页：长格式名称 Nick(username) / 角色徽章 / 头像
  const heroName = document.getElementById('account-hero-name');
  const heroRole = document.getElementById('account-hero-role');
  const heroAvatar = document.getElementById('account-hero-avatar');
  if (heroName) {
    const nick = state.account.nickname || state.account.username || '用户';
    const login = state.account.loginName || '';
    heroName.textContent = login && login !== nick ? `${nick} (${login})` : nick;
  }
  if (heroRole) heroRole.textContent = state.account.roleLabel || '用户';
  if (heroAvatar) {
    heroAvatar.innerHTML = state.account.avatar
      ? `<img src="${state.account.avatar}" alt="">`
      : '<svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  }

  // “你的信息”展开面板
  const loginEl = document.getElementById('info-login-name');
  const uidEl = document.getElementById('info-user-id');
  const permEl = document.getElementById('info-permission');
  const nickInput = document.getElementById('input-nickname');
  if (loginEl) loginEl.textContent = state.account.loginName || '-';
  if (uidEl) uidEl.textContent = String(state.account.userId ?? '-');
  if (permEl) permEl.textContent = state.account.roleLabel || '-';
  if (nickInput) nickInput.value = state.account.nickname || state.account.username || '';

  // “其他账户”仅对管理员级账户（root/sudo）开放
  const otherAccountsCard = document.getElementById('card-other-accounts');
  if (otherAccountsCard) {
    const privileged = state.account.permi === 'root' || state.account.permi === 'sudo';
    otherAccountsCard.classList.toggle('hidden', !privileged);
  }

  // 登录选项：密码开关状态
  renderPasswordStatus();
}

/**
 * “你的信息”面板内的状态提示
 */
function setInfoStatus(message, type) {
  const status = document.getElementById('info-status');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('hidden', !message);
  status.classList.toggle('success', type === 'success');
  status.classList.toggle('error', type === 'error');
}

/**
 * 渲染密码开关状态（绿=已开启 / 红=已关闭）
 */
function renderPasswordStatus() {
  const dot = document.getElementById('pwd-status-dot');
  const text = document.getElementById('pwd-status-text');
  const btn = document.getElementById('btn-pwd-toggle');
  const on = !!state.account.hasPassword;
  if (dot) dot.classList.toggle('on', on);
  if (text) {
    text.textContent = on ? '密码已开启' : '密码已关闭';
    text.classList.toggle('on', on);
  }
  if (btn) btn.textContent = on ? '关闭' : '开启';
  // 密码未开启时不提供“修改密码”入口
  const changeRow = document.getElementById('row-pwd-change');
  if (changeRow) changeRow.classList.toggle('hidden', !on);
}

/**
 * 打开密码操作悬浮窗
 * @param {'close'|'enable'|'change'} mode - close=关闭密码(仅当前密码) /
 *   enable=开启密码(新密码+重复) / change=修改密码(当前+新+重复)
 */
function openPwdDialog(mode, target = null) {
  pwdDialogMode = mode;
  pwdDialogTarget = target || {
    userId: state.account.userId,
    nickname: state.account.nickname || state.account.username || '用户',
    hasPassword: !!state.account.hasPassword,
  };
  const overlay = document.getElementById('pwd-dialog-overlay');
  const title = document.getElementById('pwd-dialog-title');
  const confirmBtn = document.getElementById('pwd-dialog-confirm');
  const closeBtn = document.getElementById('pwd-dialog-close');
  const curWrap = document.getElementById('pwd-dialog-current-wrap');
  const newWrap = document.getElementById('pwd-dialog-new-wrap');
  const repWrap = document.getElementById('pwd-dialog-repeat-wrap');

  const meta = {
    close: { title: '关闭密码', confirm: '关闭' },
    enable: { title: '开启密码', confirm: '开启' },
    change: { title: '修改密码', confirm: '修改' },
    admin: { title: `修改 ${pwdDialogTarget.nickname} 的密码`, confirm: '保存' },
  }[mode] || { title: '修改密码', confirm: '修改' };

  title.textContent = meta.title;
  confirmBtn.textContent = meta.confirm;
  // 管理员模式下可一键关闭对方密码（仅当对方已开启密码时显示）
  const isAdmin = mode === 'admin';
  closeBtn.classList.toggle('hidden', !(isAdmin && pwdDialogTarget.hasPassword));
  curWrap.classList.toggle('hidden', mode === 'enable' || isAdmin);
  newWrap.classList.toggle('hidden', mode === 'close');
  repWrap.classList.toggle('hidden', mode === 'close');

  document.getElementById('pwd-dialog-current').value = '';
  document.getElementById('pwd-dialog-new').value = '';
  document.getElementById('pwd-dialog-repeat').value = '';
  setPwdDialogStatus('');
  overlay.classList.remove('hidden');
  const firstFocus = (mode === 'close') ? 'pwd-dialog-current' : 'pwd-dialog-new';
  setTimeout(() => document.getElementById(firstFocus).focus(), 50);
}

function closePwdDialog() {
  document.getElementById('pwd-dialog-overlay').classList.add('hidden');
  pwdDialogMode = null;
  pwdDialogTarget = null;
}

/**
 * 密码悬浮窗内的状态提示
 */
function setPwdDialogStatus(message, type) {
  const status = document.getElementById('pwd-dialog-status');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('hidden', !message);
  status.classList.toggle('success', type === 'success');
  status.classList.toggle('error', type === 'error');
}

/**
 * 提交密码悬浮窗操作（经 config:changePassword 写回虚拟根 /etc/shadow 的 md5 字段）
 * @param {'save'|'close'} [action] - 管理员模式下的操作：save=设置新密码 / close=关闭密码
 */
async function submitPwdDialog(action = 'save') {
  const current = document.getElementById('pwd-dialog-current').value;
  const newPwd = document.getElementById('pwd-dialog-new').value;
  const repeat = document.getElementById('pwd-dialog-repeat').value;

  let currentPassword = '';
  let newPassword = '';
  let verifyCurrent = false;
  let successMsg = '';
  const target = pwdDialogTarget || {
    userId: state.account.userId,
    nickname: state.account.nickname || state.account.username,
    hasPassword: !!state.account.hasPassword,
  };

  if (pwdDialogMode === 'admin') {
    // 管理员模式：无需旧密码，可设置新密码或关闭对方密码
    if (action === 'close') {
      newPassword = '';
      successMsg = '密码已关闭';
    } else {
      if (!newPwd) {
        setPwdDialogStatus('请输入新密码', 'error');
        return;
      }
      if (newPwd !== repeat) {
        setPwdDialogStatus('两次输入的密码不一致', 'error');
        return;
      }
      newPassword = newPwd;
      successMsg = '密码已保存';
    }
  } else if (pwdDialogMode === 'close') {
    // 关闭密码：强制输入一次当前密码
    if (!current) {
      setPwdDialogStatus('请输入当前密码', 'error');
      return;
    }
    currentPassword = current;
    newPassword = '';
    verifyCurrent = true;
    successMsg = '密码已关闭';
  } else if (pwdDialogMode === 'enable') {
    // 开启密码：输入新密码 + 重复
    if (!newPwd) {
      setPwdDialogStatus('请输入新密码', 'error');
      return;
    }
    if (newPwd !== repeat) {
      setPwdDialogStatus('两次输入的密码不一致', 'error');
      return;
    }
    newPassword = newPwd;
    successMsg = '密码已开启';
  } else {
    // 修改密码：当前 + 新 + 重复
    if (!newPwd) {
      setPwdDialogStatus('新密码不能为空', 'error');
      return;
    }
    if (newPwd !== repeat) {
      setPwdDialogStatus('两次输入的密码不一致', 'error');
      return;
    }
    currentPassword = current;
    newPassword = newPwd;
    verifyCurrent = true;
    successMsg = '密码已修改';
  }

  try {
    const res = await window.electronAPI.config.changePassword({
      userId: target.userId,
      nickname: target.nickname,
      currentPassword,
      newPassword,
      verifyCurrent,
    });
    if (res && res.success) {
      if (pwdDialogMode === 'admin') {
        // 刷新高级管理列表中的密码状态
        target.hasPassword = !!newPassword;
        loadAdminUsers();
      } else {
        state.account.hasPassword = !!newPassword;
        renderPasswordStatus();
      }
      closePwdDialog();
    } else {
      const code = res && res.code;
      const msg = code === 'current_password_wrong'
        ? '当前密码错误'
        : code === 'invalid_password'
          ? '密码格式无效'
          : '操作失败，请重试';
      setPwdDialogStatus(msg, 'error');
    }
  } catch (err) {
    console.error('[Settings] 密码操作失败:', err);
    setPwdDialogStatus(`操作失败：${err.message || '未知错误'}`, 'error');
  }
}

/**
 * 绑定账户页交互：“你的信息”展开、全名修改、头像更换
 */
function bindAccountPageEvents() {
  const row = document.getElementById('row-your-info');
  const expander = document.getElementById('info-expander');

  if (row && expander) {
    const toggle = () => {
      const open = expander.classList.toggle('open');
      row.classList.toggle('expanded', open);
      row.setAttribute('aria-expanded', String(open));
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  // 全名（昵称）更改：经 config.updateUser 写回 passwd/shadow，避免被配置监听覆盖
  const btnNick = document.getElementById('btn-change-nickname');
  if (btnNick) {
    btnNick.addEventListener('click', async () => {
      const input = document.getElementById('input-nickname');
      const value = (input.value || '').trim();
      if (!value) {
        setInfoStatus('全名不能为空', 'error');
        return;
      }
      if (value === (state.account.nickname || state.account.username)) {
        setInfoStatus('全名未变化', 'error');
        return;
      }
      btnNick.disabled = true;
      try {
        const res = await window.electronAPI.config.updateUser(state.account.userId, { nickname: value });
        if (res && res.username === value) {
          state.account.nickname = value;
          state.account.username = value;
          renderAccountInfo();
          setInfoStatus('已保存，并同步到系统账户', 'success');
        } else {
          setInfoStatus('保存失败，请重试', 'error');
        }
      } catch (err) {
        console.error('[Settings] 修改全名失败:', err);
        setInfoStatus(`保存失败：${err.message || '未知错误'}`, 'error');
      } finally {
        btnNick.disabled = false;
      }
    });
  }

  // 更换头像
  const btnAvatar = document.getElementById('btn-change-avatar');
  if (btnAvatar) {
    btnAvatar.addEventListener('click', async () => {
      try {
        const filePath = await window.electronAPI.dialog.selectImage();
        if (!filePath) return;
        const res = await window.electronAPI.config.updateUser(state.account.userId, { photo: filePath });
        if (res) {
          state.account.avatar = filePath;
          renderAccountInfo();
          setInfoStatus('头像已更新', 'success');
        } else {
          setInfoStatus('头像更新失败', 'error');
        }
      } catch (err) {
        console.error('[Settings] 更换头像失败:', err);
        setInfoStatus(`更换头像失败：${err.message || '未知错误'}`, 'error');
      }
    });
  }

  // 清除头像
  const btnClearAvatar = document.getElementById('btn-clear-avatar');
  if (btnClearAvatar) {
    btnClearAvatar.addEventListener('click', async () => {
      if (!state.account.avatar) return;
      try {
        const res = await window.electronAPI.config.updateUser(state.account.userId, { photo: null });
        if (res) {
          state.account.avatar = null;
          renderAccountInfo();
          setInfoStatus('头像已清除', 'success');
        } else {
          setInfoStatus('头像清除失败', 'error');
        }
      } catch (err) {
        console.error('[Settings] 清除头像失败:', err);
        setInfoStatus(`清除头像失败：${err.message || '未知错误'}`, 'error');
      }
    });
  }

  // 登录选项：展开/收起
  const loginRow = document.getElementById('row-login-options');
  const loginExpander = document.getElementById('login-expander');
  if (loginRow && loginExpander) {
    const toggle = () => {
      const open = loginExpander.classList.toggle('open');
      loginRow.classList.toggle('expanded', open);
      loginRow.setAttribute('aria-expanded', String(open));
    };
    loginRow.addEventListener('click', toggle);
    loginRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  // 密码开关：点击后打开对应模式的悬浮窗
  const pwdToggle = document.getElementById('btn-pwd-toggle');
  if (pwdToggle) {
    pwdToggle.addEventListener('click', () => {
      openPwdDialog(state.account.hasPassword ? 'close' : 'enable');
    });
  }

  // 修改密码入口（仅密码开启时可见）：打开三字段悬浮窗
  const pwdChangeRow = document.getElementById('row-pwd-change');
  if (pwdChangeRow) {
    const openChange = () => openPwdDialog('change');
    pwdChangeRow.addEventListener('click', openChange);
    pwdChangeRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openChange();
      }
    });
  }

  // 密码悬浮窗：取消 / 确认 / ESC / Enter 快捷提交
  document.getElementById('pwd-dialog-cancel').addEventListener('click', closePwdDialog);
  document.getElementById('pwd-dialog-confirm').addEventListener('click', submitPwdDialog);
  document.getElementById('pwd-dialog-close').addEventListener('click', () => submitPwdDialog('close'));
  document.getElementById('pwd-dialog-overlay').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePwdDialog();
    }
  });
  ['pwd-dialog-current', 'pwd-dialog-new', 'pwd-dialog-repeat'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitPwdDialog();
        }
      });
    }
  });

  // 密码显示/隐藏切换（输入框内部右侧的眼睛按钮，各自独立）
  document.querySelectorAll('.pwd-reveal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.classList.toggle('showing', !showing);
      btn.setAttribute('aria-pressed', String(!showing));
      btn.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
      input.focus();
    });
  });

  // 其他账户行：进入高级管理页
  const otherAccountsRow = document.getElementById('row-other-accounts');
  if (otherAccountsRow) {
    const openAdmin = () => navigateTo('admin');
    otherAccountsRow.addEventListener('click', openAdmin);
    otherAccountsRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAdmin();
      }
    });
  }

  // 新建用户按钮：打开独立窗口
  const adminNewBtn = document.getElementById('btn-admin-new');
  if (adminNewBtn) {
    adminNewBtn.addEventListener('click', () => {
      window.electronAPI.userForm.show();
    });
  }

  // 高级管理：新建用户成功后刷新列表
  if (window.electronAPI.admin && window.electronAPI.admin.onRefresh) {
    window.electronAPI.admin.onRefresh(() => {
      loadAdminUsers();
    });
  }
}

/* ============================================================
   高级管理（其他用户）：列表 / 展开查看 / 内嵌编辑 / 删除
   ============================================================ */
const ADMIN_ICONS = {
  pencil: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
};

function resetAdminRowStates() {
  adminRowState.clear();
}

function getAdminRowState(user) {
  let st = adminRowState.get(user.userid);
  if (!st) {
    st = { expanded: false, editing: false, pendingDelete: false };
    adminRowState.set(user.userid, st);
  }
  return st;
}

function adminDisplayName(user) {
  const nick = user.username || '用户';
  const login = user.loginName || '';
  return login && login !== nick ? `${nick} (${login})` : nick;
}

function permissionLabel(p) {
  if (p === 'root') return 'root（管理员）';
  if (p === 'sudo') return 'sudo（管理员）';
  return 'user（用户）';
}

async function loadAdminUsers() {
  try {
    adminUsers = (await window.electronAPI.config.getUsers()) || [];
  } catch (err) {
    console.error('[Admin] 加载用户列表失败:', err);
    adminUsers = [];
  }
  renderAdminList();
}

function renderAdminList() {
  const container = document.getElementById('admin-user-list');
  if (!container) return;
  container.innerHTML = '';
  adminUsers.forEach((u) => container.appendChild(createAdminRow(u)));
}

function adminIconBtn(kind, icon, disabled) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `admin-icon-btn ${kind}`;
  btn.innerHTML = icon;
  if (disabled) btn.disabled = true;
  return btn;
}

function adminDetailLine(label, valueEl) {
  const line = document.createElement('div');
  line.className = 'admin-detail-line';
  const labelEl = document.createElement('span');
  labelEl.className = 'admin-detail-label';
  labelEl.textContent = label;
  line.appendChild(labelEl);
  line.appendChild(valueEl);
  return line;
}

function adminDetailText(text) {
  const span = document.createElement('span');
  span.className = 'admin-detail-value';
  span.textContent = text;
  return span;
}

function createAdminRow(user) {
  const st = getAdminRowState(user);
  const row = document.createElement('div');
  row.className = 'admin-user';
  row.dataset.userId = user.userid;

  // 头部：头像 + 名称 + 操作按钮
  const head = document.createElement('div');
  head.className = 'admin-user-head';

  const avatar = document.createElement('span');
  avatar.className = 'admin-user-avatar';
  avatar.innerHTML = user.photo
    ? `<img src="${user.photo}" alt="">`
    : '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

  const nameEl = document.createElement('span');
  nameEl.className = 'admin-user-name';
  nameEl.textContent = adminDisplayName(user);

  const actions = document.createElement('span');
  actions.className = 'admin-user-actions';
  if (st.pendingDelete) {
    const confirm = document.createElement('span');
    confirm.className = 'admin-delete-confirm';
    confirm.textContent = '是否确认删除？';
    const yes = adminIconBtn('yes', ADMIN_ICONS.check);
    yes.title = '确认删除';
    yes.addEventListener('click', (e) => {
      e.stopPropagation();
      doDeleteUser(user);
    });
    const no = adminIconBtn('no', ADMIN_ICONS.cross);
    no.title = '取消';
    no.addEventListener('click', (e) => {
      e.stopPropagation();
      st.pendingDelete = false;
      renderAdminList();
    });
    confirm.appendChild(yes);
    confirm.appendChild(no);
    actions.appendChild(confirm);
  } else {
    const editBtn = adminIconBtn('edit', ADMIN_ICONS.pencil);
    editBtn.title = '修改';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      st.expanded = true;
      st.editing = true;
      renderAdminList();
    });
    const delBtn = adminIconBtn('delete', ADMIN_ICONS.trash);
    delBtn.title = '删除';
    // 当前用户与 root 禁止删除
    delBtn.disabled = user.userid === 0 || user.userid === state.account.userId;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      st.pendingDelete = true;
      renderAdminList();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
  }

  head.appendChild(avatar);
  head.appendChild(nameEl);
  head.appendChild(actions);
  head.addEventListener('click', () => {
    st.expanded = !st.expanded;
    if (!st.expanded) {
      // 收起：未保存编辑丢弃、删除确认默认取消
      st.editing = false;
      st.pendingDelete = false;
    }
    renderAdminList();
  });
  row.appendChild(head);

  if (st.expanded) {
    row.appendChild(createAdminDetail(user, st));
  }
  return row;
}

function createAdminDetail(user, st) {
  const detail = document.createElement('div');
  detail.className = 'admin-user-detail';

  if (!st.editing) {
    // 查看模式：展示 login 字段内容
    detail.appendChild(adminDetailLine('用户名', adminDetailText(user.loginName || '-')));
    detail.appendChild(adminDetailLine('用户编号', adminDetailText(String(user.userid))));
    detail.appendChild(adminDetailLine('全名', adminDetailText(user.username || '-')));
    detail.appendChild(adminDetailLine('权限', adminDetailText(permissionLabel(user.permi))));

    const pwdValue = document.createElement('span');
    pwdValue.className = `admin-pwd-status${user.hasPassword ? '' : ' off'}`;
    pwdValue.textContent = user.hasPassword ? '已开启（点击修改）' : '已关闭（点击设置）';
    pwdValue.style.cursor = 'pointer';
    pwdValue.title = '修改该用户密码';
    pwdValue.addEventListener('click', () => {
      openPwdDialog('admin', {
        userId: user.userid,
        nickname: user.username,
        hasPassword: user.hasPassword,
      });
    });
    detail.appendChild(adminDetailLine('密码状态', pwdValue));
    return detail;
  }

  // 编辑模式：字段变为可编辑控件
  const loginInput = document.createElement('input');
  loginInput.className = 'win-textbox';
  loginInput.type = 'text';
  loginInput.value = user.loginName || '';
  loginInput.autocomplete = 'off';
  loginInput.spellcheck = false;
  detail.appendChild(adminDetailLine('用户名', loginInput));
  // 修改用户名的严重性警告（红字）
  const usernameWarn = document.createElement('div');
  usernameWarn.className = 'admin-username-warning';
  usernameWarn.textContent = '警告：修改用户名会改变登录名并迁移 home 目录，请谨慎操作';
  detail.appendChild(usernameWarn);
  detail.appendChild(adminDetailLine('用户编号', adminDetailText(String(user.userid))));

  const nickInput = document.createElement('input');
  nickInput.className = 'win-textbox';
  nickInput.type = 'text';
  nickInput.value = user.username || '';
  nickInput.autocomplete = 'off';
  nickInput.spellcheck = false;
  detail.appendChild(adminDetailLine('全名', nickInput));

  // WinUI 风格权限下拉（root 锁定）
  const permOptions = [
    { value: 'user', label: 'user（用户）' },
    { value: 'sudo', label: 'sudo（管理员）' },
  ];
  if (user.permi === 'root') {
    permOptions.unshift({ value: 'root', label: 'root（管理员）' });
  }
  const permCombo = createWinComboBox(
    permOptions,
    user.permi === 'root' ? 'root' : (user.permi === 'sudo' ? 'sudo' : 'user'),
    { ariaLabel: '权限', disabled: user.permi === 'root' }
  );
  detail.appendChild(adminDetailLine('权限', permCombo.el));

  const pwdValue = document.createElement('span');
  pwdValue.className = `admin-pwd-status${user.hasPassword ? '' : ' off'}`;
  pwdValue.textContent = user.hasPassword ? '已开启（点击修改）' : '已关闭（点击设置）';
  pwdValue.style.cursor = 'pointer';
  pwdValue.title = '修改该用户密码';
  pwdValue.addEventListener('click', () => {
    openPwdDialog('admin', {
      userId: user.userid,
      nickname: user.username,
      hasPassword: user.hasPassword,
    });
  });
  detail.appendChild(adminDetailLine('密码状态', pwdValue));

  const statusEl = document.createElement('div');
  statusEl.className = 'admin-row-status';
  detail.appendChild(statusEl);

  const actions = document.createElement('div');
  actions.className = 'admin-detail-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'win-btn';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => {
    st.editing = false;
    renderAdminList();
  });
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'win-btn AccentButtonStyle';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', () => {
    saveAdminEdit(user, st, { loginInput, nickInput, permCombo, statusEl, saveBtn });
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  detail.appendChild(actions);

  return detail;
}

async function saveAdminEdit(user, st, els) {
  const username = els.loginInput.value.trim();
  const nickname = els.nickInput.value.trim();
  if (!username || !nickname) {
    els.statusEl.textContent = '用户名和全名不能为空';
    els.statusEl.className = 'admin-row-status error';
    return;
  }

  const updates = {};
  if (username !== user.loginName) updates.username = username;
  if (nickname !== user.username) updates.nickname = nickname;
  if (user.permi !== 'root' && els.permCombo.getValue() !== user.permi) {
    updates.permi = els.permCombo.getValue();
  }

  if (Object.keys(updates).length === 0) {
    st.editing = false;
    renderAdminList();
    return;
  }

  els.saveBtn.disabled = true;
  try {
    const res = await window.electronAPI.config.updateUser(user.userid, updates);
    if (res) {
      st.editing = false;
      await loadAdminUsers();
    } else {
      els.statusEl.textContent = '保存失败：用户名或全名与现有用户冲突';
      els.statusEl.className = 'admin-row-status error';
    }
  } catch (err) {
    console.error('[Admin] 保存修改失败:', err);
    els.statusEl.textContent = `保存失败：${err.message || '未知错误'}`;
    els.statusEl.className = 'admin-row-status error';
  } finally {
    els.saveBtn.disabled = false;
  }
}

async function doDeleteUser(user) {
  try {
    await window.electronAPI.config.deleteUser(user.userid);
    adminRowState.delete(user.userid);
    await loadAdminUsers();
  } catch (err) {
    console.error('[Admin] 删除用户失败:', err);
  }
}

/* ============================================================
   已安装的应用：列表 / 行内隐藏与卸载
   ============================================================ */
const INSTALLED_ICONS = {
  more: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
};

function getInstalledRowState(appName) {
  let st = installedRowState.get(appName);
  if (!st) {
    st = { expanded: false, pendingUninstall: false };
    installedRowState.set(appName, st);
  }
  return st;
}

async function loadInstalledApps() {
  try {
    const res = await window.electronAPI.apps.listInstalled(state.account.userId);
    installedApps = (res && res.apps) || [];
  } catch (err) {
    console.error('[Apps] 加载已安装应用失败:', err);
    installedApps = [];
  }
  renderInstalledApps();
}

function renderInstalledApps() {
  const container = document.getElementById('installed-apps-list');
  if (!container) return;
  container.innerHTML = '';
  if (installedApps.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:56px 16px"><div class="empty-desc">未检测到已安装的应用</div></div>';
    return;
  }
  installedApps.forEach((app) => container.appendChild(createInstalledAppRow(app)));
}

function createInstalledAppRow(app) {
  const st = getInstalledRowState(app.appName);
  const row = document.createElement('div');
  row.className = 'installed-app' + (st.expanded ? ' expanded' : '');
  row.dataset.app = app.appName;

  const head = document.createElement('div');
  head.className = 'installed-app-head';

  const icon = document.createElement('img');
  icon.className = 'installed-app-icon';
  icon.src = app.icon || '../difproico.png';
  icon.onerror = () => { icon.src = '../difproico.png'; };

  const info = document.createElement('div');
  info.className = 'installed-app-info';
  const nameLine = document.createElement('div');
  nameLine.className = 'installed-app-name';
  nameLine.textContent = app.name;
  if (app.system) {
    const tag = document.createElement('span');
    tag.className = 'app-tag system';
    tag.textContent = '系统';
    nameLine.appendChild(tag);
  }
  if (app.hidden) {
    const tag = document.createElement('span');
    tag.className = 'app-tag hidden';
    tag.textContent = '已隐藏';
    nameLine.appendChild(tag);
  }
  const verLine = document.createElement('div');
  verLine.className = 'installed-app-version';
  verLine.textContent = app.version ? `v${app.version}` : '';
  info.appendChild(nameLine);
  info.appendChild(verLine);

  // 右侧：折叠时 ⋮；展开时 隐藏/卸载/X；待确认时替换为确认文案
  const actions = document.createElement('span');
  actions.className = 'installed-app-actions';

  const toggleHead = () => {
    st.expanded = !st.expanded;
    if (!st.expanded) st.pendingUninstall = false;
    renderInstalledApps();
  };

  if (st.pendingUninstall) {
    const confirm = document.createElement('span');
    confirm.className = 'installed-app-uninstall-confirm';
    confirm.textContent = '确认卸载？';
    const yes = adminIconBtn('yes', ADMIN_ICONS.check);
    yes.title = '确认卸载';
    yes.addEventListener('click', (e) => {
      e.stopPropagation();
      doUninstall(app, row);
    });
    const no = adminIconBtn('no', ADMIN_ICONS.cross);
    no.title = '取消';
    no.addEventListener('click', (e) => {
      e.stopPropagation();
      st.pendingUninstall = false;
      renderInstalledApps();
    });
    confirm.appendChild(yes);
    confirm.appendChild(no);
    actions.appendChild(confirm);
  } else if (st.expanded) {
    const eye = adminIconBtn('hide', app.hidden ? INSTALLED_ICONS.eyeOff : INSTALLED_ICONS.eye);
    eye.title = app.hidden ? '解除隐藏' : '隐藏';
    eye.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHidden(app, !app.hidden);
    });
    const del = adminIconBtn('delete', ADMIN_ICONS.trash, app.system);
    del.title = app.system ? '系统应用不可卸载' : '卸载';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (app.system) return;
      st.pendingUninstall = true;
      renderInstalledApps();
    });
    const close = adminIconBtn('close', INSTALLED_ICONS.close);
    close.title = '收起';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHead();
    });
    actions.appendChild(eye);
    actions.appendChild(del);
    actions.appendChild(close);
  }

  head.appendChild(icon);
  head.appendChild(info);
  if (st.pendingUninstall || st.expanded) {
    head.appendChild(actions);
  } else {
    const more = document.createElement('span');
    more.className = 'installed-app-more';
    more.innerHTML = INSTALLED_ICONS.more;
    more.title = '更多操作';
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      st.expanded = true;
      renderInstalledApps();
    });
    head.appendChild(more);
  }
  row.appendChild(head);
  return row;
}

async function toggleHidden(app, hidden) {
  try {
    const res = await window.electronAPI.apps.setHidden(state.account.userId, app.appName, hidden);
    // 以返回列表为准：解除隐藏后该应用应不在列表中（!![] 恒真的坑）
    app.hidden = (res.hiddenApps || []).some(
      (h) => h.toLowerCase() === String(app.appName).toLowerCase()
    );
    renderInstalledApps();
  } catch (err) {
    console.error('[Apps] 设置隐藏失败:', err);
  }
}

async function doUninstall(app) {
  try {
    const res = await window.electronAPI.apps.uninstall(app.appName);
    if (res && res.success) {
      installedRowState.delete(app.appName);
      await loadInstalledApps();
    } else {
      alert(`卸载失败：${(res && res.error) || '未知错误'}`);
      const st = getInstalledRowState(app.appName);
      st.pendingUninstall = false;
      renderInstalledApps();
    }
  } catch (err) {
    console.error('[Apps] 卸载失败:', err);
    alert(`卸载失败：${err.message || '未知错误'}`);
    const st = getInstalledRowState(app.appName);
    st.pendingUninstall = false;
    renderInstalledApps();
  }
}

/* ============================================================
   窗口控制
   ============================================================ */
function setupWindowControls() {
  const act = (action) => window.electronAPI.settings.windowAction(action);
  document.getElementById('btn-min').addEventListener('click', () => act('minimize'));
  document.getElementById('btn-max').addEventListener('click', () => act('maximize'));
  document.getElementById('btn-restore').addEventListener('click', () => act('maximize'));
  document.getElementById('btn-close').addEventListener('click', () => act('close'));

  window.electronAPI.settings.onMaximized((maximized) => {
    document.getElementById('btn-max').classList.toggle('hidden', maximized);
    document.getElementById('btn-restore').classList.toggle('hidden', !maximized);
  });
}

/* ============================================================
   初始化
   ============================================================ */
function init() {
  buildNav();
  buildSwatches();
  setupWindowControls();
  applyTheme();
  navigateTo('home');

  // 导航点击 / 键盘方向键
  document.getElementById('nav-list').addEventListener('keydown', (e) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const items = [...document.querySelectorAll('.nav-item:not(.hidden)')];
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement);
    let next = 0;
    if (e.key === 'ArrowDown') next = Math.min(idx + 1, items.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(idx - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    items[next].focus();
  });

  // 查找设置
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => applySearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchActive) {
      const first = document.querySelector('.nav-item:not(.hidden)');
      if (first) {
        first.click();
        searchInput.value = '';
        applySearch('');
      }
    }
    if (e.key === 'Escape') {
      searchInput.value = '';
      applySearch('');
      searchInput.blur();
    }
  });

  // 主页：WiFi 行 / 推荐设置跳转
  const wifiRow = document.getElementById('wifi-row');
  wifiRow.addEventListener('click', () => navigateTo('network'));
  wifiRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateTo('network');
    }
  });
  document.querySelectorAll('.reco-row').forEach((row) => {
    const goto = () => navigateTo(row.dataset.goto);
    row.addEventListener('click', goto);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goto();
      }
    });
  });

  // 返回主页
  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('home'));
  });

  // 高级管理返回账户页
  document.querySelectorAll('[data-back-accounts]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('accounts'));
  });

  // 应用页：已安装的应用入口 + 返回
  const installedAppsRow = document.getElementById('row-installed-apps');
  if (installedAppsRow) {
    const openInstalled = () => navigateTo('apps-installed');
    installedAppsRow.addEventListener('click', openInstalled);
    installedAppsRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openInstalled();
      }
    });
  }
  document.querySelectorAll('[data-back-apps]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('apps'));
  });

  // 应用页：安装新软件（打开包管理器 pacman）
  const installSoftwareRow = document.getElementById('row-install-software');
  if (installSoftwareRow) {
    const openPacman = async () => {
      try {
        const res = await window.electronAPI.app.launch('com.pacman.app');
        if (!res || !res.success) {
          alert(`打开包管理器失败：${(res && res.error) || '未知错误'}`);
        }
      } catch (err) {
        console.error('[Apps] 打开包管理器失败:', err);
        alert(`打开包管理器失败：${err.message || '未知错误'}`);
      }
    };
    installSoftwareRow.addEventListener('click', openPacman);
    installSoftwareRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPacman();
      }
    });
  }

  // 账户卡片
  document.getElementById('account-card').addEventListener('click', () => navigateTo('accounts'));

  // 个性化：主题
  document.querySelectorAll('#theme-options .option-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.theme = btn.dataset.theme;
      applyTheme();
      sendChange({ type: 'theme', value: state.theme });
    });
  });

  // 个性化：任务栏
  document.querySelectorAll('#taskbar-options .option-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.isTaskbarFloating = btn.dataset.taskbar === 'floating';
      applyTheme();
      sendChange({ type: 'taskbarMode', value: state.isTaskbarFloating });
    });
  });

  // 个性化：自定义颜色
  document.getElementById('accent-input').addEventListener('input', (e) => {
    state.accentColor = e.target.value;
    applyTheme();
  });
  document.getElementById('accent-input').addEventListener('change', (e) => {
    sendChange({ type: 'accentColor', value: e.target.value });
  });

  // 个性化：背景
  document.getElementById('btn-bg-pick').addEventListener('click', async () => {
    try {
      const filePath = await window.electronAPI.dialog.selectImage();
      if (!filePath) return;
      const bgUrl = 'file:///' + filePath.replace(/\\/g, '/');
      applyBackgroundToPreview(bgUrl);
      sendChange({ type: 'desktopBackground', value: bgUrl });
    } catch (err) {
      console.error('[Settings] 选择背景失败:', err);
    }
  });
  document.getElementById('btn-bg-clear').addEventListener('click', () => {
    applyBackgroundToPreview(null);
    sendChange({ type: 'desktopBackground', value: null });
  });

  // 个性化：登录背景（持久化到 profile.loginbg）
  document.getElementById('btn-login-bg-pick').addEventListener('click', async () => {
    try {
      const filePath = await window.electronAPI.dialog.selectImage();
      if (!filePath) return;
      const bgUrl = 'file:///' + filePath.replace(/\\/g, '/');
      state.loginBackground = bgUrl;
      applyLoginBgPreview();
      await window.electronAPI.config.setBackground(bgUrl, state.account.userId);
      setInfoStatus('登录背景已更新', 'success');
    } catch (err) {
      console.error('[Settings] 设置登录背景失败:', err);
    }
  });
  document.getElementById('btn-login-bg-clear').addEventListener('click', async () => {
    try {
      state.loginBackground = null;
      applyLoginBgPreview();
      await window.electronAPI.config.setBackground(null, state.account.userId);
      setInfoStatus('登录背景已清除', 'success');
    } catch (err) {
      console.error('[Settings] 清除登录背景失败:', err);
    }
  });

  // 重命名对话框
  document.getElementById('btn-rename').addEventListener('click', openRenameDialog);
  document.getElementById('btn-dialog-cancel').addEventListener('click', closeRenameDialog);
  document.getElementById('btn-dialog-ok').addEventListener('click', () => {
    const input = document.getElementById('dialog-input');
    const name = input.value.trim();
    if (name) {
      state.deviceName = name;
      document.getElementById('device-name').textContent = name;
    }
    closeRenameDialog();
  });
  document.getElementById('dialog-overlay').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeRenameDialog();
    }
  });

  // 账户页：“你的信息”展开与修改
  bindAccountPageEvents();

  // 主进程下发主题与账户信息
  window.electronAPI.settings.onTheme((data) => {
    if (data.theme) state.theme = data.theme;
    if (data.accentColor) state.accentColor = data.accentColor;
    if (typeof data.isTaskbarFloating === 'boolean') {
      state.isTaskbarFloating = data.isTaskbarFloating;
    }
    if (data.desktopBackground) applyBackgroundToPreview(data.desktopBackground);
    if (data.loginBackground !== undefined) {
      state.loginBackground = data.loginBackground || null;
      applyLoginBgPreview();
    }
    if (data.deviceName) state.deviceName = data.deviceName;
    if (data.account) {
      state.account = { ...state.account, ...data.account };
      renderAccountInfo();
    }
    applyTheme();
    loadDeviceInfo();
    loadWifiStatus();
  });
}

document.addEventListener('DOMContentLoaded', init);
