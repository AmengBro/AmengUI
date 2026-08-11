/**
 * 独立开始菜单窗口（悬浮置顶）
 * 逻辑迁移自 dashboard.js，行为保持一致；窗口关闭由主进程控制。
 */

// 开始菜单加载标志，防止重复加载
let isStartMenuLoading = false;

// 右键菜单图标（发送到桌面）
const SEND_TO_DESKTOP_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/></svg>';
const OPEN_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>';
const PROPERTIES_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v15c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5h-2v5H3V6h14v8h2zM12 2H4v2h8V2zm9 9.41L19.59 10 17 12.59 14.41 10 13 11.41 15.59 14 13 16.59 14.41 18 17 15.41 19.59 18 21 16.59 18.41 14 21 11.41z"/></svg>';

// 模态确认回调
let confirmCallback = null;

/**
 * 隐藏本窗口（由主进程执行 hide）
 */
function hideMenu() {
  if (window.electronAPI && window.electronAPI.startMenu) {
    window.electronAPI.startMenu.hide();
  }
}

/**
 * 获取当前登录用户ID
 */
async function getCurrentUserId() {
  try {
    const lastLoginUserId = await window.electronAPI.config.getLastLoginUserId();
    if (lastLoginUserId) {
      return lastLoginUserId;
    }
    const users = await window.electronAPI.config.getUsers();
    return users && users.length > 0 ? users[0].userid : null;
  } catch (error) {
    console.error('Failed to get current user ID:', error);
    return null;
  }
}

/**
 * 检查路径是否为有效的图片路径
 */
function isValidImagePath(path) {
  if (!path) return false;
  const ext = path.toLowerCase();
  return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.ico') || ext.endsWith('.gif');
}

/**
 * 从 .app 文件获取应用信息
 */
async function getAppInfo(appName) {
  try {
    const result = await window.electronAPI.app.getInfo(appName);
    if (result.success) {
      return {
        name: result.name,
        description: result.description,
        exePath: result.exePath,
        icon: result.icon
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to get app info:', error);
    return null;
  }
}

/**
 * 应用主题与强调色
 */
function applyTheme(theme, accentColor) {
  document.body.classList.toggle('theme-bright', theme === 'bright');
  if (accentColor) {
    document.documentElement.style.setProperty('--accent-color', accentColor);
  }
}

/**
 * 加载用户信息（优先使用主进程推送的账户数据，其次查配置）
 */
async function loadUserInfo(account) {
  const usernameElement = document.getElementById('start-menu-username');
  let username = account && account.username;
  let avatar = account && account.avatar;

  if (!username) {
    try {
      const lastLoginUserId = await window.electronAPI.config.getLastLoginUserId();
      const users = await window.electronAPI.config.getUsers();
      const user = (lastLoginUserId && users.find((u) => u.userid === lastLoginUserId)) || users[0];
      if (user) {
        username = user.username;
        avatar = user.photo || null;
      }
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  }

  if (usernameElement && username) {
    usernameElement.textContent = username;
  }

  const avatarBox = document.getElementById('start-menu-avatar');
  if (avatarBox && avatar) {
    avatarBox.innerHTML = `<img src="${avatar}" alt="">`;
  }
}

/**
 * 加载开始菜单应用列表（/usr/share/applications 全部应用 + 桌面快捷方式补全）
 */
async function loadStartMenuApps() {
  if (isStartMenuLoading) return;
  isStartMenuLoading = true;

  try {
    const userId = await getCurrentUserId();
    const [desktopData, allAppsRes] = await Promise.all([
      window.electronAPI.config.getUserDesktop(userId),
      window.electronAPI.apps.listAll().catch(() => ({ success: false, apps: [] })),
    ]);
    const desktopApps = (desktopData && desktopData.desktopapp) || [];
    const systemApps = (allAppsRes && allAppsRes.apps) || [];
    const appList = document.getElementById('start-menu-app-list');

    if (!appList) {
      isStartMenuLoading = false;
      return;
    }

    appList.innerHTML = '';

    const apps = [];
    const seen = new Set();
    for (const app of systemApps) {
      const start = app.appName;
      if (!start || seen.has(start)) continue;
      seen.add(start);
      apps.push({ start, name: app.name || start, icon: app.icon || null, description: app.description || '' });
    }
    for (const app of desktopApps) {
      if (!app.start || seen.has(app.start)) continue;
      seen.add(app.start);
      apps.push({ start: app.start, name: app.name, icon: app.icon || null });
    }

    if (apps.length === 0) {
      isStartMenuLoading = false;
      return;
    }

    for (const app of apps) {
      const appItem = document.createElement('div');
      appItem.className = 'start-menu-app-item';
      appItem.dataset.appName = app.start;

      let iconPath = app.icon;

      if (!iconPath || iconPath.trim() === '' || !isValidImagePath(iconPath)) {
        const appInfo = await getAppInfo(app.start);
        if (appInfo && appInfo.icon && isValidImagePath(appInfo.icon)) {
          iconPath = appInfo.icon;
        }
      }

      const iconElement = document.createElement('img');
      iconElement.className = 'start-menu-app-icon';

      const finalIconPath = isValidImagePath(iconPath) ? iconPath : '../difproico.png';
      iconElement.src = finalIconPath;

      iconElement.onerror = () => {
        iconElement.src = '../difproico.png';
      };

      const nameElement = document.createElement('span');
      nameElement.className = 'start-menu-app-name';
      nameElement.textContent = app.name;

      appItem.appendChild(iconElement);
      appItem.appendChild(nameElement);
      appList.appendChild(appItem);

      appItem.addEventListener('click', async () => {
        console.log('Launching app from start menu:', app.start);
        hideMenu();
        const result = await window.electronAPI.app.launch(app.start);
        if (!result.success) {
          alert(`启动失败: ${result.error}`);
        }
      });

      // 右键：发送到桌面
      appItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showStartMenuContextMenu(e.clientX, e.clientY, {
          start: app.start,
          name: app.name,
          icon: app.icon,
        });
      });
    }
  } catch (error) {
    console.error('Failed to load start menu apps:', error);
  } finally {
    isStartMenuLoading = false;
  }
}

/**
 * 开始菜单应用右键菜单（发送到桌面）
 */
function closeContextMenu() {
  const menu = document.getElementById('desktop-context-menu');
  if (menu) menu.remove();
}

function showStartMenuContextMenu(x, y, entry) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'desktop-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const items = [
    {
      label: '打开',
      icon: OPEN_ICON,
      action: () => {
        hideMenu();
        window.electronAPI.app.launch(entry.start).then((r) => {
          if (r && !r.success) alert(`启动失败: ${r.error}`);
        });
      },
    },
    null,
    { label: '发送到桌面', icon: SEND_TO_DESKTOP_ICON, action: () => sendToDesktop(entry) },
    null,
    { label: '属性', icon: PROPERTIES_ICON, action: () => showStartMenuProperties(entry) },
  ];

  items.forEach((it) => {
    if (it === null) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      return;
    }
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'context-menu-icon';
    iconSpan.innerHTML = it.icon;
    const textSpan = document.createElement('span');
    textSpan.textContent = it.label;
    item.appendChild(iconSpan);
    item.appendChild(textSpan);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      closeContextMenu();
      it.action();
    });
    menu.appendChild(item);
  });
  document.body.appendChild(menu);
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('contextmenu', closeContextMenu);
}

async function showStartMenuProperties(entry) {
  try {
    const appInfo = await getAppInfo(entry.start);
    const userId = await getCurrentUserId();
    const settings = userId ? await window.electronAPI.config.getSettings(userId) : null;
    const appData = {
      name: entry.name,
      start: entry.start,
      description: appInfo ? (appInfo.description || '') : '',
      exePath: appInfo ? (appInfo.exePath || '') : '',
      icon: appInfo ? (appInfo.icon || '') : '',
      theme: (settings && settings.theme) || 'dark',
      accentColor: (settings && settings.accentColor) || '#0078D4'
    };
    await window.electronAPI.properties.show(appData);
  } catch (error) {
    console.error('[StartMenu] Error showing properties:', error);
  }
}

/**
 * 发送应用到桌面（写入 ./config/{userid}/desktop.json）
 * 写入成功后通知主进程，由主进程转发给桌面窗口刷新
 */
async function sendToDesktop(entry) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const desktopData = await window.electronAPI.config.getUserDesktop(userId);
    const desktopApps = (desktopData && desktopData.desktopapp) || [];
    const pos = getNextDesktopPosition(desktopApps);
    const newApp = {
      name: entry.name,
      start: entry.start,
      icon: entry.icon || null,
      x: pos.x,
      y: pos.y,
    };
    await window.electronAPI.config.addDesktopApp(userId, newApp);
    console.log('[StartMenu] Sent to desktop:', entry.name);
    window.electronAPI.startMenu.notifyDesktopAdded();
  } catch (error) {
    console.error('[StartMenu] Send to desktop failed:', error);
  }
}

/**
 * 计算下一个桌面快捷方式的网格位置
 */
function getNextDesktopPosition(desktopApps) {
  const col = desktopApps.length % 5;
  const row = Math.floor(desktopApps.length / 5);
  return { x: 15 + col * 95, y: 15 + row * 105 };
}

/**
 * 模态确认弹窗
 */
function showConfirmModal(message, callback, showCancel = true) {
  confirmCallback = callback;
  const modalOverlay = document.getElementById('modal-overlay');
  const modalMessage = document.getElementById('modal-message');
  const cancelBtn = document.getElementById('modal-btn-cancel');
  modalMessage.textContent = message;
  if (cancelBtn) {
    cancelBtn.classList.toggle('hidden', !showCancel);
  }
  modalOverlay.classList.remove('hidden');
}

function bindModalEvents() {
  const cancelBtn = document.getElementById('modal-btn-cancel');
  const confirmBtn = document.getElementById('modal-btn-confirm');
  const modalOverlay = document.getElementById('modal-overlay');

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      modalOverlay.classList.add('hidden');
      confirmCallback = null;
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      modalOverlay.classList.add('hidden');
      if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
      }
    });
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.classList.add('hidden');
        confirmCallback = null;
      }
    });
  }
}

/**
 * 电源按钮（行为与迁移前一致）
 */
function bindPowerButtons() {
  const powerBtn = document.getElementById('power-btn-main');
  const powerSubmenu = document.getElementById('power-submenu');

  if (powerBtn && powerSubmenu) {
    powerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeUserSubmenu();
      powerSubmenu.classList.toggle('hidden');
    });
  }

  // 点击其他地方关闭子菜单
  document.addEventListener('click', (e) => {
    if (e.target.closest('.modal-overlay')) return;
    if (powerSubmenu && !powerSubmenu.classList.contains('hidden')) {
      powerSubmenu.classList.add('hidden');
    }
  });

  // 关机按钮
  const shutdownBtn = document.getElementById('start-menu-shutdown');
  if (shutdownBtn) {
    shutdownBtn.addEventListener('click', () => {
      showConfirmModal('确定要关机吗？', () => {
        showConfirmModal('正在关机...', () => {}, false);
      }, false);
    });
  }

  // 重启按钮
  const restartBtn = document.getElementById('start-menu-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      showConfirmModal('确定要重新启动吗？', () => {
        showConfirmModal('正在重新启动...', () => {}, false);
      }, false);
    });
  }

  // Shell模式按钮
  const shellBtn = document.getElementById('start-menu-shell');
  if (shellBtn) {
    shellBtn.addEventListener('click', () => {
      showConfirmModal('确定要进入Shell模式吗？', () => {
        window.electronAPI.power.shell();
      }, false);
    });
  }
}

function closePowerSubmenu() {
  const powerSubmenu = document.getElementById('power-submenu');
  if (powerSubmenu && !powerSubmenu.classList.contains('hidden')) {
    powerSubmenu.classList.add('hidden');
  }
}

/**
 * 用户菜单按钮
 */
function bindUserMenu() {
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userSubmenu = document.getElementById('user-submenu');

  if (userMenuBtn && userSubmenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePowerSubmenu();
      userSubmenu.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', () => {
    if (userSubmenu && !userSubmenu.classList.contains('hidden')) {
      userSubmenu.classList.add('hidden');
    }
  });

  const lockBtn = document.getElementById('start-menu-lock');
  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      closeUserSubmenu();
      hideMenu();
      window.electronAPI.screen.lock();
    });
  }

  const logoutBtn = document.getElementById('start-menu-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      closeUserSubmenu();
      showConfirmModal('确认注销吗？', () => {
        hideMenu();
        window.electronAPI.window.logout();
      });
    });
  }
}

function closeUserSubmenu() {
  const userSubmenu = document.getElementById('user-submenu');
  if (userSubmenu && !userSubmenu.classList.contains('hidden')) {
    userSubmenu.classList.add('hidden');
  }
}

/**
 * 初始化
 */
function init() {
  // 主进程在窗口加载后推送主题/账户数据
  window.electronAPI.startMenu.onTheme(({ theme, accentColor, account }) => {
    applyTheme(theme, accentColor);
    loadUserInfo(account);
  });

  // 主进程每次显示窗口时下发刷新指令，重新读取 /usr/share/applications，
  // 保证 Pacman 等安装器新增的程序在下次打开时立即可见
  window.electronAPI.startMenu.onRefresh(() => {
    loadStartMenuApps();
  });

  loadStartMenuApps();
  bindPowerButtons();
  bindUserMenu();
  bindModalEvents();

  // ESC 关闭窗口（确认弹窗打开时不关闭）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('modal-overlay');
      if (overlay && !overlay.classList.contains('hidden')) return;
      hideMenu();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
