/**
 * lib/genjutsu/capabilities.ts — which ops are OPEN right now, and why not when they are not. Server-only.
 *
 * ⚠️ OPEN MEANS A REAL ROUTE EXISTS END TO END, NOT THAT A FLAG IS ON. Each op needs its own flag AND the engine
 * behind it to be configured, and the panel shows an op LOCKED with a plain "soon" line unless this says open:
 *
 *   scene   GENJUTSU_SCENE_ENABLED (ON unless set to 0/false/off — Veo reference-to-video is the studio's own
 *           primary video engine) + a Veo transport configured (Vertex AI or the Gemini API key).
 *   motion  GENJUTSU_MOTION_ENABLED (OFF by default) + STUDIO_V2 + Higgsfield credentials + the motion model enabled
 *           in lib/providers/registry. Never run live (it needs a source video and a funded Higgsfield account).
 *   swap    GENJUTSU_SWAP_ENABLED (OFF by default) + the above + `hf/genjutsu-swap` REGISTERED. It is not — the
 *           registry only knows Genjutsu's motion-transfer — so swap stays locked until that entry is added.
 *
 * The reason is detailed here (`flag_off` / `engine_not_configured` / `engine_missing`) for logs and tests, and
 * deliberately coarse on the wire (`open` | `soon`): an anonymous visitor does not need to learn which of our provider
 * keys is missing.
 */
import 'server-only';
import { isEnabledByDefault, isTruthyFlag } from '@/lib/env/flag';
import { createHiggsfieldAdapter } from '@/lib/providers/higgsfield/adapter';
import { isModelEnabled } from '@/lib/providers/registry';
import { studioV2Enabled } from '@/lib/studio/flags';
import { veoTransport } from '@/lib/veo/engine';
import type { GenjutsuOp, GenjutsuQuality } from './types';

export type OpReason = 'ok' | 'flag_off' | 'engine_not_configured' | 'engine_missing';
export interface OpStatus {
  op: GenjutsuOp;
  open: boolean;
  reason: OpReason;
}

/** The registry id each Higgsfield op runs on. Env-overridable so the owner can move motion to Genjutsu's own model. */
export const SWAP_MODEL_ID = 'hf/genjutsu-swap';

export function motionModelId(quality: GenjutsuQuality | null | undefined, env: NodeJS.ProcessEnv = process.env): string {
  if (quality === 'pro') return 'hf/kling-3-motion-pro';
  const override = (env.GENJUTSU_MOTION_MODEL ?? '').trim();
  return /^hf\/[a-z0-9.-]{1,60}$/.test(override) ? override : 'hf/kling-3-motion-std';
}

export interface Probes {
  veoReady(): boolean;
  /** STUDIO_V2 is on and the Higgsfield credential pair exists. */
  hfReady(env: NodeJS.ProcessEnv): boolean;
  modelEnabled(id: string, env: NodeJS.ProcessEnv): boolean;
}

export const DEFAULT_PROBES: Probes = {
  veoReady: () => veoTransport() !== null,
  hfReady: (env) => studioV2Enabled(env) && createHiggsfieldAdapter(env) !== null,
  modelEnabled: (id, env) => isModelEnabled(id, env),
};

export const sceneFlag = (env: NodeJS.ProcessEnv = process.env): boolean => isEnabledByDefault(env.GENJUTSU_SCENE_ENABLED);
export const motionFlag = (env: NodeJS.ProcessEnv = process.env): boolean => isTruthyFlag(env.GENJUTSU_MOTION_ENABLED);
export const swapFlag = (env: NodeJS.ProcessEnv = process.env): boolean => isTruthyFlag(env.GENJUTSU_SWAP_ENABLED);

export function opStatuses(env: NodeJS.ProcessEnv = process.env, probes: Probes = DEFAULT_PROBES): Record<GenjutsuOp, OpStatus> {
  const status = (op: GenjutsuOp, reason: OpReason): OpStatus => ({ op, open: reason === 'ok', reason });

  const scene: OpStatus = !sceneFlag(env) ? status('scene', 'flag_off') : !probes.veoReady() ? status('scene', 'engine_not_configured') : status('scene', 'ok');

  const hf = (flag: boolean, op: 'motion' | 'swap', modelId: string): OpStatus => {
    if (!flag) return status(op, 'flag_off');
    if (!probes.hfReady(env)) return status(op, 'engine_not_configured');
    if (!probes.modelEnabled(modelId, env)) return status(op, 'engine_missing');
    return status(op, 'ok');
  };

  return {
    scene,
    motion: hf(motionFlag(env), 'motion', motionModelId('standard', env)),
    swap: hf(swapFlag(env), 'swap', SWAP_MODEL_ID),
  };
}

/** The coarse, anonymous-safe view the browser gets. */
export function publicOpStatuses(env: NodeJS.ProcessEnv = process.env, probes: Probes = DEFAULT_PROBES): Record<GenjutsuOp, { open: boolean; state: 'open' | 'soon' }> {
  const s = opStatuses(env, probes);
  const view = (o: OpStatus) => ({ open: o.open, state: (o.open ? 'open' : 'soon') as 'open' | 'soon' });
  return { scene: view(s.scene), motion: view(s.motion), swap: view(s.swap) };
}
