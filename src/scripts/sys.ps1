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
$script:btScanCache = $null
$script:btStatusCache = $null
$script:btTypeLoaded = $false

# 运行时版本：预留 pwsh7（PowerShell 7 / Core）路径。
# 本机当前回退系统 powershell（5.1），Win32 P/Invoke 在两种版本下均可编译运行；
# 将来内置 pwsh7 后，可在此实现 WinRT 蓝牙分支（完整支持 BLE+经典配对），
# 并置 $script:btWinRtEnabled = $true 切换（命令层/UI/IPC 契约不变）。
$script:IsPwsh7 = $PSVersionTable.PSVersion.Major -ge 7
$script:btWinRtEnabled = $false

# ===== WiFi 无线电状态只读查询（wlanapi.dll） =====
# 本文件只保留 WlanQueryInterface 的 radio_state 只读查询，用于状态展示。
# 历史教训（详见 AGENTS.md 第 18 节）：
#  1. 严禁用 netsh interface set interface ... admin=disabled 禁用无线网卡——
#     那会把整个适配器停用，导致系统 WiFi 开关消失（原事故根因）。
#  2. WlanSetInterface 写入软件无线电状态在部分驱动（如 AX201）上行为不稳定，
#     曾在"开启"请求时触发异步关断、约 10 秒后才自行恢复，故已移除写入实现。
#  3. 当前 WiFi 开关采用安全方案：断开连接 + netsh wlan set autoconfig 启停，
#     网卡适配器与系统 WiFi 开关完全不受影响，且为确定性行为。
$script:wifiRadioTypeLoaded = $false
$script:wifiAutoConfig = $null

function Ensure-WifiRadioType {
  if ($script:wifiRadioTypeLoaded) { return $true }
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class WifiRadioNative
{
    // wlan_intf_opcode_radio_state（WLAN_INTF_OPCODE 枚举，radio_state = 4）
    private const int WLAN_INTF_OPCODE_RADIO_STATE = 4;
    private const uint WLAN_CLIENT_VERSION_V2 = 2;
    // DOT11_RADIO_STATE 枚举：unknown = 0, on = 1, off = 2（off 不是 0！）
    private const int DOT11_RADIO_STATE_ON = 1;
    private const int DOT11_RADIO_STATE_OFF = 2;
    // WLAN_RADIO_STATE.PhyRadioState 固定为 WLAN_MAX_PHY_INDEX(64) 项（每项 12 字节），
    // 因此查询返回的数据大小为 4 + 64*12 = 772 字节，仅前 dwNumberOfPhys 项有效。
    private const int WLAN_MAX_PHY_INDEX = 64;
    private const int PHY_ENTRY_SIZE = 12;

    [DllImport("wlanapi.dll")]
    private static extern int WlanOpenHandle(uint dwClientVersion, IntPtr pReserved, out uint pdwNegotiatedVersion, out IntPtr phClientHandle);

    [DllImport("wlanapi.dll")]
    private static extern int WlanEnumInterfaces(IntPtr hClientHandle, IntPtr pReserved, out IntPtr ppInterfaceList);

    [DllImport("wlanapi.dll")]
    private static extern int WlanQueryInterface(IntPtr hClientHandle, ref Guid pInterfaceGuid, int OpCode, IntPtr pReserved, out uint pdwDataSize, out IntPtr ppData, IntPtr pNotificationSource);

    [DllImport("wlanapi.dll")]
    private static extern int WlanSetInterface(IntPtr hClientHandle, ref Guid pInterfaceGuid, int OpCode, uint dwDataSize, IntPtr pData, IntPtr pReserved);

    [DllImport("wlanapi.dll")]
    private static extern int WlanFreeMemory(IntPtr pMemory);

    [DllImport("wlanapi.dll")]
    private static extern int WlanCloseHandle(IntPtr hClientHandle, IntPtr pReserved);

    // 读取软件/硬件无线电状态。返回 null 表示成功，否则为错误描述。
    // WLAN_RADIO_STATE = { UInt32 dwNumberOfPhys; WLAN_PHY_RADIO_STATE PhyRadioState[64] }
    // WLAN_PHY_RADIO_STATE = { UInt32 dwPhyIndex; DOT11_RADIO_STATE software; DOT11_RADIO_STATE hardware }（12 字节）
    // 第 i 项 software 偏移 = 4 + i*12 + 4，hardware 偏移 = 4 + i*12 + 8。
    // 状态只取"首个有效 PHY"（与 Windows 系统开关的判定一致；多 PHY 网卡上
    // 部分从属 PHY 可能长期为 off，不能据此误判整个无线电为关）。
    public static string Query(out bool softwareEnabled, out bool hardwareEnabled, out int phyCount)
    {
        softwareEnabled = false;
        hardwareEnabled = false;
        phyCount = 0;
        IntPtr handle;
        uint negotiated;
        int hr = WlanOpenHandle(WLAN_CLIENT_VERSION_V2, IntPtr.Zero, out negotiated, out handle);
        if (hr != 0) return "WlanOpenHandle failed: 0x" + hr.ToString("X8");
        try
        {
            IntPtr listPtr;
            hr = WlanEnumInterfaces(handle, IntPtr.Zero, out listPtr);
            if (hr != 0) return "WlanEnumInterfaces failed: 0x" + hr.ToString("X8");
            try
            {
                uint count = (uint)Marshal.ReadInt32(listPtr, 0);
                if (count == 0) return "no wireless interface";
                // WLAN_INTERFACE_INFO_LIST: dwNumberOfItems(4) + dwIndex(4) + WLAN_INTERFACE_INFO[]
                Guid guid = (Guid)Marshal.PtrToStructure(new IntPtr(listPtr.ToInt64() + 8), typeof(Guid));
                uint dataSize;
                IntPtr dataPtr;
                hr = WlanQueryInterface(handle, ref guid, WLAN_INTF_OPCODE_RADIO_STATE, IntPtr.Zero, out dataSize, out dataPtr, IntPtr.Zero);
                if (hr != 0) return "WlanQueryInterface(radio_state) failed: 0x" + hr.ToString("X8");
                try
                {
                    phyCount = Marshal.ReadInt32(dataPtr, 0);
                    if (phyCount > 0)
                    {
                        // 只取首个有效 PHY
                        softwareEnabled = (Marshal.ReadInt32(dataPtr, 8) != DOT11_RADIO_STATE_OFF);
                        hardwareEnabled = (Marshal.ReadInt32(dataPtr, 12) != DOT11_RADIO_STATE_OFF);
                    }
                    return null;
                }
                finally
                {
                    WlanFreeMemory(dataPtr);
                }
            }
            finally
            {
                WlanFreeMemory(listPtr);
            }
        }
        finally
        {
            WlanCloseHandle(handle, IntPtr.Zero);
        }
    }

    // 设置软件无线电状态（与 Windows 系统 WiFi 开关等效）。
    // 关键：逐个写入所有有效 PHY——实测 AX201 上"只写首个 PHY"无法把无线电重新打开
    // （关闭只写 PHY0 有效，但上电必须写全部 PHY）。
    // 曾经的"开启请求触发关断"异常，根因是无线电已开启时仍重复写 ON；
    // 现在由下方的幂等判断（current == enable 直接返回）彻底规避，切换时才写。
    // 数据为单个 WLAN_PHY_RADIO_STATE（12 字节：dwPhyIndex + software + hardware），
    // hardware 字段在 Set 时被系统忽略。返回 null 表示成功。
    public static string Set(bool enable, out bool current)
    {
        current = false;
        IntPtr handle;
        uint negotiated;
        int hr = WlanOpenHandle(WLAN_CLIENT_VERSION_V2, IntPtr.Zero, out negotiated, out handle);
        if (hr != 0) return "WlanOpenHandle failed: 0x" + hr.ToString("X8");
        try
        {
            IntPtr listPtr;
            hr = WlanEnumInterfaces(handle, IntPtr.Zero, out listPtr);
            if (hr != 0) return "WlanEnumInterfaces failed: 0x" + hr.ToString("X8");
            try
            {
                uint count = (uint)Marshal.ReadInt32(listPtr, 0);
                if (count == 0) return "no wireless interface";
                Guid guid = (Guid)Marshal.PtrToStructure(new IntPtr(listPtr.ToInt64() + 8), typeof(Guid));
                uint dataSize;
                IntPtr dataPtr;
                hr = WlanQueryInterface(handle, ref guid, WLAN_INTF_OPCODE_RADIO_STATE, IntPtr.Zero, out dataSize, out dataPtr, IntPtr.Zero);
                if (hr != 0) return "WlanQueryInterface(radio_state) failed: 0x" + hr.ToString("X8");
                try
                {
                    int phyCount = Marshal.ReadInt32(dataPtr, 0);
                    if (phyCount <= 0) return "no phy";
                    // 幂等判断：当前首 PHY 软件状态已等于目标则直接返回。
                    // 这同时防止"无线电已开启时重复写 ON 触发驱动异常关断"（历史事故）。
                    current = (Marshal.ReadInt32(dataPtr, 8) != DOT11_RADIO_STATE_OFF);
                    if (current == enable) return null;
                    // 逐个 PHY 写入目标软件状态（AX201 上开启必须写全部 PHY）
                    int limit = phyCount;
                    if (limit > WLAN_MAX_PHY_INDEX) limit = WLAN_MAX_PHY_INDEX;
                    byte[] phyBuf = new byte[PHY_ENTRY_SIZE];
                    phyBuf[4] = (byte)(enable ? DOT11_RADIO_STATE_ON : DOT11_RADIO_STATE_OFF);
                    phyBuf[8] = (byte)DOT11_RADIO_STATE_ON; // hardware 字段 Set 时被忽略
                    IntPtr phyPtr = Marshal.AllocHGlobal(PHY_ENTRY_SIZE);
                    try
                    {
                        for (int i = 0; i < limit; i++)
                        {
                            int idx = Marshal.ReadInt32(dataPtr, 4 + i * PHY_ENTRY_SIZE);
                            phyBuf[0] = (byte)idx;
                            phyBuf[1] = (byte)(idx >> 8);
                            phyBuf[2] = (byte)(idx >> 16);
                            phyBuf[3] = (byte)(idx >> 24);
                            Marshal.Copy(phyBuf, 0, phyPtr, PHY_ENTRY_SIZE);
                            hr = WlanSetInterface(handle, ref guid, WLAN_INTF_OPCODE_RADIO_STATE, PHY_ENTRY_SIZE, phyPtr, IntPtr.Zero);
                            if (hr != 0)
                            {
                                // 驱动偶发瞬时错误：等 500ms 重试一次
                                System.Threading.Thread.Sleep(500);
                                hr = WlanSetInterface(handle, ref guid, WLAN_INTF_OPCODE_RADIO_STATE, PHY_ENTRY_SIZE, phyPtr, IntPtr.Zero);
                                if (hr != 0) return "WlanSetInterface(radio_state, phy " + idx + ") failed: 0x" + hr.ToString("X8");
                            }
                        }
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(phyPtr);
                    }
                }
                finally
                {
                    WlanFreeMemory(dataPtr);
                }
                // 无线电状态由驱动异步生效（关闭约 1~2 秒，开启可能更久），
                // 轮询直到"首个 PHY"状态收敛到目标值（多 PHY 网卡上从属 PHY
                // 可能保持 off，不能作为收敛依据），避免向 UI 返回陈旧状态。
                DateTime deadline = DateTime.UtcNow.AddSeconds(35);
                bool converged = false;
                while (true)
                {
                    System.Threading.Thread.Sleep(500);
                    uint s2;
                    IntPtr d2;
                    hr = WlanQueryInterface(handle, ref guid, WLAN_INTF_OPCODE_RADIO_STATE, IntPtr.Zero, out s2, out d2, IntPtr.Zero);
                    if (hr == 0)
                    {
                        try
                        {
                            int n2 = Marshal.ReadInt32(d2, 0);
                            converged = (n2 > 0) && (Marshal.ReadInt32(d2, 8) != DOT11_RADIO_STATE_OFF);
                        }
                        finally { WlanFreeMemory(d2); }
                        if (converged == enable) { current = converged; return null; }
                    }
                    if (DateTime.UtcNow >= deadline) break;
                }
                current = converged;
                return "radio state did not converge within 35s (desired=" + (enable ? "on" : "off") + ", actual=" + (converged ? "on" : "off") + ")";
            }
            finally
            {
                WlanFreeMemory(listPtr);
            }
        }
        finally
        {
            WlanCloseHandle(handle, IntPtr.Zero);
        }
    }
}
'@ -ErrorAction Stop
    $script:wifiRadioTypeLoaded = $true
  } catch {
    $script:wifiRadioTypeLoaded = $false
  }
  return $script:wifiRadioTypeLoaded
}

function Invoke-WifiRadioQuery {
  if (-not (Ensure-WifiRadioType)) {
    return [pscustomobject]@{ success = $false; available = $false; error = 'wlanapi_unavailable' }
  }
  $enabled = $false; $hw = $false; $count = 0
  $err = [WifiRadioNative]::Query([ref]$enabled, [ref]$hw, [ref]$count)
  if ($err) {
    return [pscustomobject]@{ success = $false; available = $false; error = $err }
  }
  return [pscustomobject]@{ success = $true; available = $true; radioEnabled = $enabled; hardwareEnabled = $hw; phyCount = $count }
}

function Get-AutoConfigState {
  # 读取 netsh wlan show settings 中的自动配置状态（只读、快、无副作用）。
  # 解析失败时回退进程内缓存，默认视为启用。
  $out = & netsh wlan show settings 2>$null
  foreach ($line in $out) {
    if ($line -match 'Auto configuration logic is (enabled|disabled)') {
      $script:wifiAutoConfig = ($matches[1] -eq 'enabled')
      return $script:wifiAutoConfig
    } elseif ($line -match '自动配置逻辑(已启用|已禁用)') {
      $script:wifiAutoConfig = ($matches[1] -eq '已启用')
      return $script:wifiAutoConfig
    }
  }
  if ($null -eq $script:wifiAutoConfig) { $script:wifiAutoConfig = $true }
  return $script:wifiAutoConfig
}

function Enable-AutoConfig {
  # 自动配置关闭会导致 netsh wlan 扫描/连接失败（用户曾遇到"找不到网络"）。
  # 尝试恢复（需要管理员权限；失败由 UI 提示用户手动处理，不阻塞后续操作）。
  if (Get-AutoConfigState) { return $true }
  $wlan = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
    $_.InterfaceDescription -match 'Wireless|Wi-Fi|WLAN|无线' -or $_.Name -match 'WLAN|WiFi|无线'
  } | Select-Object -First 1
  if (-not $wlan) { return $false }
  & netsh wlan set autoconfig enabled=yes interface="$($wlan.Name)" 2>$null
  if ($LASTEXITCODE -eq 0) {
    $script:wifiAutoConfig = $true
    return $true
  }
  return $false
}

# ===== 蓝牙互操作（Win32 Bluetooth API，bthprops.cpl，P/Invoke） =====
# 仅供 PS 5.1 与 pwsh7 通用；已配对列表/发现/配对/取消配对/信息。
# pwsh7 预留：将来可在脚本层用 WinRT（Windows.Devices.Bluetooth）实现
# BLE+经典完整配对，见下方 *-WinRT 桩函数契约。
function Ensure-BtType {
  if ($script:btTypeLoaded) { return $true }
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections;
using System.Runtime.InteropServices;

public static class BtNative
{
    [StructLayout(LayoutKind.Sequential, Pack = 8)]
    public struct BLUETOOTH_ADDRESS
    {
        public ulong ullLong;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 8, CharSet = CharSet.Unicode)]
    public struct BLUETOOTH_DEVICE_INFO
    {
        public uint dwSize;              // 0
        public BLUETOOTH_ADDRESS Address; // 8
        public uint ulClassofDevice;     // 16
        public int fConnected;           // 20
        public int fRemembered;          // 24
        public int fAuthenticated;       // 28
        public ushort lastSeenYear, lastSeenMonth, lastSeenDayOfWeek, lastSeenDay, lastSeenHour, lastSeenMinute, lastSeenSecond, lastSeenMilliseconds;   // 32..47
        public ushort lastUsedYear, lastUsedMonth, lastUsedDayOfWeek, lastUsedDay, lastUsedHour, lastUsedMinute, lastUsedSecond, lastUsedMilliseconds;   // 48..63
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)]
        public string szName;            // 64..559
    }

    [StructLayout(LayoutKind.Sequential, Pack = 8)]
    public struct BLUETOOTH_DEVICE_SEARCH_PARAMS
    {
        public uint dwSize;             // 0
        public int fReturnAuthenticated; // 4
        public int fReturnRemembered;    // 8
        public int fReturnUnknown;       // 12
        public int fReturnConnected;     // 16
        public int fIssueInquiry;        // 20
        public byte cTimeoutMultiplier;  // 24
        public IntPtr hRadio;            // 32
    }

    [StructLayout(LayoutKind.Sequential, Pack = 8)]
    public struct BLUETOOTH_FIND_RADIO_PARAMS
    {
        public uint dwSize;
    }

    [DllImport("bthprops.cpl")]
    private static extern IntPtr BluetoothFindFirstRadio(ref BLUETOOTH_FIND_RADIO_PARAMS pbtfrp, out IntPtr phRadio);
    [DllImport("bthprops.cpl")]
    private static extern bool BluetoothFindNextRadio(IntPtr hFind, out IntPtr phRadio);
    [DllImport("bthprops.cpl")]
    private static extern bool BluetoothFindRadioClose(IntPtr hFind);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr hObject);
    [DllImport("bthprops.cpl")]
    private static extern IntPtr BluetoothFindFirstDevice(ref BLUETOOTH_DEVICE_SEARCH_PARAMS pbtdsp, ref BLUETOOTH_DEVICE_INFO pbtdi);
    [DllImport("bthprops.cpl")]
    private static extern bool BluetoothFindNextDevice(IntPtr hFind, ref BLUETOOTH_DEVICE_INFO pbtdi);
    [DllImport("bthprops.cpl")]
    private static extern bool BluetoothFindDeviceClose(IntPtr hFind);
    [DllImport("bthprops.cpl")]
    private static extern uint BluetoothGetDeviceInfo(IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO pbtdi);
    [DllImport("bthprops.cpl")]
    private static extern uint BluetoothRemoveDevice(ref BLUETOOTH_ADDRESS pAddress);
    [DllImport("bthprops.cpl")]
    private static extern uint BluetoothEnumerateInstalledServices(IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO pbtdi, ref uint pcServices, [Out] Guid[] pGuidServices);
    [DllImport("bthprops.cpl")]
    private static extern uint BluetoothSetServiceState(IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO pbtdi, ref Guid pGuidService, uint dwServiceFlags);
    [DllImport("bthprops.cpl", CharSet = CharSet.Unicode)]
    private static extern uint BluetoothAuthenticateDeviceEx(IntPtr hwndParentIn, IntPtr hRadioIn, ref BLUETOOTH_DEVICE_INFO pbtdiInOut, string pszPinIn, uint ulPasskeyLengthIn, IntPtr pfnCallbackIn, IntPtr pvParam);

    // 地址格式 "AA:BB:CC:DD:EE:FF"（显示序，与注册表/PnP 一致）。
    // API 的 ulong 按大端存显示序：显示 AA:BB:..:FF -> ullLong = 0xAABBCCDDEEFF。
    public static ulong ParseAddress(string addr)
    {
        if (addr == null) return 0;
        string hex = addr.Replace(":", "").Replace("-", "").Trim();
        if (hex.Length != 12) return 0;
        ulong v = 0;
        for (int i = 0; i < 6; i++)
        {
            v |= ((ulong)Convert.ToByte(hex.Substring(i * 2, 2), 16)) << ((5 - i) * 8);
        }
        return v;
    }

    public static string FormatAddress(ulong v)
    {
        byte[] b = BitConverter.GetBytes(v);
        return string.Format("{0:X2}:{1:X2}:{2:X2}:{3:X2}:{4:X2}:{5:X2}", b[5], b[4], b[3], b[2], b[1], b[0]);
    }

    private static IntPtr FindFirstRadio(out IntPtr hRadio)
    {
        hRadio = IntPtr.Zero;
        BLUETOOTH_FIND_RADIO_PARAMS p = new BLUETOOTH_FIND_RADIO_PARAMS();
        p.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_FIND_RADIO_PARAMS));
        return BluetoothFindFirstRadio(ref p, out hRadio);
    }

    // 枚举设备。scan=true 时发起约 10 秒的查询（发现未配对设备）。
    public static ArrayList GetDevices(bool scan, out string error)
    {
        error = null;
        ArrayList list = new ArrayList();
        BLUETOOTH_DEVICE_SEARCH_PARAMS p = new BLUETOOTH_DEVICE_SEARCH_PARAMS();
        p.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_SEARCH_PARAMS));
        p.fReturnAuthenticated = 1;
        p.fReturnRemembered = 1;
        p.fReturnConnected = 1;
        p.fReturnUnknown = scan ? 1 : 0;
        p.fIssueInquiry = scan ? 1 : 0;
        p.cTimeoutMultiplier = 3; // 查询时长 ≈ 3 × 1.28s ≈ 4s
        p.hRadio = IntPtr.Zero;
        BLUETOOTH_DEVICE_INFO dev = new BLUETOOTH_DEVICE_INFO();
        dev.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_INFO));
        IntPtr hFind = BluetoothFindFirstDevice(ref p, ref dev);
        if (hFind == IntPtr.Zero)
        {
            error = "no_devices";
            return list;
        }
        try
        {
            while (true)
            {
                Hashtable h = new Hashtable();
                h["name"] = dev.szName;
                h["address"] = FormatAddress(dev.Address.ullLong);
                h["connected"] = dev.fConnected != 0;
                h["remembered"] = dev.fRemembered != 0;
                h["authenticated"] = dev.fAuthenticated != 0;
                list.Add(h);
                dev.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_INFO));
                if (!BluetoothFindNextDevice(hFind, ref dev)) break;
            }
        }
        finally
        {
            BluetoothFindDeviceClose(hFind);
        }
        return list;
    }

    // 配对。pin 为空时依次尝试 空串/0000/1234；全部失败置 pinRequired=true（UI 弹输入框）。
    public static string Pair(string address, string pin, out bool pinRequired, out uint errorCode)
    {
        pinRequired = false;
        errorCode = 0;
        IntPtr hRadio;
        IntPtr hFindRadio = FindFirstRadio(out hRadio);
        if (hFindRadio == IntPtr.Zero || hRadio == IntPtr.Zero)
        {
            if (hFindRadio != IntPtr.Zero) BluetoothFindRadioClose(hFindRadio);
            errorCode = 0x80070490; // ERROR_NOT_FOUND
            return "no_radio";
        }
        try
        {
            BLUETOOTH_DEVICE_INFO dev = new BLUETOOTH_DEVICE_INFO();
            dev.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_INFO));
            dev.Address.ullLong = ParseAddress(address);
            uint hr = BluetoothGetDeviceInfo(hRadio, ref dev);
            if (hr != 0) { errorCode = hr; return "device_lookup_failed"; }
            string[] attempts;
            if (!string.IsNullOrEmpty(pin)) attempts = new string[] { pin };
            else attempts = new string[] { "", "0000", "1234" };
            for (int i = 0; i < attempts.Length; i++)
            {
                dev.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_INFO));
                hr = BluetoothAuthenticateDeviceEx(IntPtr.Zero, hRadio, ref dev, attempts[i], (uint)attempts[i].Length, IntPtr.Zero, IntPtr.Zero);
                if (hr == 0) return null;
                errorCode = hr;
            }
            pinRequired = true;
            return "pin_required_or_failed";
        }
        finally
        {
            if (hRadio != IntPtr.Zero) CloseHandle(hRadio);
            BluetoothFindRadioClose(hFindRadio);
        }
    }

    public static string Unpair(string address)
    {
        BLUETOOTH_ADDRESS a = new BLUETOOTH_ADDRESS();
        a.ullLong = ParseAddress(address);
        uint hr = BluetoothRemoveDevice(ref a);
        return hr == 0 ? null : "remove_failed:0x" + hr.ToString("X8");
    }

    public static Hashtable GetInfo(string address, out string error)
    {
        error = null;
        Hashtable ht = new Hashtable();
        IntPtr hRadio;
        IntPtr hFindRadio = FindFirstRadio(out hRadio);
        if (hFindRadio == IntPtr.Zero || hRadio == IntPtr.Zero)
        {
            if (hFindRadio != IntPtr.Zero) BluetoothFindRadioClose(hFindRadio);
            error = "no_radio";
            return ht;
        }
        try
        {
            BLUETOOTH_DEVICE_INFO dev = new BLUETOOTH_DEVICE_INFO();
            dev.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_INFO));
            dev.Address.ullLong = ParseAddress(address);
            uint hr = BluetoothGetDeviceInfo(hRadio, ref dev);
            if (hr != 0) { error = "device_lookup_failed:0x" + hr.ToString("X8"); return ht; }
            ht["name"] = dev.szName;
            ht["address"] = FormatAddress(dev.Address.ullLong);
            ht["classOfDevice"] = "0x" + dev.ulClassofDevice.ToString("X6");
            ht["connected"] = dev.fConnected != 0;
            ht["remembered"] = dev.fRemembered != 0;
            ht["authenticated"] = dev.fAuthenticated != 0;
            ArrayList svc = new ArrayList();
            uint count = 0;
            uint hr2 = BluetoothEnumerateInstalledServices(hRadio, ref dev, ref count, null);
            if (hr2 == 0 && count > 0)
            {
                Guid[] guids = new Guid[count];
                hr2 = BluetoothEnumerateInstalledServices(hRadio, ref dev, ref count, guids);
                if (hr2 == 0)
                {
                    foreach (Guid g in guids) svc.Add(g.ToString());
                }
            }
            ht["services"] = svc;
            return ht;
        }
        finally
        {
            if (hRadio != IntPtr.Zero) CloseHandle(hRadio);
            BluetoothFindRadioClose(hFindRadio);
        }
    }

    // 连接/断开：切换设备已安装的服务（BluetoothSetServiceState，无需管理员）。
    // 无已安装服务时回退常用服务 GUID（电话常见：OPP/OBEX FTP/PBAP/A2DP/HFP）。
    public static string SetServiceState(string address, bool enable, out string error)
    {
        error = null;
        IntPtr hRadio;
        IntPtr hFindRadio = FindFirstRadio(out hRadio);
        if (hFindRadio == IntPtr.Zero || hRadio == IntPtr.Zero)
        {
            if (hFindRadio != IntPtr.Zero) BluetoothFindRadioClose(hFindRadio);
            error = "no_radio";
            return "no_radio";
        }
        try
        {
            BLUETOOTH_DEVICE_INFO dev = new BLUETOOTH_DEVICE_INFO();
            dev.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_INFO));
            dev.Address.ullLong = ParseAddress(address);
            uint hr = BluetoothGetDeviceInfo(hRadio, ref dev);
            if (hr != 0) { error = "device_lookup_failed:0x" + hr.ToString("X8"); return "device_lookup_failed"; }
            Guid[] guids;
            uint count = 0;
            hr = BluetoothEnumerateInstalledServices(hRadio, ref dev, ref count, null);
            if (hr == 0 && count > 0)
            {
                guids = new Guid[count];
                hr = BluetoothEnumerateInstalledServices(hRadio, ref dev, ref count, guids);
                if (hr != 0) guids = new Guid[0];
            }
            else
            {
                // 常用服务（Bluetooth 基 UUID 0000xxxx-0000-1000-8000-00805f9b34fb）
                guids = new Guid[]
                {
                    new Guid("00001101-0000-1000-8000-00805f9b34fb"), // SPP
                    new Guid("00001105-0000-1000-8000-00805f9b34fb"), // OPP
                    new Guid("00001106-0000-1000-8000-00805f9b34fb"), // OBEX FTP
                    new Guid("0000110a-0000-1000-8000-00805f9b34fb"), // A2DP Source
                    new Guid("0000110b-0000-1000-8000-00805f9b34fb"), // A2DP Sink
                    new Guid("0000111e-0000-1000-8000-00805f9b34fb"), // HFP
                    new Guid("00001130-0000-1000-8000-00805f9b34fb"), // PBAP
                    new Guid("00001124-0000-1000-8000-00805f9b34fb")  // HID
                };
            }
            uint flags = enable ? 1u : 0u;
            uint last = 0;
            bool any = false;
            foreach (Guid g in guids)
            {
                Guid serviceGuid = g; // foreach 迭代变量不能按 ref 传递
                last = BluetoothSetServiceState(hRadio, ref dev, ref serviceGuid, flags);
                if (last == 0) any = true;
            }
            if (any) return null;
            error = "service_state_failed:0x" + last.ToString("X8");
            return "service_state_failed";
        }
        finally
        {
            if (hRadio != IntPtr.Zero) CloseHandle(hRadio);
            BluetoothFindRadioClose(hFindRadio);
        }
    }
}
'@ -ErrorAction Stop
    $script:btTypeLoaded = $true
  } catch {
    $script:btTypeLoaded = $false
  }
  return $script:btTypeLoaded
}

function Get-RegistryBtDevices {
  # 已配对权威列表回退源：HKLM\...\BTHPORT\Parameters\Devices
  $key = 'HKLM:\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices'
  $list = @()
  if (-not (Test-Path $key)) { return $list }
  foreach ($sub in (Get-ChildItem $key -ErrorAction SilentlyContinue)) {
    $bytes = (Get-ItemProperty $sub.PSPath -ErrorAction SilentlyContinue).Name
    $name = ''
    if ($bytes -is [byte[]]) {
      $name = [System.Text.Encoding]::UTF8.GetString($bytes).TrimEnd([char]0).Trim()
    }
    $addr = $sub.PSChildName
    $addrFmt = if ($addr.Length -eq 12) {
      ($addr.Substring(0,2) + ':' + $addr.Substring(2,2) + ':' + $addr.Substring(4,2) + ':' + $addr.Substring(6,2) + ':' + $addr.Substring(8,2) + ':' + $addr.Substring(10,2)).ToUpper()
    } else { $addr }
    if ([string]::IsNullOrEmpty($name)) { $name = $addrFmt }
    $list += [pscustomobject]@{ name = $name; address = $addrFmt; status = 'paired' }
  }
  return $list
}

function Get-RegistryBtAddressSet {
  $set = @{}
  foreach ($d in (Get-RegistryBtDevices)) { $set[$d.address.Replace(':','')] = $true }
  return $set
}

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
    flightMode = (Test-FlightModeApi) -or (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState')
    isLaptop = ($pcType -eq 2)
  }
  $script:cap = [pscustomobject]$cap
  return $script:cap
}

function Get-NetAdapterName {
  if ($script:netAdapterName) { return $script:netAdapterName }
  # 注意：这里只允许有线网卡。WiFi 的开关走 wlanapi 无线电状态，
  # 绝不能通过适配器禁用实现（那会令系统 WiFi 开关消失）。
  $adapters = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object {
    $_.InterfaceDescription -notmatch 'Wireless|Wi-Fi|WLAN|无线|Bluetooth'
  })
  if ($adapters.Count -eq 0) {
    $adapters = @(Get-CimInstance Win32_NetworkAdapter -Filter "PhysicalAdapter=TRUE" | Where-Object {
      $_.NetConnectionID -and $_.Description -notmatch 'Wireless|Wi-Fi|WLAN|无线|Bluetooth'
    })
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
      $result = [pscustomobject]@{ success = $true; enabled = $state; radioEnabled = Get-BtRadioEnabled }
      $script:btStatusCache = @{ at = Get-Date; data = $result }
      return $result
    }
  }
  $svc = Get-Service bthserv -ErrorAction SilentlyContinue
  if ($svc) {
    $result = [pscustomobject]@{ success = $true; enabled = ($svc.Status -eq 'Running'); radioEnabled = Get-BtRadioEnabled }
    $script:btStatusCache = @{ at = Get-Date; data = $result }
    return $result
  }
  return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
}

function Invoke-BluetoothToggle {
  $instance = Get-BtInstance
  $svc = Get-Service bthserv -ErrorAction SilentlyContinue
  # 先确定当前真实状态（不依赖缓存）
  $state = Get-BtState
  if ($null -eq $state -and $svc) { $state = ($svc.Status -eq 'Running') }
  if ($null -eq $state) {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
  }
  $target = -not $state
  $attempted = $false
  if ($instance) {
    $attempted = $true
    if ($target) {
      & pnputil /enable-device "$instance" 2>&1 | Out-Null
    } else {
      & pnputil /disable-device "$instance" 2>&1 | Out-Null
    }
  }
  # pnputil 不可用/失败时回退服务方式（非管理员下两者都可能失败）
  if (-not ($attempted -and $LASTEXITCODE -eq 0) -and $svc) {
    if ($svc.Status -eq 'Running') {
      Stop-Service bthserv -Force -ErrorAction SilentlyContinue
    } else {
      Start-Service bthserv -ErrorAction SilentlyContinue
    }
  }
  # 清除状态缓存，重新读取真实状态并轮询收敛（驱动/服务可能异步生效）
  $script:btStatusCache = $null
  $script:btState = $null
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $actual = $null
  while ($sw.Elapsed.TotalSeconds -lt 8) {
    Start-Sleep -Milliseconds 400
    $actual = Get-BtState
    if ($null -eq $actual -and $svc) {
      $actual = ((Get-Service bthserv -ErrorAction SilentlyContinue).Status -eq 'Running')
    }
    if ($actual -eq $target) { break }
  }
  if ($actual -eq $target) {
    $script:btState = $actual
    return [pscustomobject]@{ success = $true; enabled = $actual }
  }
  return [pscustomobject]@{ success = $false; enabled = $null; error = 'toggle_failed'; state = $actual }
}

# ==================== 飞行模式（WinRT Windows.Devices.Radios.Radio） ====================
# 与系统"飞行模式"同一套 API：通过 Radio.SetStateAsync 真正关闭/恢复全部无线电
# （WiFi/蓝牙/移动网络等），仅写注册表 SystemRadioState 不会让系统生效。

function Get-FlightRadios {
  # 惰性初始化 WinRT 异步等待所需类型（PowerShell 5.1 标准 AsTask 模式）
  if ($null -eq $script:flightAsTaskGeneric) {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop
    $script:flightAsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
    })[0]
    $script:flightRadioType = [Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType = WindowsRuntime]
    $script:flightStateType = [Windows.Devices.Radios.RadioState, Windows.Devices.Radios, ContentType = WindowsRuntime]
    $script:flightAccessType = [Windows.Devices.Radios.RadioAccessStatus, Windows.Devices.Radios, ContentType = WindowsRuntime]
    $script:flightListType = [System.Collections.Generic.IReadOnlyList``1].MakeGenericType($script:flightRadioType)
  }
  $op = $script:flightRadioType::GetRadiosAsync()
  return (Invoke-FlightAwait $op $script:flightListType)
}

function Invoke-FlightAwait {
  param($op, $resultType)
  $asTask = $script:flightAsTaskGeneric.MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

function Set-FlightRadioState {
  param($radio, $state)
  $null = Invoke-FlightAwait ($radio.SetStateAsync($state)) $script:flightAccessType
}

function Test-FlightModeApi {
  try {
    $radios = @(Get-FlightRadios)
    return $radios.Count -gt 0
  } catch {
    return $false
  }
}

function Get-FlightModeStatus {
  try {
    $radios = @(Get-FlightRadios)
    if ($radios.Count -eq 0) {
      return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
    }
    $anyOn = @($radios | Where-Object { $_.State -eq $script:flightStateType::On }).Count -gt 0
    return [pscustomobject]@{ success = $true; enabled = (-not $anyOn) }
  } catch {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported'; detail = $_.Exception.Message }
  }
}

function Invoke-FlightToggle {
  try {
    $radios = @(Get-FlightRadios)
    if ($radios.Count -eq 0) {
      return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
    }
    $anyOn = @($radios | Where-Object { $_.State -eq $script:flightStateType::On }).Count -gt 0
    $wantOn = $anyOn  # 有无线电开着 → 开启飞行模式；全部关闭 → 关闭飞行模式
    $targets = @{}
    if ($wantOn) {
      # 保存当前各无线电状态，关闭飞行模式时按原状态恢复
      $script:flightSavedStates = @{}
      foreach ($r in $radios) { $script:flightSavedStates[$r.Name] = $r.State }
      foreach ($r in $radios) { $targets[$r.Name] = $script:flightStateType::Off }
    } else {
      foreach ($r in $radios) {
        $saved = $null
        if ($script:flightSavedStates -and $script:flightSavedStates.ContainsKey($r.Name)) {
          $saved = $script:flightSavedStates[$r.Name]
        }
        if ($null -eq $saved) { $saved = $script:flightStateType::On }
        $targets[$r.Name] = $saved
      }
    }
    foreach ($r in $radios) {
      Set-FlightRadioState $r $targets[$r.Name]
    }
    # 轮询等待各无线电状态收敛（驱动异步生效，最长 15 秒）
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $allMatch = $false
    while ($sw.Elapsed.TotalSeconds -lt 15) {
      Start-Sleep -Milliseconds 500
      $rs = @(Get-FlightRadios)
      $allMatch = $true
      foreach ($r in $rs) {
        if (-not $targets.ContainsKey($r.Name) -or $r.State -ne $targets[$r.Name]) {
          $allMatch = $false
          break
        }
      }
      if ($allMatch) { break }
    }
    # 飞行模式会同时影响 WiFi/蓝牙无线电，清空相关状态缓存避免界面显示旧状态
    $script:wifiStatusCache = $null
    $script:btStatusCache = $null
    $script:btState = $null
    if ($allMatch) {
      return [pscustomobject]@{ success = $true; enabled = $wantOn }
    }
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'timeout' }
  } catch {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported'; detail = $_.Exception.Message }
  }
}

function Get-BtRadioEnabled {
  # 蓝牙无线电软件状态（受飞行模式影响）；设备级状态见 Get-BtState
  try {
    $radios = @(Get-FlightRadios)
    $bt = @($radios | Where-Object { ([string]$_.Kind) -eq 'Bluetooth' })[0]
    if ($null -eq $bt) { return $null }
    return ($bt.State -eq $script:flightStateType::On)
  } catch {
    return $null
  }
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

# ==================== 移动热点（WinRT NetworkOperatorTetheringManager） ====================
# 与 Windows 系统设置中的"移动热点"同一 API，不依赖第三方库，不禁用任何网卡/设备。

function Get-HotspotManager {
  try {
    $mgrType = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
    $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
    if ($null -eq $profile) { return $null }
    return $mgrType::CreateFromConnectionProfile($profile)
  } catch {
    return $null
  }
}

function Get-HotspotStatus {
  try {
    $m = Get-HotspotManager
    if ($null -eq $m) {
      return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
    }
    return [pscustomobject]@{ success = $true; enabled = (([string]$m.TetheringOperationalState) -eq 'On') }
  } catch {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported'; detail = $_.Exception.Message }
  }
}

function Invoke-HotspotToggle {
  try {
    $m = Get-HotspotManager
    if ($null -eq $m) {
      return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported' }
    }
    $current = [string]$m.TetheringOperationalState
    $wantOn = ($current -ne 'On')
    if ($wantOn) { $null = $m.StartTetheringAsync() } else { $null = $m.StopTetheringAsync() }
    # IAsyncOperation 的结果无法直接同步读取，轮询实际运行状态直至收敛（最长 30 秒）
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
      return [pscustomobject]@{ success = $true; enabled = $wantOn }
    }
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'timeout'; state = $state }
  } catch {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'unsupported'; detail = $_.Exception.Message }
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
  # 软件无线电状态（与 Windows 系统 WiFi 开关一致；wlanapi 进程内调用，毫秒级）
  $radio = Invoke-WifiRadioQuery
  # 自动配置状态（netsh show settings，仅作提示；开关本身控制无线电状态）
  $autoCfg = Get-AutoConfigState
  $info = @{
    available = ($null -ne $wlan)
    adapterEnabled = ($null -ne $wlan -and $wlan.AdminStatus -eq 'Up')
    radioEnabled = $radio.radioEnabled
    hardwareEnabled = $radio.hardwareEnabled
    autoConfigEnabled = $autoCfg
    enabled = $radio.radioEnabled
    connected = $false
    connecting = $false
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
      $info.connecting = ($state -match 'associat|authenticat|connecting|正在连接|正在验证|正在关联')
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
  # 安全实现：wlanapi 无线电状态切换（与 Windows 系统 WiFi 开关等效）。
  #  - 只写首个 PHY（AX201 上写全部 PHY 会导致无线电异常关断）
  #  - 无需管理员权限、不依赖 netsh 接口可见性
  #  - 网卡适配器与系统设置中的 WiFi 开关完全不受影响
  #  - 内部轮询等待驱动异步收敛，返回真实最终状态
  if (-not (Ensure-WifiRadioType)) {
    return [pscustomobject]@{ success = $false; enabled = $null; error = 'wlanapi_unavailable' }
  }
  $current = $false
  $err = [WifiRadioNative]::Set([bool]$enable, [ref]$current)
  if ($err) {
    return [pscustomobject]@{ success = $false; enabled = $null; error = $err }
  }
  $script:wifiScanCache = $null
  $script:wifiStatusCache = $null
  # 开启 WiFi 时顺带恢复自动配置（需要管理员权限；失败不影响无线电已开启的事实）
  if ($enable) { Enable-AutoConfig | Out-Null }
  return [pscustomobject]@{ success = $true; enabled = $current }
}

function Invoke-WifiScan {
  # 10 秒缓存：扫描本身较慢，避免界面反复触发
  if ($null -ne $script:wifiScanCache -and ((Get-Date) - $script:wifiScanCache.at).TotalSeconds -lt 10) {
    return $script:wifiScanCache.data
  }
  # 自动配置关闭时 netsh wlan 无法扫描（表现为"找不到网络"）：先尝试恢复，
  # 仍未恢复则返回明确标记，由 UI 给出提示而不是显示"未扫描到可用网络"。
  if (-not (Enable-AutoConfig)) {
    $result = [pscustomobject]@{ networks = @(); autoConfigOff = $true }
    $script:wifiScanCache = @{ at = Get-Date; data = $result }
    return $result
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
  # 用户主动选择网络 = 视为开启 WiFi：先确保无线电开启（wlanapi，无需管理员）
  if (Ensure-WifiRadioType) {
    $cur = $false
    $radioErr = [WifiRadioNative]::Set($true, [ref]$cur)
    if (-not $radioErr) {
      $script:wifiScanCache = $null
      $script:wifiStatusCache = $null
    }
  }
  # 自动配置关闭会导致连接失败：尝试恢复（需要管理员权限；失败忽略，connect 仍会执行）
  Enable-AutoConfig | Out-Null

  # 已有配置文件则直接连接
  $profiles = & netsh wlan show profiles 2>$null
  $hasProfile = $false
  foreach ($line in $profiles) {
    if ($line -match '^\s*(All User Profile|所有用户配置文件)\s*:\s*(.+)$') {
      if ($matches[2].Trim() -eq $ssid) { $hasProfile = $true; break }
    }
  }
  if ($hasProfile) {
    $connectOut = & netsh wlan connect name="$ssid" ssid="$ssid" 2>&1
    if ($LASTEXITCODE -eq 0) {
      $script:wifiScanCache = $null
      $script:wifiStatusCache = $null
      return [pscustomobject]@{ success = $true; usingProfile = $true }
    }
    return [pscustomobject]@{ success = $false; usingProfile = $true; error = ($connectOut -join ' ') }
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
    $connectOut = & netsh wlan connect name="$ssid" ssid="$ssid" 2>&1
    if ($LASTEXITCODE -eq 0) {
      $script:wifiScanCache = $null
      $script:wifiStatusCache = $null
      return [pscustomobject]@{ success = $true; usingProfile = $false }
    }
    return [pscustomobject]@{ success = $false; usingProfile = $false; error = ($connectOut -join ' ') }
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

function Invoke-WifiForget {
  param($ssid)
  if ([string]::IsNullOrEmpty($ssid)) { return [pscustomobject]@{ success = $false; error = 'no_ssid' } }
  $out = & netsh wlan delete profile name="$ssid" 2>&1
  $text = ($out -join ' ')
  # netsh 对不存在的配置也返回 0，需检查输出文本
  if ($LASTEXITCODE -eq 0 -and $text -notmatch 'not found|找不到|没有找到|不存在') {
    $script:wifiScanCache = $null
    $script:wifiStatusCache = $null
    return [pscustomobject]@{ success = $true }
  }
  return [pscustomobject]@{ success = $false; error = $text }
}

function Invoke-BtDevices {
  # 10 秒缓存：已配对设备列表（Win32 BluetoothFindFirstDevice(remembered)，
  # 回退注册表 BTHPORT\Parameters\Devices）
  if ($null -ne $script:btDevicesCache -and ((Get-Date) - $script:btDevicesCache.at).TotalSeconds -lt 10) {
    return $script:btDevicesCache.data
  }
  $list = @()
  $source = 'registry'
  if (Ensure-BtType) {
    $err = $null
    $raw = [BtNative]::GetDevices($false, [ref]$err)
    if ($null -eq $err) {
      $source = 'win32'
      # 按名称去重；同名多份记录时优先采用与注册表一致的规范地址
      $paired = Get-RegistryBtAddressSet
      $byName = @{}
      foreach ($d in $raw) {
        $addr = [string]$d['address']
        $name = [string]$d['name']
        if ([string]::IsNullOrEmpty($name)) { $name = $addr }
        $isCanon = $paired.ContainsKey($addr.Replace(':', '').ToUpper())
        $entry = @{ address = $addr; connected = [bool]$d['connected']; canonical = $isCanon }
        if (-not $byName.ContainsKey($name)) {
          $byName[$name] = $entry
        } elseif ($isCanon -and -not $byName[$name].canonical) {
          $byName[$name] = $entry
        }
      }
      foreach ($name in ($byName.Keys | Sort-Object)) {
        $item = $byName[$name]
        $list += [pscustomobject]@{
          name = $name
          address = $item.address
          status = if ($item.connected) { 'connected' } else { 'paired' }
        }
      }
    }
  }
  # 用注册表补充 Win32 可能漏掉的已配对设备（状态按"未连接"）
  $pairedSet = @{}
  foreach ($d in $list) { $pairedSet[$d.address.Replace(':','').ToUpper()] = $true }
  foreach ($rd in (Get-RegistryBtDevices)) {
    $rk = $rd.address.Replace(':','').ToUpper()
    if (-not $pairedSet.ContainsKey($rk)) { $list += $rd }
  }
  $result = [pscustomobject]@{ devices = $list; source = $source }
  $script:btDevicesCache = @{ at = Get-Date; data = $result }
  return $result
}

function Invoke-BtDiscover {
  # 30 秒缓存：查询（inquiry）约 10 秒，过滤已配对设备后返回未配对列表
  if ($null -ne $script:btScanCache -and ((Get-Date) - $script:btScanCache.at).TotalSeconds -lt 30) {
    return $script:btScanCache.data
  }
  if (-not (Ensure-BtType)) {
    $result = [pscustomobject]@{ devices = @(); error = 'btapi_unavailable' }
    $script:btScanCache = @{ at = Get-Date; data = $result }
    return $result
  }
  $err = $null
  $raw = [BtNative]::GetDevices($true, [ref]$err)
  $paired = Get-RegistryBtAddressSet
  $list = @()
  foreach ($d in $raw) {
    $addr = [string]$d['address']
    if ($paired.ContainsKey($addr.Replace(':','').ToUpper())) { continue }
    $name = [string]$d['name']
    if ([string]::IsNullOrEmpty($name)) { $name = $addr }
    $list += [pscustomobject]@{
      name = $name
      address = $addr
      status = 'unpaired'
    }
  }
  $result = [pscustomobject]@{ devices = $list }
  $script:btScanCache = @{ at = Get-Date; data = $result }
  return $result
}

function Invoke-BtPairWinRT {
  # pwsh7 预留：WinRT 蓝牙配对分支契约（未来实现）——
  #  发现：Windows.Devices.Enumeration.DeviceInformation.FindAllAsync(BluetoothDevice.GetDeviceSelector())
  #  配对：DeviceInformation.Pairing.Custom.PairAsync(DevicePairingKinds.ProvidePin)
  #        订阅 PairingRequested 事件回传用户输入的配对码（经典+BLE 全覆盖）
  #  返回结构必须与 Win32 分支一致：{ success, pinRequired?, error? }
  param($address, $pin)
  return [pscustomobject]@{ success = $false; error = 'pwsh7_winrt_pending' }
}

function Invoke-BtPairWin32 {
  param($address, $pin)
  if (-not (Ensure-BtType)) { return [pscustomobject]@{ success = $false; error = 'btapi_unavailable' } }
  $pinRequired = $false
  $errCode = 0
  $err = [BtNative]::Pair([string]$address, [string]$pin, [ref]$pinRequired, [ref]$errCode)
  if ($null -eq $err) {
    $script:btDevicesCache = $null
    $script:btScanCache = $null
    return [pscustomobject]@{ success = $true }
  }
  if ($pinRequired) {
    return [pscustomobject]@{ success = $false; pinRequired = $true; error = $err }
  }
  return [pscustomobject]@{ success = $false; error = $err; errorCode = $errCode }
}

function Invoke-BtPair {
  param($address, $pin)
  if ($script:IsPwsh7 -and $script:btWinRtEnabled) {
    Invoke-BtPairWinRT $address $pin
  } else {
    Invoke-BtPairWin32 $address $pin
  }
}

function Invoke-BtUnpairWinRT {
  # pwsh7 预留：WinRT 分支契约——DeviceInformation.Pairing.UnpairAsync()
  param($address)
  return [pscustomobject]@{ success = $false; error = 'pwsh7_winrt_pending' }
}

function Invoke-BtUnpair {
  param($address)
  if ($script:IsPwsh7 -and $script:btWinRtEnabled) { return Invoke-BtUnpairWinRT $address }
  if (-not (Ensure-BtType)) { return [pscustomobject]@{ success = $false; error = 'btapi_unavailable' } }
  $err = [BtNative]::Unpair([string]$address)
  $script:btDevicesCache = $null
  $script:btScanCache = $null
  if ($null -eq $err) { return [pscustomobject]@{ success = $true } }
  return [pscustomobject]@{ success = $false; error = $err }
}

function Invoke-BtInfoWinRT {
  # pwsh7 预留：WinRT 分支契约——BluetoothDevice.FromBluetoothAddressAsync + 属性
  param($address)
  return [pscustomobject]@{ success = $false; error = 'pwsh7_winrt_pending' }
}

function Invoke-BtInfo {
  param($address)
  if ($script:IsPwsh7 -and $script:btWinRtEnabled) { return Invoke-BtInfoWinRT $address }
  if (-not (Ensure-BtType)) { return [pscustomobject]@{ success = $false; error = 'btapi_unavailable' } }
  $err = $null
  $ht = [BtNative]::GetInfo([string]$address, [ref]$err)
  if ($err) { return [pscustomobject]@{ success = $false; error = $err } }
  $services = @()
  if ($ht['services'] -is [System.Collections.IEnumerable]) { $services = @($ht['services']) }
  return [pscustomobject]@{
    success = $true
    name = [string]$ht['name']
    address = [string]$ht['address']
    classOfDevice = [string]$ht['classOfDevice']
    connected = [bool]$ht['connected']
    remembered = [bool]$ht['remembered']
    authenticated = [bool]$ht['authenticated']
    services = $services
  }
}

function Get-BtInstanceByAddress {
  param($address)
  $hex = ([string]$address).Replace(':','').ToUpper()
  if ($hex.Length -ne 12) { return $null }
  $devices = @(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue)
  $target = $devices | Where-Object { $_.InstanceId -match ('BLUETOOTHDEVICE_' + $hex) } | Select-Object -First 1
  if (-not $target) {
    $target = $devices | Where-Object { $_.InstanceId -match ('^BTHLE\\DEV_' + $hex) } | Select-Object -First 1
  }
  return $target
}

function Invoke-BtServiceAction {
  param($address, $enable)
  if (-not (Ensure-BtType)) { return [pscustomobject]@{ ok = $false; error = 'btapi_unavailable' } }
  $err = $null
  $res = [BtNative]::SetServiceState([string]$address, [bool]$enable, [ref]$err)
  if ($null -eq $res) { return [pscustomobject]@{ ok = $true; notFound = $false } }
  # 0x424 = ERROR_SERVICE_NOT_FOUND：设备未注册可激活的经典服务（手机常见）
  $notFound = ($err -match '0x00000424|0x424')
  return [pscustomobject]@{ ok = $false; error = $err; notFound = $notFound }
}

function Invoke-BtConnectCmd {
  param($address)
  # 已连接则直接成功（避免重复点击落到 pnputil 报 action_failed）
  $info0 = Invoke-BtInfo $address
  if ($info0.success -and $info0.connected) {
    return [pscustomobject]@{ success = $true; method = 'already'; connected = $true }
  }
  $inst = Get-BtInstanceByAddress $address
  # BLE 设备：经典 Win32 API 无法查找其地址（0x80070057），直接走 pnputil（需管理员）
  if ($inst -and $inst.InstanceId -match '^BTHLE') {
    $r = Invoke-BtDeviceAction $inst.InstanceId $true
    if ($r.success) { $r | Add-Member -NotePropertyName method -NotePropertyValue 'pnputil' -Force; return $r }
    $r | Add-Member -NotePropertyName note -NotePropertyValue 'BLE 设备需通过 pnputil 启用/禁用（需要管理员权限）。' -Force
    return $r
  }
  # 首选服务连接（BluetoothSetServiceState，无需管理员，语义正确）
  $svc = Invoke-BtServiceAction $address $true
  if ($svc.ok) {
    Start-Sleep -Milliseconds 600
    $info1 = Invoke-BtInfo $address
    $connected = ($info1.success -and $info1.connected)
    $script:btDevicesCache = $null
    return [pscustomobject]@{
      success = $true
      method = 'service'
      connected = $connected
      note = if ($connected) { '' } else { '已发送连接请求，但设备未建立连接。手机类设备通常在传文件/音频等具体服务使用时才显示已连接。' }
    }
  }
  # 服务连接失败：区分处理
  if ($svc.notFound) {
    # 手机等经典设备未注册可激活服务：跳过 pnputil，引导使用蓝牙文件传输向导
    return [pscustomobject]@{
      success = $false
      error = 'service_not_found'
      detail = $svc.error
      note = '该设备未提供可连接的经典服务。手机类设备请使用"通过蓝牙发送或接收文件"，或从手机发起连接。'
    }
  }
  if (-not $inst) { return [pscustomobject]@{ success = $false; error = 'device_not_found' } }
  return [pscustomobject]@{ success = $false; error = 'service_failed'; detail = $svc.error }
}

function Invoke-BtDisconnectCmd {
  param($address)
  $info0 = Invoke-BtInfo $address
  if ($info0.success -and -not $info0.connected) {
    return [pscustomobject]@{ success = $true; method = 'already'; connected = $false }
  }
  $inst = Get-BtInstanceByAddress $address
  if ($inst -and $inst.InstanceId -match '^BTHLE') {
    $r = Invoke-BtDeviceAction $inst.InstanceId $false
    if ($r.success) { $r | Add-Member -NotePropertyName method -NotePropertyValue 'pnputil' -Force; return $r }
    $r | Add-Member -NotePropertyName note -NotePropertyValue 'BLE 设备需通过 pnputil 启用/禁用（需要管理员权限）。' -Force
    return $r
  }
  $svc = Invoke-BtServiceAction $address $false
  if ($svc.ok) {
    Start-Sleep -Milliseconds 600
    $info1 = Invoke-BtInfo $address
    $connected = ($info1.success -and $info1.connected)
    $script:btDevicesCache = $null
    return [pscustomobject]@{ success = $true; method = 'service'; connected = $connected }
  }
  if ($svc.notFound) {
    return [pscustomobject]@{ success = $false; error = 'service_not_found'; detail = $svc.error }
  }
  if (-not $inst) { return [pscustomobject]@{ success = $false; error = 'device_not_found' } }
  return [pscustomobject]@{ success = $false; error = 'service_failed'; detail = $svc.error }
}

function Invoke-BtDeviceAction {
  param($instanceId, $enable)
  if ([string]::IsNullOrEmpty($instanceId)) { return [pscustomobject]@{ success = $false; error = 'no_device' } }
  if ($enable) {
    $out = & pnputil /enable-device "$instanceId" 2>&1
  } else {
    $out = & pnputil /disable-device "$instanceId" 2>&1
  }
  if ($LASTEXITCODE -eq 0) {
    $script:btDevicesCache = $null
    return [pscustomobject]@{ success = $true; enabled = $enable }
  }
  $text = ($out -join ' ')
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    return [pscustomobject]@{ success = $false; error = 'admin_required'; detail = $text }
  }
  return [pscustomobject]@{ success = $false; error = 'action_failed'; detail = $text }
}

function Invoke-SysCommand {
  # 重要：参数名不能用 $args！$args 是 PowerShell 自动变量，会遮蔽参数，
  # 导致所有带参命令（wifiPower/wifiConnect/btConnect/setBrightness 等）
  # 永远收到空参数（曾造成 wifiPower 永远执行"关闭"的严重事故，见 AGENTS.md 第 18 节）。
  param([string]$cmd, [object[]]$cmdArgs)
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
  } elseif ($cmd -eq 'wifiRadio') {
    Invoke-WifiRadioQuery
  } elseif ($cmd -eq 'wifiPower') {
    # 兼容真实布尔（Server 模式）与字符串（CLI 测试）两种入参；
    # 注意 [bool]'false' 在 PowerShell 中为 $true，不能直接用强制转换。
    $raw = $cmdArgs[0]
    if ($raw -is [bool]) {
      Invoke-WifiPower $raw
    } else {
      Invoke-WifiPower ($raw -match '^(true|1|yes)$')
    }
  } elseif ($cmd -eq 'wifiScan') {
    Invoke-WifiScan
  } elseif ($cmd -eq 'wifiConnect') {
    Invoke-WifiConnect ([string]$cmdArgs[0]) ([string]$cmdArgs[1])
  } elseif ($cmd -eq 'wifiDisconnect') {
    Invoke-WifiDisconnect
  } elseif ($cmd -eq 'btDevices') {
    Invoke-BtDevices
  } elseif ($cmd -eq 'btDiscover') {
    Invoke-BtDiscover
  } elseif ($cmd -eq 'btPair') {
    Invoke-BtPair ([string]$cmdArgs[0]) ([string]$cmdArgs[1])
  } elseif ($cmd -eq 'btUnpair') {
    Invoke-BtUnpair ([string]$cmdArgs[0])
  } elseif ($cmd -eq 'btInfo') {
    Invoke-BtInfo ([string]$cmdArgs[0])
  } elseif ($cmd -eq 'btConnect') {
    Invoke-BtConnectCmd ([string]$cmdArgs[0])
  } elseif ($cmd -eq 'btDisconnect') {
    Invoke-BtDisconnectCmd ([string]$cmdArgs[0])
  } elseif ($cmd -eq 'flightToggle') {
    Invoke-FlightToggle
  } elseif ($cmd -eq 'flightStatus') {
    Get-FlightModeStatus
  } elseif ($cmd -eq 'hotspotStatus') {
    Get-HotspotStatus
  } elseif ($cmd -eq 'hotspotToggle') {
    Invoke-HotspotToggle
  } elseif ($cmd -eq 'getBrightness') {
    Get-BrightnessValue
  } elseif ($cmd -eq 'setBrightness') {
    Set-BrightnessValue $cmdArgs[0]
  } elseif ($cmd -eq 'wifiForget') {
    Invoke-WifiForget ([string]$cmdArgs[0])
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
