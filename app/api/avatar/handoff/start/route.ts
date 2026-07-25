/**
 * POST /api/avatar/handoff/start — begin a desktop→phone avatar-enrollment handoff.
 *
 * Authed. Mints a short-lived HMAC-signed token for the caller, builds the mobile enrollment URL
 * (/{locale}/avatar/enroll?t=<token>), and returns a QR data-URL of it. The desktop shows the QR and then
 * polls its OWN /api/avatar/core until the phone finishes — no server-side session store needed.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';

import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { signHandoffToken } from '@/lib/avatar/handoff';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const token = signHandoffToken(user.id);
    if (!token) return NextResponse.json({ error: 'handoff_unavailable' }, { status: 503 });

    const body = (await req.json().catch(() => ({}))) as { locale?: string };
    const locale = ['ka', 'en', 'ru'].includes(String(body?.locale)) ? String(body.locale) : 'ka';

    // Build the absolute mobile URL the phone will open. Prefer the configured public site URL (so the QR
    // always points at the real prod host, not an internal preview host); fall back to the request origin.
    const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const url = `${base}/${locale}/avatar/enroll?t=${encodeURIComponent(token)}`;

    const qrDataUrl = await QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
    return NextResponse.json({ url, qrDataUrl });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
