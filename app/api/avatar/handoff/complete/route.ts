/**
 * POST /api/avatar/handoff/complete — the PHONE side of the desktop→phone handoff.
 *
 * UNAUTHENTICATED (the phone has no session) but TOKEN-GATED: the body carries the HMAC-signed handoff
 * token minted for the desktop user. We verify it, resolve the userId, and enroll the captured selfie (and,
 * optionally, STORE the voice sample) FOR THAT USER via the service role. The desktop, polling its own
 * /api/avatar/core, then sees the avatar appear and continues. Rate-limited to bound the token surface.
 * Voice is best-effort STORAGE ONLY — enrollment never kicks off any background voice-clone training/render.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { enrollSelfieAvatar, storeLiveAvatarVoice } from '@/lib/avatar/enroll';
import { verifyHandoffToken } from '@/lib/avatar/handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as { token?: string; dataUrl?: string; voiceDataUrl?: string } | null;
    const verified = body?.token ? verifyHandoffToken(body.token) : null;
    if (!verified) return NextResponse.json({ error: 'invalid_or_expired_link' }, { status: 401 });

    const result = await enrollSelfieAvatar(verified.userId, body?.dataUrl ?? '');
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    if (typeof body?.voiceDataUrl === 'string' && body.voiceDataUrl.startsWith('data:')) {
      await storeLiveAvatarVoice(verified.userId, body.voiceDataUrl);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
