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
import { planFilmScenes, buildFilmClipRequest, clampClipSec, FILM_CLIP_SEC, type FilmScene, type FilmShared } from '@/lib/chat/filmPipeline';
import { planRemixFromText } from '@/lib/chat/remixPlanner';
import { assembleContinuityCut, summarizeContinuity, type SceneClipRef } from '@/lib/chat/remixContinuity';
import { ServiceManager } from '@/lib/chat/ServiceManager';
import { assembleWithFfmpeg } from '@/lib/orchestrator/ffmpeg-assembly';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';

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
  /** The original film's per-scene length (4–8s). Absent → the 8s default grid. */
  clipSec?: number;
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

  // ⚠️ SIGNED-IN AND PAID. This route re-renders up to four scenes on the platform's video keys (Veo: up to $3.20
  // a clip) and it had neither a session check nor a charge — any direct POST was free video. Now: a session, the
  // remix price RESERVED before any render (a read-only balance check let parallel requests all pass it), and that
  // reservation handed back through the ledger when no re-cut is delivered — a remix whose scenes all failed returns
  // the original film unchanged and costs nothing.
  const { user } = await authedClientFromRequest(req);
  if (mustSignInToGenerate(user?.id)) return json(signInToGenerateBody(), 401);
  const remixCost = creditCostFor('remix');

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

  // A remix re-cuts an EXISTING film: without at least two of its landed clips there is nothing to re-stitch, and the
  // "not enough clips" exit below used to answer AFTER the re-renders — handing back freshly rendered, unpaid clips.
  if (new Set(landedClips.map((c) => c.ordinal)).size < 2) {
    return json({ success: false, error: 'landed_clips_required', message: 'A remix needs the film\u2019s rendered clips (at least two).' }, 400);
  }

  // Reserve the remix price up front (deduct_credits refuses an overdraw). Admin/demo callers without a user id pay
  // nothing. The ref is per request; the refund below pays back exactly what the ledger shows under it.
  const chargeRef = user?.id ? `pipeline-remix:${user.id}:${stamp}` : null;
  if (user?.id && chargeRef) {
    const debit = await deductCredits(user.id, remixCost, chargeRef);
    if (!debit.ok && debit.reason === 'insufficient') {
      return json({ success: false, error: 'insufficient_credits', requiredCredits: remixCost, message: `Not enough credits for a remix (needs ${remixCost}). Please top up to continue.` }, 402);
    }
    if (!debit.ok && debit.reason === 'error') {
      return json({ success: false, error: 'ledger_unavailable', message: 'Credit ledger unavailable — please retry.' }, 503);
    }
  }
  const releaseCharge = async (): Promise<void> => {
    if (user?.id && chargeRef) await refundDebitByRef(user.id, chargeRef).catch(() => null);
  };

  // 1. Re-derive the EXACT original scene plan (deterministic → same seed + prompts).
  // The GRID has to be re-derived too, from the clips that actually landed: a film is no longer always
  // 3 × 8s (a script written as 4 × 6s renders as 4 × 6s). Re-planning at the default grid gave a
  // 3-scene plan for a 4-scene film, so ordinal 4 had no scene and was silently dropped from the
  // re-stitch. Fail-safe: with fewer than 2 landed clips there is nothing to infer, so the default holds.
  const landedCount = landedClips.length >= 2 ? Math.max(...landedClips.map((c) => c.ordinal)) : 0;
  const gridClipSec = clampClipSec(body.clipSec, FILM_CLIP_SEC);
  const plan = planFilmScenes(originalPrompt, {
    avatarReference: body.avatarReference ?? undefined,
    style: body.style ?? undefined,
    clipSec: gridClipSec,
    ...(landedCount >= 2 ? { totalSec: landedCount * gridClipSec } : {}),
  });
  const sceneCount = plan.scenes.length;

  // 2. Interpret the edit → affected ordinals (+ per-scene instruction).
  const remix = planRemixFromText(editRequest, sceneCount);
  if (remix.editedScenes.length === 0) {
    await releaseCharge();
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
  // Carry each scene's planned duration (FILM_CLIP_SEC=5) so the re-stitch reproduces
  // the ORIGINAL film's exact total (6×5 = 30.0s). Without this the assembler fell back
  // to a 6s/clip default + crossfade and the master drifted to ~25–31s. (remix-duration fix)
  const durByOrdinal = new Map(plan.scenes.map((s) => [s.ordinal, s.durationSec]));
  const segments: { ordinal: number; url: string; durationSec: number }[] = [];
  for (let ordinal = 1; ordinal <= sceneCount; ordinal += 1) {
    const url = rerendered.get(ordinal) ?? landedByOrdinal.get(ordinal);
    if (url) segments.push({ ordinal, url, durationSec: durByOrdinal.get(ordinal) ?? gridClipSec });
  }

  if (segments.length < 2) {
    await releaseCharge();
    // No clip URLs in this answer: a re-rendered clip is part of the paid re-cut, never a free hand-out.
    return json({
      success: false,
      message: 'Not enough clips to re-stitch the edited film (need ≥2). The edited scene couldn’t render in this environment — the original film is unchanged.',
      summary: remix.summary,
    }, 200);
  }

  // 5. Re-stitch via the production assembler (CPU FFmpeg, same as the produce route).
  let masterUrl: string | null = null;
  try {
    const result = await assembleWithFfmpeg({
      segments: segments.map((s) => ({ url: s.url, durationSec: s.durationSec })),
      voiceoverUrl: null,
      musicUrl: null,
      sfxUrl: null,
      // 'cut' (not crossfade) matches the production film assemble path so the total
      // duration math is identical (transSec=0) — the master lands at exactly 30.0s.
      globalRender: { transition: 'cut', vocal_ducking_pct: 30, fps: 24 },
      pipelineId: `remix_${stamp}`,
    });
    masterUrl = result?.url ?? null;
  } catch {
    /* assembler failed — surfaced below as success:false */
  }

  // P18 / §13 — file the remixed cut into the user's durable Library
  // (generation_jobs), exactly like a fresh film, so the edited version shows in
  // History instead of being lost. Best-effort + signed-in only (anonymous trials
  // have no account to file it under); keyed by the remix session for idempotency.
  // The reservation stands only for a delivered re-cut that actually changed a scene.
  if (!masterUrl || rerendered.size === 0) await releaseCharge();
  if (masterUrl) {
    try {
      if (user?.id) {
        await recordCompletedFilm({
          id: `remix_${stamp}`,
          userId: user.id,
          url: masterUrl,
          prompt: `${originalPrompt} — ${editRequest}`.slice(0, 500),
          orientation: 'landscape',
          result: { url: masterUrl, kind: 'film', remix: true, summary: remix.summary },
        });
      }
    } catch {
      /* library filing is best-effort — never fails the remix response */
    }
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
