/**
 * lib/chat/filmSceneRefund.ts — R3-A: a scene Google ACCEPTED and then failed is given back, once, on the server's own word
 * (owner's decision 2026-10-15 10:16Z; docs/handoffs/video-core/R3_REFUND_MATRIX.md §3).
 *
 * Why this was not done before: the film poll learns a scene died from the `film:` token the CLIENT holds — unsigned, so
 * its task refs can be forged — and a transient 429 used to read as 'failed'. Refunding on that would let anyone mint
 * credits. So the decision never rests on the token:
 *
 *   · AT START the server records, next to the film's durable payment (film_scenes, migration 20261014a), the Veo
 *     operation each queued scene was dispatched as and that scene's share of the price (the dispatch refund's share).
 *   · WHEN A POLL SEES A DEAD SCENE, that is only a hint of which scenes to look at. The server asks Google about the
 *     operation IT recorded, and only Google's terminal verdict counts: a DONE operation that returned an error, a safety
 *     refusal or no video. Still running, a 429 / 5xx, missing config or an unknown / expired name prove nothing — the
 *     scene stays open and is asked about again on a later poll.
 *   · The share comes back under `filmpay:<token>:refund:scene:<n>`, capped by what the film's charge still holds, and the
 *     scene is settled in the same statement, so it can be given back at most once. A scene Google did render stays paid
 *     (it is settled as kept), exactly like a failed stitch or QC (the matrix's rows 6–7).
 *
 * Owner-bound: every row is keyed by the signed-in user, so a token naming someone else's film finds nothing. Fail-open
 * in the old direction: no store (20261014a not applied), no record, or no answer from Google → nothing is given back.
 */
import 'server-only';
import { pollVeoClip } from '@/lib/veo/engine';
import type { VeoPollOutcome } from '@/lib/veo/types';
import { pendingFilmScenes, settleFilmScene, type FilmSceneShare } from './filmBilling';

/**
 * The Veo operation inside a ServiceManager 'gemini-veo' task ref (base64url JSON whose providerTaskId is
 * `<operation>::<aspect>`, see ServiceManager.pollVeoTaskRef); null for any other engine or anything unreadable.
 */
export function veoOperationOfTaskRef(taskRef: string | null | undefined): string | null {
  if (typeof taskRef !== 'string' || !taskRef) return null;
  try {
    const parsed = JSON.parse(Buffer.from(taskRef, 'base64url').toString('utf8')) as { provider?: unknown; providerTaskId?: unknown } | null;
    if (!parsed || parsed.provider !== 'gemini-veo' || typeof parsed.providerTaskId !== 'string') return null;
    const sep = parsed.providerTaskId.indexOf('::');
    const operation = (sep >= 0 ? parsed.providerTaskId.slice(0, sep) : parsed.providerTaskId).trim();
    return operation && operation.length <= 512 ? operation : null;
  } catch {
    return null;
  }
}

/** What the start records: every QUEUED Veo scene with its share. Scenes on another engine are not covered (as before). */
export function filmSceneShares(
  clips: ReadonlyArray<{ ordinal: number; taskRef: string | null; status: string }>,
  perScene: number,
): FilmSceneShare[] {
  const credits = Math.max(0, Math.floor(perScene));
  if (credits <= 0) return [];
  return clips.flatMap((c) => {
    const operation = c.status === 'queued' ? veoOperationOfTaskRef(c.taskRef) : null;
    return operation ? [{ ordinal: c.ordinal, operation, credits }] : [];
  });
}

/** Google's word on a scene as R3-A counts it. Only a DONE operation that produced nothing is 'failed'. */
export function sceneVerdict(outcome: VeoPollOutcome): 'failed' | 'rendered' | 'unknown' {
  if (outcome.state === 'filtered') return 'failed';
  if (outcome.state === 'failed') return outcome.finished === true ? 'failed' : 'unknown';
  if (outcome.state === 'succeeded') return 'rendered';
  return 'unknown';
}

export interface SceneRefundDeps {
  pending: typeof pendingFilmScenes;
  poll: (operation: string) => Promise<VeoPollOutcome>;
  settle: typeof settleFilmScene;
}

const DEFAULT_DEPS: SceneRefundDeps = { pending: pendingFilmScenes, poll: pollVeoClip, settle: settleFilmScene };

/**
 * Called by the film poll when one of this film's clips reads 'failed'. `hint` names the ordinals the poll saw fail; which
 * operation is asked about, and whether anything is given back, is decided only from the server's record and Google's
 * answer. Returns the credits given back by THIS call (0 when nothing was due or nothing could be checked).
 */
export async function settleFailedFilmScenes(
  uid: string | null | undefined,
  tokenId: string,
  hint: ReadonlyArray<number>,
  deps: SceneRefundDeps = DEFAULT_DEPS,
): Promise<number> {
  if (!uid || uid === 'anonymous' || hint.length === 0) return 0;
  const pending = await deps.pending(uid, tokenId).catch(() => null);
  if (!pending || pending.length === 0) return 0;
  const wanted = new Set(hint);
  let given = 0;
  // One at a time: a film's settlements serialise on its billing row anyway, and a film has a handful of scenes.
  for (const scene of pending) {
    if (!wanted.has(scene.ordinal)) continue;
    const outcome = await deps.poll(scene.operation).catch((): VeoPollOutcome => ({ state: 'processing' }));
    const verdict = sceneVerdict(outcome);
    if (verdict === 'unknown') continue;
    const back = await deps.settle(uid, tokenId, scene.ordinal, verdict === 'failed').catch(() => null);
    if (typeof back === 'number' && back > 0) {
      given += back;
      // eslint-disable-next-line no-console
      console.info(`[film] scene ${scene.ordinal} failed at Google: ${back} credit(s) given back (film ${tokenId})`);
    }
  }
  return given;
}
