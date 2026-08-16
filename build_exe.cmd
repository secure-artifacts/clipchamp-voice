@echo off
setlocal

cd /d "%~dp0"

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PIP_NO_COLOR=1"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
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
  echo Could not find .venv\Scripts\python.exe.
  echo Please install Python 3.10+ and run this again.
  pause
  exit /b 1
)

echo [2/4] Installing app and build dependencies from official PyPI...
"%VENV_PY%" -m pip install --disable-pip-version-check -r requirements.txt -r requirements-build.txt -i https://pypi.org/simple
if errorlevel 1 goto install_failed

echo [3/4] Building ClipchampTTS.exe...
"%VENV_PY%" -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onefile ^
  --windowed ^
  --name ClipchampTTS ^
  --add-data "index.html;." ^
  --collect-all edge_tts ^
  --collect-all fastapi ^
  --collect-all starlette ^
  --collect-all pydantic ^
  --collect-all uvicorn ^
  --hidden-import uvicorn.protocols.http.h11_impl ^
  --hidden-import uvicorn.loops.auto ^
  --hidden-import uvicorn.lifespan.on ^
  desktop_launcher.py
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo [4/4] Done.
echo EXE path: %CD%\dist\ClipchampTTS.exe
pause
exit /b 0

:install_failed
echo.
echo Dependency install failed. This uses official PyPI: https://pypi.org/simple
echo If you see WinError 10013, Windows firewall, antivirus, VPN, proxy, or network policy is blocking Python/pip sockets.
echo Allow .venv\Scripts\python.exe through the firewall, or run this from a network that allows Python to access PyPI.
pause
exit /b 1
