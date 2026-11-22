#!/bin/bash
set -e

echo "Starting Hindi Video Studio..."

# Backend
cd /Users/chandrayee/Documents/code/ecom/multilingual/hindi-video-studio/backend
pip install -r requirements.txt -q
python main.py &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Frontend
cd /Users/chandrayee/Documents/code/ecom/multilingual/hindi-video-studio/frontend
npm install -q
npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "======================================"
echo "  Hindi Video Studio is starting up"
echo "======================================"
echo "  Backend:  http://localhost:8765"
echo "  Frontend: http://localhost:5173"
echo ""
echo "  Open http://localhost:5173 in your browser."
echo "  For Electron: run 'npm start' in the project root."
echo ""
echo "  Press Ctrl+C to stop all services."
echo "======================================"

# Cleanup on exit
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
