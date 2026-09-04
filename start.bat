@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

for /f "delims=" %%i in ('where node') do (
  set "NODE_EXE=%%i"
  goto :got_node
)
:got_node

netstat -ano | findstr /C:"127.0.0.1:8787" | findstr /C:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo 服务已在后台运行，正在打开浏览器...
  start "" "http://127.0.0.1:8787"
  goto :eof
)

echo 正在后台启动应聘记录...
wscript //nologo "%~dp0start-hidden.vbs" "%NODE_EXE%"

set "READY=0"
for /l %%n in (1,1,15) do (
  netstat -ano | findstr /C:"127.0.0.1:8787" | findstr /C:"LISTENING" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto :started
  )
  timeout /t 1 /nobreak >nul
)

:started
if "%READY%"=="1" (
  start "" "http://127.0.0.1:8787"
  echo 已在后台运行。关闭本窗口不影响服务。
  echo 停止请运行 stop.bat
) else (
  echo 启动失败，请检查 Node.js 是否可用。
  pause
  exit /b 1
)
