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

const BACK_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">' +
  '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' +
  '</svg>';

let currentPage = 'home';
let searchActive = false;

const state = {
  theme: 'dark',
  accentColor: '#0078D4',
  isTaskbarFloating: true,
  desktopBackground: null,
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
  if (!NAV_ITEMS.some((n) => n.id === id)) return;
  const target = ensurePage(id);
  if (!target) return;

  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  target.classList.remove('hidden');
  target.classList.remove('page-enter');
  void target.offsetWidth; // 重新触发进入动画
  target.classList.add('page-enter');

  document.querySelectorAll('.nav-item').forEach((btn) => {
    const active = btn.dataset.nav === id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.setAttribute('tabindex', active ? '0' : '-1');
  });

  currentPage = id;
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

  // 主进程下发主题与账户信息
  window.electronAPI.settings.onTheme((data) => {
    if (data.theme) state.theme = data.theme;
    if (data.accentColor) state.accentColor = data.accentColor;
    if (typeof data.isTaskbarFloating === 'boolean') {
      state.isTaskbarFloating = data.isTaskbarFloating;
    }
    if (data.desktopBackground) applyBackgroundToPreview(data.desktopBackground);
    if (data.deviceName) state.deviceName = data.deviceName;
    if (data.account) {
      state.account = { ...state.account, ...data.account };
      const nameEl = document.getElementById('account-name');
      const subEl = document.getElementById('account-sub');
      if (state.account.username) nameEl.textContent = state.account.username;
      subEl.textContent = state.account.email || state.account.roleLabel || '本地账户';
      const avatarBox = document.getElementById('account-avatar');
      if (state.account.avatar) {
        avatarBox.innerHTML = `<img src="${state.account.avatar}" alt="">`;
      }

      // 账户主页：名称 / 角色徽章 / 头像
      const heroName = document.getElementById('account-hero-name');
      const heroRole = document.getElementById('account-hero-role');
      if (heroName && state.account.username) {
        heroName.textContent = state.account.username;
      }
      if (heroRole && state.account.roleLabel) {
        heroRole.textContent = state.account.roleLabel;
      }
      const heroAvatar = document.getElementById('account-hero-avatar');
      if (heroAvatar && state.account.avatar) {
        heroAvatar.innerHTML = `<img src="${state.account.avatar}" alt="">`;
      }

      // “其他账户”仅对管理员级账户（root/sudo）开放
      const otherAccountsCard = document.getElementById('card-other-accounts');
      if (otherAccountsCard) {
        const privileged = state.account.permi === 'root' || state.account.permi === 'sudo';
        otherAccountsCard.classList.toggle('hidden', !privileged);
      }
    }
    applyTheme();
    loadDeviceInfo();
    loadWifiStatus();
  });
}

document.addEventListener('DOMContentLoaded', init);
