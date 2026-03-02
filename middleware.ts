import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const SUPPORTED_LOCALES = ['ka', 'en', 'ru'];
const DEFAULT_LOCALE = 'ka';

/**
 * Root middleware:
 * 1. Redirects bare paths (no locale prefix) → /ka/... (or detected locale)
 * 2. Refreshes Supabase auth cookies on every request.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

    // If first segment is not a supported locale → redirect to /ka/...
    if (!SUPPORTED_LOCALES.includes(firstSegment)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`;
      return NextResponse.redirect(url);
    }
  }

  const { response } = await updateSession(request);
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
