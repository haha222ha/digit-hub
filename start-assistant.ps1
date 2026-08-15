# xhs-shipping-assistant launcher (ASCII-safe)
$ErrorActionPreference = "SilentlyContinue"
chcp 65001 | Out-Null
$Root = "D:\eva\xhs-shipping-assistant"
Set-Location $Root
$MainTitle = [System.Text.Encoding]::UTF8.GetString([byte[]](0xE5,0xB0,0x8F,0xE7,0xBA,0xA2,0xE4,0xB9,0xA6,0xE5,0x8F,0x91,0xE8,0xB4,0xA7,0xE5,0x8A,0xA9,0xE6,0x89,0x8B))
$Ele = Join-Path $Root "node_modules\electron\dist\electron.exe"

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinFocus2 {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

function Focus-AssistantWindow([string]$title) {
  $script:found = $false
  $script:want = $title
  [WinFocus2]::EnumWindows({
    param($h, $l)
    $sb = New-Object System.Text.StringBuilder 512
    [void][WinFocus2]::GetWindowText($h, $sb, $sb.Capacity)
    $t = $sb.ToString()
    if ($t -and ($t -eq $script:want -or $t.StartsWith($script:want))) {
      if ([WinFocus2]::IsIconic($h)) { [void][WinFocus2]::ShowWindow($h, 9) }
      else { [void][WinFocus2]::ShowWindow($h, 5) }
      [void][WinFocus2]::SetForegroundWindow($h)
      $script:found = $true
      return $false
    }
    return $true
  }, [IntPtr]::Zero)
  return $script:found
}

function Get-AssistantElectron {
  Get-CimInstance Win32_Process -Filter "name='electron.exe'" | Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -like "*xhs-shipping-assistant*" -or
      $_.CommandLine -like "*dist-electron\main*"
    ) -and ($_.CommandLine -notlike "*--type=*")
  }
}

function Get-LatestSourceWriteTime {
  $paths = @(
    (Join-Path $Root "electron"),
    (Join-Path $Root "src"),
    (Join-Path $Root "resources\inject-scripts")
  )
  $latest = Get-Date 0
  foreach ($p in $paths) {
    if (-not (Test-Path $p)) { continue }
    Get-ChildItem $p -Recurse -File -Include *.ts,*.js,*.vue,*.css -ErrorAction SilentlyContinue |
      ForEach-Object {
        if ($_.LastWriteTime -gt $latest) { $latest = $_.LastWriteTime }
      }
  }
  return $latest
}

function Ensure-FreshBuild {
  $mainJs = Join-Path $Root "dist-electron\main.js"
  $needBuild = $false
  if (-not (Test-Path $mainJs)) {
    $needBuild = $true
  } else {
    $distTime = (Get-Item $mainJs).LastWriteTime
    $srcTime = Get-LatestSourceWriteTime
    if ($srcTime -gt $distTime.AddSeconds(2)) {
      $needBuild = $true
      Write-Host "[launcher] source newer than dist ($srcTime > $distTime), rebuilding..."
    }
  }
  if ($needBuild) {
    & npx vite build
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[launcher] vite build failed, exit=$LASTEXITCODE"
      exit 1
    }
  }
}

# 已在运行时：先彻底退出再启动，否则会一直复用旧进程
$running = @(Get-AssistantElectron)
if ($running.Count -gt 0) {
  foreach ($proc in $running) {
    try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
  Get-CimInstance Win32_Process -Filter "name='electron.exe'" | Where-Object {
    $_.CommandLine -and ($_.CommandLine -like "*xhs-shipping-assistant*")
  } | ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Seconds 2
}

Remove-Item Env:\VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue
Ensure-FreshBuild

if (Test-Path $Ele) {
  Start-Process -FilePath $Ele -ArgumentList "." -WorkingDirectory $Root
  Start-Sleep -Seconds 2
  [void](Focus-AssistantWindow $MainTitle)
  exit 0
}

Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run electron:dev" -WorkingDirectory $Root -WindowStyle Minimized
Start-Sleep -Seconds 10
[void](Focus-AssistantWindow $MainTitle)
