# The window your person is using right now, for the bubble: which one it is and where it sits.
# Reads only (GetForegroundWindow and its frame); hooks nothing, changes nothing.
# Prints one JSON line {"fg":<hwnd>,"r":[left,top,right,bottom],"full":true|false} in physical pixels,
# once with -once, or each time the front window changes or moves (every -ms milliseconds) until the bubble stops it.
param([int]$skipPid = 0, [int]$ms = 400, [switch]$once)
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Front {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [StructLayout(LayoutKind.Sequential)] public struct RC { public int l, t, r, b; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int size; public RC mon; public RC work; public uint flags; }
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MI mi);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RC rc);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RC v, int size);
  public static string Now(uint skip) {
    SetThreadDpiAwarenessContext(new IntPtr(-4)); // per-monitor aware: every number below is a real pixel
    IntPtr h = GetForegroundWindow(); uint pid; GetWindowThreadProcessId(h, out pid);
    var cls = new System.Text.StringBuilder(64); GetClassName(h, cls, 64); string c = cls.ToString();
    if (h == IntPtr.Zero || pid == skip || IsIconic(h) || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "Progman" || c == "WorkerW") return "{\"fg\":0}";
    RC r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r);
    MI mi = new MI(); mi.size = Marshal.SizeOf(typeof(MI)); GetMonitorInfo(MonitorFromWindow(h, 2), ref mi);
    bool full = r.l <= mi.mon.l && r.t <= mi.mon.t && r.r >= mi.mon.r && r.b >= mi.mon.b;
    return "{\"fg\":" + h.ToInt64() + ",\"r\":[" + r.l + "," + r.t + "," + r.r + "," + r.b + "],\"full\":" + (full ? "true" : "false") + "}";
  }
}
"@
if ($once) { [Console]::Out.WriteLine([Front]::Now([uint32]$skipPid)); exit }
$last = ''
while ($true) {
  $s = [Front]::Now([uint32]$skipPid)
  if ($s -ne $last) { [Console]::Out.WriteLine($s); [Console]::Out.Flush(); $last = $s }
  Start-Sleep -Milliseconds $ms
}
