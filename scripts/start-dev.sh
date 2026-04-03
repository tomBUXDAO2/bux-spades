#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Starting BUX Spades dev servers..."
echo "=============================================="

echo "Cleaning up existing processes on 3000 / 5173..."
lsof -ti:3000,5173 | xargs kill -9 2>/dev/null || true
sleep 1

echo "Backend (port 3000)..."
(cd "$ROOT/server" && npm run dev) &
echo "Frontend (port 5173)..."
(cd "$ROOT/client" && npm run dev) &

echo ""
echo "Backend:  http://localhost:3000"
echo "Frontend: http://localhost:5173"
echo "Ctrl+C stops this script (child processes may need manual kill)"
echo "=============================================="
wait
