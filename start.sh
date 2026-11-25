#!/bin/bash
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find best compatible Python (prefer 3.12, 3.11, 3.10; Python 3.14 lacks pre-built wheels for tokenizers/PyO3)
PY_BIN=""
for cmd in python3.12 python3.11 python3.10 python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.13 python3; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ver=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")
    major=$(echo "$ver" | cut -d. -f1)
    minor=$(echo "$ver" | cut -d. -f2)
    if [ "$major" -eq 3 ] && [ "$minor" -le 13 ] && [ "$minor" -ge 10 ]; then
      PY_BIN="$cmd"
      break
    fi
  fi
done

if [ -z "$PY_BIN" ]; then
  PY_BIN="python3"
fi

echo "Using Python: $PY_BIN ($($PY_BIN --version))"
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1

# Setup venv for studio backend
if [ ! -d "$ROOT/backend/venv" ]; then
  echo "Setting up Studio Backend venv..."
  "$PY_BIN" -m venv "$ROOT/backend/venv"
  "$ROOT/backend/venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi

# Install npm dependencies if needed
if [ ! -d "$ROOT/node_modules" ]; then
  echo "Installing Electron dependencies..."
  cd "$ROOT" && npm install
fi

# Ensure Electron binary is extracted
if [ ! -f "$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ] && [ ! -f "$ROOT/node_modules/electron/dist/electron" ] && [ ! -f "$ROOT/node_modules/electron/dist/electron.exe" ]; then
  echo "Extracting Electron binary..."
  node "$ROOT/node_modules/electron/install.js"
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

# Start the Electron app (it manages all Python processes internally)
echo "Starting DRISHQAN..."
cd "$ROOT" && npm start
