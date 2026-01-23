import { NextResponse } from 'next/server';

const DEFAULT_TARGET = 'https://avatarg-backend.vercel.app/api/render-status';

function pickTarget() {
  // Optional env (recommended later):
  // RENDER_STATUS_BACKEND_URL = https://avatarg-backend.vercel.app/api/render-status
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

// ✅ UI health check helper
export async function GET(req: Request) {
  const target = pickTarget();
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId') || searchParams.get('renderJobId') || '';

  // If no jobId -> just return route info (so UI can show "ready")
  if (!jobId) {
    return NextResponse.json({
      ok: true,
      route: '/api/render-status',
      method: 'GET',
      usage: '/api/render-status?jobId=YOUR_JOB_ID',
      note: 'Local proxy ready (CORS-safe). Provide jobId to query status.',
    });
  }

  try {
    const url = new URL(target);
    url.searchParams.set('jobId', jobId);

    const { controller, cleanup } = withTimeout(30_000);
    let upstreamRes: Response;

    try {
      upstreamRes = await fetch(url.toString(), {
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

    return new NextResponse(
      parsed ? JSON.stringify(parsed) : text,
      {
        status: upstreamRes.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort ? 'Upstream timeout (30s)' : err?.message || 'Proxy failed',
        target,
      },
      { status: isAbort ? 504 : 500 }
    );
  }
}
