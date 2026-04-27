import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const SUPPORTED_LOCALES = ['ka', 'en', 'ru'];
const DEFAULT_LOCALE = 'ka';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getLocaleDashboardPath(locale: string) {
  return `/${locale}/dashboard`;
}

function getPreferredLocale(request: NextRequest) {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  return cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)
    ? cookieLocale
    : DEFAULT_LOCALE;
}

/**
 * Root middleware:
 * 1. Redirects bare paths (no locale prefix) → /ka/... (or detected locale)
 * 2. Refreshes Supabase auth cookies on every request.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const preferredLocale = getPreferredLocale(request);

  // Skip locale redirect for API routes, static assets, auth callbacks, and files with extensions
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

    // Redirect locale root (e.g. /en, /ka) straight to dashboard
    if (segments.length === 1 && SUPPORTED_LOCALES.includes(firstSegment)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment}/dashboard`;
      return NextResponse.redirect(url);
    }

    // If first segment is not a supported locale → redirect to /{preferredLocale}/...
    if (!SUPPORTED_LOCALES.includes(firstSegment)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${preferredLocale}${pathname === '/' ? '' : pathname}`;

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
    /*
     * Match all paths except:
     * - _next/static (static assets)
     * - _next/image  (image optimisation)
     * - favicon.ico, brand/, placeholders/ (public assets)
     * - api/webhooks (Stripe webhooks must not have cookies tampered with)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|brand/|placeholders/|api/webhooks).*)',
  ],
};
