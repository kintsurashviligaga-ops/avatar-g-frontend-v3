# Avatar G - i18n Implementation Guide

## 📋 Overview

This guide shows how to implement complete i18n support with next-intl in Avatar G. Default language is **Georgian (ka)**, with English (en) and Russian (ru) as alternatives.

## 🗂️ Folder Structure

```
avatar-g-frontend-v3/
├── i18n.config.ts                 # i18n configuration
├── middleware.ts                  # Locale detection & routing (UPDATED)
├── messages/
│   ├── ka.json                    # Georgian translations
│   ├── en.json                    # English translations
│   └── ru.json                    # Russian translations (NEW)
│
├── app/
│   ├── page.tsx                   # Root redirect to /ka (NEW)
│   ├── [locale]/
│   │   ├── layout.tsx             # Localized layout with NextIntlClientProvider (NEW)
│   │   ├── page.tsx               # Localized home page (EXAMPLE)
│   │   ├── pricing/
│   │   │   └── page.tsx           # Pricing page with i18n (EXAMPLE)
│   │   ├── services/
│   │   │   └── avatar-builder/
│   │   │       └── page.tsx       # Avatar Builder with i18n (TODO)
│   │   └── ...
│   └── layout.tsx                 # Root layout (KEPT for non-locale routes)
│
├── components/
│   ├── LanguageSwitcher.tsx       # Language switcher (UPDATED to use next-intl)
│   └── ...
│
└── lib/
    ├── i18n/
    │   ├── config.ts              # (Legacy, can be kept for other purposes)
    │   ├── LanguageContext.tsx    # (Legacy, being phased out)
    │   └── translations.ts        # (Legacy, reference only)
    └── ...
```

## 🔧 Implementation Steps

### Step 1: Middleware Setup
**File:** `middleware.ts` ✅ DONE

The middleware:
- Calls `intlMiddleware()` first to handle i18n routing
- Keeps existing CORS handling
- Routes all requests through locale detection
- Default locale: `ka`
- Locales: `ka`, `en`, `ru`

### Step 2: Configuration
**File:** `i18n.config.ts` ✅ EXISTS

```typescript
export const i18n = {
  defaultLocale: "ka",
  locales: ["ka", "en", "ru"],
} as const;
```

### Step 3: Message Files
**Files:** `messages/ka.json`, `messages/en.json`, `messages/ru.json` ✅ DONE

Structure:
```json
{
  "navigation": { ... },
  "hero": { ... },
  "services": { ... },
  "subscription": { ... },
  "avatar": { ... }
}
```

### Step 4: Root Page Redirect
**File:** `app/page.tsx` ✅ DONE

Redirects `/` to `/{locale}` (default: `/ka`)

### Step 5: Localized Layout
**File:** `app/[locale]/layout.tsx` ✅ DONE

Wraps content with `NextIntlClientProvider`:
```tsx
<html lang={locale}>
  <body>
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  </body>
</html>
```

### Step 6: Language Switcher
**File:** `components/LanguageSwitcher.tsx` ✅ UPDATED

Uses `useLocale()` and `useRouter()` from next-intl for translation switching.

**Location in UI:** Add to header/navbar

### Step 7: Converting Pages to Use Translations

#### Example 1: Pricing Page
**File:** `app/[locale]/pricing/page.tsx` ✅ EXAMPLE CREATED

Usage:
```tsx
'use client';

import { useTranslations } from 'next-intl';

export default function PricingPage() {
  const t = useTranslations();
  
  return (
    <h1>{t('subscription.chooseYourPlan')}</h1>
    <button>{t('subscription.subscribe')}</button>
  );
}
```

#### Example 2: Avatar Builder Page
**TODO: Convert from `/app/services/avatar-builder/page.tsx`**

Replace:
```tsx
// OLD (using LanguageContext)
import { useLanguage } from '@/lib/i18n/LanguageContext';
const { t } = useLanguage();
```

With:
```tsx
// NEW (using next-intl)
'use client';
import { useTranslations } from 'next-intl';
const t = useTranslations();
```

### Step 8: Update Old Pages

For pages that are NOT in the `[locale]` folder yet, move them:

1. **Move page file:**
   ```
   /app/services/avatar-builder/page.tsx
   ↓
   /app/[locale]/services/avatar-builder/page.tsx
   ```

2. **Update imports:**
   - Remove old `useLanguage()` hook
   - Add `'use client'` if needed
   - Add `useTranslations()` from 'next-intl'

3. **Replace hardcoded strings:**
   ```tsx
   // OLD
   <h1>ავატარის შექმნა</h1>
   
   // NEW
   <h1>{t('avatar.title')}</h1>
   ```

## 📝 Key Files Reference

### middleware.ts
Combines i18n routing with CORS handling:
- Calls `intlMiddleware()` first
- Routes: `/((?!_next|_vercel|.*\..*).*)`  → App Router pages
- Routes: `/api/:path*` → API routes

### messages files
Structure pattern:
```json
{
  "feature.action": "Georgian text"
}
```

Examples:
- `navigation.services` → "სერვისები"
- `avatar.title` → "ავატარის შექმნა"
- `subscription.monthly` → "თვეში"

### [locale]/layout.tsx
Key points:
- Gets locale from `params`
- Validates locale exists
- Fetches messages with `getMessages()`
- Wraps with `NextIntlClientProvider`

## 🚀 Usage Examples

### In Server Components
```tsx
import { getTranslations } from 'next-intl/server';

export default async function MyPage() {
  const t = await getTranslations();
  return <h1>{t('translation.key')}</h1>;
}
```

### In Client Components (with 'use client')
```tsx
'use client';
import { useTranslations } from 'next-intl';

export default function MyComponent() {
  const t = useTranslations();
  return <button>{t('btn.submit')}</button>;
}
```

### Getting Current Locale
```tsx
'use client';
import { useLocale } from 'next-intl';

export default function MyComponent() {
  const locale = useLocale();
  
  if (locale === 'ka') {
    // Georgian-specific logic
  }
}
```

### Language Switcher
Already implemented in `components/LanguageSwitcher.tsx`. Add to header:

```tsx
import LanguageSwitcher from '@/components/LanguageSwitcher';

export function Header() {
  return (
    <header>
      <nav>
        {/* other nav items */}
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
```

## ✅ Verification Checklist

- [x] Middleware updated with i18n routing
- [x] i18n.config.ts has correct default locale (ka)
- [x] messages/ka.json, en.json, ru.json created
- [x] app/page.tsx redirects to /ka
- [x] app/[locale]/layout.tsx created with NextIntlClientProvider
- [x] LanguageSwitcher updated to use next-intl
- [x] Example pricing page created with translations
- [ ] Convert Avatar Builder to use next-intl
- [ ] Convert other key pages (/pay, /dashboard, etc.)
- [ ] Update header/navbar to include LanguageSwitcher
- [ ] Test locale switching in browser
- [ ] Test "/" redirects to "/ka"
- [ ] Verify back button preserves locale

## 🧪 Testing

### Test 1: Root Redirect
```
Visit: http://localhost:3000
Expected: Redirect to http://localhost:3000/ka
```

### Test 2: Locale Switching
```
1. Visit http://localhost:3000/ka
2. Click language switcher
3. Select "English"
4. Expected: Navigate to http://localhost:3000/en
```

### Test 3: Translation Rendering
```
1. Visit http://localhost:3000/ka/pricing
2. Verify Georgian text shows
3. Switch to /en/pricing
4. Verify English text shows
```

### Test 4: Browser Back Button
```
1. Visit /ka
2. Switch to /en
3. Click browser back
4. Expected: Should go back to /ka
```

## 🔄 Migration Path

### Phase 1: ✅ Infrastructure (DONE TODAY)
- Middleware setup
- i18n config
- Message files
- Root redirect
- Locale layout

### Phase 2: Core Pages
1. Avatar Builder (/services/avatar-builder)
2. Payment page (/pay)
3. Dashboard (/dashboard)
4. Services listing (/services)

### Phase 3: Components
1. Navbar/Header
2. Footer
3. Cards
4. Modals
5. Forms

### Phase 4: Full Migration
- All pages use [locale] route
- All hardcoded strings removed
- Full test coverage

## 📚 Resources

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [next-intl App Router Guide](https://next-intl-docs.vercel.app/docs/next-13-app-router)
- [useTranslations Hook](https://next-intl-docs.vercel.app/docs/usage/use-translations)

## 💡 Best Practices

1. **Always use translation keys**
   - ✅ Good: `t('avatar.title')`
   - ❌ Bad: Hardcoded "ავატარის შექმნა"

2. **Keep messages organized**
   - Group by feature/page
   - Use dot notation for hierarchy

3. **Provide context in translation files**
   - Add comments for translators
   - Use consistent terminology

4. **Handle dynamic content**
   ```tsx
   // Variables in translations
   t('greeting', { name: userName })
   // Message: "Hello {name}!"
   ```

5. **Test all locales**
   - Georgian (ka) - Primary
   - English (en) - Test UI translations
   - Russian (ru) - Test RTL considerations (if added)

## 🆘 Troubleshooting

### Issue: "Locale not found" error
- Check middleware matcher includes all routes
- Verify [locale] folder exists
- Check i18n.config.ts has locale

### Issue: Translations not rendering
- Ensure component has 'use client' if using useTranslations()
- Check messages file has correct structure
- Verify locale exists in i18n.config.ts

### Issue: Language switcher doesn't work
- Check router push uses correct pathname format
- Ensure pathname is constructed correctly
- Check middleware is called before components

## 📞 Support

For questions:
1. Check next-intl docs
2. Review examples in pricing/page.tsx
3. Check middleware.ts for routing logic
