[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string]$Command = '',
  [Parameter(Position = 1)] [string]$Arg1 = '',
  [Parameter(Position = 2)] [string]$Arg2 = '',
  [switch]$Server
)

# 统一 UTF-8，避免中文窗口标题乱码
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

$script:winTypeLoaded = $false
# 窗口图标/应用身份缓存：按 hwnd，列表轮询时只首次提取（gdiplus 编码较慢）
$script:winIconCache = @{}
$script:winAppIdCache = @{}
# 开始菜单应用表缓存（UWP 图标/AppID 兜底用）
$script:startApps = $null

function Ensure-WindowType {
  if ($script:winTypeLoaded) { return $true }
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class WindowNative
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public sealed class WindowInfo
    {
        public long hwnd { get; set; }
        public uint pid { get; set; }
        public string title { get; set; }
        public string exePath { get; set; }
        public string processName { get; set; }
        public bool minimized { get; set; }
        public bool focused { get; set; }
        public string iconData { get; set; }
        public string appId { get; set; }
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out bool pvAttribute, int cbAttribute);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);

    [DllImport("kernel32.dll")]
    private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

    [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")]
    private static extern IntPtr GetClassLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetClassLongW")]
    private static extern uint GetClassLong32(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    private static extern IntPtr CopyIcon(IntPtr hIcon);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("gdiplus.dll")]
    private static extern int GdiplusStartup(out IntPtr token, ref GdiplusStartupInput input, out IntPtr output);

    [DllImport("gdiplus.dll")]
    private static extern int GdiplusShutdown(IntPtr token);

    [DllImport("gdiplus.dll")]
    private static extern int GdipCreateBitmapFromHICON(IntPtr hIcon, out IntPtr bitmap);

    [DllImport("gdiplus.dll", CharSet = CharSet.Unicode)]
    private static extern int GdipSaveImageToFile(IntPtr image, string filename, ref Guid clsidEncoder, IntPtr encoderParams);

    [DllImport("gdiplus.dll")]
    private static extern int GdipDisposeImage(IntPtr image);

    [DllImport("shell32.dll")]
    private static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid riid, out IntPtr ppv);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int ExtractIconEx(string lpszFile, int nIconIndex, out IntPtr phiconLarge, out IntPtr phiconSmall, uint nIcons);

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PROPVARIANT pvar);

    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const uint GW_OWNER = 4;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private const int DWMWA_CLOAKED = 14;
    private const uint WM_GETICON = 0x007F;
    private const int ICON_BIG = 1;
    private const int ICON_SMALL = 0;
    private const int ICON_SMALL2 = 2;
    private const int GCLP_HICON = -14;
    private const int GCLP_HICONSM = -34;
    private const uint SMTO_ABORTIFHUNG = 0x0002;
    private const int SW_RESTORE = 9;
    private const int SW_MINIMIZE = 6;
    private const int SW_SHOW = 5;
    private const uint WM_CLOSE = 0x0010;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_NOOWNERZORDER = 0x0200;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private static readonly IntPtr HWND_TOP = new IntPtr(0);
    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private static readonly Guid PngEncoderClsid = new Guid("557CF406-1A04-11D3-9A73-0000F81EF32E");
    private static readonly Guid IID_IPropertyStore = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    private static readonly Guid PKEY_AppUserModel_ID = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    [StructLayout(LayoutKind.Sequential)]
    private struct GdiplusStartupInput
    {
        public int GdiplusVersion;
        public IntPtr DebugEventCallback;
        public int SuppressBackgroundThread;
        public int SuppressExternalCodecs;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPERTYKEY
    {
        public Guid fmtid;
        public uint pid;
    }

    // 最小 PROPVARIANT：仅覆盖 VT_LPWSTR（31），足够读取 AppUserModelID
    [StructLayout(LayoutKind.Sequential)]
    private struct PROPVARIANT
    {
        public ushort vt;
        public ushort wReserved1;
        public ushort wReserved2;
        public ushort wReserved3;
        public IntPtr p;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        int GetCount(out uint cProps);
        int GetAt(uint iProp, out PROPERTYKEY pkey);
        int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
        int Commit();
    }

    private static IntPtr GetClassLongPtr(IntPtr hWnd, int nIndex)
    {
        if (IntPtr.Size == 8) return GetClassLongPtr64(hWnd, nIndex);
        return new IntPtr(GetClassLong32(hWnd, nIndex));
    }

    private static string GetIconDataFrom(IntPtr hwnd)
    {
        IntPtr hIcon = IntPtr.Zero;
        IntPtr res;
        if (SendMessageTimeout(hwnd, WM_GETICON, (IntPtr)ICON_BIG, IntPtr.Zero, SMTO_ABORTIFHUNG, 500, out res) != IntPtr.Zero && res != IntPtr.Zero)
            hIcon = res;
        else if (SendMessageTimeout(hwnd, WM_GETICON, (IntPtr)ICON_SMALL, IntPtr.Zero, SMTO_ABORTIFHUNG, 500, out res) != IntPtr.Zero && res != IntPtr.Zero)
            hIcon = res;
        else if (SendMessageTimeout(hwnd, WM_GETICON, (IntPtr)ICON_SMALL2, IntPtr.Zero, SMTO_ABORTIFHUNG, 500, out res) != IntPtr.Zero && res != IntPtr.Zero)
            hIcon = res;
        if (hIcon == IntPtr.Zero) hIcon = GetClassLongPtr(hwnd, GCLP_HICON);
        if (hIcon == IntPtr.Zero) hIcon = GetClassLongPtr(hwnd, GCLP_HICONSM);
        if (hIcon == IntPtr.Zero) return "";
        IntPtr copy = CopyIcon(hIcon);
        if (copy == IntPtr.Zero) return "";
        try { return IconToPngBase64(copy); }
        finally { DestroyIcon(copy); }
    }

    private static string GetIconDataFromExe(string exePath)
    {
        try
        {
            if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath)) return "";
            IntPtr large, small;
            int got = ExtractIconEx(exePath, 0, out large, out small, 1);
            IntPtr hIcon = got > 0 ? large : IntPtr.Zero;
            if (hIcon == IntPtr.Zero && got > 0) hIcon = small;
            if (hIcon == IntPtr.Zero) return "";
            IntPtr copy = CopyIcon(hIcon);
            if (copy == IntPtr.Zero) return "";
            try { return IconToPngBase64(copy); }
            finally { DestroyIcon(copy); }
        }
        catch { return ""; }
    }

    // 提取窗口自身的图标（UWP/部分 Win32 应用 exe 无图标资源，窗口图标才是对的）
    // 兜底链：窗口图标 → 子窗口图标（UWP 实际内容窗口）→ exe 图标
    // 返回 base64 PNG（无 data: 前缀），失败返回空串
    public static string GetWindowIconData(IntPtr hwnd, string exePath)
    {
        string data = GetIconDataFrom(hwnd);
        if (data != "") return data;
        string found = "";
        EnumChildWindows(hwnd, delegate(IntPtr child, IntPtr lParam)
        {
            if (found != "") return true;
            string d = GetIconDataFrom(child);
            if (d != "") found = d;
            return true;
        }, IntPtr.Zero);
        if (found != "") return found;
        return GetIconDataFromExe(exePath);
    }

    private static string IconToPngBase64(IntPtr hIcon)
    {
        try
        {
            GdiplusStartupInput input = new GdiplusStartupInput
            {
                GdiplusVersion = 1,
                SuppressBackgroundThread = 1,
                SuppressExternalCodecs = 0
            };
            IntPtr token, output;
            if (GdiplusStartup(out token, ref input, out output) != 0) return "";
            try
            {
                IntPtr bitmap;
                if (GdipCreateBitmapFromHICON(hIcon, out bitmap) != 0) return "";
                try
                {
                    string dir = Path.Combine(Path.GetTempPath(), "amengui_window_icons");
                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                    string path = Path.Combine(dir, Guid.NewGuid().ToString("N") + ".png");
                    Guid encoder = PngEncoderClsid;
                    if (GdipSaveImageToFile(bitmap, path, ref encoder, IntPtr.Zero) != 0) return "";
                    try
                    {
                        return Convert.ToBase64String(File.ReadAllBytes(path));
                    }
                    finally
                    {
                        try { File.Delete(path); } catch { }
                    }
                }
                finally { GdipDisposeImage(bitmap); }
            }
            finally { GdiplusShutdown(token); }
        }
        catch { return ""; }
    }

    private static string GetAppIdFrom(IntPtr hwnd)
    {
        try
        {
            Guid iid = IID_IPropertyStore;
            IntPtr ppv;
            if (SHGetPropertyStoreForWindow(hwnd, ref iid, out ppv) != 0 || ppv == IntPtr.Zero) return "";
            try
            {
                IPropertyStore store = (IPropertyStore)Marshal.GetObjectForIUnknown(ppv);
                PROPERTYKEY key = new PROPERTYKEY { fmtid = PKEY_AppUserModel_ID, pid = 5 };
                PROPVARIANT pv;
                int hr = store.GetValue(ref key, out pv);
                try
                {
                    if (hr == 0 && pv.vt == 31 && pv.p != IntPtr.Zero)
                        return Marshal.PtrToStringUni(pv.p) ?? "";
                }
                finally { if (hr == 0) PropVariantClear(ref pv); }
                return "";
            }
            finally { Marshal.Release(ppv); }
        }
        catch { return ""; }
    }

    // UWP/现代应用的 AppUserModelID（用于同应用窗口分组）
    // ApplicationFrameWindow 本身可能查不到，需枚举子窗口（Windows.UI.Core.CoreWindow）
    public static string GetAppId(IntPtr hwnd)
    {
        string id = GetAppIdFrom(hwnd);
        if (id != "") return id;
        string found = "";
        EnumChildWindows(hwnd, delegate(IntPtr child, IntPtr lParam)
        {
            if (found != "") return true;
            string d = GetAppIdFrom(child);
            if (d != "") found = d;
            return true;
        }, IntPtr.Zero);
        return found;
    }

    private static bool IsCloaked(IntPtr hwnd)
    {
        bool cloaked;
        int hr = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out cloaked, Marshal.SizeOf(typeof(bool)));
        return hr == 0 && cloaked;
    }

    public static string GetExePath(uint pid)
    {
        IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return null;
        try
        {
            uint size = 1024;
            StringBuilder sb = new StringBuilder((int)size);
            if (QueryFullProcessImageName(h, 0, sb, ref size)) return sb.ToString();
            return null;
        }
        finally
        {
            CloseHandle(h);
        }
    }

    public static List<WindowInfo> List()
    {
        List<WindowInfo> result = new List<WindowInfo>();
        IntPtr fg = GetForegroundWindow();
        EnumWindows(delegate(IntPtr hwnd, IntPtr lParam)
        {
            if (!IsWindowVisible(hwnd)) return true;
            int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
            if (((long)exStyle & WS_EX_TOOLWINDOW) != 0) return true;
            if (GetWindow(hwnd, GW_OWNER) != IntPtr.Zero) return true;
            if (IsCloaked(hwnd)) return true;

            StringBuilder cls = new StringBuilder(64);
            GetClassName(hwnd, cls, cls.Capacity);
            string c = cls.ToString();
            // 桌面与系统任务栏自身的窗口不进入应用列表
            if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd")
                return true;

            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            if (pid == 0 || pid == 4) return true; // System / Idle

            StringBuilder title = new StringBuilder(512);
            GetWindowText(hwnd, title, title.Capacity);
            string exePath = GetExePath(pid);
            string processName = string.IsNullOrEmpty(exePath)
                ? ""
                : System.IO.Path.GetFileNameWithoutExtension(exePath);

            WindowInfo info = new WindowInfo
            {
                hwnd = hwnd.ToInt64(),
                pid = pid,
                title = title.ToString(),
                exePath = exePath,
                processName = processName,
                minimized = IsIconic(hwnd),
                focused = hwnd == fg
            };
            result.Add(info);
            return true;
        }, IntPtr.Zero);
        return result;
    }

    public static bool Activate(long hwnd)
    {
        IntPtr h = new IntPtr(hwnd);
        if (IsIconic(h)) ShowWindow(h, SW_RESTORE);
        ShowWindow(h, SW_SHOW);
        SetWindowPos(h, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

        // SetForegroundWindow 受前台锁定限制（后台进程不能随意抢焦点）。
        // 标准解法：把调用线程挂到 前台线程 与 目标线程 的输入队列，再置前，最后解挂。
        uint targetPid;
        uint targetThread = GetWindowThreadProcessId(h, out targetPid);
        IntPtr fg = GetForegroundWindow();
        uint fgThread = 0;
        if (fg != IntPtr.Zero && fg != h)
        {
            uint fgPid;
            fgThread = GetWindowThreadProcessId(fg, out fgPid);
        }
        uint self = GetCurrentThreadId();

        bool attachedFg = false;
        if (fgThread != 0 && fgThread != self)
            attachedFg = AttachThreadInput(fgThread, self, true);
        if (targetThread != 0 && targetThread != self)
            AttachThreadInput(targetThread, self, true);

        BringWindowToTop(h);
        bool ok = SetForegroundWindow(h);

        if (targetThread != 0 && targetThread != self)
            AttachThreadInput(targetThread, self, false);
        if (attachedFg)
            AttachThreadInput(fgThread, self, false);

        if (!ok)
        {
            // 经典 ALT 键小技巧：模拟一次按键授予前台权限后重试
            keybd_event(0x12, 0, 0, UIntPtr.Zero);
            keybd_event(0x12, 0, 0x0002, UIntPtr.Zero); // KEYEVENTF_KEYUP
            ok = SetForegroundWindow(h);
        }
        return ok;
    }

    public static bool Minimize(long hwnd)
    {
        return ShowWindow(new IntPtr(hwnd), SW_MINIMIZE);
    }

    // Keep the AmengUI taskbar above ordinary and maximized application windows.
    // Do not move/resize or activate it: visibility is controlled by Electron so
    // this command is safe to call while the taskbar is hidden during login/lock.
    public static bool PinTaskbar(long hwnd)
    {
        IntPtr h = new IntPtr(hwnd);
        if (h == IntPtr.Zero) return false;
        return SetWindowPos(
            h,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE
                | SWP_NOOWNERZORDER
        );
    }

    // Hide or show the native Windows taskbar(s).  The primary taskbar is
    // Shell_TrayWnd; additional monitors use Shell_SecondaryTrayWnd.
    // Return the number of matching windows so callers can distinguish an
    // unavailable shell (zero) from a successful operation.
    public static int SetNativeTaskbarVisibility(bool visible)
    {
        int command = visible ? SW_SHOW : 0; // SW_HIDE
        int count = 0;
        EnumWindows(delegate(IntPtr hwnd, IntPtr lParam)
        {
            StringBuilder cls = new StringBuilder(64);
            GetClassName(hwnd, cls, cls.Capacity);
            string name = cls.ToString();
            if (name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd")
            {
                ShowWindow(hwnd, command);
                count++;
            }
            return true;
        }, IntPtr.Zero);
        return count;
    }

    public static bool Restore(long hwnd)
    {
        return ShowWindow(new IntPtr(hwnd), SW_RESTORE);
    }

    public static bool Close(long hwnd)
    {
        return PostMessage(new IntPtr(hwnd), WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
    }
}
'@ -ErrorAction Stop
    $script:winTypeLoaded = $true
    return $true
  } catch {
    Write-Warning ("WindowNative load failed: " + $_.Exception.Message)
    return $false
  }
}

# UWP 兜底：ApplicationFrameWindow 拿不到图标/AUMID 时，
# 按窗口标题匹配开始菜单条目，再取包内 Logo 与 AppID
function Resolve-UwpApp {
  param([string]$title)
  if (-not $title) { return $null }
  if ($null -eq $script:startApps) {
    $script:startApps = @(Get-StartApps -ErrorAction SilentlyContinue)
  }
  $t = $title.Trim()
  $entry = $null
  $entry = $script:startApps | Where-Object { $_.Name -eq $t } | Select-Object -First 1
  if (-not $entry) {
    $entry = $script:startApps | Where-Object {
      $_.Name -and ($t.StartsWith($_.Name) -or $_.Name.StartsWith($t))
    } | Select-Object -First 1
  }
  if (-not $entry -or -not $entry.AppID) { return $null }
  # AppID 形如 "<包系列名>!App"，包系列名 = "<包名>_<发布者ID>"，Get-AppxPackage 需要去掉后缀的包名
  $pkgFamily = ($entry.AppID -split '!')[0]
  $pkgName = $pkgFamily -replace '_[0-9a-zA-Z]+$', ''
  if (-not $pkgName) { return $null }
  $pkg = Get-AppxPackage -Name $pkgName -ErrorAction SilentlyContinue
  if (-not $pkg -or -not $pkg.InstallLocation) { return $null }

  $iconFile = $null
  $all = @(Get-ChildItem -LiteralPath $pkg.InstallLocation -Recurse -Filter '*.png' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'Logo' })
  $prefer = $all | Where-Object { $_.Name -match 'Square44x44Logo' -and $_.Name -match 'scale-(100|200)' } | Select-Object -First 1
  if (-not $prefer) { $prefer = $all | Where-Object { $_.Name -match 'Square44x44Logo' } | Select-Object -First 1 }
  if (-not $prefer) { $prefer = $all | Where-Object { $_.Name -match 'StoreLogo' } | Select-Object -First 1 }
  if (-not $prefer) { $prefer = $all | Select-Object -First 1 }
  if ($prefer) {
    $iconFile = $prefer.FullName
  }
  $iconData = ''
  if ($iconFile -and (Test-Path -LiteralPath $iconFile)) {
    try {
      $bytes = [System.IO.File]::ReadAllBytes($iconFile)
      $iconData = 'data:image/png;base64,' + [Convert]::ToBase64String($bytes)
    } catch { }
  }
  return [pscustomobject]@{ appId = $entry.AppID; iconData = $iconData }
}

function Invoke-WindowCommand {
  # 参数名严禁使用 $args（PowerShell 自动变量，曾导致参数被遮蔽的事故）
  param([string]$cmd, [object[]]$cmdArgs)
  if (-not (Ensure-WindowType)) { throw 'window native type unavailable' }
  if ($cmd -eq 'list') {
    $list = @([WindowNative]::List())
    $alive = @{}
    foreach ($w in $list) {
      $alive[$w.hwnd] = $true
      if (-not $script:winIconCache.ContainsKey($w.hwnd)) {
        $b64 = [WindowNative]::GetWindowIconData([IntPtr]$w.hwnd, [string]$w.exePath)
        if ($b64) { $b64 = 'data:image/png;base64,' + $b64 }
        $script:winIconCache[$w.hwnd] = $b64
      }
      if (-not $script:winAppIdCache.ContainsKey($w.hwnd)) {
        $appId = [WindowNative]::GetAppId([IntPtr]$w.hwnd)
        if (-not $appId -and $w.processName -eq 'ApplicationFrameHost') {
          $uwp = Resolve-UwpApp ([string]$w.title)
          if ($uwp) {
            $appId = $uwp.appId
            if (-not $script:winIconCache[$w.hwnd]) {
              $script:winIconCache[$w.hwnd] = $uwp.iconData
            }
          }
        }
        $script:winAppIdCache[$w.hwnd] = $appId
      }
      $w.iconData = $script:winIconCache[$w.hwnd]
      $w.appId = $script:winAppIdCache[$w.hwnd]
    }
    # 清理已销毁窗口的缓存
    foreach ($k in @($script:winIconCache.Keys)) {
      if (-not $alive.ContainsKey($k)) {
        $script:winIconCache.Remove($k)
        $script:winAppIdCache.Remove($k)
      }
    }
    return [pscustomobject]@{ windows = $list }
  } elseif ($cmd -eq 'activate') {
    $hwnd = [int64]$cmdArgs[0]
    return [pscustomobject]@{ success = [WindowNative]::Activate($hwnd) }
  } elseif ($cmd -eq 'minimize') {
    $hwnd = [int64]$cmdArgs[0]
    return [pscustomobject]@{ success = [WindowNative]::Minimize($hwnd) }
  } elseif ($cmd -eq 'taskbarPin') {
    $hwnd = [int64]$cmdArgs[0]
    return [pscustomobject]@{ success = [WindowNative]::PinTaskbar($hwnd) }
  } elseif ($cmd -eq 'nativeTaskbar') {
    $action = ([string]$cmdArgs[0]).Trim().ToLowerInvariant()
    if (@('hide', 'show') -notcontains $action) {
      throw "nativeTaskbar expects hide or show"
    }
    $visible = $action -eq 'show'
    $count = [WindowNative]::SetNativeTaskbarVisibility($visible)
    return [pscustomobject]@{
      success = $count -gt 0
      action = $action
      count = $count
    }
  } elseif ($cmd -eq 'restore') {
    $hwnd = [int64]$cmdArgs[0]
    return [pscustomobject]@{ success = [WindowNative]::Restore($hwnd) }
  } elseif ($cmd -eq 'close') {
    $hwnd = [int64]$cmdArgs[0]
    return [pscustomobject]@{ success = [WindowNative]::Close($hwnd) }
  } else {
    throw "unknown window command: $cmd"
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
      $data = Invoke-WindowCommand $req.cmd @($req.args)
      [Console]::Out.WriteLine(([pscustomobject]@{ id = $req.id; ok = $true; data = $data } | ConvertTo-Json -Compress -Depth 8))
    } catch {
      [Console]::Out.WriteLine(([pscustomobject]@{ id = $req.id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress -Depth 4))
    }
    [Console]::Out.Flush()
  }
  exit 0
}

Invoke-WindowCommand $Command @($Arg1, $Arg2) | ConvertTo-Json -Compress -Depth 8
