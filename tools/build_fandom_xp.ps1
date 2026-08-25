# 从 fandom-xp-tournament-src 打包 React bundle 到 psy-dist
# Usage: powershell -ExecutionPolicy Bypass -File tools/build_fandom_xp.ps1
$ErrorActionPreference = "Stop"
$Hub = Split-Path $PSScriptRoot -Parent
$Src = if ($env:FANDOM_XP_SRC) { $env:FANDOM_XP_SRC } else { "C:\Users\Administrator\Desktop\fandom-xp-tournament-src" }
$Build = Join-Path $Src "build-digit-hub.mjs"

if (-not (Test-Path $Build)) {
  Write-Error "找不到源码目录: $Src`n请设置环境变量 FANDOM_XP_SRC 或把源码放到 Desktop\fandom-xp-tournament-src"
}

Push-Location $Src
try {
  if (-not (Test-Path "node_modules\esbuild")) {
    Write-Host "==> npm install (esbuild)"
    npm install --no-fund --no-audit 2>&1 | Out-Host
  }
  Write-Host "==> build bundle -> apps/psy-dist/tests/fandom_xp/"
  node $Build
} finally {
  Pop-Location
}

$Out = Join-Path $Hub "apps\psy-dist\tests\fandom_xp\assets\js\fandom-xp.app.js"
if (-not (Test-Path $Out)) { Write-Error "构建失败: $Out 不存在" }
Write-Host "OK -> $Out"
