/**
 * POST /api/avatar/enroll — enroll the user's LIVE-AVATAR selfie (the fast 2D path).
 *
 * The lightweight enrollment behind "Live Avatar Voice Mode": a single selfie becomes the user's core
 * avatar POSTER (shown, audio-reactive, during the Gemini Live session and usable as the photo avatar for
 * the LiveAvatar real-time tier). It deliberately does NOT run the heavy 3D-scan builder — a 2D poster is
 * all a talking-head Live session needs. Shares its core with the cross-device handoff (lib/avatar/enroll).
 *
 * Authed (the userId comes from the caller's session). Body: { dataUrl: "data:image/…;base64,…" }.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { enrollSelfieAvatar } from '@/lib/avatar/enroll';
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

    const body = (await req.json().catch(() => null)) as { dataUrl?: string } | null;
    const result = await enrollSelfieAvatar(user.id, body?.dataUrl ?? '');
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ url: result.url, avatarAssetId: result.avatarAssetId });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
