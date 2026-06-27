/**
 * Windows 11 登录界面渲染进程脚本
 * 负责界面交互、用户验证和配置加载
 */

// 当前选中的用户
let currentUser = null;
// 用户列表
let users = [];
// 应用设置
let settings = null;
// 遮罩窗回调
let modalCallback = null;

/**
 * 页面加载完成后初始化
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();           // 加载用户和设置数据
  setupEventListeners();      // 设置事件监听器
  updateDateTime();           // 更新时间显示
  setInterval(updateDateTime, 1000);  // 每秒更新时间
});

/**
 * 从主进程加载用户和设置数据
 */
async function loadData() {
  // 获取用户列表
  users = await window.electronAPI.config.getUsers();
  
  // 尝试获取上次登录的用户
  const lastLoginUserId = await window.electronAPI.config.getLastLoginUserId();
  let userToSelect = null;
  
  if (lastLoginUserId) {
    // 找到上次登录的用户
    userToSelect = users.find(u => u.userid === lastLoginUserId);
  }
  
  // 如果没找到上次登录的用户，默认选中第一个
  if (!userToSelect && users.length > 0) {
    userToSelect = users[0];
  }
  
  if (userToSelect) {
    await selectUser(userToSelect);
  }

  // 渲染用户列表
  renderUserList();
  
  // 更新切换用户按钮可见性
  updateSwitchUserButtonVisibility();
}

/**
 * 更新切换用户按钮的可见性
 */
function updateSwitchUserButtonVisibility() {
  const switchBtn = document.getElementById('switch-user-btn');
  if (switchBtn) {
    if (users.length > 1) {
      switchBtn.style.display = 'flex';
    } else {
      switchBtn.style.display = 'none';
    }
  }
}

/**
 * 设置所有事件监听器
 */
function setupEventListeners() {
  // 登录按钮点击事件
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  
  // 密码输入框回车事件
  document.getElementById('password-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  
  // 密码显示/隐藏切换
  document.getElementById('toggle-password').addEventListener('click', togglePassword);
  
  // 背景更改按钮（已隐藏，保留功能）
  document.getElementById('change-bg-btn').addEventListener('click', changeBackground);
  
  // 切换用户按钮
  document.getElementById('switch-user-btn').addEventListener('click', toggleUserPanel);
  
  // 电源按钮
  document.getElementById('power-btn').addEventListener('click', togglePowerMenu);
  
  // 电源菜单项
  document.getElementById('btn-shutdown').addEventListener('click', handleShutdown);
  document.getElementById('btn-restart').addEventListener('click', handleRestart);
  document.getElementById('btn-shell').addEventListener('click', handleShellMode);
  
  // 点击其他区域关闭面板
  document.addEventListener('click', (e) => {
    const userPanel = document.getElementById('users-panel');
    const switchBtn = document.getElementById('switch-user-btn');
    const powerMenu = document.getElementById('power-menu');
    const powerBtn = document.getElementById('power-btn');
    
    if (!userPanel.contains(e.target) && !switchBtn.contains(e.target)) {
      userPanel.classList.add('hidden');
    }
    
    if (!powerMenu.contains(e.target) && !powerBtn.contains(e.target)) {
      powerMenu.classList.add('hidden');
    }
  });
  
  // 遮罩窗按钮事件
  setupModal();
}

/**
 * 设置遮罩窗事件
 */
function setupModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const confirmBtn = document.getElementById('modal-btn-confirm');
  const cancelBtn = document.getElementById('modal-btn-cancel');
  
  confirmBtn.addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
    if (modalCallback) {
      modalCallback(true);
      modalCallback = null;
    }
  });
  
  cancelBtn.addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
    modalCallback = null;
  });
  
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.add('hidden');
      modalCallback = null;
    }
  });
}

/**
 * 显示遮罩确认窗
 * @param {string} message - 显示的消息
 * @param {Function} callback - 回调函数，参数为是否确认
 * @param {boolean} showCancel - 是否显示取消按钮，默认true
 */
function showModal(message, callback, showCancel = true) {
  modalCallback = callback;
  const modalOverlay = document.getElementById('modal-overlay');
  const modalMessage = document.getElementById('modal-message');
  const cancelBtn = document.getElementById('modal-btn-cancel');
  modalMessage.textContent = message;
  
  if (showCancel) {
    cancelBtn.classList.remove('hidden');
  } else {
    cancelBtn.classList.add('hidden');
  }
  
  modalOverlay.classList.remove('hidden');
}

/**
 * 切换电源菜单的显示/隐藏
 */
function togglePowerMenu() {
  const menu = document.getElementById('power-menu');
  const userPanel = document.getElementById('users-panel');
  userPanel.classList.add('hidden');
  menu.classList.toggle('hidden');
}

/**
 * 处理关机
 */
function handleShutdown() {
  document.getElementById('power-menu').classList.add('hidden');
  showModal('确定要关机吗？', () => {
    showModal('正在关机...', () => {}, false);
  }, false);
}

/**
 * 处理重新启动
 */
function handleRestart() {
  document.getElementById('power-menu').classList.add('hidden');
  showModal('确定要重启吗？', () => {
    showModal('你正在重启...', () => {}, false);
  }, false);
}

/**
 * 处理Shell模式
 */
function handleShellMode() {
  document.getElementById('power-menu').classList.add('hidden');
  showModal('确定要进入Shell模式吗？', () => {
    showModal('正在进入Shell模式...', () => {}, false);
  }, false);
}

/**
 * 选择用户并更新界面
 * @param {Object} user - 用户对象
 */
async function selectUser(user) {
  currentUser = user;
  document.getElementById('username-display').textContent = user.username;
  document.getElementById('password-input').value = '';
  document.getElementById('error-msg').textContent = '';
  document.getElementById('users-panel').classList.add('hidden');
  
  // 加载该用户的个性化设置
  settings = await window.electronAPI.config.getSettings(user.userid);
  
  // 应用主题
  applyTheme(settings.theme || 'dark');
  
  // 应用主题色
  if (settings.accentColor) {
    applyAccentColor(settings.accentColor);
  }
  
  // 如果设置了自定义背景，应用背景
  if (settings.background) {
    applyBackground(settings.background);
  } else {
    // 没有自定义背景，恢复默认
    document.body.style.backgroundImage = '';
  }
  
  // 更新用户头像
  updateUserAvatar(user);
  
  // 更新切换用户按钮可见性
  updateSwitchUserButtonVisibility();
}

/**
 * 应用主题色
 */
function applyAccentColor(color) {
  document.documentElement.style.setProperty('--accent-color', color);
}

/**
 * 应用主题
 * @param {string} theme - 主题模式：'dark' 或 'bright'
 */
function applyTheme(theme) {
  if (theme === 'bright') {
    document.body.classList.add('theme-bright');
  } else {
    document.body.classList.remove('theme-bright');
  }
}

/**
 * 更新用户头像显示
 * @param {Object} user - 用户对象
 */
function updateUserAvatar(user) {
  const avatarContainer = document.querySelector('.user-avatar');
  
  if (user.photo) {
    // 如果用户有自定义头像，显示图片
    avatarContainer.innerHTML = `<img src="${user.photo}" alt="用户头像" />`;
  } else {
    // 没有自定义头像，显示默认图标
    avatarContainer.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    `;
  }
}

/**
 * 渲染用户列表到选择面板
 */
function renderUserList() {
  const container = document.getElementById('users-list');
  container.innerHTML = '';
  
  // 标题根据用户数量显示不同内容
  const headerText = users.length > 1 ? '选择用户' : '其他用户';
  document.querySelector('.users-header').textContent = headerText;
  
  users.forEach(user => {
    const item = document.createElement('div');
    item.className = 'user-item';
    // 标记当前选中的用户
    if (currentUser && currentUser.userid === user.userid) {
      item.classList.add('active');
    }
    item.innerHTML = `
      <div class="user-item-avatar">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:24px;height:24px;">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>
      <div class="user-item-name">${user.username}</div>
      ${currentUser && currentUser.userid === user.userid ? '<span style="color: #666; font-size: 12px; margin-left: auto;">✓</span>' : ''}
    `;
    item.addEventListener('click', () => selectUser(user));
    container.appendChild(item);
  });
}

/**
 * 切换用户选择面板的显示/隐藏
 */
function toggleUserPanel() {
  const panel = document.getElementById('users-panel');
  // 只有多个用户时才显示面板
  if (users.length > 1) {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      renderUserList(); // 刷新用户列表
    }
  }
}

/**
 * 处理登录验证
 */
async function handleLogin() {
  const loginBtn = document.getElementById('login-btn');
  const password = document.getElementById('password-input').value;
  if (!currentUser) return;

  // 显示加载状态
  loginBtn.classList.add('loading');
  document.getElementById('error-msg').textContent = '';

  // 1.5秒伪加载
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 调用主进程验证用户
  const result = await window.electronAPI.config.verifyUser(currentUser.username, password);
  
  if (result) {
    // 登录成功，保存当前用户ID
    await window.electronAPI.config.setLastLoginUserId(currentUser.userid);
    // 打开欢迎页面
    window.electronAPI.window.openDashboard();
  } else {
    // 登录失败，显示错误信息
    document.getElementById('error-msg').textContent = '密码错误，请重试。';
  }

  // 移除加载状态
  loginBtn.classList.remove('loading');
}

/**
 * 切换密码输入框的显示/隐藏
 */
function togglePassword() {
  const input = document.getElementById('password-input');
  input.type = input.type === 'password' ? 'text' : 'password';
}

/**
 * 打开文件选择对话框更改背景图片
 */
async function changeBackground() {
  if (!currentUser) return;
  const imagePath = await window.electronAPI.dialog.selectImage();
  if (imagePath) {
    await window.electronAPI.config.setBackground(imagePath, currentUser.userid);
    applyBackground(imagePath);
  }
}

/**
 * 设置背景图片
 * @param {string} imagePath - 图片路径
 */
function applyBackground(imagePath) {
  document.body.style.backgroundImage = `url('file://${imagePath.replace(/\\/g, '/')}')`;
}

/**
 * 更新时间日期显示
 */
function updateDateTime() {
  const now = new Date();
  const timeEl = document.getElementById('time');
  const dateEl = document.getElementById('date');

  // 格式化时间 HH:MM
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  timeEl.textContent = `${hours}:${minutes}`;

  // 格式化日期为中文格式
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[now.getDay()];
  dateEl.textContent = `${year}年${month}月${day}日 ${weekday}`;
}
