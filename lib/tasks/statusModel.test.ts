/** @jest-environment node */
/**
 * One status vocabulary (PART 2, T2): every word a store is known to use maps to one canonical status, a stop stored as
 * a failure reads as cancelled, and an unknown word is never guessed.
 */
import { RUN_STATUSES } from '@/lib/agent/contracts';
import { TASK_STATUSES, deliveredStatus, isFinalStatus, isLiveStatus, normalizeStatus } from './statusModel';

test('generation_jobs: pending, processing, completed, failed; a stop is a failure whose error starts with „cancel"', () => {
  expect(normalizeStatus('pending')).toBe('queued');
  expect(normalizeStatus('processing')).toBe('running');
  expect(normalizeStatus('completed')).toBe('completed');
  expect(normalizeStatus('failed', 'render_failed: ffmpeg exited 1')).toBe('failed');
  expect(normalizeStatus('failed', 'cancelled by the user')).toBe('cancelled');
  expect(normalizeStatus('failed', 'Canceled')).toBe('cancelled');
  expect(normalizeStatus('failed', null)).toBe('failed');
});

test("the studio's client queue and older stores: every spelling in the audit (part-0 §5)", () => {
  const cases: Array<[string, string]> = [
    ['queued', 'queued'], ['waiting', 'queued'], ['rendering', 'running'], ['running', 'running'], ['done', 'completed'],
    ['succeeded', 'completed'], ['success', 'completed'], ['canceled', 'cancelled'], ['cancelled', 'cancelled'],
    ['partial', 'partially_completed'], ['error', 'failed'], ['in-progress', 'running'], ['In Progress', 'running'], [' DONE ', 'completed'],
  ];
  for (const [raw, want] of cases) expect([raw, normalizeStatus(raw)]).toEqual([raw, want]);
});

test('every run status has a task status: planning folds into queued, blocked into waiting on a person', () => {
  for (const s of RUN_STATUSES) expect(TASK_STATUSES).toContain(normalizeStatus(s));
  expect(normalizeStatus('planned')).toBe('queued');
  expect(normalizeStatus('blocked')).toBe('awaiting_approval');
  // A task status is a run status as it is (lib/agent/contracts runStatusOfTask).
  for (const s of TASK_STATUSES) expect(RUN_STATUSES).toContain(s);
});

test('an unknown word, or no word, is null: the caller decides, nothing is guessed', () => {
  for (const raw of ['', 'maybe', 'completed!', 42, null, undefined, {}]) expect(normalizeStatus(raw)).toBeNull();
});

test('final, live and delivered', () => {
  expect(TASK_STATUSES.filter(isFinalStatus)).toEqual(['completed', 'partially_completed', 'failed', 'cancelled']);
  expect(TASK_STATUSES.filter(isLiveStatus)).toEqual(['queued', 'awaiting_approval', 'running']);
  expect(TASK_STATUSES.filter(deliveredStatus)).toEqual(['completed', 'partially_completed']);
});
