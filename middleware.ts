import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { frontDoor, hasSessionCookie } from '@/lib/routing/landing';

const SUPPORTED_LOCALES = ['ka', 'en', 'ru'];
const DEFAULT_LOCALE = 'ka';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getPreferredLocale(request: NextRequest) {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  return cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)
    ? cookieLocale
    : DEFAULT_LOCALE;
}

type UnavailableCopy = { title: string; body: string; retry: string };
const UNAVAILABLE_KA: UnavailableCopy = { title: 'სერვისი დროებით მიუწვდომელია', body: 'ტექნიკური სამუშაოები მიმდინარეობს. სცადეთ რამდენიმე წუთში.', retry: 'თავიდან ცდა' };
const UNAVAILABLE_COPY: Record<string, UnavailableCopy> = {
  ka: UNAVAILABLE_KA,
  en: { title: 'Temporarily unavailable', body: 'We are fixing a technical problem. Please try again in a few minutes.', retry: 'Try again' },
  ru: { title: 'Сервис временно недоступен', body: 'Идут технические работы. Попробуйте через несколько минут.', retry: 'Повторить' },
};

function serviceUnavailablePage(locale: string): NextResponse {
  const c = UNAVAILABLE_COPY[locale] ?? UNAVAILABLE_KA;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyAvatar.ge</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#f5f5f5;font-family:system-ui,-apple-system,sans-serif;padding:16px;box-sizing:border-box}main{max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{color:#a3a3a3;line-height:1.5;margin:0 0 24px}a{display:inline-block;padding:10px 20px;border-radius:10px;background:#f5f5f5;color:#0a0a0a;text-decoration:none;font-weight:600}</style></head><body><main><h1>${c.title}</h1><p>${c.body}</p><a href="">${c.retry}</a></main></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '60' },
  });
}

/**
 * Kill switch for the "temporarily unavailable" page: SUPABASE_UNAVAILABLE_PAGE=off goes back to failing open.
 * The browser suites set it: they run `next dev` against a fake Supabase host the page's own requests are mocked
 * for, so the server-side session check can never reach it — without the switch every signed-in page there is the 503.
 */
function unavailablePageEnabled(): boolean {
  return !/^(0|off|false|no)$/i.test((process.env.SUPABASE_UNAVAILABLE_PAGE || '').trim());
}

/**
 * Root middleware:
 * / and locale roots → the marketing landing for guests, /{locale}/dashboard for signed-in visitors
 *   (lib/routing/landing.ts — the dashboard itself is unchanged).
 * /{locale}/landing (retired) → /{locale}.
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
    pathname.startsWith('/share/') ||   // Public share pages — no locale redirect
    // PWA / SEO surfaces that browsers fetch from the root with no locale.
    // Without these, /manifest.webmanifest gets 307-redirected to /ka/...
    // and PWA install fails.
    pathname === '/manifest.webmanifest' ||
    pathname === '/manifest.json' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/sw.js' ||
    pathname === '/.well-known' ||
    pathname.startsWith('/.well-known/') ||
    /\.\w{2,11}$/.test(pathname);    // widened: covers .webmanifest (11) and similar long-tail file ext

  if (!isSkipped) {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0] ?? '';

    // Front doors: `/`, `/{locale}` and the retired `/{locale}/landing`. Guests get the landing; a signed-in
    // visitor keeps going straight to the dashboard, as before (lib/routing/landing.ts).
    const door = frontDoor(pathname, hasSessionCookie(request.cookies.getAll()), preferredLocale);
    if (door && 'redirect' in door) {
      const url = request.nextUrl.clone();
      url.pathname = door.redirect;
      const response = NextResponse.redirect(url);
      response.cookies.set('NEXT_LOCALE', door.redirect.split('/')[1] ?? preferredLocale, {
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

  const { response, authUnavailable } = await updateSession(request);

  // Supabase unreachable for a signed-in visitor: every page behind this would hang on its own database
  // calls until the function timeout. Answer page navigations at once with a light "temporarily
  // unavailable" page (503, retried by reload). API routes keep failing open and answer for themselves.
  if (authUnavailable && unavailablePageEnabled() && !pathname.startsWith('/api/') && request.method === 'GET'
    && (request.headers.get('accept') ?? '').includes('text/html')) {
    return serviceUnavailablePage(preferredLocale);
  }

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
    // templates/ + avatars/ are static images (public/); a session refresh + NEXT_LOCALE cookie on every thumbnail
    // request was pure cost (a Supabase getUser round-trip per image for signed-in visitors). No page lives there.
    '/((?!_next/static|_next/image|favicon\\.ico|brand/|placeholders/|templates/|avatars/|api/webhooks).*)',
  ],
};
