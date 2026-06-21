/**
 * POST /api/pipeline/remix
 * ========================
 * Conversational editing of an ALREADY-RENDERED film (the v326 gap). Given the
 * original brief + a natural-language edit ("make scene 2 darker") + the landed
 * per-scene clips, it:
 *   1. Re-derives the EXACT original scene plan deterministically — same seed +
 *      same per-scene prompts as the first render (filmPipeline.planFilmScenes).
 *   2. Interprets the edit into the affected scene ordinals (remixPlanner, pure).
 *   3. Re-renders ONLY the edited scenes via the SAME primitive the film studio
 *      uses — ServiceManager.execute({serviceContext:'video'}) → poll — which
 *      fails over to the Replicate-hosted LTX model when no direct LTX key is
 *      present, folding the edit into each scene's prompt while keeping the
 *      shared continuity seed.
 *   4. REUSES the original landed clips verbatim for every untouched scene
 *      (byte-level continuity — no drift, no wasted render) and re-stitches the
 *      final cut with the production assembler (assembleWithFfmpeg). A scene whose
 *      re-render fails falls back to its original clip, so a provider miss leaves
 *      the film intact rather than dropping a scene.
 *
 * Purely additive — it adds a route the production architecture lacked; it does
 * not modify the create-film flow.
 */
import { NextRequest } from 'next/server';
import { planFilmScenes, buildFilmClipRequest, type FilmScene, type FilmShared } from '@/lib/chat/filmPipeline';
import { planRemixFromText } from '@/lib/chat/remixPlanner';
import { assembleContinuityCut, summarizeContinuity, type SceneClipRef } from '@/lib/chat/remixContinuity';
import { ServiceManager } from '@/lib/chat/ServiceManager';
import { assembleWithFfmpeg } from '@/lib/orchestrator/ffmpeg-assembly';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

interface RemixBody {
  originalPrompt?: string;
  editRequest?: string;
  /** The original film's landed per-scene clips (ordinal → url). */
  landedClips?: { ordinal: number; url: string }[];
  /** Optional continuity context, matching the original render for prompt fidelity. */
  avatarReference?: string | null;
  style?: string | null;
  sessionId?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Re-render ONE edited scene via the same primitive the film studio uses
 * (ServiceManager → Replicate-hosted LTX failover), polling to completion.
 * Returns the new clip URL, or null when the video provider is unavailable / the
 * render fails — the caller then keeps the scene's ORIGINAL clip (film intact).
 */
async function rerenderScene(
  sm: ServiceManager,
  scene: FilmScene,
  shared: FilmShared,
  instruction: string,
  sessionId: string,
): Promise<string | null> {
  try {
    const clipReq = buildFilmClipRequest(scene, shared);
    const dispatch = await sm.execute({
      sessionId,
      serviceContext: 'video',
      intent: 'video_generation',
      userPrompt: `${clipReq.userPrompt} EDIT: ${instruction}.`,
      selectedOptions: clipReq.selectedOptions,
    });
    if (dispatch.assetUrl) return dispatch.assetUrl; // synchronous path
    const ref = dispatch.predictionId;
    if (!ref) return null;

    // Poll the async render to completion (bounded so a stuck job can't hang).
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const p = await sm.poll(ref, sessionId);
      if (p.assetUrl) return p.assetUrl;
      const st = (p as { predictionStatus?: string }).predictionStatus;
      if (st === 'failed' || st === 'canceled' || st === 'error') return null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  // Rate-limit: this route triggers real provider renders + CPU assembly against
  // the platform's keys, so it is gated exactly like the other AI pipeline routes.
  const limited = await checkRateLimit(req, RATE_LIMITS.AI);
  if (limited) return limited;

  const stamp = Date.now();

  let body: RemixBody;
  try {
    body = (await req.json()) as RemixBody;
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const originalPrompt = String(body.originalPrompt ?? '').trim();
  const editRequest = String(body.editRequest ?? '').trim();
  if (!originalPrompt || !editRequest) {
    return json({ error: 'originalPrompt and editRequest are required' }, 400);
  }
  const sessionId = (typeof body.sessionId === 'string' && body.sessionId.trim()) || `remix_${stamp}`;

  const landedClips: SceneClipRef[] = Array.isArray(body.landedClips)
    ? body.landedClips
        .filter((c): c is { ordinal: number; url: string } => !!c && typeof c.ordinal === 'number' && typeof c.url === 'string' && c.url.length > 0)
        .map((c) => ({ ordinal: c.ordinal, url: c.url }))
    : [];

  // 1. Re-derive the EXACT original scene plan (deterministic → same seed + prompts).
  const plan = planFilmScenes(originalPrompt, {
    avatarReference: body.avatarReference ?? undefined,
    style: body.style ?? undefined,
  });
  const sceneCount = plan.scenes.length;

  // 2. Interpret the edit → affected ordinals (+ per-scene instruction).
  const remix = planRemixFromText(editRequest, sceneCount);
  if (remix.editedScenes.length === 0) {
    return json({ success: false, message: `I couldn’t map “${editRequest}” to a scene. Try e.g. “make scene 2 darker” or “change the ending’s lighting”.` }, 200);
  }

  // 3. Re-render ONLY the edited scenes (the rest are reused verbatim). Capped +
  //    run in PARALLEL so wall-clock ≈ one scene's render (not the sum), keeping
  //    the worst case inside the 300s function ceiling even on a broad edit.
  const MAX_EDIT_SCENES = 4;
  const edits = remix.editedScenes.slice(0, MAX_EDIT_SCENES);
  const sm = new ServiceManager();
  const rerendered = new Map<number, string>();
  await Promise.all(
    edits.map(async (edit) => {
      const scene = plan.scenes.find((s) => s.ordinal === edit.ordinal);
      if (!scene) return;
      const url = await rerenderScene(sm, scene, plan.shared, edit.instruction, sessionId);
      if (url) rerendered.set(edit.ordinal, url);
    }),
  );

  // 4. Continuity telemetry: reused vs re-rendered vs (failed →) pending.
  const cut = assembleContinuityCut({
    sceneCount,
    editedOrdinals: edits.map((e) => e.ordinal),
    originalClips: landedClips,
    rerendered,
    seeds: new Map(plan.scenes.map((s) => [s.ordinal, s.seed])),
  });

  // Build the final timeline: prefer the re-rendered clip; fall back to the
  // ORIGINAL landed clip if a re-render failed — so a provider miss leaves the
  // film intact (the edit simply doesn't apply) rather than dropping a scene.
  const landedByOrdinal = new Map(landedClips.map((c) => [c.ordinal, c.url]));
  const segments: { ordinal: number; url: string }[] = [];
  for (let ordinal = 1; ordinal <= sceneCount; ordinal += 1) {
    const url = rerendered.get(ordinal) ?? landedByOrdinal.get(ordinal);
    if (url) segments.push({ ordinal, url });
  }

  if (segments.length < 2) {
    return json({
      success: false,
      message: 'Not enough clips to re-stitch the edited film (need ≥2). The edited scene couldn’t render in this environment — the original film is unchanged.',
      summary: remix.summary,
      continuity: cut,
    }, 200);
  }

  // 5. Re-stitch via the production assembler (CPU FFmpeg, same as the produce route).
  let masterUrl: string | null = null;
  try {
    const result = await assembleWithFfmpeg({
      segments: segments.map((s) => ({ url: s.url })),
      voiceoverUrl: null,
      musicUrl: null,
      sfxUrl: null,
      globalRender: { transition: 'crossfade', vocal_ducking_pct: 30, fps: 24 },
      pipelineId: `remix_${stamp}`,
    });
    masterUrl = result?.url ?? null;
  } catch {
    /* assembler failed — surfaced below as success:false */
  }

  return json({
    success: !!masterUrl,
    masterUrl,
    summary: remix.summary,
    restitch: summarizeContinuity(cut),
    continuity: {
      reused: cut.reused,
      rerendered: cut.rerendered,
      pending: cut.pending,
      total: cut.total,
      scenes: cut.scenes.map((s) => ({ ordinal: s.ordinal, action: s.action })),
    },
  }, 200);
}
