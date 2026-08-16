@echo off
setlocal

cd /d "%~dp0"

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
set "VENV_PY=.venv\Scripts\python.exe"

echo Official Python package domains only:
echo   https://pypi.org/simple/
echo   https://files.pythonhosted.org/
echo.

echo [1/4] Checking PowerShell access to pypi.org...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'https://pypi.org/simple/' -TimeoutSec 15; Write-Host ('OK pypi.org HTTP ' + [int]$r.StatusCode) } catch { Write-Host ('FAIL pypi.org: ' + $_.Exception.Message); exit 1 }"

echo.
echo [2/4] Checking PowerShell access to files.pythonhosted.org...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'https://files.pythonhosted.org/' -TimeoutSec 15; Write-Host ('OK files.pythonhosted.org HTTP ' + [int]$r.StatusCode) } catch { Write-Host ('FAIL files.pythonhosted.org: ' + $_.Exception.Message); exit 1 }"

echo.
echo [3/4] Checking project Python...
if not exist "%VENV_PY%" (
  echo .venv python not found. Run build_exe.cmd once first.
  pause
  exit /b 1
)
"%VENV_PY%" --version

echo.
echo [4/4] Checking Python HTTPS access to official PyPI...
"%VENV_PY%" -c "import urllib.request; print(urllib.request.urlopen('https://pypi.org/simple/edge-tts/', timeout=15).status)"
if errorlevel 1 (
  echo.
  echo Python cannot access official PyPI.
  echo If steps 1-2 were OK but step 4 failed, only python.exe is blocked by firewall/antivirus.
  echo Allow this file through firewall:
  echo %CD%\.venv\Scripts\python.exe
  pause
  exit /b 1
)

echo.
echo Network diagnosis passed. Now run build_exe.cmd again.
pause
