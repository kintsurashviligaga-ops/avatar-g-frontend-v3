/**
 * app/api/system/film-readiness/route.ts
 * ======================================
 * PHASE 46 §1 — Runtime structural configuration report for the 30-second film
 * pipeline. Hit this on the LIVE Vercel deployment to see, per leg, whether the
 * production shell has what that leg's engine needs — without ever exposing a
 * secret value.
 *
 *   GET /api/system/film-readiness
 *
 * The four generation legs are Google's on Vertex AI (lib/chat/filmEngines): the Gemini storyboard, Veo clips, the
 * Lyria score and the Cloud TTS voice. For each it reports:
 *   - present: can the leg's engine serve with this env?
 *   - engine:  which engine serves it
 *   - missing: the env-variable NAMES that keep it from serving (never a value)
 * Until 2026-10-23 the legs were Nano Banana, LTX, Udio and ElevenLabs, each with its key's aliases, and a deploy
 * without those keys read BLOCKED although the film no longer used any of them.
 *
 * The report is names-only by construction: it returns boolean presence and
 * env-var NAMES, and never returns, logs, or hashes the secret material. Use it
 * as the single source of truth for what to sync in the Vercel dashboard.
 */

import { NextResponse } from 'next/server';
import { computeFilmEngines } from '@/lib/chat/filmEngines';
import { computeEditorReadiness, editorVerdict, editorSyncInstructions } from '@/lib/chat/filmReadiness';
import { opsCallerAllowed, opsNotFound } from '@/lib/security/opsAccess';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  // ⚠️ OPERATORS ONLY (lib/security/opsAccess). Names-only is still a map of exactly which credentials this deployment
  // lacks — reconnaissance, not product data. Non-admins get a 404 in production.
  if (!(await opsCallerAllowed(req))) return opsNotFound();
  const providers = computeFilmEngines();
  const byAgent = Object.fromEntries(providers.map((p) => [p.agent, p.present])) as Record<(typeof providers)[number]['agent'], boolean>;

  // The director (Veo) is the hard floor: no clips can render without it. The score and the voice are the film's own
  // legs: a missing one is that leg's outcome (no music, no narration), never another engine.
  const canRenderClips = byAgent.director;
  const canScore = byAgent.score;
  const canVoice = byAgent.voice;
  const generationAutonomous = canRenderClips && (canScore || canVoice);

  // PHASE 56 §1 — cover the FINAL leg: clips alone are not a film. The editor /
  // assembler must be able to stitch the timeline AND host the master, or the
  // user pays for a render that never yields a downloadable URL. Compute it
  // from the same env contract the assemble route enforces at call time.
  const editor = computeEditorReadiness();
  const canDeliverMaster = editor.canDeliverMaster;

  // "Fully autonomous" now means the WHOLE chain — generate, stitch, AND
  // deliver. The old generation-only field is preserved under its own name so
  // nothing that read it breaks.
  const fullyAutonomous = generationAutonomous && canDeliverMaster;

  const missing = providers.filter((p) => !p.present);
  const providerSync = missing.map((p) => ({
    provider: p.agent,
    role: p.role,
    action: `${p.engine} cannot serve: set or fix ${p.missing.join(', ')} in the Vercel project (Settings → Environment Variables → Production). The Vertex identity is the keyless WIF chain (docs/VEO_ENGINE.md); never an API key.`,
  }));
  const editorSync = editorSyncInstructions(editor).map((e) => ({
    provider: 'editor' as const,
    role: e.leg,
    action: e.action,
  }));
  const syncInstructions = [...providerSync, ...editorSync];

  // Whole-chain verdict: no Veo or an un-hostable master both mean the user
  // cannot receive a finished film, so both are BLOCKED.
  const verdict = !canRenderClips
    ? 'BLOCKED — Veo on Vertex AI is not configured; no clips can render'
    : !canDeliverMaster
      ? `BLOCKED (delivery) — clips render but ${editorVerdict(editor).replace(/^BLOCKED — /, '')}`
      : fullyAutonomous
        ? 'READY — full autonomous chain can fire end-to-end (generate → stitch → deliver)'
        : 'PARTIAL — clips render + master delivers; the film has no music and no narration until Lyria or Cloud TTS can serve';

  return NextResponse.json({
    pipeline: '30-second-film',
    generatedAt: new Date().toISOString(),
    summary: {
      canRenderClips,
      canScore,
      canVoice,
      canDeliverMaster,
      stitchPath: editor.stitchPath,
      generationAutonomous,
      fullyAutonomous,
      verdict,
    },
    providers,
    editor: {
      ...editor,
      verdict: editorVerdict(editor),
      note:
        'The assemble route picks the GPU RunPod worker when configured, else stitches on-node with the bundled CPU FFmpeg binary (always available). A playable master REQUIRES Supabase Storage (master hosting). There is no clip failover or score rescue: a missed clip or score is that leg\'s own outcome, never a second provider.',
    },
    syncInstructions,
    note: 'Names-only report. Presence reflects whether the leg\'s engine has the configuration it needs; secret values are never read into the response. A configured leg can still be refused at call time (e.g. a missing IAM grant) — this report confirms wiring, not validity; /api/health/public runs the free live checks.',
  });
}
