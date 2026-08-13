const $ = (id) => document.getElementById(id);

let capabilities = null;
let btShowAll = false;
let mixerRefreshTimer = null;
let mixerLoading = false;

const SPKR_ON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
const SPKR_OFF = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
const MUTE_BADGE = '<span class="mute-badge">' + SPKR_OFF + '</span>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function updateToggleButton(button, enabled) {
  button.classList.toggle('active', !!enabled);
  button.classList.toggle('off', !enabled);
}

function setBusy(button, busy) {
  button.classList.toggle('loading', busy);
  button.disabled = busy;
}

async function runToggle(button, valueEl, apiCall, labelOf, expected) {
  if (button.classList.contains('loading')) return;
  const original = valueEl.textContent;
  setBusy(button, true);
  if (typeof expected === 'boolean') {
    // 乐观更新：先应用预期状态，操作完成后校准，感知上即时生效
    updateToggleButton(button, expected);
    valueEl.textContent = labelOf(expected);
  } else {
    valueEl.textContent = '处理中…';
  }
  try {
    const result = await apiCall();
    if (result && result.success) {
      updateToggleButton(button, result.enabled);
      valueEl.textContent = labelOf(result.enabled);
    } else {
      valueEl.textContent = (result && result.error === 'unsupported')
        ? '不支持'
        : (result && result.error === 'admin_required') ? '需要管理员' : '失败';
      setTimeout(() => { valueEl.textContent = original; }, 2000);
      if (typeof expected === 'boolean') updateToggleButton(button, !expected);
    }
  } catch (e) {
    valueEl.textContent = '失败';
    setTimeout(() => { valueEl.textContent = original; }, 2000);
    if (typeof expected === 'boolean') updateToggleButton(button, !expected);
  } finally {
    setBusy(button, false);
  }
}

function bindToggles() {
  const networkBtn = $('btn-network');
  const bluetoothBtn = $('btn-bluetooth');
  const flightModeBtn = $('btn-flight-mode');
  const hotspotBtn = $('btn-hotspot');

  // 点击进入选择视图（WiFi / 蓝牙设备）
  networkBtn.addEventListener('click', () => openNetworkView());
  bluetoothBtn.addEventListener('click', () => openBluetoothView());

  flightModeBtn.addEventListener('click', () => {
    runToggle(
      flightModeBtn,
      $('flight-mode-value'),
      () => window.electronAPI.system.toggleFlightMode(),
      (enabled) => (enabled ? '开' : '关'),
      !flightModeBtn.classList.contains('active')
    );
  });

  hotspotBtn.addEventListener('click', () => {
    runToggle(
      hotspotBtn,
      $('hotspot-value'),
      () => window.electronAPI.system.toggleHotspot(),
      (enabled) => (enabled ? '开' : '关'),
      !hotspotBtn.classList.contains('active')
    );
  });
}

/**
 * 刷新网络/蓝牙/移动热点按钮的启用状态（以底色区分：启用=主题色，关闭=红色调）
 */
async function refreshQuickToggleStates() {
  const netBtn = $('btn-network');
  const btBtn = $('btn-bluetooth');
  const flightBtn = $('btn-flight-mode');
  const hotspotBtn = $('btn-hotspot');
  const tasks = [];

  if (netBtn) {
    tasks.push(
      window.electronAPI.system.getWifiStatus().then((r) => {
        if (r && typeof r.radioEnabled === 'boolean') updateToggleButton(netBtn, r.radioEnabled);
      }).catch(() => {})
    );
  }
  if (btBtn) {
    tasks.push(
      window.electronAPI.system.getBluetoothStatus().then((r) => {
        if (r && typeof r.enabled === 'boolean') {
          // 飞行模式下无线电关闭（radioEnabled=false）优先于设备级状态
          const on = r.radioEnabled === false ? false : r.enabled;
          updateToggleButton(btBtn, on);
        }
      }).catch(() => {})
    );
  }
  if (flightBtn) {
    tasks.push(
      window.electronAPI.system.getFlightStatus().then((r) => {
        if (r && typeof r.enabled === 'boolean') {
          updateToggleButton(flightBtn, r.enabled);
          const value = $('flight-mode-value');
          if (value) value.textContent = r.enabled ? '开' : '关';
        }
      }).catch(() => {})
    );
  }
  if (hotspotBtn) {
    tasks.push(
      window.electronAPI.system.getHotspotStatus().then((r) => {
        if (r && typeof r.enabled === 'boolean') {
          updateToggleButton(hotspotBtn, r.enabled);
          const value = $('hotspot-value');
          if (value) value.textContent = r.enabled ? '开' : '关';
        }
      }).catch(() => {})
    );
  }
  await Promise.all(tasks);
}

function bindSliders() {
  const brightnessSlider = $('brightness-slider');
  const brightnessValue = $('brightness-value');
  const volumeSlider = $('volume-slider');
  const volumeValue = $('volume-value');
  const volumeMuteBtn = $('btn-volume-mute');

  const commitVolume = debounce(async (value) => {
    try {
      await window.electronAPI.system.setVolume(value);
    } catch (e) {
      console.error('Failed to set volume:', e);
    }
  }, 150);

  const commitBrightness = debounce(async (value) => {
    try {
      await window.electronAPI.system.setBrightness(value);
    } catch (e) {
      console.error('Failed to set brightness:', e);
    }
  }, 150);

  brightnessSlider.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    brightnessValue.textContent = `${v}%`;
    commitBrightness(v);
  });

  volumeSlider.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    volumeValue.textContent = `${v}%`;
    commitVolume(v);
  });

  volumeMuteBtn.addEventListener('click', async () => {
    if (volumeMuteBtn.classList.contains('busy')) return;
    const target = !volumeMuteBtn.classList.contains('muted');
    volumeMuteBtn.classList.add('busy');
    volumeMuteBtn.disabled = true;
    try {
      const r = await window.electronAPI.system.setMute(target);
      if (r && r.success) setVolumeMuteButton(target);
    } catch (e) {
      console.error('Failed to toggle mute:', e);
    } finally {
      volumeMuteBtn.classList.remove('busy');
      volumeMuteBtn.disabled = false;
    }
  });
}

function setVolumeMuteButton(muted) {
  const btn = $('btn-volume-mute');
  if (!btn) return;
  btn.classList.toggle('muted', !!muted);
  btn.innerHTML = muted ? SPKR_OFF : SPKR_ON;
}

function applyCapabilities() {
  if (!capabilities) return;
  if (!capabilities.audio) {
    const item = $('volume-item');
    if (item) item.classList.add('unsupported');
  }
  if (!capabilities.brightness && !capabilities.isLaptop) {
    const item = $('brightness-item');
    if (item) item.classList.add('unsupported');
  }
}

async function loadInitialValues() {
  const volumeSlider = $('volume-slider');
  const volumeValue = $('volume-value');
  const brightnessSlider = $('brightness-slider');
  const brightnessValue = $('brightness-value');

  const tasks = [];
  if (!capabilities || capabilities.audio) {
    tasks.push(
      window.electronAPI.system.getVolume().then((r) => {
        if (r && r.success && typeof r.volume === 'number' && r.volume >= 0) {
          volumeSlider.value = r.volume;
          volumeValue.textContent = `${r.volume}%`;
        } else {
          volumeValue.textContent = '—';
          volumeSlider.disabled = true;
        }
        setVolumeMuteButton(r && r.success ? !!r.mute : false);
      }).catch(() => {
        volumeValue.textContent = '—';
        volumeSlider.disabled = true;
      })
    );
  }
  if (!capabilities || capabilities.brightness || capabilities.isLaptop) {
    tasks.push(
      window.electronAPI.system.getBrightness().then((r) => {
        if (r && r.success && typeof r.brightness === 'number' && r.brightness >= 0) {
          brightnessSlider.value = r.brightness;
          brightnessValue.textContent = `${r.brightness}%`;
        } else {
          brightnessValue.textContent = '—';
          brightnessSlider.disabled = true;
        }
      }).catch(() => {
        brightnessValue.textContent = '—';
        brightnessSlider.disabled = true;
      })
    );
  }
  await Promise.all(tasks);
}

/* ==================== 自制音量合成器 ==================== */

function bindMixer() {
  $('btn-volume-mixer').addEventListener('click', openMixer);
  $('btn-mixer-back').addEventListener('click', closeMixer);
  $('btn-mixer-refresh').addEventListener('click', () => {
    loadMixer(true);
  });
  $('btn-device-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    $('device-dropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    $('device-dropdown').classList.add('hidden');
  });
}

async function openMixer() {
  $('view-main').classList.add('hidden');
  $('view-mixer').classList.remove('hidden');
  $('mixer-error').classList.add('hidden');
  // 保持窗口 320x420，不再因混音器改变面板尺寸（历史：尺寸残留问题）
  await loadMixer(true);
  if (mixerRefreshTimer) clearInterval(mixerRefreshTimer);
  mixerRefreshTimer = setInterval(() => {
    // 视图隐藏或已有刷新在途时跳过，避免无效调用与并发竞态
    if ($('view-mixer').classList.contains('hidden')) return;
    if (mixerLoading) return;
    loadMixer(true);
  }, 5000);
}

function closeMixer() {
  if (mixerRefreshTimer) {
    clearInterval(mixerRefreshTimer);
    mixerRefreshTimer = null;
  }
  $('device-dropdown').classList.add('hidden');
  $('view-mixer').classList.add('hidden');
  $('view-main').classList.remove('hidden');
}

function showMixerError(message) {
  const box = $('mixer-error');
  box.classList.remove('hidden');
  box.innerHTML = `<span>${message}</span><button id="btn-mixer-retry">重试</button>`;
  $('btn-mixer-retry').addEventListener('click', () => loadMixer(true));
}

async function loadMixer(silent = false) {
  if (capabilities && capabilities.audio === false) {
    $('sessions-list').innerHTML = '<div class="sessions-status">当前环境不支持音频</div>';
    return;
  }
  if (mixerLoading) return;
  mixerLoading = true;
  try {
    $('mixer-error').classList.add('hidden');
    if (!silent) {
      $('sessions-list').innerHTML = '<div class="sessions-status"><div class="spinner"></div><span>正在读取音频会话…</span></div>';
    }
    const [devRes, sessRes] = await Promise.all([
      window.electronAPI.system.getAudioDevices(),
      window.electronAPI.system.getAudioSessions(),
    ]);
    renderDevices(devRes);
    renderSessions(sessRes);
  } catch (e) {
    console.error('Failed to load mixer:', e);
    $('sessions-list').innerHTML = '';
    showMixerError('无法读取音频设备或会话');
  } finally {
    mixerLoading = false;
  }
}

function renderDevices(res) {
  const nameEl = $('device-name');
  const dropdown = $('device-dropdown');
  const devices = (res && res.devices) || [];
  const defaultId = res && res.defaultId;
  const current = devices.find((d) => d.id === defaultId) || devices[0];
  nameEl.textContent = current && current.name ? current.name : '输出设备';

  dropdown.innerHTML = '';
  if (devices.length === 0) {
    dropdown.innerHTML = '<div class="device-item">未发现输出设备</div>';
    return;
  }
  devices.forEach((d) => {
    const item = document.createElement('div');
    item.className = 'device-item';
    item.textContent = d.name || '未知设备';
    if (d.id === defaultId) {
      item.innerHTML += `<span class="check">${CHECK_ICON}</span>`;
    }
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      dropdown.classList.add('hidden');
      if (d.id === defaultId) return;
      nameEl.textContent = '切换中…';
      try {
        const r = await window.electronAPI.system.setDefaultAudioDevice(d.id);
        if (r && r.success) {
          nameEl.textContent = d.name || '输出设备';
          loadMixer(true);
        } else {
          nameEl.textContent = current ? current.name : '输出设备';
        }
      } catch (err) {
        nameEl.textContent = current ? current.name : '输出设备';
      }
    });
    dropdown.appendChild(item);
  });
}

function makeRowHtml(s) {
  const icon = s.iconData
    ? `<img class="session-icon" src="${s.iconData}" alt="">`
    : SPKR_ON;
  const badge = s.mute ? MUTE_BADGE : '';
  return `
    <button class="session-icon-btn" title="点击切换静音">${icon}${badge}</button>
    <div class="session-info">
      <span class="session-name"></span>
      <span class="session-percent"></span>
    </div>
    <input type="range" class="slider session-slider" min="0" max="100" value="${s.volume}">
  `;
}

function renderSessions(res) {
  const list = $('sessions-list');
  const sessions = (res && res.sessions) || [];
  list.innerHTML = '';

  // 主音量行
  const masterRow = document.createElement('div');
  masterRow.className = 'session-row';
  masterRow.dataset.pid = 'master';
  masterRow.innerHTML = makeRowHtml({ volume: 0, mute: false, iconData: null });
  masterRow.querySelector('.session-name').textContent = '主音量';
  list.appendChild(masterRow);

  if (sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sessions-status';
    empty.textContent = '没有正在播放声音的应用';
    list.appendChild(empty);
    wireSessionRows();
    loadMasterVolume();
    return;
  }

  // 应用会话行
  sessions.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'session-row';
    row.dataset.pid = String(s.pid);
    row.innerHTML = makeRowHtml(s);
    row.querySelector('.session-name').textContent = s.name || '未知应用';
    row.querySelector('.session-percent').textContent = `${s.volume}%`;
    list.appendChild(row);
  });

  wireSessionRows();
  loadMasterVolume();
}

function wireSessionRows() {
  const rows = document.querySelectorAll('#sessions-list .session-row');
  rows.forEach((row) => {
    const pid = row.dataset.pid;
    const iconBtn = row.querySelector('.session-icon-btn');
    const slider = row.querySelector('.session-slider');
    const percentEl = row.querySelector('.session-percent');

    const commit = debounce(async (value) => {
      try {
        if (pid === 'master') {
          await window.electronAPI.system.setVolume(value);
        } else {
          await window.electronAPI.system.setSessionVolume(parseInt(pid, 10), value);
        }
      } catch (e) {
        console.error('Failed to set session volume:', e);
      }
    }, 250);

    slider.addEventListener('input', (e) => {
      percentEl.textContent = `${e.target.value}%`;
    });
    slider.addEventListener('change', (e) => {
      commit(parseInt(e.target.value, 10));
    });

    iconBtn.addEventListener('click', async () => {
      if (iconBtn.classList.contains('busy')) return;
      const currentlyMuted = !!row.querySelector('.mute-badge');
      const target = !currentlyMuted;
      iconBtn.classList.add('busy');
      iconBtn.disabled = true;
      try {
        let r;
        if (pid === 'master') {
          r = await window.electronAPI.system.setMute(target);
          if (r && r.success) {
            iconBtn.innerHTML = target ? SPKR_OFF + MUTE_BADGE : SPKR_ON;
          }
        } else {
          r = await window.electronAPI.system.setSessionMute(parseInt(pid, 10), target);
          if (r && r.success) {
            if (target) {
              iconBtn.insertAdjacentHTML('beforeend', MUTE_BADGE);
            } else {
              const badge = iconBtn.querySelector('.mute-badge');
              if (badge) badge.remove();
            }
          }
        }
      } catch (e) {
        console.error('Failed to toggle mute:', e);
      } finally {
        iconBtn.classList.remove('busy');
        iconBtn.disabled = false;
      }
    });
  });
}

/* ==================== 网络选择视图 ==================== */

function showViewError(errorId, message, retryFn, btnLabel = '重试') {
  const box = $(errorId);
  box.classList.remove('hidden');
  box.innerHTML = `<span>${message}</span><button id="${errorId}-retry">${btnLabel}</button>`;
  $(`${errorId}-retry`).addEventListener('click', retryFn);
}

function showNetworkOpStatus(message, isError = false, id = 'network-op-status') {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
}

/* ==================== 通用弹窗 / 右键菜单 ==================== */

function closeContextMenu() {
  const m = $('context-menu');
  if (m) m.classList.add('hidden');
}

function openContextMenu(x, y, items) {
  const m = $('context-menu');
  m.innerHTML = '';
  items.forEach((it) => {
    if (it === '---') {
      const d = document.createElement('div');
      d.className = 'context-menu-divider';
      m.appendChild(d);
      return;
    }
    const el = document.createElement('div');
    el.className = 'context-menu-item' + (it.danger ? ' danger' : '');
    el.textContent = it.label;
    el.addEventListener('click', () => {
      closeContextMenu();
      it.action();
    });
    m.appendChild(el);
  });
  m.classList.remove('hidden');
  const rect = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)) + 'px';
}

document.addEventListener('click', (e) => {
  const m = $('context-menu');
  if (m && !m.classList.contains('hidden') && !m.contains(e.target)) closeContextMenu();
});

document.addEventListener('contextmenu', () => closeContextMenu());

function closeAllModals() {
  ['confirm-modal', 'pair-modal', 'props-modal'].forEach((id) => {
    const el = $(id);
    if (el) el.classList.add('hidden');
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeContextMenu();
    closeAllModals();
  }
});

function showConfirm(title, onOk) {
  $('confirm-modal-title').textContent = title;
  $('confirm-modal').classList.remove('hidden');
  $('confirm-modal-ok').onclick = () => {
    $('confirm-modal').classList.add('hidden');
    onOk();
  };
  $('confirm-modal-cancel').onclick = () => $('confirm-modal').classList.add('hidden');
}

function showPairModal(deviceName, onPin) {
  $('pair-modal-device').textContent = deviceName;
  const input = $('pair-modal-input');
  input.value = '';
  $('pair-modal').classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
  const finish = () => {
    const pin = input.value;
    $('pair-modal').classList.add('hidden');
    onPin(pin);
  };
  $('pair-modal-ok').onclick = finish;
  $('pair-modal-cancel').onclick = () => $('pair-modal').classList.add('hidden');
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish();
  };
}

function launchBtFileTransfer() {
  window.electronAPI.system.exec('fsquirt').catch(() => {});
}

function showProps(title, rows) {
  $('props-modal-title').textContent = title;
  const body = $('props-modal-body');
  body.innerHTML = '';
  rows.forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'cc-modal-row';
    row.innerHTML = '<span class="k"></span><span class="v"></span>';
    row.querySelector('.k').textContent = k;
    row.querySelector('.v').textContent = v == null || v === '' ? '—' : String(v);
    body.appendChild(row);
  });
  $('props-modal').classList.remove('hidden');
  $('props-modal-close').onclick = () => $('props-modal').classList.add('hidden');
}

function bindNetworkView() {
  // 逐个绑定并捕获异常，避免单个元素缺失导致后续绑定全部中断
  try {
    $('btn-network-back').addEventListener('click', closeNetworkView);
  } catch (e) {
    console.error('[网络视图] btn-network-back 绑定失败:', e);
  }
  try {
    $('btn-network-refresh').addEventListener('click', () => loadNetwork(true));
  } catch (e) {
    console.error('[网络视图] btn-network-refresh 绑定失败:', e);
  }
  $('btn-wifi-power').addEventListener('click', async () => {
    const sw = $('btn-wifi-power');
    const target = !sw.classList.contains('on');
    sw.classList.toggle('on', target);
    updateToggleButton($('btn-network'), target);
    sw.disabled = true;
    sw.classList.add('loading');
    let failed = null;
    try {
      const r = await window.electronAPI.system.setWifiPower(target);
      if (!(r && r.success)) failed = (r && r.error) || '未知错误';
    } catch (e) {
      console.error('[WiFi开关] IPC 异常:', e);
      failed = e.message;
    } finally {
      sw.disabled = false;
      sw.classList.remove('loading');
      await loadNetwork(true);
      refreshQuickToggleStates();
      // 失败信息必须在状态渲染之后展示，否则会被 loadNetwork 立即隐藏
      if (failed) {
        console.error('[WiFi开关] 操作失败:', failed);
        showNetworkOpStatus(`WiFi 操作失败：${failed}`, true);
        showViewError('network-error', `WiFi 开关操作失败：${failed}`, () => loadNetwork(true));
      } else {
       // showNetworkOpStatus(`WiFi 已${target ? '开启' : '关闭'}（服务端已确认）`);
      }
    }
  });
}

async function openNetworkView() {
  $('view-main').classList.add('hidden');
  $('view-network').classList.remove('hidden');
  $('network-error').classList.add('hidden');
  try {
    // 保持与原控制中心一致的窗口尺寸，网络列表通过内部滚动查看
    await window.electronAPI.controlCenter.resize(320, 420);
  } catch (e) {
    console.error('Failed to resize control center:', e);
  }
  await loadNetwork();
}

function closeNetworkView() {
  $('view-network').classList.add('hidden');
  $('view-main').classList.remove('hidden');
  window.electronAPI.controlCenter.resize(320, 420).catch(() => {});
  refreshQuickToggleStates();
}

async function loadNetwork(silent = false) {
  const list = $('wifi-list');
  $('network-error').classList.add('hidden');
  if (!silent) {
    list.innerHTML = '<div class="sessions-status"><div class="spinner"></div><span>正在扫描…</span></div>';
  }
  try {
    const [statusRes, scanRes] = await Promise.all([
      window.electronAPI.system.getWifiStatus(),
      window.electronAPI.system.scanWifi(),
    ]);
    renderNetworkStatus(statusRes);
    renderWifiList(scanRes, statusRes);
  } catch (e) {
    console.error('Failed to load network:', e);
    list.innerHTML = '';
    showViewError('network-error', '无法读取网络信息', () => loadNetwork(true));
  }
}

function renderNetworkStatus(status) {
  const title = $('network-status-title');
  const sub = $('network-status-sub');
  const sw = $('btn-wifi-power');
  if (!status || status.available === false) {
    title.textContent = 'WiFi 不可用';
    sub.textContent = '未检测到无线网卡';
    sw.classList.remove('on');
    sw.disabled = true;
    return;
  }
  // radioEnabled 为系统软件无线电状态；开关直接控制它（wlanapi，无需管理员）
  const radioEnabled = typeof status.radioEnabled === 'boolean'
    ? status.radioEnabled
    : status.adapterEnabled !== false;
  if (status.hardwareEnabled === false) {
    title.textContent = 'WiFi 硬件开关已关闭';
    sub.textContent = '请通过机身开关或 Fn 键开启';
    sw.classList.remove('on');
    sw.disabled = true;
    return;
  }
  sw.disabled = false;
  sw.classList.toggle('on', radioEnabled);
  const autoHint = status.autoConfigEnabled === false ? '（自动连接已停用）' : '';
  if (status.connected) {
    title.textContent = `已连接 ${status.ssid || ''}`;
    sub.textContent = `信号 ${status.signal}% · ${status.auth || ''}${autoHint}`;
  } else if (status.connecting) {
    title.textContent = '正在连接…';
    sub.textContent = '正在建立连接，请稍候';
  } else if (radioEnabled === false) {
    title.textContent = 'WiFi 已关闭';
    sub.textContent = '点击右侧开关开启';
  } else {
    title.textContent = '未连接';
    sub.textContent = '选择下方网络进行连接';
  }
}

function renderWifiList(scanRes, statusRes) {
  const list = $('wifi-list');
  if (scanRes && scanRes.autoConfigOff) {
    list.innerHTML = '<div class="sessions-status">自动配置已关闭，无法扫描网络<br>请以管理员身份运行：<code>netsh wlan set autoconfig enabled=yes interface="WLAN"</code></div>';
    return;
  }
  const networks = (scanRes && scanRes.networks) || [];
  const connectedSsid = statusRes && statusRes.connected ? statusRes.ssid : '';
  list.innerHTML = '';
  if (networks.length === 0) {
    if (statusRes && statusRes.radioEnabled === false) {
      list.innerHTML = '<div class="sessions-status">WiFi 已关闭，开启后可扫描网络</div>';
    } else {
      list.innerHTML = '<div class="sessions-status">未扫描到可用网络</div>';
    }
    return;
  }
  networks.forEach((n) => {
    if (!n.ssid) return; // 隐藏网络不展示
    const row = document.createElement('div');
    row.className = 'wifi-row';
    row.dataset.ssid = n.ssid;
    row.innerHTML = `
      <div class="signal-bars"></div>
      <span class="wifi-name"></span>
      <span class="wifi-auth"></span>
      <button class="btn-small btn-connect"></button>
    `;
    const litCount = Math.max(1, Math.min(4, Math.round(((n.signal || 0) / 100) * 4)));
    const bars = row.querySelector('.signal-bars');
    for (let i = 0; i < 4; i++) {
      const bar = document.createElement('span');
      if (i < litCount) bar.classList.add('lit');
      bars.appendChild(bar);
    }
    row.querySelector('.wifi-name').textContent = n.ssid;
    row.querySelector('.wifi-auth').textContent = n.secured ? '加密' : '开放';
    const btn = row.querySelector('.btn-connect');
    if (n.ssid === connectedSsid) {
      btn.textContent = '已连接';
      btn.disabled = true;
    } else {
      btn.textContent = '连接';
      btn.addEventListener('click', () => {
        if (n.secured && !n.hasProfile) {
          showPasswordBox(row, n);
        } else {
          connectWifi(n.ssid, '');
        }
      });
    }
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isConnected = n.ssid === connectedSsid;
      const items = [];
      if (isConnected) {
        items.push({
          label: '断开',
          action: async () => {
            await window.electronAPI.system.disconnectWifi().catch(() => null);
            loadNetwork(true);
          },
        });
      } else {
        items.push({
          label: '连接',
          action: () => {
            if (n.secured && !n.hasProfile) showPasswordBox(row, n);
            else connectWifi(n.ssid, '');
          },
        });
      }
      items.push({ label: '忘记', danger: true, action: () => wifiForget(n.ssid) });
      items.push('---');
      items.push({ label: '属性', action: () => showWifiProps(n) });
      openContextMenu(e.clientX, e.clientY, items);
    });
    list.appendChild(row);
  });
}

function wifiForget(ssid) {
  showConfirm(`确定忘记网络「${ssid}」吗？`, async () => {
    try {
      const r = await window.electronAPI.system.forgetWifi(ssid);
      if (r && r.success) {
        loadNetwork(true);
      } else {
        showViewError('network-error', `忘记网络失败：${(r && r.error) || '未知错误'}`, () => loadNetwork(true));
      }
    } catch (e) {
      showViewError('network-error', `忘记网络失败：${e.message}`, () => loadNetwork(true));
    }
  });
}

function showWifiProps(n) {
  showProps(n.ssid, [
    ['SSID', n.ssid],
    ['信号', `${n.signal || 0}%`],
    ['认证', n.auth || '—'],
    ['加密', n.encryption || '—'],
    ['配置文件', n.hasProfile ? '已存' : '未存'],
  ]);
}

function showPasswordBox(row, net) {
  const container = row.parentElement;
  const existing = container.querySelector('.password-box');
  if (existing) existing.remove();
  const box = document.createElement('div');
  box.className = 'password-box';
  box.innerHTML = `
    <input type="password" placeholder="输入 Wi-Fi 密码">
    <button class="btn-small btn-connect">确认</button>
    <button class="btn-small btn-disconnect">取消</button>
  `;
  row.after(box);
  const input = box.querySelector('input');
  input.focus();
  const doConnect = () => {
    const password = input.value;
    box.remove();
    connectWifi(net.ssid, password);
  };
  box.querySelector('button.btn-connect').addEventListener('click', doConnect);
  box.querySelector('button.btn-disconnect').addEventListener('click', () => box.remove());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doConnect();
  });
}

async function connectWifi(ssid, password) {
  const row = [...document.querySelectorAll('#wifi-list .wifi-row')].find((r) => r.dataset.ssid === ssid);
  const btn = row && row.querySelector('.btn-connect');
  if (btn) {
    btn.textContent = '连接中…';
    btn.classList.add('btn-connecting');
  }
  try {
    const r = await window.electronAPI.system.connectWifi(ssid, password);
    if (r && r.success) {
      // netsh 的 connect 命令立即返回，但实际关联需要数秒；
      // 轮询状态直到界面同步为"已连接"，避免显示未连接
      showNetworkOpStatus(`正在连接 ${ssid}…`);
      for (let i = 0; i < 12; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        const st = await window.electronAPI.system.getWifiStatus().catch(() => null);
        if (st && st.connected) break;
      }
      loadNetwork(true);
    } else {
      if (btn) {
        btn.textContent = '连接';
        btn.classList.remove('btn-connecting');
      }
      showViewError('network-error', (r && r.error === 'password_required') ? '需要密码' : '连接失败', () => loadNetwork(true));
    }
  } catch (e) {
    if (btn) {
      btn.textContent = '连接';
      btn.classList.remove('btn-connecting');
    }
    showViewError('network-error', '连接失败', () => loadNetwork(true));
  }
}

/* ==================== 蓝牙选择视图 ==================== */

function bindBluetoothView() {
  $('btn-bluetooth-back').addEventListener('click', closeBluetoothView);
  $('btn-bluetooth-refresh').addEventListener('click', () => loadBluetooth(true));
  $('btn-bt-show-all').addEventListener('click', () => {
    btShowAll = !btShowAll;
    loadBluetooth(true);
  });
  $('btn-bt-power').addEventListener('click', async () => {
    const sw = $('btn-bt-power');
    const target = !sw.classList.contains('on');
    sw.classList.toggle('on', target);
    updateToggleButton($('btn-bluetooth'), target);
    sw.disabled = true;
    try {
      const r = await window.electronAPI.system.toggleBluetooth();
      if (!(r && r.success)) sw.classList.toggle('on', !target);
    } catch (e) {
      sw.classList.toggle('on', !target);
    } finally {
      sw.disabled = false;
      loadBluetooth(true);
      refreshQuickToggleStates();
    }
  });
}

async function openBluetoothView() {
  $('view-main').classList.add('hidden');
  $('view-bluetooth').classList.remove('hidden');
  $('bluetooth-error').classList.add('hidden');
  try {
    // 保持与原控制中心一致的窗口尺寸，蓝牙设备列表通过内部滚动查看
    await window.electronAPI.controlCenter.resize(320, 420);
  } catch (e) {
    console.error('Failed to resize control center:', e);
  }
  await loadBluetooth();
}

function closeBluetoothView() {
  $('view-bluetooth').classList.add('hidden');
  $('view-main').classList.remove('hidden');
  window.electronAPI.controlCenter.resize(320, 420).catch(() => {});
  refreshQuickToggleStates();
}

async function loadBluetooth(silent = false) {
  const list = $('bluetooth-list');
  $('bluetooth-error').classList.add('hidden');
  if (!silent) {
    list.innerHTML = '<div class="sessions-status"><div class="spinner"></div><span>正在读取…</span></div>';
  }
  // 视图标题与底部按钮随模式切换
  $('bluetooth-section-title').textContent = btShowAll ? '所有设备' : '已配对设备';
  $('btn-bt-show-all').textContent = btShowAll ? '仅显示已配对' : '显示所有设备';
  try {
    const statusRes = await window.electronAPI.system.getBluetoothStatus();
    const devRes = btShowAll
      ? await window.electronAPI.system.discoverBluetoothDevices()
      : await window.electronAPI.system.getBluetoothDevices();
    renderBluetoothStatus(statusRes);
    renderBtDevices(devRes);
  } catch (e) {
    console.error('Failed to load bluetooth:', e);
    list.innerHTML = '';
    showViewError('bluetooth-error', btShowAll ? '无法扫描蓝牙设备' : '无法读取蓝牙设备', () => loadBluetooth(true));
  }
}

function renderBluetoothStatus(status) {
  const title = $('bluetooth-status-title');
  const sub = $('bluetooth-status-sub');
  const sw = $('btn-bt-power');
  if (status && status.success) {
    sw.disabled = false;
    sw.classList.toggle('on', !!status.enabled);
    title.textContent = status.enabled ? '蓝牙已开启' : '蓝牙已关闭';
    sub.textContent = status.enabled ? '可连接已配对设备' : '点击右侧开关开启';
  } else {
    sw.classList.remove('on');
    sw.disabled = true;
    title.textContent = '蓝牙不可用';
    sub.textContent = '当前环境不支持';
  }
}

function renderBtDevices(res) {
  const list = $('bluetooth-list');
  const devices = (res && res.devices) || [];
  list.innerHTML = '';
  if (devices.length === 0) {
    list.innerHTML = btShowAll
      ? '<div class="sessions-status">未发现可配对的蓝牙设备</div>'
      : '<div class="sessions-status">没有已配对的蓝牙设备</div>';
    return;
  }
  devices.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'device-row';
    row.dataset.address = d.address;
    row.innerHTML = `
      <div class="net-status-icon">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
        </svg>
      </div>
      <span class="device-name"></span>
      <span class="status-text"></span>
      <button class="btn-small"></button>
    `;
    row.querySelector('.device-name').textContent = d.name;
    const st = row.querySelector('.status-text');
    const btn = row.querySelector('.btn-small');
    if (btShowAll && d.status === 'unpaired') {
      st.textContent = '未配对';
      st.className = 'status-text status-unpaired';
      btn.textContent = '配对';
      btn.className = 'btn-small btn-connect';
      btn.addEventListener('click', () => btPairDevice(d, btn));
    } else {
      st.textContent = d.status === 'connected' ? '已连接' : '未连接';
      st.className = 'status-text status-' + (d.status === 'connected' ? 'connected' : 'paired');
      btn.textContent = d.status === 'connected' ? '断开' : '连接';
      btn.className = d.status === 'connected' ? 'btn-small btn-disconnect' : 'btn-small btn-connect';
      btn.addEventListener('click', () => btDeviceAction(d, d.status !== 'connected', btn));
    }
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items = [];
      if (btShowAll && d.status === 'unpaired') {
        items.push({ label: '配对', action: () => btPairDevice(d, null) });
      } else {
        items.push({
          label: d.status === 'connected' ? '断开' : '连接',
          action: () => btDeviceAction(d, d.status !== 'connected', null),
        });
        items.push({ label: '取消配对', danger: true, action: () => btUnpairDevice(d) });
      }
      items.push('---');
      items.push({ label: '属性', action: () => btShowDeviceProps(d) });
      openContextMenu(e.clientX, e.clientY, items);
    });
    list.appendChild(row);
  });
}

async function btDeviceAction(device, connect, btn) {
  if (btn && btn.classList.contains('btn-connecting')) return;
  if (btn) {
    btn.classList.add('btn-connecting');
    btn.textContent = connect ? '连接中…' : '断开中…';
  }
  try {
    const r = connect
      ? await window.electronAPI.system.connectBluetoothDevice(device.address)
      : await window.electronAPI.system.disconnectBluetoothDevice(device.address);
    if (r && r.success) {
      loadBluetooth(true);
      if (connect && r.connected === false && r.note) {
        showNetworkOpStatus(r.note, false, 'bluetooth-op-status');
      } else if (connect && r.connected === false) {
        showNetworkOpStatus('已发送连接请求，但设备未建立连接（手机类设备通常需在具体服务使用时才连接）', false, 'bluetooth-op-status');
      }
    } else {
      if (btn) {
        btn.classList.remove('btn-connecting');
        btn.textContent = connect ? '连接' : '断开';
      }
      if (r && r.error === 'service_not_found') {
        // 文案内嵌可点击链接，避免长文本压缩按钮
        const box = $('bluetooth-error');
        box.classList.remove('hidden');
        box.innerHTML = '<span>该设备未提供可连接的经典服务。手机类设备请使用 <a href="#" class="link-text" id="bt-file-transfer-link">蓝牙文件传输</a>，或从手机发起连接。</span>';
        const link = $('bt-file-transfer-link');
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            launchBtFileTransfer();
          });
        }
        return;
      }
      // 其余失败统一提示（含管理员模式下仍无法连接的设备），详情进控制台便于排查
      console.error('[蓝牙连接] 失败详情:', JSON.stringify(r));
      const msg = (r && r.error === 'admin_required')
        ? '需要管理员权限，请以管理员身份运行 AmengUI'
        : '设备拒绝连接或需要专门软件';
      const box = $('bluetooth-error');
      box.classList.remove('hidden');
      const detailTip = (r && r.detail) ? String(r.detail).replace(/"/g, '&quot;') : '';
      box.innerHTML = `<span title="${detailTip ? `蓝牙错误：${detailTip}` : ''}">${msg}</span><button id="bluetooth-error-retry">重试</button>`;
      $('bluetooth-error-retry').addEventListener('click', () => loadBluetooth(true));
    }
  } catch (e) {
    if (btn) {
      btn.classList.remove('btn-connecting');
      btn.textContent = connect ? '连接' : '断开';
    }
    showViewError('bluetooth-error', '设备拒绝连接或需要专门软件', () => loadBluetooth(true));
  }
}

async function btPairDevice(device, btn) {
  if (btn) {
    btn.textContent = '配对中…';
    btn.classList.add('btn-connecting');
    btn.disabled = true;
  }
  const finish = () => {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('btn-connecting');
      btn.textContent = '配对';
    }
  };
  try {
    const r = await window.electronAPI.system.pairBluetoothDevice(device.address, '');
    if (r && r.success) {
      finish();
      loadBluetooth(true);
    } else if (r && r.pinRequired) {
      finish();
      showPairModal(device.name || device.address, async (pin) => {
        const r2 = await window.electronAPI.system.pairBluetoothDevice(device.address, pin);
        if (r2 && r2.success) {
          loadBluetooth(true);
        } else {
          showViewError('bluetooth-error', `配对失败：${(r2 && r2.error) || '未知错误'}`, () => loadBluetooth(true));
        }
      });
    } else {
      finish();
      showViewError('bluetooth-error', `配对失败：${(r && r.error) || '未知错误'}`, () => loadBluetooth(true));
    }
  } catch (e) {
    finish();
    showViewError('bluetooth-error', `配对失败：${e.message}`, () => loadBluetooth(true));
  }
}

function btUnpairDevice(device) {
  showConfirm(`确定取消配对「${device.name || device.address}」吗？`, async () => {
    try {
      const r = await window.electronAPI.system.unpairBluetoothDevice(device.address);
      if (r && r.success) {
        loadBluetooth(true);
      } else {
        showViewError('bluetooth-error', `取消配对失败：${(r && r.error) || '未知错误'}`, () => loadBluetooth(true));
      }
    } catch (e) {
      showViewError('bluetooth-error', `取消配对失败：${e.message}`, () => loadBluetooth(true));
    }
  });
}

async function btShowDeviceProps(device) {
  try {
    const r = await window.electronAPI.system.getBluetoothDeviceInfo(device.address);
    if (r && r.success) {
      const services = (r.services && r.services.length) ? r.services.join('\n') : '无';
      showProps(r.name || device.name, [
        ['名称', r.name || device.name],
        ['地址', r.address],
        ['类别', r.classOfDevice],
        ['状态', r.connected ? '已连接' : (r.remembered ? '未连接' : '未配对')],
        ['已配对', r.authenticated ? '是' : '否'],
        ['服务', services],
      ]);
    } else {
      showProps(device.name || '蓝牙设备', [
        ['地址', device.address],
        ['状态', device.status === 'connected' ? '已连接' : '未连接'],
        ['信息', (r && r.error) || '无法读取'],
      ]);
    }
  } catch (e) {
    showProps(device.name || '蓝牙设备', [['地址', device.address], ['错误', e.message]]);
  }
}

async function loadMasterVolume() {
  try {
    const r = await window.electronAPI.system.getVolume();
    if (r && r.success) {
      const masterRow = document.querySelector('#sessions-list .session-row[data-pid="master"]');
      if (masterRow) {
        masterRow.querySelector('.session-slider').value = r.volume;
        masterRow.querySelector('.session-percent').textContent = `${r.volume}%`;
        const iconBtn = masterRow.querySelector('.session-icon-btn');
        iconBtn.innerHTML = r.mute ? SPKR_OFF + MUTE_BADGE : SPKR_ON;
      }
    }
  } catch (e) {
    console.error('Failed to load master volume:', e);
  }
}

async function initControlCenter() {
  bindToggles();
  bindSliders();
  bindMixer();
  bindNetworkView();
  bindBluetoothView();

  // 打开立即渲染，不阻塞在能力探测/数值加载上（能力已在应用启动时预热）
  $('center-loading').classList.add('hidden');

  try {
    capabilities = await window.electronAPI.system.getCapabilities();
  } catch (e) {
    capabilities = null;
  }
  applyCapabilities();
  loadInitialValues();
  refreshQuickToggleStates();
  // 窗口重新聚焦或定时刷新 WiFi/蓝牙/热点按钮状态（外部开关变化也能及时反映）
  window.addEventListener('focus', () => refreshQuickToggleStates());
  setInterval(() => {
    if (document.hidden) return;
    if ($('view-main').classList.contains('hidden')) return;
    refreshQuickToggleStates();
  }, 10000);
  if (!capabilities || capabilities.audio) {
    loadMasterVolume();
  }
}

document.addEventListener('DOMContentLoaded', initControlCenter);
