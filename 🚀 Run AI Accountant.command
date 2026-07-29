#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  🚀  AI Accountant — One-Click Launcher
# ═══════════════════════════════════════════════════════════════════
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    [ ! -z "$BACKEND_PID" ]  && kill $BACKEND_PID  2>/dev/null
    [ ! -z "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
    echo "👋 Done. See you next time!"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   📊  AI Accountant  —  الوحش المحاسبي           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1️⃣  Backend (FastAPI) ──────────────────────────────────────────
echo "⚙️  Starting Python Backend on port 8000..."
cd "$DIR/backend"

# Copy .env from project root into backend if not already present
if [ ! -f ".env" ] && [ -f "$DIR/.env" ]; then
    cp "$DIR/.env" .
fi

# Detect venv using uvicorn presence (works with any Python version)
if [ ! -f "venv/bin/uvicorn" ]; then
    echo "   📦 Creating virtual environment..."
    rm -rf venv
    python3 -m venv venv
    ./venv/bin/python3 -m pip install --upgrade pip -q
    ./venv/bin/python3 -m pip install -r requirements.txt -q
fi

# Kill any stale processes holding port 8000
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
sleep 1

./venv/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

for i in $(seq 1 30); do
    curl -s http://127.0.0.1:8000/ > /dev/null && break
    printf '.'
    sleep 1
done
echo ""
echo "✅ Backend is UP on http://127.0.0.1:8000"

# ── 2️⃣  Frontend (Vite) ────────────────────────────────────────────
echo ""
echo "⚙️  Starting React Frontend..."
cd "$DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo "   📦 Installing npm packages..."
    npm install -q
fi

npm run dev &
FRONTEND_PID=$!

FRONTEND_PORT=3000
for i in $(seq 1 30); do
    curl -s http://localhost:3000/ > /dev/null && { FRONTEND_PORT=3000; break; }
    curl -s http://localhost:3001/ > /dev/null && { FRONTEND_PORT=3001; break; }
    printf '.'
    sleep 1
done
echo ""
echo "✅ Frontend is UP on http://localhost:$FRONTEND_PORT"

# ── 3️⃣  Open Chrome ────────────────────────────────────────────────
echo ""
echo "🌐 Opening Chrome..."
open -a "Google Chrome" "http://localhost:$FRONTEND_PORT/"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ AI Accountant is RUNNING!                    ║"
echo "║                                                  ║"
echo "║  🌐 App:      http://localhost:$FRONTEND_PORT             ║"
echo "║  🐍 Backend:  http://127.0.0.1:8000              ║"
echo "║                                                  ║"
echo "║  ❌ Close this window to stop everything         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

wait $BACKEND_PID $FRONTEND_PID
