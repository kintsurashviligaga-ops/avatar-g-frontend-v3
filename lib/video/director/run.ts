/**
 * lib/video/director/run.ts — the director's run, one bounded step per request (V2, V5 on a serverless platform).
 *
 * executeStoryboard (./director.ts) runs a whole storyboard inside one call and waits on every clip; a Vercel function
 * cannot live that long. This module keeps the same rules and moves the waiting to the browser:
 *
 *   startRun     an approved, frozen storyboard becomes a stored run (state `running`, every shot `pending`).
 *   advanceRun   ONE step of the current shot: claim + charge + submit, or one poll (+ delivery when Veo is done).
 *                The browser calls it every few seconds. Shots go strictly by `order`, one at a time.
 *   decideRun    the user's answer to a failed shot: retry (the same frozen shot again), edit (a new draft; this run
 *                ends) or cancel. There is no skip.
 *
 * ⚠️ THE FIRST ShotError STOPS THE RUN (V5): state `waiting_for_shot_decision`, and the shots after it are never
 * submitted. Nothing is retried, skipped or "fixed" without the user.
 *
 * ⚠️ MONEY. Each shot is charged just before its submit, under its own ref (`director:<run>:shot:<i>:a<attempt>`), and
 * refunded when that attempt delivers no clip. The decision is made from what THIS SERVER saw (its own submit and its
 * own polls of Google), never from anything the browser says, so a refund cannot be farmed. The per-shot prices add up
 * to the film price for the same seconds and tiers (`shotCredits`), so the quote the user approved is the bill.
 *
 * ⚠️ ONE WRITER PER STEP. Every state change is a compare-and-set on `version` (DirectorRunStore.replace). A shot is
 * claimed (`submitting`) BEFORE it is charged or submitted, so two concurrent requests can never charge or submit the
 * same attempt twice; the loser of a race just reports the run as it now stands. A submit that dies between the claim
 * and Google's answer leaves the shot `submitting`; after `staleSubmitMs` it is failed as an interrupted submit
 * with durable `requiresReconciliation` evidence (the user charge is refunded, but Google may still bill). Retry/edit
 * cannot start another attempt from it. A late operation is retained for an operator without reviving delivery.
 *
 * Pure: the store, the billing and the provider are injected. ./runServer.ts binds them to Supabase, the credit ledger
 * and the live Veo engine.
 */
import { PRICE_BOOK, veoRenderedSeconds, type ClipTier } from '@/lib/credits/priceBook';
import type { VeoSubmissionEvidence, VeoSubmissionJournal } from '@/lib/veo/submissionJournal';
import { SHOT_DECISIONS, shotDecisionsFor } from './director';
import { GoogleVeoProvider, type ShotTicket } from './googleVeoProvider';
import { draftFromFrozen, isFrozen, shotsInOrder, StoryboardNotFrozenError } from './storyboard';
import type { FrozenStoryboard, Shot, ShotDecision, ShotError, ShotMetadata, Storyboard } from './types';

// ── Records ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type DirectorRunState = 'running' | 'waiting_for_shot_decision' | 'completed' | 'cancelled';

export type ShotRunStatus = 'pending' | 'submitting' | 'rendering' | 'done' | 'failed';

export interface ShotRunRecord {
  shotId: string;
  status: ShotRunStatus;
  /** 1 for the first try; a retry is a new attempt with its own charge. */
  attempt: number;
  /** Credits this attempt costs (the approved quote's share). */
  credits: number;
  /** Credits actually debited for this attempt (0 before the charge, or when billing is bypassed outside production). */
  charged: number;
  /** True once a failed attempt's charge has been given back (or there was nothing to give back). */
  refunded: boolean;
  ticket?: ShotTicket;
  /** Private pre-POST evidence for this exact attempt; absent on historical records. */
  submission?: VeoSubmissionEvidence;
  clipUrl?: string;
  metadata?: ShotMetadata;
  error?: ShotError;
  updatedAt: string;
}

export interface DirectorRunRecord {
  id: string;
  userId: string;
  /** The frozen storyboard as approved. Executed exactly; never changed. */
  storyboard: FrozenStoryboard;
  state: DirectorRunState;
  /** Index (in `order` order) of the shot being worked on; equals the shot count once completed. */
  currentIndex: number;
  /** One record per shot, in `order` order. */
  shots: ShotRunRecord[];
  /** Every ShotError this run hit, in order (a completed run still lists the ones a retry overcame). */
  errors: ShotError[];
  /** Optimistic-concurrency counter: every write is a compare-and-set on it. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** What the browser sees: no user id, no tickets. */
export interface DirectorRunView {
  id: string;
  state: DirectorRunState;
  title: string;
  currentIndex: number;
  totalShots: number;
  /** The approved price: the sum of every shot's credits. */
  quoteCredits: number;
  shots: Array<{
    shotId: string;
    order: number;
    description: string;
    durationSeconds: number;
    status: ShotRunStatus;
    attempt: number;
    credits: number;
    clipUrl?: string;
    error?: ShotError;
  }>;
  pendingDecision?: { shotId: string; shotIndex: number; error: ShotError; options: readonly ShotDecision[] };
  errors: ShotError[];
  updatedAt: string;
}

// ── Ports ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DirectorRunStore {
  insert(run: DirectorRunRecord): Promise<void>;
  /** The run, only if it belongs to `userId`. */
  load(id: string, userId: string): Promise<DirectorRunRecord | null>;
  /** Compare-and-set: writes `next` only if the stored version is still `expectedVersion`. False = someone moved first. */
  replace(next: DirectorRunRecord, expectedVersion: number): Promise<boolean>;
}

export type ShotChargeResult = { ok: true; charged: number } | { ok: false; code: 'insufficient_credits' | 'billing_unavailable' };

export interface ShotBilling {
  charge(userId: string, credits: number, ref: string): Promise<ShotChargeResult>;
  /** Give back what was debited under `ref` (at most `credits`). Idempotent on `ref`. True when nothing is left owed. */
  refund(userId: string, ref: string, credits: number): Promise<boolean>;
}

export interface DirectorRunDeps {
  provider: GoogleVeoProvider;
  store: DirectorRunStore;
  billing: ShotBilling;
  clock?: () => Date;
  /** A shot still `submitting` after this long was interrupted mid-submit. Default 3 min (a submit takes seconds). */
  staleSubmitMs?: number;
}

export class DirectorRunNotFoundError extends Error {
  constructor() {
    super('no such run');
    this.name = 'DirectorRunNotFoundError';
  }
}

/** A decision that does not apply to the run as it stands (e.g. retrying a run that is still rendering). */
export class DirectorRunDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectorRunDecisionError';
  }
}

const DEFAULT_STALE_SUBMIT_MS = 3 * 60_000;

// ── Price ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Each shot's credits, in `order` order, from the price book (lib/credits/priceBook, the owner's 100 %-profit rule): the
 * film's base rides on the first shot, and every shot adds its Veo seconds on its tier (the length Veo renders, 4 / 6 /
 * 8 s) and a film scene's extras. The running total is rounded UP once and every shot pays the step it adds — so shots of
 * one tier and length add up to exactly filmCredits for the same film, and no shot pays a rounding twice.
 */
export function shotCredits(shots: readonly Pick<Shot, 'durationSeconds' | 'quality'>[]): number[] {
  let exact = shots.length > 0 ? PRICE_BOOK.filmBase : 0;
  let billed = 0;
  return shots.map((shot) => {
    const tier: ClipTier = shot.quality === 'lite' || shot.quality === 'standard' ? shot.quality : 'fast';
    const seconds = shot.durationSeconds > 0 ? veoRenderedSeconds(shot.durationSeconds) : 0;
    exact += (PRICE_BOOK.clip[tier] * seconds) / 8 + PRICE_BOOK.filmScene;
    // The 1e-9 absorbs float noise, like videoCredits.
    const total = Math.ceil(exact - 1e-9);
    const step = Math.max(0, total - billed);
    billed = total;
    return step;
  });
}

export function chargeRefFor(runId: string, index: number, attempt: number): string {
  return `director:${runId}:shot:${index}:a${attempt}`;
}

// ── View ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function viewOf(run: DirectorRunRecord): DirectorRunView {
  const shots = shotsInOrder(run.storyboard);
  const current = run.shots[run.currentIndex];
  const pending =
    run.state === 'waiting_for_shot_decision' && current?.status === 'failed' && current.error
      ? { shotId: current.shotId, shotIndex: run.currentIndex, error: current.error, options: shotDecisionsFor(current.error) }
      : undefined;
  return {
    id: run.id,
    state: run.state,
    title: run.storyboard.title,
    currentIndex: run.currentIndex,
    totalShots: shots.length,
    quoteCredits: run.shots.reduce((sum, s) => sum + s.credits, 0),
    shots: run.shots.map((rec, i) => {
      const shot = shots[i];
      return {
        shotId: rec.shotId,
        order: shot?.order ?? i + 1,
        description: shot?.description ?? '',
        durationSeconds: shot?.durationSeconds ?? 0,
        status: rec.status,
        attempt: rec.attempt,
        credits: rec.credits,
        ...(rec.clipUrl ? { clipUrl: rec.clipUrl } : {}),
        ...(rec.error ? { error: rec.error } : {}),
      };
    }),
    ...(pending ? { pendingDecision: pending } : {}),
    errors: [...run.errors],
    updatedAt: run.updatedAt,
  };
}

// ── Steps ────────────────────────────────────────────────────────────────────────────────────────────────────────

function assertProvider(provider: unknown): asserts provider is GoogleVeoProvider {
  // V1, as in createVideoDirector: the class, not just a "google_veo" claim.
  if (!(provider instanceof GoogleVeoProvider) || provider.providerName !== 'google_veo') {
    throw new Error('V1: the only video provider is GoogleVeoProvider ("google_veo")');
  }
}

/** A new, stored run for an approved, frozen storyboard. Nothing is charged or submitted yet. */
export async function startRun(
  deps: DirectorRunDeps,
  input: { id: string; userId: string; storyboard: FrozenStoryboard },
): Promise<DirectorRunView> {
  assertProvider(deps.provider);
  if (!isFrozen(input.storyboard)) throw new StoryboardNotFrozenError();
  const now = (deps.clock ?? (() => new Date()))().toISOString();
  const shots = shotsInOrder(input.storyboard);
  const credits = shotCredits(shots);
  const run: DirectorRunRecord = {
    id: input.id,
    userId: input.userId,
    storyboard: input.storyboard,
    state: 'running',
    currentIndex: 0,
    shots: shots.map((shot, i) => ({
      shotId: shot.id,
      status: 'pending',
      attempt: 1,
      credits: credits[i] ?? 0,
      charged: 0,
      refunded: false,
      updatedAt: now,
    })),
    errors: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.insert(run);
  return viewOf(run);
}

interface StepContext {
  deps: DirectorRunDeps;
  now: () => string;
}

function withShot(run: DirectorRunRecord, index: number, patch: Partial<ShotRunRecord>, at: string, top: Partial<DirectorRunRecord> = {}): DirectorRunRecord {
  const shots = run.shots.map((rec, i) => (i === index ? { ...rec, ...patch, updatedAt: at } : rec));
  return { ...run, ...top, shots, version: run.version + 1, updatedAt: at };
}

/** Write `next` over `run`; on a lost race, the run as it now stands. */
async function commit(ctx: StepContext, run: DirectorRunRecord, next: DirectorRunRecord): Promise<{ won: boolean; run: DirectorRunRecord }> {
  if (await ctx.deps.store.replace(next, run.version)) return { won: true, run: next };
  const fresh = await ctx.deps.store.load(run.id, run.userId);
  if (!fresh) throw new DirectorRunNotFoundError();
  return { won: false, run: fresh };
}

/** A late submit may no longer drive the run, but its operation must not disappear after a timeout/cancel. */
async function rememberLateTicket(ctx: StepContext, submittedRun: DirectorRunRecord, index: number, ticket: ShotTicket, fresh: DirectorRunRecord): Promise<DirectorRunRecord> {
  const submitted = submittedRun.shots[index];
  let current = fresh;
  for (let tries = 0; tries < 3; tries++) {
    const rec = current.shots[index];
    if (!submitted || !rec || current.userId !== submittedRun.userId || rec.shotId !== submitted.shotId
      || rec.attempt !== submitted.attempt || rec.status !== 'failed' || !rec.error?.requiresReconciliation || rec.ticket) return current;
    // Preserve state, refund, attempt and error. Recording evidence does not authorize polling or delivery.
    const saved = await commit(ctx, current, withShot(current, index, { ticket }, ctx.now()));
    if (saved.won) return saved.run;
    current = saved.run;
  }
  return current;
}

/** Give back the charge of every failed attempt not yet refunded. Safe to repeat: the ledger refund is idempotent. */
async function settleRefunds(ctx: StepContext, run: DirectorRunRecord): Promise<DirectorRunRecord> {
  let current = run;
  for (let i = 0; i < current.shots.length; i++) {
    const rec = current.shots[i];
    if (!rec || rec.status !== 'failed' || rec.refunded) continue;
    const settled = rec.charged > 0 ? await ctx.deps.billing.refund(current.userId, chargeRefFor(current.id, i, rec.attempt), rec.charged) : true;
    if (!settled) continue; // the ledger could not be read or written: tried again on the next step
    const { run: next } = await commit(ctx, current, withShot(current, i, { refunded: true }, ctx.now()));
    current = next;
  }
  return current;
}

/** Record a failed attempt, stop the run for the user's decision, then give its charge back. */
async function failShot(ctx: StepContext, run: DirectorRunRecord, index: number, error: ShotError, ticket?: ShotTicket): Promise<DirectorRunRecord> {
  const rec = run.shots[index];
  const next = withShot(
    run,
    index,
    { status: 'failed', error, refunded: !rec || rec.charged <= 0, ticket },
    ctx.now(),
    { state: 'waiting_for_shot_decision', errors: [...run.errors, error] },
  );
  const { won, run: after } = await commit(ctx, run, next);
  return won ? settleRefunds(ctx, after) : after;
}

/**
 * One step of the run. Returns the run as it stands afterwards. Safe to call as often as the browser likes: a step
 * that has nothing to do (a clip still rendering, a run waiting for the user) changes nothing.
 */
export async function advanceRun(deps: DirectorRunDeps, id: string, userId: string): Promise<DirectorRunView> {
  assertProvider(deps.provider);
  const clock = deps.clock ?? (() => new Date());
  const ctx: StepContext = { deps, now: () => clock().toISOString() };
  const loaded = await deps.store.load(id, userId);
  if (!loaded) throw new DirectorRunNotFoundError();
  let run = await settleRefunds(ctx, loaded);
  if (run.state !== 'running') return viewOf(run);

  const shots = shotsInOrder(run.storyboard);
  const index = run.currentIndex;
  const shot = shots[index];
  const rec = run.shots[index];
  if (!shot || !rec) {
    // Every shot is done: the run completed (a write that crashed before marking it).
    const { run: after } = await commit(ctx, run, { ...run, state: 'completed', version: run.version + 1, updatedAt: ctx.now() });
    return viewOf(after);
  }
  const input = {
    storyboardId: run.storyboard.id,
    shot,
    consistencyLock: run.storyboard.consistencyLock,
    params: { userId: run.userId, sessionId: `director-${run.id}` },
  };

  switch (rec.status) {
    case 'pending': {
      // 1. Claim the attempt — before any money moves or any request leaves.
      const claim = await commit(ctx, run, withShot(run, index, { status: 'submitting' }, ctx.now()));
      if (!claim.won) return viewOf(claim.run);
      run = claim.run;

      // 2. Charge this shot's share.
      const ref = chargeRefFor(run.id, index, rec.attempt);
      const paid = await deps.billing.charge(run.userId, rec.credits, ref);
      if (!paid.ok) {
        const message = paid.code === 'insufficient_credits'
          ? 'There are not enough credits for this shot. Nothing was charged or rendered; top up, then retry.'
          : 'Billing is unavailable right now. Nothing was charged or rendered; retry shortly.';
        return viewOf(await failShot(ctx, run, index, { shotId: shot.id, reason: 'unknown', message, retryable: true }));
      }
      const charged = await commit(ctx, run, withShot(run, index, { charged: paid.charged }, ctx.now()));
      if (!charged.won) {
        // Nobody else may move a claimed shot; if it happened anyway, give the money back and report what is stored.
        if (paid.charged > 0) await deps.billing.refund(run.userId, ref, paid.charged);
        return viewOf(charged.run);
      }
      run = charged.run;

      const submissionJournal: VeoSubmissionJournal = async (evidence) => {
        const current = run.shots[index];
        if (run.state !== 'running' || run.currentIndex !== index || current?.status !== 'submitting' || current.attempt !== rec.attempt || current.shotId !== shot.id) return false;
        const previous = current.submission;
        if (evidence.phase === 'prepared' ? previous !== undefined : !previous || previous.phase !== 'prepared') return false;
        if (evidence.phase === 'posting') {
          const { phase: _phase, bodySha256: _body, ...identity } = evidence;
          const { phase: _oldPhase, bodySha256: _oldBody, ...oldIdentity } = previous!;
          if (JSON.stringify(identity) !== JSON.stringify(oldIdentity) || !/^[a-f0-9]{64}$/.test(evidence.bodySha256 ?? '')) return false;
        }
        const saved = await commit(ctx, run, withShot(run, index, { submission: { ...evidence } }, ctx.now()));
        // Keep our old version on a lost fence: the failure path must not overwrite a cancellation/newer writer.
        if (saved.won) run = saved.run;
        return saved.won;
      };

      // 3. Submit — at most one createClip.
      let submitted: Awaited<ReturnType<GoogleVeoProvider['submitShot']>>;
      try {
        submitted = await deps.provider.submitShot({ ...input, submissionJournal });
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        submitted = { ok: false, error: { shotId: shot.id, reason: 'unknown', message: 'The video provider failed unexpectedly on this shot. Its outcome needs review before another attempt.', retryable: false, requiresReconciliation: true, ...(raw ? { veoRawResponse: raw.slice(0, 300) } : {}) } };
      }
      if (!submitted.ok) {
        const error: ShotError = { ...submitted.error, shotId: shot.id,
          ...(submitted.ticket ? { requiresReconciliation: true, retryable: false } : {}),
        };
        const failed = await failShot(ctx, run, index, error, submitted.ticket);
        // A rejected contract can still carry an accepted operation. Preserve it even when a stale/cancel CAS won.
        return viewOf(submitted.ticket ? await rememberLateTicket(ctx, run, index, submitted.ticket, failed) : failed);
      }
      const rendering = await commit(ctx, run, withShot(run, index, { status: 'rendering', ticket: submitted.ticket }, ctx.now()));
      return viewOf(rendering.won ? rendering.run : await rememberLateTicket(ctx, run, index, submitted.ticket, rendering.run));
    }

    case 'submitting': {
      const age = Date.parse(ctx.now()) - Date.parse(rec.updatedAt);
      if (!(age > (deps.staleSubmitMs ?? DEFAULT_STALE_SUBMIT_MS))) return viewOf(run);
      return viewOf(await failShot(ctx, run, index, {
        shotId: shot.id,
        reason: 'veo_internal',
        message: 'The submit of this shot was interrupted. Veo may still render and bill it; the submission needs review before another attempt.',
        retryable: false,
        requiresReconciliation: true,
      }));
    }

    case 'rendering': {
      if (!rec.ticket) {
        return viewOf(await failShot(ctx, run, index, { shotId: shot.id, reason: 'unknown', message: 'This shot lost its Veo job reference. Its outcome needs review before another attempt.', retryable: false, requiresReconciliation: true }));
      }
      let checked: Awaited<ReturnType<GoogleVeoProvider['checkShot']>>;
      try {
        checked = await deps.provider.checkShot({ ...input, ticket: rec.ticket });
      } catch {
        checked = { state: 'processing' };
      }
      if (checked.state === 'processing') return viewOf(run);
      if (checked.state === 'failed') return viewOf(await failShot(ctx, run, index, { ...checked.error, shotId: shot.id }));
      const last = index + 1 >= shots.length;
      const done = await commit(
        ctx,
        run,
        withShot(run, index, { status: 'done', clipUrl: checked.clipUrl, metadata: checked.metadata }, ctx.now(), {
          currentIndex: index + 1,
          state: last ? 'completed' : 'running',
        }),
      );
      return viewOf(done.run);
    }

    case 'failed': {
      // A failed shot always stops the run; repair a run that was left `running` over one.
      if (!rec.error) return viewOf(run);
      const { run: after } = await commit(ctx, run, { ...run, state: 'waiting_for_shot_decision', version: run.version + 1, updatedAt: ctx.now() });
      return viewOf(after);
    }

    default:
      return viewOf(run);
  }
}

/**
 * The user's answer to a failed shot. `retry`: the same frozen shot again as a new attempt (charged again, the failed
 * attempt already refunded), then the rest in order. `cancel`: the run ends, keeping its finished clips. `edit`: the run
 * ends and the caller gets a new, unapproved draft of the storyboard to edit, approve and start as a new run.
 * `cancel` is also accepted between shots of a running run (nothing in flight); never while a shot renders.
 */
export async function decideRun(
  deps: DirectorRunDeps,
  id: string,
  userId: string,
  decision: ShotDecision,
): Promise<{ view: DirectorRunView; draft?: Storyboard }> {
  assertProvider(deps.provider);
  const clock = deps.clock ?? (() => new Date());
  const ctx: StepContext = { deps, now: () => clock().toISOString() };
  const loaded = await deps.store.load(id, userId);
  if (!loaded) throw new DirectorRunNotFoundError();
  const run = await settleRefunds(ctx, loaded);
  const index = run.currentIndex;
  const rec = run.shots[index];

  const waiting = run.state === 'waiting_for_shot_decision' && rec?.status === 'failed';
  const betweenShots = run.state === 'running' && rec?.status === 'pending';
  if (!SHOT_DECISIONS.includes(decision)) throw new DirectorRunDecisionError(`unknown decision "${String(decision)}"`);
  if (!(waiting || (decision === 'cancel' && betweenShots))) {
    throw new DirectorRunDecisionError(`"${decision}" does not apply to this run now (${run.state}${rec ? `, shot ${rec.status}` : ''})`);
  }
  if (waiting && rec?.error && !shotDecisionsFor(rec.error).includes(decision)) {
    throw new DirectorRunDecisionError('the provider outcome must be reconciled before another attempt');
  }
  if (waiting && rec && !rec.refunded) {
    throw new DirectorRunDecisionError('the failed shot\'s charge is still being returned; try again in a moment');
  }

  if (decision === 'retry') {
    const next = withShot(
      run,
      index,
      { status: 'pending', attempt: (rec?.attempt ?? 1) + 1, charged: 0, refunded: false, ticket: undefined, submission: undefined, clipUrl: undefined, metadata: undefined, error: undefined },
      ctx.now(),
      { state: 'running' },
    );
    const { won, run: after } = await commit(ctx, run, next);
    if (!won) throw new DirectorRunDecisionError('the run changed while deciding; reload it');
    return { view: viewOf(after) };
  }

  const { won, run: after } = await commit(ctx, run, { ...run, state: 'cancelled', version: run.version + 1, updatedAt: ctx.now() });
  if (!won) throw new DirectorRunDecisionError('the run changed while deciding; reload it');
  return decision === 'edit' ? { view: viewOf(after), draft: draftFromFrozen(after.storyboard) } : { view: viewOf(after) };
}
