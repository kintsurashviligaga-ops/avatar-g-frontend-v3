/**
 * app/api/voice/dictation-metrics/route.ts — where the composer mic's latency summaries land (lib/voice/dictationMetrics).
 *
 *   POST <summary JSON, sent as text/plain by navigator.sendBeacon>   → 204, one `[dictation-metrics]` log line.
 *
 * TIMINGS AND ENUMS ONLY: the body runs through the same allow-list as the browser (sanitizeDictationMetrics), so a
 * transcript, a URL or any free-form string can never reach the logs; the device family is derived here from the
 * user-agent as one enum. Nothing is stored and nothing is charged; the user's id is not logged either. Only a signed-in
 * session may report (dictation itself needs one, and the beacon carries the cookie), so an anonymous script cannot fill
 * the logs. A body that is too big, not JSON or not a summary is refused; another site's page is refused (the browser
 * sends Origin on a beacon); the per-IP READ bucket is the brake.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { DICTATION_METRICS_MAX_BYTES, sanitizeDictationMetrics } from '@/lib/voice/dictationMetrics';
import { metricsLog, platformOf } from '@/lib/voice/dictationMetricsLog';

export const dynamic = 'force-dynamic';

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // a same-origin beacon may omit it; the allow-list still holds
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const user = await getAuthenticatedUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > DICTATION_METRICS_MAX_BYTES) return NextResponse.json({ error: 'too large' }, { status: 413 });
  let text = '';
  try {
    text = await req.text();
  } catch {
    return NextResponse.json({ error: 'unreadable' }, { status: 400 });
  }
  if (text.length > DICTATION_METRICS_MAX_BYTES) return NextResponse.json({ error: 'too large' }, { status: 413 });
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'not json' }, { status: 400 });
  }
  const m = sanitizeDictationMetrics(raw);
  if (!m) return NextResponse.json({ error: 'not a dictation summary' }, { status: 400 });
  metricsLog.write(JSON.stringify({ ...m, platform: platformOf(req.headers.get('user-agent')) }));
  return new NextResponse(null, { status: 204 });
}
