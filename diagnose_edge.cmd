@echo off
setlocal
cd /d "%~dp0"

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "EDGE_TEST_MP3=%TEMP%\clipchamp_edge_diag.mp3"

echo [1/4] Checking Microsoft Edge-TTS voice list with PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $u='https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4'; $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 20; Write-Output ('OK voice list HTTP ' + $r.StatusCode) } catch { Write-Output ('FAIL PowerShell network: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 goto failed

echo.
echo [2/4] Checking Python web backend edge-tts...
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -c "import asyncio, pathlib, edge_tts; out=pathlib.Path(r'%EDGE_TEST_MP3%'); asyncio.run(edge_tts.Communicate(text='hello python edge test', voice='en-US-AvaMultilingualNeural', rate='+0%', pitch='+0Hz').save(str(out))); print('OK python edge-tts bytes=' + str(out.stat().st_size)); out.unlink(missing_ok=True)"
  if errorlevel 1 goto failed
) else (
  echo SKIP Python venv not found. Run start_web.cmd first if you need web version.
)

echo.
echo [3/4] Checking JavaScript desktop Node Edge-TTS...
if exist "js-desktop\node_modules\ws\index.js" (
  cd /d "%~dp0js-desktop"
  node -e "const fs=require('fs'); const t=require('./src/edge-tts-node'); (async()=>{const b=await t.synthesize('hello node edge test',{voice:'en-US-AvaMultilingualNeural',rate:'+0%',pitch:'+0Hz'},{timeoutMs:45000}); console.log('OK node edge-tts bytes=' + b.length)})().catch(e=>{console.error('FAIL node edge-tts: ' + e.message); process.exit(1)})"
  if errorlevel 1 goto failed
  cd /d "%~dp0"
) else (
  echo SKIP Node dependencies not found. Run js-desktop\start.cmd once first.
)

echo.
echo [4/4] Result: Edge-TTS connection works on this computer.
pause
exit /b 0

:failed
echo.
echo Result: Edge-TTS check failed. Check VPN/network, Windows firewall, system time, or wait if Microsoft rate-limited the IP.
pause
exit /b 1
