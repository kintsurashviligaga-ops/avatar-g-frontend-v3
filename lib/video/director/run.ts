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
 * (refunded, the user decides) — never re-submitted on its own.
 *
 * Pure: the store, the billing and the provider are injected. ./runServer.ts binds them to Supabase, the credit ledger
 * and the live Veo engine.
 */
import { VIDEO_CREDITS_PER_SEC, VIDEO_QUALITY_MULT, type VideoQuality } from '@/lib/credits/videoPricing';
import { SHOT_DECISIONS } from './director';
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
 * Each shot's credits, in `order` order. The film price for the same seconds and tiers (lib/credits/videoPricing: 25
 * credits per 8 s on Fast, scaled by tier) is rounded UP once, on the running total, and every shot pays the step it
 * adds — so the shots add up to exactly the film price, and no shot pays a rounding twice.
 */
export function shotCredits(shots: readonly Pick<Shot, 'durationSeconds' | 'quality'>[]): number[] {
  let exact = 0;
  let billed = 0;
  return shots.map((shot) => {
    const mult = VIDEO_QUALITY_MULT[shot.quality as VideoQuality] ?? 1;
    exact += Math.max(0, shot.durationSeconds) * VIDEO_CREDITS_PER_SEC * mult;
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
      ? { shotId: current.shotId, shotIndex: run.currentIndex, error: current.error, options: SHOT_DECISIONS }
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
async function failShot(ctx: StepContext, run: DirectorRunRecord, index: number, error: ShotError): Promise<DirectorRunRecord> {
  const rec = run.shots[index];
  const next = withShot(
    run,
    index,
    { status: 'failed', error, refunded: !rec || rec.charged <= 0, ticket: undefined },
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

      // 3. Submit — at most one createClip.
      let submitted: Awaited<ReturnType<GoogleVeoProvider['submitShot']>>;
      try {
        submitted = await deps.provider.submitShot(input);
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        submitted = { ok: false, error: { shotId: shot.id, reason: 'unknown', message: 'The video provider failed unexpectedly on this shot.', retryable: false, ...(raw ? { veoRawResponse: raw.slice(0, 300) } : {}) } };
      }
      if (!submitted.ok) return viewOf(await failShot(ctx, run, index, { ...submitted.error, shotId: shot.id }));
      const rendering = await commit(ctx, run, withShot(run, index, { status: 'rendering', ticket: submitted.ticket }, ctx.now()));
      return viewOf(rendering.run);
    }

    case 'submitting': {
      const age = Date.parse(ctx.now()) - Date.parse(rec.updatedAt);
      if (!(age > (deps.staleSubmitMs ?? DEFAULT_STALE_SUBMIT_MS))) return viewOf(run);
      return viewOf(await failShot(ctx, run, index, {
        shotId: shot.id,
        reason: 'veo_internal',
        message: 'The submit of this shot was interrupted, so it is not known whether Veo started it. Nothing will be delivered for it; a retry renders it again.',
        retryable: true,
      }));
    }

    case 'rendering': {
      if (!rec.ticket) {
        return viewOf(await failShot(ctx, run, index, { shotId: shot.id, reason: 'unknown', message: 'This shot lost its Veo job reference. A retry renders it again.', retryable: true }));
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
  if (waiting && rec && !rec.refunded) {
    throw new DirectorRunDecisionError('the failed shot\'s charge is still being returned; try again in a moment');
  }

  if (decision === 'retry') {
    const next = withShot(
      run,
      index,
      { status: 'pending', attempt: (rec?.attempt ?? 1) + 1, charged: 0, refunded: false, ticket: undefined, clipUrl: undefined, metadata: undefined, error: undefined },
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
