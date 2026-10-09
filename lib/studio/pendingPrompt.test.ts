/**
 * lib/studio/pendingPrompt — a guest's request survives the Google sign-in round trip.
 * Pinned: kept text and tool come back once; empty text keeps nothing; older than 30 min, malformed or an unknown tool
 * comes back as nothing; a cleared stash is gone; a blocked sessionStorage never throws.
 */
import { PENDING_PROMPT_MAX_AGE_MS, clearPendingPrompt, stashPendingPrompt, takePendingPrompt } from './pendingPrompt';

const T0 = 1_791_500_000_000;
beforeEach(() => window.sessionStorage.clear());

it('gives back what the guest typed, and the tool, exactly once', () => {
  stashPendingPrompt('  ვიდეო ზღვაზე, მზის ჩასვლისას  ', 'video', T0);
  expect(takePendingPrompt(T0 + 60_000)).toEqual({ text: 'ვიდეო ზღვაზე, მზის ჩასვლისას', tool: 'video', at: T0 });
  expect(takePendingPrompt(T0 + 61_000)).toBeNull();
});

it('keeps nothing for an empty box', () => {
  stashPendingPrompt('   ', 'image', T0);
  expect(takePendingPrompt(T0)).toBeNull();
});

it('expires after 30 minutes, and refuses a time in the future', () => {
  stashPendingPrompt('a song about Tbilisi', 'music', T0);
  expect(takePendingPrompt(T0 + PENDING_PROMPT_MAX_AGE_MS + 1)).toBeNull();
  stashPendingPrompt('a song about Tbilisi', 'music', T0);
  expect(takePendingPrompt(T0 - 1)).toBeNull();
  stashPendingPrompt('a song about Tbilisi', 'music', T0);
  expect(takePendingPrompt(T0 + PENDING_PROMPT_MAX_AGE_MS)?.tool).toBe('music');
});

it('ignores a malformed entry or an unknown tool', () => {
  window.sessionStorage.setItem('myavatar:pending-prompt', '{nope');
  expect(takePendingPrompt(T0)).toBeNull();
  window.sessionStorage.setItem('myavatar:pending-prompt', JSON.stringify({ text: 'x', tool: 'admin', at: T0 }));
  expect(takePendingPrompt(T0)).toBeNull();
});

it('a cleared request is gone', () => {
  stashPendingPrompt('make a product ad', 'product', T0);
  clearPendingPrompt();
  expect(takePendingPrompt(T0)).toBeNull();
});

it('caps the text', () => {
  stashPendingPrompt('x'.repeat(5000), 'chat', T0);
  expect(takePendingPrompt(T0)?.text).toHaveLength(4000);
});

it('never throws when storage is blocked', () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
  expect(() => stashPendingPrompt('x', 'chat', T0)).not.toThrow();
  spy.mockRestore();
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
  expect(takePendingPrompt(T0)).toBeNull();
  get.mockRestore();
});
