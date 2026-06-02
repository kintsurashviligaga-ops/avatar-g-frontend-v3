/**
 * lib/chat/filmReadiness.ts
 * =========================
 * Pure, env-driven readiness analysis for the FINAL leg of the 30-second film
 * pipeline — the editor / assembler — so the structural report at
 * GET /api/system/film-readiness covers the WHOLE chain, not just the four
 * generation agents (storyboard / LTX / Udio / ElevenLabs).
 *
 * Why this exists: the generation report can read "READY — full autonomous
 * chain can fire" while the stitch + delivery leg is silently un-provisioned.
 * In that state every clip renders, then `/api/video/assemble` cannot host the
 * finished master (Supabase Storage unset → `assembleWithFfmpeg` throws
 * "master upload failed"). The user gets clips but never a downloadable film.
 * This module makes that failure mode visible BEFORE a render is paid for.
 *
 * Kept free of `server-only`, Next, and Supabase imports so it is unit-testable
 * in isolation: it reads ONLY an injected env map and returns names + booleans,
 * never a secret value.
 *
 * Mirrors the exact env contract of the assemble route:
 *   - GPU stitch (quality path): readRunPodConfig →
 *       RUNPOD_RENDER_WEBHOOK_URL + (RUNPOD_RENDER_WEBHOOK_TOKEN | RUNPOD_API_TOKEN)
 *   - CPU stitch (always-available fallback): bundled `ffmpeg-static` binary
 *   - Clip failover + silent-film score rescue: REPLICATE_API_TOKEN
 *   - Master hosting (HARD requirement to deliver a playable URL):
 *       (NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 */

export type StitchPath = 'gpu-runpod' | 'cpu-ffmpeg';

export interface EditorReadiness {
  /** GPU RunPod worker fully wired (webhook URL + a usable token). */
  gpuConfigured: boolean;
  /** Bundled CPU FFmpeg binary present (always true in this deploy — the
   *  `ffmpeg-static` package ships the binary), so a stitch can always run. */
  cpuFallbackAvailable: boolean;
  /** Which encoder the assemble route will actually choose right now. */
  stitchPath: StitchPath;
  /** REPLICATE_API_TOKEN present → LTX clip failover AND the MusicGen
   *  silent-film score rescue are both armed. */
  failoverAndScoreFallback: boolean;
  /** Supabase Storage wired → the stitched master can be uploaded + signed and
   *  returned as a playable URL. Without it the stitch runs then fails on
   *  upload. This is the make-or-break gate for "can the user get a film". */
  masterHostingConfigured: boolean;
  /** True iff a stitch CAN run AND its output can be hosted + handed back. */
  canDeliverMaster: boolean;
  /** Env-var NAMES consulted (never values) for transparency in the report. */
  checkedEnv: {
    gpu: readonly string[];
    failover: readonly string[];
    masterHosting: readonly string[];
  };
}

const GPU_ENV = ['RUNPOD_RENDER_WEBHOOK_URL', 'RUNPOD_RENDER_WEBHOOK_TOKEN', 'RUNPOD_API_TOKEN'] as const;
const FAILOVER_ENV = ['REPLICATE_API_TOKEN'] as const;
const MASTER_HOSTING_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

function present(env: Record<string, string | undefined>, name: string): boolean {
  return String(env[name] ?? '').trim().length > 0;
}

/**
 * Analyze the editor/assembly leg from an env map.
 *
 * @param env             env source (defaults to process.env)
 * @param cpuBinaryBundled whether the `ffmpeg-static` CPU binary is present.
 *   Defaults to true because the binary ships with the package in this deploy;
 *   injectable purely so the unit test can exercise the "no encoder at all"
 *   edge without mocking the filesystem.
 */
export function computeEditorReadiness(
  env: Record<string, string | undefined> = process.env,
  cpuBinaryBundled = true,
): EditorReadiness {
  const gpuConfigured =
    present(env, 'RUNPOD_RENDER_WEBHOOK_URL') &&
    (present(env, 'RUNPOD_RENDER_WEBHOOK_TOKEN') || present(env, 'RUNPOD_API_TOKEN'));

  const cpuFallbackAvailable = cpuBinaryBundled;

  // The assemble route picks GPU when configured, else stitches on-node with
  // the bundled CPU binary. If neither is available no stitch can run at all.
  const stitchPath: StitchPath = gpuConfigured ? 'gpu-runpod' : 'cpu-ffmpeg';
  const canStitch = gpuConfigured || cpuFallbackAvailable;

  const failoverAndScoreFallback = present(env, 'REPLICATE_API_TOKEN');

  const masterHostingConfigured =
    (present(env, 'NEXT_PUBLIC_SUPABASE_URL') || present(env, 'SUPABASE_URL')) &&
    present(env, 'SUPABASE_SERVICE_ROLE_KEY');

  const canDeliverMaster = canStitch && masterHostingConfigured;

  return {
    gpuConfigured,
    cpuFallbackAvailable,
    stitchPath,
    failoverAndScoreFallback,
    masterHostingConfigured,
    canDeliverMaster,
    checkedEnv: {
      gpu: GPU_ENV,
      failover: FAILOVER_ENV,
      masterHosting: MASTER_HOSTING_ENV,
    },
  };
}

/** Human-readable one-line verdict for the editor leg. */
export function editorVerdict(r: EditorReadiness): string {
  if (!r.canDeliverMaster) {
    if (!r.gpuConfigured && !r.cpuFallbackAvailable) {
      return 'BLOCKED — no stitch encoder available (neither GPU worker nor CPU FFmpeg binary)';
    }
    return 'BLOCKED — stitch can run but the finished master cannot be hosted (Supabase Storage unset)';
  }
  const lane = r.stitchPath === 'gpu-runpod' ? 'GPU RunPod (60fps interpolation)' : 'CPU FFmpeg (bundled, no extra infra)';
  const failover = r.failoverAndScoreFallback
    ? 'clip failover + silent-film score rescue armed'
    : 'no Replicate failover (a dead clip or missing score has no rescue)';
  return `READY — master delivers via ${lane}; ${failover}`;
}

/**
 * Build editor-leg sync instructions (Vercel env-var actions) for whatever is
 * missing. Empty array when the leg is fully production-grade.
 */
export function editorSyncInstructions(r: EditorReadiness): Array<{ leg: string; action: string }> {
  const out: Array<{ leg: string; action: string }> = [];

  if (!r.masterHostingConfigured) {
    out.push({
      leg: 'master-hosting',
      action:
        'Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) in Vercel — without them the stitched master cannot be uploaded/signed and the assemble route fails on upload.',
    });
  }
  if (!r.failoverAndScoreFallback) {
    out.push({
      leg: 'failover-and-score',
      action:
        'Set REPLICATE_API_TOKEN in Vercel to arm LTX clip failover and the MusicGen silent-film score rescue (optional but recommended — without it a dead clip or missing Udio score has no automatic recovery).',
    });
  }
  if (!r.gpuConfigured) {
    out.push({
      leg: 'gpu-stitch',
      action:
        'Optional quality upgrade: set RUNPOD_RENDER_WEBHOOK_URL + RUNPOD_RENDER_WEBHOOK_TOKEN (or RUNPOD_API_TOKEN) for GPU encode + 60fps interpolation. Without it the bundled CPU FFmpeg path still delivers the full 30s master.',
    });
  }
  return out;
}
