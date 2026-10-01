/**
 * POST /api/avatar/handoff/complete — the PHONE side of the desktop→phone handoff.
 *
 * UNAUTHENTICATED (the phone has no session) but TOKEN-GATED: the body carries the HMAC-signed handoff
 * token minted for the desktop user. We verify it, resolve the userId, and enroll the captured selfie (and,
 * optionally, STORE the voice sample) FOR THAT USER via the service role. The desktop, polling its own
 * /api/avatar/core, then sees the avatar appear and continues. Rate-limited to bound the token surface.
 * Voice is best-effort STORAGE ONLY — enrollment never kicks off any background voice-clone training/render.
 *
 * ⚠️ SINGLE USE (lib/avatar/handoff.ts jti). The token is CLAIMED before the enrollment writes anything, so a replayed
 * or second concurrent request is refused (401) instead of overwriting the person's face; a failed enrollment gives the
 * claim back so the same link can be retried. A store that cannot answer is a 503 — the link stays unclaimed.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { enrollSelfieAvatar, storeLiveAvatarVoice } from '@/lib/avatar/enroll';
import { consumeHandoffToken, type HandoffJtiStore } from '@/lib/avatar/handoff';
import { twinHandoffJtiStore } from '@/lib/twin/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let release: (() => Promise<void>) | null = null;
  try {
    const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as { token?: string; dataUrl?: string; voiceDataUrl?: string } | null;
    let store: HandoffJtiStore;
    try {
      store = twinHandoffJtiStore();
    } catch {
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
    const consumed = typeof body?.token === 'string' && body.token
      ? await consumeHandoffToken(body.token, store)
      : ({ ok: false, reason: 'invalid' } as const);
    if (!consumed.ok) {
      return consumed.reason === 'unavailable'
        ? NextResponse.json({ error: 'unavailable' }, { status: 503 })
        : NextResponse.json({ error: 'invalid_or_expired_link' }, { status: 401 });
    }
    const { userId, jti } = consumed.claims;
    release = () => store.release(jti);

    const result = await enrollSelfieAvatar(userId, body?.dataUrl ?? '');
    if (!result.ok) {
      await release();
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    release = null; // enrolled — the link is spent for good

    if (typeof body?.voiceDataUrl === 'string' && body.voiceDataUrl.startsWith('data:')) {
      await storeLiveAvatarVoice(userId, body.voiceDataUrl);
    }
    return NextResponse.json({ ok: true });
  } catch {
    if (release) await release();
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
