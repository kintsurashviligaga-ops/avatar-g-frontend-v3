import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const legacyPathMap: Record<string, string> = {
  '/avatar-builder': '/services/avatar-builder',
  '/music-studio': '/services/music-studio',
  '/video-studio': '/services/video-studio',
  '/voice-lab': '/services/voice-lab',
  '/marketplace': '/services/marketplace',
};

export default function middleware(request: NextRequest) {
  const mappedPath = legacyPathMap[request.nextUrl.pathname];
  if (mappedPath) {
    const url = request.nextUrl.clone();
    url.pathname = `/${routing.defaultLocale}${mappedPath}`;
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
