import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
      return NextResponse.next();
    }

    const localeMatch = pathname.match(/^\/([a-zA-Z-]{2,5})(\/|$)/);
    const localeSegment = localeMatch?.[1];
    const hasLocale = localeSegment ? ['en', 'ka'].includes(localeSegment.toLowerCase()) : false;

    if (!hasLocale && !pathname.startsWith('/api')) {
      const url = request.nextUrl.clone();
      url.pathname = `/en${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
