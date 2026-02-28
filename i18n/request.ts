import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // 1. Try next-intl's own locale detection (from [locale] segment)
  let locale = await requestLocale;

  // 2. Fall back to NEXT_LOCALE cookie (set by LanguageSwitcher)
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    try {
      const cookieStore = cookies();
      const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
      if (cookieLocale && routing.locales.includes(cookieLocale as (typeof routing.locales)[number])) {
        locale = cookieLocale;
      }
    } catch {
      // cookies() may fail in some contexts
    }
  }

  // 3. Final fallback to default locale
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
