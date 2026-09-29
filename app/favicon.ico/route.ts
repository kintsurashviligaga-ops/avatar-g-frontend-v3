import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Browsers ask for /favicon.ico on their own. It used to redirect to `/icon` — the route of a GENERATED
 * app/icon.tsx that no longer exists (it became a static app/icon.png, served at /icon.png), so the locale
 * middleware turned /icon into /ka/icon and the chain ended in a 404. The static files are the targets now.
 */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/icons/favicon.ico', req.url), 307);
}
