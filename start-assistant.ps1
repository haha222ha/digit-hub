# xhs-shipping-assistant launcher (UTF-8)
$ErrorActionPreference = 'SilentlyContinue'
chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Root = 'D:\eva\xhs-shipping-assistant'
Set-Location $Root
$script:MainTitle = '小红书发货助手'

function Focus-AssistantWindow {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinFocus {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
  $found = $false
  [WinFocus]::EnumWindows({
    param($h, $l)
    if (-not [WinFocus]::IsWindowVisible($h)) { return $true }
    $sb = New-Object System.Text.StringBuilder 512
    [void][WinFocus]::GetWindowText($h, $sb, $sb.Capacity)
    $t = $sb.ToString()
    if ($t -eq $script:MainTitle -or $t.StartsWith($script:MainTitle)) {
      [WinFocus]::ShowWindow($h, 9) | Out-Null
      [WinFocus]::SetForegroundWindow($h) | Out-Null
      $script:found = $true
      return $false
    }
    return $true
  }, [IntPtr]::Zero)
  return $found
}

function Get-AssistantElectron {
  Get-CimInstance Win32_Process -Filter "name='electron.exe'" | Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -match 'xhs-shipping-assistant' -or
      $_.CommandLine -match 'dist-electron\\main'
    ) -and $_.CommandLine -notmatch '--type='
  }
}

if (Focus-AssistantWindow) { exit 0 }

$running = @(Get-AssistantElectron)
if ($running.Count -gt 0) {
  $env:VITE_DEV_SERVER_URL = 'http://localhost:5173/'
  $ele = Join-Path $Root 'node_modules\electron\dist\electron.exe'
  if (Test-Path $ele) {
    Start-Process -FilePath $ele -ArgumentList '.' -WorkingDirectory $Root
  }
  Start-Sleep -Milliseconds 800
  [void](Focus-AssistantWindow)
  exit 0
}

$viteUp = $false
try {
  $c = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
  if ($c) { $viteUp = $true }
} catch {
  $r = netstat -ano | Select-String ':5173' | Select-String 'LISTENING'
  if ($r) { $viteUp = $true }
}

if ($viteUp) {
  $env:VITE_DEV_SERVER_URL = 'http://localhost:5173/'
  Start-Process -FilePath (Join-Path $Root 'node_modules\electron\dist\electron.exe') -ArgumentList '.' -WorkingDirectory $Root
  Start-Sleep -Seconds 2
  [void](Focus-AssistantWindow)
  exit 0
}

Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run electron:dev' -WorkingDirectory $Root -WindowStyle Minimized
Start-Sleep -Seconds 10
[void](Focus-AssistantWindow)
