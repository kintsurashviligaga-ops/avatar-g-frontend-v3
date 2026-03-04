import { NextRequest, NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{ locale: string }>;
};

function buildRedirectUrl(request: NextRequest): URL {
  const url = new URL('/auth/callback', request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url;
}

export async function GET(request: NextRequest, _context: RouteContext) {
  return NextResponse.redirect(buildRedirectUrl(request));
}

export async function POST(request: NextRequest, _context: RouteContext) {
  return NextResponse.redirect(buildRedirectUrl(request));
}
