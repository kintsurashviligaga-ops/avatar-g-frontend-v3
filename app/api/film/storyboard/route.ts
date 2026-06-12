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
import Anthropic from '@anthropic-ai/sdk';
import { planFilmScenes, normalizeReferenceImages, FILM_SCENE_COUNT } from '@/lib/chat/filmPipeline';
import { extractJson } from '@/lib/orchestrator/script-breakdown';
import { mapWithConcurrency } from '@/lib/chat/filmClipRetry';
import { ServiceManager } from '@/lib/chat/ServiceManager';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export const runtime = 'nodejs';
export const maxDuration = 300;

const serviceManager = new ServiceManager();

/**
 * Script Agent — turn the brief into EXACTLY `count` sequential, brief-specific
 * cinematic shot descriptions that tell ONE continuous story with a consistent
 * protagonist. This is what gives the film real CONTENT instead of generic camera
 * angles. Fail-open: any miss returns null and planFilmScenes falls back to its
 * deterministic camera beats, so the storyboard always renders.
 */
async function generateSceneScripts(brief: string, count: number): Promise<string[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: 'You are a world-class film director and cinematographer. You write vivid, shootable, single-sentence-to-short-paragraph shot descriptions for a renderer.',
      messages: [{
        role: 'user',
        content:
          `Break this brief into EXACTLY ${count} sequential cinematic shots that tell ONE continuous story with a clear arc (establish → develop → turn → resolve). ` +
          `Keep ONE consistent protagonist, location, time-of-day and colour palette across EVERY shot — describe the protagonist's key, memorable features in shot 1 (exact clothing, age, look) and carry them VERBATIM through every later shot; never swap the person. ` +
          `Each shot is a vivid, self-contained visual description: subject + specific action + setting + lighting + a deliberate camera move + shot size. ` +
          `Keep it period- and world-accurate to the brief; NO neon, glowing light-streaks, lens flares, HUD or sci-fi effects and NO anachronistic/modern objects unless the brief explicitly asks. ` +
          `Brief: "${brief.trim().slice(0, 1500)}". ` +
          `Return ONLY a JSON array of exactly ${count} strings (one shot description each, in order) — no prose, no keys.`,
      }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = extractJson(text);
    if (!Array.isArray(parsed)) return null;
    const scripts = parsed.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
    return scripts.length >= Math.min(3, count) ? scripts.slice(0, count) : null;
  } catch {
    return null;
  }
}

/**
 * Re-host a provider temp URL to Supabase. CRITICAL: the app CSP `img-src` allows
 * `*.supabase.co` but NOT NanoBanana's raw host (`tempfile.aiquickdraw.com`), so a
 * raw frame URL is BLOCKED by the browser (blank tiles) AND expires — which also
 * breaks the render anchor (LTX can't fetch an expired temp URL). Copying the bytes
 * to a 7-day signed Supabase URL fixes both. Fail-open: keep the raw URL on any miss.
 */
async function reHostFrame(url: string): Promise<string> {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 25_000);
    const res = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(to));
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 18 * 1024 * 1024) return url;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const path = `storyboard/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const signed = await uploadAndSign('uploads', path, buf.toString('base64'), ct, 604800);
    return signed || url;
  } catch {
    return url;
  }
}

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
    /** 1-based scene to regenerate in isolation; omit to render the full board. */
    sceneOrdinal?: number;
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

  // One preview frame for a scene — 1K (fastest tier) so six land well within
  // maxDuration, and v2-1k still honours the reference-image (selfie) anchor.
  // Fail-open: any miss returns null and the scene plan still surfaces.
  const genFrame = async (scenePrompt: string): Promise<string | null> => {
    try {
      const framePrompt = selfie
        ? `Cinematic film still, ${aspect} composition. ${scenePrompt} Featuring the EXACT same person as the reference image — identical face, hair and wardrobe. Photorealistic, professional cinematic colour grade.`
        : `Cinematic film still, ${aspect} composition. ${scenePrompt} Photorealistic, professional cinematic colour grade, sharp focus.`;
      const r = await serviceManager.execute({
        sessionId,
        serviceContext: 'image',
        intent: 'image_generation',
        userPrompt: framePrompt,
        ...(selfie ? { imageUrl: selfie } : {}),
        selectedOptions: { aspect, aspectRatio: aspect, endpoint: 'v2-1k' },
        locale,
      });
      const raw = typeof r.assetUrl === 'string' && /^https?:\/\//i.test(r.assetUrl) ? r.assetUrl : null;
      // Re-host to a CSP-allowed Supabase URL — a raw provider temp URL is blocked
      // by the browser img-src AND expires (breaking the render anchor too).
      return raw ? await reHostFrame(raw) : null;
    } catch {
      return null;
    }
  };

  // Single-scene regeneration — the user asked to re-roll just one frame.
  const sceneOrdinal = typeof body.sceneOrdinal === 'number' ? Math.floor(body.sceneOrdinal) : null;
  if (sceneOrdinal && sceneOrdinal >= 1 && sceneOrdinal <= plan.scenes.length) {
    const scene = plan.scenes[sceneOrdinal - 1]!;
    const frameUrl = await genFrame(scene.prompt);
    return NextResponse.json({ success: true, ordinal: sceneOrdinal, frameUrl });
  }

  // Full board — enrich each scene with the LLM Script Agent so the storyboard
  // tells the REAL story of the brief (not generic camera angles). Fail-open: a
  // miss leaves `plan` (deterministic beats) in place. The scripts are returned so
  // the render can reuse the EXACT same scenes the user approved.
  const sceneScripts = (await generateSceneScripts(prompt, FILM_SCENE_COUNT)) ?? null;
  const storyPlan = sceneScripts
    ? planFilmScenes(prompt, { referenceImages: hostedRefs, style, orientation, sceneScripts })
    : plan;

  const frames = await mapWithConcurrency(storyPlan.scenes, 3, (scene) => genFrame(scene.prompt));

  const scenes = storyPlan.scenes.map((s, i) => ({
    ordinal: s.ordinal,
    beat: s.beat,
    // A short, human-readable shot summary (the full enriched prompt is long).
    prompt: s.prompt.replace(/\s+/g, ' ').slice(0, 160),
    frameUrl: frames[i] ?? null,
  }));

  return NextResponse.json({
    success: true,
    sessionId,
    seed: storyPlan.shared.seed,
    orientation,
    scenes,
    // The LLM scene scripts (one per scene) — the client threads these back to the
    // render so the clips are generated from the same story, not the deterministic beats.
    sceneScripts,
  });
}
