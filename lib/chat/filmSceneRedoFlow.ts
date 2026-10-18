/**
 * lib/chat/filmSceneRedoFlow.ts — the three steps of a scene redo (lib/chat/filmSceneRedo), behind the routes under
 * app/api/film/scene/redo: start (charge the scene's price, send the scene again), poll (follow the render, give the price
 * back when Google failed it or it never came back), stitch (cut the new clip into the film's last stitch).
 *
 * Every outside call is a dependency, so each rule here is tested without Redis, the ledger, Veo or ffmpeg
 * (lib/chat/filmSceneRedoLive wires the real ones). Every step answers an HTTP status and a JSON body.
 */
import {
  REDO_RENDER_DEADLINE_MS,
  cleanRedoNote,
  publicRedo,
  redoChargeRef,
  redoClipRequest,
  redoSeed,
  restitchBody,
  restitchSegments,
  withRenewedLinks,
  type FilmRedoJob,
  type FilmSceneBook,
  type FilmStitchRecord,
} from './filmSceneRedo';

/** A stitch marked running for longer than this died with its function (the route runs for at most 600 s). */
export const REDO_STITCH_STALE_MS = 11 * 60_000;

export interface RedoDeps {
  ready(): boolean;
  getBook(tokenId: string, uid: string): Promise<FilmSceneBook | null>;
  getStitchRecord(tokenId: string, uid: string): Promise<FilmStitchRecord | null>;
  getJob(tokenId: string, ordinal: number, uid: string): Promise<FilmRedoJob | null>;
  saveJob(job: FilmRedoJob): Promise<boolean>;
  claimRender(tokenId: string, ordinal: number): Promise<boolean>;
  releaseRender(tokenId: string, ordinal: number): Promise<void>;
  nextAttempt(tokenId: string, ordinal: number): Promise<number | null>;
  claimStitch(tokenId: string): Promise<boolean>;
  releaseStitch(tokenId: string): Promise<void>;
  isAdmin(uid: string): Promise<boolean>;
  /** Take `amount` under `ref` (once per ref). */
  charge(uid: string, amount: number, ref: string): Promise<{ ok: boolean; reason?: 'insufficient' | 'skipped' | 'error' }>;
  /** Give back what was taken under `ref` (once). true when something came back. */
  refund(uid: string, ref: string): Promise<boolean>;
  /** The note in English for the Veo prompt (the raw note when it cannot be translated). */
  toEnglish(note: string): Promise<string>;
  /** Send the scene. Its leg is queued with a task ref, or not sent (the error says why, a budget refusal included). */
  submit(book: FilmSceneBook, req: { userPrompt: string; selectedOptions: Record<string, string> }, scene: { ordinal: number; seed: number }, compositeId: string): Promise<{ status: string; taskRef: string | null; error?: string }>;
  /** The render's state as the film's own poll reads it. */
  pollTask(taskRef: string, sessionId: string): Promise<{ status: 'succeeded' | 'failed' | 'pending'; url: string | null }>;
  /** Google's own word on a Veo render (R3-A, lib/chat/filmSceneRefund), or null for a render on another engine. */
  veoVerdict(taskRef: string): Promise<'failed' | 'rendered' | 'unknown' | null>;
  /** A fresh link to one of our stored media objects; any other link as it was. */
  renewLink(url: string): Promise<string>;
  /** Stitch the film from `body` for its owner, as a stitch the redo has already paid for. */
  stitch(body: Record<string, unknown>, uid: string): Promise<{ status: number; url: string | null; error: string | null }>;
  isBudgetRefusal(error: string | undefined): boolean;
  budgetMessage(error: string, locale: string): string;
  now(): number;
}

export interface RedoAnswer {
  status: number;
  body: Record<string, unknown>;
}

const TOKEN_RE = /^[A-Za-z0-9_.:-]{1,160}$/;

/** A film token and scene ordinal as a caller sent them, or null. */
export function readRedoTarget(tokenId: unknown, ordinal: unknown): { tokenId: string; ordinal: number } | null {
  const t = typeof tokenId === 'string' ? tokenId.trim() : '';
  const n = typeof ordinal === 'string' && /^\d+$/.test(ordinal.trim()) ? Number(ordinal) : ordinal;
  if (!TOKEN_RE.test(t) || typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 24) return null;
  return { tokenId: t, ordinal: n };
}

const answer = (status: number, body: Record<string, unknown>): RedoAnswer => ({ status, body });

/** Give a failed redo's price back, once, and mark it failed. The render claim is released. */
async function failJob(job: FilmRedoJob, error: string, deps: RedoDeps): Promise<FilmRedoJob> {
  const refunded = job.credits > 0 && !job.refunded ? await deps.refund(job.uid, job.ref).catch(() => false) : false;
  const next: FilmRedoJob = { ...job, status: 'failed', error, refunded: job.refunded || refunded, updatedAt: deps.now() };
  if (job.credits > 0 && !next.refunded) {
    // eslint-disable-next-line no-console
    console.error(`[filmRedo] REFUND FAILED ref=${job.ref} user=${job.uid} amount=${job.credits} — needs manual credit`);
  }
  await deps.saveJob(next);
  await deps.releaseRender(job.tokenId, job.ordinal);
  return next;
}

// ─── Start ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** What redoing one scene of the caller's film costs them, asked before the priced question is shown. */
export async function quoteSceneRedo(uid: string, input: { tokenId: unknown; ordinal: unknown }, deps: RedoDeps): Promise<RedoAnswer> {
  if (!deps.ready()) return answer(503, { error: 'redo_unavailable' });
  const target = readRedoTarget(input.tokenId, input.ordinal);
  if (!target) return answer(400, { error: 'invalid_target' });
  const book = await deps.getBook(target.tokenId, uid);
  if (!book) return answer(404, { error: 'film_not_found' });
  if (!book.scenes.some((s) => s.ordinal === target.ordinal)) return answer(404, { error: 'scene_not_found', scenes: book.scenes.length });
  const price = (await deps.isAdmin(uid)) ? 0 : Math.max(0, Math.round(book.scenePrice));
  return answer(200, { price, ordinal: target.ordinal, scenes: book.scenes.length });
}

export async function startSceneRedo(
  uid: string,
  input: { tokenId: unknown; ordinal: unknown; note?: unknown; expectedPrice?: unknown },
  deps: RedoDeps,
): Promise<RedoAnswer> {
  if (!deps.ready()) return answer(503, { error: 'redo_unavailable', message: 'Scene redo is not available right now.' });
  const target = readRedoTarget(input.tokenId, input.ordinal);
  if (!target) return answer(400, { error: 'invalid_target', message: 'A film token and a scene number (1–24) are required.' });
  const { tokenId, ordinal } = target;
  const book = await deps.getBook(tokenId, uid);
  if (!book) return answer(404, { error: 'film_not_found', message: 'This film can no longer be corrected scene by scene (it is older than a day, or not yours).' });
  const scene = book.scenes.find((s) => s.ordinal === ordinal);
  if (!scene) return answer(404, { error: 'scene_not_found', message: `This film has no scene ${ordinal}.` });

  const prior = await deps.getJob(tokenId, ordinal, uid);
  if (prior?.status === 'stitching' && deps.now() - prior.updatedAt < REDO_STITCH_STALE_MS) {
    return answer(409, { error: 'film_stitching', message: 'The film is being cut with this scene right now. Try again when it is done.', redo: publicRedo(prior) });
  }

  const note = cleanRedoNote(input.note);
  // Translated before anything is held or taken: a slow translation never keeps the price or the scene waiting.
  const noteEn = note ? await deps.toEnglish(note).catch(() => note) : null;

  const price = (await deps.isAdmin(uid)) ? 0 : Math.max(0, Math.round(book.scenePrice));
  // The user agreed to the price they were shown: never more is taken than that.
  if (typeof input.expectedPrice === 'number' && Number.isFinite(input.expectedPrice) && price > input.expectedPrice) {
    return answer(409, { error: 'price_changed', price, message: `Rendering this scene again costs ${price} credits, not the ${input.expectedPrice} shown. Nothing was charged.` });
  }
  if (!(await deps.claimRender(tokenId, ordinal))) {
    return answer(409, { error: 'scene_busy', message: 'This scene is already being rendered again.', ...(prior ? { redo: publicRedo(prior) } : {}) });
  }
  const attempt = await deps.nextAttempt(tokenId, ordinal);
  if (attempt === null) {
    await deps.releaseRender(tokenId, ordinal);
    return answer(503, { error: 'redo_unavailable', message: 'Scene redo is not available right now. Nothing was charged.' });
  }
  const ref = redoChargeRef(tokenId, ordinal, attempt);
  if (price > 0) {
    const debit = await deps.charge(uid, price, ref);
    if (!debit.ok) {
      await deps.releaseRender(tokenId, ordinal);
      // Fails closed on every miss, as the film start does: a render that could not be charged does not start.
      return debit.reason === 'insufficient'
        ? answer(402, { error: 'insufficient_credits', price, message: `Rendering this scene again costs ${price} credits. Top up to continue.` })
        : answer(503, { error: 'ledger_unavailable', price, message: 'Your balance could not be charged right now, so nothing was charged and nothing was rendered.' });
    }
  }

  const startedAt = deps.now();
  const base: FilmRedoJob = {
    v: 1, tokenId, uid, ordinal, attempt, ref, credits: price, status: 'rendering', taskRef: null,
    sessionId: book.sessionId, clipUrl: null, masterUrl: null, refunded: false, error: null, startedAt, updatedAt: startedAt,
  };
  const leg = await deps
    .submit(book, redoClipRequest(scene, noteEn), { ordinal, seed: redoSeed(scene.seed, attempt) }, `${book.compositeId}:redo:${ordinal}:${attempt}`)
    .catch((e: unknown) => ({ status: 'failed', taskRef: null, error: e instanceof Error ? e.message : String(e) }));
  if (leg.status !== 'queued' || !leg.taskRef) {
    const budget = deps.isBudgetRefusal(leg.error);
    const failed = await failJob(base, budget ? 'budget_exhausted' : 'render_not_started', deps);
    return budget
      ? answer(429, { error: 'budget_exhausted', message: deps.budgetMessage(leg.error ?? '', book.locale), redo: publicRedo(failed) })
      : answer(502, { error: 'render_not_started', message: 'The scene could not be sent to render. Nothing was charged.', redo: publicRedo(failed) });
  }
  const job: FilmRedoJob = { ...base, taskRef: leg.taskRef };
  if (!(await deps.saveJob(job))) {
    // A render nobody can follow is not charged for.
    const failed = await failJob(job, 'redo_untracked', deps);
    return answer(503, { error: 'redo_unavailable', message: 'Scene redo is not available right now. Nothing was charged.', redo: publicRedo(failed) });
  }
  return answer(202, { redo: publicRedo(job), price });
}

// ─── Poll ──────────────────────────────────────────────────────────────────────────────────────────────────────

export async function pollSceneRedo(uid: string, input: { tokenId: unknown; ordinal: unknown }, deps: RedoDeps): Promise<RedoAnswer> {
  if (!deps.ready()) return answer(503, { error: 'redo_unavailable' });
  const target = readRedoTarget(input.tokenId, input.ordinal);
  if (!target) return answer(400, { error: 'invalid_target' });
  let job = await deps.getJob(target.tokenId, target.ordinal, uid);
  if (!job) return answer(404, { error: 'redo_not_found' });

  if (job.status === 'rendering' && job.taskRef) {
    const r = await deps.pollTask(job.taskRef, job.sessionId).catch(() => ({ status: 'pending' as const, url: null }));
    if (r.status === 'succeeded' && r.url) {
      job = { ...job, status: 'ready', clipUrl: r.url, updatedAt: deps.now() };
      await deps.saveJob(job);
      await deps.releaseRender(job.tokenId, job.ordinal);
    } else if (r.status === 'failed') {
      // The poll's 'failed' is the provider's terminal word. For a Veo render Google is asked too, on the operation the SERVER
      // recorded: still running or no answer is not a failure. A clip Google made that never reached us is our miss: refunded.
      const verdict = await deps.veoVerdict(job.taskRef).catch(() => 'unknown' as const);
      if (verdict !== 'unknown') job = await failJob(job, 'render_failed', deps);
    }
    // A render with no answer this long after it was sent is given up on, and its price goes back.
    if (job.status === 'rendering' && deps.now() - job.startedAt > REDO_RENDER_DEADLINE_MS) {
      job = await failJob(job, 'render_timed_out', deps);
    }
  } else if (job.status === 'stitching' && deps.now() - job.updatedAt >= REDO_STITCH_STALE_MS) {
    // The stitch died with its function: the new clip is still there to cut in.
    job = { ...job, status: 'ready', error: 'stitch_interrupted', updatedAt: deps.now() };
    await deps.saveJob(job);
  }
  return answer(200, { redo: publicRedo(job) });
}

// ─── Stitch ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function stitchSceneRedo(uid: string, input: { tokenId: unknown; ordinal: unknown }, deps: RedoDeps): Promise<RedoAnswer> {
  if (!deps.ready()) return answer(503, { error: 'redo_unavailable' });
  const target = readRedoTarget(input.tokenId, input.ordinal);
  if (!target) return answer(400, { error: 'invalid_target' });
  const { tokenId, ordinal } = target;
  const job = await deps.getJob(tokenId, ordinal, uid);
  if (!job) return answer(404, { error: 'redo_not_found' });
  if (job.status !== 'ready' || !job.clipUrl) return answer(409, { error: 'redo_not_ready', redo: publicRedo(job) });
  if (!(await deps.claimStitch(tokenId))) {
    return answer(409, { error: 'film_stitching', message: 'This film is already being cut. Try again when it is done.', redo: publicRedo(job) });
  }
  try {
    const record = await deps.getStitchRecord(tokenId, uid);
    if (!record) return answer(409, { error: 'no_stitch_record', message: 'This film has not been cut yet, so there is nothing to put the scene into.', redo: publicRedo(job) });
    const sceneSec = record.segments.find((s) => s.ordinal === ordinal)?.durationSec
      ?? record.segments.find((s) => typeof s.durationSec === 'number')?.durationSec
      ?? 8;
    const cut = restitchSegments(record.segments, ordinal, job.clipUrl, sceneSec);
    if (!cut) return answer(409, { error: 'stitch_unordered', message: 'This film was cut before scenes were numbered; it cannot take one scene back.', redo: publicRedo(job) });

    const stitching: FilmRedoJob = { ...job, status: 'stitching', error: null, updatedAt: deps.now() };
    await deps.saveJob(stitching);
    // The film's links are renewed first: its narration's expire two hours after it was made (withRenewedLinks).
    const out = await withRenewedLinks(restitchBody(record, cut.segments, cut.inserted), deps.renewLink)
      .then((body) => deps.stitch(body, uid))
      .catch((e: unknown) => ({ status: 0, url: null, error: e instanceof Error ? e.message : String(e) }));
    if (out.status >= 200 && out.status < 300 && out.url) {
      const done: FilmRedoJob = { ...stitching, status: 'done', masterUrl: out.url, updatedAt: deps.now() };
      await deps.saveJob(done);
      return answer(200, { redo: publicRedo(done) });
    }
    // The clip stays: a later stitch can still cut it in. The scene's price is not given back for a stitch miss (the scene
    // WAS rendered, and the clip is the user's), as a failed film stitch keeps its scenes paid.
    const back: FilmRedoJob = { ...stitching, status: 'ready', error: out.error || 'stitch_failed', updatedAt: deps.now() };
    await deps.saveJob(back);
    return answer(502, { error: 'stitch_failed', message: 'The film could not be cut with the new scene. The new clip is kept; try again.', redo: publicRedo(back) });
  } finally {
    await deps.releaseStitch(tokenId);
  }
}
