[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string]$Op = ''
)

# winrt.ps1 — Windows PowerShell 5.1 专用 WinRT 操作辅助脚本
# 用途：当 sys.ps1 运行在 PowerShell 7 下时（.NET Core 无法用 ContentType=WindowsRuntime
# 加载 WinRT 类型），由本脚本代为执行飞行模式/移动热点等 WinRT 操作，输出单行 JSON。
# 仅支持 Windows PowerShell 5.1（系统自带，Windows 10/11 均存在）。

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
})[0]

function Await-Operation {
  param($op, $resultType)
  $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

$radioType = [Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType = WindowsRuntime]
$stateType = [Windows.Devices.Radios.RadioState, Windows.Devices.Radios, ContentType = WindowsRuntime]
$accessType = [Windows.Devices.Radios.RadioAccessStatus, Windows.Devices.Radios, ContentType = WindowsRuntime]
$listType = [System.Collections.Generic.IReadOnlyList``1].MakeGenericType($radioType)

function Get-Radios {
  return @(Await-Operation ($radioType::GetRadiosAsync()) $listType)
}

function Set-RadioState {
  param($radio, $state)
  $null = Await-Operation ($radio.SetStateAsync($state)) $accessType
}

function Get-HotspotManager {
  $mgrType = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
  $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
  if ($null -eq $profile) { return $null }
  return $mgrType::CreateFromConnectionProfile($profile)
}

$result = $null
try {
  if ($Op -eq 'flightStatus') {
    $radios = Get-Radios
    if ($radios.Count -eq 0) {
      $result = [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
    } else {
      $anyOn = @($radios | Where-Object { $_.State -eq $stateType::On }).Count -gt 0
      $result = [pscustomobject]@{ success = $true; enabled = (-not $anyOn) }
    }
  } elseif ($Op -eq 'flightToggle') {
    $radios = Get-Radios
    if ($radios.Count -eq 0) {
      $result = [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
    } else {
      $anyOn = @($radios | Where-Object { $_.State -eq $stateType::On }).Count -gt 0
      $wantOn = $anyOn
      $target = if ($wantOn) { $stateType::Off } else { $stateType::On }
      foreach ($r in $radios) { Set-RadioState $r $target }
      $sw = [System.Diagnostics.Stopwatch]::StartNew()
      $allMatch = $false
      while ($sw.Elapsed.TotalSeconds -lt 15) {
        Start-Sleep -Milliseconds 500
        $rs = Get-Radios
        $allMatch = $true
        foreach ($r in $rs) {
          if ($r.State -ne $target) { $allMatch = $false; break }
        }
        if ($allMatch) { break }
      }
      if ($allMatch) {
        $result = [pscustomobject]@{ success = $true; enabled = $wantOn }
      } else {
        $result = [pscustomobject]@{ success = $false; enabled = $null; error = 'timeout' }
      }
    }
  } elseif ($Op -eq 'btRadioStatus') {
    $radios = Get-Radios
    $bt = @($radios | Where-Object { ([string]$_.Kind) -eq 'Bluetooth' })[0]
    if ($null -eq $bt) {
      $result = [pscustomobject]@{ success = $false; radioEnabled = $null }
    } else {
      $result = [pscustomobject]@{ success = $true; radioEnabled = ($bt.State -eq $stateType::On) }
    }
  } elseif ($Op -eq 'hotspotStatus') {
    $m = Get-HotspotManager
    if ($null -eq $m) {
      $result = [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
    } else {
      $result = [pscustomobject]@{ success = $true; enabled = (([string]$m.TetheringOperationalState) -eq 'On') }
    }
  } elseif ($Op -eq 'hotspotToggle') {
    $m = Get-HotspotManager
    if ($null -eq $m) {
      $result = [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
    } else {
      $current = [string]$m.TetheringOperationalState
      $wantOn = ($current -ne 'On')
      if ($wantOn) { $null = $m.StartTetheringAsync() } else { $null = $m.StopTetheringAsync() }
      $sw = [System.Diagnostics.Stopwatch]::StartNew()
      $state = $current
      while ($sw.Elapsed.TotalSeconds -lt 30) {
        Start-Sleep -Milliseconds 500
        $mm = Get-HotspotManager
        if ($null -eq $mm) { $state = 'Unknown'; break }
        $state = [string]$mm.TetheringOperationalState
        if ($state -eq 'On' -or $state -eq 'Off') { break }
      }
      $ok = (($state -eq 'On') -eq $wantOn)
      if ($ok) {
        $result = [pscustomobject]@{ success = $true; enabled = $wantOn }
      } else {
        $result = [pscustomobject]@{ success = $false; enabled = $null; error = 'timeout'; state = $state }
      }
    }
  } else {
    $result = [pscustomobject]@{ success = $false; enabled = $null; error = 'unknown_op' }
  }
} catch {
  $result = [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported'; detail = $_.Exception.Message }
}

$result | ConvertTo-Json -Compress -Depth 4
