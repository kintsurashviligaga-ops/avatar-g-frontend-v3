import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_TARGET = 'https://avatarg-backend.vercel.app/api/render-status';

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, cleanup: () => clearTimeout(t) };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;

  console.log('🔍 Status check for jobId:', jobId);

  if (!jobId || jobId.trim() === '') {
    console.error('❌ No jobId provided');
    return NextResponse.json(
      { success: false, error: 'jobId is required' },
      { status: 400 }
    );
  }

  try {
    const target = process.env.RENDER_STATUS_BACKEND_URL?.trim() || DEFAULT_TARGET;
    const upstreamUrl = `${target}/${jobId}`;
    
    console.log('🔗 Proxying to:', upstreamUrl);

    const { controller, cleanup } = withTimeout(30_000);
    let upstreamRes: Response;

    try {
      upstreamRes = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-proxy': 'avatar-g-frontend',
          'x-forwarded-at': new Date().toISOString(),
        },
        signal: controller.signal,
        cache: 'no-store',
      });
    } finally {
      cleanup();
    }

    const text = await upstreamRes.text();
    const parsed = safeJson(text);

    console.log('✅ Backend response:', upstreamRes.status, parsed?.status || 'no status');

    return new NextResponse(parsed ? JSON.stringify(parsed) : text, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('❌ Proxy error:', err);
    const isAbort = err?.name === 'AbortError';
    return NextResponse.json(
      {
        success: false,
        error: isAbort ? 'Upstream timeout (30s)' : err?.message || 'Proxy failed',
      },
      { status: isAbort ? 504 : 500 }
    );
  }
}
