import { i18n } from '@/i18n.config';

const LOCALE_PREFIX_RE = /^\/([a-zA-Z-]{2,5})(?=\/|$)/;

export function getLocaleFromPathname(pathname: string): string {
  const match = pathname.match(LOCALE_PREFIX_RE);
  const maybeLocale = match?.[1]?.toLowerCase();

  if (maybeLocale && i18n.locales.includes(maybeLocale as (typeof i18n.locales)[number])) {
    return maybeLocale;
  }

  return i18n.defaultLocale;
}

export function withLocalePath(pathname: string, locale: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const cleanPath = normalizedPath === '/' ? '' : normalizedPath;
  return `/${locale}${cleanPath}`;
}
