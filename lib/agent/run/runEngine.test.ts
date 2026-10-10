/** @jest-environment node */
/**
 * The pure state machine of a multi-step run (PART 2, T1 + G8): steps start when their inputs are delivered, at most two
 * at a time; a failed input skips what needs it; a stop ends what has not started and stops what has; the run ends
 * completed, partially_completed, failed or cancelled; final states never move; every status change is legal
 * (lib/agent/contracts RUN_TRANSITIONS) and an event; the event list is capped.
 */
import { RUN_TRANSITIONS, type AgentApproval, type RunStatus } from '../contracts';
import {
  EVENTS_CAP, emit, moveStep, newRun, planTick, resumedRun, runOf, stepOf, type ChildView, type RunState,
} from './runEngine';
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

const fresh = (spec: RunSpec = CHAIN) => newRun(spec, APPROVAL, () => 0, T0);

/** What ./runExec does with a quote at or under the step's approval: the step is queued as job `taskId`. */
function queue(run: RunState, id: string, taskId: string, at = T0): RunState {
  const next = JSON.parse(JSON.stringify(run)) as RunState;
  const s = stepOf(next, id)!;
  s.taskId = taskId;
  s.quote = { taskId, credits: 0, request: {}, token: `tok-${taskId}`, expiresAt: at + 30 * 60_000, quoteId: `q-${taskId}` };
  moveStep(next, s, 'queued', at, 'step.queued');
  return next;
}

/** Every run.status event, in order, starting from where the run was created. */
const runStatuses = (run: RunState): RunStatus[] => ['queued', ...run.events.filter((e) => e.type === 'run.status').map((e) => e.detail as RunStatus)];

function expectLegal(run: RunState) {
  expect(run.events.filter((e) => e.type === 'run.invariant')).toEqual([]);
  const seq = runStatuses(run);
  for (let i = 1; i < seq.length; i += 1) expect([seq[i - 1], seq[i], RUN_TRANSITIONS[seq[i - 1]!].includes(seq[i]!)]).toEqual([seq[i - 1], seq[i], true]);
}

test('a chain: the first step starts, the second waits for its input, then runs, then the run is completed', () => {
  let run = fresh();
  let t = planTick(run, {}, T0);
  expect(t.actions).toEqual([{ type: 'start', step: 'sound' }]);
  expect(t.next.status).toBe('running');
  run = queue(t.next, 'sound', 't1');

  t = planTick(run, { sound: LIVE }, T0 + 1);
  expect(t.actions).toEqual([]);
  expect(stepOf(t.next, 'sound')!.status).toBe('running');
  expect(stepOf(t.next, 'clip')!.status).toBe('planned');

  t = planTick(t.next, { sound: AUDIO }, T0 + 2);
  expect(stepOf(t.next, 'sound')).toMatchObject({ status: 'completed', output: AUDIO.state === 'completed' ? AUDIO.output : null });
  expect(t.actions).toEqual([{ type: 'start', step: 'clip' }]);
  run = queue(t.next, 'clip', 't2');

  t = planTick(run, { clip: VIDEO }, T0 + 3);
  expect(t.next.status).toBe('completed');
  expect(t.next.error).toBeUndefined();
  expect(t.next.events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}${e.type === 'run.status' ? `:${e.detail}` : ''}`)).toEqual([
    'run.created', 'run.status:running', 'step.queued:sound', 'step.running:sound', 'step.completed:sound', 'step.queued:clip',
    'step.running:clip', 'step.completed:clip', 'run.status:completed',
  ]);
  expectLegal(t.next);
});

test('a step whose input failed never runs (skipped); nothing delivered = the run failed, with the input\'s reason', () => {
  const run = queue(planTick(fresh(), {}, T0).next, 'sound', 't1');
  const t = planTick(run, { sound: { state: 'failed', error: 'no_audio' } }, T0 + 1);
  expect(t.actions).toEqual([]);
  expect(stepOf(t.next, 'clip')).toMatchObject({ status: 'cancelled', error: 'skipped' });
  expect(t.next).toMatchObject({ status: 'failed', error: 'no_audio' });
  expect(t.next.events.some((e) => e.type === 'step.skipped' && e.step === 'clip' && e.detail === 'sound')).toBe(true);
  expectLegal(t.next);
});

test('at most two step jobs at once; some delivered and some not = partially_completed', () => {
  let t = planTick(fresh(FAN), {}, T0);
  expect(t.actions).toEqual([{ type: 'start', step: 'one' }, { type: 'start', step: 'two' }]);
  let run = queue(queue(t.next, 'one', 'j1'), 'two', 'j2');
  t = planTick(run, { one: LIVE, two: LIVE }, T0 + 1);
  expect(t.actions).toEqual([]); // `three` waits for a free slot
  t = planTick(t.next, { one: { state: 'failed', error: 'platform' }, two: LIVE }, T0 + 2);
  expect(t.actions).toEqual([{ type: 'start', step: 'three' }]);
  expect(stepOf(t.next, 'cut')).toMatchObject({ status: 'cancelled', error: 'skipped' });
  run = queue(t.next, 'three', 'j3');
  t = planTick(run, { one: { state: 'failed', error: 'platform' }, two: AUDIO, three: AUDIO }, T0 + 3);
  expect(t.next).toMatchObject({ status: 'partially_completed', error: 'platform' });
  expect(t.next.steps.map((s) => s.status)).toEqual(['failed', 'completed', 'completed', 'cancelled']);
  expectLegal(t.next);
});

test('a stop: steps not started end at once, a running job is stopped, a delivered result stays; then cancelled', () => {
  let run = queue(planTick(fresh(FAN), {}, T0).next, 'one', 'j1');
  run = queue(run, 'two', 'j2');
  let t = planTick(run, { one: AUDIO, two: LIVE }, T0 + 1);
  run = { ...t.next, cancelRequested: true };
  t = planTick(run, { two: LIVE }, T0 + 2);
  expect(t.actions).toEqual([{ type: 'cancel', step: 'two', taskId: 'j2' }]);
  expect(t.next.steps.map((s) => s.status)).toEqual(['completed', 'running', 'cancelled', 'cancelled']);
  expect(t.next.status).toBe('running');
  t = planTick(t.next, { two: { state: 'cancelled' } }, T0 + 3);
  expect(t.next).toMatchObject({ status: 'cancelled', error: 'cancelled' });
  expect(stepOf(t.next, 'one')!.output).toBeDefined();
  expectLegal(t.next);
});

test('a stop that came after everything was delivered does not relabel the run: it is completed', () => {
  const run = { ...queue(planTick(fresh({ steps: [CHAIN.steps[0]!] }), {}, T0).next, 'sound', 't1'), cancelRequested: true };
  const t = planTick(run, { sound: AUDIO }, T0 + 1);
  expect(t.next.status).toBe('completed');
});

test('a quote with no job: queued again while it is valid; once it expired, priced again', () => {
  const run = queue(planTick(fresh(), {}, T0).next, 'sound', 't1');
  expect(planTick(run, {}, T0 + 1).actions).toEqual([{ type: 'enqueue', step: 'sound' }]);
  const late = planTick(run, { sound: { state: 'missing' } }, T0 + 31 * 60_000);
  expect(late.actions).toEqual([{ type: 'start', step: 'sound' }]);
  expect(stepOf(late.next, 'sound')).toMatchObject({ status: 'queued' });
  expect(stepOf(late.next, 'sound')!.taskId).toBeUndefined();
  expect(late.next.events.at(-1)).toMatchObject({ type: 'step.requote', step: 'sound' });
});

test('a job that was running and is gone is a failed step (lost), never a step running forever', () => {
  const run = queue(planTick(fresh(), {}, T0).next, 'sound', 't1');
  const running = planTick(run, { sound: LIVE }, T0 + 1).next;
  const t = planTick(running, { sound: { state: 'missing' } }, T0 + 2);
  expect(stepOf(t.next, 'sound')).toMatchObject({ status: 'failed', error: 'lost' });
  expect(t.next.status).toBe('failed');
});

test('a step waiting for the user\'s yes holds the run at awaiting_approval (and back to running on the yes)', () => {
  const run = planTick(fresh({ steps: [CHAIN.steps[0]!] }), {}, T0).next;
  const s = stepOf(run, 'sound')!;
  s.quote = { taskId: 't1', credits: 5, request: {}, token: 'tok', expiresAt: T0 + 60_000, quoteId: 'q1' };
  moveStep(run, s, 'awaiting_approval', T0, 'step.awaiting_approval', '5 credits');
  const t = planTick(run, {}, T0 + 1);
  expect(t.actions).toEqual([]);
  expect(t.next.status).toBe('awaiting_approval');
  const yes = queue(t.next, 'sound', 't1');
  expect(planTick(yes, { sound: LIVE }, T0 + 2).next.status).toBe('running');
  expectLegal(planTick(yes, { sound: AUDIO }, T0 + 3).next);
});

test('final runs never move: no action, no change, whatever their jobs say', () => {
  const done = planTick(queue(planTick(fresh({ steps: [CHAIN.steps[0]!] }), {}, T0).next, 'sound', 't1'), { sound: AUDIO }, T0 + 1).next;
  expect(done.status).toBe('completed');
  const again = planTick(done, { sound: { state: 'failed', error: 'x' } }, T0 + 2);
  expect(again.next).toBe(done);
  expect(again.actions).toEqual([]);
});

test('events are numbered and capped: the oldest go, the numbers keep counting', () => {
  const run = fresh();
  for (let i = 0; i < 70; i += 1) emit(run, T0, 'step.quoted', 'sound');
  expect(run.events).toHaveLength(EVENTS_CAP);
  expect(run.seq).toBe(71);
  expect(run.events[0]!.seq).toBe(22);
  expect(run.events.at(-1)!.seq).toBe(71);
});

test('resume: a NEW run where delivered steps are reused as they are and the rest are planned again', () => {
  let t = planTick(fresh(FAN), {}, T0);
  let run = queue(queue(t.next, 'one', 'j1'), 'two', 'j2');
  t = planTick(run, { one: AUDIO, two: { state: 'failed', error: 'unavailable' } }, T0 + 1);
  run = queue(t.next, 'three', 'j3');
  t = planTick(run, { three: { state: 'failed', error: 'unavailable' } }, T0 + 2);
  run = queue(t.next, 'cut', 'j4');
  t = planTick(run, { cut: VIDEO }, T0 + 3);
  expect(t.next.status).toBe('partially_completed');

  const again = resumedRun(t.next, 'run-1', { ...APPROVAL, evidence: 'resume of run-1' }, T0 + 4)!;
  expect(again).toMatchObject({ status: 'queued', resumedFrom: 'run-1', seq: 3 });
  expect(again.steps.map((s) => [s.id, s.status, !!s.reused, s.taskId ?? null])).toEqual([
    ['one', 'completed', true, 'j1'], ['two', 'planned', false, null], ['three', 'planned', false, null], ['cut', 'completed', true, 'j4'],
  ]);
  // Only what was not delivered runs again.
  expect(planTick(again, {}, T0 + 5).actions).toEqual([{ type: 'start', step: 'two' }, { type: 'start', step: 'three' }]);
  expect(resumedRun(planTick(queue(planTick(fresh({ steps: [CHAIN.steps[0]!] }), {}, T0).next, 'sound', 't'), { sound: AUDIO }, T0).next, 'r', APPROVAL, T0)).toBeNull();
  expect(resumedRun(fresh(), 'r', APPROVAL, T0)).toBeNull(); // still going
});

test('a row\'s params are a run only when they hold a whole, consistent state', () => {
  const run = fresh();
  expect(runOf({ _run: run })).toEqual(run);
  expect(runOf({})).toBeNull();
  expect(runOf(null)).toBeNull();
  expect(runOf({ _run: { ...run, v: 2 } })).toBeNull();
  expect(runOf({ _run: { ...run, steps: run.steps.slice(1) } })).toBeNull();
  expect(runOf({ _run: { ...run, steps: [...run.steps].reverse() } })).toBeNull();
});
