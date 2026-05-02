import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const SUPPORTED_LOCALES = ['ka', 'en', 'ru'];
const DEFAULT_LOCALE = 'ka';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getPreferredLocale(request: NextRequest) {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  return cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)
    ? cookieLocale
    : DEFAULT_LOCALE;
}

/**
 * Root middleware:
 * / and locale roots → /{locale}/dashboard  (single-window chatbot)
 * Paths without locale prefix → /{locale}/path
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const preferredLocale = getPreferredLocale(request);

  const isSkipped =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/brand/') ||
    pathname.startsWith('/placeholders/') ||
    pathname.startsWith('/previews/') ||
    pathname.startsWith('/auth/callback') ||
    /\.\w{2,5}$/.test(pathname);

  if (!isSkipped) {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0] ?? '';

    // Bare root → /{locale}/dashboard
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = `/${preferredLocale}/dashboard`;
      const response = NextResponse.redirect(url);
      response.cookies.set('NEXT_LOCALE', preferredLocale, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });
      return response;
    }

    // Locale root (e.g. /ka, /en, /ru) → /{locale}/dashboard
    if (SUPPORTED_LOCALES.includes(firstSegment) && segments.length === 1) {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment}/dashboard`;
      const response = NextResponse.redirect(url);
      response.cookies.set('NEXT_LOCALE', firstSegment, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });
      return response;
    }

    // Path without locale prefix → /{preferredLocale}/path
    if (!SUPPORTED_LOCALES.includes(firstSegment)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${preferredLocale}${pathname}`;
      const response = NextResponse.redirect(url);
      response.cookies.set('NEXT_LOCALE', preferredLocale, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });
      return response;
    }
  }

  const { response } = await updateSession(request);

  const segments = pathname.split('/').filter(Boolean);
  const activeLocale = segments[0] && SUPPORTED_LOCALES.includes(segments[0])
    ? segments[0]
    : preferredLocale;

  response.cookies.set('NEXT_LOCALE', activeLocale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  });

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|brand/|placeholders/|api/webhooks).*)',
  ],
};
