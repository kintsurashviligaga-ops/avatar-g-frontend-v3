/** @jest-environment node */
/**
 * run.ts — the serverless director run, step by step, over GoogleVeoProvider and a scripted fake engine (no network,
 * no spend), an in-memory compare-and-set store and a fake ledger. Rules under test: shots go strictly in `order`, one
 * createClip per attempt; the first ShotError stops the run (V5) and the next shot is never submitted; every attempt is
 * charged under its own ref just before its submit and refunded when it delivers no clip; a concurrent step can never
 * charge or submit an attempt twice; an interrupted submit is failed, never re-submitted; decisions apply only where
 * they make sense; and the per-shot prices add up to the film price.
 */
jest.mock('../../ai/llmText', () => ({
  llmText: jest.fn(() => {
    throw new Error('no LLM in these tests');
  }),
}));

import { videoCredits } from '@/lib/credits/videoPricing';
import { GoogleVeoProvider } from './googleVeoProvider';
import {
  advanceRun,
  chargeRefFor,
  decideRun,
  DirectorRunDecisionError,
  DirectorRunNotFoundError,
  shotCredits,
  startRun,
  type DirectorRunDeps,
  type DirectorRunRecord,
  type DirectorRunStore,
  type ShotBilling,
  type ShotChargeResult,
} from './run';
import { freeze, restoreFrozen, StoryboardNotFrozenError } from './storyboard';
import { createFakeVeoEngine, type FakeVeoEngineOptions } from './testing/fakeVeoEngine';
import { makeShot, makeStoryboard, threeShots } from './testing/fixtures';
import type { FrozenStoryboard } from './types';

const USER = 'user-1';
const T0 = Date.parse('2026-10-08T12:00:00.000Z');

function memoryStore() {
  const rows = new Map<string, string>();
  const store: DirectorRunStore & { get(id: string): DirectorRunRecord; writes: number } = {
    writes: 0,
    async insert(run) {
      if (rows.has(run.id)) throw new Error('duplicate run id');
      rows.set(run.id, JSON.stringify(run));
    },
    async load(id, userId) {
      const raw = rows.get(id);
      if (!raw) return null;
      const run = JSON.parse(raw) as DirectorRunRecord;
      // JSON drops the freeze; hand it back frozen, as runServer does.
      return run.userId === userId ? { ...run, storyboard: restoreFrozen(run.storyboard) } : null;
    },
    async replace(next, expectedVersion) {
      const raw = rows.get(next.id);
      if (!raw || (JSON.parse(raw) as DirectorRunRecord).version !== expectedVersion) return false;
      rows.set(next.id, JSON.stringify(next));
      store.writes++;
      return true;
    },
    get(id) {
      return JSON.parse(rows.get(id) as string) as DirectorRunRecord;
    },
  };
  return store;
}


function fakeBilling(opts: { charge?: (credits: number, ref: string) => ShotChargeResult; refundOk?: () => boolean } = {}) {
  const charges: Array<{ userId: string; credits: number; ref: string }> = [];
  const refunds: Array<{ userId: string; ref: string; credits: number }> = [];
  const billing: ShotBilling = {
    async charge(userId, credits, ref) {
      const result = opts.charge?.(credits, ref) ?? { ok: true, charged: credits };
      if (result.ok) charges.push({ userId, credits: result.charged, ref });
      return result;
    },
    async refund(userId, ref, credits) {
      const ok = opts.refundOk?.() ?? true;
      if (ok) refunds.push({ userId, ref, credits });
      return ok;
    },
  };
  return { billing, charges, refunds };
}

function setup(engineOpts: FakeVeoEngineOptions = {}, billingOpts: Parameters<typeof fakeBilling>[0] = {}) {
  const engine = createFakeVeoEngine(engineOpts);
  const provider = new GoogleVeoProvider({ engine, maxWaitMs: 30_000 });
  const store = memoryStore();
  const ledger = fakeBilling(billingOpts);
  let now = T0;
  const deps: DirectorRunDeps = { provider, store, billing: ledger.billing, clock: () => new Date(now) };
  const tick = (ms: number) => {
    now += ms;
  };
  return { engine, provider, store, deps, tick, ...ledger };
}

function board(): FrozenStoryboard {
  const shots = [
    makeShot({ id: 'c', order: 3, prompt: 'Shot three.' }),
    makeShot({ id: 'a', order: 1, prompt: 'Shot one.' }),
    makeShot({ id: 'b', order: 2, prompt: 'Shot two.' }),
  ];
  return freeze(makeStoryboard(shots), () => new Date(T0));
}

async function started(s: ReturnType<typeof setup>, storyboard = board()) {
  await startRun(s.deps, { id: 'run-1', userId: USER, storyboard });
}

describe('shotCredits — the shots add up to the film price', () => {
  it('equals videoCredits for the same seconds on one tier', () => {
    const shots = threeShots();
    const parts = shotCredits(shots);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(videoCredits({ seconds: 24, quality: 'fast' }));
  });

  it('rounds once, on the running total, across mixed tiers', () => {
    // 4 s lite = 7.5, 6 s fast = 18.75, 8 s standard = 82.5 → 108.75 → 109 in total, never 8 + 19 + 83.
    const parts = shotCredits([
      { durationSeconds: 4, quality: 'lite' },
      { durationSeconds: 6, quality: 'fast' },
      { durationSeconds: 8, quality: 'standard' },
    ]);
    expect(parts).toEqual([8, 19, 82]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(109);
  });
});

describe('startRun', () => {
  it('stores a running run with every shot pending, in `order`, and charges or submits nothing', async () => {
    const s = setup();
    const view = await startRun(s.deps, { id: 'run-1', userId: USER, storyboard: board() });
    expect(view.state).toBe('running');
    expect(view.shots.map((x) => [x.shotId, x.status])).toEqual([['a', 'pending'], ['b', 'pending'], ['c', 'pending']]);
    expect(view.quoteCredits).toBe(75);
    expect(s.engine.calls).toHaveLength(0);
    expect(s.charges).toHaveLength(0);
  });

  it('refuses a storyboard that was never frozen', async () => {
    const s = setup();
    const draft = makeStoryboard(threeShots()) as unknown as FrozenStoryboard;
    await expect(startRun(s.deps, { id: 'run-1', userId: USER, storyboard: draft })).rejects.toBeInstanceOf(StoryboardNotFrozenError);
  });

  it('refuses any provider but GoogleVeoProvider (V1)', async () => {
    const s = setup();
    const lookalike = { providerName: 'google_veo', submitShot: jest.fn(), checkShot: jest.fn() } as unknown as GoogleVeoProvider;
    await expect(startRun({ ...s.deps, provider: lookalike }, { id: 'run-1', userId: USER, storyboard: board() })).rejects.toThrow(/V1/);
  });

  it('never shows the browser the user id or a Veo ticket', async () => {
    const s = setup();
    await started(s);
    const view = await advanceRun(s.deps, 'run-1', USER);
    const json = JSON.stringify(view);
    expect(json).not.toContain(USER);
    expect(json).not.toContain('operations/');
  });
});

describe('advanceRun — the happy path', () => {
  it('charges, submits and delivers each shot in `order`, one createClip per shot, then completes', async () => {
    const s = setup();
    await started(s);
    const states: string[] = [];
    for (let i = 0; i < 6; i++) {
      const view = await advanceRun(s.deps, 'run-1', USER);
      states.push(`${view.state}:${view.currentIndex}:${view.shots[Math.min(view.currentIndex, 2)]?.status}`);
    }
    expect(states).toEqual([
      'running:0:rendering',
      'running:1:pending',
      'running:1:rendering',
      'running:2:pending',
      'running:2:rendering',
      'completed:3:done',
    ]);
    expect(s.engine.calls.map((c) => c.request.prompt)).toEqual(['Shot one.', 'Shot two.', 'Shot three.']);
    expect(s.charges.map((c) => c.ref)).toEqual([chargeRefFor('run-1', 0, 1), chargeRefFor('run-1', 1, 1), chargeRefFor('run-1', 2, 1)]);
    expect(s.charges.reduce((sum, c) => sum + c.credits, 0)).toBe(75);
    expect(s.refunds).toHaveLength(0);
    const final = await advanceRun(s.deps, 'run-1', USER);
    expect(final.shots.every((x) => x.clipUrl?.startsWith('https://storage.example.com/'))).toBe(true);
    expect(s.engine.calls).toHaveLength(3);
  });

  it('writes nothing while the clip is still rendering', async () => {
    const s = setup({ script: () => ({ polls: [{ state: 'processing' }] }) });
    await started(s);
    await advanceRun(s.deps, 'run-1', USER);
    const writes = s.store.writes;
    const view = await advanceRun(s.deps, 'run-1', USER);
    expect(view.shots[0]?.status).toBe('rendering');
    expect(s.store.writes).toBe(writes);
  });

  it('is unknown to any other user', async () => {
    const s = setup();
    await started(s);
    await expect(advanceRun(s.deps, 'run-1', 'someone-else')).rejects.toBeInstanceOf(DirectorRunNotFoundError);
  });
});

describe('advanceRun — failures stop the run (V5) and give the money back', () => {
  it('a Veo failure on shot 2: the run waits, shot 3 is never submitted, and shot 2 is refunded', async () => {
    const s = setup({ script: (i) => (i === 1 ? { polls: [{ state: 'failed', reason: 'boom', code: 13 }] } : undefined) });
    await started(s);
    for (let i = 0; i < 6; i++) await advanceRun(s.deps, 'run-1', USER);
    const view = await advanceRun(s.deps, 'run-1', USER);
    expect(view.state).toBe('waiting_for_shot_decision');
    expect(view.pendingDecision).toMatchObject({ shotId: 'b', shotIndex: 1, options: ['retry', 'edit', 'cancel'] });
    expect(view.pendingDecision?.error.reason).toBe('veo_internal');
    expect(s.engine.calls).toHaveLength(2);
    expect(s.refunds).toEqual([{ userId: USER, ref: chargeRefFor('run-1', 1, 1), credits: 25 }]);
    expect(s.store.get('run-1').shots[1]?.refunded).toBe(true);
  });

  it('a refused submit is refunded and stops the run', async () => {
    const s = setup({ script: () => ({ submit: { ok: false, reason: 'invalid_request', retryable: false, status: 400, detail: 'bad' } }) });
    await started(s);
    const view = await advanceRun(s.deps, 'run-1', USER);
    expect(view.state).toBe('waiting_for_shot_decision');
    expect(s.charges).toHaveLength(1);
    expect(s.refunds.map((r) => r.ref)).toEqual([chargeRefFor('run-1', 0, 1)]);
  });

  it('a submit that throws is failed and refunded, never retried on its own', async () => {
    const s = setup({ createThrows: () => new Error('socket hang up') });
    await started(s);
    const view = await advanceRun(s.deps, 'run-1', USER);
    expect(view.state).toBe('waiting_for_shot_decision');
    expect(view.pendingDecision?.error.reason).toBe('unknown');
    await advanceRun(s.deps, 'run-1', USER);
    expect(s.engine.calls).toHaveLength(1);
    expect(s.refunds).toHaveLength(1);
  });

  it('no credits: nothing is submitted or charged, and the run waits with a retryable error', async () => {
    const s = setup({}, { charge: () => ({ ok: false, code: 'insufficient_credits' }) });
    await started(s);
    const view = await advanceRun(s.deps, 'run-1', USER);
    expect(view.state).toBe('waiting_for_shot_decision');
    expect(view.pendingDecision?.error).toMatchObject({ retryable: true });
    expect(view.pendingDecision?.error.message).toMatch(/not enough credits/);
    expect(s.engine.calls).toHaveLength(0);
    expect(s.refunds).toHaveLength(0);
  });

  it('a refund the ledger could not make is retried on the next step, and blocks a retry until it lands', async () => {
    let ledgerUp = false;
    const s = setup({ script: () => ({ polls: [{ state: 'failed', reason: 'boom', code: 13 }] }) }, { refundOk: () => ledgerUp });
    await started(s);
    await advanceRun(s.deps, 'run-1', USER);
    await advanceRun(s.deps, 'run-1', USER);
    expect(s.store.get('run-1').shots[0]?.refunded).toBe(false);
    await expect(decideRun(s.deps, 'run-1', USER, 'retry')).rejects.toBeInstanceOf(DirectorRunDecisionError);
    ledgerUp = true;
    await advanceRun(s.deps, 'run-1', USER);
    expect(s.store.get('run-1').shots[0]?.refunded).toBe(true);
    expect(s.refunds).toHaveLength(1);
  });
});

describe('advanceRun — one writer per attempt', () => {
  it('two concurrent steps on a pending shot charge and submit it once', async () => {
    const s = setup();
    await started(s);
    await Promise.all([advanceRun(s.deps, 'run-1', USER), advanceRun(s.deps, 'run-1', USER), advanceRun(s.deps, 'run-1', USER)]);
    expect(s.engine.calls).toHaveLength(1);
    expect(s.charges).toHaveLength(1);
  });

  it('an interrupted submit is failed after the stale window and refunded, never re-submitted', async () => {
    const s = setup();
    await started(s);
    // A submit that died after the claim and the charge: the shot is left `submitting` with money taken.
    const row = s.store.get('run-1');
    const stuck: DirectorRunRecord = {
      ...row,
      shots: row.shots.map((r, i) => (i === 0 ? { ...r, status: 'submitting', charged: 25 } : r)),
      version: row.version + 1,
    };
    await s.store.replace(stuck, row.version);

    s.tick(60_000);
    expect((await advanceRun(s.deps, 'run-1', USER)).shots[0]?.status).toBe('submitting');
    s.tick(3 * 60_000);
    const view = await advanceRun(s.deps, 'run-1', USER);
    expect(view.state).toBe('waiting_for_shot_decision');
    expect(view.pendingDecision?.error.reason).toBe('veo_internal');
    expect(s.engine.calls).toHaveLength(0);
    expect(s.refunds).toEqual([{ userId: USER, ref: chargeRefFor('run-1', 0, 1), credits: 25 }]);
  });
});

describe('decideRun', () => {
  async function failedOnFirstShot(times = 1) {
    const s = setup({ script: (i) => (i < times ? { polls: [{ state: 'failed', reason: 'boom', code: 13 }] } : undefined) });
    await started(s);
    await advanceRun(s.deps, 'run-1', USER);
    await advanceRun(s.deps, 'run-1', USER);
    return s;
  }

  it('retry renders the same frozen shot again as a new, separately charged attempt, then carries on in order', async () => {
    const s = await failedOnFirstShot();
    const { view } = await decideRun(s.deps, 'run-1', USER, 'retry');
    expect(view.state).toBe('running');
    expect(view.shots[0]).toMatchObject({ status: 'pending', attempt: 2 });
    for (let i = 0; i < 6; i++) await advanceRun(s.deps, 'run-1', USER);
    const done = await advanceRun(s.deps, 'run-1', USER);
    expect(done.state).toBe('completed');
    expect(s.engine.calls.map((c) => c.request.prompt)).toEqual(['Shot one.', 'Shot one.', 'Shot two.', 'Shot three.']);
    expect(s.charges.map((c) => c.ref)).toEqual([
      chargeRefFor('run-1', 0, 1),
      chargeRefFor('run-1', 0, 2),
      chargeRefFor('run-1', 1, 1),
      chargeRefFor('run-1', 2, 1),
    ]);
    expect(done.errors).toHaveLength(1);
  });

  it('cancel ends the run; nothing more is submitted', async () => {
    const s = await failedOnFirstShot();
    const { view } = await decideRun(s.deps, 'run-1', USER, 'cancel');
    expect(view.state).toBe('cancelled');
    await advanceRun(s.deps, 'run-1', USER);
    expect(s.engine.calls).toHaveLength(1);
  });

  it('edit ends the run and returns a new, unapproved draft of the same storyboard', async () => {
    const s = await failedOnFirstShot();
    const { view, draft } = await decideRun(s.deps, 'run-1', USER, 'edit');
    expect(view.state).toBe('cancelled');
    expect(draft?.approvedByUser).toBe(false);
    expect(draft?.shots.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('refuses a decision while a shot renders, and an unknown decision', async () => {
    const s = setup({ script: () => ({ polls: [{ state: 'processing' }] }) });
    await started(s);
    await advanceRun(s.deps, 'run-1', USER);
    await expect(decideRun(s.deps, 'run-1', USER, 'retry')).rejects.toBeInstanceOf(DirectorRunDecisionError);
    await expect(decideRun(s.deps, 'run-1', USER, 'cancel')).rejects.toBeInstanceOf(DirectorRunDecisionError);
    await expect(decideRun(s.deps, 'run-1', USER, 'skip' as never)).rejects.toBeInstanceOf(DirectorRunDecisionError);
  });

  it('accepts cancel between shots, when nothing is in flight', async () => {
    const s = setup();
    await started(s);
    const { view } = await decideRun(s.deps, 'run-1', USER, 'cancel');
    expect(view.state).toBe('cancelled');
    expect(s.engine.calls).toHaveLength(0);
  });
});
