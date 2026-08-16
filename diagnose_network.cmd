@echo off
setlocal

cd /d "%~dp0"

set "VENV_PY=.venv\Scripts\python.exe"

echo Checking Python environment...
if not exist "%VENV_PY%" (
  echo .venv was not found. Run start.cmd first to create it.
  pause
  exit /b 1
)

echo.
echo [1/4] Python version
"%VENV_PY%" --version

echo.
echo [2/4] pip version
"%VENV_PY%" -m pip --version

echo.
echo [3/4] Testing HTTPS socket to official PyPI
"%VENV_PY%" -c "import urllib.request; print(urllib.request.urlopen('https://pypi.org/simple/edge-tts/', timeout=15).status)"

echo.
echo [4/4] Testing pip against official PyPI
"%VENV_PY%" -m pip install edge-tts --dry-run -i https://pypi.org/simple

echo.
echo Done.
pause
