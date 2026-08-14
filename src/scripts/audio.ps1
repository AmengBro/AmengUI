[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string]$Command = '',
  [Parameter(Position = 1)] [string]$Arg1 = '',
  [Parameter(Position = 2)] [string]$Arg2 = '',
  [switch]$Server
)

# 统一 UTF-8，避免中文设备名/应用名乱码
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace AmengAudio
{
    public enum EDataFlow { eRender = 0, eCapture = 1 }
    public enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }
    public enum DeviceState { Active = 0x1, Disabled = 0x2, NotPresent = 0x4, Unplugged = 0x8 }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    public class CPolicyConfigClient { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(EDataFlow dataFlow, DeviceState dwStateMask, out IMMDeviceCollection ppDevices);
        [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr pClient);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint pcDevices);
        [PreserveSig] int Item(uint nDevice, out IMMDevice ppDevice);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        [PreserveSig] int OpenPropertyStore(int stgmAccess, out IPropertyStore ppProperties);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        [PreserveSig] int GetState(out DeviceState pdwState);
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROPERTYKEY
    {
        public Guid fmtid;
        public int pid;
        public PROPERTYKEY(Guid f, int p) { fmtid = f; pid = p; }
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(2)] public ushort wReserved1;
        [FieldOffset(4)] public ushort wReserved2;
        [FieldOffset(6)] public ushort wReserved3;
        [FieldOffset(8)] public IntPtr pointerVal;
    }

    [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint cProps);
        [PreserveSig] int GetAt(uint iProp, out PROPERTYKEY pkey);
        [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT propvar);
        [PreserveSig] int Commit();
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr pNotify);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr pNotify);
        [PreserveSig] int GetChannelCount(out uint pnChannelCount);
        [PreserveSig] int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
        [PreserveSig] int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
        [PreserveSig] int GetMasterVolumeLevel(out float pfLevelDB);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float pfLevel);
        [PreserveSig] int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
        [PreserveSig] int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        [PreserveSig] int SetMute(bool bMute, ref Guid pguidEventContext);
        [PreserveSig] int GetMute(out bool pbMute);
        [PreserveSig] int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        [PreserveSig] int VolumeStepUp(ref Guid pguidEventContext);
        [PreserveSig] int VolumeStepDown(ref Guid pguidEventContext);
        [PreserveSig] int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        [PreserveSig] int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(ref Guid AudioSessionGuid, uint StreamFlags, out IAudioSessionControl ppSessionControl);
        [PreserveSig] int GetSimpleAudioVolume(ref Guid AudioSessionGuid, uint StreamFlags, out ISimpleAudioVolume ppAudioVolume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
        [PreserveSig] int RegisterSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int UnregisterSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionID, IntPtr duckNotification);
        [PreserveSig] int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int SessionCount);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl Session);
    }

    [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl
    {
        [PreserveSig] int GetState(out int pRetVal);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetGroupingParam(out Guid pRetVal);
        [PreserveSig] int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    }

    // 注意：不要用接口继承，.NET Framework 下继承 COM 接口会导致 vtable 调度错误（AccessViolation）。
    // 这里按完整 vtable 顺序扁平声明 IAudioSessionControl2（含基接口 9 个方法 + 自身 5 个方法）。
    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int pRetVal);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetGroupingParam(out Guid pRetVal);
        [PreserveSig] int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int GetProcessId(out uint pRetVal);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(bool optOut);
    }

    [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float fLevelNorm, ref Guid EventContext);
        [PreserveSig] int GetMasterVolume(out float pfLevelNorm);
        [PreserveSig] int SetMute(bool bMute, ref Guid EventContext);
        [PreserveSig] int GetMute(out bool pbMute);
    }

    [Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr ppFormat);
        [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, bool bDefault, IntPtr ppFormat);
        [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName);
        [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr pEndpointFormat, IntPtr MixFormat);
        [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, bool bDefault, IntPtr pmftDefaultPeriod, IntPtr pmftMinimumPeriod);
        [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr pmftPeriod);
        [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr pMode);
        [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr mode);
        [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, bool bFxStore, IntPtr key, IntPtr pv);
        [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, bool bFxStore, IntPtr key, IntPtr pv);
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string wszDeviceId, ERole eRole);
        [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, bool bVisible);
    }

    public class AudioData
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string State { get; set; }
        public bool IsDefault { get; set; }
    }

    public class SessionData
    {
        public int Pid { get; set; }
        public string Name { get; set; }
        public string IconData { get; set; }
        public float Volume { get; set; }
        public bool Mute { get; set; }
        public bool IsSystem { get; set; }
    }

    public class SessionHandle
    {
        public int Pid { get; set; }
        public ISimpleAudioVolume Volume { get; set; }
    }

    public static class NativeIcon
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct GdiplusStartupInput
        {
            public int GdiplusVersion;
            public IntPtr DebugEventCallback;
            public int SuppressBackgroundThread;
            public int SuppressExternalCodecs;
        }

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
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern int ExtractIconEx(string lpszFile, int nIconIndex, out IntPtr phiconLarge, out IntPtr phiconSmall, uint nIcons);
        [DllImport("user32.dll")]
        private static extern bool DestroyIcon(IntPtr hIcon);

        private static readonly Guid PngEncoderClsid = new Guid("557CF406-1A04-11D3-9A73-0000F81EF32E");

        public static string ExtractIconPng(string exePath, string outDir)
        {
            try
            {
                if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath)) return null;
                IntPtr large, small;
                int got = ExtractIconEx(exePath, 0, out large, out small, 1);
                IntPtr hIcon = got > 0 ? large : IntPtr.Zero;
                if (hIcon == IntPtr.Zero && got > 0) hIcon = small;
                if (hIcon == IntPtr.Zero) return null;
                try
                {
                    var input = new GdiplusStartupInput
                    {
                        GdiplusVersion = 1,
                        SuppressBackgroundThread = 1,
                        SuppressExternalCodecs = 0
                    };
                    IntPtr token, output;
                    if (GdiplusStartup(out token, ref input, out output) != 0) return null;
                    try
                    {
                        IntPtr bitmap;
                        if (GdipCreateBitmapFromHICON(hIcon, out bitmap) != 0) return null;
                        try
                        {
                            if (!Directory.Exists(outDir)) Directory.CreateDirectory(outDir);
                            string path = Path.Combine(outDir, Md5(exePath) + ".png");
                            if (!File.Exists(path))
                            {
                                Guid encoder = PngEncoderClsid;
                                if (GdipSaveImageToFile(bitmap, path, ref encoder, IntPtr.Zero) != 0) return null;
                            }
                            return path;
                        }
                        finally { GdipDisposeImage(bitmap); }
                    }
                    finally { GdiplusShutdown(token); }
                }
                finally { DestroyIcon(hIcon); }
            }
            catch { return null; }
        }

        private static string Md5(string s)
        {
            using (var md5 = System.Security.Cryptography.MD5.Create())
            {
                byte[] bytes = md5.ComputeHash(System.Text.Encoding.UTF8.GetBytes(s));
                var sb = new System.Text.StringBuilder();
                foreach (byte b in bytes) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }
    }

    public static class NativeAudio
    {
        private static readonly Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        private static readonly Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        private static readonly PROPERTYKEY PKEY_Device_FriendlyName =
            new PROPERTYKEY(new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), 14);

        [DllImport("ole32.dll")]
        private static extern int PropVariantClear(ref PROPVARIANT pvar);

        public static bool HasRenderDevices()
        {
            try
            {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDeviceCollection coll;
                if (enumerator.EnumAudioEndpoints(EDataFlow.eRender, DeviceState.Active, out coll) != 0) return false;
                uint count;
                coll.GetCount(out count);
                return count > 0;
            }
            catch { return false; }
        }

        public static IMMDevice GetDefaultDevice()
        {
            try
            {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice device;
                if (enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device) != 0) return null;
                return device;
            }
            catch { return null; }
        }

        public static bool GetMasterState(out float volume, out bool mute, out string deviceName)
        {
            volume = 0f; mute = false; deviceName = "";
            try
            {
                var device = GetDefaultDevice();
                if (device == null) return false;
                Guid iid = IID_IAudioEndpointVolume;
                object obj;
                if (device.Activate(ref iid, 1, IntPtr.Zero, out obj) != 0) return false;
                var vol = (IAudioEndpointVolume)obj;
                float v; bool m;
                if (vol.GetMasterVolumeLevelScalar(out v) != 0) return false;
                vol.GetMute(out m);
                volume = v; mute = m;
                deviceName = GetDeviceName(device);
                return true;
            }
            catch { return false; }
        }

        public static bool SetMasterVolume(float level)
        {
            try
            {
                if (level < 0f) level = 0f;
                if (level > 1f) level = 1f;
                var device = GetDefaultDevice();
                if (device == null) return false;
                Guid iid = IID_IAudioEndpointVolume;
                object obj;
                if (device.Activate(ref iid, 1, IntPtr.Zero, out obj) != 0) return false;
                var vol = (IAudioEndpointVolume)obj;
                Guid ctx = Guid.Empty;
                return vol.SetMasterVolumeLevelScalar(level, ref ctx) == 0;
            }
            catch { return false; }
        }

        public static bool SetMasterMute(bool mute)
        {
            try
            {
                var device = GetDefaultDevice();
                if (device == null) return false;
                Guid iid = IID_IAudioEndpointVolume;
                object obj;
                if (device.Activate(ref iid, 1, IntPtr.Zero, out obj) != 0) return false;
                var vol = (IAudioEndpointVolume)obj;
                Guid ctx = Guid.Empty;
                return vol.SetMute(mute, ref ctx) == 0;
            }
            catch { return false; }
        }

        /// <summary>
        /// 对所有活动音频会话静音/取消静音（ISimpleAudioVolume），
        /// 作为端点静音的双保险：部分驱动对端点 SetMute 不生效时仍可静音
        /// </summary>
        public static void MuteAllSessions(bool mute)
        {
            try
            {
                var handles = EnumerateSessionHandles();
                foreach (var h in handles)
                {
                    try
                    {
                        Guid ctx = Guid.Empty;
                        h.Volume.SetMute(mute, ref ctx);
                    }
                    catch { }
                }
            }
            catch { }
        }

        public static string GetDeviceName(IMMDevice device)
        {
            try
            {
                IPropertyStore store;
                if (device.OpenPropertyStore(0, out store) != 0) return "";
                PROPERTYKEY key = PKEY_Device_FriendlyName;
                PROPVARIANT pv;
                if (store.GetValue(ref key, out pv) != 0) return "";
                if (pv.vt == 31 && pv.pointerVal != IntPtr.Zero)
                    return Marshal.PtrToStringUni(pv.pointerVal) ?? "";
                PropVariantClear(ref pv);
            }
            catch { }
            return "";
        }

        public static List<AudioData> GetDevices(out string defaultId)
        {
            var list = new List<AudioData>();
            defaultId = null;
            try
            {
                var defaultDevice = GetDefaultDevice();
                if (defaultDevice != null) defaultDevice.GetId(out defaultId);
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDeviceCollection coll;
                if (enumerator.EnumAudioEndpoints(EDataFlow.eRender, DeviceState.Active, out coll) != 0) return list;
                uint count;
                coll.GetCount(out count);
                for (uint i = 0; i < count; i++)
                {
                    IMMDevice device;
                    if (coll.Item(i, out device) != 0) continue;
                    string id; device.GetId(out id);
                    DeviceState state; device.GetState(out state);
                    list.Add(new AudioData
                    {
                        Id = id,
                        Name = GetDeviceName(device),
                        State = state.ToString(),
                        IsDefault = defaultId != null && id == defaultId
                    });
                }
            }
            catch { }
            return list;
        }

        public static List<AudioData> GetInputDevices(out string defaultId)
        {
            var list = new List<AudioData>();
            defaultId = null;
            try
            {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice defaultDevice;
                if (enumerator.GetDefaultAudioEndpoint(EDataFlow.eCapture, ERole.eMultimedia, out defaultDevice) == 0)
                {
                    defaultDevice.GetId(out defaultId);
                }
                IMMDeviceCollection coll;
                if (enumerator.EnumAudioEndpoints(EDataFlow.eCapture, DeviceState.Active, out coll) != 0) return list;
                uint count;
                coll.GetCount(out count);
                for (uint i = 0; i < count; i++)
                {
                    IMMDevice device;
                    if (coll.Item(i, out device) != 0) continue;
                    string id; device.GetId(out id);
                    DeviceState state; device.GetState(out state);
                    list.Add(new AudioData
                    {
                        Id = id,
                        Name = GetDeviceName(device),
                        State = state.ToString(),
                        IsDefault = defaultId != null && id == defaultId
                    });
                }
            }
            catch { }
            return list;
        }

        public static bool SetDefaultDevice(string id)
        {
            try
            {
                if (string.IsNullOrEmpty(id)) return false;
                var policy = (IPolicyConfig)(new CPolicyConfigClient());
                policy.SetDefaultEndpoint(id, ERole.eConsole);
                policy.SetDefaultEndpoint(id, ERole.eMultimedia);
                policy.SetDefaultEndpoint(id, ERole.eCommunications);
                return true;
            }
            catch { return false; }
        }

        public static bool SetDefaultInputDevice(string id)
        {
            try
            {
                if (string.IsNullOrEmpty(id)) return false;
                var policy = (IPolicyConfig)(new CPolicyConfigClient());
                // 输入（采集）端点同样经 IPolicyConfig 设置三种角色
                policy.SetDefaultEndpoint(id, ERole.eConsole);
                policy.SetDefaultEndpoint(id, ERole.eMultimedia);
                policy.SetDefaultEndpoint(id, ERole.eCommunications);
                return true;
            }
            catch { return false; }
        }

        public static List<SessionHandle> EnumerateSessionHandles()
        {
            var list = new List<SessionHandle>();
            try
            {
                var device = GetDefaultDevice();
                if (device == null) return list;
                Guid iid = IID_IAudioSessionManager2;
                object obj;
                if (device.Activate(ref iid, 1, IntPtr.Zero, out obj) != 0) return list;
                var mgr = (IAudioSessionManager2)obj;
                IAudioSessionEnumerator enumerator;
                if (mgr.GetSessionEnumerator(out enumerator) != 0) return list;
                int count;
                enumerator.GetCount(out count);
                for (int i = 0; i < count; i++)
                {
                    IAudioSessionControl ctrl;
                    if (enumerator.GetSession(i, out ctrl) != 0) continue;
                    var c2 = ctrl as IAudioSessionControl2;
                    uint pid = 0;
                    if (c2 != null)
                    {
                        try { c2.GetProcessId(out pid); } catch { }
                    }
                    var vol = ctrl as ISimpleAudioVolume;
                    if (vol == null) continue;
                    list.Add(new SessionHandle { Pid = (int)pid, Volume = vol });
                }
            }
            catch { }
            return list;
        }

        public static bool SetSessionVolumeByPid(int targetPid, float level)
        {
            if (level < 0f) level = 0f;
            if (level > 1f) level = 1f;
            foreach (var h in EnumerateSessionHandles())
            {
                if (h.Pid == targetPid)
                {
                    try
                    {
                        Guid ctx = Guid.Empty;
                        return h.Volume.SetMasterVolume(level, ref ctx) == 0;
                    }
                    catch { return false; }
                }
            }
            return false;
        }

        public static bool SetSessionMuteByPid(int targetPid, bool mute)
        {
            foreach (var h in EnumerateSessionHandles())
            {
                if (h.Pid == targetPid)
                {
                    try
                    {
                        Guid ctx = Guid.Empty;
                        return h.Volume.SetMute(mute, ref ctx) == 0;
                    }
                    catch { return false; }
                }
            }
            return false;
        }

        public static List<SessionData> GetSessions()
        {
            var result = new List<SessionData>();
            try
            {
                var device = GetDefaultDevice();
                if (device == null) return result;
                Guid iid = IID_IAudioSessionManager2;
                object obj;
                if (device.Activate(ref iid, 1, IntPtr.Zero, out obj) != 0) return result;
                var mgr = (IAudioSessionManager2)obj;
                IAudioSessionEnumerator enumerator;
                if (mgr.GetSessionEnumerator(out enumerator) != 0) return result;
                int count;
                enumerator.GetCount(out count);
                for (int i = 0; i < count; i++)
                {
                    IAudioSessionControl ctrl;
                    if (enumerator.GetSession(i, out ctrl) != 0) continue;
                    uint pid = 0;
                    string display = "";
                    string iconPath = "";
                    bool isSystem = false;
                    var c2 = ctrl as IAudioSessionControl2;
                    if (c2 != null)
                    {
                        try { c2.GetProcessId(out pid); } catch { }
                        try { c2.GetDisplayName(out display); } catch { }
                        try { c2.GetIconPath(out iconPath); } catch { }
                        try { isSystem = c2.IsSystemSoundsSession() == 0; } catch { }
                    }
                    var vol = ctrl as ISimpleAudioVolume;
                    float v = 0f; bool m = false;
                    if (vol != null)
                    {
                        try { vol.GetMasterVolume(out v); } catch { }
                        try { vol.GetMute(out m); } catch { }
                    }
                    string realIcon = ResolveIcon(pid, iconPath, isSystem);
                    string iconData = null;
                    string pngPath = NativeIcon.ExtractIconPng(realIcon, Path.Combine(Path.GetTempPath(), "amengui_audio_icons"));
                    if (pngPath != null && File.Exists(pngPath))
                    {
                        iconData = "data:image/png;base64," + Convert.ToBase64String(File.ReadAllBytes(pngPath));
                    }
                    result.Add(new SessionData
                    {
                        Pid = (int)pid,
                        Name = ResolveName(pid, display, isSystem),
                        IconData = iconData,
                        Volume = v,
                        Mute = m,
                        IsSystem = isSystem
                    });
                }
            }
            catch { }
            return result;
        }

        private static string ResolveName(uint pid, string display, bool isSystem)
        {
            if (isSystem) return "系统声音";
            if (!string.IsNullOrWhiteSpace(display)) return display.Trim();
            if (pid != 0)
            {
                try
                {
                    using (var p = Process.GetProcessById((int)pid))
                    {
                        if (!string.IsNullOrEmpty(p.ProcessName)) return p.ProcessName;
                    }
                }
                catch { }
            }
            return "未知应用";
        }

        private static string ResolveIcon(uint pid, string iconPath, bool isSystem)
        {
            try
            {
                if (isSystem) iconPath = Path.Combine(Environment.SystemDirectory, "sndvol.exe");
                if (string.IsNullOrWhiteSpace(iconPath) && pid != 0)
                {
                    using (var p = Process.GetProcessById((int)pid))
                    {
                        if (p.MainModule != null) iconPath = p.MainModule.FileName;
                    }
                }
                if (string.IsNullOrEmpty(iconPath)) return null;
                iconPath = Environment.ExpandEnvironmentVariables(iconPath);
                int comma = iconPath.IndexOf(',');
                if (comma > 0) iconPath = iconPath.Substring(0, comma);
                if (!File.Exists(iconPath)) return null;
                return iconPath;
            }
            catch { return null; }
        }

    }
}
'@

Add-Type -TypeDefinition $source

# 会话映射（独立函数而非 switch 子句内联：PowerShell 5.1 对 switch 子句内的
# 多行 hashtable/字典操作存在解析与执行怪癖，独立函数可稳定兼容）
function Get-SessionRows {
  param($sessions)
  $seen = @{}
  $mapped = @()
  foreach ($s in @($sessions)) {
    if ($null -eq $s) { continue }
    if ($seen.ContainsKey($s.Pid)) { continue }
    $seen[$s.Pid] = $true
    $mapped += [pscustomobject]@{
      pid = $s.Pid
      name = $s.Name
      iconData = $s.IconData
      volume = [math]::Round($s.Volume * 100)
      mute = $s.Mute
      isSystem = $s.IsSystem
    }
  }
  return ,$mapped
}

function Invoke-AudioCommand {
  # 重要：参数名不能用 $args（自动变量遮蔽），否则所有带参命令收不到参数
  # （曾造成 setVolume 等静默失效，与 sys.ps1 同源事故，见 AGENTS.md 第 18 节）
  param([string]$cmd, [object[]]$cmdArgs)
  # 注意：不要用 switch 语句分发命令——PowerShell 5.1 对 switch 子句内的
  # 多行 hashtable/表达式存在解析与执行怪癖，if/elseif 完全兼容
  if ($cmd -eq 'capabilities') {
    [pscustomobject]@{ audio = [AmengAudio.NativeAudio]::HasRenderDevices() }
  } elseif ($cmd -eq 'getVolume') {
    $v = 0.0; $m = $false; $name = ''
    $ok = [AmengAudio.NativeAudio]::GetMasterState([ref]$v, [ref]$m, [ref]$name)
    if (-not $ok) { $v = -1 }
    [pscustomobject]@{
      success = $ok
      volume = [math]::Round($v * 100)
      mute = [bool]$script:isMuted
      deviceName = $name
    }
  } elseif ($cmd -eq 'setVolume') {
    $pct = [int]$cmdArgs[0]
    if ($pct -lt 0) { $pct = 0 }
    if ($pct -gt 100) { $pct = 100 }
    $ok = [AmengAudio.NativeAudio]::SetMasterVolume(($pct / 100.0))
    if ($ok) {
      # 记录程序设定音量；拖动音量视为解除静音（伪静音：音量归 0，拖动即恢复）
      $script:lastVolume = $pct
      $script:isMuted = $false
    }
    if (-not $ok) {
      # 兜底：WScript.Shell 音量键（仅在不支持 Core Audio 的环境）
      try {
        $obj = New-Object -ComObject WScript.Shell
        for ($i = 0; $i -lt 50; $i++) { $obj.SendKeys([char]174) }
        for ($i = 0; $i -lt $pct; $i++) { $obj.SendKeys([char]175) }
        $ok = $true
      } catch { }
    }
    [pscustomobject]@{ success = $ok }
  } elseif ($cmd -eq 'setMute') {
    # 伪静音：端点/驱动 SetMute 实测不可靠，改为"音量归 0 / 恢复原音量"
    $mute = [bool]$cmdArgs[0]
    if ($mute) {
      if (-not $script:isMuted) {
        $v = 0.0; $mm = $false; $nn = ''
        $got = [AmengAudio.NativeAudio]::GetMasterState([ref]$v, [ref]$mm, [ref]$nn)
        if ($got) {
          $cur = [math]::Round($v * 100)
          if ($cur -gt 0) { $script:lastVolume = $cur }
        }
        if ($null -eq $script:lastVolume) { $script:lastVolume = 50 }
        [AmengAudio.NativeAudio]::SetMasterVolume(0.0) | Out-Null
        $script:isMuted = $true
      }
    } elseif ($script:isMuted) {
      $restore = [int]$script:lastVolume
      if ($restore -lt 0) { $restore = 0 }
      if ($restore -gt 100) { $restore = 100 }
      [AmengAudio.NativeAudio]::SetMasterVolume(($restore / 100.0)) | Out-Null
      $script:isMuted = $false
    }
    [pscustomobject]@{ success = $true; muted = [bool]$script:isMuted }
  } elseif ($cmd -eq 'getDevices') {
    $def = ''
    $devices = [AmengAudio.NativeAudio]::GetDevices([ref]$def)
    $mapped = @($devices | ForEach-Object {
      [pscustomobject]@{
        id = $_.Id
        name = $_.Name
        state = $_.State
        isDefault = $_.IsDefault
      }
    })
    [pscustomobject]@{ defaultId = $def; devices = $mapped }
  } elseif ($cmd -eq 'setDefaultDevice') {
    $ok = [AmengAudio.NativeAudio]::SetDefaultDevice([string]$cmdArgs[0])
    [pscustomobject]@{ success = $ok }
  } elseif ($cmd -eq 'getInputDevices') {
    $def = ''
    $devices = [AmengAudio.NativeAudio]::GetInputDevices([ref]$def)
    $mapped = @($devices | ForEach-Object {
      [pscustomobject]@{
        id = $_.Id
        name = $_.Name
        state = $_.State
        isDefault = $_.IsDefault
      }
    })
    [pscustomobject]@{ defaultId = $def; devices = $mapped }
  } elseif ($cmd -eq 'setDefaultInputDevice') {
    $ok = [AmengAudio.NativeAudio]::SetDefaultInputDevice([string]$cmdArgs[0])
    [pscustomobject]@{ success = $ok }
  } elseif ($cmd -eq 'getSessions') {
    # 同一进程可能持有多个会话（如系统声音），按 PID 合并为一行
    $sessions = [AmengAudio.NativeAudio]::GetSessions()
    if ($null -eq $sessions) { $sessions = @() }
    $mapped = Get-SessionRows $sessions
    [pscustomobject]@{ sessions = $mapped }
  } elseif ($cmd -eq 'setSessionVolume') {
    $targetPid = [int]$cmdArgs[0]
    $pct = [int]$cmdArgs[1]
    if ($pct -lt 0) { $pct = 0 }
    if ($pct -gt 100) { $pct = 100 }
    $ok = [AmengAudio.NativeAudio]::SetSessionVolumeByPid($targetPid, ($pct / 100.0))
    [pscustomobject]@{ success = $ok }
  } elseif ($cmd -eq 'setSessionMute') {
    $targetPid = [int]$cmdArgs[0]
    $m = [bool]$cmdArgs[1]
    $ok = [AmengAudio.NativeAudio]::SetSessionMuteByPid($targetPid, $m)
    [pscustomobject]@{ success = $ok }
  } else {
    throw "unknown audio command: $cmd"
  }
}

if ($Server) {
  # 伪静音状态：静音时音量归 0，解除时恢复 lastVolume（服务端进程内跟踪）
  $script:isMuted = $false
  $script:lastVolume = $null
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
      $data = Invoke-AudioCommand $req.cmd @($req.args)
      [Console]::Out.WriteLine(([pscustomobject]@{ id = $req.id; ok = $true; data = $data } | ConvertTo-Json -Compress -Depth 8))
    } catch {
      [Console]::Out.WriteLine(([pscustomobject]@{ id = $req.id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress -Depth 4))
    }
    [Console]::Out.Flush()
  }
  exit 0
}

Invoke-AudioCommand $Command @($Arg1, $Arg2) | ConvertTo-Json -Compress -Depth 8
