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
import { planFilmScenes, normalizeReferenceImages, FILM_SCENE_COUNT, FILM_CLIP_SEC } from '@/lib/chat/filmPipeline';
import { runPromptAgent, type MasterFilmBrief } from '@/lib/chat/promptAgent';
import { extractJson } from '@/lib/orchestrator/script-breakdown';
import { atlasChat, atlasConfigured } from '@/lib/ai/atlasClient';
import { generateWithGemini } from '@/lib/gemini/client';
import { mapWithConcurrency } from '@/lib/chat/filmClipRetry';
import { ServiceManager } from '@/lib/chat/ServiceManager';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { validateInput, buildModelInput } from '@/lib/replicate/schemas';
import { resolveModel } from '@/lib/replicate/models';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { normalizeOutput } from '@/lib/replicate/normalizer';
import { withRetry } from '@/lib/utils/withRetry';

/** FAST storyboard frames: flux-schnell renders in ~3–4s vs NanoBanana ~30s+ (benchmarked).
 *  Opt-in via FAST_IMAGE_MODEL (1 | true | flux | flux-schnell | on); OFF → no behavior change. */
const FAST_IMAGE_MODEL = /^(1|true|on|flux|flux-schnell)$/i.test((process.env.FAST_IMAGE_MODEL || '').trim());

/** Prompt-Agent model for the STORYBOARD PREVIEW only (haiku ≈ 5–10s vs sonnet ≈ 80s for a
 *  6-scene brief). The actual film render (filmComposite) is untouched → keeps sonnet for the
 *  character-lock reasoning. Override with STORYBOARD_PROMPT_MODEL=claude-sonnet-4-6 for max
 *  preview quality. */
const STORYBOARD_PROMPT_MODEL = process.env.STORYBOARD_PROMPT_MODEL ?? 'claude-haiku-4-5-20251001';

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
  const SYS = 'You are a world-class film director and cinematographer. You write vivid, shootable, single-sentence-to-short-paragraph shot descriptions for a renderer.';
  const USER =
    `Break this brief into EXACTLY ${count} sequential cinematic shots that tell ONE continuous story with a clear arc (establish → develop → turn → resolve). ` +
    `Keep ONE consistent protagonist, location, time-of-day and colour palette across EVERY shot — describe the protagonist's key, memorable features in shot 1 (exact clothing, age, look) and carry them VERBATIM through every later shot; never swap the person. ` +
    `Each shot is a vivid, self-contained visual description: subject + specific action + setting + lighting + a deliberate camera move + shot size. ` +
    `Keep it period- and world-accurate to the brief; NO neon, glowing light-streaks, lens flares, HUD or sci-fi effects and NO anachronistic/modern objects unless the brief explicitly asks. ` +
    `Brief: "${brief.trim().slice(0, 6000)}". ` +
    `Return ONLY a JSON array of exactly ${count} strings (one shot description each, in order) — no prose, no keys.`;
  const parseScripts = (text: string): string[] | null => {
    const parsed = extractJson(text);
    if (!Array.isArray(parsed)) return null;
    const scripts = parsed.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
    return scripts.length >= Math.min(3, count) ? scripts.slice(0, count) : null;
  };
  // PRIMARY — Gemini (gemini-2.5-flash). It is the LIVE provider in prod (it also powers
  // the chat); Anthropic + Atlas have been returning null (≈80s to fail), which is exactly
  // why uploaded scripts never became scenes and the storyboard fell back to generic beats.
  // Try Gemini first so the script is actually decomposed. Fail-open → Anthropic → Atlas.
  if (process.env.GEMINI_API_KEY) {
    try {
      // thinkingBudget:0 — disable gemini-2.5 "thinking" (it was adding ~60s+); this is a
      // structured creative task that doesn't need it, and the board waits on this call.
      const r = await generateWithGemini({ prompt: USER, systemPrompt: SYS, tier: 'flash', maxTokens: 2000, temperature: 0.6, thinkingBudget: 0 });
      const scripts = parseScripts(r.text);
      if (scripts) return scripts;
    } catch { /* fall through to Anthropic */ }
  }
  // SECONDARY — Anthropic (haiku). On a missing/dead key or any miss, fall through to Atlas.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 1500, system: SYS,
        messages: [{ role: 'user', content: USER }],
      });
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const scripts = parseScripts(text);
      if (scripts) return scripts;
    } catch { /* fall through to Atlas */ }
  }
  // FALLBACK — Atlas Cloud DeepSeek-V3 (OpenAI-compatible). Keeps storyboard scripts
  // alive when Anthropic is absent/down. Fail-open → null (caller uses deterministic plan).
  if (atlasConfigured()) {
    const text = await atlasChat({ system: SYS, user: USER, maxTokens: 1500, temperature: 0.6, timeoutMs: 30_000 });
    if (text) return parseScripts(text);
  }
  return null;
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

/**
 * Storyboard-frame FALLBACK: when the primary frame provider (NanoBanana) is
 * unavailable — e.g. its key is missing on a given deployment, which left all six
 * tiles blank — render the frame on Replicate FLUX instead (the same provider that
 * already backs the film clips, so its key is present wherever clips render).
 * Polled to completion server-side so the storyboard still returns a real URL.
 * Fail-open: any miss returns null and the slot degrades gracefully.
 */
async function genFrameViaReplicate(framePrompt: string, aspect: string): Promise<string | null> {
  try {
    const validation = validateInput({ service: 'image', prompt: framePrompt, quality: 'standard', aspectRatio: aspect });
    if (!validation.valid || !validation.sanitized) return null;
    const model = resolveModel('image', validation.sanitized.variant);
    const modelInput = buildModelInput(validation.sanitized);
    let pred = await createPrediction(model.id, modelInput);
    const deadline = Date.now() + 70_000;
    while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      pred = await pollPrediction(pred.id);
    }
    if (pred.status !== 'succeeded') return null;
    const norm = normalizeOutput('image', model.label, model.outputType, pred.id, pred.status, pred.output, pred.error ?? null, pred.metrics) as { url?: string };
    return typeof norm.url === 'string' && /^https?:\/\//i.test(norm.url) ? norm.url : null;
  } catch {
    return null;
  }
}

/**
 * Storyboard-frame FAST path (gated by FAST_IMAGE_MODEL) — Replicate `flux-schnell`
 * renders a frame in ~3–4s vs NanoBanana's ~30s+ (benchmarked at 3.65s on prod). Uses
 * `Prefer: wait` so the create blocks until the image is ready in ONE round-trip, with a
 * short backoff retry on Replicate's 6/min create throttle (429). Fail-open: any miss
 * returns null and genFrame falls through to the unchanged NanoBanana → Replicate-FLUX chain.
 */
async function genFrameViaFluxSchnell(framePrompt: string, aspect: string): Promise<string | null> {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim();
  if (!token) return null;
  const aspect_ratio = aspect === '9:16' ? '9:16' : aspect === '1:1' ? '1:1' : '16:9';
  try {
    return await withRetry(async () => {
      const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait' },
        cache: 'no-store',
        body: JSON.stringify({ input: { prompt: framePrompt.slice(0, 2_000), aspect_ratio, num_outputs: 1, output_format: 'jpg' } }),
        signal: AbortSignal.timeout(40_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`flux-schnell ${res.status}`);
      if (!res.ok) return null;
      const j = (await res.json().catch(() => ({}))) as { status?: string; output?: unknown };
      const pick = (o: unknown): string | null =>
        typeof o === 'string' && /^https?:\/\//.test(o) ? o : Array.isArray(o) ? pick(o[o.length - 1]) : null;
      return j.status === 'succeeded' ? pick(j.output) : null;
    }, { maxAttempts: 2, baseDelayMs: 1500, label: 'flux-schnell-frame' });
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // STORYBOARD tier (not EXPENSIVE): one board fans out into plan + 6 per-scene
  // frame calls + retries, which tripped the 5/min EXPENSIVE limit (blank frames).
  const rl = await checkRateLimit(req, RATE_LIMITS.STORYBOARD);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    orientation?: string;
    style?: string;
    referenceImages?: unknown;
    locale?: string;
    /** 1-based scene to regenerate in isolation; omit to render the full board. */
    sceneOrdinal?: number;
    /** A user-EDITED shot description for the single-scene regen (Storyboard editing). */
    scenePrompt?: string;
    /** How many scenes (2 → ~10s · 6 → ~30s · 12 → ~60s). Clamped to [2, 12]. */
    sceneCount?: number;
    /** Music-Video mode → open the board with a cinematic drone/venue intro. */
    musicVideoMode?: boolean;
    /** Plan-only: return deterministic scene beats INSTANTLY (no LLM, no frames), so
     *  the client opens the board in ~1s and streams each frame in per-scene. */
    planOnly?: boolean;
    /** Scripts-only: run JUST the LLM Script Agent (story enrichment) and return the
     *  per-scene scripts. The client fires this in the background after the board
     *  opens, then threads the scripts into the render. Keeps the LLM off the
     *  board-open hot-path. */
    scriptsOnly?: boolean;
    /** Character-anchor: generate ONE protagonist portrait from the brief → returned
     *  as `anchorUrl` so the client can lock every scene frame to the same person. */
    characterAnchor?: boolean;
  };

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }

  const orientation: 'landscape' | 'vertical' = body.orientation === 'vertical' ? 'vertical' : 'landscape';
  const style = typeof body.style === 'string' && body.style.trim() ? body.style.trim() : null;
  const locale = typeof body.locale === 'string' ? body.locale : 'ka';
  // Scene count = film length: the user picks 10s (2 scenes) or 30s (6). The scene
  // count is driven by totalSec (count × clip seconds) — planFilmScenes splits the
  // runtime into FILM_CLIP_SEC beats, so totalSec is what actually sets the count.
  // Up to 12 scenes (the 60s Music-Video variant); 10s→2, 30s→6, 60s→12.
  const sceneCount = Math.max(2, Math.min(12, Math.round(typeof body.sceneCount === 'number' ? body.sceneCount : FILM_SCENE_COUNT)));
  const sceneTotalSec = sceneCount * FILM_CLIP_SEC;

  // Host any uploaded reference photos so the storyboard frames can lock the
  // protagonist's identity (and so the SAME selfie anchors the final render).
  // NOTE: these double as PER-SCENE anchors (scene i → image i), so the cap must be
  // sceneCount, NOT the legacy 3-photo identity limit — otherwise a 4th+ uploaded scene
  // frame was silently dropped and that scene got an AI-generated frame instead.
  const refList = normalizeReferenceImages(body.referenceImages, sceneCount);
  const hostedRefs = refList.length ? await Promise.all(refList.map((r, i) => hostRef(r, i))) : [];
  const selfie = hostedRefs.find((r) => /^https?:\/\//i.test(r)) ?? null;

  const musicVideo = body.musicVideoMode === true;
  const plan = planFilmScenes(prompt, { referenceImages: hostedRefs, style, orientation, totalSec: sceneTotalSec, musicVideo });
  const aspect = orientation === 'vertical' ? '9:16' : '16:9';
  const sessionId = `storyboard_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // One preview frame for a scene — 1K (fastest tier) so six land well within
  // maxDuration, and v2-1k still honours the reference-image (selfie) anchor.
  // Fail-open: any miss returns null and the scene plan still surfaces.
  // Diagnostic — which provider produced each frame (returned in the response so a
  // benchmark can confirm flux-schnell is actually firing; the re-host hides the source URL).
  const frameSourceTally = { fluxSchnell: 0, nanobanana: 0, replicateFlux: 0 };
  const genFrame = async (scenePrompt: string): Promise<string | null> => {
    try {
      const framePrompt = selfie
        ? `Cinematic film still, ${aspect} composition. ${scenePrompt} Featuring the EXACT same person as the reference image — identical face, hair and wardrobe. Photorealistic, professional cinematic colour grade.`
        : `Cinematic film still, ${aspect} composition. ${scenePrompt} Photorealistic, professional cinematic colour grade, sharp focus.`;
      // Primary = NanoBanana (via ServiceManager). ISOLATE its failure: if it throws
      // (e.g. the key is absent on this deployment, which left storyboards blank) or
      // returns nothing, we still fall through to the Replicate FLUX fallback below —
      // FLUX backs the film clips too, so its key is present wherever clips render.
      let raw: string | null = null;
      let source: 'fluxSchnell' | 'nanobanana' | 'replicateFlux' | null = null;
      // FAST path (gated by FAST_IMAGE_MODEL): flux-schnell renders in ~3.65s; on any
      // miss/429 it returns null and we fall through to the NanoBanana primary below.
      if (FAST_IMAGE_MODEL) { raw = await genFrameViaFluxSchnell(framePrompt, aspect); if (raw) source = 'fluxSchnell'; }
      if (!raw) {
        try {
          const r = await serviceManager.execute({
            sessionId,
            serviceContext: 'image',
            intent: 'image_generation',
            userPrompt: framePrompt,
            ...(selfie ? { imageUrl: selfie } : {}),
            selectedOptions: { aspect, aspectRatio: aspect, endpoint: 'v2-1k' },
            locale,
          });
          raw = typeof r.assetUrl === 'string' && /^https?:\/\//i.test(r.assetUrl) ? r.assetUrl : null;
          if (raw) source = 'nanobanana';
        } catch { raw = null; }
      }
      let resolved = raw;
      if (!resolved) { resolved = await genFrameViaReplicate(framePrompt, aspect); if (resolved) source = 'replicateFlux'; }
      if (source) frameSourceTally[source] += 1;
      // Re-host to a CSP-allowed Supabase URL (a raw provider temp URL is blocked by
      // img-src AND expires, which would break the render anchor too).
      return resolved ? await reHostFrame(resolved) : null;
    } catch {
      return null;
    }
  };

  // CHARACTER ANCHOR — generate ONE clean head-and-shoulders portrait of the film's
  // protagonist from the brief, returned as a reference URL. The client then feeds
  // this as the reference image to EVERY scene frame, so a text-only brief (no
  // uploaded selfie) still produces ONE locked character across all 6 scenes — the
  // frames anchor the LTX clips, so the whole 30s video keeps the same face / hair /
  // wardrobe. Fail-open: a miss returns null and the board falls back to per-scene
  // text generation (the prior, drift-prone behaviour).
  if (body.characterAnchor) {
    const anchorPrompt =
      `Character reference portrait — a clean, evenly-lit head-and-shoulders close-up of the SINGLE main character in this story: "${prompt.slice(0, 600)}". ` +
      `Looking toward camera, neutral softly-blurred background, photorealistic, sharp focus on the face. ` +
      `This is the DEFINITIVE identity reference for the entire film — one consistent person, exact same face, hair and wardrobe in every shot.`;
    const anchorUrl = await genFrame(anchorPrompt);
    return NextResponse.json({ success: true, anchorUrl });
  }

  // Single-scene regeneration — the user asked to re-roll just one frame.
  const sceneOrdinal = typeof body.sceneOrdinal === 'number' ? Math.floor(body.sceneOrdinal) : null;
  if (sceneOrdinal && sceneOrdinal >= 1 && sceneOrdinal <= plan.scenes.length) {
    const scene = plan.scenes[sceneOrdinal - 1]!;
    // Honor a user-EDITED shot description (Storyboard scene editing) when present,
    // so re-rolling the frame reflects the user's own wording; else the planned shot.
    const customPrompt = typeof body.scenePrompt === 'string' && body.scenePrompt.trim() ? body.scenePrompt.trim().slice(0, 600) : null;
    const frameUrl = await genFrame(customPrompt ?? scene.prompt);
    return NextResponse.json({ success: true, ordinal: sceneOrdinal, frameUrl });
  }

  // SCRIPTS-ONLY — run JUST the LLM Script Agent and return the per-scene story
  // scripts. The client fires this in the BACKGROUND after the board opens, then
  // threads the scripts into the render, so the ~10-15s LLM call never blocks the
  // board from appearing. Fail-open: a miss returns null (render uses deterministic).
  if (body.scriptsOnly) {
    // PROMPT AGENT (Sonnet) — produce the Master Film Brief: ONE locked character +
    // per-scene image prompts that embed it VERBATIM. The scene imagePrompts ride back
    // as `sceneScripts` (the existing render channel) and the locked character fragment
    // as `character`, which the client threads to the render so the protagonist never
    // drifts. Fail-open: a miss falls back to the haiku Script Agent.
    const tPA = Date.now();
    const brief = await runPromptAgent({
      brief: prompt, mode: musicVideo ? 'music_video' : 'documentary', sceneCount,
      length: sceneTotalSec, effect: style ?? 'Cinematic', language: locale,
      model: STORYBOARD_PROMPT_MODEL,
    });
    const promptAgentMs = Date.now() - tPA;
    // eslint-disable-next-line no-console
    console.log(`[storyboard] scriptsOnly prompt-agent (${STORYBOARD_PROMPT_MODEL}): ${promptAgentMs}ms`);
    if (brief) {
      return NextResponse.json({
        success: true,
        sceneScripts: brief.scenes.map((s) => s.imagePrompt),
        character: brief.character.imagePromptFragment,
        masterBrief: brief,
        scriptModel: STORYBOARD_PROMPT_MODEL,
        timings: { promptAgentMs },
      });
    }
    const scripts = (await generateSceneScripts(prompt, sceneCount)) ?? null;
    return NextResponse.json({ success: true, sceneScripts: scripts });
  }

  // PLAN-ONLY (fast) — return the DETERMINISTIC scene beats IMMEDIATELY (no LLM, no
  // frames) so the storyboard opens in ~1s; frames then stream in per-scene and the
  // story enrichment arrives separately (scriptsOnly). Each scene carries its full
  // frame prompt (the summary `prompt` is truncated for display).
  if (body.planOnly) {
    // ANCHOR MODE — the user uploaded MULTIPLE reference images: use them directly as
    // the ordered per-scene frames (scene 1 → image 1, scene 2 → image 2, …), skipping
    // FLUX for those scenes. The client renders them immediately AND threads them to the
    // render as per-scene anchors, so the film matches the uploaded images. A SINGLE
    // image stays a character-lock reference (unchanged behaviour).
    const anchorMode = hostedRefs.length >= 2;

    // SCRIPT-AWARE BOARD: when the brief carries an uploaded SCRIPT, the generic camera
    // BEATS ignore it (the "storyboard generates unrelated scenes" bug). Decompose the
    // script into real per-scene STORY shots with the LLM (haiku→Atlas, bounded ~14s) and
    // re-plan so each FRAME depicts the script. This is the ONLY reliable path for a
    // structured brief (a naive text split surfaces non-scene junk like camera/upload
    // notes). LLM unavailable → keep the generic plan (still clean cinematic stills, never
    // junk). The same scripts are returned for the render so it isn't re-derived.
    let boardPlan = plan;
    let boardScripts: string[] | null = null;
    const hasUploadedScript = /SCRIPT \(follow this EXACTLY/i.test(prompt);
    if (hasUploadedScript && !anchorMode) {
      const llmScripts = await Promise.race([
        generateSceneScripts(prompt, sceneCount).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
      ]);
      if (Array.isArray(llmScripts) && llmScripts.length) {
        boardScripts = llmScripts;
        boardPlan = planFilmScenes(prompt, { referenceImages: hostedRefs, style, orientation, totalSec: sceneTotalSec, musicVideo, sceneScripts: llmScripts });
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      seed: boardPlan.shared.seed,
      orientation,
      planOnly: true,
      anchorMode,
      scenes: boardPlan.scenes.map((s, i) => ({
        ordinal: s.ordinal,
        beat: s.beat,
        prompt: s.prompt.replace(/\s+/g, ' ').slice(0, 160),
        framePrompt: s.prompt,
        frameUrl: anchorMode && i < hostedRefs.length ? hostedRefs[i]! : null,
      })),
      sceneScripts: boardScripts,
    });
  }

  // Full board (legacy single-shot path) — enrich with the Master Prompt Agent (locked
  // character + per-scene image prompts), fail-open to the haiku Script Agent, then
  // render all frames in one request. Fail-open: a miss leaves `plan` in place.
  const tPromptAgent = Date.now();
  const masterBrief: MasterFilmBrief | null = await runPromptAgent({
    brief: prompt, mode: musicVideo ? 'music_video' : 'documentary', sceneCount,
    length: sceneTotalSec, effect: style ?? 'Cinematic', language: locale,
    model: STORYBOARD_PROMPT_MODEL,
  });
  const promptAgentMs = Date.now() - tPromptAgent;
  const sceneScripts = masterBrief
    ? masterBrief.scenes.map((s) => s.imagePrompt)
    : ((await generateSceneScripts(prompt, sceneCount)) ?? null);
  const characterLock = masterBrief?.character.imagePromptFragment ?? null;
  const storyPlan = sceneScripts
    ? planFilmScenes(prompt, { referenceImages: hostedRefs, style, orientation, sceneScripts, totalSec: sceneTotalSec, musicVideo, ...(characterLock ? { characterLock } : {}) })
    : plan;

  // Frame dispatch concurrency = 3. NOTE (benchmarked): on a Replicate token with the
  // reduced 6/min + burst-1 limit, flux-schnell only lands ~2-3 of 6 frames (the rest
  // 429 → NanoBanana fallback) REGARDLESS of concurrency — and serializing to 1 was
  // strictly WORSE (295s vs 164s) because it stops the NanoBanana fallbacks from
  // overlapping. So we keep 3 (overlaps the fallbacks) and the real lever for full
  // flux-schnell coverage is a higher Replicate rate-limit tier, not a concurrency knob.
  const frameConcurrency = 3;
  const tFrames = Date.now();
  const frames = await mapWithConcurrency(storyPlan.scenes, frameConcurrency, (scene) => genFrame(scene.prompt));
  // Retry any frame that failed (NanoBanana transient / rate-limit) in a second pass —
  // so the storyboard rarely shows a scene with a missing image ("not all scenes
  // generate"). One extra attempt per missing frame; still fail-soft to null.
  const missing = frames.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0);
  if (missing.length) {
    const retried = await mapWithConcurrency(missing.map((i) => storyPlan.scenes[i]!), frameConcurrency, (scene) => genFrame(scene.prompt));
    missing.forEach((sceneI, k) => { if (retried[k]) frames[sceneI] = retried[k]; });
  }
  const framesMs = Date.now() - tFrames;
  // eslint-disable-next-line no-console
  console.log(`[storyboard] prompt-agent (${STORYBOARD_PROMPT_MODEL}): ${promptAgentMs}ms · frames: ${framesMs}ms · sources ${JSON.stringify(frameSourceTally)}`);

  // ANCHOR MODE (full path) — ≥2 uploaded images override the generated frames as the
  // ordered per-scene anchors, mirroring the planOnly path.
  const anchorModeFull = hostedRefs.length >= 2;
  const scenes = storyPlan.scenes.map((s, i) => ({
    ordinal: s.ordinal,
    beat: s.beat,
    // A short, human-readable shot summary (the full enriched prompt is long).
    prompt: s.prompt.replace(/\s+/g, ' ').slice(0, 160),
    frameUrl: anchorModeFull && i < hostedRefs.length ? hostedRefs[i]! : (frames[i] ?? null),
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
    // Prompt-Agent locked character fragment — threaded to the render so the
    // protagonist's appearance is identical across every clip.
    character: characterLock,
    // Diagnostic — provider that produced each frame (confirms flux-schnell vs the
    // NanoBanana/Replicate-FLUX fallback; the re-host hides it from the frame URLs).
    frameSources: frameSourceTally,
    // Diagnostic — the Prompt-Agent model used + the script/frames time split (the script
    // step was the dominant cost; haiku cuts it from ~80s to ~5-10s).
    scriptModel: STORYBOARD_PROMPT_MODEL,
    timings: { promptAgentMs, framesMs },
  });
}
