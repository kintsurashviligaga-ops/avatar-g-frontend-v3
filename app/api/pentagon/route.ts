import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TARGET =
  process.env.PENTAGON_BACKEND_URL ??
  'https://avatarg-backend.vercel.app/api/pentagon';

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/pentagon',
    method: 'POST',
    target: TARGET,
    note: 'Local proxy ready (CORS-safe)',
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.text();

    const res = await fetch(TARGET, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-proxy': 'avatar-g-frontend',
      },
      body,
      cache: 'no-store',
    });

    const text = await res.text();

    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Pentagon proxy failed',
      },
      { status: 500 }
    );
  }
}
