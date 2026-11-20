@echo off
rem Double-click: sets everything up and installs the bridge as a background start at sign-in.
rem You can close this window when it is done. Run it again after updating the repo.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.6 or newer is needed. Install it with: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)
node scripts\setup.mjs
echo.
pause
