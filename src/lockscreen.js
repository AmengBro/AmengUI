let currentUserId = null;
let currentUsername = '';
let hasPassword = true;
let isUnlocking = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const userData = await window.electronAPI.lockscreen.init();
    if (userData) {
      currentUserId = userData.userId;
      currentUsername = userData.username;
      hasPassword = !!userData.hasPassword;
      
      if (userData.theme === 'bright') {
        document.body.classList.add('theme-bright');
      } else {
        document.body.classList.remove('theme-bright');
      }
      
      document.documentElement.style.setProperty('--accent-color', userData.accentColor);
      
      if (userData.background) {
        let bgUrl = userData.background;
        if (bgUrl.startsWith('C:\\') || bgUrl.startsWith('D:\\') || 
            bgUrl.startsWith('c:\\') || bgUrl.startsWith('d:\\')) {
          bgUrl = 'file:///' + bgUrl.replaceAll('\\', '/');
        }
        document.body.style.backgroundImage = `url('${bgUrl}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.background = 'transparent';
      }
      
      document.getElementById('username-display').textContent = currentUsername;
      
      // 无密码用户：隐藏密码输入框与切换按钮，点击登录按钮直接解锁
      if (!hasPassword) {
        const passwordSection = document.getElementById('password-section');
        if (passwordSection) {
          passwordSection.style.display = 'none';
        }
      }
      
      const avatarContainer = document.querySelector('.user-avatar');
      const defaultAvatar = avatarContainer.querySelector('svg');
      if (userData.avatar) {
        defaultAvatar.style.display = 'none';
        const img = document.createElement('img');
        img.src = userData.avatar;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        avatarContainer.appendChild(img);
      }
    }
  } catch (err) {
    console.error('Lockscreen init failed:', err);
  } finally {
    bindEvents();
  }
});

function bindEvents() {
  const passwordInput = document.getElementById('password-input');
  const loginBtn = document.getElementById('login-btn');
  const togglePasswordBtn = document.getElementById('toggle-password');
  
  loginBtn.addEventListener('click', unlock);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      unlock();
    }
  });
  
  // 无密码用户：输入框已隐藏，按 Enter 同样触发解锁
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !hasPassword) {
      unlock();
    }
  });
  
  togglePasswordBtn.addEventListener('click', () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
  });
  
  updateTime();
  setInterval(updateTime, 1000);
}

async function unlock() {
  if (isUnlocking) return;
  
  const password = document.getElementById('password-input').value;
  const loginBtn = document.getElementById('login-btn');
  const errorMsg = document.getElementById('error-msg');
  
  // 用户设置过密码但未输入时提示；无密码用户允许空密码直接解锁
  if (hasPassword && !password) {
    showError('请输入密码');
    return;
  }
  
  isUnlocking = true;
  loginBtn.disabled = true;
  loginBtn.classList.add('loading');
  errorMsg.textContent = '';
  
  try {
    // 与登录页一致的伪加载
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const result = await window.electronAPI.config.verifyUser(currentUsername, password);
    
    if (result) {
      window.electronAPI.lockscreen.unlock();
    } else {
      showError('密码错误');
    }
  } catch (err) {
    console.error('Unlock error:', err);
    showError('验证失败');
  } finally {
    isUnlocking = false;
    loginBtn.disabled = false;
    loginBtn.classList.remove('loading');
  }
}

function showError(message) {
  const errorMsg = document.getElementById('error-msg');
  errorMsg.textContent = message;
  errorMsg.style.opacity = '1';
}

function updateTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[now.getDay()];
  
  document.getElementById('time').textContent = `${hours}:${minutes}`;
  document.getElementById('date').textContent = `${year}年${month}月${day}日 ${weekday}`;
}