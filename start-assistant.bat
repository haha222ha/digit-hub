@echo off
chcp 65001 >nul
cd /d D:\eva\xhs-shipping-assistant

REM 已有 electron 主进程：唤起单实例（第二实例会退出并前置主窗）
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq electron.exe" /FO LIST ^| find "PID:"') do (
  wmic process where "ProcessId=%%a" get CommandLine 2>nul | find /I "xhs-shipping-assistant" | find /V "--type=" >nul
  if not errorlevel 1 (
    set VITE_DEV_SERVER_URL=http://localhost:5173/
    start "" "%CD%\node_modules\electron\dist\electron.exe" .
    exit /b 0
  )
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if not errorlevel 1 (
  set VITE_DEV_SERVER_URL=http://localhost:5173/
  start "" "%CD%\node_modules\electron\dist\electron.exe" .
  exit /b 0
)

start "xhs-shipping-assistant" /min cmd /c "npm run electron:dev"
