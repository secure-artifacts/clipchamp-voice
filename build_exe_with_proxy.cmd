@echo off
setlocal

cd /d "%~dp0"

set /p PROXY_URL=Enter proxy URL, for example http://127.0.0.1:7890 :
if "%PROXY_URL%"=="" (
  echo No proxy entered.
  pause
  exit /b 1
)

set "HTTP_PROXY=%PROXY_URL%"
set "HTTPS_PROXY=%PROXY_URL%"
set "http_proxy=%PROXY_URL%"
set "https_proxy=%PROXY_URL%"

call build_exe.cmd
