#!/bin/bash
# Double-click in Finder to run the Kino bridge in this window, with its log on screen. Keep the window
# open while you use the panels; Ctrl+C stops it. For a bridge that runs in the background and starts at
# login, use setup.command instead.
cd "$(dirname "$0")" || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20.6 or newer is needed. Install it with: brew install node"
  read -r -p "Press Enter to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci || { read -r -p "npm ci failed. Press Enter to close."; exit 1; }
fi
exec node bridge/server.mjs
