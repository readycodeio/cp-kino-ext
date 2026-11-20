#!/bin/bash
# Double-click in Finder: sets everything up and installs the bridge as a background service.
# You can close this window when it is done. Run it again after updating the repo.
cd "$(dirname "$0")" || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20.6 or newer is needed. Install it with: brew install node"
  read -r -p "Press Enter to close."
  exit 1
fi
node scripts/setup.mjs
echo
read -r -p "Press Enter to close."
