/**
 * WinUI ToggleSwitch 工厂
 * 用法：
 *   const sw = createWinSwitch({
 *     checked: true,
 *     ariaLabel: '夜间模式',
 *     onChange: (checked) => { ... }
 *   });
 *   container.appendChild(sw.el);
 *   sw.setChecked(false); // 程序化设置（不触发 onChange）
 */
function createWinSwitch(options = {}) {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'win-switch';
  root.setAttribute('role', 'switch');
  root.setAttribute('aria-checked', String(!!options.checked));
  if (options.ariaLabel) root.setAttribute('aria-label', options.ariaLabel);

  const track = document.createElement('span');
  track.className = 'win-switch-track';
  const thumb = document.createElement('span');
  thumb.className = 'win-switch-thumb';
  root.appendChild(track);
  root.appendChild(thumb);

  const onChange = options.onChange || null;
  root.addEventListener('click', () => {
    const checked = root.getAttribute('aria-checked') === 'true';
    root.setAttribute('aria-checked', String(!checked));
    if (onChange) onChange(!checked);
  });

  return {
    el: root,
    get checked() {
      return root.getAttribute('aria-checked') === 'true';
    },
    setChecked(v) {
      root.setAttribute('aria-checked', String(!!v));
    },
  };
}
