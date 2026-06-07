/**
 * 欢迎页面脚本
 */

// 当前主题
let currentTheme = 'dark';

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
  const newTheme = currentTheme === 'dark' ? 'bright' : 'dark';
  currentTheme = newTheme;
  applyTheme(newTheme);
  
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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  
  // 绑定切换主题按钮
  const toggleBtn = document.getElementById('toggle-theme-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleTheme);
  }
});