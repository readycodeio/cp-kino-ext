@echo off
rem Double-click to start the Kino bridge. Keep this window open while you use the panels;
rem press Ctrl+C here to stop it.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.6 or newer is needed. Install it with: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    echo npm ci failed.
    pause
    exit /b 1
  )
)
node bridge\server.mjs
pause
