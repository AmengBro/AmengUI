/**
 * 包管理器 UI（仅界面，无安装/卸载逻辑）
 */

// ============ 占位演示数据（后续接入真实数据时替换） ============
const DEMO_APP = {
  name: '示例应用',
  version: '1.0.0',
  description: '这是一个演示用的示例应用，用于展示包管理器安装确认界面的布局样式。',
};

function applyTheme(theme, accentColor) {
  document.body.classList.toggle('theme-bright', theme === 'bright');
  if (accentColor) {
    document.documentElement.style.setProperty('--accent-color', accentColor);
  }
}

function init() {
  document.getElementById('app-name').textContent = DEMO_APP.name;
  document.getElementById('app-version').textContent = DEMO_APP.version;
  document.getElementById('app-desc').textContent = DEMO_APP.description;

  const closeWindow = () => window.close();
  document.getElementById('btn-close').addEventListener('click', closeWindow);
  document.getElementById('btn-cancel').addEventListener('click', closeWindow);

  // 安装按钮为纯视觉占位，安装逻辑后续接入
  document.getElementById('btn-install').addEventListener('click', () => {
    /* 占位：安装逻辑后续实现 */
  });

  // 主题由主进程在窗口加载后下发
  window.electronAPI.pkgManager.onTheme(({ theme, accentColor }) => {
    applyTheme(theme, accentColor);
  });
}

document.addEventListener('DOMContentLoaded', init);
