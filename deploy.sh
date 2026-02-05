# ჩააკოპირეთ სკრიპტი შეინახეთ: Ctrl+O, Enter, Ctrl+X 
# გაუშვით
bash deploy.sh
#!/bin/bash
echo "🚀 AVATAR G EXECUTIVE - DEPLOYMENT" echo 
"=================================="
# Phase 1: Dependencies
echo "📦 Installing dependencies..." npm install three 
@react-three/fiber @react-three/drei next-intl uuid 
framer-motion npm install -D @types/three @types/uuid 
echo "✅ Dependencies installed"
