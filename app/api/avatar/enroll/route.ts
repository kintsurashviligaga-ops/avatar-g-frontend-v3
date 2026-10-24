/**
 * POST /api/avatar/enroll — enroll the user's LIVE-AVATAR selfie (the fast 2D path).
 *
 * The lightweight enrollment behind "Live Avatar Voice Mode": a single selfie becomes the user's core
 * avatar POSTER (shown, audio-reactive, during the Gemini Live session and usable as the photo avatar for
 * the LiveAvatar real-time tier). It deliberately does NOT run the heavy 3D-scan builder — a 2D poster is
 * all a talking-head Live session needs. Shares its core with the cross-device handoff (lib/avatar/enroll).
 *
 * Authed (the userId comes from the caller's session). Body: { dataUrl: "data:image/…;base64,…",
 * voiceDataUrl?: "data:audio/…;base64,…", source?: 'camera' | 'upload' }. The photo AND the optional voice sample are
 * stored PRIVATE (lib/avatar/liveAvatar.ts) — enrollment never kicks off any background voice-clone training / render.
 * Answers { url (signed, short-lived), avatarAssetId (= the avatar id), avatar (id, state, prep…), voice }.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { enrollSelfieAvatar, storeLiveAvatarVoice } from '@/lib/avatar/enroll';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const limited = await checkRateLimit(req as NextRequest, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as { dataUrl?: string; voiceDataUrl?: string; source?: string } | null;
    const result = await enrollSelfieAvatar(user.id, body?.dataUrl ?? '', body?.source === 'upload' ? 'upload' : 'camera');
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`[avatar/enroll] FAILED for user ${user.id}: ${result.error} (${result.status})`);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    // STORE the optional voice sample (private bucket) — best-effort, never fails the selfie enrollment and
    // never triggers background training/generation (that's the "training in the corner" bug this fixes).
    let voice: 'saved' | 'failed' | 'none' = 'none';
    if (typeof body?.voiceDataUrl === 'string' && body.voiceDataUrl.startsWith('data:')) {
      voice = (await storeLiveAvatarVoice(user.id, body.voiceDataUrl)).ok ? 'saved' : 'failed';
    }
    return NextResponse.json({ url: result.url, avatarAssetId: result.avatarAssetId, avatar: result.avatar, voice });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[avatar/enroll] unhandled exception:', e instanceof Error ? e.stack || e.message : e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
