@echo off
setlocal

cd /d "%~dp0"

if exist .venv (
  for /f "tokens=1-3 delims=/.- " %%a in ("%date%") do set "DATEPART=%%c%%b%%a"
  for /f "tokens=1-3 delims=:., " %%a in ("%time%") do set "TIMEPART=%%a%%b%%c"
  set "BACKUP=.venv_old_%DATEPART%_%TIMEPART%"
  echo Renaming .venv to %BACKUP%
  ren .venv "%BACKUP%"
) else (
  echo .venv does not exist.
)

echo Done. Run build_exe.cmd again to create a fresh .venv.
pause
