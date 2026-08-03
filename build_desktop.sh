#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  📦  AI Accountant — Native Desktop Application Builder
# ═══════════════════════════════════════════════════════════════════
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "========================================="
echo "🛠️  Building Standalone Desktop App..."
echo "========================================="

# 1. Build React frontend static files
echo "⚙️  1. Compiling React frontend assets..."
cd "$DIR/frontend"
npm run build

# 2. Copy compiled static files to backend
echo "⚙️  2. Syncing frontend assets to backend..."
rm -rf "$DIR/backend/dist"
cp -r "$DIR/frontend/dist" "$DIR/backend/dist"

# 3. Build standalone binary with PyInstaller
echo "⚙️  3. Compiling Python bundle into native application..."
cd "$DIR/backend"

# Ensure venv packages are loaded
source venv/bin/activate

# Run PyInstaller
# --noconsole hides the black terminal window (runs as native GUI)
# --add-data bundles the static frontend and module files
pyinstaller --clean --noconsole \
  --name "AI Accountant" \
  --add-data "dist:dist" \
  --add-data "agents:agents" \
  --add-data "modules:modules" \
  --add-data "config:config" \
  --add-data "services:services" \
  --add-data ".env:." \
  gui_launcher.py

echo ""
echo "========================================="
echo "✅ BUILD COMPLETED SUCCESSFULLY!"
if [ "$(uname)" == "Darwin" ]; then
  echo "👉 Your Mac app is at: backend/dist/AI Accountant.app"
  echo "To run it, just double-click 'AI Accountant.app'!"
else
  echo "👉 Your Windows app is at: backend/dist/AI Accountant.exe"
fi
echo "========================================="
