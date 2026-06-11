/**
 * POST /api/film/storyboard
 * =========================
 * Storyboard PREVIEW for the Video Studio. Before committing to the (far more
 * expensive) 30-second render, the user gets to SEE the plan: the six cinematic
 * scenes AND one preview frame per scene. They review/regenerate, and only then
 * approve the full video — so the agents render the final film against frames the
 * user already accepted.
 *
 * The approved frames are returned to the client and handed back to the render
 * (driveFilmStudio → orchestrate → handleFilmComposite) as PER-SCENE identity
 * anchors. That both (a) makes the final video match the storyboard, and (b)
 * moves the per-scene frame-generation latency OFF the render hot-path (it was
 * disabled there for exactly that reason) and INTO this deliberate preview step.
 *
 * Fail-open by construction: any frame that fails to render comes back null; the
 * scene plan still returns so the user always sees the storyboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { planFilmScenes, normalizeReferenceImages } from '@/lib/chat/filmPipeline';
import { mapWithConcurrency } from '@/lib/chat/filmClipRetry';
import { ServiceManager } from '@/lib/chat/ServiceManager';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export const runtime = 'nodejs';
export const maxDuration = 300;

const serviceManager = new ServiceManager();

/** Host a data: URI reference to a signed https URL (NanoBanana needs a fetchable image). */
async function hostRef(ref: string, i: number): Promise<string> {
  if (!ref.startsWith('data:')) return ref;
  try {
    const m = ref.match(/^data:([^;,]+)[;,]/);
    const mime = (m?.[1] || 'image/jpeg').toLowerCase();
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const b64 = ref.includes(',') ? ref.split(',')[1] ?? '' : '';
    const path = `storyboard-ref/${Date.now()}-${i}.${ext}`;
    return (await uploadAndSign('uploads', path, b64, mime, 7200)) || ref;
  } catch {
    return ref;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    orientation?: string;
    style?: string;
    referenceImages?: unknown;
    locale?: string;
  };

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }

  const orientation: 'landscape' | 'vertical' = body.orientation === 'vertical' ? 'vertical' : 'landscape';
  const style = typeof body.style === 'string' && body.style.trim() ? body.style.trim() : null;
  const locale = typeof body.locale === 'string' ? body.locale : 'ka';

  // Host any uploaded reference photos so the storyboard frames can lock the
  // protagonist's identity (and so the SAME selfie anchors the final render).
  const refList = normalizeReferenceImages(body.referenceImages);
  const hostedRefs = refList.length ? await Promise.all(refList.map((r, i) => hostRef(r, i))) : [];
  const selfie = hostedRefs.find((r) => /^https?:\/\//i.test(r)) ?? null;

  const plan = planFilmScenes(prompt, { referenceImages: hostedRefs, style, orientation });
  const aspect = orientation === 'vertical' ? '9:16' : '16:9';
  const sessionId = `storyboard_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // One preview frame per scene — 1K (fastest tier) and bounded concurrency so
  // six frames land well within maxDuration. Each frame is fail-open (null on miss).
  const frames = await mapWithConcurrency(plan.scenes, 3, async (scene) => {
    try {
      const framePrompt = selfie
        ? `Cinematic film still, ${aspect} composition. ${scene.prompt} Featuring the EXACT same person as the reference image — identical face, hair and wardrobe. Photorealistic, professional cinematic colour grade.`
        : `Cinematic film still, ${aspect} composition. ${scene.prompt} Photorealistic, professional cinematic colour grade, sharp focus.`;
      const r = await serviceManager.execute({
        sessionId,
        serviceContext: 'image',
        intent: 'image_generation',
        userPrompt: framePrompt,
        ...(selfie ? { imageUrl: selfie } : {}),
        // Pin the FAST 1K endpoint: six frames must land well within maxDuration,
        // and v2-1k still honours the reference-image (selfie) identity anchor.
        selectedOptions: { aspect, aspectRatio: aspect, endpoint: 'v2-1k' },
        locale,
      });
      return typeof r.assetUrl === 'string' && /^https?:\/\//i.test(r.assetUrl) ? r.assetUrl : null;
    } catch {
      return null;
    }
  });

  const scenes = plan.scenes.map((s, i) => ({
    ordinal: s.ordinal,
    beat: s.beat,
    // A short, human-readable shot summary (the full enriched prompt is long).
    prompt: s.prompt.replace(/\s+/g, ' ').slice(0, 160),
    frameUrl: frames[i] ?? null,
  }));

  return NextResponse.json({
    success: true,
    sessionId,
    seed: plan.shared.seed,
    orientation,
    scenes,
  });
}
