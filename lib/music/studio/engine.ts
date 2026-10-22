/**
 * lib/music/studio/engine.ts — Music Studio v1: Idea → Plan → Quote → explicit Confirm → Reservation → Lyria →
 * QC → final audio → Library.
 *
 * Built on the platform's existing pieces, the same way Image Studio (PR #60) and Agent G's media queues are:
 *   · lib/agent/media/quoteToken — the quote binds (user, job id, plan fingerprint, credits, expiry);
 *   · lib/orchestrator/jobLease  — the job is a generation_jobs row with a lease (no new table, no migration); the row
 *     is also the Library entry and the job tray's source of truth;
 *   · the credit ledger, through injected reserve / refund (live: reserveProduce + netDebitedForRef, refund ≤ debit).
 *
 * Money rules:
 *   · The button price is the quoted price is the debit: the token carries the credits, start re-derives them from the
 *     plan and refuses a mismatch, and the reservation is exactly that number under ref `music-studio-v1:<jobId>`.
 *   · The job id is the idempotency key: a second start of the same quote (double tap, retry after a lost response)
 *     finds the row and reports it; deduct_credits dedupes the ref, so it can never charge twice.
 *   · Every failure after a debit writes `owe: 'refund'` in the same write that fails the row; settlement pays at most
 *     what the ledger shows was taken under the ref, once (`<ref>:refund`), and only then clears the debt. The sweep
 *     pays any debt a dead worker left behind.
 *   · A provider request that may have reached Lyria is never sent again (dispatch 'submitted' on a retry): the job fails
 *     as provider_outcome_unknown and is refunded. No silent second render.
 *   · Delivered = stored, measured and QC-passed. Anything else is a failure and is refunded.
 */
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { quoteCredits } from '@/lib/credits/quote';
import { signQuote, verifyQuote, quoteBinding, QUOTE_TTL_MS } from '@/lib/agent/media/quoteToken';
import {
  enqueue, release, cancel, claim, heartbeat, mustStop, complete, fail, settled, reap, claimable, HEARTBEAT_MS,
  type LeaseRow, type LeaseStore,
} from '@/lib/orchestrator/jobLease';
import { MUSIC_KIND, parseMusicPlan, parseMusicRequest, type MusicOutput, type MusicPlan, type MusicRequest, type SavedTrack } from './contracts';
import { validateCapability, type MusicCapabilities } from './capabilities';
import { lyriaInput, directions } from './prompt';
import { MusicError, musicError } from './errors';

export interface MusicDeps {
  store: LeaseStore;
  caps(): MusicCapabilities;
  key(): string;
  now(): number;
  newId(): string;
  /** Is `id` a Music Studio job of `userId`? (regenerate's parent) */
  checkParent(id: string, userId: string): Promise<boolean>;
  /** The platform spend guard. Must answer false when it cannot decide (fail closed). */
  withinBudget(model: string): Promise<boolean>;
  reserve(userId: string, credits: number, ref: string): Promise<{ charged: boolean; reason: string }>;
  refund(userId: string, ref: string, credits: number): Promise<'refunded' | 'nothing' | 'error'>;
  generate(plan: MusicPlan, input: string, signal: AbortSignal): Promise<MusicOutput>;
  /** Measure, QC and store the bytes privately under the user. Throws MusicError('quality_failed') on a bad track. */
  save(id: string, userId: string, plan: MusicPlan, output: MusicOutput, signal: AbortSignal): Promise<SavedTrack>;
  /** A fresh signed URL for a stored track. */
  resign(track: SavedTrack): Promise<SavedTrack>;
  every(ms: number, tick: () => Promise<void>): () => void;
  audit(event: { userId: string; jobId?: string; phase: string; code: string; credits?: number }): Promise<void>;
  /** Live jobs a user may hold at once (queued + running). */
  maxLivePerUser: number;
}

interface MusicState {
  billing: 'reserving' | 'reserved' | 'rejected' | 'uncertain';
  dispatch: 'not_sent' | 'submitted' | 'stored';
  saved?: SavedTrack;
  providerRequestId?: string | null;
  caption?: string | null;
}

const stateOf = (row: LeaseRow): MusicState => row.params._music as MusicState;
const reserveOf = (row: LeaseRow) => row.params._reserve as { ref: string; credits: number };
const fingerprint = (plan: MusicPlan) => bodyFingerprint({ domain: MUSIC_KIND, plan });
export const priceOf = (plan: Pick<MusicPlan, 'billedSec'>) => quoteCredits({ tool: 'music', seconds: plan.billedSec });
/** What the quote binds (lib/agent/media/quoteToken v2): the plan's Lyria model on the transport that will run it, per second. */
export const musicQuoteBinding = (plan: Pick<MusicPlan, 'request' | 'transport' | 'billedSec'>) =>
  quoteBinding({ cap: 'music.studio', model: plan.request.modelId, transport: plan.transport, units: plan.billedSec });
const isMusic = (row: LeaseRow | null, userId?: string): row is LeaseRow =>
  !!row && row.exec?.kind === MUSIC_KIND && (!userId || row.userId === userId);

async function patchState(deps: MusicDeps, id: string, update: Partial<MusicState>, worker?: string): Promise<boolean> {
  for (let n = 0; n < 5; n++) {
    const row = await deps.store.read(id);
    if (!isMusic(row) || !row.exec) return false;
    if (worker && (row.status !== 'processing' || row.exec.owner !== worker || (row.exec.leaseUntil ?? 0) <= deps.now())) return false;
    const params = { ...row.params, _music: { ...stateOf(row), ...update }, _exec: { ...row.exec, v: row.exec.v + 1 } };
    if (await deps.store.cas(id, { v: row.exec.v, from: [row.status] }, { params })) return true;
  }
  return false;
}

/** The plan for a request: what will be rendered, on what, at what price. Throws `unsupported` before any quote. */
export function planFor(request: MusicRequest, caps: MusicCapabilities): MusicPlan {
  validateCapability(request, caps);
  return { v: 1, kind: MUSIC_KIND, request, transport: caps.transport!, billedSec: request.durationSec };
}

export async function quoteMusic(deps: MusicDeps, userId: string, value: unknown) {
  const request = parseMusicRequest(value);
  const plan = planFor(request, deps.caps());
  if (!deps.key()) throw new MusicError('not_configured', 'Music quotes are unavailable.', 503);
  if (request.parentJobId && !(await deps.checkParent(request.parentJobId, userId))) throw new MusicError('not_found', 'The earlier track was not found.', 404);
  const jobId = deps.newId();
  const credits = priceOf(plan);
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = signQuote({ u: userId, j: jobId, f: fingerprint(plan), c: credits, x: expiresAt }, deps.key(), musicQuoteBinding(plan));
  if (!token) throw new MusicError('not_configured', 'Music quotes are unavailable.', 503);
  await deps.audit({ userId, jobId, phase: 'quote', code: 'prepared', credits });
  return {
    ok: true as const, jobId, credits, expiresAt, plan, token, requiresConfirmation: true as const,
    summary: { model: request.modelId, transport: plan.transport, durationSec: plan.billedSec, exactDuration: false, directions: directions(request) },
    providerInput: lyriaInput(plan),
  };
}

export type MusicView = ReturnType<typeof musicView>;

export function musicView(row: LeaseRow) {
  const failed = row.status === 'failed';
  const cancelled = failed && !!row.error?.startsWith('cancelled');
  return {
    ok: true as const,
    jobId: row.id,
    status: cancelled ? 'cancelled' as const : failed ? 'failed' as const : row.status === 'completed' ? 'completed' as const
      : row.status === 'processing' ? 'running' as const : 'queued' as const,
    // A named stage, never an invented percentage: Lyria reports no progress while it renders.
    stage: row.status === 'pending' && row.exec?.hold ? 'reserving' : row.stage ?? 'queued',
    attempt: row.exec?.attempt ?? 0,
    error: failed ? row.error?.split(':')[0] ?? 'unknown_error' : null,
    settlementPending: !!row.exec?.owe,
    result: row.status === 'completed' ? row.result : null,
    cancellable: row.status === 'pending' || row.status === 'processing',
  };
}

/** How long an unknown reservation outcome may still turn into a debit. */
const AMBIGUOUS_DEBIT_MS = 24 * 60 * 60_000;

/** Pay a failed job's debt (at most what was taken, once), then clear it. Safe to call any number of times. */
export async function settleMusic(deps: MusicDeps, id: string): Promise<void> {
  const row = await deps.store.read(id);
  if (!isMusic(row) || !row.exec?.owe) return;
  const state = stateOf(row);
  const reservation = reserveOf(row);
  if (!state || !reservation) return; // corrupt state never mints a refund
  if (state.billing === 'rejected') { await settled(deps.store, id); return; }
  const paid = await deps.refund(row.userId, reservation.ref, reservation.credits);
  const ambiguityOver = deps.now() - row.createdAt > AMBIGUOUS_DEBIT_MS;
  if (paid === 'error' || (paid === 'nothing' && state.billing !== 'reserved' && !ambiguityOver)) return;
  await settled(deps.store, id);
  await deps.audit({ userId: row.userId, jobId: id, phase: 'settlement', code: paid, credits: reservation.credits });
}

async function refusePending(deps: MusicDeps, row: LeaseRow, code: string, owe: boolean): Promise<void> {
  if (!row.exec) return;
  await deps.store.cas(row.id, { v: row.exec.v, from: ['pending'] }, {
    status: 'failed', stage: 'failed', error: code,
    params: { ...row.params, _exec: { ...row.exec, v: row.exec.v + 1, hold: undefined, ...(owe ? { owe: 'refund' } : {}) } },
  });
}

async function liveCount(deps: MusicDeps, userId: string, except: string): Promise<number> {
  const rows = await deps.store.listLive(MUSIC_KIND, 200);
  return rows.filter((r) => r.userId === userId && r.id !== except).length;
}

export async function startMusic(deps: MusicDeps, userId: string, value: unknown, token: unknown, confirmed: unknown) {
  if (confirmed !== true) throw new MusicError('confirmation_required', 'Confirm the displayed music quote before starting.', 400);
  const plan = parseMusicPlan(value);
  // The binding is built from the engine that would run it now (the capability matrix's transport), so a changed
  // transport, project, price book or price is refused before anything is reserved.
  // A capability that is gone now is refused below as before (planFor throws), so it binds the plan's own transport here.
  let current: MusicPlan | null = null;
  try { current = planFor(plan.request, deps.caps()); } catch { current = null; }
  const signed = verifyQuote(token, deps.key(), {
    userId, fingerprint: fingerprint(plan), now: deps.now(), credits: priceOf(plan), binding: musicQuoteBinding(current ?? plan),
  });
  if (!signed.ok) {
    if (signed.reason === 'changed' && signed.field !== 'fingerprint') throw new MusicError('quote_changed', 'The engine or price changed. Request a new quote.', 409);
    throw new MusicError(signed.reason === 'expired' ? 'quote_expired' : signed.reason === 'changed' ? 'quote_changed' : 'quote_invalid', 'The quote is invalid, changed or expired.', 409);
  }
  const { j: id, c: credits } = signed.claims;
  const existing = await deps.store.read(id);
  if (existing) {
    if (!isMusic(existing, userId) || bodyFingerprint(existing.params._job) !== bodyFingerprint(plan)) throw new MusicError('quote_invalid', 'The quoted job cannot be used.', 409);
    return { ...musicView(existing), replay: true };
  }
  // The capability matrix and the price are checked again: either may have changed since the quote.
  const fresh = planFor(plan.request, deps.caps());
  if (fresh.transport !== plan.transport || credits !== priceOf(plan)) throw new MusicError('quote_changed', 'The engine or price changed. Request a new quote.', 409);
  if (plan.request.parentJobId && !(await deps.checkParent(plan.request.parentJobId, userId))) throw new MusicError('not_found', 'The earlier track was not found.', 404);

  const ref = `${MUSIC_KIND}:${id}`;
  const r = plan.request;
  const put = await enqueue(deps.store, {
    id, userId, serviceType: 'music', kind: MUSIC_KIND, hold: true, maxAttempts: 2,
    params: {
      prompt: r.prompt, subtype: MUSIC_KIND, via: 'music-studio', model: r.modelId, instrumental: r.mode === 'instrumental',
      durationSec: plan.billedSec, ...(r.parentJobId ? { parentJobId: r.parentJobId } : {}),
      _job: plan, _reserve: { ref, credits }, _approval: { channel: 'tap', confirmedAt: deps.now() },
      _music: { billing: 'reserving', dispatch: 'not_sent' } satisfies MusicState,
    },
  });
  if (put === 'error') throw new MusicError('jobs_unavailable', 'The music job could not be recorded. Nothing was charged.', 503);
  if (put === 'exists') {
    const row = await deps.store.read(id);
    if (!isMusic(row, userId)) throw new MusicError('jobs_unavailable', 'The music job could not be read.', 503);
    return { ...musicView(row), replay: true };
  }

  let reservationAttempted = false;
  try {
    if ((await liveCount(deps, userId, id)) >= deps.maxLivePerUser) {
      await patchState(deps, id, { billing: 'rejected' });
      const row = await deps.store.read(id);
      if (row) await refusePending(deps, row, 'queue_full', false);
      throw new MusicError('queue_full', 'Finish or cancel a running track first. Nothing was charged.', 429);
    }
    // The platform spend guard, before money moves. It fails closed: an unreadable budget is not permission to spend.
    if (!(await deps.withinBudget(r.modelId))) {
      await patchState(deps, id, { billing: 'rejected' });
      const row = await deps.store.read(id);
      if (row) await refusePending(deps, row, 'budget_exhausted', false);
      throw new MusicError('budget_exhausted', 'Music generation is paused for now. Nothing was charged.', 503);
    }
    const before = await deps.store.read(id);
    if (!before || before.status !== 'pending') {
      await patchState(deps, id, { billing: 'rejected' });
      if (before) return { ...musicView((await deps.store.read(id))!), replay: false };
      throw new MusicError('jobs_unavailable', 'Music job unavailable.', 503);
    }
    reservationAttempted = true;
    const charge = await deps.reserve(userId, credits, ref);
    const billing: MusicState['billing'] = charge.charged ? 'reserved'
      : charge.reason === 'insufficient' || charge.reason === 'replay' ? 'rejected' : 'uncertain';
    if (!(await patchState(deps, id, { billing }))) throw new MusicError('jobs_unavailable', 'Billing is being reconciled before generation can start.', 503);
    if (!charge.charged) {
      const row = await deps.store.read(id);
      if (charge.reason === 'replay') {
        if (row) await refusePending(deps, row, 'quote_used', false);
        throw new MusicError('quote_used', 'This quote was already used. Request a new quote.', 409);
      }
      const code = charge.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable';
      if (row) await refusePending(deps, row, code, billing === 'uncertain');
      await settleMusic(deps, id);
      throw new MusicError(code, code === 'insufficient_credits' ? 'Not enough credits.' : 'Billing could not confirm the reservation. Nothing was started.', code === 'insufficient_credits' ? 402 : 503);
    }
    if (!(await release(deps.store, id))) {
      // Cancelled while the charge ran: the cancel wrote the debt; pay it now.
      await settleMusic(deps, id);
      const row = await deps.store.read(id);
      if (isMusic(row, userId) && row.status === 'failed') return { ...musicView(row), replay: false };
      throw new MusicError('jobs_unavailable', 'The reserved job is awaiting recovery.', 503);
    }
    await deps.audit({ userId, jobId: id, phase: 'start', code: 'queued', credits });
    return { ...musicView((await deps.store.read(id))!), replay: false };
  } catch (e) {
    if (!reservationAttempted) await patchState(deps, id, { billing: 'rejected' });
    const row = await deps.store.read(id);
    if (isMusic(row) && row.status === 'pending') await refusePending(deps, row, musicError(e).code, stateOf(row).billing !== 'rejected');
    await settleMusic(deps, id).catch(() => undefined);
    throw e;
  }
}

export async function cancelMusic(deps: MusicDeps, userId: string, id: string) {
  const before = await deps.store.read(id);
  if (!isMusic(before, userId)) throw new MusicError('not_found', 'Music job not found.', 404);
  const r = await cancel(deps.store, id, userId, 'cancelled: stopped by the user', stateOf(before).billing !== 'rejected');
  if (!r.ok) throw new MusicError('not_running', 'This music job is already final.', 409);
  await settleMusic(deps, id);
  await deps.audit({ userId, jobId: id, phase: 'cancel', code: 'cancelled' });
  return musicView((await deps.store.read(id))!);
}

export async function musicStatus(deps: MusicDeps, userId: string, id: string) {
  let row = await deps.store.read(id);
  if (!isMusic(row, userId)) throw new MusicError('not_found', 'Music job not found.', 404);
  await settleMusic(deps, id);
  row = (await deps.store.read(id))!;
  const view = musicView(row);
  const saved = stateOf(row)?.saved;
  if (view.result && saved) {
    const fresh = await deps.resign(saved);
    view.result = { ...view.result, url: fresh.url };
  }
  return { view, needsWorker: claimable(row, deps.now()) };
}

export async function workMusic(deps: MusicDeps, id: string, worker: string): Promise<{ ran: boolean; outcome?: string; error?: string }> {
  const before = await deps.store.read(id);
  if (!isMusic(before)) return { ran: false };
  const claimed = await claim(deps.store, id, worker, deps.now());
  if (!claimed.ok) return { ran: false };
  const row = claimed.row;
  const ctl = new AbortController();
  const stop = deps.every(HEARTBEAT_MS, async () => {
    try { if (mustStop(await heartbeat(deps.store, id, worker, deps.now()))) ctl.abort(); } catch { /* next beat decides */ }
  });
  const fence = async () => {
    if (ctl.signal.aborted || mustStop(await heartbeat(deps.store, id, worker, deps.now()))) throw new MusicError('cancelled', 'The worker no longer owns this job.');
  };
  try {
    const plan = parseMusicPlan(row.params._job);
    const fresh = planFor(plan.request, deps.caps());
    if (fresh.transport !== plan.transport) throw new MusicError('not_configured', 'The approved transport changed.', 503);
    await fence();
    let saved: SavedTrack;
    const st = stateOf(row);
    if (st.dispatch === 'stored' && st.saved) {
      saved = st.saved; // a worker died between storing and completing: deliver what is stored
    } else if (st.dispatch === 'submitted') {
      // The request may have reached Lyria. It is not sent twice.
      throw new MusicError('provider_outcome_unknown', 'A previous attempt may have reached the engine; it is not sent again.', 502);
    } else {
      if (!(await patchState(deps, id, { dispatch: 'submitted' }, worker))) throw new MusicError('jobs_unavailable', 'The dispatch could not be recorded.', 503);
      await deps.store.progress(id, worker, 'generating', 0);
      const output = await deps.generate(plan, lyriaInput(plan), ctl.signal);
      await fence();
      await deps.store.progress(id, worker, 'quality_checking', 0);
      saved = await deps.save(id, row.userId, plan, output, ctl.signal);
      if (!(await patchState(deps, id, { dispatch: 'stored', saved, providerRequestId: output.providerRequestId, caption: output.caption }, worker))) {
        throw new MusicError('jobs_unavailable', 'The saved track is awaiting recovery.', 503);
      }
    }
    await fence();
    const now = (await deps.store.read(id))!;
    const s = stateOf(now);
    const r = plan.request;
    const done = await complete(deps.store, id, worker, {
      signedUrl: saved.url,
      result: {
        kind: 'music', subtype: MUSIC_KIND, url: saved.url, bucket: saved.bucket, path: saved.path, mime: saved.mime,
        bytes: saved.bytes, digest: saved.digest, durationSec: saved.qc.durationSec, qc: saved.qc,
        modelId: r.modelId, transport: plan.transport, mode: r.mode, prompt: r.prompt, lyrics: r.lyrics ?? null,
        lyricsLanguage: r.lyricsLanguage ?? null, genre: r.genre ?? null, mood: r.mood ?? null, tempo: r.tempo ?? null,
        bpm: r.bpm ?? null, vocalGender: r.vocalGender ?? null, requestedSec: plan.billedSec,
        parentJobId: r.parentJobId ?? null, request: r, providerRequestId: s.providerRequestId ?? null,
        credits: reserveOf(now).credits, providerCostUSD: null,
      },
    });
    if (!done) return { ran: true, outcome: 'lost' };
    await deps.audit({ userId: row.userId, jobId: id, phase: 'complete', code: 'delivered' });
    return { ran: true, outcome: 'completed' };
  } catch (e) {
    const error = musicError(e);
    const landed = await fail(deps.store, id, worker, `${error.code}: ${error.message}`, true);
    if (landed) await deps.audit({ userId: row.userId, jobId: id, phase: 'failed', code: error.code });
    await settleMusic(deps, id).catch(() => undefined);
    return { ran: true, outcome: landed ? 'failed' : 'lost', error: error.code };
  } finally {
    stop();
  }
}

/** The cron's pass: fail dead jobs (owing their refund), pay every debt, then work the oldest waiting job. */
export async function sweepMusic(deps: MusicDeps, worker: string, run = true) {
  const report = await reap(deps.store, MUSIC_KIND, deps.now(), {
    owesRefund: (row) => stateOf(row)?.billing !== 'rejected',
    error: 'provider_outcome_unknown: music attempts exhausted',
    abandonedError: 'billing_unavailable: music reservation interrupted',
  });
  for (const row of [...report.exhausted, ...(await deps.store.listOwed(MUSIC_KIND, 25))]) await settleMusic(deps, row.id);
  const worked = run && report.runnable[0] ? await workMusic(deps, report.runnable[0], worker) : null;
  return { waiting: report.runnable.length, exhausted: report.exhausted.length, unsettled: (await deps.store.listOwed(MUSIC_KIND, 25)).length, worked: !!worked?.ran };
}
