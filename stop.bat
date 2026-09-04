@echo off
chcp 65001 >nul
set "KILLED="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:"127.0.0.1:8787" ^| findstr /C:"LISTENING"') do (
  taskkill /PID %%a /F >nul 2>nul
  set "KILLED=1"
)
if defined KILLED (
  echo 已停止后台服务。
) else (
  echo 服务未在运行。
)
