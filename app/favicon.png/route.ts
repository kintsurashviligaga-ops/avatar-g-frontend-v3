import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/icon', req.url), 307);
}
