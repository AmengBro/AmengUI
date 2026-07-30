async function initControlCenter() {
  const networkBtn = document.getElementById('btn-network');
  const bluetoothBtn = document.getElementById('btn-bluetooth');
  const flightModeBtn = document.getElementById('btn-flight-mode');
  const nightModeBtn = document.getElementById('btn-night-mode');
  
  const brightnessSlider = document.getElementById('brightness-slider');
  const brightnessValue = document.getElementById('brightness-value');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeValue = document.getElementById('volume-value');
  const volumeMixerBtn = document.getElementById('btn-volume-mixer');

  try {
    const volume = await window.electronAPI.system.getVolume();
    volumeSlider.value = volume;
    volumeValue.textContent = `${volume}%`;
    
    const brightness = await window.electronAPI.system.getBrightness();
    brightnessSlider.value = brightness;
    brightnessValue.textContent = `${brightness}%`;
  } catch (e) {
    console.error('Failed to get initial values:', e);
  }

  networkBtn.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.system.toggleNetwork();
      updateToggleButton(networkBtn, result.enabled);
      document.getElementById('network-value').textContent = result.enabled ? '已连接' : '已断开';
    } catch (e) {
      console.error('Failed to toggle network:', e);
    }
  });

  bluetoothBtn.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.system.toggleBluetooth();
      updateToggleButton(bluetoothBtn, result.enabled);
      document.getElementById('bluetooth-value').textContent = result.enabled ? '开' : '关';
    } catch (e) {
      console.error('Failed to toggle bluetooth:', e);
    }
  });

  flightModeBtn.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.system.toggleFlightMode();
      updateToggleButton(flightModeBtn, result.enabled);
      document.getElementById('flight-mode-value').textContent = result.enabled ? '开' : '关';
    } catch (e) {
      console.error('Failed to toggle flight mode:', e);
    }
  });

  nightModeBtn.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.system.toggleNightMode();
      updateToggleButton(nightModeBtn, result.enabled);
      document.getElementById('night-mode-value').textContent = result.enabled ? '开' : '关';
    } catch (e) {
      console.error('Failed to toggle night mode:', e);
    }
  });

  brightnessSlider.addEventListener('input', async (e) => {
    const value = e.target.value;
    brightnessValue.textContent = `${value}%`;
    try {
      await window.electronAPI.system.setBrightness(parseInt(value));
    } catch (e) {
      console.error('Failed to set brightness:', e);
    }
  });

  volumeSlider.addEventListener('input', async (e) => {
    const value = e.target.value;
    volumeValue.textContent = `${value}%`;
    try {
      await window.electronAPI.system.setVolume(parseInt(value));
    } catch (e) {
      console.error('Failed to set volume:', e);
    }
  });

  volumeMixerBtn.addEventListener('click', async () => {
    try {
      await window.electronAPI.system.openVolumeMixer();
    } catch (e) {
      console.error('Failed to open volume mixer:', e);
    }
  });
}

function updateToggleButton(button, enabled) {
  if (enabled) {
    button.classList.add('active');
  } else {
    button.classList.remove('active');
  }
}

document.addEventListener('DOMContentLoaded', initControlCenter);