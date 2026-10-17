/**
 * lib/chat/filmSceneRedoLive.ts — the live wiring of a scene redo (lib/chat/filmSceneRedoFlow): the scene book in Redis, the
 * ledger, the film start's own clip submit, the film poll's reading of a render, Google's verdict on a Veo operation, and the
 * stitch route called in-process for the film's owner as a stitch the redo already paid for.
 */
import 'server-only';
import { NextRequest } from 'next/server';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { pollVeoClip } from '@/lib/veo/engine';
import { actAs } from '@/lib/video/assembleActor';
import { budgetReasonOf, budgetRefusalMessage, isBudgetRefusal } from '@/lib/services/billing/budgetMessage';
import { ServiceManager } from './ServiceManager';
import { isAdminUser, submitFilmClip } from './filmComposite';
import { sceneVerdict, veoOperationOfTaskRef } from './filmSceneRefund';
import {
  claimFilmRestitch,
  claimSceneRender,
  filmSceneBookReady,
  getFilmRedoJob,
  getFilmSceneBook,
  getFilmStitchRecord,
  nextRedoAttempt,
  releaseFilmRestitch,
  releaseSceneRender,
  saveFilmRedoJob,
} from './filmSceneBook';
import type { RedoDeps } from './filmSceneRedoFlow';

/** The clip models a film start can resolve to besides Veo (lib/chat/filmChainRuntime keeps the same set). */
const CLIP_MODELS = new Set(['kling', 'hailuo']);
/** The stitch's own budget inside the redo stitch route's 600 s. */
const STITCH_BUDGET_MS = 560_000;

let sm: ServiceManager | null = null;
const serviceManager = (): ServiceManager => (sm ??= new ServiceManager());

/** The live deps. `origin` is the site the redo was called on (the stitch builds its render callback from it). */
export function liveRedoDeps(origin: string): RedoDeps {
  return {
    ready: filmSceneBookReady,
    getBook: getFilmSceneBook,
    getStitchRecord: getFilmStitchRecord,
    getJob: getFilmRedoJob,
    saveJob: saveFilmRedoJob,
    claimRender: claimSceneRender,
    releaseRender: releaseSceneRender,
    nextAttempt: nextRedoAttempt,
    claimStitch: claimFilmRestitch,
    releaseStitch: releaseFilmRestitch,
    isAdmin: isAdminUser,
    charge: (uid, amount, ref) => deductCredits(uid, amount, ref),
    refund: async (uid, ref) => (await refundDebitByRef(uid, ref)).ok,
    toEnglish: (note) => promptToEnglish(note, 'video'),

    submit: async (book, req, scene, compositeId) => {
      const model = book.videoModel && CLIP_MODELS.has(book.videoModel) ? (book.videoModel as 'kling' | 'hailuo') : null;
      const leg = await submitFilmClip(
        { userId: book.uid, sessionId: book.sessionId, locale: book.locale, videoModel: model },
        req,
        scene,
        compositeId,
        book.forecast.wholesaleGel,
        book.forecast.retailGel,
        true, // the scene's price was taken by the redo itself, under its own ref
      );
      return { status: leg.status, taskRef: leg.taskRef, ...(leg.error ? { error: leg.error } : {}) };
    },

    pollTask: async (taskRef, sessionId) => {
      const r = await serviceManager().poll(taskRef, sessionId);
      if (r.predictionStatus === 'succeeded') {
        return { status: 'succeeded', url: typeof r.assetUrl === 'string' && /^https:\/\//i.test(r.assetUrl) ? r.assetUrl : null };
      }
      // As the film's poll reads it (lib/chat/providerRouter pollFilmClip): 'error' is a routing blip, never a verdict.
      if (r.predictionStatus === 'failed' || r.predictionStatus === 'canceled') return { status: 'failed', url: null };
      return { status: 'pending', url: null };
    },

    veoVerdict: async (taskRef) => {
      const operation = veoOperationOfTaskRef(taskRef);
      if (!operation) return null;
      return sceneVerdict(await pollVeoClip(operation));
    },

    stitch: async (body, uid) => {
      const { POST } = await import('@/app/api/video/assemble/route');
      const req = actAs(new NextRequest(new URL('/api/video/assemble', origin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }), { uid, budgetMs: STITCH_BUDGET_MS, covered: true });
      const res = await POST(req);
      const json = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
      return {
        status: res.status,
        url: typeof json?.url === 'string' && json.url ? json.url : null,
        error: typeof json?.error === 'string' ? json.error : null,
      };
    },

    isBudgetRefusal: (error) => isBudgetRefusal(error),
    budgetMessage: (error, locale) => budgetRefusalMessage(locale, budgetReasonOf(error)),
    now: () => Date.now(),
  };
}
