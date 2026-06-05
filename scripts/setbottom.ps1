param(
    [Parameter(Mandatory=$true)]
    [int]$hwnd
)

Write-Host "Attempting to set window $hwnd to bottom..."

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class User32 {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@

$hwndPtr = [IntPtr]$hwnd
$HWND_BOTTOM = [IntPtr]1
$SWP_NOSIZE = 0x0001
$SWP_NOMOVE = 0x0002
$SWP_NOACTIVATE = 0x0010
$SWP_SHOWWINDOW = 0x0040

$result = [User32]::SetWindowPos($hwndPtr, $HWND_BOTTOM, 0, 0, 0, 0, $SWP_NOSIZE -bor $SWP_NOMOVE -bor $SWP_NOACTIVATE -bor $SWP_SHOWWINDOW)

Write-Host "SetWindowPos result: $result"

if ($result) {
    Write-Host "Successfully set window to bottom"
} else {
    Write-Host "Failed to set window to bottom"
    [System.Environment]::Exit(1)
}