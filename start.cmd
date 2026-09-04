@echo off
setlocal
cd /d "%~dp0"

if exist "ClipchampVoiceStudio.exe" (
  start "" "%CD%\ClipchampVoiceStudio.exe"
  exit /b 0
)

if exist "js-desktop\dist\ClipchampVoiceStudio.exe" (
  start "" "%CD%\js-desktop\dist\ClipchampVoiceStudio.exe"
  exit /b 0
)

call "js-desktop\start.cmd"
