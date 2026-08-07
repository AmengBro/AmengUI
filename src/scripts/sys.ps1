[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string]$Command = '',
  [Parameter(Position = 1)] [string]$Arg1 = '',
  [Parameter(Position = 2)] [string]$Arg2 = '',
  [switch]$Server
)

# 统一 UTF-8，避免中文设备名乱码
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

# ===== 进程内缓存：避免每次开关都重新枚举设备（本机枚举是主要耗时点） =====
$script:netAdapterName = $null
$script:btInstanceId = $null
$script:btState = $null
$script:cap = $null
$script:wifiScanCache = $null
$script:wifiStatusCache = $null
$script:btDevicesCache = $null
$script:btStatusCache = $null

function Get-Capabilities {
  if ($null -ne $script:cap) { return $script:cap }
  $adapters = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue)
  if ($adapters.Count -eq 0) {
    $adapters = @(Get-CimInstance Win32_NetworkAdapter -Filter "PhysicalAdapter=TRUE" | Where-Object { $_.NetConnectionID })
  }
  $btService = Get-Service bthserv -ErrorAction SilentlyContinue
  $btPnp = @(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue)
  $pcType = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).PCSystemType
  $cap = [ordered]@{
    network = $adapters.Count -gt 0
    bluetooth = ($null -ne $btService) -or ($btPnp.Count -gt 0)
    brightness = $null -ne (Get-CimClass -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue)
    flightMode = Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState'
    nightMode = Test-Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CloudStore\Store\Cache\DefaultAccount\$\windows.data.bluelightreduction.bluelightreductionstate\Current'
    isLaptop = ($pcType -eq 2)
  }
  $script:cap = [pscustomobject]$cap
  return $script:cap
}

function Get-NetAdapterName {
  if ($script:netAdapterName) { return $script:netAdapterName }
  $adapters = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue)
  if ($adapters.Count -eq 0) {
    $adapters = @(Get-CimInstance Win32_NetworkAdapter -Filter "PhysicalAdapter=TRUE" | Where-Object { $_.NetConnectionID })
  }
  if ($adapters.Count -eq 0) { return $null }
  $target = $adapters | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
  if (-not $target) { $target = $adapters | Select-Object -First 1 }
  $name = $target.Name
  if (-not $name) { $name = $target.NetConnectionID }
  $script:netAdapterName = $name
  return $name
}

function Get-BtInstance {
  if ($script:btInstanceId) { return $script:btInstanceId }
  $devices = @(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue)
  if ($devices.Count -eq 0) { return $null }
  # 优先找真正的无线电设备：排除 BTHLE 伪设备，回退 USB 设备
  $radio = $devices | Where-Object { $_.FriendlyName -match 'Radio|Adapter|无线|适配器' -and $_.InstanceId -notlike 'BTHLEDEVICE\*' } | Select-Object -First 1
  if (-not $radio) { $radio = $devices | Where-Object { $_.InstanceId -like 'USB\*' } | Select-Object -First 1 }
  if (-not $radio) { $radio = $devices | Select-Object -First 1 }
  $script:btInstanceId = $radio.InstanceId
  return $script:btInstanceId
}

function Get-BtState {
  # Win32_PnPEntity 比 Get-PnpDevice 快约 3 倍
  if (-not $script:btInstanceId) { return $null }
  $escaped = $script:btInstanceId.Replace('\', '\\')
  $d = Get-CimInstance Win32_PnPEntity -Filter ("DeviceID='" + $escaped + "'") -ErrorAction SilentlyContinue
  if ($d) {
    return ($d.Status -eq 'OK' -or $d.Status -eq 'Started')
  }
  return $null
}

function Get-NetworkState {
  param($name)
  $adapter = Get-NetAdapter -Name $name -ErrorAction SilentlyContinue
  if (-not $adapter) {
    $adapter = Get-CimInstance Win32_NetworkAdapter | Where-Object { $_.NetConnectionID -eq $name } | Select-Object -First 1
  }
  if (-not $adapter) { return $null }
  $isUp = $adapter.Status -in @('Up', 'OK')
  if (-not $isUp -and $adapter.NetEnabled -eq $true) {
    $isUp = $adapter.Status -notin @('Disabled', 'Disconnected', 'Unknown')
  }
  return $isUp
}

function Invoke-NetworkStatus {
  $name = Get-NetAdapterName
  if (-not $name) { return [pscustomobject]@{ success = $false; enabled = $null; name = ''; error = 'no_adapter' } }
  $isUp = Get-NetworkState $name
  if ($null -eq $isUp) { return [pscustomobject]@{ success = $false; enabled = $null; name = $name; error = 'not_found' } }
  return [pscustomobject]@{ success = $true; enabled = $isUp; name = $name }
}

function Invoke-NetworkToggle {
  $name = Get-NetAdapterName
  if (-not $name) { return [pscustomobject]@{ success = $false; enabled = $null; name = ''; error = 'no_adapter' } }
  $isUp = Get-NetworkState $name
  if ($null -eq $isUp) { return [pscustomobject]@{ success = $false; enabled = $null; name = $name; error = 'not_found' } }
  if ($isUp) {
    & netsh interface set interface name="$name" admin=disabled
    if ($LASTEXITCODE -eq 0) {
      return [pscustomobject]@{ success = $true; enabled = $false; name = $name }
    }
    return [pscustomobject]@{ success = $false; enabled = $null; name = $name; error = 'set_failed' }
  } else {
    & netsh interface set interface name="$name" admin=enabled
    if ($LASTEXITCODE -eq 0) {
      return [pscustomobject]@{ success = $true; enabled = $true; name = $name }
    }
    return [pscustomobject]@{ success = $false; enabled = $null; name = $name; error = 'set_failed' }
  }
}

function Invoke-BluetoothStatus {
  # 5 秒缓存，避免界面反复触发慢速查询
  if ($null -ne $script:btStatusCache -and ((Get-Date) - $script:btStatusCache.at).TotalSeconds -lt 5) {
    return $script:btStatusCache.data
  }
  $instance = Get-BtInstance
  if ($instance) {
    $state = Get-BtState
    if ($null -ne $state) {
      $result = [pscustomobject]@{ success = $true; enabled = $state }
      $script:btStatusCache = @{ at = Get-Date; data = $result }
      return $result
    }
  }
  $svc = Get-Service bthserv -ErrorAction SilentlyContinue
  if ($svc) {
    $result = [pscustomobject]@{ success = $true; enabled = ($svc.Status -eq 'Running') }
    $script:btStatusCache = @{ at = Get-Date; data = $result }
    return $result
  }
  return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
}

function Invoke-BluetoothToggle {
  $instance = Get-BtInstance
  if ($instance) {
    # 优先使用进程内缓存状态，未知时才查询一次（避免每次开关都慢速枚举）
    if ($null -eq $script:btState) {
      $script:btState = Get-BtState
      if ($null -eq $script:btState) {
        $svc0 = Get-Service bthserv -ErrorAction SilentlyContinue
        if ($svc0) { $script:btState = ($svc0.Status -eq 'Running') }
      }
    }
    $target = -not $script:btState
    if ($target) {
      & pnputil /enable-device "$instance" 2>&1 | Out-Null
    } else {
      & pnputil /disable-device "$instance" 2>&1 | Out-Null
    }
    if ($LASTEXITCODE -eq 0) {
      $script:btState = $target
      return [pscustomobject]@{ success = $true; enabled = $target }
    }
  }
  $svc = Get-Service bthserv -ErrorAction SilentlyContinue
  if ($svc) {
    if ($svc.Status -eq 'Running') {
      Stop-Service bthserv -Force -ErrorAction SilentlyContinue
      return [pscustomobject]@{ success = $true; enabled = $false }
    } else {
      Start-Service bthserv -ErrorAction SilentlyContinue
      return [pscustomobject]@{ success = $true; enabled = $true }
    }
  }
  return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
}

function Invoke-FlightToggle {
  $key = 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState'
  if (-not (Test-Path $key)) {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
  }
  $val = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).SystemRadioState
  if ($val -eq 1) {
    Set-ItemProperty -Path $key -Name SystemRadioState -Value 0 -ErrorAction SilentlyContinue
    return [pscustomobject]@{ success = $true; enabled = $false }
  } else {
    Set-ItemProperty -Path $key -Name SystemRadioState -Value 1 -ErrorAction SilentlyContinue
    return [pscustomobject]@{ success = $true; enabled = $true }
  }
}

function Invoke-NightToggle {
  $path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CloudStore\Store\Cache\DefaultAccount\$\windows.data.bluelightreduction.bluelightreductionstate\Current'
  if (-not (Test-Path $path)) {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
  }
  $bytes = (Get-ItemProperty -Path $path -ErrorAction SilentlyContinue).Data
  if ($null -eq $bytes -or $bytes.Length -lt 5) {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'bad_data' }
  }
  if ($bytes[4] -eq 1) { $bytes[4] = 0 } else { $bytes[4] = 1 }
  Set-ItemProperty -Path $path -Name Data -Value $bytes -ErrorAction SilentlyContinue
  $newVal = (Get-ItemProperty -Path $path -ErrorAction SilentlyContinue).Data
  return [pscustomobject]@{ success = $true; enabled = ($newVal[4] -eq 1) }
}

function Get-BrightnessValue {
  $v = (Get-WmiObject -Namespace root\WMI -Class WmiMonitorBrightness -ErrorAction SilentlyContinue).CurrentBrightness
  if ($null -eq $v) { return [pscustomobject]@{ success = $false; brightness = -1 } }
  return [pscustomobject]@{ success = $true; brightness = [int]$v }
}

function Set-BrightnessValue {
  param($value)
  $v = [int]$value
  if ($v -lt 0) { $v = 0 }
  if ($v -gt 100) { $v = 100 }
  try {
    (Get-WmiObject -Namespace root\WMI -Class WmiMonitorBrightnessMethods -ErrorAction Stop).WmiSetBrightness(1, $v)
    return [pscustomobject]@{ success = $true }
  } catch {
    return [pscustomobject]@{ success = $false; error = $_.Exception.Message }
  }
}

function Invoke-WifiStatus {
  # 5 秒缓存：netsh 查询约 0.6 秒，界面重复刷新时避免每次都执行
  if ($null -ne $script:wifiStatusCache -and ((Get-Date) - $script:wifiStatusCache.at).TotalSeconds -lt 5) {
    return $script:wifiStatusCache.data
  }
  $wlan = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
    $_.InterfaceDescription -match 'Wireless|Wi-Fi|WLAN|无线' -or $_.Name -match 'WLAN|WiFi|无线'
  } | Select-Object -First 1
  $out = & netsh wlan show interfaces 2>$null
  $info = @{
    available = ($null -ne $wlan)
    adapterEnabled = ($null -ne $wlan -and $wlan.AdminStatus -eq 'Up')
    connected = $false
    ssid = ''
    signal = 0
    auth = ''
    adapter = ''
  }
  if ($null -ne $wlan) { $info.adapter = $wlan.Name }
  foreach ($line in $out) {
    if ($line -match '^\s*(State|状态)\s*:\s*(.+)$') {
      $state = $matches[2].Trim()
      $info.connected = ($state -match 'connected|已连接')
    } elseif ($line -match '^\s*SSID\s*:\s*(.+)$') {
      $info.ssid = $matches[1].Trim()
    } elseif ($line -match '^\s*(Signal|信号)\s*:\s*(\d+)') {
      $info.signal = [int]$matches[2]
    } elseif ($line -match '^\s*(Authentication|身份验证)\s*:\s*(.+)$') {
      $info.auth = $matches[2].Trim()
    }
  }
  $result = [pscustomobject]$info
  $script:wifiStatusCache = @{ at = Get-Date; data = $result }
  return $result
}

function Invoke-WifiPower {
  param($enable)
  $wlan = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
    $_.InterfaceDescription -match 'Wireless|Wi-Fi|WLAN|无线' -or $_.Name -match 'WLAN|WiFi|无线'
  } | Select-Object -First 1
  if (-not $wlan) { return [pscustomobject]@{ success = $false; error = 'no_wlan' } }
  if ($enable) {
    & netsh interface set interface name="$($wlan.Name)" admin=enabled
  } else {
    & netsh interface set interface name="$($wlan.Name)" admin=disabled
  }
  if ($LASTEXITCODE -eq 0) {
    $script:wifiScanCache = $null
    $script:wifiStatusCache = $null
  }
  return [pscustomobject]@{ success = ($LASTEXITCODE -eq 0); enabled = $enable }
}

function Invoke-WifiScan {
  # 10 秒缓存：扫描本身较慢，避免界面反复触发
  if ($null -ne $script:wifiScanCache -and ((Get-Date) - $script:wifiScanCache.at).TotalSeconds -lt 10) {
    return $script:wifiScanCache.data
  }
  $out = & netsh wlan show networks mode=bssid 2>$null
  $profileNames = @{}
  $profiles = & netsh wlan show profiles 2>$null
  foreach ($line in $profiles) {
    if ($line -match '^\s*(All User Profile|所有用户配置文件)\s*:\s*(.+)$') {
      $profileNames[$matches[2].Trim()] = $true
    }
  }
  $list = [System.Collections.Generic.List[object]]::new()
  $current = $null
  foreach ($line in $out) {
    if ($line -match '^\s*SSID\s+\d+\s*:\s*(.*)$') {
      if ($null -ne $current) { $list.Add($current) }
      $current = [ordered]@{
        ssid = $matches[1].Trim()
        auth = ''
        encryption = ''
        signal = 0
      }
    } elseif ($null -ne $current -and $line -match '^\s*(Authentication|身份验证)\s*:\s*(.+)$') {
      $current.auth = $matches[2].Trim()
    } elseif ($null -ne $current -and $line -match '^\s*(Encryption|加密)\s*:\s*(.+)$') {
      $current.encryption = $matches[2].Trim()
    } elseif ($null -ne $current -and $line -match '^\s*(Signal|信号)\s*:\s*(\d+)') {
      $sig = [int]$matches[2]
      if ($sig -gt $current.signal) { $current.signal = $sig }
    }
  }
  if ($null -ne $current) { $list.Add($current) }
  $mapped = @($list | ForEach-Object {
    [pscustomobject]@{
      ssid = $_.ssid
      auth = $_.auth
      encryption = $_.encryption
      signal = $_.signal
      secured = ($_.auth -notmatch '^\s*(Open|开放)\s*$' -and $_.auth -ne '')
      hasProfile = $profileNames.ContainsKey($_.ssid)
    }
  })
  $result = [pscustomobject]@{ networks = $mapped }
  $script:wifiScanCache = @{ at = Get-Date; data = $result }
  return $result
}

function Build-WifiProfileXml {
  param($escapedSsid, $escapedPass, $authKind)
  if ([string]::IsNullOrEmpty($escapedPass)) {
    return @"
<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>$escapedSsid</name>
  <SSIDConfig><SSID><name>$escapedSsid</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM><security><authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption></security></MSM>
</WLANProfile>
"@
  }
  return @"
<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>$escapedSsid</name>
  <SSIDConfig><SSID><name>$escapedSsid</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM><security>
    <authEncryption><authentication>$authKind</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
    <sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>$escapedPass</keyMaterial></sharedKey>
  </security></MSM>
</WLANProfile>
"@
}

function Invoke-WifiConnect {
  param($ssid, $password)
  $ssid = [string]$ssid
  if ([string]::IsNullOrEmpty($ssid)) { return [pscustomobject]@{ success = $false; error = 'no_ssid' } }
  $escapedSsid = [System.Security.SecurityElement]::Escape($ssid)

  # 已有配置文件则直接连接
  $profiles = & netsh wlan show profiles 2>$null
  $hasProfile = $false
  foreach ($line in $profiles) {
    if ($line -match '^\s*(All User Profile|所有用户配置文件)\s*:\s*(.+)$') {
      if ($matches[2].Trim() -eq $ssid) { $hasProfile = $true; break }
    }
  }
  if ($hasProfile) {
    & netsh wlan connect name="$ssid" ssid="$ssid" 2>$null
    if ($LASTEXITCODE -eq 0) {
      $script:wifiScanCache = $null
      $script:wifiStatusCache = $null
    }
    return [pscustomobject]@{ success = ($LASTEXITCODE -eq 0); usingProfile = $true }
  }

  # 需要新建配置文件（需要密码）
  if ([string]::IsNullOrEmpty($password)) {
    return [pscustomobject]@{ success = $false; error = 'password_required' }
  }
  $escapedPass = [System.Security.SecurityElement]::Escape($password)
  $authKind = 'WPA2PSK'
  $xml = Build-WifiProfileXml $escapedSsid $escapedPass $authKind
  $xmlPath = Join-Path $env:TEMP ('amengui_wifi_' + [guid]::NewGuid().ToString('N') + '.xml')
  try {
    [System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::UTF8)
    & netsh wlan add profile filename="$xmlPath" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { return [pscustomobject]@{ success = $false; error = 'add_profile_failed' } }
    & netsh wlan connect name="$ssid" ssid="$ssid" 2>$null
    if ($LASTEXITCODE -eq 0) {
      $script:wifiScanCache = $null
      $script:wifiStatusCache = $null
    }
    return [pscustomobject]@{ success = ($LASTEXITCODE -eq 0); usingProfile = $false }
  } finally {
    Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-WifiDisconnect {
  & netsh wlan disconnect 2>$null
  $script:wifiScanCache = $null
  $script:wifiStatusCache = $null
  return [pscustomobject]@{ success = ($LASTEXITCODE -eq 0) }
}

function Invoke-BtDevices {
  # 10 秒缓存：Get-PnpDevice 全量枚举较慢（约 2~3 秒）
  if ($null -ne $script:btDevicesCache -and ((Get-Date) - $script:btDevicesCache.at).TotalSeconds -lt 10) {
    return $script:btDevicesCache.data
  }
  $devices = @(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object {
    $_.InstanceId -match 'BLUETOOTHDEVICE_|^BTHLE\\DEV_'
  })
  $seen = @{}
  $list = @()
  foreach ($d in $devices) {
    $name = $d.FriendlyName
    if ([string]::IsNullOrEmpty($name) -or $seen.ContainsKey($name)) { continue }
    $seen[$name] = $true
    if ($d.Status -eq 'OK') { $status = 'connected' }
    elseif ($d.Status -eq 'Error') { $status = 'error' }
    else { $status = 'paired' }
    $list += [pscustomobject]@{
      name = $name
      instanceId = $d.InstanceId
      status = $status
    }
  }
  $result = [pscustomobject]@{ devices = $list }
  $script:btDevicesCache = @{ at = Get-Date; data = $result }
  return $result
}

function Invoke-BtDeviceAction {
  param($instanceId, $enable)
  if ([string]::IsNullOrEmpty($instanceId)) { return [pscustomobject]@{ success = $false; error = 'no_device' } }
  if ($enable) {
    & pnputil /enable-device "$instanceId" 2>&1 | Out-Null
  } else {
    & pnputil /disable-device "$instanceId" 2>&1 | Out-Null
  }
  if ($LASTEXITCODE -eq 0) {
    $script:btDevicesCache = $null
    return [pscustomobject]@{ success = $true; enabled = $enable }
  }
  return [pscustomobject]@{ success = $false; error = 'action_failed' }
}

function Invoke-SysCommand {
  param([string]$cmd, [object[]]$args)
  # 注意：不要用 switch 分发命令——PowerShell 5.1 对 switch 子句内的复杂表达式存在解析怪癖
  if ($cmd -eq 'capabilities') {
    Get-Capabilities
  } elseif ($cmd -eq 'networkStatus') {
    Invoke-NetworkStatus
  } elseif ($cmd -eq 'networkToggle') {
    Invoke-NetworkToggle
  } elseif ($cmd -eq 'bluetoothStatus') {
    Invoke-BluetoothStatus
  } elseif ($cmd -eq 'bluetoothToggle') {
    Invoke-BluetoothToggle
  } elseif ($cmd -eq 'wifiStatus') {
    Invoke-WifiStatus
  } elseif ($cmd -eq 'wifiPower') {
    Invoke-WifiPower ([bool]$args[0])
  } elseif ($cmd -eq 'wifiScan') {
    Invoke-WifiScan
  } elseif ($cmd -eq 'wifiConnect') {
    Invoke-WifiConnect ([string]$args[0]) ([string]$args[1])
  } elseif ($cmd -eq 'wifiDisconnect') {
    Invoke-WifiDisconnect
  } elseif ($cmd -eq 'btDevices') {
    Invoke-BtDevices
  } elseif ($cmd -eq 'btConnect') {
    Invoke-BtDeviceAction ([string]$args[0]) $true
  } elseif ($cmd -eq 'btDisconnect') {
    Invoke-BtDeviceAction ([string]$args[0]) $false
  } elseif ($cmd -eq 'flightToggle') {
    Invoke-FlightToggle
  } elseif ($cmd -eq 'nightToggle') {
    Invoke-NightToggle
  } elseif ($cmd -eq 'getBrightness') {
    Get-BrightnessValue
  } elseif ($cmd -eq 'setBrightness') {
    Set-BrightnessValue $args[0]
  } else {
    throw "unknown sys command: $cmd"
  }
}

if ($Server) {
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim().Length -eq 0) { continue }
    $req = $null
    try { $req = $line | ConvertFrom-Json } catch { }
    if ($null -eq $req) {
      [Console]::Out.WriteLine('{"ok":false,"error":"bad_request"}')
      [Console]::Out.Flush()
      continue
    }
    try {
      $data = Invoke-SysCommand $req.cmd @($req.args)
      [Console]::Out.WriteLine(([pscustomobject]@{ id = $req.id; ok = $true; data = $data } | ConvertTo-Json -Compress -Depth 6))
    } catch {
      [Console]::Out.WriteLine(([pscustomobject]@{ id = $req.id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress -Depth 4))
    }
    [Console]::Out.Flush()
  }
  exit 0
}

Invoke-SysCommand $Command @($Arg1, $Arg2) | ConvertTo-Json -Compress -Depth 6
