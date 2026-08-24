[CmdletBinding()]
param(
  [switch]$Server,
  [switch]$Once
)

# Windows PowerShell 5.1 is intentional here. PowerShell 7 cannot project the
# Windows.UI.Notifications WinRT types used by UserNotificationListener.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
  })[0]
  if ($null -eq $asTaskGeneric) { throw 'WinRT async bridge unavailable' }
} catch {
  $failure = [pscustomobject]@{ success = $false; status = 'Unavailable'; error = $_.Exception.Message; items = @() }
  $failure | ConvertTo-Json -Compress -Depth 8
  exit 0
}

$listenerType = [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime]
$accessStatusType = [Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus, Windows.UI.Notifications, ContentType = WindowsRuntime]
$notificationType = [Windows.UI.Notifications.UserNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
$notificationListType = [System.Collections.Generic.IReadOnlyList``1].MakeGenericType($notificationType)
$toastKind = [Windows.UI.Notifications.NotificationKinds]::Toast
$toastBinding = [Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric

function Await-WinRtOperation {
  param($Operation, $ResultType)
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $task = $asTask.Invoke($null, @($Operation))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

function Convert-TimeToEpochMs {
  param($Value)
  try {
    if ($Value -is [DateTimeOffset]) { return $Value.ToUnixTimeMilliseconds() }
    return ([DateTimeOffset]$Value).ToUnixTimeMilliseconds()
  } catch { return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
}

function Get-NotificationSnapshot {
  try {
    $listener = $listenerType::Current
    $access = [string]$listener.GetAccessStatus()
    if ($access -eq 'Unspecified') {
      # First-run permission request. Windows owns the consent UI and remembers
      # the result; subsequent polls only read GetAccessStatus().
      $access = [string](Await-WinRtOperation ($listener.RequestAccessAsync()) $accessStatusType)
    }
    if ($access -ne 'Allowed') {
      return [pscustomobject]@{ success = $false; status = $access; items = @() }
    }

    $operation = $listener.GetNotificationsAsync($toastKind)
    $notifications = @(Await-WinRtOperation $operation $notificationListType)
    $items = @()
    foreach ($notification in $notifications) {
      $texts = @()
      try {
        $binding = $notification.Notification.Visual.GetBinding($toastBinding)
        if ($binding) { $texts = @($binding.GetTextElements() | ForEach-Object { [string]$_.Text }) }
      } catch {}
      if ($texts.Count -eq 0) { continue }
      $title = [string]$texts[0]
      $body = if ($texts.Count -gt 1) { ($texts[1..($texts.Count - 1)] -join "`n") } else { '' }
      $appName = ''
      try { $appName = [string]$notification.AppInfo.DisplayInfo.DisplayName } catch {}
      $created = 0
      try { $created = Convert-TimeToEpochMs $notification.CreationTime } catch {}
      $sourceId = [string]$notification.Id
      $items += [pscustomobject]@{
        sourceId = $sourceId
        title = $title
        body = $body
        appName = $appName
        time = $created
      }
    }
    return [pscustomobject]@{ success = $true; status = $access; items = $items }
  } catch {
    return [pscustomobject]@{ success = $false; status = 'Error'; error = $_.Exception.Message; items = @() }
  }
}

function Write-JsonLine {
  param($Value)
  $Value | ConvertTo-Json -Compress -Depth 8
  [Console]::Out.Flush()
}

if ($Once) {
  Write-JsonLine (Get-NotificationSnapshot)
  exit 0
}

if ($Server) {
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try {
      $request = $line | ConvertFrom-Json
      $data = Get-NotificationSnapshot
      Write-JsonLine ([pscustomobject]@{ id = $request.id; ok = $true; data = $data })
    } catch {
      Write-JsonLine ([pscustomobject]@{ id = $request.id; ok = $false; error = $_.Exception.Message })
    }
  }
}
