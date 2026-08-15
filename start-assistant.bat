@echo off
chcp 65001 >nul
cd /d D:\eva\xhs-shipping-assistant

REM 用 PowerShell 启动：已运行则只唤起主窗，避免第二实例秒退被当成闪退
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\start-assistant.ps1"
exit /b %ERRORLEVEL%
