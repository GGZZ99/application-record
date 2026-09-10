@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo  应聘记录 启动
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
  echo.
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
  echo [信息] 服务已在运行。
  goto :open_browser
)

echo [信息] 正在后台启动服务...
wscript //nologo "%~dp0start-hidden.vbs" "%NODE_EXE%"
if errorlevel 1 (
  echo [错误] 无法启动后台服务（wscript / start-hidden.vbs 失败）。
  echo 详情见 start.log
  echo.
  pause
  exit /b 1
)

set "READY=0"
for /l %%n in (1,1,20) do (
  netstat -ano | findstr /C:"127.0.0.1:8787" | findstr /C:"LISTENING" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto :started
  )
  echo [信息] 等待服务就绪 %%n/20 ...
  timeout /t 1 /nobreak >nul
)

:started
if not "%READY%"=="1" (
  echo [错误] 20 秒内未能在 127.0.0.1:8787 等到服务。
  echo 请确认 Node.js 可用，或查看是否被防火墙拦截。
  echo.
  pause
  exit /b 1
)
echo [信息] 服务已就绪：http://127.0.0.1:8787/

:open_browser
echo [信息] 正在用 Chrome 打开前端...
wscript //nologo "%~dp0open-browser.vbs"
if errorlevel 1 (
  echo [错误] 打开浏览器失败。请手动访问：http://127.0.0.1:8787/
  echo 详细日志：%~dp0start.log
  echo.
  pause
  exit /b 1
)

echo [成功] 已请求 Chrome 打开 http://127.0.0.1:8787/
echo [信息] 关闭本窗口不影响服务。停止请运行 stop.bat
echo [信息] 若页面没出现，请看 start.log
echo.
echo 窗口将在 8 秒后关闭（方便查看是否有报错）...
timeout /t 8
exit /b 0
