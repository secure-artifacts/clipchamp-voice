@echo off
setlocal

cd /d "%~dp0"

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PIP_NO_COLOR=1"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
set "HOST=127.0.0.1"
set "PORT=8000"
set "VENV_PY=.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
  echo [1/4] Creating Python virtual environment...
  python -m venv .venv
  if errorlevel 1 py -3 -m venv .venv
)

if not exist "%VENV_PY%" (
  echo Could not find .venv\Scripts\python.exe.
  echo Please install Python 3.10+ and run this file again.
  pause
  exit /b 1
)

echo [2/4] Installing/updating web dependencies from official PyPI...
"%VENV_PY%" -m pip install --upgrade --disable-pip-version-check -r requirements.txt -i https://pypi.org/simple
if errorlevel 1 (
  echo.
  echo Dependency install failed. This script uses official PyPI: https://pypi.org/simple
  echo If Windows blocks Python sockets, allow .venv\Scripts\python.exe through firewall.
  pause
  exit /b 1
)

echo [3/4] Opening browser web version...
start "" "http://%HOST%:%PORT%"

echo [4/4] Starting web server...
echo Press Ctrl+C to stop.
"%VENV_PY%" -m uvicorn server:app --reload --host %HOST% --port %PORT%

pause
