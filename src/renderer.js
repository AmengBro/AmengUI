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
  // 获取应用设置
  settings = await window.electronAPI.config.getSettings();

  // 如果有用户，默认选中第一个
  if (users.length > 0) {
    selectUser(users[0]);
  }

  // 如果设置了自定义背景，应用背景
  if (settings.background) {
    setBackground(settings.background);
  }

  // 渲染用户列表
  renderUserList();
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
  
  // 用户名点击显示用户选择面板
  document.getElementById('username-display').addEventListener('click', toggleUserPanel);
}

/**
 * 选择用户并更新界面
 * @param {Object} user - 用户对象
 */
function selectUser(user) {
  currentUser = user;
  document.getElementById('username-display').textContent = user.username;
  document.getElementById('password-input').value = '';
  document.getElementById('error-msg').textContent = '';
  document.getElementById('users-panel').classList.add('hidden');
}

/**
 * 渲染用户列表到选择面板
 */
function renderUserList() {
  const container = document.getElementById('users-list');
  container.innerHTML = '';
  
  users.forEach(user => {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.innerHTML = `
      <div class="user-item-avatar">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:24px;height:24px;">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>
      <div class="user-item-name">${user.username}</div>
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
  panel.classList.toggle('hidden');
}

/**
 * 处理登录验证
 */
async function handleLogin() {
  const password = document.getElementById('password-input').value;
  if (!currentUser) return;

  // 调用主进程验证用户
  const result = await window.electronAPI.config.verifyUser(currentUser.username, password);
  
  if (result) {
    // 登录成功
    document.getElementById('error-msg').textContent = '';
    alert('Login successful!');
  } else {
    // 登录失败，显示错误信息
    document.getElementById('error-msg').textContent = 'The password is incorrect.';
  }
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
  const imagePath = await window.electronAPI.dialog.selectImage();
  if (imagePath) {
    await window.electronAPI.config.setBackground(imagePath);
    setBackground(imagePath);
  }
}

/**
 * 设置背景图片
 * @param {string} imagePath - 图片路径
 */
function setBackground(imagePath) {
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

  // 格式化日期
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateEl.textContent = now.toLocaleDateString('en-US', options);
}
