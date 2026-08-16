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
  echo [1/4] Creating virtual environment...
  python -m venv .venv
  if errorlevel 1 (
    echo Failed to create .venv with python. Trying py launcher...
    py -3 -m venv .venv
  )
)

if not exist "%VENV_PY%" (
  echo.
  echo Could not find .venv\Scripts\python.exe.
  echo Please install Python 3.10+ or fix your Python launcher, then run this file again.
  pause
  exit /b 1
)

echo [2/4] Installing dependencies from official PyPI...
"%VENV_PY%" -m pip install --disable-pip-version-check -r requirements.txt -i https://pypi.org/simple
if errorlevel 1 (
  echo.
  echo Dependency install failed.
  echo This script uses official PyPI: https://pypi.org/simple
  echo If you see WinError 10013, Windows firewall, antivirus, VPN, proxy, or network policy is blocking Python/pip sockets.
  echo Run diagnose_network.cmd for a clearer check.
  pause
  exit /b 1
)

echo [3/4] Opening browser...
start "" "http://%HOST%:%PORT%"

echo [4/4] Starting server...
echo.
echo Press Ctrl+C to stop.
"%VENV_PY%" -m uvicorn server:app --reload --host %HOST% --port %PORT%

pause
