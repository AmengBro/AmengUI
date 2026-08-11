/**
 * 欢迎页面脚本
 */

// 当前主题
let currentTheme = 'dark';

// 任务栏状态
let isTaskbarFloating = true;

// 剪贴板状态：null | { mode: 'copy'|'cut', app: Object }
let clipboard = null;

// 右键菜单图标库（内联SVG）
const MENU_ICONS = {
  open: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>',
  properties: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v15c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5h-2v5H3V6h14v8h2zM12 2H4v2h8V2zm9 9.41L19.59 10 17 12.59 14.41 10 13 11.41 15.59 14 13 16.59 14.41 18 17 15.41 19.59 18 21 16.59 18.41 14 21 11.41z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
  cut: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z"/></svg>',
  paste: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
  taskManager: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>'
};

// 点击空白处取消应用选中状态
document.addEventListener('click', (e) => {
  const target = e.target;
  // 如果点击的不是桌面应用且不是其子元素，取消所有选中状态
  if (!target.closest('.desktop-app')) {
    const selectedApps = document.querySelectorAll('.desktop-app.selected');
    selectedApps.forEach(el => el.classList.remove('selected'));
  }
});

// 当前主题色（从配置文件读取）
let currentAccentColor = '#0078D4';

// 页面加载时获取用户主题设置
async function initTheme() {
  try {
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) return;
    
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
    }
  } catch (error) {
    console.error('Failed to load theme settings:', error);
  }
}

/**
 * 应用主题色到所有需要的元素
 */
function applyAccentColor(color) {
  // 创建 CSS 变量
  document.documentElement.style.setProperty('--accent-color', color);
}

/**
 * 显示右键菜单（应用图标 / 桌面空白处）
 * @param {number} x - 屏幕坐标x
 * @param {number} y - 屏幕坐标y
 * @param {Object|null} app - 应用对象，为null时显示桌面空白菜单
 */
function showContextMenu(x, y, app) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'desktop-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  let menuItems;
  if (app) {
    // 应用图标右键菜单
    menuItems = [
      { label: '打开', icon: MENU_ICONS.open, action: () => launchApp(app) },
      { label: '复制', icon: MENU_ICONS.copy, action: () => copyApp(app) },
      { label: '剪切', icon: MENU_ICONS.cut, action: () => cutApp(app) },
      { label: '移除', icon: MENU_ICONS.remove, action: () => removeDesktopApp(app) },
      { label: '属性', icon: MENU_ICONS.properties, action: () => showAppProperties(app) }
    ];
  } else {
    // 桌面空白处右键菜单
    menuItems = [
      { label: '刷新', icon: MENU_ICONS.refresh, action: () => refreshDesktop() },
      { label: '设置', icon: MENU_ICONS.settings, action: () => openSettings() }
    ];
    // 仅在有剪贴板内容时显示粘贴
    if (clipboard) {
      menuItems.push({ label: '粘贴', icon: MENU_ICONS.paste, action: () => pasteApp(x, y) });
    }
  }

  menuItems.forEach((item, index) => {
    if (index > 0) {
      const separator = document.createElement('div');
      separator.className = 'context-menu-separator';
      menu.appendChild(separator);
    }

    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'context-menu-icon';
    iconSpan.innerHTML = item.icon;

    const textSpan = document.createElement('span');
    textSpan.textContent = item.label;

    menuItem.appendChild(iconSpan);
    menuItem.appendChild(textSpan);

    menuItem.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('[ContextMenu] Menu item clicked:', item.label);
      item.action();
      closeContextMenu();
    });

    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);
  clampContextMenuToViewport(menu, x, y);

  document.addEventListener('click', closeContextMenu);
  document.addEventListener('contextmenu', closeContextMenu);
}

/**
 * 将右键菜单位置钳制在视口内，避免超出窗口/屏幕边缘
 * @param {HTMLElement} menu - 已插入 DOM 的菜单元素
 * @param {number} x - 原始鼠标 X 坐标
 * @param {number} y - 原始鼠标 Y 坐标
 */
function clampContextMenuToViewport(menu, x, y) {
  const rect = menu.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  menu.style.left = `${Math.min(Math.max(x, margin), maxLeft)}px`;
  menu.style.top = `${Math.min(Math.max(y, margin), maxTop)}px`;
}

/**
 * 关闭右键菜单
 */
function closeContextMenu() {
  const menu = document.getElementById('desktop-context-menu');
  if (menu) {
    menu.remove();
  }
  document.removeEventListener('click', closeContextMenu);
  document.removeEventListener('contextmenu', closeContextMenu);
}

/**
 * 复制应用（仅写入剪贴板，不修改桌面）
 */
function copyApp(app) {
  clipboard = { mode: 'copy', app: { ...app } };
  console.log('[Clipboard] Copied app:', app.name);
}

/**
 * 剪切应用（写入剪贴板并淡化图标）
 */
function cutApp(app) {
  // 清除之前的剪切淡化效果
  clearCutHighlight();
  clipboard = { mode: 'cut', app: { ...app } };
  // 淡化当前剪切的应用图标
  const el = document.querySelector(`.desktop-app[data-app-id="${app.id}"]`);
  if (el) el.classList.add('cut');
  console.log('[Clipboard] Cut app:', app.name);
}

/**
 * 清除所有剪切淡化效果
 */
function clearCutHighlight() {
  document.querySelectorAll('.desktop-app.cut').forEach(el => el.classList.remove('cut'));
}

/**
 * 移除桌面图标（仅移除桌面快捷方式，不影响应用本身与开始菜单）
 * @param {Object} app - 桌面应用对象（含 id）
 */
async function removeDesktopApp(app) {
  try {
    if (!app || app.id === undefined) return;
    const userId = await getCurrentUserId();
    if (!userId) return;
    await window.electronAPI.config.removeDesktopApp(userId, app.id);
    console.log('[Desktop] Removed app:', app.name);
    await refreshDesktop();
  } catch (error) {
    console.error('[Desktop] Remove app failed:', error);
  }
}

/**
 * 粘贴应用
 * @param {number} x - 粘贴位置x
 * @param {number} y - 粘贴位置y
 */
async function pasteApp(x, y) {
  if (!clipboard) return;
  try {
    const userId = await getCurrentUserId();
    if (clipboard.mode === 'copy') {
      // 复制：新增一个应用
      const newApp = {
        name: clipboard.app.name,
        start: clipboard.app.start,
        icon: clipboard.app.icon || null,
        x: x,
        y: y
      };
      await window.electronAPI.config.addDesktopApp(userId, newApp);
      console.log('[Clipboard] Pasted (copied) app:', newApp.name);
    } else if (clipboard.mode === 'cut') {
      // 剪切：更新位置，移除淡化，清空剪贴板
      await window.electronAPI.config.updateDesktopAppPosition(userId, clipboard.app.id, x, y);
      clearCutHighlight();
      clipboard = null;
      console.log('[Clipboard] Pasted (cut) app, clipboard cleared');
    }
    // 刷新桌面
    await refreshDesktop();
  } catch (error) {
    console.error('[Clipboard] Paste failed:', error);
  }
}

/**
 * 刷新桌面（重新加载应用）
 */
async function refreshDesktop() {
  const container = document.getElementById('desktop-apps');
  if (container) container.remove();
  clipboard = null;
  await loadDesktopApps();
  console.log('[Desktop] Refreshed');
}

/**
 * 打开临时设置窗口
 */
function openSettings() {
  const bgImage = document.body.style.backgroundImage;
  const desktopBackground = bgImage ? bgImage.replace(/^url\(['"]?(.*?)['"]?\)$/, '$1') : null;
  
  const settingsData = {
    theme: currentTheme,
    accentColor: currentAccentColor,
    isTaskbarFloating: isTaskbarFloating,
    desktopBackground: desktopBackground
  };
  window.electronAPI.settings.show(settingsData);
}

/**
 * 监听设置变更（从设置窗口发送）
 */
window.electronAPI.settings.onChange(async (change) => {
  console.log('[Settings] Received settings change:', change);
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
      isTaskbarFloating = change.value;
      const taskbar = document.getElementById('taskbar');
      if (taskbar) {
        if (isTaskbarFloating) {
          taskbar.classList.remove('docked');
          taskbar.classList.add('floating');
        } else {
          taskbar.classList.remove('floating');
          taskbar.classList.add('docked');
        }
      }
      break;
    case 'desktopBackground':
      if (change.value) {
        document.body.style.backgroundImage = `url('${change.value}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
      } else {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.body.style.backgroundRepeat = '';
      }
      const userId = await getCurrentUserId();
      if (userId) {
        await window.electronAPI.config.setDesktopBackground(userId, change.value);
      }
      break;
  }
});

/**
 * 启动应用
 */
async function launchApp(app) {
  console.log('Launching app:', app.start);
  const result = await window.electronAPI.app.launch(app.start);
  if (result.success) {
    console.log('App launched:', result.appName);
  } else {
    console.error('Failed to launch app:', result.error);
    alert(`启动失败: ${result.error}`);
  }
}

/**
 * 显示应用属性窗口
 */
async function showAppProperties(app) {
  try {
    console.log('[Properties] showAppProperties called for app:', app.name, 'start:', app.start);
    
    // 获取应用详细信息
    console.log('[Properties] Getting app info...');
    const appInfo = await getAppInfo(app.start);
    console.log('[Properties] App info received:', JSON.stringify(appInfo));
    
    // 获取当前主题设置
    console.log('[Properties] Getting current user ID...');
    const userId = await getCurrentUserId();
    console.log('[Properties] User ID received:', userId);
    
    console.log('[Properties] Getting settings for user:', userId);
    const settings = await window.electronAPI.config.getSettings(userId);
    console.log('[Properties] Settings received:', JSON.stringify(settings));
    
    // 调用主进程创建独立的属性窗口
    const appData = {
      id: app.id,
      name: app.name,
      start: app.start,
      description: appInfo ? (appInfo.description || '') : '',
      exePath: appInfo ? (appInfo.exePath || '') : '',
      icon: appInfo ? (appInfo.icon || '') : '',
      theme: settings.theme || 'dark',
      accentColor: settings.accentColor || '#0078D4'
    };
    
    console.log('[Properties] Sending app data to main process:', JSON.stringify(appData));
    await window.electronAPI.properties.show(appData);
    console.log('[Properties] Properties window shown');
  } catch (error) {
    console.error('[Properties] Error in showAppProperties:', error);
    console.error('[Properties] Error stack:', error.stack);
  }
}

/**
 * 关闭属性窗口（已改为独立窗口，此函数保留兼容）
 */
function closePropertiesWindow() {
  // 属性窗口现在是独立的 Electron BrowserWindow，
  // 由用户通过关闭按钮或 ESC 键自行关闭
}

// 获取当前登录用户ID
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

// 加载桌面背景
async function loadDesktopBackground() {
  try {
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) return;
    
    // 获取当前用户的桌面配置
    const desktopConfig = await window.electronAPI.config.getUserDesktop(currentUserId);
    if (desktopConfig && desktopConfig.desktopbg) {
      document.body.style.backgroundImage = `url(${desktopConfig.desktopbg})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
    }
  } catch (error) {
    console.error('Failed to load desktop background:', error);
  }
}

// 加载桌面应用图标
async function loadDesktopApps() {
  console.log('[DesktopApps] loadDesktopApps called');
  try {
    const currentUserId = await getCurrentUserId();
    console.log('[DesktopApps] Current user ID:', currentUserId);
    if (!currentUserId) {
      console.log('[DesktopApps] No current user ID, returning');
      return;
    }
    
    // 获取当前用户的桌面配置
    const desktopConfig = await window.electronAPI.config.getUserDesktop(currentUserId);
    console.log('[DesktopApps] Desktop config:', JSON.stringify(desktopConfig));
    
    // 创建桌面应用容器
    const container = document.createElement('div');
    container.id = 'desktop-apps';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: calc(100% - 48px); padding: 20px; z-index: 1; pointer-events: auto;';
    document.body.appendChild(container);

    // 桌面空白处右键菜单
    container.addEventListener('contextmenu', (e) => {
      // 只在点击空白处时触发（非应用图标）
      if (e.target === container) {
        e.preventDefault();
        e.stopPropagation();
        closeContextMenu();
        showContextMenu(e.clientX, e.clientY, null);
      }
    });

    // 无图标时容器仍需保留，保证空白处右键菜单可用
    if (!desktopConfig || !desktopConfig.desktopapp || desktopConfig.desktopapp.length === 0) {
      console.log('[DesktopApps] No desktop apps found, keeping empty container for right-click');
      return;
    }
    
    // 渲染每个桌面应用
    for (const app of desktopConfig.desktopapp) {
      // 获取应用图标（优先使用 desktop.json 中的图标，否则从 .app 文件获取）
      let iconPath = app.icon;
      
      // 如果 desktop.json 中的图标为空或无效，尝试从 .app 文件获取
      if (!iconPath || iconPath.trim() === '' || !isValidImagePath(iconPath)) {
        const appInfo = await getAppInfo(app.start);
        if (appInfo && appInfo.icon && isValidImagePath(appInfo.icon)) {
          iconPath = appInfo.icon;
        }
      }
      
      const appElement = document.createElement('div');
      appElement.className = 'desktop-app';
      appElement.dataset.appId = app.id;
      appElement.dataset.userId = currentUserId;
      appElement.style.cssText = `
        position: absolute;
        left: ${app.x || 15}px;
        top: ${app.y || 15}px;
        width: 80px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: grab;
        padding: 8px;
        border-radius: 8px;
        transition: background 0.2s ease;
        user-select: none;
        -webkit-user-select: none;
      `;
      
      // 图标
      const iconElement = document.createElement('img');
      // 使用最终确定的图标路径，无效则使用默认图标
      const finalIconPath = isValidImagePath(iconPath) ? iconPath : '../difproico.png';
      iconElement.src = finalIconPath;
      iconElement.alt = app.name;
      iconElement.style.cssText = 'width: 48px; height: 48px; margin-bottom: 4px;';
      iconElement.onerror = function() {
        console.log('[DesktopApps] Icon load failed, using default:', finalIconPath);
        this.src = '../difproico.png';
      };
      
      // 名称
      const nameElement = document.createElement('span');
      nameElement.textContent = app.name;
      nameElement.style.cssText = 'font-size: 12px; text-align: center; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      nameElement.className = 'app-name';
      
      // 添加鼠标悬停效果
      appElement.addEventListener('mouseenter', () => {
        if (!appElement.classList.contains('dragging')) {
          appElement.classList.add('hovered');
        }
      });
      appElement.addEventListener('mouseleave', () => {
        appElement.classList.remove('hovered');
      });
      
      // 单击选择应用
      appElement.addEventListener('click', (e) => {
        e.preventDefault();
        // 移除其他选中状态
        const selectedApps = document.querySelectorAll('.desktop-app.selected');
        selectedApps.forEach(el => el.classList.remove('selected'));
        
        // 切换当前应用选中状态
        appElement.classList.toggle('selected');
      });
      
      // 双击启动应用
      appElement.addEventListener('dblclick', async (e) => {
        e.preventDefault();
        // 移除选中状态
        appElement.classList.remove('selected');
        console.log('Launching app:', app.start);
        const result = await window.electronAPI.app.launch(app.start);
        if (result.success) {
          console.log('App launched:', result.appName);
        } else {
          console.error('Failed to launch app:', result.error);
          alert(`启动失败: ${result.error}`);
        }
      });
      
      // 右键菜单事件
      appElement.addEventListener('contextmenu', (e) => {
        console.log('[DesktopApps] Contextmenu event fired for app:', app.name);
        e.preventDefault();
        e.stopPropagation();
        
        // 先关闭已有的右键菜单
        closeContextMenu();
        
        // 选中当前应用
        const selectedApps = document.querySelectorAll('.desktop-app.selected');
        selectedApps.forEach(el => el.classList.remove('selected'));
        appElement.classList.add('selected');
        
        // 创建右键菜单
        showContextMenu(e.clientX, e.clientY, app);
      });
      
      // 拖动相关变量
      let isDragging = false;
      let dragOffsetX = 0;
      let dragOffsetY = 0;
      
      // 鼠标按下事件
      appElement.addEventListener('mousedown', (e) => {
        // 阻止事件冒泡，避免触发点击事件
        e.preventDefault();
        e.stopPropagation();
        
        // 移除其他选中状态并选中当前应用
        const selectedApps = document.querySelectorAll('.desktop-app.selected');
        selectedApps.forEach(el => el.classList.remove('selected'));
        appElement.classList.add('selected');
        
        // 开始拖动
        isDragging = true;
        appElement.classList.add('dragging');
        appElement.style.cursor = 'grabbing';
        
        // 计算鼠标相对于元素左上角的偏移
        const rect = appElement.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        
        // 设置拖动时的样式
        appElement.style.zIndex = 100;
        appElement.style.opacity = '0.8';
        
        // 添加全局鼠标移动和松开事件
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
      
      // 鼠标移动事件
      function onMouseMove(e) {
        if (!isDragging) return;
        
        // 计算新位置（确保在窗口范围内）
        const containerRect = container.getBoundingClientRect();
        let newX = e.clientX - dragOffsetX - containerRect.left;
        let newY = e.clientY - dragOffsetY - containerRect.top;
        
        // 限制在窗口范围内
        newX = Math.max(0, Math.min(newX, containerRect.width - 80));
        newY = Math.max(0, Math.min(newY, containerRect.height - 80));
        
        // 更新位置
        appElement.style.left = `${newX}px`;
        appElement.style.top = `${newY}px`;
      }
      
      // 鼠标松开事件
      function onMouseUp(e) {
        if (!isDragging) return;
        
        isDragging = false;
        appElement.classList.remove('dragging');
        appElement.style.cursor = 'grab';
        appElement.style.zIndex = '1';
        appElement.style.opacity = '1';
        
        // 移除全局事件监听
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // 保存新位置到配置文件
        const finalX = parseInt(appElement.style.left) || 0;
        const finalY = parseInt(appElement.style.top) || 0;
        
        window.electronAPI.config.updateDesktopAppPosition(
          currentUserId,
          app.id,
          finalX,
          finalY
        ).then(result => {
          if (result) {
            console.log(`App ${app.name} position updated to (${finalX}, ${finalY})`);
          } else {
            console.error('Failed to update app position');
          }
        }).catch(error => {
          console.error('Error updating app position:', error);
        });
      }
      
      appElement.appendChild(iconElement);
      appElement.appendChild(nameElement);
      container.appendChild(appElement);
    }
    
    console.log('[DesktopApps] loadDesktopApps completed successfully');
    
  } catch (error) {
    console.error('Failed to load desktop apps:', error);
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

// 应用主题
function applyTheme(theme) {
  if (theme === 'bright') {
    document.body.classList.add('theme-bright');
  } else {
    document.body.classList.remove('theme-bright');
  }
}

// 切换主题
async function toggleTheme() {
  console.log('toggleTheme called');
  const newTheme = currentTheme === 'dark' ? 'bright' : 'dark';
  currentTheme = newTheme;
  applyTheme(newTheme);
  console.log('Theme changed to:', newTheme);
  
  // 保存到用户配置
  try {
    const currentUserId = await getCurrentUserId();
    if (currentUserId) {
      await window.electronAPI.config.setTheme(newTheme, currentUserId);
    }
  } catch (error) {
    console.error('Failed to save theme settings:', error);
  }
}

// 切换任务栏模式
function toggleTaskbarMode() {
  console.log('toggleTaskbarMode called');
  const taskbar = document.getElementById('taskbar');
  if (taskbar) {
    isTaskbarFloating = !isTaskbarFloating;
    if (isTaskbarFloating) {
      taskbar.classList.remove('docked');
      taskbar.classList.add('floating');
    } else {
      taskbar.classList.remove('floating');
      taskbar.classList.add('docked');
    }
    console.log('Taskbar mode changed to:', isTaskbarFloating ? 'floating' : 'docked');
  }
}

// 更新时间显示
function updateTime() {
  const now = new Date();
  
  // 更新任务栏时间显示
  const timeDisplay = document.getElementById('time-display');
  const dateDisplay = document.getElementById('date-display');
  
  if (timeDisplay) {
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    timeDisplay.textContent = `${hours}:${minutes}`;
  }
  
  if (dateDisplay) {
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekDays[now.getDay()];
    dateDisplay.textContent = `${month}月${day}日 周${weekday}`;
  }
}

// 暴露到全局作用域
window.toggleTheme = toggleTheme;
window.toggleTaskbarMode = toggleTaskbarMode;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded triggered');
  
  // 立即暴露函数到全局作用域
  window.toggleTheme = toggleTheme;
  window.toggleTaskbarMode = toggleTaskbarMode;
  console.log('Functions exposed to global scope');
  
  initTheme().then(() => {
    console.log('initTheme completed');
  }).catch(err => {
    console.error('initTheme failed:', err);
  });
  
  loadDesktopBackground().then(() => {
    console.log('loadDesktopBackground completed');
  }).catch(err => {
    console.error('loadDesktopBackground failed:', err);
  });
  
  loadDesktopApps().then(() => {
    console.log('loadDesktopApps completed');
  }).catch(err => {
    console.error('loadDesktopApps failed:', err);
  });
  
  // 初始化时间显示
  updateTime();
  // 每秒更新时间
  setInterval(updateTime, 1000);

  // 绑定控制中心图标事件
  bindControlCenterEvents();

  // 绑定开始菜单/日历浮层按钮（独立置顶窗口）
  bindFloatingMenuEvents();

  // 绑定任务栏右键菜单
  bindTaskbarContextMenu();
});

// ==================== 浮层菜单（独立置顶窗口） ====================

/**
 * 绑定开始按钮/时间按钮到独立浮层窗口，并同步高亮态与桌面刷新
 */
function bindFloatingMenuEvents() {
  const startBtn = document.getElementById('start-btn');
  const timeBtn = document.getElementById('taskbar-time-btn');

  if (startBtn) {
    startBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const r = await window.electronAPI.startMenu.toggle({ isTaskbarFloating });
        startBtn.classList.toggle('active', !!(r && r.open));
      } catch (err) {
        console.error('[Dashboard] 打开开始菜单失败:', err);
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
        console.error('[Dashboard] 打开日历失败:', err);
      }
    });
  }

  // 浮层窗口内部关闭（ESC/失焦）时同步按钮高亮
  window.electronAPI.startMenu.onState((open) => {
    if (startBtn) startBtn.classList.toggle('active', !!open);
  });
  window.electronAPI.calendar.onState((open) => {
    if (timeBtn) timeBtn.classList.toggle('active', !!open);
  });

  // 开始菜单“发送到桌面”后刷新桌面网格
  window.electronAPI.desktop.onRefresh(() => {
    refreshDesktop();
  });
}

// ==================== 任务栏右键菜单 ====================

/**
 * 任务栏右键菜单（设置 / 任务管理器）
 */
function showTaskbarContextMenu(x, y) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'desktop-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const items = [
    {
      label: '设置',
      icon: MENU_ICONS.settings,
      action: () => openSettings(),
    },
    {
      label: '任务管理器',
      icon: MENU_ICONS.taskManager,
      action: () => launchTaskManager(),
    },
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

/**
 * 启动任务管理器（SystemInformer，com.sysinformer.app）
 */
async function launchTaskManager() {
  try {
    const result = await window.electronAPI.app.launch('com.sysinformer.app');
    if (!result || !result.success) {
      alert(`任务管理器启动失败: ${(result && result.error) || '未知错误'}`);
    }
  } catch (err) {
    console.error('[Dashboard] 任务管理器启动失败:', err);
    alert('任务管理器启动失败: ' + err.message);
  }
}

/**
 * 绑定任务栏右键菜单
 */
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

/**
 * 绑定控制中心图标事件
 */
function bindControlCenterEvents() {
  const controlCenterBtn = document.getElementById('btn-control-center');
  
  const showControlCenter = async () => {
    try {
      await window.electronAPI.controlCenter.show();
    } catch (e) {
      console.error('Failed to show control center:', e);
    }
  };
  
  if (controlCenterBtn) {
    controlCenterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showControlCenter();
    });
  }
}
