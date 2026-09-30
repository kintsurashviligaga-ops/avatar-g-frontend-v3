import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { convertSongWithRvc } from '@/lib/audio/rvc';
import { getUserVoiceModel, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';

/**
 * Convert a film's spoken narration into the user's TRAINED voice (RVC) before the
 * stitch — so the video is narrated in their own voice. Kept OUT of the assemble
 * route (which is already at its 270s budget). POST { voiceoverUrl } → { url }.
 * Fail-OPEN: returns the original narration URL so the film never breaks.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 200;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE); if (rl) return rl;
  const body = (await req.json().catch(() => ({}))) as { voiceoverUrl?: unknown; locale?: unknown };
  const voiceoverUrl = typeof body.voiceoverUrl === 'string' ? body.voiceoverUrl.trim() : '';
  if (!/^https?:\/\//i.test(voiceoverUrl)) {
    return NextResponse.json({ success: false, url: null }, { status: 400 });
  }

  // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate), AND THE LOOKUP FAILS CLOSED. A guest used to fall through to
  // `DEMO_VOICE_USER_ID`'s trained voice, so any anonymous POST ran a Replicate RVC conversion (a paid GPU job) on
  // whatever audio URL it named, on the platform's key. The only caller is the film stitch
  // (lib/chat/filmStudioClient), which runs after a film render a guest can no longer start — and it treats any
  // answer without a `url` as "keep the original narration", so a 401 here costs a real user nothing.
  // The session read sits OUTSIDE the fail-open try below: an unverifiable session is refused, not converted.
  let user: Awaited<ReturnType<typeof authedClientFromRequest>>['user'] = null;
  try {
    ({ user } = await authedClientFromRequest(req));
  } catch {
    user = null;
  }
  if (mustSignInToGenerate(user?.id)) {
    return NextResponse.json(signInToGenerateBody(typeof body.locale === 'string' ? body.locale : 'ka'), { status: 401 });
  }

  try {
    const model = await getUserVoiceModel(user?.id ?? DEMO_VOICE_USER_ID);
    if (!model) return NextResponse.json({ success: false, url: voiceoverUrl }); // no trained voice → original

    const converted = await convertSongWithRvc(voiceoverUrl, model.modelUrl);

    // Re-host to a stable Supabase URL the assembler can fetch.
    let hosted = converted;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 25_000);
      const r = await fetch(converted, { signal: ac.signal }).finally(() => clearTimeout(to));
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength && buf.byteLength <= 25 * 1024 * 1024) {
          const path = `omni-narration/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
          const signed = await uploadAndSign('uploads', path, buf.toString('base64'), 'audio/mpeg', 86_400);
          if (signed) hosted = signed;
        }
      }
    } catch {
      /* fail-open — keep the converted provider URL */
    }
    return NextResponse.json({ success: true, url: hosted });
  } catch {
    return NextResponse.json({ success: false, url: voiceoverUrl }); // fail-open → original narration
  }
}
