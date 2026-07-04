let currentUserId = null;
let currentUsername = '';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const userData = await window.electronAPI.lockscreen.init();
    if (userData) {
      currentUserId = userData.userId;
      currentUsername = userData.username;
      
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
  
  togglePasswordBtn.addEventListener('click', () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
  });
  
  updateTime();
  setInterval(updateTime, 1000);
}

async function unlock() {
  const password = document.getElementById('password-input').value;
  const loginBtn = document.getElementById('login-btn');
  const errorMsg = document.getElementById('error-msg');
  
  if (!password) {
    showError('请输入密码');
    return;
  }
  
  loginBtn.disabled = true;
  errorMsg.textContent = '';
  
  try {
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
    loginBtn.disabled = false;
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