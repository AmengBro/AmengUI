/**
 * 欢迎页面脚本
 */

// 当前主题
let currentTheme = 'dark';

// 任务栏状态
let isTaskbarFloating = true;

// 监听 ESC 键关闭页面
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
  }
});

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
  
  // 应用到日历相关元素
  const calendarDays = document.querySelectorAll('.calendar-day');
  calendarDays.forEach(day => {
    day.style.setProperty('--accent-color', color);
  });
  
  // 更新今天日期的背景色
  const todayElements = document.querySelectorAll('.calendar-day.today');
  todayElements.forEach(el => {
    el.style.backgroundColor = color;
  });
  
  // 更新选中日期的边框和文字颜色
  const selectedElements = document.querySelectorAll('.calendar-day.selected');
  selectedElements.forEach(el => {
    el.style.borderColor = color;
    el.style.color = color;
  });
  
  // 更新日历导航按钮悬停颜色
  const navButtons = document.querySelectorAll('.calendar-nav-btn');
  navButtons.forEach(btn => {
    btn.style.setProperty('--accent-color', color);
  });
}

/**
 * 显示右键菜单
 */
function showContextMenu(x, y, app) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'desktop-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  
  const menuItems = [
    { label: '打开', icon: '', action: () => launchApp(app) },
    { label: '属性', icon: '', action: () => showAppProperties(app) }
  ];
  
  menuItems.forEach((item, index) => {
    if (index > 0) {
      const separator = document.createElement('div');
      separator.className = 'context-menu-separator';
      menu.appendChild(separator);
    }
    
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    
    const iconSpan = document.createElement('span');
    iconSpan.textContent = item.icon;
    iconSpan.style.marginRight = '8px';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = item.label;
    
    menuItem.appendChild(iconSpan);
    menuItem.appendChild(textSpan);
    
    menuItem.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('[ContextMenu] Menu item clicked:', item.label, 'for app:', app.name);
      item.action();
      closeContextMenu();
    });
    
    menu.appendChild(menuItem);
  });
  
  document.body.appendChild(menu);
  
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('contextmenu', closeContextMenu);
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
    if (!desktopConfig || !desktopConfig.desktopapp || desktopConfig.desktopapp.length === 0) {
      console.log('[DesktopApps] No desktop apps found');
      return;
    }
    
    // 创建桌面应用容器
    const container = document.createElement('div');
    container.id = 'desktop-apps';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: calc(100% - 48px); padding: 20px; z-index: 1; pointer-events: auto;';
    document.body.appendChild(container);
    
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
  
  // 更新日历弹窗中的时间（精确到秒）
  const calendarTime = document.getElementById('calendar-time');
  if (calendarTime) {
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    calendarTime.textContent = `${hours}:${minutes}:${seconds}`;
  }
}

// 当前显示的年月
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth();

// 节假日数据
const holidays = {
  '2026-06-19': '端午节'
};

// 农历日期映射
const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
                   '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
                   '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

/**
 * 获取简单的农历日期（简化版）
 */
function getLunarDate(year, month, day) {
  // 简化的农历计算，实际应用中应该使用更精确的算法
  const lunarMonthIndex = (month + 2) % 12;
  const lunarDayIndex = (day - 1) % 30;
  return `${lunarMonths[lunarMonthIndex]}${lunarDays[lunarDayIndex]}`;
}

/**
 * 渲染日历
 */
function renderCalendar(year, month) {
  const daysContainer = document.getElementById('calendar-days');
  const monthYearElement = document.getElementById('calendar-month-year');
  const dateMainElement = document.getElementById('calendar-date-main');
  const dateLunarElement = document.getElementById('calendar-date-lunar');
  
  if (!daysContainer || !monthYearElement) return;
  
  // 更新月份年份显示
  monthYearElement.textContent = `${year}年${month + 1}月`;
  
  // 获取当前日期（始终显示今天的日期信息）
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDay = now.getDate();
  
  // 更新日期信息显示（始终显示今天）
  if (dateMainElement && dateLunarElement) {
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekDays[now.getDay()];
    
    dateMainElement.textContent = `${todayMonth + 1}月${todayDay}日, ${weekday}`;
    dateLunarElement.textContent = getLunarDate(todayYear, todayMonth, todayDay);
  }
  
  // 获取选中日期（如果没有选中，使用今天）
  let selectedDate = document.querySelector('.calendar-day.selected');
  let selectedYear = year;
  let selectedMonth = month;
  let selectedDay = todayDay;
  
  if (selectedDate) {
    selectedYear = parseInt(selectedDate.dataset.year);
    selectedMonth = parseInt(selectedDate.dataset.month);
    selectedDay = parseInt(selectedDate.dataset.day);
  }
  
  // 获取当月第一天和最后一天
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  // 清空日期格子
  daysContainer.innerHTML = '';
  
  // 获取第一天是星期几（星期一为0）
  let startDay = firstDay.getDay();
  if (startDay === 0) startDay = 7; // 星期日转为7
  startDay -= 1; // 转为从0开始（星期一为0）
  
  // 添加上个月的日期
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    addCalendarDay(daysContainer, prevYear, prevMonth, day, true, todayYear, todayMonth, todayDay, selectedYear, selectedMonth, selectedDay);
  }
  
  // 添加当月的日期
  for (let day = 1; day <= lastDay.getDate(); day++) {
    addCalendarDay(daysContainer, year, month, day, false, todayYear, todayMonth, todayDay, selectedYear, selectedMonth, selectedDay);
  }
  
  // 添加下个月的日期
  const remainingCells = 42 - daysContainer.children.length; // 6行 * 7列
  for (let day = 1; day <= remainingCells; day++) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    addCalendarDay(daysContainer, nextYear, nextMonth, day, true, todayYear, todayMonth, todayDay, selectedYear, selectedMonth, selectedDay);
  }
}

/**
 * 添加日历日期格子
 */
function addCalendarDay(container, year, month, day, isOtherMonth, todayYear, todayMonth, todayDay, selectedYear, selectedMonth, selectedDay) {
  const dayElement = document.createElement('div');
  dayElement.className = 'calendar-day';
  dayElement.dataset.year = year;
  dayElement.dataset.month = month;
  dayElement.dataset.day = day;
  
  if (isOtherMonth) {
    dayElement.classList.add('other-month');
  }
  
  // 标记今天
  if (year === todayYear && month === todayMonth && day === todayDay) {
    dayElement.classList.add('today');
  }
  
  // 标记选中日期（使用边框样式）
  if (year === selectedYear && month === selectedMonth && day === selectedDay) {
    dayElement.classList.add('selected');
  }
  
  // 检查是否是节假日
  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const holidayName = holidays[dateKey];
  
  // 创建日期显示
  const daySpan = document.createElement('span');
  daySpan.textContent = day;
  dayElement.appendChild(daySpan);
  
  // 添加农历日期或节假日
  const lunarSpan = document.createElement('span');
  if (holidayName) {
    lunarSpan.textContent = holidayName;
    dayElement.classList.add('holiday');
  } else {
    const lunarDate = getLunarDate(year, month, day);
    // 只显示农历日期中的日期部分（去掉月份）
    lunarSpan.textContent = lunarDate.replace(/[正二三四五六七八九十冬腊]月/, '');
  }
  dayElement.appendChild(lunarSpan);
  
  // 点击事件
  dayElement.addEventListener('click', () => {
    // 移除其他选中状态
    const selectedDays = document.querySelectorAll('.calendar-day.selected');
    selectedDays.forEach(el => el.classList.remove('selected'));
    
    // 设置当前选中
    dayElement.classList.add('selected');
  });
  
  container.appendChild(dayElement);
}

/**
 * 更新日历日期信息显示
 */
function updateCalendarDateInfo(year, month, day) {
  const dateMainElement = document.getElementById('calendar-date-main');
  const dateLunarElement = document.getElementById('calendar-date-lunar');
  
  if (dateMainElement && dateLunarElement) {
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const dateObj = new Date(year, month, day);
    const weekday = weekDays[dateObj.getDay()];
    
    dateMainElement.textContent = `${month + 1}月${day}日, ${weekday}`;
    dateLunarElement.textContent = getLunarDate(year, month, day);
  }
}

/**
 * 绑定日历事件
 */
function bindCalendarEvents() {
  const timeBtn = document.getElementById('taskbar-time-btn');
  const calendarPopup = document.getElementById('calendar-popup');
  const prevMonthBtn = document.getElementById('calendar-prev-month');
  const nextMonthBtn = document.getElementById('calendar-next-month');
  
  // 点击时间按钮切换日历显示
  if (timeBtn && calendarPopup) {
    timeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      calendarPopup.classList.toggle('hidden');
      
      // 如果显示日历，渲染当前月份
      if (!calendarPopup.classList.contains('hidden')) {
        renderCalendar(currentCalendarYear, currentCalendarMonth);
      }
    });
  }
  
  // 点击空白处关闭日历
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target.closest('.taskbar-time-container') && !calendarPopup.classList.contains('hidden')) {
      calendarPopup.classList.add('hidden');
    }
  });
  
  // 上一个月
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentCalendarMonth--;
      if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
      }
      renderCalendar(currentCalendarYear, currentCalendarMonth);
    });
  }
  
  // 下一个月
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentCalendarMonth++;
      if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
      }
      renderCalendar(currentCalendarYear, currentCalendarMonth);
    });
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
  
  // 绑定切换主题按钮
  const toggleBtn = document.getElementById('toggle-theme-btn');
  console.log('toggle-theme-btn found:', !!toggleBtn);
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      console.log('Toggle theme button clicked');
      toggleTheme();
    });
    console.log('toggle-theme-btn click listener added');
  }
  
  // 绑定切换任务栏按钮
  const toggleTaskbarBtn = document.getElementById('toggle-taskbar-btn');
  console.log('toggle-taskbar-btn found:', !!toggleTaskbarBtn);
  if (toggleTaskbarBtn) {
    toggleTaskbarBtn.addEventListener('click', () => {
      console.log('Toggle taskbar button clicked');
      toggleTaskbarMode();
    });
    console.log('toggle-taskbar-btn click listener added');
  }
  
  // 绑定测试按钮
  const testBtn = document.getElementById('test-btn');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      alert('Test button works!');
    });
  }
  
  // 初始化时间显示
  updateTime();
  // 每秒更新时间
  setInterval(updateTime, 1000);
  
  // 绑定日历事件
  bindCalendarEvents();
  
  // 初始化开始菜单
  initStartMenu();
});

// ==================== 开始菜单功能 ====================

/**
 * 初始化开始菜单
 */
function initStartMenu() {
  const startBtn = document.getElementById('start-btn');
  const startMenu = document.getElementById('start-menu');
  
  // 点击开始按钮切换菜单显示
  if (startBtn && startMenu) {
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStartMenu();
    });
  }
  
  // 点击空白处关闭菜单
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target.closest('.start-menu') && !target.closest('.start-btn')) {
      closeStartMenu();
    }
  });
  
  // ESC 键关闭菜单
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeStartMenu();
    }
  });
  
  // 加载应用列表
  loadStartMenuApps();
  
  // 加载用户信息
  loadUserInfo();
  
  // 绑定电源按钮
  bindPowerButtons();
  
  // 绑定用户菜单
  bindUserMenu();
}

/**
 * 切换开始菜单显示/隐藏
 */
function toggleStartMenu() {
  const startMenu = document.getElementById('start-menu');
  if (startMenu) {
    if (startMenu.classList.contains('hidden')) {
      startMenu.classList.remove('hidden');
    } else {
      startMenu.classList.add('hidden');
    }
  }
}

/**
 * 关闭开始菜单
 */
function closeStartMenu() {
  const startMenu = document.getElementById('start-menu');
  if (startMenu && !startMenu.classList.contains('hidden')) {
    startMenu.classList.add('hidden');
  }
}

/**
 * 加载用户信息到开始菜单
 */
async function loadUserInfo() {
  try {
    // 获取最后登录的用户ID
    const lastLoginUserId = await window.electronAPI.config.getLastLoginUserId();
    
    // 获取所有用户列表
    const users = await window.electronAPI.config.getUsers();
    if (!users || users.length === 0) return;
    
    // 根据最后登录的用户ID查找用户
    const user = users.find(u => u.userid === lastLoginUserId);
    
    // 如果找不到，使用第一个用户作为备选
    const currentUser = user || users[0];
    
    // 更新用户名显示
    const usernameElement = document.getElementById('start-menu-username');
    if (usernameElement && currentUser.username) {
      usernameElement.textContent = currentUser.username;
    }
    
  } catch (error) {
    console.error('Failed to load user info:', error);
  }
}

/**
 * 加载开始菜单应用列表
 */
async function loadStartMenuApps() {
  try {
    const userId = await getCurrentUserId();
    const desktopData = await window.electronAPI.config.getUserDesktop(userId);
    const apps = desktopData ? desktopData.desktopapp : [];
    const appList = document.getElementById('start-menu-app-list');
    
    if (!appList) return;
    
    // 清空现有内容
    appList.innerHTML = '';
    
    if (!apps || apps.length === 0) {
      return;
    }
    
    // 创建应用项
    for (const app of apps) {
      const appItem = document.createElement('div');
      appItem.className = 'start-menu-app-item';
      appItem.dataset.appName = app.start;
      
      // 获取应用图标（优先使用 desktop.json 中的图标，否则从 .app 文件获取）
      let iconPath = app.icon;
      
      // 如果 desktop.json 中的图标为空或无效，尝试从 .app 文件获取
      if (!iconPath || iconPath.trim() === '' || !isValidImagePath(iconPath)) {
        const appInfo = await getAppInfo(app.start);
        if (appInfo && appInfo.icon && isValidImagePath(appInfo.icon)) {
          iconPath = appInfo.icon;
        }
      }
      
      // 图标
      const iconElement = document.createElement('img');
      iconElement.className = 'start-menu-app-icon';
      
      // 使用最终确定的图标路径，无效则使用默认图标
      const finalIconPath = isValidImagePath(iconPath) ? iconPath : '../difproico.png';
      iconElement.src = finalIconPath;
      
      iconElement.onerror = () => {
        iconElement.src = '../difproico.png';
      };
      
      // 名称
      const nameElement = document.createElement('span');
      nameElement.className = 'start-menu-app-name';
      nameElement.textContent = app.name;
      
      appItem.appendChild(iconElement);
      appItem.appendChild(nameElement);
      appList.appendChild(appItem);
      
      // 点击启动应用
      appItem.addEventListener('click', async () => {
        console.log('Launching app from start menu:', app.start);
        closeStartMenu();
        const result = await window.electronAPI.app.launch(app.start);
        if (!result.success) {
          alert(`启动失败: ${result.error}`);
        }
      });
    }
  } catch (error) {
    console.error('Failed to load start menu apps:', error);
  }
}

/**
 * 绑定电源按钮事件
 */
function bindPowerButtons() {
  const powerBtn = document.getElementById('power-btn-main');
  const powerSubmenu = document.getElementById('power-submenu');
  
  // 点击电源按钮切换子菜单
  if (powerBtn && powerSubmenu) {
    powerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (powerSubmenu.classList.contains('hidden')) {
        powerSubmenu.classList.remove('hidden');
      } else {
        powerSubmenu.classList.add('hidden');
      }
    });
  }
  
  // 点击其他地方关闭子菜单
  document.addEventListener('click', () => {
    if (powerSubmenu && !powerSubmenu.classList.contains('hidden')) {
      powerSubmenu.classList.add('hidden');
    }
  });
  
  // 关机按钮
  const shutdownBtn = document.getElementById('start-menu-shutdown');
  if (shutdownBtn) {
    shutdownBtn.addEventListener('click', () => {
      closePowerSubmenu();
      closeStartMenu();
      // 显示确认弹窗（模拟操作，不执行真实关机）
      showConfirmModal('确认关机吗？', () => {
        alert('你正在关机');
      });
    });
  }
  
  // 重启按钮
  const restartBtn = document.getElementById('start-menu-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      closePowerSubmenu();
      closeStartMenu();
      // 显示确认弹窗（模拟操作，不执行真实重启）
      showConfirmModal('确认重新启动吗？', () => {
        alert('你正在重新启动');
      });
    });
  }
  
  // Shell模式按钮
  const shellBtn = document.getElementById('start-menu-shell');
  if (shellBtn) {
    shellBtn.addEventListener('click', () => {
      closePowerSubmenu();
      closeStartMenu();
      // 显示确认弹窗（模拟操作）
      showConfirmModal('确认进入Shell模式吗？', () => {
        alert('你正在进入Shell模式');
      });
    });
  }
}

/**
 * 关闭电源子菜单
 */
function closePowerSubmenu() {
  const powerSubmenu = document.getElementById('power-submenu');
  if (powerSubmenu && !powerSubmenu.classList.contains('hidden')) {
    powerSubmenu.classList.add('hidden');
  }
}

/**
 * 绑定用户菜单按钮事件
 */
function bindUserMenu() {
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userSubmenu = document.getElementById('user-submenu');
  
  if (userMenuBtn && userSubmenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePowerSubmenu();
      if (userSubmenu.classList.contains('hidden')) {
        userSubmenu.classList.remove('hidden');
      } else {
        userSubmenu.classList.add('hidden');
      }
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
      closeStartMenu();
      showConfirmModal('确认锁定吗？', () => {
        window.electronAPI.window.openDashboard();
      });
    });
  }
  
  const logoutBtn = document.getElementById('start-menu-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      closeUserSubmenu();
      closeStartMenu();
      showConfirmModal('确认注销吗？', () => {
        window.electronAPI.window.openDashboard();
      });
    });
  }
}

/**
 * 关闭用户子菜单
 */
function closeUserSubmenu() {
  const userSubmenu = document.getElementById('user-submenu');
  if (userSubmenu && !userSubmenu.classList.contains('hidden')) {
    userSubmenu.classList.add('hidden');
  }
}