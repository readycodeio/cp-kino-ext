#!/bin/bash
# Double-click in Finder to start the Kino bridge. Keep this window open while you use the panels;
# press Ctrl+C here to stop it.
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
