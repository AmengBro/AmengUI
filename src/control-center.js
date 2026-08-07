const $ = (id) => document.getElementById(id);

let capabilities = null;

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
      valueEl.textContent = (result && result.error === 'unsupported') ? '不支持' : '失败';
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
  const nightModeBtn = $('btn-night-mode');

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

  nightModeBtn.addEventListener('click', () => {
    runToggle(
      nightModeBtn,
      $('night-mode-value'),
      () => window.electronAPI.system.toggleNightMode(),
      (enabled) => (enabled ? '开' : '关'),
      !nightModeBtn.classList.contains('active')
    );
  });
}

function bindSliders() {
  const brightnessSlider = $('brightness-slider');
  const brightnessValue = $('brightness-value');
  const volumeSlider = $('volume-slider');
  const volumeValue = $('volume-value');

  const commitVolume = debounce(async (value) => {
    try {
      await window.electronAPI.system.setVolume(value);
    } catch (e) {
      console.error('Failed to set volume:', e);
    }
  }, 250);

  const commitBrightness = debounce(async (value) => {
    try {
      await window.electronAPI.system.setBrightness(value);
    } catch (e) {
      console.error('Failed to set brightness:', e);
    }
  }, 250);

  brightnessSlider.addEventListener('input', (e) => {
    brightnessValue.textContent = `${e.target.value}%`;
  });
  brightnessSlider.addEventListener('change', (e) => {
    commitBrightness(parseInt(e.target.value, 10));
  });

  volumeSlider.addEventListener('input', (e) => {
    volumeValue.textContent = `${e.target.value}%`;
  });
  volumeSlider.addEventListener('change', (e) => {
    commitVolume(parseInt(e.target.value, 10));
  });
}

function applyCapabilities() {
  if (!capabilities) return;
  const map = {
    network: 'btn-network',
    bluetooth: 'btn-bluetooth',
    flightMode: 'btn-flight-mode',
    nightMode: 'btn-night-mode',
  };
  for (const [cap, id] of Object.entries(map)) {
    const btn = $(id);
    if (btn && !capabilities[cap]) btn.classList.add('unsupported');
  }
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
        }
      }).catch(() => {})
    );
  }
  if (!capabilities || capabilities.brightness || capabilities.isLaptop) {
    tasks.push(
      window.electronAPI.system.getBrightness().then((r) => {
        if (r && r.success && typeof r.brightness === 'number' && r.brightness >= 0) {
          brightnessSlider.value = r.brightness;
          brightnessValue.textContent = `${r.brightness}%`;
        }
      }).catch(() => {})
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
  try {
    await window.electronAPI.controlCenter.resize(340, 520);
  } catch (e) {
    console.error('Failed to resize control center:', e);
  }
  await loadMixer(true);
}

function closeMixer() {
  $('device-dropdown').classList.add('hidden');
  $('view-mixer').classList.add('hidden');
  $('view-main').classList.remove('hidden');
  window.electronAPI.controlCenter.resize(320, 420).catch(() => {});
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
  $('mixer-error').classList.add('hidden');
  if (!silent) {
    $('sessions-list').innerHTML = '<div class="sessions-status"><div class="spinner"></div><span>正在读取音频会话…</span></div>';
  }
  try {
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

function showViewError(errorId, message, retryFn) {
  const box = $(errorId);
  box.classList.remove('hidden');
  box.innerHTML = `<span>${message}</span><button id="${errorId}-retry">重试</button>`;
  $(`${errorId}-retry`).addEventListener('click', retryFn);
}

function bindNetworkView() {
  $('btn-network-back').addEventListener('click', closeNetworkView);
  $('btn-network-refresh').addEventListener('click', () => loadNetwork(true));
  $('btn-wifi-power').addEventListener('click', async () => {
    const sw = $('btn-wifi-power');
    const target = !sw.classList.contains('on');
    sw.classList.toggle('on', target);
    sw.disabled = true;
    try {
      const r = await window.electronAPI.system.setWifiPower(target);
      if (!(r && r.success)) sw.classList.toggle('on', !target);
    } catch (e) {
      sw.classList.toggle('on', !target);
    } finally {
      sw.disabled = false;
      loadNetwork(true);
    }
  });
}

async function openNetworkView() {
  $('view-main').classList.add('hidden');
  $('view-network').classList.remove('hidden');
  $('network-error').classList.add('hidden');
  try {
    await window.electronAPI.controlCenter.resize(340, 560);
  } catch (e) {
    console.error('Failed to resize control center:', e);
  }
  await loadNetwork();
}

function closeNetworkView() {
  $('view-network').classList.add('hidden');
  $('view-main').classList.remove('hidden');
  window.electronAPI.controlCenter.resize(320, 420).catch(() => {});
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
  sw.disabled = false;
  sw.classList.toggle('on', status.adapterEnabled !== false);
  if (status.connected) {
    title.textContent = `已连接 ${status.ssid || ''}`;
    sub.textContent = `信号 ${status.signal}% · ${status.auth || ''}`;
  } else if (status.adapterEnabled === false) {
    title.textContent = 'WiFi 已关闭';
    sub.textContent = '点击右侧开关开启';
  } else {
    title.textContent = '未连接';
    sub.textContent = '选择下方网络进行连接';
  }
}

function renderWifiList(scanRes, statusRes) {
  const list = $('wifi-list');
  const networks = (scanRes && scanRes.networks) || [];
  const connectedSsid = statusRes && statusRes.connected ? statusRes.ssid : '';
  list.innerHTML = '';
  if (networks.length === 0) {
    list.innerHTML = '<div class="sessions-status">未扫描到可用网络</div>';
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
    list.appendChild(row);
  });
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
  $('btn-bt-power').addEventListener('click', async () => {
    const sw = $('btn-bt-power');
    const target = !sw.classList.contains('on');
    sw.classList.toggle('on', target);
    sw.disabled = true;
    try {
      const r = await window.electronAPI.system.toggleBluetooth();
      if (!(r && r.success)) sw.classList.toggle('on', !target);
    } catch (e) {
      sw.classList.toggle('on', !target);
    } finally {
      sw.disabled = false;
      loadBluetooth(true);
    }
  });
}

async function openBluetoothView() {
  $('view-main').classList.add('hidden');
  $('view-bluetooth').classList.remove('hidden');
  $('bluetooth-error').classList.add('hidden');
  try {
    await window.electronAPI.controlCenter.resize(340, 540);
  } catch (e) {
    console.error('Failed to resize control center:', e);
  }
  await loadBluetooth();
}

function closeBluetoothView() {
  $('view-bluetooth').classList.add('hidden');
  $('view-main').classList.remove('hidden');
  window.electronAPI.controlCenter.resize(320, 420).catch(() => {});
}

async function loadBluetooth(silent = false) {
  const list = $('bluetooth-list');
  $('bluetooth-error').classList.add('hidden');
  if (!silent) {
    list.innerHTML = '<div class="sessions-status"><div class="spinner"></div><span>正在读取…</span></div>';
  }
  try {
    const [statusRes, devRes] = await Promise.all([
      window.electronAPI.system.getBluetoothStatus(),
      window.electronAPI.system.getBluetoothDevices(),
    ]);
    renderBluetoothStatus(statusRes);
    renderBtDevices(devRes);
  } catch (e) {
    console.error('Failed to load bluetooth:', e);
    list.innerHTML = '';
    showViewError('bluetooth-error', '无法读取蓝牙设备', () => loadBluetooth(true));
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
    list.innerHTML = '<div class="sessions-status">没有已配对的蓝牙设备</div>';
    return;
  }
  const statusText = { connected: '已连接', paired: '已配对', error: '异常' };
  devices.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'device-row';
    row.dataset.instanceId = d.instanceId;
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
    st.textContent = statusText[d.status] || '已配对';
    st.className = 'status-text status-' + (d.status || 'paired');
    const btn = row.querySelector('.btn-small');
    if (d.status === 'connected') {
      btn.textContent = '断开';
      btn.className = 'btn-small btn-disconnect';
    } else {
      btn.textContent = '连接';
      btn.className = 'btn-small btn-connect';
    }
    btn.addEventListener('click', () => btDeviceAction(d, d.status !== 'connected', btn));
    list.appendChild(row);
  });
}

async function btDeviceAction(device, connect, btn) {
  if (btn.classList.contains('btn-connecting')) return;
  btn.classList.add('btn-connecting');
  btn.textContent = connect ? '连接中…' : '断开中…';
  try {
    const r = connect
      ? await window.electronAPI.system.connectBluetoothDevice(device.instanceId)
      : await window.electronAPI.system.disconnectBluetoothDevice(device.instanceId);
    if (r && r.success) {
      loadBluetooth(true);
    } else {
      btn.classList.remove('btn-connecting');
      btn.textContent = connect ? '连接' : '断开';
      showViewError('bluetooth-error', '操作失败', () => loadBluetooth(true));
    }
  } catch (e) {
    btn.classList.remove('btn-connecting');
    btn.textContent = connect ? '连接' : '断开';
    showViewError('bluetooth-error', '操作失败', () => loadBluetooth(true));
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
  if (!capabilities || capabilities.audio) {
    loadMasterVolume();
  }
}

document.addEventListener('DOMContentLoaded', initControlCenter);
