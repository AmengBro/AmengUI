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

// 页面加载时获取用户主题设置
async function initTheme() {
  try {
    const settings = await window.electronAPI.config.getSettings();
    if (settings && settings.theme) {
      currentTheme = settings.theme;
      applyTheme(currentTheme);
    }
  } catch (error) {
    console.error('Failed to load theme settings:', error);
  }
}

// 加载桌面背景
async function loadDesktopBackground() {
  try {
    const users = await window.electronAPI.config.getUsers();
    if (!users || users.length === 0) return;
    
    // 获取第一个用户的桌面配置
    const desktopConfig = await window.electronAPI.config.getUserDesktop(users[0].userid);
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
  try {
    const users = await window.electronAPI.config.getUsers();
    if (!users || users.length === 0) return;
    
    // 获取第一个用户的桌面配置
    const desktopConfig = await window.electronAPI.config.getUserDesktop(users[0].userid);
    if (!desktopConfig || !desktopConfig.desktopapp || desktopConfig.desktopapp.length === 0) return;
    
    // 创建桌面应用容器
    const container = document.createElement('div');
    container.id = 'desktop-apps';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: calc(100% - 48px); padding: 20px; z-index: 1; pointer-events: auto;';
    document.body.appendChild(container);
    
    // 渲染每个桌面应用
    desktopConfig.desktopapp.forEach(app => {
      const appElement = document.createElement('div');
      appElement.className = 'desktop-app';
      appElement.style.cssText = `
        position: absolute;
        left: ${app.x || 15}px;
        top: ${app.y || 15}px;
        width: 80px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        transition: background 0.2s ease;
      `;
      
      // 图标
      const iconElement = document.createElement('img');
      // 检查是否是有效的图片路径（以常见图片扩展名结尾）
      const isValidImagePath = app.icon && (app.icon.endsWith('.png') || app.icon.endsWith('.jpg') || app.icon.endsWith('.jpeg') || app.icon.endsWith('.ico') || app.icon.endsWith('.gif'));
      iconElement.src = isValidImagePath ? app.icon : '../difproico.png';
      iconElement.alt = app.name;
      iconElement.style.cssText = 'width: 48px; height: 48px; margin-bottom: 4px;';
      iconElement.onerror = function() {
        this.src = '../difproico.png';
      };
      
      // 名称
      const nameElement = document.createElement('span');
      nameElement.textContent = app.name;
      nameElement.style.cssText = 'font-size: 12px; text-align: center; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      nameElement.className = 'app-name';
      
      // 添加鼠标悬停效果
      appElement.addEventListener('mouseenter', () => {
        appElement.classList.add('hovered');
      });
      appElement.addEventListener('mouseleave', () => {
        appElement.classList.remove('hovered');
      });
      
      appElement.appendChild(iconElement);
      appElement.appendChild(nameElement);
      container.appendChild(appElement);
    });
    
  } catch (error) {
    console.error('Failed to load desktop apps:', error);
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
    // 需要获取当前用户ID，这里暂时硬编码为1
    const users = await window.electronAPI.config.getUsers();
    if (users && users.length > 0) {
      await window.electronAPI.config.setTheme(newTheme, users[0].userid);
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
  const timeElement = document.getElementById('taskbar-time');
  if (timeElement) {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    timeElement.textContent = `${hours}:${minutes}`;
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
});