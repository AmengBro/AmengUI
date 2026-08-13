/**
 * 新建用户独立窗口
 */
let permiCombo = null;

function applyTheme(theme, accentColor) {
  const root = document.documentElement;
  root.classList.toggle('theme-light', theme === 'bright');
  root.classList.toggle('theme-dark', theme !== 'bright');
  if (accentColor) {
    root.style.setProperty('--accent-user', accentColor);
    root.style.setProperty('--accent-base', accentColor);
  }
}

function setStatus(message, type) {
  const status = document.getElementById('form-status');
  status.textContent = message || '';
  status.classList.toggle('hidden', !message);
  status.classList.toggle('error', type === 'error');
  status.classList.toggle('success', type === 'success');
}

function closeWindow() {
  window.electronAPI.userForm.close();
}

async function submit() {
  const username = document.getElementById('f-username').value.trim();
  const nickname = document.getElementById('f-nickname').value.trim();
  const permi = permiCombo ? permiCombo.getValue() : 'user';
  const pwdOn = document.getElementById('pwd-switch').getAttribute('aria-checked') === 'true';
  const password = pwdOn ? document.getElementById('f-password').value : '';
  const repeat = pwdOn ? document.getElementById('f-password-repeat').value : '';

  if (!username) {
    setStatus('用户名不能为空', 'error');
    return;
  }
  if (!nickname) {
    setStatus('全名不能为空', 'error');
    return;
  }
  if (pwdOn && password !== repeat) {
    setStatus('两次输入的密码不一致', 'error');
    return;
  }

  const createBtn = document.getElementById('btn-create');
  createBtn.disabled = true;
  try {
    const res = await window.electronAPI.userForm.create({
      username,
      nickname,
      permi,
      password,
    });
    if (res && res.success) {
      // 主进程会通知设置窗口刷新列表
      closeWindow();
    } else {
      const code = res && res.code;
      setStatus(code === 'duplicate' ? '用户名或全名已存在' : '创建失败，请重试', 'error');
    }
  } catch (err) {
    console.error('[UserForm] 创建用户失败:', err);
    setStatus(`创建失败：${err.message || '未知错误'}`, 'error');
  } finally {
    createBtn.disabled = false;
  }
}

function init() {
  document.getElementById('btn-close').addEventListener('click', closeWindow);
  document.getElementById('btn-cancel').addEventListener('click', closeWindow);
  document.getElementById('btn-create').addEventListener('click', submit);

  // 密码设置开关：关闭时收起并清空密码，开启时展开
  const pwdSwitch = document.getElementById('pwd-switch');
  const pwdSection = document.getElementById('pwd-section');
  const syncPwdSection = () => {
    const on = pwdSwitch.getAttribute('aria-checked') === 'true';
    pwdSection.classList.toggle('open', on);
    if (!on) {
      document.getElementById('f-password').value = '';
      document.getElementById('f-password-repeat').value = '';
    } else {
      setTimeout(() => document.getElementById('f-password').focus(), 60);
    }
  };
  pwdSwitch.addEventListener('click', () => {
    pwdSwitch.setAttribute('aria-checked', String(pwdSwitch.getAttribute('aria-checked') !== 'true'));
    syncPwdSection();
  });
  syncPwdSection();

  // 权限下拉（WinUI ComboBox）
  permiCombo = createWinComboBox(
    [
      { value: 'user', label: 'user（用户）' },
      { value: 'sudo', label: 'sudo（管理员）' },
    ],
    'user',
    { ariaLabel: '权限' }
  );
  document.getElementById('f-permi-host').appendChild(permiCombo.el);

  // 显示/隐藏密码
  document.querySelectorAll('.pwd-reveal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.classList.toggle('showing', !showing);
      btn.setAttribute('aria-pressed', String(!showing));
      btn.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
      input.focus();
    });
  });

  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeWindow();
  });
  // Enter 快捷提交
  ['f-username', 'f-nickname', 'f-password', 'f-password-repeat'].forEach((id) => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  });

  // 主题由主进程下发
  window.electronAPI.userForm.onTheme(({ theme, accentColor }) => {
    applyTheme(theme, accentColor);
  });
}

document.addEventListener('DOMContentLoaded', init);
