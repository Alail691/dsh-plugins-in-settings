@echo off
rem dsh-plugins-in-settings 一键安装/卸载（把参数原样转给 install-profile.ps1）
rem
rem   install.cmd                 装进 desktop profile
rem   install.cmd -Profile tui    装进别的 profile
rem   install.cmd -Uninstall      卸载
rem   install.cmd -WhatIf         只看要做什么，不落盘
setlocal
set "SCRIPT=%~dp0install-profile.ps1"
where pwsh >nul 2>nul
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
)
exit /b %ERRORLEVEL%
