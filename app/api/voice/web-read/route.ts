import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { requireUser } from '@/lib/supabase/server';
import { readWebPage } from '@/lib/web/readPage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * POST /api/voice/web-read — { url } → { ok: true, page: { url, title, description, text, links } } | { ok: false, error }.
 *
 * The voice agent's read_webpage (components/voice/live/liveActions.ts): a Live call can now read a public page and follow
 * its links (owner, 2026-10-03: „შედი საიტზე …"). A browser cannot read another site (CORS), so the server does — with
 * every SSRF rule in lib/web/readPage (public addresses only, DNS-checked, redirects re-checked by hand, a byte cap, a
 * timeout, HTML / text only, no cookies).
 *
 * ⚠️ SIGNED-IN ONLY, AND BOUNDED PER USER (WEB_READ). An open page reader is a free proxy and crawler for anyone on the
 * internet; a Live call is a signed-in feature anyway, so the route asks for the same.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }
  const limited = await checkRateLimit(req, RATE_LIMITS.WEB_READ, userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === 'string' ? body.url.slice(0, 2048) : '';
  if (!url) return NextResponse.json({ ok: false, error: 'invalid_url' }, { status: 400 });

  const result = await readWebPage(url);
  if (!result.ok) {
    const status = result.error === 'invalid_url' || result.error === 'blocked_host' ? 400 : 502;
    return NextResponse.json({ ok: false, error: result.error, ...(result.status ? { status: result.status } : {}) }, { status });
  }
  return NextResponse.json({ ok: true, page: result.page }, { headers: { 'Cache-Control': 'no-store' } });
}
