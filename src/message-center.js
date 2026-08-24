/**
 * 独立消息面板（分体窗口，位于日历面板上方）
 * 显示系统通知，尊重设置中的通知偏好（主进程已过滤）。
 */

const MSG_BELL_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">' +
  '<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>' +
  '</svg>';

/**
 * 格式化通知时间：今天显示 HH:MM，更早显示 M月D日 HH:MM
 */
function formatNotifyTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? hm : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/**
 * 渲染消息面板
 */
function renderMessages(data) {
  const list = document.getElementById('msg-list');
  const count = document.getElementById('msg-count');
  if (!list) return;
  const items = (data && data.items) || [];
  const unread = (data && data.unread) || 0;

  if (count) {
    count.textContent = String(unread);
    count.classList.toggle('visible', unread > 0);
  }

  const dismissAllBtn = document.getElementById('msg-dismiss-all');
  const clearBtn = document.getElementById('msg-clear');
  if (dismissAllBtn) dismissAllBtn.disabled = items.length === 0 || unread === 0;
  if (clearBtn) clearBtn.disabled = items.length === 0;

  if (items.length === 0) {
    list.innerHTML = '<div class="msg-empty">暂无通知</div>';
    return;
  }

  list.innerHTML = '';
  items.forEach((n) => {
    const row = document.createElement('div');
    row.className = 'msg-item' + (n.read ? '' : ' unread');
    row.title = n.read ? '' : '点击标记为已读';

    const icon = document.createElement('div');
    icon.className = 'msg-item-icon';
    if (n.icon) {
      const img = document.createElement('img');
      img.src = n.icon;
      img.alt = '';
      img.addEventListener('error', () => {
        icon.innerHTML = MSG_BELL_ICON;
      });
      icon.appendChild(img);
    } else {
      icon.innerHTML = MSG_BELL_ICON;
    }

    const body = document.createElement('div');
    body.className = 'msg-item-body';
    const titleRow = document.createElement('div');
    titleRow.className = 'msg-item-title';
    const title = document.createElement('span');
    const notificationTitle = n.title || '通知';
    title.textContent = n.appName ? `${n.appName} · ${notificationTitle}` : notificationTitle;
    const time = document.createElement('span');
    time.className = 'msg-item-time';
    time.textContent = formatNotifyTime(n.time);
    titleRow.appendChild(title);
    titleRow.appendChild(time);
    const text = document.createElement('div');
    text.className = 'msg-item-text';
    text.textContent = n.body || '';
    body.appendChild(titleRow);
    body.appendChild(text);

    row.appendChild(icon);
    row.appendChild(body);
    row.addEventListener('click', () => {
      if (!n.read) {
        window.electronAPI.notify.dismiss(n.id);
      }
    });
    list.appendChild(row);
  });
}

/**
 * 初始化消息面板
 */
function init() {
  // 主进程按通知偏好过滤后下发的列表
  window.electronAPI.notify.list().then((data) => renderMessages(data)).catch(() => {});
  window.electronAPI.notify.onList((data) => renderMessages(data));

  // 主题由主进程在窗口加载后下发
  window.electronAPI.message.onTheme(({ theme, accentColor }) => {
    document.body.classList.toggle('theme-bright', theme === 'bright');
    if (accentColor) {
      document.documentElement.style.setProperty('--accent-color', accentColor);
    }
  });

  document.getElementById('msg-settings').addEventListener('click', () => {
    window.electronAPI.settings.show({});
  });
  document.getElementById('msg-dismiss-all').addEventListener('click', () => {
    window.electronAPI.notify.dismissAll();
  });
  document.getElementById('msg-clear').addEventListener('click', () => {
    window.electronAPI.notify.clear();
  });

  // ESC 关闭消息面板（连带日历）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.electronAPI.message.hide();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
