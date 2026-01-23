import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const res = await fetch(
      'https://avatarg-backend.vercel.app/api/pentagon',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const text = await res.text();

    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Proxy failed' },
      { status: 500 }
    );
  }
}
