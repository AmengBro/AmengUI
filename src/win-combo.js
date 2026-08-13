/**
 * WinUI 风格 ComboBox（参考 WinUIonWeb）
 * 用法：
 *   const combo = createWinComboBox(
 *     [{ value: 'user', label: 'user（用户）' }, ...],
 *     'user',
 *     { onChange: (v) => {}, ariaLabel: '权限', disabled: false }
 *   );
 *   container.appendChild(combo.el);
 *   combo.getValue() / combo.setValue(v) / combo.setDisabled(b) / combo.destroy()
 */
function createWinComboBox(items, initialValue, options = {}) {
  const onChange = options.onChange || null;
  let value = initialValue;
  let disabled = !!options.disabled;
  let popup = null;
  let open = false;

  const root = document.createElement('div');
  root.className = 'win-combo';
  root.setAttribute('role', 'combobox');
  root.setAttribute('aria-haspopup', 'listbox');
  root.setAttribute('aria-expanded', 'false');
  root.setAttribute('tabindex', '0');
  root.setAttribute('aria-label', options.ariaLabel || '');

  const labelEl = document.createElement('span');
  labelEl.className = 'win-combo-label';
  const chevronEl = document.createElement('span');
  chevronEl.className = 'win-combo-chevron';
  chevronEl.innerHTML =
    '<svg viewBox="0 0 8.098 4.598" width="10" height="6" fill="currentColor" aria-hidden="true">' +
    '<path d="M.195.195C.39 0 .708 0 .903.195L4.049 3.342 7.195.195C7.39 0 7.708 0 7.903.195C8.098.39 8.098.708 7.903.903L4.403 4.403C4.208 4.598 3.89 4.598 3.695 4.403L.195.903C0 .708 0 .39 .195.195Z"/></svg>';
  root.appendChild(labelEl);
  root.appendChild(chevronEl);

  function renderLabel() {
    const it = items.find((i) => i.value === value);
    labelEl.textContent = it ? it.label : '';
  }

  function setDisabled(b) {
    disabled = !!b;
    root.classList.toggle('is-disabled', disabled);
    root.setAttribute('aria-disabled', String(disabled));
    if (disabled) closePopup();
  }

  function closePopup() {
    if (popup && popup.parentNode) popup.remove();
    popup = null;
    open = false;
    root.setAttribute('aria-expanded', 'false');
  }

  function positionPopup() {
    const rect = root.getBoundingClientRect();
    const itemH = 36;
    const maxH = 9 * itemH;
    const popH = Math.min(items.length * itemH, maxH);
    let top = rect.bottom + 4;
    if (top + popH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popH - 4);
    }
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${top}px`;
    popup.style.minWidth = `${Math.max(rect.width, 160)}px`;
    popup.style.maxHeight = `${maxH}px`;
    const sel = popup.querySelector('.win-combo-option.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function focusOption(opt) {
    if (!opt || !popup) return;
    popup.querySelectorAll('.win-combo-option').forEach((o) => {
      o.classList.remove('selected', 'hover');
      o.setAttribute('aria-selected', 'false');
    });
    opt.classList.add('selected');
    opt.setAttribute('aria-selected', 'true');
    opt.focus();
  }

  function select(v) {
    if (disabled) return;
    value = v;
    renderLabel();
    if (onChange) onChange(v);
    closePopup();
    root.focus();
  }

  function openPopup() {
    if (disabled) return;
    closePopup();
    popup = document.createElement('div');
    popup.className = 'win-combo-popup win-acrylic';
    popup.setAttribute('role', 'listbox');
    items.forEach((it) => {
      const opt = document.createElement('div');
      opt.className = 'win-combo-option' + (it.value === value ? ' selected' : '');
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', String(it.value === value));
      opt.dataset.value = it.value;
      opt.tabIndex = -1;
      const pill = document.createElement('span');
      pill.className = 'win-combo-pill';
      const text = document.createElement('span');
      text.textContent = it.label;
      opt.appendChild(pill);
      opt.appendChild(text);
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        select(it.value);
      });
      opt.addEventListener('mousemove', () => {
        popup.querySelectorAll('.win-combo-option').forEach((o) => o.classList.remove('hover'));
        opt.classList.add('hover');
      });
      popup.appendChild(opt);
    });
    document.body.appendChild(popup);
    positionPopup();
    open = true;
    root.setAttribute('aria-expanded', 'true');
    const sel = popup.querySelector('.win-combo-option.selected');
    if (sel) sel.focus();
    else if (popup.firstElementChild) popup.firstElementChild.focus();
  }

  function onRootKeydown(e) {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.key === 'ArrowDown' && e.altKey)) {
      e.preventDefault();
      if (open) closePopup();
      else openPopup();
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
      e.preventDefault();
      const idx = items.findIndex((i) => i.value === value);
      const next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, items.length - 1)
        : Math.max(idx - 1, 0);
      if (items[next]) select(items[next].value);
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closePopup();
      root.focus();
    }
  }

  root.addEventListener('click', () => {
    if (open) closePopup();
    else openPopup();
  });
  root.addEventListener('keydown', onRootKeydown);

  // 弹出层键盘导航（打开期间全局监听）
  document.addEventListener('keydown', (e) => {
    if (!open || !popup) return;
    const opts = [...popup.querySelectorAll('.win-combo-option')];
    if (opts.length === 0) return;
    const cur = popup.querySelector('.win-combo-option.selected');
    const idx = opts.indexOf(cur);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, opts.length - 1)
        : Math.max(idx - 1, 0);
      focusOption(opts[next]);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusOption(e.key === 'Home' ? opts[0] : opts[opts.length - 1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const sel = popup.querySelector('.win-combo-option.selected');
      if (sel) select(sel.dataset.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePopup();
      root.focus();
    }
  });

  // 点击外部关闭
  document.addEventListener('pointerdown', (e) => {
    if (open && !root.contains(e.target) && popup && !popup.contains(e.target)) {
      closePopup();
    }
  });

  // 滚动/缩放时关闭，避免固定定位脱离锚点
  ['scroll', 'resize'].forEach((ev) => {
    window.addEventListener(ev, closePopup, { passive: true });
  });

  renderLabel();
  setDisabled(disabled);

  return {
    el: root,
    getValue: () => value,
    setValue: (v) => {
      value = v;
      renderLabel();
    },
    setDisabled,
    destroy: () => {
      closePopup();
      root.remove();
    },
  };
}
