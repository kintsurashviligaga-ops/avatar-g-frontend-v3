import { NextResponse } from 'next/server';

const DEFAULT_TARGET = 'https://avatarg-backend.vercel.app/api/pentagon';

function pickTarget() {
  // Optional: if you set it later on Vercel
  // PENTAGON_BACKEND_URL = https://avatarg-backend.vercel.app/api/pentagon
  const env = process.env.PENTAGON_BACKEND_URL?.trim();
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

// ✅ Health check for your UI "Endpoint Check"
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/pentagon',
    method: 'POST',
    note: 'Local proxy endpoint ready (CORS-safe)',
  });
}

export async function POST(req: Request) {
  const target = pickTarget();

  try {
    const body = await req.text(); // keep raw text (works for JSON + avoids double parse issues)

    // Forward only safe/useful headers
    const incoming = req.headers;
    const headers: Record<string, string> = {
      'Content-Type': incoming.get('content-type') || 'application/json',
      Accept: incoming.get('accept') || 'application/json',
    };

    // Forward auth headers if present (important!)
    const auth = incoming.get('authorization');
    if (auth) headers.Authorization = auth;

    const apiKey = incoming.get('x-api-key');
    if (apiKey) headers['x-api-key'] = apiKey;

    const supaAuth = incoming.get('apikey');
    if (supaAuth) headers.apikey = supaAuth;

    // Optional trace id for debugging
    headers['x-proxy'] = 'avatar-g-frontend';
    headers['x-forwarded-at'] = new Date().toISOString();

    const { controller, cleanup } = withTimeout(120_000); // 120s (video pipeline can be slow)
    let upstreamRes: Response;

    try {
      upstreamRes = await fetch(target, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        // IMPORTANT: do NOT set mode:'no-cors' (it breaks reading response)
        cache: 'no-store',
      });
    } finally {
      cleanup();
    }

    const text = await upstreamRes.text();
    const ct = upstreamRes.headers.get('content-type') || '';

    // If upstream returns JSON, ensure we return JSON too (even if content-type is wrong)
    const parsed = safeJson(text);
    const isJson = ct.includes('application/json') || parsed !== null;

    // Pass-through status and response body
    return new NextResponse(isJson ? JSON.stringify(parsed ?? {}) : text, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': isJson ? 'application/json; charset=utf-8' : (ct || 'text/plain; charset=utf-8'),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return NextResponse.json(
      {
        success: false,
        error: isAbort ? 'Upstream timeout (120s)' : err?.message || 'Proxy failed',
        target,
      },
      { status: isAbort ? 504 : 500 }
    );
  }
}
