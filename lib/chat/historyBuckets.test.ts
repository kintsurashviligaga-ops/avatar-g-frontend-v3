/**
 * History date bucketing.
 *
 * ⚠️ CALENDAR DAYS, NOT ROLLING WINDOWS. A 24h-window "yesterday" is wrong for several hours either side
 * of midnight: a chat from 11pm last night is 2 hours old at 1am and would be labelled "today", which is
 * exactly the kind of small lie that makes a history panel feel untrustworthy.
 */
import { historyBucketOf } from './historyBuckets';

const at = (iso: string) => new Date(iso).getTime();
const NOW = at('2026-08-06T09:00:00');

describe('historyBucketOf', () => {
  it('puts this morning and last night in today', () => {
    expect(historyBucketOf(at('2026-08-06T08:59:00'), NOW)).toBe('today');
    expect(historyBucketOf(at('2026-08-06T00:01:00'), NOW)).toBe('today');
  });

  it('calls 11pm last night yesterday, not today', () => {
    // Only 10 hours ago — a rolling window would call this "today".
    expect(historyBucketOf(at('2026-08-05T23:00:00'), NOW)).toBe('yesterday');
  });

  it('separates the last week from the last month', () => {
    expect(historyBucketOf(at('2026-08-01T12:00:00'), NOW)).toBe('week');
    expect(historyBucketOf(at('2026-07-20T12:00:00'), NOW)).toBe('month');
  });

  it('files anything past 30 days as older', () => {
    expect(historyBucketOf(at('2026-06-01T12:00:00'), NOW)).toBe('older');
  });

  it('never lands a future timestamp outside today', () => {
    // Clock skew between devices is real; a chat must not vanish into a bucket above the list.
    expect(historyBucketOf(at('2026-08-07T09:00:00'), NOW)).toBe('today');
  });
});
