import { NextRequest } from 'next/server';

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export function resolveSiteUrl(request?: NextRequest): string {
  const preferred =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (preferred) {
    return normalizeUrl(preferred);
  }

  if (request?.nextUrl?.origin) {
    return normalizeUrl(request.nextUrl.origin);
  }

  return 'https://myavatar.ge';
}
