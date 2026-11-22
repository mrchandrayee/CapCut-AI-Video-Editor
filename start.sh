#!/bin/bash
set -e
ROOT="/Users/chandrayee/Documents/code/ecom/multilingual/hindi-video-studio"

# Setup venv for videostudio engine
if [ ! -d "$ROOT/engines/videostudio/venv" ]; then
  echo "Setting up Video Engine venv..."
  python3 -m venv "$ROOT/engines/videostudio/venv"
  "$ROOT/engines/videostudio/venv/bin/pip" install -r "$ROOT/engines/videostudio/requirements.txt"
fi

# Setup venv for vexyl-tts engine
if [ ! -d "$ROOT/engines/vexyl-tts/venv" ]; then
  echo "Setting up Voice Engine venv..."
  python3 -m venv "$ROOT/engines/vexyl-tts/venv"
  "$ROOT/engines/vexyl-tts/venv/bin/pip" install -r "$ROOT/engines/vexyl-tts/requirements.txt"
fi

# Setup venv for orchestration backend
if [ ! -d "$ROOT/backend/venv" ]; then
  echo "Setting up Studio Backend venv..."
  python3 -m venv "$ROOT/backend/venv"
  "$ROOT/backend/venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi

# Install npm dependencies if needed
if [ ! -d "$ROOT/node_modules" ]; then
  echo "Installing Electron dependencies..."
  cd "$ROOT" && npm install
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

# Start the Electron app (it manages all Python processes internally)
echo "Starting Hindi Video Studio..."
cd "$ROOT" && npm start
