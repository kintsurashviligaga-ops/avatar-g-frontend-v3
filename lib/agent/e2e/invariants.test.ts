/** @jest-environment node */
/** The Phase 9 invariant checker catches each broken rule (so a green scenario run means something). */
import { newRun, type RunState } from '@/lib/agent/run/runEngine';
import type { AgentApproval } from '@/lib/agent/contracts';
import { checkTick, type Watch } from './invariants';
import { CHAIN } from './world';

const APPROVAL: AgentApproval = { quoteFingerprint: 'run:x', channel: 'tap', evidence: 'plan', at: new Date(0).toISOString(), userId: 'user-a' };
const fresh = (): RunState => newRun(CHAIN, APPROVAL, () => 0, 1_000);
const watch = (): Watch => ({ terminal: new Map(), maxLive: 0 });
const clone = (r: RunState): RunState => JSON.parse(JSON.stringify(r));

test('a fresh run passes', () => {
  expect(() => checkTick(watch(), 'r', fresh(), 0)).not.toThrow();
});

test('I-1 an illegal status jump', () => {
  const r = fresh();
  r.events.push({ seq: r.seq + 1, at: 2, type: 'run.status', detail: 'completed' }, { seq: r.seq + 2, at: 3, type: 'run.status', detail: 'running' });
  expect(() => checkTick(watch(), 'r', r, 0)).toThrow(/I-1/);
});

test('I-2 more live jobs than the cap', () => {
  const r = fresh();
  r.steps.push(clone(r).steps[0]!, clone(r).steps[0]!);
  for (const s of r.steps) s.status = 'running';
  expect(() => checkTick(watch(), 'r', r, 0)).toThrow(/I-2/);
});

test('I-3 a job quoted above its approval', () => {
  const r = fresh();
  r.steps[0]!.status = 'queued';
  r.steps[0]!.quote = { taskId: 't', credits: 5, request: {}, token: 'x', expiresAt: 9, quoteId: 'q' };
  expect(() => checkTick(watch(), 'r', r, 0)).toThrow(/I-3/);
});

test('I-4 a final run that changes', () => {
  const w = watch();
  const r = fresh();
  r.status = 'completed';
  checkTick(w, 'r', r, 0);
  const later = clone(r);
  later.error = 'moved';
  expect(() => checkTick(w, 'r', later, 0)).toThrow(/I-4/);
});

test('I-5 the wallet charged above the approval', () => {
  expect(() => checkTick(watch(), 'r', fresh(), -1)).toThrow(/I-5/);
});

test('I-6 event numbers going down', () => {
  const r = fresh();
  r.events.push({ seq: 0, at: 5, type: 'step.quoted', step: 'sound' });
  expect(() => checkTick(watch(), 'r', r, 0)).toThrow(/I-6/);
});
