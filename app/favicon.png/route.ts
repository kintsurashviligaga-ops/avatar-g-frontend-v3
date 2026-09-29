import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** See app/favicon.ico/route.ts: `/icon` stopped existing when app/icon.tsx became a static app/icon.png. */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/icon.png', req.url), 307);
}
