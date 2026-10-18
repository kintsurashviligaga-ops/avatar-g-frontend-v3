/**
 * lib/chat/filmChainRuntime.ts — the live wiring of lib/chat/filmChain: ffmpeg reads the last frame, Supabase Storage
 * hosts it, the film start's own submit sends the scene, and the ledger records or returns the scene's share.
 */
import 'server-only';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { refundCredits } from '@/lib/orchestrator/ledger';
import { extractLastFrame } from '@/lib/video/lastFrame';
import { submitFilmClip } from './filmComposite';
import { recordFilmScenes } from './filmBilling';
import { veoOperationOfTaskRef } from './filmSceneRefund';
import { FILM_CHAIN_TTL_SEC, type FilmChainDeps, type FilmChainPlan, type FilmChainScene } from './filmChain';

const CLIP_MODELS = new Set(['kling', 'hailuo']);

/** The scene's clip request, starting from `startFrame` when there is one. Never ends on another frame. */
export function chainedClipRequest(scene: FilmChainScene, startFrame: string | null): { userPrompt: string; selectedOptions: Record<string, string> } {
  const { veoEndFrame: _end, ...options } = scene.selectedOptions;
  return { userPrompt: scene.userPrompt, selectedOptions: startFrame ? { ...options, characterReference: startFrame } : options };
}

export const filmChainDeps: FilmChainDeps = {
  extractLastFrame: (url) => extractLastFrame(url),

  hostFrame: (plan: FilmChainPlan, ordinal: number, jpeg: Buffer) =>
    uploadBufferAndSign('renders', `film-chain/${plan.tokenId}/scene-${ordinal}-start.jpg`, jpeg, 'image/jpeg', FILM_CHAIN_TTL_SEC),

  dispatch: async (plan, scene, startFrame) => {
    const model = plan.videoModel && CLIP_MODELS.has(plan.videoModel) ? (plan.videoModel as 'kling' | 'hailuo') : null;
    const leg = await submitFilmClip(
      { userId: plan.uid, sessionId: plan.sessionId, locale: plan.locale, videoModel: model },
      chainedClipRequest(scene, startFrame),
      scene,
      plan.compositeId,
      plan.forecast.wholesaleGel,
      plan.forecast.retailGel,
      true, // the film was charged once, up front
    );
    return leg.status === 'queued' && leg.taskRef
      ? { taskRef: leg.taskRef, status: 'queued' as const }
      : { taskRef: null, status: 'failed' as const, ...(leg.error ? { error: leg.error } : {}) };
  },

  recordShare: async (plan, ordinal, taskRef) => {
    if (plan.sceneCredits <= 0) return;
    const operation = veoOperationOfTaskRef(taskRef);
    if (operation) await recordFilmScenes(plan.uid, plan.tokenId, [{ ordinal, operation, credits: plan.sceneCredits }]);
  },

  refundScene: async (plan, ordinal) => {
    if (plan.sceneCredits <= 0 || !plan.chargeRef) return;
    // Under the film's own charge ref, so the film's net debit (and every later refund cap) sees it. Idempotent on the ref.
    const ref = `${plan.chargeRef}:refund:chain:${ordinal}`;
    const r = await refundCredits(plan.uid, plan.sceneCredits, ref);
    // eslint-disable-next-line no-console
    if (!r.ok) console.error(`[filmChain] REFUND FAILED ref=${ref} user=${plan.uid} amount=${plan.sceneCredits} — needs manual credit`);
  },
};
