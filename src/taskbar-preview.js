const FALLBACK_ICON = '../difproico.png';

function renderPreview(data) {
  const list = document.getElementById('preview-list');
  if (!list) return;
  list.innerHTML = '';
  const windows = (data && Array.isArray(data.windows)) ? data.windows : [];
  windows.forEach((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'preview-card' + (item.focused ? ' active' : '');
    card.title = item.title || item.processName || '窗口';

    if (item.thumbnail) {
      const image = document.createElement('img');
      image.className = 'preview-image';
      image.alt = '';
      image.src = item.thumbnail;
      image.addEventListener('error', () => {
        image.remove();
        card.insertBefore(makeFallback(item), card.firstChild);
      });
      card.appendChild(image);
    } else {
      card.appendChild(makeFallback(item));
    }

    const title = document.createElement('span');
    title.className = 'preview-title';
    title.textContent = item.title || item.processName || '窗口';
    card.appendChild(title);

    const state = document.createElement('span');
    state.className = 'preview-state';
    state.textContent = item.minimized ? '已最小化' : (item.focused ? '当前窗口' : '运行中');
    card.appendChild(state);

    card.addEventListener('click', () => {
      window.electronAPI.taskbar.activate(item.hwnd).catch(() => {});
      window.electronAPI.taskbar.previewHide();
    });
    list.appendChild(card);
  });
}

function makeFallback(item) {
  const holder = document.createElement('span');
  holder.className = 'preview-fallback';
  const image = document.createElement('img');
  image.alt = '';
  image.src = item.iconData || FALLBACK_ICON;
  image.addEventListener('error', () => { image.src = FALLBACK_ICON; });
  holder.appendChild(image);
  return holder;
}

window.electronAPI.taskbarPreview.onData(renderPreview);
window.electronAPI.taskbarPreview.onTheme(({ theme, accentColor }) => {
  document.body.classList.toggle('theme-bright', theme === 'bright');
  if (accentColor) document.documentElement.style.setProperty('--accent-color', accentColor);
});

const previewRoot = document.getElementById('preview-shell') || document.body;
previewRoot.addEventListener('mouseenter', () => window.electronAPI.taskbarPreview.enter());
previewRoot.addEventListener('mouseleave', () => window.electronAPI.taskbarPreview.leave());
window.addEventListener('blur', () => window.electronAPI.taskbarPreview.leave());
