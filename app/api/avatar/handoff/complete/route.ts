/**
 * POST /api/avatar/handoff/complete — the PHONE side of the desktop→phone handoff.
 *
 * UNAUTHENTICATED (the phone has no session) but TOKEN-GATED: the body carries the HMAC-signed handoff
 * token minted for the desktop user. We verify it, resolve the userId, and enroll the captured selfie (and,
 * optionally, kick off the personal voice clone) FOR THAT USER via the service role. The desktop, polling
 * its own /api/avatar/core, then sees the avatar appear and continues. Rate-limited to bound the token
 * surface. Voice is best-effort — a failure there never fails the selfie enrollment.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { enrollSelfieAvatar } from '@/lib/avatar/enroll';
import { verifyHandoffToken } from '@/lib/avatar/handoff';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { prepareDatasetZip, startRvcTraining, rvcNameFor } from '@/lib/audio/rvc';
import { saveTrainingJob } from '@/lib/audio/voiceModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryTrainVoice(userId: string, voiceDataUrl: string): Promise<void> {
  try {
    const mime = voiceDataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'audio/webm';
    const ext = /mp4|m4a|aac/i.test(mime) ? 'm4a' : /mpeg|mp3/i.test(mime) ? 'mp3' : 'webm';
    const voiceUrl = await uploadAndSign('uploads', `voice-handoff/${userId}/${Date.now()}.${ext}`, voiceDataUrl, mime, 3600);
    if (!voiceUrl) return;
    const name = rvcNameFor(userId);
    const datasetUrl = await prepareDatasetZip(voiceUrl, name);
    if (!datasetUrl) return;
    const predictionId = await startRvcTraining(datasetUrl, 60);
    if (predictionId) await saveTrainingJob(userId, predictionId, name);
  } catch { /* voice clone is best-effort — the selfie avatar is the deliverable */ }
}

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
      await tryTrainVoice(verified.userId, body.voiceDataUrl);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
