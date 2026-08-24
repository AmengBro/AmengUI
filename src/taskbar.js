/**
 * 独立任务栏窗口（始终置顶，盖在屏幕底部真实任务栏位置）
 * 行为与 dashboard 内嵌任务栏一致：开始菜单 / 运行窗口 / 控制中心 / 消息 / 时间
 */

let currentTheme = 'dark';
let currentAccentColor = '#0078D4';
let isTaskbarFloating = true;
let time24h = true;
let notifyUnread = 0;

// 右键菜单图标（设置 / 任务管理器）
const MENU_ICONS = {
  settings: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
  taskManager: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>',
};

// ==================== 基础 ====================

async function getCurrentUserId() {
  try {
    const lastLoginUserId = await window.electronAPI.config.getLastLoginUserId();
    if (lastLoginUserId != null) return lastLoginUserId;
    const users = await window.electronAPI.config.getUsers();
    return users && users.length > 0 ? users[0].userid : null;
  } catch (error) {
    console.error('Failed to get current user ID:', error);
    return null;
  }
}

function applyTheme(theme) {
  document.body.classList.toggle('theme-bright', theme === 'bright');
}

function applyAccentColor(color) {
  document.documentElement.style.setProperty('--accent-color', color);
}

function applyTaskbarMode() {
  const taskbar = document.getElementById('taskbar');
  document.body.classList.toggle('taskbar-floating', isTaskbarFloating);
  document.body.classList.toggle('taskbar-docked', !isTaskbarFloating);
  if (taskbar) {
    taskbar.classList.toggle('floating', isTaskbarFloating);
    taskbar.classList.toggle('docked', !isTaskbarFloating);
  }
}

async function initTheme() {
  try {
    const currentUserId = await getCurrentUserId();
    if (currentUserId == null) return;
    const settings = await window.electronAPI.config.getSettings(currentUserId);
    if (settings) {
      if (settings.theme) {
        currentTheme = settings.theme;
        applyTheme(currentTheme);
      }
      if (settings.accentColor) {
        currentAccentColor = settings.accentColor;
        applyAccentColor(currentAccentColor);
      }
      if (settings.taskbar) {
        isTaskbarFloating = settings.taskbar !== 'docked';
        applyTaskbarMode();
      }
      if (typeof settings.time24h === 'boolean') {
        time24h = settings.time24h;
        updateTime();
      }
    }
  } catch (error) {
    console.error('Failed to load taskbar settings:', error);
  }
  // 同步任务栏窗口尺寸/位置到主进程
  window.electronAPI.taskbar.setMode(isTaskbarFloating ? 'floating' : 'docked').catch(() => {});
}

function updateTime() {
  const now = new Date();
  const timeDisplay = document.getElementById('time-display');
  const dateDisplay = document.getElementById('date-display');
  if (timeDisplay) {
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const h = now.getHours();
    if (time24h) {
      timeDisplay.textContent = `${h.toString().padStart(2, '0')}:${minutes}`;
    } else {
      const period = h >= 12 ? '下午' : '上午';
      const hh = h % 12 === 0 ? 12 : h % 12;
      timeDisplay.textContent = `${period}${hh}:${minutes}`;
    }
  }
  if (dateDisplay) {
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekDays[now.getDay()];
    dateDisplay.textContent = `${month}月${day}日 周${weekday}`;
  }
}

// ==================== 消息铃铛指示 ====================

function updateNotifyBadge(data) {
  notifyUnread = (data && data.unread) || 0;
  const indicator = document.getElementById('taskbar-msg-indicator');
  if (!indicator) return;
  indicator.style.display = notifyUnread > 0 ? '' : 'none';
}

// ==================== 运行中窗口（前台程序） ====================

let taskbarPopupOpen = false;

function closeTaskbarWindowPopup() {
  const popup = document.getElementById('taskbar-window-popup');
  if (popup) popup.remove();
  taskbarPopupOpen = false;
}

function renderTaskbarWindows(data) {
  const container = document.getElementById('taskbar-windows');
  if (!container) return;
  closeTaskbarWindowPopup();
  const groups = (data && data.groups) || [];
  container.innerHTML = '';

  groups.forEach((g) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'taskbar-window-btn running'
      + (g.focused ? ' focused' : '')
      + (g.minimized && !g.focused ? ' minimized' : '');
    btn.title = (g.title || g.processName || '窗口')
      + (g.minimized ? '（已最小化）' : '')
      + (g.count > 1 ? `（${g.count} 个窗口）` : '');
    btn.setAttribute('aria-label', btn.title);

    const icon = document.createElement('img');
    icon.draggable = false;
    icon.alt = '';
    icon.src = g.icon || '../difproico.png';
    icon.addEventListener('error', () => {
      icon.src = '../difproico.png';
    });
    btn.appendChild(icon);

    if (g.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'taskbar-window-count';
      badge.textContent = String(g.count);
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => {
      if (g.windows.length <= 1) {
        const w = g.windows[0];
        if (w.focused && !w.minimized) {
          window.electronAPI.taskbar.minimize(w.hwnd);
        } else {
          window.electronAPI.taskbar.activate(w.hwnd);
        }
      } else {
        toggleTaskbarWindowPopup(btn, g);
      }
    });
    container.appendChild(btn);
  });
}

function toggleTaskbarWindowPopup(anchor, group) {
  if (taskbarPopupOpen) {
    closeTaskbarWindowPopup();
    return;
  }
  const popup = document.createElement('div');
  popup.className = 'taskbar-window-popup';
  popup.id = 'taskbar-window-popup';

  group.windows.forEach((w) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'taskbar-window-popup-item'
      + (w.focused ? ' active' : '')
      + (w.minimized ? ' minimized' : '');

    const icon = document.createElement('img');
    icon.draggable = false;
    icon.alt = '';
    icon.src = w.iconData || group.icon || '../difproico.png';
    icon.addEventListener('error', () => {
      icon.src = '../difproico.png';
    });

    const label = document.createElement('span');
    label.className = 'taskbar-window-popup-label';
    label.textContent = (w.title || w.processName || '窗口')
      + (w.minimized ? '（已最小化）' : '');

    item.appendChild(icon);
    item.appendChild(label);
    item.addEventListener('click', () => {
      window.electronAPI.taskbar.activate(w.hwnd);
      closeTaskbarWindowPopup();
    });
    popup.appendChild(item);
  });

  document.body.appendChild(popup);
  const rect = anchor.getBoundingClientRect();
  const pw = popup.offsetWidth;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - pw / 2, window.innerWidth - pw - 8));
  const top = Math.max(8, rect.top - popup.offsetHeight - 8);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  taskbarPopupOpen = true;
}

// ==================== 右键菜单 ====================

function clampContextMenuToViewport(menu, x, y) {
  const rect = menu.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  menu.style.left = `${Math.min(Math.max(x, margin), maxLeft)}px`;
  menu.style.top = `${Math.min(Math.max(y, margin), maxTop)}px`;
}

function closeContextMenu() {
  const menu = document.getElementById('desktop-context-menu');
  if (menu) menu.remove();
  document.removeEventListener('click', closeContextMenu);
  document.removeEventListener('contextmenu', closeContextMenu);
}

function openSettings() {
  window.electronAPI.settings.show({
    theme: currentTheme,
    accentColor: currentAccentColor,
    isTaskbarFloating,
  });
}

async function launchTaskManager() {
  try {
    const result = await window.electronAPI.app.launch('com.sysinformer.app');
    if (!result || !result.success) {
      alert(`任务管理器启动失败: ${(result && result.error) || '未知错误'}`);
    }
  } catch (err) {
    alert('任务管理器启动失败: ' + err.message);
  }
}

function showTaskbarContextMenu(x, y) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'desktop-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const items = [
    { label: '设置', icon: MENU_ICONS.settings, action: openSettings },
    { label: '任务管理器', icon: MENU_ICONS.taskManager, action: launchTaskManager },
  ];

  items.forEach((it) => {
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'context-menu-icon';
    iconSpan.innerHTML = it.icon;
    const textSpan = document.createElement('span');
    textSpan.textContent = it.label;
    menuItem.appendChild(iconSpan);
    menuItem.appendChild(textSpan);
    menuItem.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      closeContextMenu();
      it.action();
    });
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);
  clampContextMenuToViewport(menu, x, y);
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('contextmenu', closeContextMenu);
}

function bindTaskbarContextMenu() {
  const taskbar = document.getElementById('taskbar');
  if (!taskbar) return;
  taskbar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeContextMenu();
    showTaskbarContextMenu(e.clientX, e.clientY);
  });
}

// ==================== 按钮与订阅 ====================

function bindControlCenterEvents() {
  const btn = document.getElementById('btn-control-center');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.controlCenter.show().catch(() => {});
  });
}

function bindTaskbarActions() {
  const startBtn = document.getElementById('start-btn');
  const timeBtn = document.getElementById('taskbar-time-btn');

  if (startBtn) {
    startBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const r = await window.electronAPI.startMenu.toggle({ isTaskbarFloating });
        startBtn.classList.toggle('active', !!(r && r.open));
      } catch (err) {
        console.error('[Taskbar] 打开开始菜单失败:', err);
      }
    });
  }

  if (timeBtn) {
    timeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const r = await window.electronAPI.calendar.toggle({ isTaskbarFloating });
        timeBtn.classList.toggle('active', !!(r && r.open));
      } catch (err) {
        console.error('[Taskbar] 打开日历失败:', err);
      }
    });
  }

  window.electronAPI.startMenu.onState((open) => {
    if (startBtn) startBtn.classList.toggle('active', !!open);
  });
  window.electronAPI.calendar.onState((open) => {
    if (timeBtn) timeBtn.classList.toggle('active', !!open);
  });

  // 消息铃铛：初始 + 推送
  window.electronAPI.notify.list().then((data) => updateNotifyBadge(data)).catch(() => {});
  window.electronAPI.notify.onList((data) => updateNotifyBadge(data));

  // 运行窗口：初始快照 + 轮询推送
  window.electronAPI.taskbar.list()
    .then((data) => renderTaskbarWindows(data))
    .catch(() => {});
  window.electronAPI.taskbar.onWindows((data) => renderTaskbarWindows(data));

  document.addEventListener('click', (e) => {
    if (taskbarPopupOpen && !e.target.closest('#taskbar-window-popup')) {
      closeTaskbarWindowPopup();
    }
  });

  // 设置变更同步
  window.electronAPI.settings.onChange(async (change) => {
    switch (change.type) {
      case 'theme':
        currentTheme = change.value;
        applyTheme(currentTheme);
        break;
      case 'accentColor':
        currentAccentColor = change.value;
        applyAccentColor(currentAccentColor);
        break;
      case 'taskbarMode':
        isTaskbarFloating = !!change.value;
        applyTaskbarMode();
        window.electronAPI.taskbar.setMode(isTaskbarFloating ? 'floating' : 'docked').catch(() => {});
        break;
      case 'time24h':
        time24h = !!change.value;
        updateTime();
        break;
      case 'notifyApps':
      case 'notifySystem':
      case 'notifyDnd':
        window.electronAPI.notify.list().then((data) => updateNotifyBadge(data)).catch(() => {});
        break;
    }
  });

  // 主进程下发的主题
  window.electronAPI.taskbar.onTheme(({ theme, accentColor, isTaskbarFloating: floating }) => {
    if (theme) {
      currentTheme = theme;
      applyTheme(theme);
    }
    if (accentColor) {
      currentAccentColor = accentColor;
      applyAccentColor(accentColor);
    }
    if (typeof floating === 'boolean') {
      isTaskbarFloating = floating;
      applyTaskbarMode();
    }
  });
}

// 无电池设备隐藏电池图标
async function applyBatteryVisibility() {
  try {
    const caps = await window.electronAPI.system.getCapabilities();
    const icon = document.getElementById('cc-battery-icon');
    if (icon && caps && caps.hasBattery === false) {
      icon.style.display = 'none';
    }
  } catch (e) {
    // 能力探测失败时保持显示
  }
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateTime();
  setInterval(updateTime, 1000);
  bindControlCenterEvents();
  bindTaskbarActions();
  bindTaskbarContextMenu();
  applyBatteryVisibility();
});
