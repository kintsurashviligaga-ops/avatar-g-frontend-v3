/**
 * POST /api/motion-control — animate a character photo with Kling (Replicate).
 * Body: { characterImageUrl (data-url or https), referenceVideoUrl?, motionPrompt,
 *         duration?, aspectRatio? }. With a reference video it requests V2V (which
 *         currently degrades to motion-prompt I2V — Replicate has no true V2V Kling).
 *
 * ASYNC: Kling v2.1-master takes 3-7 min — a blocking wait 504s on Vercel (the
 * "Generate motion → HTTP 504" report). This route now only SUBMITS the job and
 * returns { jobId } in ~2s; the client polls GET /api/motion-control/status?id=…,
 * which finalizes (re-host + optional music) once Kling succeeds.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { klingSubmit, klingConfigured, KLING_MODELS } from '@/lib/ai/klingClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // submit-only — returns fast; the wait happens via /status polling

export async function POST(req: Request) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!klingConfigured()) return NextResponse.json({ error: 'video engine not configured' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    characterImageUrl?: string; referenceVideoUrl?: string; motionPrompt?: string;
    duration?: number; aspectRatio?: string; qualityMode?: string;
  } | null;
  const characterImageUrl = body?.characterImageUrl?.trim();
  const motionPrompt = body?.motionPrompt?.trim();
  if (!characterImageUrl || !motionPrompt) {
    return NextResponse.json({ error: 'characterImageUrl + motionPrompt required' }, { status: 400 });
  }
  const duration: 5 | 10 = body?.duration === 10 ? 10 : 5;
  const aspectRatio = (['9:16', '16:9', '1:1'].includes(String(body?.aspectRatio)) ? body!.aspectRatio : '9:16') as '9:16' | '16:9' | '1:1';
  const referenceVideoUrl = body?.referenceVideoUrl?.trim();
  const method: 'v2v' | 'i2v' = referenceVideoUrl ? 'v2v' : 'i2v';
  // Speed/quality → Kling model. fast = v1.6-pro (~3 min), quality = v2.1-master
  // (~12 min, best-looking). klingSubmit auto-adds cfg_scale for the v1.6 model.
  const modelName = body?.qualityMode === 'quality' ? KLING_MODELS.V21_MASTER : KLING_MODELS.V16_PRO;

  // Compose hint matching the chosen format. Kling ignores aspect_ratio with a
  // start_image (we post-fit via center-crop), but steering the SHOT to the target
  // framing keeps the subject upright + fully in-frame so the crop doesn't clip it.
  // Aspect-aware on purpose — a hardcoded "vertical/portrait" would mislabel 16:9/1:1.
  const ORIENT_HINT: Record<'9:16' | '16:9' | '1:1', string> = {
    '9:16': 'vertical portrait composition, subject upright and centered, full body in frame',
    '16:9': 'wide horizontal cinematic composition, subject centered and fully in frame',
    '1:1': 'square composition, subject centered and fully in frame',
  };
  const framedPrompt = `${motionPrompt}, ${ORIENT_HINT[aspectRatio]}`;

  try {
    const jobId = await klingSubmit({
      imageUrl: characterImageUrl,
      prompt: framedPrompt,
      duration,
      aspectRatio,
      modelName,
      ...(referenceVideoUrl ? { videoUrl: referenceVideoUrl } : {}),
    });
    return NextResponse.json({ success: true, jobId, method });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
