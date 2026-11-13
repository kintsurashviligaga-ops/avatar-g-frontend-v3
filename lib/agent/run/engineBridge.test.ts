/** @jest-environment node */
/**
 * engineBridge (v5.1 Phase 3.5b): a v2 run is decided by lib/agent/engine and projected back onto the v1 step records
 * that ./runExec acts on. Pure: the helpers below do what runExec does with each action (quote, queue, cancel), so every
 * mapping in the file header is checked without a store: each ChildView, the 2-at-a-time cap, a price above approval,
 * one retry within the approved price, pause, the deadline, and resume.
 */
import type { AgentApproval } from '../contracts';
import { MEDIA_RUN_DEADLINE_MS, RETRY_BACKOFF_MS } from '../engine/types';
import { isRetryable, newRunV2, planTickV2, resumedRunV2 } from './engineBridge';
import { moveStep, newRun, planTick, runOf, stepOf, type ChildView, type RunAction, type RunState } from './runEngine';
import type { RunSpec } from './runSpec';

const T0 = 1_000_000;
const APPROVAL: AgentApproval = { quoteFingerprint: 'run:x', channel: 'tap', evidence: 'plan', at: new Date(T0).toISOString(), userId: 'user-a' };
const CHAIN: RunSpec = {
  steps: [
    { id: 'sound', tool: 'audio_extract', source: { file: 'omni-uploads/user-a/concert.mp4' } },
    { id: 'clip', tool: 'montage', files: ['omni-uploads/user-a/a.mp4', 'omni-uploads/user-a/b.mp4', { step: 'sound' }] },
  ],
};
const FAN: RunSpec = {
  steps: [
    { id: 'one', tool: 'audio_extract', source: { file: 'omni-uploads/user-a/1.mp4' } },
    { id: 'two', tool: 'audio_extract', source: { file: 'omni-uploads/user-a/2.mp4' } },
    { id: 'three', tool: 'audio_extract', source: { file: 'omni-uploads/user-a/3.mp4' } },
    { id: 'cut', tool: 'montage', files: ['omni-uploads/user-a/a.mp4', { step: 'one' }] },
  ],
};
const AUDIO: ChildView = { state: 'completed', output: { url: 'https://x.supabase.co/sign/renders/audio/extract-t1.mp3?token=t', media: 'audio', durationSec: 60 } };
const VIDEO: ChildView = { state: 'completed', output: { url: 'https://x.supabase.co/sign/renders/montage/m.mp4?token=t', media: 'video', durationSec: 30 } };
const LIVE: ChildView = { state: 'live', running: true, stage: 'extract', pct: 40 };

/** List prices: an extraction is free, a montage costs 10 (both approved at that price when the run is tapped). */
const PRICE = (tool: string) => (tool === 'montage' ? 10 : 0);
const fresh = (spec: RunSpec = CHAIN, at = T0) => newRunV2('run-1', spec, APPROVAL, PRICE, at);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const starts = (a: RunAction[]) => a.filter((x) => x.type === 'start').map((x) => x.step);
const engStatus = (run: RunState, id: string) => run.engine!.steps.find((s) => s.id === id)!.status;

/** What runExec's startSteps does with a start: quote the step; at or under its approval queue it, above it ask. */
let n = 0;
function quote(run: RunState, id: string, credits: number, at = T0): RunState {
  const next = clone(run);
  const s = stepOf(next, id)!;
  n += 1;
  const taskId = `t${n}`;
  s.quote = { taskId, credits, request: {}, token: `tok-${taskId}`, expiresAt: at + 30 * 60_000, quoteId: `q-${taskId}` };
  if (credits > s.approvedCredits) moveStep(next, s, 'awaiting_approval', at, 'step.awaiting_approval', `${credits} credits`);
  else {
    s.taskId = taskId;
    moveStep(next, s, 'queued', at, 'step.queued');
  }
  return next;
}

/** What approveStep does on a v2 run: record the yes to that quote; the next tick releases it. */
function yes(run: RunState, id: string): RunState {
  const next = clone(run);
  const s = stepOf(next, id)!;
  s.approvedQuoteId = s.quote!.quoteId;
  return next;
}

describe('a v2 run carries both records and survives a round trip through the stored row', () => {
  test('newRunV2: v1 step records plus the engine run on the same steps and approved prices', () => {
    const run = fresh();
    expect(run.v).toBe(2);
    expect(run.steps.map((s) => [s.id, s.status, s.approvedCredits])).toEqual([['sound', 'planned', 0], ['clip', 'planned', 10]]);
    expect(run.engine!.steps.map((s) => [s.id, s.status, s.approvedCredits])).toEqual([['sound', 'pending', 0], ['clip', 'pending', 10]]);
    expect(runOf({ _run: clone(run) })).toEqual(run);
  });

  test('a stored v2 row whose engine names other steps is not a run (never half-read)', () => {
    const run = fresh();
    run.engine!.steps = run.engine!.steps.slice(0, 1);
    expect(runOf({ _run: clone(run) })).toBeNull();
  });

  test('planTickV2 leaves a v1 run alone, and a v1 run never gains an engine from planTick', () => {
    const v1 = newRun(CHAIN, APPROVAL, PRICE, T0);
    expect(planTickV2(v1, {}, T0)).toEqual({ next: v1, actions: [] });
    const t = planTick(v1, {}, T0);
    expect(t.next.v).toBe(1);
    expect(t.next.engine).toBeUndefined();
  });
});

describe('the chain, step by step: each ChildView reaches the engine and comes back in step words', () => {
  test('start → queued → live → completed feeds the next step; the run completes', () => {
    let t = planTickV2(fresh(), {}, T0);
    expect(t.actions).toEqual([{ type: 'start', step: 'sound' }]);
    expect(t.next.status).toBe('running');
    expect(engStatus(t.next, 'sound')).toBe('running');
    expect(stepOf(t.next, 'sound')!.attemptId).toBe(t.next.engine!.steps[0]!.attemptId);

    let run = quote(t.next, 'sound', 0);
    t = planTickV2(run, { sound: LIVE }, T0 + 1);
    expect(t.actions).toEqual([]);
    expect(stepOf(t.next, 'sound')!.status).toBe('running');

    t = planTickV2(t.next, { sound: AUDIO }, T0 + 2);
    expect(stepOf(t.next, 'sound')).toMatchObject({ status: 'completed', output: (AUDIO as { output: unknown }).output });
    expect(engStatus(t.next, 'sound')).toBe('done');
    expect(t.actions).toEqual([{ type: 'start', step: 'clip' }]);

    run = quote(t.next, 'clip', 10);
    t = planTickV2(run, { sound: AUDIO, clip: VIDEO }, T0 + 3);
    expect(t.next.status).toBe('completed');
    expect(t.next.steps.map((s) => s.status)).toEqual(['completed', 'completed']);
    expect(t.next.engine!.status).toBe('completed');
  });

  test('a failure that is not retryable fails the step and skips what needs it; the run fails', () => {
    let t = planTickV2(fresh(), {}, T0);
    const run = quote(t.next, 'sound', 0);
    t = planTickV2(run, { sound: { state: 'failed', error: 'extract_failed' } }, T0 + 1);
    expect(stepOf(t.next, 'sound')).toMatchObject({ status: 'failed', error: 'extract_failed' });
    expect(stepOf(t.next, 'clip')).toMatchObject({ status: 'cancelled', error: 'skipped' });
    expect(t.next.events.some((e) => e.type === 'step.skipped' && e.step === 'clip')).toBe(true);
    expect(t.next.status).toBe('failed');
    expect(t.actions).toEqual([]);
  });

  test('a job cancelled from outside the run is a failure of that step, never a retry', () => {
    let t = planTickV2(fresh(), {}, T0);
    const run = quote(t.next, 'sound', 0);
    t = planTickV2(run, { sound: { state: 'cancelled' } }, T0 + 1);
    expect(stepOf(t.next, 'sound')!.status).toBe('failed');
    expect(t.next.events.some((e) => e.type === 'step.retry')).toBe(false);
  });

  test('a running job that vanished is lost (nothing will deliver it); a queued one is queued again', () => {
    let t = planTickV2(fresh(), {}, T0);
    let run = quote(t.next, 'sound', 0);
    const again = planTickV2(run, {}, T0 + 1);
    expect(again.actions).toEqual([{ type: 'enqueue', step: 'sound' }]);
    expect(stepOf(again.next, 'sound')!.status).toBe('queued');

    t = planTickV2(run, { sound: LIVE }, T0 + 1);
    run = t.next;
    t = planTickV2(run, {}, T0 + 2);
    expect(stepOf(t.next, 'sound')).toMatchObject({ status: 'failed', error: 'lost' });
  });

  test('a queued step whose quote expired before its job existed is priced again (no double charge)', () => {
    const t = planTickV2(fresh(), {}, T0);
    const run = quote(t.next, 'sound', 0);
    const late = planTickV2(run, {}, T0 + 31 * 60_000);
    expect(late.actions).toEqual([{ type: 'start', step: 'sound' }]);
    expect(stepOf(late.next, 'sound')!.quote).toBeUndefined();
    expect(late.next.events.some((e) => e.type === 'step.requote')).toBe(true);
  });

  test('a start whose tick died before quoting is asked for again, and only once a quote is missing', () => {
    const t = planTickV2(fresh(), {}, T0);
    expect(planTickV2(t.next, {}, T0 + 1).actions).toEqual([{ type: 'start', step: 'sound' }]);
    expect(planTickV2(quote(t.next, 'sound', 0), { sound: LIVE }, T0 + 1).actions).toEqual([]);
  });

  test('a refused quote (attemptError) is the attempt failing: the step fails with that code', () => {
    const t = planTickV2(fresh(), {}, T0);
    const run = clone(t.next);
    stepOf(run, 'sound')!.attemptError = 'input_missing';
    const out = planTickV2(run, {}, T0 + 1);
    expect(stepOf(out.next, 'sound')).toMatchObject({ status: 'failed', error: 'input_missing' });
    expect(stepOf(out.next, 'sound')!.attemptError).toBeUndefined();
  });
});

describe('at most two steps at a time (MAX_PARALLEL), the third starts when one ends', () => {
  test('fan of three extractions: two start, the third waits for a slot', () => {
    let t = planTickV2(fresh(FAN), {}, T0);
    expect(starts(t.actions)).toEqual(['one', 'two']);
    let run = quote(quote(t.next, 'one', 0), 'two', 0);
    t = planTickV2(run, { one: LIVE, two: LIVE }, T0 + 1);
    expect(t.actions).toEqual([]);
    t = planTickV2(t.next, { one: AUDIO, two: LIVE }, T0 + 2);
    expect(starts(t.actions)).toEqual(['three']);
    run = t.next;
    expect(run.steps.filter((s) => s.status === 'running' || s.status === 'queued').length).toBeLessThanOrEqual(2);
  });
});

describe('a step priced above its approval waits for a yes to THAT quote', () => {
  test('the quote is held, the yes releases exactly that job, and the approved price becomes the new one', () => {
    let t = planTickV2(fresh(), {}, T0);
    t = planTickV2(quote(t.next, 'sound', 0), { sound: AUDIO }, T0 + 1);
    let run = quote(t.next, 'clip', 14, T0 + 2);
    expect(stepOf(run, 'clip')!.status).toBe('awaiting_approval');
    t = planTickV2(run, { sound: AUDIO }, T0 + 3);
    expect(engStatus(t.next, 'clip')).toBe('awaiting_approval');
    expect(t.next.engine!.steps[1]!.heldQuote?.quoteId).toBe(stepOf(run, 'clip')!.quote!.quoteId);
    expect(t.actions).toEqual([]);

    run = yes(t.next, 'clip');
    t = planTickV2(run, { sound: AUDIO }, T0 + 4);
    expect(t.actions).toEqual([{ type: 'enqueue', step: 'clip' }]);
    const clip = stepOf(t.next, 'clip')!;
    expect(clip).toMatchObject({ status: 'queued', approvedCredits: 14, taskId: run.steps[1]!.quote!.taskId });
    expect(clip.approvedQuoteId).toBeUndefined();
  });

  test('a held quote that expired before the yes is priced again: the engine forgets the old hold', () => {
    let t = planTickV2(fresh(), {}, T0);
    t = planTickV2(quote(t.next, 'sound', 0), { sound: AUDIO }, T0 + 1);
    t = planTickV2(quote(t.next, 'clip', 14, T0 + 2), { sound: AUDIO }, T0 + 3);
    const run = clone(t.next);
    delete stepOf(run, 'clip')!.quote; // approveStep drops an expired quote and asks again
    moveStep(run, stepOf(run, 'clip')!, 'queued', T0 + 4, 'step.requote');
    t = planTickV2(run, { sound: AUDIO }, T0 + 5);
    expect(starts(t.actions)).toEqual(['clip']);
    expect(t.next.engine!.steps[1]!.heldQuote).toBeUndefined();
  });
});

describe('retry once (decision 3): only a retryable code, and only within the approved price', () => {
  test('isRetryable knows the transient codes and nothing else', () => {
    expect(['timeout', 'rate_limited', 'worker_lost', 'upstream_5xx', 'timeout: 30 s'].map(isRetryable)).toEqual([true, true, true, true, true]);
    expect(['extract_failed', 'qc_failed', 'refused', 'input_missing', '', undefined].map(isRetryable)).toEqual([false, false, false, false, false, false]);
  });

  test('a timeout: the step goes back in line, a NEW quote after the backoff, a second timeout fails it', () => {
    let t = planTickV2(fresh(), {}, T0);
    t = planTickV2(quote(t.next, 'sound', 0), { sound: AUDIO }, T0 + 1);
    let run = quote(t.next, 'clip', 10, T0 + 2);
    const firstTask = stepOf(run, 'clip')!.taskId;
    t = planTickV2(run, { sound: AUDIO, clip: { state: 'failed', error: 'timeout' } }, T0 + 3);
    const clip = stepOf(t.next, 'clip')!;
    expect(clip).toMatchObject({ status: 'queued', error: 'timeout' });
    expect(clip.quote).toBeUndefined();
    expect(clip.taskId).toBeUndefined();
    expect(t.next.events.some((e) => e.type === 'step.retry' && e.step === 'clip')).toBe(true);
    expect(t.next.status).toBe('running');
    expect(t.actions).toEqual([]); // the backoff

    t = planTickV2(t.next, { sound: AUDIO }, T0 + 3 + RETRY_BACKOFF_MS);
    expect(t.actions).toEqual([{ type: 'start', step: 'clip' }]);
    run = quote(t.next, 'clip', 10, T0 + 4 + RETRY_BACKOFF_MS);
    expect(stepOf(run, 'clip')!.taskId).not.toBe(firstTask);
    t = planTickV2(run, { sound: AUDIO, clip: { state: 'failed', error: 'timeout' } }, T0 + 5 + RETRY_BACKOFF_MS);
    expect(stepOf(t.next, 'clip')).toMatchObject({ status: 'failed', error: 'timeout' });
    expect(t.next.status).toBe('partially_completed');
  });

  test('the retry priced above the approval waits for a yes instead of spending more', () => {
    let t = planTickV2(fresh(), {}, T0);
    t = planTickV2(quote(t.next, 'sound', 0), { sound: AUDIO }, T0 + 1);
    t = planTickV2(quote(t.next, 'clip', 10, T0 + 2), { sound: AUDIO, clip: { state: 'failed', error: 'rate_limited' } }, T0 + 3);
    t = planTickV2(t.next, { sound: AUDIO }, T0 + 3 + RETRY_BACKOFF_MS);
    const run = quote(t.next, 'clip', 12, T0 + 4 + RETRY_BACKOFF_MS);
    expect(stepOf(run, 'clip')!.status).toBe('awaiting_approval');
    expect(stepOf(run, 'clip')!.taskId).toBeUndefined();
    t = planTickV2(run, { sound: AUDIO }, T0 + 5 + RETRY_BACKOFF_MS);
    expect(engStatus(t.next, 'clip')).toBe('awaiting_approval');
    expect(t.actions).toEqual([]);
  });
});

describe('pause (v2 only): nothing new starts, what runs carries on', () => {
  test('pause after the first step started; it delivers; the next waits until unpause', () => {
    let t = planTickV2(fresh(), {}, T0);
    let run = quote(t.next, 'sound', 0);
    run.paused = true;
    t = planTickV2(run, { sound: LIVE }, T0 + 1);
    expect(t.next.engine!.paused).toBe(true);
    expect(t.next.events.some((e) => e.type === 'run.paused')).toBe(true);
    t = planTickV2(t.next, { sound: AUDIO }, T0 + 2);
    expect(stepOf(t.next, 'sound')!.status).toBe('completed');
    expect(t.actions).toEqual([]);
    expect(t.next.status).toBe('running');

    run = clone(t.next);
    run.paused = false;
    t = planTickV2(run, { sound: AUDIO }, T0 + 3);
    expect(t.next.engine!.paused).toBe(false);
    expect(t.next.events.some((e) => e.type === 'run.unpaused')).toBe(true);
    expect(t.actions).toEqual([{ type: 'start', step: 'clip' }]);
  });
});

describe('stop and the deadline', () => {
  test('a stop cancels the running job (its executor refunds) and ends what has not started', () => {
    let t = planTickV2(fresh(), {}, T0);
    const run = quote(t.next, 'sound', 0);
    run.cancelRequested = true;
    t = planTickV2(run, { sound: LIVE }, T0 + 1);
    expect(t.actions).toEqual([{ type: 'cancel', step: 'sound', taskId: run.steps[0]!.taskId }]);
    expect(stepOf(t.next, 'clip')!.status).toBe('cancelled');
  });

  test('past the 30-minute media deadline what runs is stopped and what was delivered still counts', () => {
    let t = planTickV2(fresh(FAN), {}, T0);
    expect(fresh(FAN).engine!.deadlineAt).toBe(T0 + MEDIA_RUN_DEADLINE_MS);
    let run = quote(quote(t.next, 'one', 0), 'two', 0);
    t = planTickV2(run, { one: AUDIO, two: LIVE }, T0 + 1);
    run = t.next;
    t = planTickV2(run, { one: AUDIO, two: LIVE }, T0 + MEDIA_RUN_DEADLINE_MS + 1);
    expect(t.actions).toContainEqual({ type: 'cancel', step: 'two', taskId: stepOf(run, 'two')!.taskId });
    expect(stepOf(t.next, 'one')!.status).toBe('completed');
    expect(t.next.status).toBe('partially_completed');
    expect(t.next.error).toBe('deadline');
  });
});

describe('resume: the delivered steps are reused, never run or paid again', () => {
  test('a run that delivered the sound and lost the clip carries on with the clip only', () => {
    let t = planTickV2(fresh(), {}, T0);
    t = planTickV2(quote(t.next, 'sound', 0), { sound: AUDIO }, T0 + 1);
    t = planTickV2(quote(t.next, 'clip', 10, T0 + 2), { sound: AUDIO, clip: { state: 'failed', error: 'render_failed' } }, T0 + 3);
    expect(t.next.status).toBe('partially_completed');

    const again = resumedRunV2(t.next, 'run-1', 'run-2', APPROVAL, T0 + 10)!;
    expect(again.v).toBe(2);
    expect(stepOf(again, 'sound')).toMatchObject({ reused: true, status: 'completed' });
    expect(engStatus(again, 'sound')).toBe('done');
    expect(again.engine!.steps[0]!.outputs).toEqual([(AUDIO as { output: { url: string } }).output.url]);
    const t2 = planTickV2(again, {}, T0 + 11);
    expect(t2.actions).toEqual([{ type: 'start', step: 'clip' }]);
  });

  test('a v1 run is not carried on as v2, and a finished-with-everything run is not carried on at all', () => {
    const v1 = newRun(CHAIN, APPROVAL, PRICE, T0);
    v1.status = 'failed';
    expect(resumedRunV2(v1, 'run-1', 'run-2', APPROVAL, T0)).toBeNull();
    let t = planTickV2(fresh(), {}, T0);
    t = planTickV2(quote(t.next, 'sound', 0), { sound: AUDIO }, T0 + 1);
    t = planTickV2(quote(t.next, 'clip', 10), { sound: AUDIO, clip: VIDEO }, T0 + 2);
    expect(resumedRunV2(t.next, 'run-1', 'run-2', APPROVAL, T0 + 3)).toBeNull();
  });
});
