#!/bin/bash

# =============================================================================
# fix_venv.command - إصلاح بيئة Python الافتراضية لـ AI Accountant
# =============================================================================

set -e  # توقف عند أي خطأ

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║ 🔧 AI Accountant - إصلاح بيئة Python (venv)            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# التحقق من المسار
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"

echo "📁 المسار: ${BACKEND_DIR}"
echo ""

# 1. مسح الـ venv القديم (إن وجد)
echo "🧹 مسح الـ venv القديم..."
if [ -d "${BACKEND_DIR}/venv" ]; then
    rm -rf "${BACKEND_DIR}/venv"
    echo "✅ تم مسح venv القديم"
else
    echo "ℹ️ لا يوجد venv قديم للمسح"
fi
echo ""

# 2. إنشاء venv جديد
echo "🆕 إنشاء venv جديد..."
cd "${BACKEND_DIR}"
python3 -m venv venv
echo "✅ تم إنشاء venv جديد"
echo ""

# 3. تثبيت pip (إن لزم الأمر)
echo "📦 تثبيت/ترقية pip..."
"${BACKEND_DIR}/venv/bin/python3" -m ensurepip --upgrade 2>/dev/null || true
echo "✅ pip جاهز"
echo ""

# 4. تثبيت المتطلبات
echo "📋 تثبيت المتطلبات من requirements.txt..."
echo "⏳ قد يستغرق هذا 2-5 دقائق حسب سرعة الإنترنت..."
echo ""
"${BACKEND_DIR}/venv/bin/python3" -m pip install --quiet -r requirements.txt 2>&1 | while read line; do
    if [[ "$line" == *"Successfully installed"* ]]; then
        echo "✅ $line"
    elif [[ "$line" == *"Requirement already satisfied"* ]]; then
        echo "✅ $line"
    elif [[ "$line" == *"ERROR"* ]] || [[ "$line" == *"error"* ]]; then
        echo "❌ $line"
    fi
done
echo ""

# 5. التحقق من التثبيت
echo "✅ التحقق من التثبيت..."
if "${BACKEND_DIR}/venv/bin/python3" -c "import uvicorn, fastapi; print('✅ uvicorn:', uvicorn.__version__, '| fastapi:', fastapi.__version__)" 2>/dev/null; then
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║ ✅ تم إصلاح venv بنجاح!                              ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    echo "🚀 الآن يمكنك تشغيل: ./🚀 Run AI Accountant.command"
    echo ""
else
    echo ""
    echo "❌ فشل التحقق - قد تكون هناك مشكلة في التثبيت"
    echo " محاولة حل مشكله pip..."
    "${BACKEND_DIR}/venv/bin/python3" -m pip install --force-reinstall --quiet uvicorn fastapi python-multipart
    if "${BACKEND_DIR}/venv/bin/python3" -c "import uvicorn, fastapi; print('✅ uvicorn:', uvicorn.__version__, '| fastapi:', fastapi.__version__)" 2>/dev/null; then
        echo "✅ تم حل المشكلة!"
    else
        echo "❌ لم يتم حل المشكلة - حاول تشغيل: python3 -m pip install --upgrade pip"
    fi
fi

echo ""
echo "💡 إذا واجهت مشاكل، حاول:"
echo "   cd backend && venv/bin/python3 -m pip install -r requirements.txt"
