import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { i18n } from "@/i18n.config";

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith('/api')) {
      return NextResponse.next();
    }

    if (
      pathname.startsWith('/_next') ||
      pathname === '/icon' ||
      pathname === '/favicon.png' ||
      pathname === '/favicon.ico' ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml' ||
      /\.[a-zA-Z0-9]+$/.test(pathname)
    ) {
      return NextResponse.next();
    }

    const localeMatch = pathname.match(/^\/([a-zA-Z-]{2,5})(\/|$)/);
    const localeSegment = localeMatch?.[1];
    const hasLocale = localeSegment
      ? i18n.locales.includes(localeSegment.toLowerCase() as (typeof i18n.locales)[number])
      : false;

    if (!hasLocale) {
      const url = request.nextUrl.clone();
      url.pathname = `/${i18n.defaultLocale}${pathname === '/' ? '' : pathname}`;
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!api|icon|favicon.ico|favicon.png|_next/static|_next/image|robots.txt|sitemap.xml).*)'],
};
