#!/bin/bash

echo "🚀 Fixing i18n issues..."

# Remove next-intl completely
npm uninstall next-intl 2>/dev/null || true
rm -f next-intl.config.js 2>/dev/null || true
rm -f middleware.ts 2>/dev/null || true
rm -f middleware.js 2>/dev/null || true

# Remove old i18n lib files
rm -f lib/i18n/LanguageContext.tsx 2>/dev/null || true
rm -f lib/i18n/config.ts 2>/dev/null || true
rm -f lib/i18n/translations.ts 2>/dev/null || true

# Create simple i18n helper
mkdir -p lib/i18n
cat > lib/i18n/index.ts << 'EOF'
export type Locale = "ka" | "en" | "ru" | "de";
export const defaultLocale: Locale = "ka";
EOF

echo "✅ next-intl removed. Now run: npm run build"
