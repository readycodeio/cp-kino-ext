@echo off
rem Double-click to run the Kino bridge in this window, with its log on screen. Keep the window open
rem while you use the panels; Ctrl+C stops it. For a bridge that runs in the background and starts at
rem sign-in, use setup.cmd instead.
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
