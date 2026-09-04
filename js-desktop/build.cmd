@echo off
setlocal
cd /d "%~dp0"
set "npm_config_registry=https://registry.npmjs.org/"

if not exist node_modules (
  echo [1/3] Installing Electron dependencies from official npm...
  npm install --registry=https://registry.npmjs.org/
  if errorlevel 1 goto install_failed
)

echo [2/3] Checking JavaScript...
npm run check
if errorlevel 1 (
  echo JavaScript check failed.
  pause
  exit /b 1
)

echo [3/3] Building ClipchampVoiceStudio.exe...
npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

copy /Y "dist\ClipchampVoiceStudio.exe" "..\ClipchampVoiceStudio.exe" >nul

echo.
echo Done.
echo Software path: %CD%\dist\ClipchampVoiceStudio.exe
echo Root shortcut copy: %CD%\..\ClipchampVoiceStudio.exe
pause
exit /b 0

:install_failed
echo.
echo Dependency install failed. This script uses official npm: https://registry.npmjs.org/
echo Electron packages may also download from official GitHub/CDN sources.
echo If Windows blocks sockets, allow node.exe/npm through firewall or try another trusted network.
pause
exit /b 1
