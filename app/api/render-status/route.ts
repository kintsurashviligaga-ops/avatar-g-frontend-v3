import { NextResponse } from 'next/server';

const DEFAULT_TARGET = 'https://avatarg-backend.vercel.app/api/render-status';

function pickTarget() {
  const env = process.env.RENDER_STATUS_BACKEND_URL?.trim();
  return env && env.startsWith('http') ? env : DEFAULT_TARGET;
}

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

// Health check (no jobId in path)
export async function GET(req: Request) {
  const url = new URL(req.url);
  
  // Extract jobId from path: /api/render-status/xxx
  const pathParts = url.pathname.split('/').filter(Boolean);
  const jobId = pathParts[pathParts.length - 1] === 'render-status' ? '' : pathParts[pathParts.length - 1];

  if (!jobId) {
    return NextResponse.json({
      ok: true,
      route: '/api/render-status',
      method: 'GET',
      usage: '/api/render-status/YOUR_JOB_ID',
      note: 'Local proxy ready (CORS-safe). Provide jobId in path.',
    });
  }

  try {
    const target = pickTarget();
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

    return new NextResponse(parsed ? JSON.stringify(parsed) : text, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort ? 'Upstream timeout (30s)' : err?.message || 'Proxy failed',
      },
      { status: isAbort ? 504 : 500 }
    );
  }
}
