/** @jest-environment node */
/**
 * lib/speech/deadline — one clock per speech request, ended by time or by whoever started it (§5.3.4).
 */
import {
  SPEECH_CLIENT_DEADLINE_MS,
  SPEECH_DEADLINE_MS,
  SPEECH_MAX_ATTEMPTS,
  SPEECH_RETRY_MIN_MS,
  pauseUnlessAborted,
  speechDeadline,
} from './deadline';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

test('the budget fits the 30 s function limit, and the browser waits for the route to answer first', () => {
  expect(SPEECH_DEADLINE_MS).toBeLessThan(30_000);
  expect(SPEECH_MAX_ATTEMPTS).toBe(2);
  expect(SPEECH_RETRY_MIN_MS).toBeLessThan(SPEECH_DEADLINE_MS);
  expect(SPEECH_CLIENT_DEADLINE_MS).toBeGreaterThan(SPEECH_DEADLINE_MS);
});

test('aborts at the deadline with cause timeout; remaining counts down to 0', () => {
  const d = speechDeadline(1_000);
  expect(d.remaining()).toBe(1_000);
  jest.advanceTimersByTime(400);
  expect(d.remaining()).toBe(600);
  expect(d.signal.aborted).toBe(false);
  jest.advanceTimersByTime(600);
  expect(d.signal.aborted).toBe(true);
  expect(d.cause()).toBe('timeout');
  expect((d.signal.reason as DOMException).name).toBe('TimeoutError');
  expect(d.remaining()).toBe(0);
});

test('a linked signal aborting ends it at once, as cancelled, and the timer no longer fires', () => {
  const outer = new AbortController();
  const d = speechDeadline(1_000, null, outer.signal, undefined);
  outer.abort();
  expect(d.signal.aborted).toBe(true);
  expect(d.cause()).toBe('cancelled');
  jest.advanceTimersByTime(5_000);
  expect(d.cause()).toBe('cancelled');
});

test('an already aborted signal gives an already aborted deadline, with no timer left behind', () => {
  const outer = new AbortController();
  outer.abort();
  const d = speechDeadline(1_000, outer.signal);
  expect(d.signal.aborted).toBe(true);
  expect(d.cause()).toBe('cancelled');
  expect(jest.getTimerCount()).toBe(0);
});

test('a budget already spent is aborted on the next tick', () => {
  const d = speechDeadline(-50);
  expect(d.remaining()).toBe(0);
  jest.advanceTimersByTime(0);
  expect(d.cause()).toBe('timeout');
});

test('dispose clears the timer and unlinks the outer signal', () => {
  const outer = new AbortController();
  const d = speechDeadline(1_000, outer.signal);
  d.dispose();
  d.dispose();
  expect(jest.getTimerCount()).toBe(0);
  outer.abort();
  expect(d.signal.aborted).toBe(false);
});

test('pauseUnlessAborted waits, or stops waiting the moment the signal aborts', async () => {
  const ctrl = new AbortController();
  const done = pauseUnlessAborted(250, ctrl.signal);
  await jest.advanceTimersByTimeAsync(250);
  await expect(done).resolves.toBe(true);

  const cut = pauseUnlessAborted(250, ctrl.signal);
  ctrl.abort();
  await expect(cut).resolves.toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  await expect(pauseUnlessAborted(250, ctrl.signal)).resolves.toBe(false);
});
