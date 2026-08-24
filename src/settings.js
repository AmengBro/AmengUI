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
    id: 'update',
    label: '信息与更新',
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
const SUB_PAGES = ['admin', 'apps-installed', 'storage', 'screen', 'sound', 'notify', 'network-known', 'bluetooth-add'];

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
  displayProfile: 'default',
  notifyApps: true,
  notifySystem: true,
  notifyDnd: false,
  time24h: true,
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
  // 离开“时间和语言”：停止实时时钟定时器
  if (prevPage === 'time' && id !== 'time') {
    stopTimeTick();
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
  if (id === 'storage') {
    loadStorage();
  }
  if (id === 'screen') {
    loadScreen();
  }
  if (id === 'sound') {
    loadSound();
  }
  if (id === 'notify') {
    loadNotify();
  }
  if (id === 'network') {
    loadNetwork();
  }
  if (id === 'network-known') {
    loadKnownNetworks();
  }
  if (id === 'bluetooth') {
    loadBluetooth();
  }
  if (id === 'bluetooth-add') {
    loadBtAdd();
  }
  if (id === 'time') {
    loadTime();
  }
  if (id === 'update') {
    loadAbout();
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
   存储：磁盘空间 / 快速清理
   ============================================================ */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function loadStorage() {
  const drivesEl = document.getElementById('storage-drives');
  if (!drivesEl) return;
  drivesEl.innerHTML = '<div class="empty-desc" style="padding:16px 0">正在读取磁盘信息…</div>';
  try {
    const res = await window.electronAPI.storage.getDrives();
    renderDrives((res && res.drives) || []);
  } catch (err) {
    console.error('[Storage] 读取磁盘失败:', err);
    drivesEl.innerHTML = '<div class="empty-desc" style="padding:16px 0">读取磁盘信息失败</div>';
  }
}

function renderDrives(drives) {
  const el = document.getElementById('storage-drives');
  if (!el) return;
  el.innerHTML = '';
  if (!drives.length) {
    el.innerHTML = '<div class="empty-desc" style="padding:16px 0">未检测到磁盘</div>';
    return;
  }
  drives.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'storage-drive';

    const icon = document.createElement('span');
    icon.className = 'storage-drive-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16zM6 7h12v2H6V7zm0 4h12v2H6v-2zm0 4h8v2H6v-2z"/></svg>';

    const info = document.createElement('div');
    info.className = 'storage-drive-info';
    const letter = document.createElement('div');
    letter.className = 'storage-drive-letter';
    // 优先显示虚拟根挂载点（如 /media/c），无映射时退回盘符
    letter.textContent = d.mount || d.letter;
    const label = document.createElement('div');
    label.className = 'storage-drive-label';
    label.textContent = d.mount
      ? `${d.letter} ${d.label || '本地磁盘'}`
      : (d.label || '本地磁盘');
    info.appendChild(letter);
    info.appendChild(label);

    const barWrap = document.createElement('div');
    barWrap.className = 'storage-drive-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'storage-drive-bar';
    const pct = d.size > 0 ? (d.used / d.size) * 100 : 0;
    bar.style.width = `${Math.min(100, pct)}%`;
    if (pct >= 90) bar.classList.add('full');
    else if (pct >= 70) bar.classList.add('high');
    barWrap.appendChild(bar);

    const text = document.createElement('div');
    text.className = 'storage-drive-text';
    text.textContent = `${formatBytes(d.freeSpace)} 可用 · 共 ${formatBytes(d.size)}`;

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(barWrap);
    row.appendChild(text);
    el.appendChild(row);
  });
}

async function runQuickCleanup() {
  const btn = document.getElementById('btn-quick-clean');
  const status = document.getElementById('cleanup-status');
  if (!btn || !status) return;
  btn.disabled = true;
  status.textContent = '正在清理…';
  status.className = 'cleanup-status';
  try {
    const res = await window.electronAPI.storage.quickCleanup();
    if (res && res.success) {
      status.textContent = `已释放 ${formatBytes(res.freedBytes)}`;
      status.className = 'cleanup-status success';
      window.electronAPI.storage.getDrives().then((r) => renderDrives((r && r.drives) || []));
    } else {
      status.textContent = '清理失败';
      status.className = 'cleanup-status error';
    }
  } catch (err) {
    console.error('[Storage] 快速清理失败:', err);
    status.textContent = '清理失败';
    status.className = 'cleanup-status error';
  } finally {
    btn.disabled = false;
  }
}

async function loadCleanupAdvice() {
  const list = document.getElementById('cleanup-advice-list');
  if (!list) return;
  try {
    const res = await window.electronAPI.storage.getCleanupTargets();
    const targets = (res && res.targets) || [];
    list.innerHTML = '';
    if (!targets.length) {
      list.innerHTML = '<div class="cleanup-target"><span class="cleanup-target-path">没有可清理的临时目录</span></div>';
      return;
    }
    targets.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'cleanup-target';
      const pathEl = document.createElement('span');
      pathEl.className = 'cleanup-target-path';
      pathEl.textContent = t.path;
      const labelEl = document.createElement('span');
      labelEl.className = 'cleanup-target-label';
      labelEl.textContent = t.label;
      row.appendChild(pathEl);
      row.appendChild(labelEl);
      list.appendChild(row);
    });
  } catch (err) {
    console.error('[Storage] 读取清理建议失败:', err);
  }
}

/* ============================================================
   屏幕 / 声音 / 通知
   ============================================================ */
const DISPLAY_PROFILE_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'warm', label: '暖光' },
  { value: 'cool', label: '冷光' },
];

const VOLUME_ON_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
const VOLUME_OFF_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';

const MONITOR_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/></svg>';

function bindWinSlider(sliderId, valueId, onCommit) {
  const slider = document.getElementById(sliderId);
  const valueEl = document.getElementById(valueId);
  if (!slider || !valueEl) return null;
  slider.addEventListener('input', () => { valueEl.textContent = `${slider.value}%`; });
  slider.addEventListener('change', () => {
    const v = parseInt(slider.value, 10);
    valueEl.textContent = `${v}%`;
    if (onCommit) onCommit(v);
  });
  return {
    set(v) {
      slider.value = v;
      valueEl.textContent = `${v}%`;
    },
  };
}

async function loadScreen() {
  // 显示器列表
  const displaysEl = document.getElementById('screen-displays');
  displaysEl.innerHTML = '<div class="empty-desc" style="padding:16px 0">正在读取显示器信息…</div>';
  try {
    const res = await window.electronAPI.system.getDisplays();
    renderDisplays((res && res.displays) || []);
  } catch (err) {
    console.error('[Screen] 读取显示器失败:', err);
    displaysEl.innerHTML = '<div class="empty-desc" style="padding:16px 0">读取显示器信息失败</div>';
  }

  // 亮度（能力探测，PE 无 WMI 亮度时隐藏）
  const brightnessCard = document.getElementById('brightness-card');
  const brightnessHint = document.getElementById('brightness-hint');
  try {
    const caps = await window.electronAPI.system.getCapabilities();
    const supported = !!(caps && (caps.brightness || caps.isLaptop));
    brightnessCard.classList.toggle('hidden', !supported);
    brightnessHint.classList.toggle('hidden', supported);
    if (supported) {
      const slider = bindWinSlider('brightness-slider', 'brightness-value', (v) => {
        window.electronAPI.system.setBrightness(v).catch(() => {});
      });
      const r = await window.electronAPI.system.getBrightness();
      if (r && r.success && typeof r.brightness === 'number' && r.brightness >= 0) slider.set(r.brightness);
    }
  } catch (err) {
    brightnessCard.classList.add('hidden');
    brightnessHint.classList.remove('hidden');
  }

  // 夜间模式（注册表不可用时置灰）
  const nightHost = document.getElementById('night-switch-host');
  nightHost.innerHTML = '';
  let nightSw = createWinSwitch({ checked: false, ariaLabel: '夜间模式' });
  try {
    const r = await window.electronAPI.system.getNightMode();
    if (r && r.supported) {
      nightSw.setChecked(!!r.enabled);
      nightSw.el.addEventListener('click', () => {
        window.electronAPI.system.setNightMode(nightSw.checked);
      });
    } else {
      nightSw.el.disabled = true;
    }
  } catch (err) {
    nightSw.el.disabled = true;
  }
  nightHost.appendChild(nightSw.el);

  // 显示器配置文件
  const profileHost = document.getElementById('display-profile-host');
  profileHost.innerHTML = '';
  const profileCombo = createWinComboBox(DISPLAY_PROFILE_OPTIONS, state.displayProfile, {
    ariaLabel: '显示器配置文件',
    onChange: (v) => {
      state.displayProfile = v;
      window.electronAPI.config.setDisplayProfile(v, state.account.userId);
    },
  });
  profileHost.appendChild(profileCombo.el);
}

function renderDisplays(displays) {
  const el = document.getElementById('screen-displays');
  if (!el) return;
  el.innerHTML = '';
  if (!displays.length) {
    el.innerHTML = '<div class="empty-desc" style="padding:16px 0">未检测到显示器</div>';
    return;
  }
  displays.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'screen-display';
    const icon = document.createElement('span');
    icon.className = 'screen-display-icon';
    icon.innerHTML = MONITOR_ICON;
    const info = document.createElement('div');
    info.className = 'screen-display-info';
    const name = document.createElement('div');
    name.className = 'screen-display-name';
    name.textContent = d.primary ? `显示器 ${i + 1}（主）` : `显示器 ${i + 1}`;
    const desc = document.createElement('div');
    desc.className = 'screen-display-desc';
    const scale = Math.round((d.scaleFactor || 1) * 100);
    desc.textContent = `${d.label} · ${scale}%${d.refreshRate ? ` · ${d.refreshRate}Hz` : ''}`;
    info.appendChild(name);
    info.appendChild(desc);
    row.appendChild(icon);
    row.appendChild(info);
    el.appendChild(row);
  });
}

async function loadSound() {
  // 主音量
  const hint = document.getElementById('volume-hint');
  const volumeSlider = document.getElementById('volume-slider');
  const muteBtn = document.getElementById('btn-volume-mute');
  try {
    const r = await window.electronAPI.system.getVolume();
    if (r && r.success && r.volume >= 0) {
      hint.classList.add('hidden');
      const slider = bindWinSlider('volume-slider', 'volume-value', (v) => {
        window.electronAPI.system.setVolume(v);
      });
      slider.set(r.volume);
      muteBtn.classList.toggle('muted', !!r.mute);
      muteBtn.innerHTML = r.mute ? VOLUME_OFF_ICON : VOLUME_ON_ICON;
      muteBtn.title = r.mute ? '取消静音' : '静音';
      muteBtn.addEventListener('click', async () => {
        const next = !muteBtn.classList.contains('muted');
        const res = await window.electronAPI.system.setMute(next);
        if (res && res.success) {
          muteBtn.classList.toggle('muted', next);
          muteBtn.innerHTML = next ? VOLUME_OFF_ICON : VOLUME_ON_ICON;
          muteBtn.title = next ? '取消静音' : '静音';
        }
      });
    } else {
      hint.classList.remove('hidden');
      volumeSlider.disabled = true;
      muteBtn.disabled = true;
    }
  } catch (err) {
    hint.classList.remove('hidden');
    volumeSlider.disabled = true;
    muteBtn.disabled = true;
  }

  // 输出 / 输入设备
  await renderDeviceCombo(
    'output-device-host',
    () => window.electronAPI.system.getAudioDevices(),
    (id) => window.electronAPI.system.setDefaultAudioDevice(id)
  );
  await renderDeviceCombo(
    'input-device-host',
    () => window.electronAPI.system.getInputDevices(),
    (id) => window.electronAPI.system.setDefaultInputDevice(id)
  );

  // 声音设备（音量合成器）
  await renderSessions();
}

async function renderDeviceCombo(hostId, fetchDevices, commit) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';
  try {
    const res = await fetchDevices();
    const devices = (res && res.devices) || [];
    if (!devices.length) {
      host.innerHTML = '<div class="section-hint">无可用设备</div>';
      return;
    }
    const combo = createWinComboBox(
      devices.map((d) => ({ value: d.id, label: d.name })),
      (res && res.defaultId) || (devices[0] && devices[0].id),
      { onChange: (id) => commit(id) }
    );
    host.appendChild(combo.el);
  } catch (err) {
    host.innerHTML = '<div class="section-hint">设备查询失败</div>';
  }
}

async function renderSessions() {
  const list = document.getElementById('sound-sessions');
  const hint = document.getElementById('sessions-hint');
  if (!list) return;
  list.innerHTML = '';
  try {
    const res = await window.electronAPI.system.getAudioSessions();
    const sessions = (res && res.sessions) || [];
    hint.classList.toggle('hidden', sessions.length > 0);
    sessions.forEach((s) => list.appendChild(createSessionRow(s)));
  } catch (err) {
    hint.classList.remove('hidden');
  }
}

function createSessionRow(s) {
  const row = document.createElement('div');
  row.className = 'session-row';

  const icon = document.createElement('span');
  icon.className = 'session-icon';
  icon.innerHTML = s.iconData
    ? `<img src="${s.iconData}" alt="" style="width:24px;height:24px;border-radius:6px;object-fit:cover">`
    : '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>';

  const name = document.createElement('span');
  name.className = 'session-name';
  name.textContent = s.name || `进程 ${s.pid}`;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'win-slider';
  slider.min = 0;
  slider.max = 100;
  slider.value = s.volume || 0;
  slider.setAttribute('aria-label', `${s.name || '会话'} 音量`);

  const value = document.createElement('span');
  value.className = 'session-value';
  value.textContent = `${s.volume || 0}%`;
  slider.addEventListener('input', () => { value.textContent = `${slider.value}%`; });
  slider.addEventListener('change', () => {
    window.electronAPI.system.setSessionVolume(s.pid, parseInt(slider.value, 10));
  });

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'session-mute' + (s.mute ? ' muted' : '');
  muteBtn.title = s.mute ? '取消静音' : '静音';
  muteBtn.innerHTML = s.mute ? VOLUME_OFF_ICON : VOLUME_ON_ICON;
  muteBtn.addEventListener('click', async () => {
    const next = !muteBtn.classList.contains('muted');
    const res = await window.electronAPI.system.setSessionMute(s.pid, next);
    if (res && res.success) {
      muteBtn.classList.toggle('muted', next);
      muteBtn.title = next ? '取消静音' : '静音';
      muteBtn.innerHTML = next ? VOLUME_OFF_ICON : VOLUME_ON_ICON;
    }
  });

  row.appendChild(icon);
  row.appendChild(name);
  row.appendChild(slider);
  row.appendChild(value);
  row.appendChild(muteBtn);
  return row;
}

async function loadNotify() {
  [
    ['notify-apps-host', 'notifyApps', '应用通知'],
    ['notify-system-host', 'notifySystem', '系统通知'],
    ['notify-dnd-host', 'notifyDnd', '请勿打扰'],
  ].forEach(([hostId, key, label]) => {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    const sw = createWinSwitch({
      checked: !!state[key],
      ariaLabel: label,
      onChange: (checked) => {
        state[key] = checked;
        window.electronAPI.config.setNotificationPref(key, checked, state.account.userId);
      },
    });
    host.appendChild(sw.el);
  });

  const statusText = document.getElementById('notify-system-desc');
  if (statusText && window.electronAPI.notify && window.electronAPI.notify.getSystemStatus) {
    window.electronAPI.notify.getSystemStatus().then((status) => {
      if (!statusText || !status) return;
      if (status.status === 'Allowed') statusText.textContent = '接收 Windows 系统通知';
      else if (status.status === 'Denied') statusText.textContent = 'Windows 未授权通知访问';
      else if (status.status === 'Unspecified' || status.status === 'starting') statusText.textContent = '正在请求系统通知访问';
      else statusText.textContent = '当前系统不支持通知读取';
    }).catch(() => {});
  }
}

/* ============================================================
   网络和Internet
   ============================================================ */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const NET_WIFI_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">' +
  '<path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>' +
  '</svg>';
const NET_LOCK_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">' +
  '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/>' +
  '</svg>';
const NET_OPEN_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">' +
  '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>' +
  '</svg>';
const NET_INFO_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">' +
  '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>' +
  '</svg>';

let wifiSwitch = null;
let wifiBusy = false;
let networkStatus = null;
let networkScan = null;
let knownNetworks = [];
let knownConnectedSsid = '';
let knownSortValue = 'pref';
let knownFilterValue = 'all';
let networkDialogMode = 'secured'; // secured | open | visible
let confirmAction = null;

function renderSignalBars(container, signal) {
  const litCount = Math.max(1, Math.min(4, Math.round(((signal || 0) / 100) * 4)));
  for (let i = 0; i < 4; i++) {
    const bar = document.createElement('span');
    if (i < litCount) bar.classList.add('lit');
    container.appendChild(bar);
  }
}

async function loadNetwork() {
  const statusP = window.electronAPI.system.getWifiStatus().catch(() => null);
  const scanP = window.electronAPI.system.scanWifi().catch(() => null);
  const [statusRes, scanRes] = await Promise.all([statusP, scanP]);
  networkStatus = statusRes && statusRes.success !== false ? statusRes : null;
  networkScan = scanRes && scanRes.success !== false ? scanRes : null;
  renderNetworkStatus();
  renderCurrentNetworkCard();
  renderAvailableNetworks();
}

function renderNetworkStatus() {
  const host = document.getElementById('wifi-switch-host');
  const desc = document.getElementById('network-status-desc');
  if (!host || !desc) return;
  if (!wifiSwitch) {
    wifiSwitch = createWinSwitch({
      checked: false,
      ariaLabel: 'WLAN',
      onChange: (checked) => setWifiPower(checked),
    });
    host.appendChild(wifiSwitch.el);
  }
  const status = networkStatus;
  if (!status || status.available === false) {
    desc.textContent = '未检测到无线网卡';
    wifiSwitch.el.disabled = true;
    wifiSwitch.setChecked(false);
    return;
  }
  if (status.hardwareEnabled === false) {
    desc.textContent = 'WiFi 硬件开关已关闭';
    wifiSwitch.el.disabled = true;
    wifiSwitch.setChecked(false);
    return;
  }
  wifiSwitch.el.disabled = wifiBusy;
  const radioEnabled = typeof status.radioEnabled === 'boolean'
    ? status.radioEnabled
    : status.adapterEnabled !== false;
  wifiSwitch.setChecked(radioEnabled);
  if (wifiBusy) {
    desc.textContent = radioEnabled ? '正在关闭…' : '正在开启…';
  } else if (status.connected) {
    desc.textContent = `已连接 ${status.ssid || ''}`;
  } else if (status.connecting) {
    desc.textContent = '正在连接…';
  } else if (!radioEnabled) {
    desc.textContent = 'WiFi 已关闭';
  } else {
    desc.textContent = '未连接';
  }
}

async function setWifiPower(enabled) {
  if (wifiBusy) return;
  wifiBusy = true;
  renderNetworkStatus();
  try {
    await window.electronAPI.system.setWifiPower(enabled);
  } catch (err) {
    console.error('[网络] 切换 WiFi 失败:', err);
  } finally {
    wifiBusy = false;
    await loadNetwork();
  }
}

function renderCurrentNetworkCard() {
  const card = document.getElementById('network-current-card');
  if (!card) return;
  const status = networkStatus;
  if (!status || !status.connected) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  document.getElementById('network-current-name').textContent = status.ssid || '未知网络';
  document.getElementById('network-current-desc').textContent = `已连接,${status.auth || '安全'}`;
}

function renderAvailableNetworks() {
  const list = document.getElementById('available-networks-list');
  const desc = document.getElementById('network-avail-desc');
  if (!list || !desc) return;
  const status = networkStatus;
  const scan = networkScan;
  if (scan && scan.autoConfigOff) {
    desc.textContent = '自动配置已关闭';
    list.innerHTML = '<div class="network-status-msg">自动配置已关闭，无法扫描网络</div>';
    return;
  }
  const networks = (scan && scan.networks) || [];
  desc.textContent = networks.length ? `${networks.length} 个可用网络` : '未扫描到可用网络';
  if (networks.length === 0) {
    if (status && status.radioEnabled === false) {
      list.innerHTML = '<div class="network-status-msg">WiFi 已关闭，开启后可扫描网络</div>';
    } else {
      list.innerHTML = '<div class="network-status-msg">未扫描到可用网络</div>';
    }
    return;
  }
  const connectedSsid = status && status.connected ? status.ssid : '';
  list.innerHTML = '';
  networks.forEach((n) => {
    if (!n.ssid) return;
    const row = document.createElement('div');
    row.className = 'network-row';
    row.dataset.ssid = n.ssid;

    const bars = document.createElement('span');
    bars.className = 'signal-bars';
    renderSignalBars(bars, n.signal);
    row.appendChild(bars);

    const icon = document.createElement('span');
    icon.className = 'network-sec-icon';
    icon.innerHTML = n.secured ? NET_LOCK_ICON : NET_OPEN_ICON;
    row.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'network-name';
    name.textContent = n.ssid;
    name.title = n.ssid;
    row.appendChild(name);

    const isConnected = n.ssid === connectedSsid;
    if (isConnected) {
      const state = document.createElement('span');
      state.className = 'network-state connected';
      state.textContent = '已连接';
      row.appendChild(state);

      const infoBtn = document.createElement('button');
      infoBtn.type = 'button';
      infoBtn.className = 'network-icon-btn';
      infoBtn.title = '属性';
      infoBtn.setAttribute('aria-label', '属性');
      infoBtn.innerHTML = NET_INFO_ICON;
      infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showNetworkProps(n, status);
      });
      row.appendChild(infoBtn);

      const disconnectBtn = document.createElement('button');
      disconnectBtn.type = 'button';
      disconnectBtn.className = 'network-action-btn disconnect';
      disconnectBtn.textContent = '断开';
      disconnectBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        disconnectBtn.disabled = true;
        await window.electronAPI.system.disconnectWifi().catch(() => null);
        await loadNetwork();
      });
      row.appendChild(disconnectBtn);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'network-action-btn connect';
      btn.textContent = '连接';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (n.secured && !n.hasProfile) {
          openNetworkDialog('visible', n.ssid);
        } else {
          connectToNetwork(n.ssid, '', false);
        }
      });
      row.appendChild(btn);
    }
    list.appendChild(row);
  });
}

async function connectToNetwork(ssid, password, hidden) {
  const row = [...document.querySelectorAll('#available-networks-list .network-row')]
    .find((r) => r.dataset.ssid === ssid);
  const btn = row && row.querySelector('.network-action-btn.connect');
  if (btn) {
    btn.textContent = '连接中…';
    btn.disabled = true;
  }
  try {
    const r = await window.electronAPI.system.connectWifi(ssid, password, hidden);
    if (r && r.success) {
      // netsh connect 立即返回，实际关联需要数秒；轮询直到界面同步为"已连接"
      for (let i = 0; i < 12; i++) {
        await sleep(1500);
        const st = await window.electronAPI.system.getWifiStatus().catch(() => null);
        if (st && st.connected) break;
      }
    } else {
      console.warn('[网络] 连接失败:', r);
    }
  } catch (err) {
    console.error('[网络] 连接失败:', err);
  }
  await loadNetwork();
}

function openNetworkDialog(mode, ssid) {
  networkDialogMode = mode;
  const overlay = document.getElementById('network-dialog-overlay');
  const title = document.getElementById('network-dialog-title');
  const ssidWrap = document.getElementById('network-dialog-ssid-wrap');
  const pwdWrap = document.getElementById('network-dialog-pwd-wrap');
  const ssidInput = document.getElementById('network-dialog-ssid');
  const pwdInput = document.getElementById('network-dialog-password');
  const okBtn = document.getElementById('btn-network-dialog-ok');
  ssidInput.value = ssid || '';
  pwdInput.value = '';
  setNetworkDialogStatus('');
  if (mode === 'visible') {
    title.textContent = `连接到 ${ssid}`;
    ssidWrap.classList.add('hidden');
    pwdWrap.classList.remove('hidden');
    okBtn.textContent = '连接';
  } else if (mode === 'open') {
    title.textContent = '连接到其他网络（公开）';
    ssidWrap.classList.remove('hidden');
    pwdWrap.classList.add('hidden');
    okBtn.textContent = '连接';
  } else {
    title.textContent = '连接到其他网络（密码）';
    ssidWrap.classList.remove('hidden');
    pwdWrap.classList.remove('hidden');
    okBtn.textContent = '连接';
  }
  overlay.classList.remove('hidden');
  setTimeout(() => {
    if (ssidWrap.classList.contains('hidden')) pwdInput.focus();
    else ssidInput.focus();
  }, 50);
}

function closeNetworkDialog() {
  document.getElementById('network-dialog-overlay').classList.add('hidden');
  networkDialogMode = 'secured';
}

function setNetworkDialogStatus(message, type) {
  const status = document.getElementById('network-dialog-status');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('hidden', !message);
  status.classList.toggle('success', type === 'success');
  status.classList.toggle('error', type === 'error');
}

async function submitNetworkDialog() {
  const ssidInput = document.getElementById('network-dialog-ssid');
  const pwdInput = document.getElementById('network-dialog-password');
  const okBtn = document.getElementById('btn-network-dialog-ok');
  const ssid = ssidInput.value.trim();
  if (networkDialogMode !== 'visible' && !ssid) {
    setNetworkDialogStatus('请输入网络名称 (SSID)', 'error');
    ssidInput.focus();
    return;
  }
  if (networkDialogMode === 'secured' && !pwdInput.value) {
    setNetworkDialogStatus('请输入密码', 'error');
    pwdInput.focus();
    return;
  }
  okBtn.disabled = true;
  okBtn.textContent = '连接中…';
  setNetworkDialogStatus('');
  try {
    const r = await window.electronAPI.system.connectWifi(ssid, pwdInput.value, networkDialogMode !== 'visible');
    if (r && r.success) {
      setNetworkDialogStatus(`正在连接 ${ssid}…`, 'success');
      for (let i = 0; i < 12; i++) {
        await sleep(1500);
        const st = await window.electronAPI.system.getWifiStatus().catch(() => null);
        if (st && st.connected) break;
      }
      closeNetworkDialog();
      await loadNetwork();
    } else {
      setNetworkDialogStatus(`连接失败：${(r && r.error) || '未知错误'}`, 'error');
    }
  } catch (err) {
    console.error('[网络] 连接失败:', err);
    setNetworkDialogStatus('连接失败，请稍后重试', 'error');
  } finally {
    okBtn.disabled = false;
    okBtn.textContent = '连接';
  }
}

function showNetworkProps(net, status) {
  const list = document.getElementById('props-dialog-list');
  if (!list) return;
  const isConnected = status && status.connected && net.ssid === status.ssid;
  const rows = [
    ['名称', net.ssid || '—'],
    ['状态', isConnected ? '已连接' : '未连接'],
    ['信号', `${net.signal || 0}%`],
    ['认证', net.auth || '—'],
    ['加密', net.encryption || '—'],
    ['配置文件', net.hasProfile ? '已保存' : '未保存'],
  ];
  list.innerHTML = '';
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'props-row';
    const l = document.createElement('span');
    l.className = 'props-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'props-value';
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    list.appendChild(row);
  });
  document.getElementById('props-dialog-title').textContent = `${net.ssid || '网络'} 属性`;
  document.getElementById('props-dialog-overlay').classList.remove('hidden');
}

function closePropsDialog() {
  document.getElementById('props-dialog-overlay').classList.add('hidden');
}

function showConfirmDialog(text, onOk) {
  document.getElementById('confirm-dialog-text').textContent = text;
  confirmAction = onOk;
  document.getElementById('confirm-dialog-overlay').classList.remove('hidden');
}

function closeConfirmDialog() {
  confirmAction = null;
  document.getElementById('confirm-dialog-overlay').classList.add('hidden');
}

async function loadKnownNetworks() {
  const list = document.getElementById('known-network-list');
  if (!list) return;
  list.innerHTML = '<div class="network-status-msg">正在读取已保存的网络…</div>';
  const statusRes = await window.electronAPI.system.getWifiStatus().catch(() => null);
  knownConnectedSsid = statusRes && statusRes.connected ? statusRes.ssid : '';
  try {
    const res = await window.electronAPI.system.getWifiKnownNetworks();
    if (res && res.success === false) throw new Error(res.error || 'unknown');
    knownNetworks = (res && res.networks) || [];
    setKnownListStatus('');
  } catch (err) {
    console.error('[网络] 读取已知网络失败:', err);
    knownNetworks = [];
    setKnownListStatus('读取已知网络失败', 'error');
  }
  renderKnownNetworks();
}

function setKnownListStatus(message, type) {
  const status = document.getElementById('known-list-status');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('hidden', !message);
  status.classList.toggle('success', type === 'success');
  status.classList.toggle('error', type === 'error');
}

function renderKnownNetworks() {
  const list = document.getElementById('known-network-list');
  if (!list) return;
  const searchInput = document.getElementById('known-search');
  const query = (searchInput && searchInput.value || '').trim().toLowerCase();
  let items = knownNetworks.slice();
  if (knownFilterValue === 'connected') {
    items = items.filter((n) => n.ssid === knownConnectedSsid);
  }
  if (query) {
    items = items.filter((n) => String(n.ssid).toLowerCase().includes(query));
  }
  if (knownSortValue === 'name') {
    items.sort((a, b) => String(a.ssid).localeCompare(String(b.ssid), 'zh'));
  }
  list.innerHTML = '';
  if (!knownNetworks.length) {
    list.innerHTML = '<div class="network-status-msg">未找到已保存的网络</div>';
    return;
  }
  if (!items.length) {
    list.innerHTML = '<div class="network-status-msg">没有符合筛选条件的网络</div>';
    return;
  }
  items.forEach((n) => {
    const row = document.createElement('div');
    row.className = 'known-network-row';

    const icon = document.createElement('span');
    icon.className = 'known-network-icon';
    icon.innerHTML = NET_WIFI_ICON;
    row.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'known-network-name';
    name.textContent = n.ssid;
    name.title = n.ssid;
    row.appendChild(name);

    if (n.ssid === knownConnectedSsid) {
      const state = document.createElement('span');
      state.className = 'network-state connected';
      state.textContent = '已连接';
      row.appendChild(state);
    }

    const forgetBtn = document.createElement('button');
    forgetBtn.type = 'button';
    forgetBtn.className = 'known-forget-btn';
    forgetBtn.textContent = '忘记';
    forgetBtn.addEventListener('click', () => forgetKnownNetwork(n.ssid));
    row.appendChild(forgetBtn);

    list.appendChild(row);
  });
}

function forgetKnownNetwork(ssid) {
  showConfirmDialog(`确定忘记网络「${ssid}」吗？忘记后将需要重新输入密码才能连接。`, async () => {
    closeConfirmDialog();
    try {
      const r = await window.electronAPI.system.forgetWifi(ssid);
      if (r && r.success) {
        knownNetworks = knownNetworks.filter((n) => n.ssid !== ssid);
        renderKnownNetworks();
      } else {
        setKnownListStatus(`忘记网络失败：${(r && r.error) || '未知错误'}`, 'error');
        loadKnownNetworks();
      }
    } catch (err) {
      console.error('[网络] 忘记网络失败:', err);
      setKnownListStatus('忘记网络失败，请稍后重试', 'error');
    }
  });
}

async function addKnownNetwork() {
  const ssidInput = document.getElementById('known-add-ssid');
  const pwdInput = document.getElementById('known-add-password');
  const hiddenChk = document.getElementById('known-add-hidden');
  const btn = document.getElementById('btn-add-network');
  const statusEl = document.getElementById('known-add-status');
  if (!ssidInput || !statusEl) return;
  const ssid = ssidInput.value.trim();
  const password = pwdInput ? pwdInput.value : '';
  if (!ssid) {
    statusEl.textContent = '请输入网络名称 (SSID)';
    statusEl.classList.remove('hidden', 'success');
    statusEl.classList.add('error');
    ssidInput.focus();
    return;
  }
  btn.disabled = true;
  statusEl.textContent = '正在添加并连接…';
  statusEl.classList.remove('hidden', 'success', 'error');
  try {
    const r = await window.electronAPI.system.connectWifi(ssid, password, !!(hiddenChk && hiddenChk.checked));
    if (r && r.success) {
      statusEl.textContent = `已添加并连接 ${ssid}`;
      statusEl.classList.add('success');
      ssidInput.value = '';
      if (pwdInput) pwdInput.value = '';
      await loadKnownNetworks();
    } else {
      statusEl.textContent = `添加失败：${(r && r.error) || '未知错误'}`;
      statusEl.classList.add('error');
    }
  } catch (err) {
    console.error('[网络] 添加网络失败:', err);
    statusEl.textContent = '添加失败，请稍后重试';
    statusEl.classList.add('error');
  } finally {
    btn.disabled = false;
  }
}

function bindNetworkPageEvents() {
  const expanderRow = document.getElementById('row-available-networks');
  const expander = document.getElementById('available-networks-expander');
  if (expanderRow && expander) {
    const toggle = () => {
      const open = expander.classList.toggle('open');
      expanderRow.classList.toggle('expanded', open);
      expanderRow.setAttribute('aria-expanded', String(open));
      if (open) loadNetwork();
    };
    expanderRow.addEventListener('click', toggle);
    expanderRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  const manageRow = document.getElementById('row-manage-known');
  if (manageRow) {
    const openKnown = () => navigateTo('network-known');
    manageRow.addEventListener('click', openKnown);
    manageRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openKnown();
      }
    });
  }

  const bindOtherRow = (rowId, mode) => {
    const row = document.getElementById(rowId);
    if (!row) return;
    const open = () => openNetworkDialog(mode);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  };
  bindOtherRow('row-other-secured', 'secured');
  bindOtherRow('row-other-open', 'open');

  const currentRow = document.getElementById('row-network-current');
  if (currentRow) {
    currentRow.addEventListener('click', () => {
      if (networkStatus && networkStatus.connected) {
        showNetworkProps({
          ssid: networkStatus.ssid || '未知网络',
          signal: networkStatus.signal || 0,
          auth: networkStatus.auth || '—',
          encryption: '—',
          hasProfile: true,
        }, networkStatus);
      }
    });
  }

  document.getElementById('btn-network-dialog-cancel').addEventListener('click', closeNetworkDialog);
  document.getElementById('btn-network-dialog-ok').addEventListener('click', submitNetworkDialog);
  document.getElementById('network-dialog-overlay').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeNetworkDialog();
    }
  });
  ['network-dialog-ssid', 'network-dialog-password'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNetworkDialog();
        }
      });
    }
  });

  document.getElementById('btn-props-close').addEventListener('click', closePropsDialog);
  document.getElementById('props-dialog-overlay').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePropsDialog();
    }
  });

  document.getElementById('btn-confirm-cancel').addEventListener('click', closeConfirmDialog);
  document.getElementById('btn-confirm-ok').addEventListener('click', () => {
    if (confirmAction) {
      const fn = confirmAction;
      confirmAction = null;
      fn();
    }
  });
  document.getElementById('confirm-dialog-overlay').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeConfirmDialog();
    }
  });

  const searchInput = document.getElementById('known-search');
  if (searchInput) searchInput.addEventListener('input', renderKnownNetworks);

  const sortHost = document.getElementById('known-sort-host');
  if (sortHost) {
    const sortCombo = createWinComboBox([
      { value: 'pref', label: '偏好' },
      { value: 'name', label: '名称' },
    ], knownSortValue, {
      ariaLabel: '排序依据',
      onChange: (v) => {
        knownSortValue = v;
        renderKnownNetworks();
      },
    });
    sortHost.appendChild(sortCombo.el);
  }

  const filterHost = document.getElementById('known-filter-host');
  if (filterHost) {
    const filterCombo = createWinComboBox([
      { value: 'all', label: '全部' },
      { value: 'connected', label: '已连接' },
    ], knownFilterValue, {
      ariaLabel: '筛选条件',
      onChange: (v) => {
        knownFilterValue = v;
        renderKnownNetworks();
      },
    });
    filterHost.appendChild(filterCombo.el);
  }

  const addBtn = document.getElementById('btn-add-network');
  if (addBtn) addBtn.addEventListener('click', addKnownNetwork);
  ['known-add-ssid', 'known-add-password'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addKnownNetwork();
        }
      });
    }
  });
}

/* ============================================================
   蓝牙和其他设备
   ============================================================ */
const BT_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">' +
  '<path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>' +
  '</svg>';

let btSwitch = null;
let btBusy = false;
let btScanning = false;
let btStatus = null;
let btDevices = [];
let btAddDevices = [];
let btPairTarget = null;

function setBtHint(message, type) {
  const hint = document.getElementById('bt-status-hint');
  if (!hint) return;
  hint.textContent = message || '';
  hint.classList.toggle('hidden', !message);
  hint.classList.toggle('success', type === 'success');
  hint.classList.toggle('error', type === 'error');
}

async function loadBluetooth() {
  const statusP = window.electronAPI.system.getBluetoothStatus().catch(() => null);
  const devP = window.electronAPI.system.getBluetoothDevices().catch(() => null);
  const [statusRes, devRes] = await Promise.all([statusP, devP]);
  btStatus = statusRes && statusRes.success ? statusRes : null;
  btDevices = (devRes && devRes.devices) || [];
  renderBtStatus();
  renderBtDevices();
}

function renderBtStatus() {
  const host = document.getElementById('bt-switch-host');
  const desc = document.getElementById('bt-status-desc');
  const addRow = document.getElementById('row-bt-add');
  const addBtn = document.getElementById('btn-bt-add');
  if (!host || !desc) return;
  if (!btSwitch) {
    btSwitch = createWinSwitch({
      checked: false,
      ariaLabel: '蓝牙',
      onChange: (checked) => setBtPower(checked),
    });
    host.appendChild(btSwitch.el);
  }
  if (!btStatus) {
    desc.textContent = '当前环境不支持蓝牙';
    btSwitch.el.disabled = true;
    btSwitch.setChecked(false);
    if (addRow) addRow.classList.add('is-disabled');
    if (addBtn) addBtn.disabled = true;
    return;
  }
  const enabled = !!btStatus.enabled;
  btSwitch.el.disabled = btBusy;
  btSwitch.setChecked(enabled);
  if (addRow) addRow.classList.toggle('is-disabled', !enabled);
  if (addBtn) addBtn.disabled = !enabled;
  if (btBusy) {
    desc.textContent = enabled ? '正在关闭…' : '正在开启…';
  } else if (enabled) {
    desc.textContent = '已开启，可连接已配对设备';
  } else {
    desc.textContent = '已关闭';
  }
}

async function setBtPower(enabled) {
  if (btBusy) return;
  btBusy = true;
  setBtHint('');
  renderBtStatus();
  try {
    const r = await window.electronAPI.system.toggleBluetooth();
    if (r && r.success) {
      setBtHint('');
    } else if (r && r.error === 'admin_required') {
      setBtHint('切换蓝牙需要管理员权限，请以管理员身份运行 AmengUI', 'error');
    } else if (r && r.error === 'toggle_failed') {
      setBtHint('切换失败，请稍后重试', 'error');
    } else {
      setBtHint('切换蓝牙失败', 'error');
    }
  } catch (err) {
    console.error('[蓝牙] 切换失败:', err);
    setBtHint('切换蓝牙失败', 'error');
  } finally {
    btBusy = false;
    await loadBluetooth();
  }
}

function formatBtClass(classHex) {
  let v = parseInt(String(classHex || '').replace(/^0x/i, ''), 16);
  if (isNaN(v)) v = parseInt(String(classHex || '0'), 10);
  if (isNaN(v)) return '—';
  const major = (v >> 8) & 0x1f;
  const map = {
    1: '计算机',
    2: '手机',
    3: '网络设备',
    4: '音频',
    5: '输入设备',
    6: '成像设备',
    7: '可穿戴设备',
    8: '玩具',
  };
  return map[major] || '其他设备';
}

function renderBtDevices() {
  const list = document.getElementById('bt-device-list');
  if (!list) return;
  list.innerHTML = '';
  if (!btStatus) {
    list.innerHTML = '<div class="network-status-msg">当前环境不支持蓝牙</div>';
    return;
  }
  if (!btStatus.enabled) {
    list.innerHTML = '<div class="network-status-msg">先开启蓝牙以查看设备</div>';
    return;
  }
  if (!btDevices.length) {
    list.innerHTML = '<div class="network-status-msg">未找到已配对的蓝牙设备</div>';
    return;
  }
  const sorted = btDevices.slice().sort((a, b) => {
    const ac = a.status === 'connected' ? 0 : 1;
    const bc = b.status === 'connected' ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return String(a.name).localeCompare(String(b.name), 'zh');
  });
  sorted.forEach((device) => {
    const card = document.createElement('div');
    card.className = 'bt-device-card';

    const row = document.createElement('div');
    row.className = 'bt-device-row clickable';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-expanded', 'false');

    const icon = document.createElement('span');
    icon.className = 'bt-device-icon';
    icon.innerHTML = BT_ICON;
    row.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'bt-device-name';
    name.textContent = device.name;
    name.title = device.name;
    row.appendChild(name);

    const state = document.createElement('span');
    state.className = 'network-state' + (device.status === 'connected' ? ' connected' : '');
    state.textContent = device.status === 'connected' ? '已连接' : '未连接';
    row.appendChild(state);

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    const isConnected = device.status === 'connected';
    actionBtn.className = 'network-action-btn ' + (isConnected ? 'disconnect' : 'connect');
    actionBtn.textContent = isConnected ? '断开' : '连接';
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      btDeviceAction(device, !isConnected, actionBtn);
    });
    row.appendChild(actionBtn);

    const chevron = document.createElement('span');
    chevron.className = 'card-chevron expander-chevron';
    chevron.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden="true">' +
      '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
    row.appendChild(chevron);

    const expander = document.createElement('div');
    expander.className = 'expander-content';
    const inner = document.createElement('div');
    inner.className = 'expander-inner';
    const info = document.createElement('div');
    info.className = 'bt-device-info';
    const actions = document.createElement('div');
    actions.className = 'bt-device-actions';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'win-btn bt-remove-btn';
    removeBtn.textContent = '移除设备';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      btRemoveDevice(device);
    });
    actions.appendChild(removeBtn);
    inner.appendChild(info);
    inner.appendChild(actions);
    expander.appendChild(inner);

    let infoLoaded = false;
    const toggle = () => {
      const open = expander.classList.toggle('open');
      row.classList.toggle('expanded', open);
      row.setAttribute('aria-expanded', String(open));
      if (open && !infoLoaded) {
        infoLoaded = true;
        loadBtDeviceInfo(device, info);
      }
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    card.appendChild(row);
    card.appendChild(expander);
    list.appendChild(card);
  });
}

async function loadBtDeviceInfo(device, container) {
  container.innerHTML = '<div class="bt-info-loading">正在读取设备信息…</div>';
  try {
    const info = await window.electronAPI.system.getBluetoothDeviceInfo(device.address);
    if (!info || !info.success) {
      container.innerHTML = '<div class="bt-info-loading">无法读取设备信息</div>';
      return;
    }
    const rows = [
      ['地址', info.address || '—'],
      ['类别', formatBtClass(info.classOfDevice)],
      ['已认证', info.authenticated ? '是' : '否'],
      ['服务', (info.services && info.services.length) ? info.services.join('、') : '—'],
    ];
    container.innerHTML = '';
    rows.forEach(([label, value]) => {
      const line = document.createElement('div');
      line.className = 'bt-info-line';
      const l = document.createElement('span');
      l.className = 'bt-info-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'bt-info-value';
      v.textContent = value;
      line.appendChild(l);
      line.appendChild(v);
      container.appendChild(line);
    });
  } catch (err) {
    console.error('[蓝牙] 读取设备信息失败:', err);
    container.innerHTML = '<div class="bt-info-loading">无法读取设备信息</div>';
  }
}

async function btDeviceAction(device, connect, btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = connect ? '连接中…' : '断开中…';
  try {
    const r = connect
      ? await window.electronAPI.system.connectBluetoothDevice(device.address)
      : await window.electronAPI.system.disconnectBluetoothDevice(device.address);
    if (r && r.success) {
      if (connect && r.connected === false) {
        setBtHint(r.note || '已发送连接请求，但设备未建立连接（手机类设备通常在具体服务使用时才连接）');
      } else {
        setBtHint('');
      }
      await loadBluetooth();
      return;
    }
    if (r && r.error === 'service_not_found') {
      setBtHint('该设备未提供可连接的经典服务。手机类设备请使用“发送或接收文件”，或从手机发起连接。', 'error');
    } else if (r && r.error === 'admin_required') {
      setBtHint('需要管理员权限，请以管理员身份运行 AmengUI', 'error');
    } else {
      setBtHint(`操作失败：${(r && r.error) || '未知错误'}`, 'error');
    }
  } catch (err) {
    console.error('[蓝牙] 设备操作失败:', err);
    setBtHint('操作失败，请稍后重试', 'error');
  }
  btn.disabled = false;
  btn.textContent = connect ? '连接' : '断开';
}

function btRemoveDevice(device) {
  showConfirmDialog(`确定移除设备「${device.name}」吗？移除后需要重新配对才能使用。`, async () => {
    closeConfirmDialog();
    try {
      const r = await window.electronAPI.system.unpairBluetoothDevice(device.address);
      if (r && r.success) {
        setBtHint('');
        await loadBluetooth();
      } else {
        setBtHint(`移除失败：${(r && r.error) || '未知错误'}`, 'error');
      }
    } catch (err) {
      console.error('[蓝牙] 移除设备失败:', err);
      setBtHint('移除失败，请稍后重试', 'error');
    }
  });
}

function setBtScanMsg(message, type) {
  const status = document.getElementById('bt-scan-status');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('hidden', !message);
  status.classList.toggle('success', type === 'success');
  status.classList.toggle('error', type === 'error');
}

async function loadBtAdd() {
  const statusEl = document.getElementById('bt-scan-status');
  const list = document.getElementById('bt-add-list');
  const scanBtn = document.getElementById('btn-bt-scan');
  if (!statusEl || !list) return;
  if (!btStatus || !btStatus.enabled) {
    setBtScanMsg('请先开启蓝牙再扫描设备', 'error');
    list.innerHTML = '';
    return;
  }
  btScanning = true;
  if (scanBtn) scanBtn.disabled = true;
  setBtScanMsg('正在扫描附近的蓝牙设备…（约 10 秒）');
  list.innerHTML = '';
  try {
    const res = await window.electronAPI.system.discoverBluetoothDevices();
    const devices = (res && res.devices) || [];
    setBtScanMsg('');
    renderBtAddDevices(devices);
  } catch (err) {
    console.error('[蓝牙] 扫描失败:', err);
    setBtScanMsg('扫描失败，请重试', 'error');
    list.innerHTML = '';
  } finally {
    btScanning = false;
    if (scanBtn) scanBtn.disabled = false;
  }
}

function renderBtAddDevices(devices) {
  const list = document.getElementById('bt-add-list');
  if (!list) return;
  btAddDevices = devices || [];
  list.innerHTML = '';
  if (!btAddDevices.length) {
    list.innerHTML = '<div class="bt-scan-empty">未发现可配对的蓝牙设备<br>请确认设备已开启并处于配对模式</div>';
    return;
  }
  btAddDevices.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'bt-add-row';
    const icon = document.createElement('span');
    icon.className = 'bt-add-icon';
    icon.innerHTML = BT_ICON;
    const name = document.createElement('span');
    name.className = 'bt-add-name';
    name.textContent = d.name;
    name.title = d.name;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'network-action-btn connect';
    btn.textContent = '配对';
    btn.addEventListener('click', () => btPairDevice(d, btn));
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

async function btPairDevice(device, btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '配对中…';
  try {
    const r = await window.electronAPI.system.pairBluetoothDevice(device.address, '');
    if (r && r.success) {
      setBtScanMsg(`已配对 ${device.name}`, 'success');
      btAddDevices = btAddDevices.filter((d) => d.address !== device.address);
      renderBtAddDevices(btAddDevices);
      await loadBluetooth();
    } else if (r && r.pinRequired) {
      openPinDialog(device);
    } else {
      setBtScanMsg(`配对失败：${(r && r.error) || '未知错误'}`, 'error');
    }
  } catch (err) {
    console.error('[蓝牙] 配对失败:', err);
    setBtScanMsg('配对失败，请重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '配对';
  }
}

function openPinDialog(device) {
  btPairTarget = device;
  document.getElementById('pin-dialog-text').textContent =
    `设备「${device.name}」需要 PIN 码，请输入设备屏幕上显示的 PIN`;
  document.getElementById('pin-dialog-input').value = '';
  setPinDialogStatus('');
  document.getElementById('pin-dialog-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('pin-dialog-input').focus(), 50);
}

function closePinDialog() {
  document.getElementById('pin-dialog-overlay').classList.add('hidden');
  btPairTarget = null;
}

function setPinDialogStatus(message, type) {
  const status = document.getElementById('pin-dialog-status');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('hidden', !message);
  status.classList.toggle('success', type === 'success');
  status.classList.toggle('error', type === 'error');
}

async function submitPinDialog() {
  if (!btPairTarget) return;
  const pin = document.getElementById('pin-dialog-input').value.trim();
  if (!pin) {
    setPinDialogStatus('请输入 PIN 码', 'error');
    return;
  }
  const okBtn = document.getElementById('btn-pin-ok');
  okBtn.disabled = true;
  okBtn.textContent = '配对中…';
  try {
    const r = await window.electronAPI.system.pairBluetoothDevice(btPairTarget.address, pin);
    if (r && r.success) {
      const paired = btPairTarget;
      closePinDialog();
      setBtScanMsg(`已配对 ${paired.name}`, 'success');
      btAddDevices = btAddDevices.filter((d) => d.address !== paired.address);
      renderBtAddDevices(btAddDevices);
      await loadBluetooth();
    } else {
      setPinDialogStatus(`配对失败：${(r && r.error) || '未知错误'}`, 'error');
    }
  } catch (err) {
    console.error('[蓝牙] 配对失败:', err);
    setPinDialogStatus('配对失败，请重试', 'error');
  } finally {
    okBtn.disabled = false;
    okBtn.textContent = '配对';
  }
}

async function launchBtUtility(kind) {
  try {
    const r = await window.electronAPI.system.launchBtUtility(kind);
    if (!r || !r.success) {
      setBtHint(
        kind === 'transfer' ? '当前环境不支持蓝牙文件传输' : '当前环境不支持经典蓝牙设置',
        'error'
      );
    }
  } catch (err) {
    console.error('[蓝牙] 启动工具失败:', err);
    setBtHint('启动失败，请稍后重试', 'error');
  }
}

function bindBluetoothPageEvents() {
  const openAdd = () => {
    if (btStatus && !btStatus.enabled) {
      setBtHint('请先开启蓝牙再添加设备');
      return;
    }
    if (!btStatus) {
      setBtHint('当前环境不支持蓝牙', 'error');
      return;
    }
    navigateTo('bluetooth-add');
  };
  const addRow = document.getElementById('row-bt-add');
  if (addRow) {
    addRow.addEventListener('click', openAdd);
    addRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAdd();
      }
    });
  }
  const addBtn = document.getElementById('btn-bt-add');
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAdd();
    });
  }

  const scanBtn = document.getElementById('btn-bt-scan');
  if (scanBtn) scanBtn.addEventListener('click', loadBtAdd);

  const transferRow = document.getElementById('row-bt-transfer');
  if (transferRow) {
    const launch = () => launchBtUtility('transfer');
    transferRow.addEventListener('click', launch);
    transferRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        launch();
      }
    });
  }
  const optionsRow = document.getElementById('row-bt-options');
  if (optionsRow) {
    const launch = () => launchBtUtility('options');
    optionsRow.addEventListener('click', launch);
    optionsRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        launch();
      }
    });
  }

  document.getElementById('btn-pin-cancel').addEventListener('click', closePinDialog);
  document.getElementById('btn-pin-ok').addEventListener('click', submitPinDialog);
  document.getElementById('pin-dialog-overlay').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePinDialog();
    }
  });
  const pinInput = document.getElementById('pin-dialog-input');
  if (pinInput) {
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPinDialog();
      }
    });
  }
}

/* ============================================================
   时间和语言
   ============================================================ */
let timeZoneCombo = null;
let currentTimeZoneId = '';
let timeFormatSwitch = null;
let timeTickTimer = null;

function formatClock(now, time24h) {
  const h = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  if (time24h) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  const period = h >= 12 ? '下午' : '上午';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${period}${hh}:${mm}:${ss}`;
}

function updateTimeNow() {
  const timeEl = document.getElementById('time-now');
  const dateEl = document.getElementById('time-now-date');
  if (!timeEl) return;
  const now = new Date();
  timeEl.textContent = formatClock(now, state.time24h);
  if (dateEl) {
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    dateEl.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${week}`;
  }
}

function startTimeTick() {
  const timeEl = document.getElementById('time-now');
  if (!timeEl) return;
  updateTimeNow();
  if (timeTickTimer) return;
  timeTickTimer = setInterval(updateTimeNow, 1000);
}

function stopTimeTick() {
  if (timeTickTimer) {
    clearInterval(timeTickTimer);
    timeTickTimer = null;
  }
}

function renderTimeFormatSwitch() {
  const host = document.getElementById('time-format-host');
  if (!host) return;
  if (!timeFormatSwitch) {
    timeFormatSwitch = createWinSwitch({
      checked: state.time24h,
      ariaLabel: '24 小时制',
      onChange: async (checked) => {
        state.time24h = checked;
        updateTimeNow();
        sendChange({ type: 'time24h', value: checked });
        try {
          await window.electronAPI.config.setTimeFormat24h(checked, state.account.userId);
        } catch (err) {
          console.error('[时间] 保存时间格式失败:', err);
        }
      },
    });
    host.appendChild(timeFormatSwitch.el);
  } else {
    timeFormatSwitch.setChecked(state.time24h);
  }
}

async function setSystemTimeZone(id) {
  const statusEl = document.getElementById('time-zone-status');
  if (!statusEl) return;
  statusEl.textContent = '正在设置时区…';
  statusEl.classList.remove('hidden', 'success', 'error');
  try {
    const r = await window.electronAPI.system.setTimeZone(id);
    if (r && r.success) {
      statusEl.textContent = '时区已更新';
      statusEl.classList.add('success');
      const st = await window.electronAPI.system.getTimeStatus().catch(() => null);
      if (st && st.success !== false) {
        currentTimeZoneId = st.timezoneId || id;
        document.getElementById('time-zone-desc').textContent = st.timezoneDisplay || st.timezoneId || '—';
      }
      setTimeout(() => statusEl.classList.add('hidden'), 2500);
    } else if (r && r.error === 'admin_required') {
      statusEl.textContent = '更改时区需要管理员权限，请以管理员身份运行 AmengUI';
      statusEl.classList.add('error');
      if (timeZoneCombo && currentTimeZoneId) timeZoneCombo.setValue(currentTimeZoneId);
    } else {
      statusEl.textContent = `设置失败：${(r && r.error) || '未知错误'}`;
      statusEl.classList.add('error');
    }
  } catch (err) {
    console.error('[时间] 设置时区失败:', err);
    statusEl.textContent = '设置失败，请稍后重试';
    statusEl.classList.add('error');
  }
}

async function loadTime() {
  startTimeTick();
  renderTimeFormatSwitch();
  const zoneDesc = document.getElementById('time-zone-desc');
  const cultureDesc = document.getElementById('time-culture-desc');
  const regionDesc = document.getElementById('time-region-desc');
  try {
    const st = await window.electronAPI.system.getTimeStatus();
    if (st && st.success !== false) {
      if (zoneDesc) zoneDesc.textContent = st.timezoneDisplay || st.timezoneId || '—';
      if (cultureDesc) cultureDesc.textContent = st.cultureDisplay || st.culture || '—';
      if (regionDesc) {
        regionDesc.textContent = [st.culture, st.dateSample, st.timeSample].filter(Boolean).join(' · ');
      }
      currentTimeZoneId = st.timezoneId || '';
    } else {
      if (zoneDesc) zoneDesc.textContent = '无法读取时区信息';
      if (cultureDesc) cultureDesc.textContent = '—';
      if (regionDesc) regionDesc.textContent = '—';
    }
  } catch (err) {
    console.error('[时间] 读取系统信息失败:', err);
    if (zoneDesc) zoneDesc.textContent = '无法读取时区信息';
  }

  // 时区下拉（惰性构建一次，后续进入仅同步选中值）
  const host = document.getElementById('time-zone-host');
  if (!host) return;
  if (!timeZoneCombo) {
    try {
      const zonesRes = await window.electronAPI.system.getTimeZones();
      const zones = (zonesRes && zonesRes.zones) || [];
      if (zones.length) {
        const items = zones.map((z) => ({ value: z.id, label: `${z.display} (${z.id})` }));
        timeZoneCombo = createWinComboBox(items, currentTimeZoneId || items[0].value, {
          ariaLabel: '时区',
          onChange: (v) => setSystemTimeZone(v),
        });
        host.appendChild(timeZoneCombo.el);
      }
    } catch (err) {
      console.error('[时间] 读取时区列表失败:', err);
    }
  } else if (currentTimeZoneId) {
    timeZoneCombo.setValue(currentTimeZoneId);
  }
}

/* ============================================================
   信息与更新（关于）
   ============================================================ */
async function loadAbout() {
  const versionEl = document.getElementById('about-version');
  const list = document.getElementById('about-info-list');
  if (!versionEl || !list) return;
  try {
    const info = await window.electronAPI.app.getAboutInfo();
    const dev = await window.electronAPI.settings.getDeviceInfo().catch(() => null);
    const device = [dev && dev.manufacturer, dev && dev.model].filter(Boolean).join(' ') || info.hostname || '—';
    const osText = info.platform === 'win32' ? `Windows ${info.release}` : `${info.platform} ${info.release}`;
    const rows = [
      ['版本', info.version || '—'],
      ['Electron', info.electron || '—'],
      ['Chromium', info.chrome || '—'],
      ['Node.js', info.node || '—'],
      ['设备', device],
      ['操作系统', osText],
    ];
    if (info.version) versionEl.textContent = info.version;
    list.innerHTML = '';
    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'about-info-row';
      const l = document.createElement('span');
      l.className = 'about-info-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'about-info-value';
      v.textContent = value;
      row.appendChild(l);
      row.appendChild(v);
      list.appendChild(row);
    });
  } catch (err) {
    console.error('[关于] 读取应用信息失败:', err);
    list.innerHTML = '<div class="network-status-msg">无法读取应用信息</div>';
  }
}

function bindAboutPageEvents() {
  const btn = document.getElementById('btn-check-update');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const status = document.getElementById('about-update-status');
    btn.disabled = true;
    status.textContent = '正在检查更新…';
    // 本地应用无更新渠道，模拟检查后提示已是最新版本
    await sleep(1000);
    status.textContent = '已是最新版本';
    btn.disabled = false;
  });
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

  // 网络页：返回主页 / 返回网络页
  document.querySelectorAll('[data-back-home]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('home'));
  });
  document.querySelectorAll('[data-back-network]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('network'));
  });
  document.querySelectorAll('[data-back-bluetooth]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('bluetooth'));
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

  // 系统页：存储入口 + 返回
  const storageRow = document.getElementById('row-storage');
  if (storageRow) {
    const openStorage = () => navigateTo('storage');
    storageRow.addEventListener('click', openStorage);
    storageRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openStorage();
      }
    });
  }
  document.querySelectorAll('[data-back-system]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('system'));
  });

  // 系统页：屏幕 / 声音 / 通知入口
  [['row-screen', 'screen'], ['row-sound', 'sound'], ['row-notify', 'notify']].forEach(([rowId, pageId]) => {
    const row = document.getElementById(rowId);
    if (!row) return;
    const openPage = () => navigateTo(pageId);
    row.addEventListener('click', openPage);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPage();
      }
    });
  });

  // 存储：快速清理 + 清理建议展开
  const quickCleanBtn = document.getElementById('btn-quick-clean');
  if (quickCleanBtn) {
    quickCleanBtn.addEventListener('click', runQuickCleanup);
  }
  const adviceRow = document.getElementById('row-cleanup-advice');
  const adviceExpander = document.getElementById('cleanup-advice-expander');
  if (adviceRow && adviceExpander) {
    const toggleAdvice = () => {
      const open = adviceExpander.classList.toggle('open');
      adviceRow.classList.toggle('expanded', open);
      adviceRow.setAttribute('aria-expanded', String(open));
      if (open) loadCleanupAdvice();
    };
    adviceRow.addEventListener('click', toggleAdvice);
    adviceRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleAdvice();
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

  // 重命名对话框（入口按钮已隐藏，保留对话框供后续重新开放）
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
  // 网络和Internet：状态 / 可用网络 / 管理已知网络
  bindNetworkPageEvents();
  // 蓝牙和其他设备：开关 / 设备列表 / 添加设备
  bindBluetoothPageEvents();
  // 信息与更新：检查更新
  bindAboutPageEvents();

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
    if (data.displayProfile !== undefined) state.displayProfile = data.displayProfile || 'default';
    if (data.notifyApps !== undefined) state.notifyApps = data.notifyApps !== false;
    if (data.notifySystem !== undefined) state.notifySystem = data.notifySystem !== false;
    if (data.notifyDnd !== undefined) state.notifyDnd = !!data.notifyDnd;
    if (typeof data.time24h === 'boolean') {
      state.time24h = data.time24h;
      if (timeFormatSwitch) timeFormatSwitch.setChecked(state.time24h);
      updateTimeNow();
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
