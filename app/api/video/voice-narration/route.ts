import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { convertSongWithRvc } from '@/lib/audio/rvc';
import { getUserVoiceModel, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

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
  const body = (await req.json().catch(() => ({}))) as { voiceoverUrl?: unknown };
  const voiceoverUrl = typeof body.voiceoverUrl === 'string' ? body.voiceoverUrl.trim() : '';
  if (!/^https?:\/\//i.test(voiceoverUrl)) {
    return NextResponse.json({ success: false, url: null }, { status: 400 });
  }

  try {
    const { user } = await authedClientFromRequest(req);
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
