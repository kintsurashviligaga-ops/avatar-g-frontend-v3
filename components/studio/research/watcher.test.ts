import { claimNotification, loadNotified, markNotified, mergeJob, nextPollDelayMs, NOTIFIED_KEY, planToasts, POLL_FAST_MS, POLL_MAX_BACKOFF_MS, POLL_MID_MS, POLL_SLOW_MS, shouldWakeRead, sortJobs, TOAST_MAX_AGE_MS, type StorageLike } from './watcher';
import { done, job, NOW } from './testing';

const memStorage = (): StorageLike & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('nextPollDelayMs — sparing, visibility-aware, backing off', () => {
  const base = { nowMs: NOW, failures: 0, hidden: false };
  test('nothing running → no timer at all (the page is idle)', () => {
    expect(nextPollDelayMs({ ...base, jobs: [] })).toBeNull();
    expect(nextPollDelayMs({ ...base, jobs: [done()] })).toBeNull();
  });
  test('a hidden page or a lost session never schedules', () => {
    expect(nextPollDelayMs({ ...base, jobs: [job()], hidden: true })).toBeNull();
    expect(nextPollDelayMs({ ...base, jobs: [job()], unauthorized: true })).toBeNull();
  });
  test('the cadence slows as the job ages: 20 s, then 30 s after 5 min, then 60 s after 20 min', () => {
    expect(nextPollDelayMs({ ...base, jobs: [job({ startedAt: ago(60_000) })] })).toBe(POLL_FAST_MS);
    expect(nextPollDelayMs({ ...base, jobs: [job({ startedAt: ago(8 * 60_000) })] })).toBe(POLL_MID_MS);
    expect(nextPollDelayMs({ ...base, jobs: [job({ startedAt: ago(40 * 60_000) })] })).toBe(POLL_SLOW_MS);
  });
  test('the OLDEST active job sets the cadence, and a job without startedAt counts from createdAt', () => {
    const fresh = job({ id: 'a', startedAt: ago(30_000) });
    const old = job({ id: 'b', startedAt: null, createdAt: ago(25 * 60_000) });
    expect(nextPollDelayMs({ ...base, jobs: [fresh, old] })).toBe(POLL_SLOW_MS);
  });
  test('each failure doubles the wait, up to five minutes', () => {
    const j = [job({ startedAt: ago(60_000) })];
    expect(nextPollDelayMs({ ...base, jobs: j, failures: 1 })).toBe(POLL_FAST_MS * 2);
    expect(nextPollDelayMs({ ...base, jobs: j, failures: 2 })).toBe(POLL_FAST_MS * 4);
    expect(nextPollDelayMs({ ...base, jobs: j, failures: 20 })).toBe(POLL_MAX_BACKOFF_MS);
  });
});

describe('shouldWakeRead', () => {
  test('a returning page reads at once, unless it just did, or is hidden or offline', () => {
    expect(shouldWakeRead({ lastReadAtMs: NOW - 10_000, nowMs: NOW, hidden: false, online: true })).toBe(true);
    expect(shouldWakeRead({ lastReadAtMs: NOW - 1_000, nowMs: NOW, hidden: false, online: true })).toBe(false);
    expect(shouldWakeRead({ lastReadAtMs: 0, nowMs: NOW, hidden: true, online: true })).toBe(false);
    expect(shouldWakeRead({ lastReadAtMs: 0, nowMs: NOW, hidden: false, online: false })).toBe(false);
  });
});

describe('planToasts — one toast per settled job', () => {
  const none = () => false;
  test('a finished report → ready; a failed job → failed', () => {
    const r = planToasts([done({ id: 'a' }), job({ id: 'b', status: 'failed', errorCode: 'provider_failed', completedAt: ago(1000) })], none, NOW);
    expect(r.toasts).toEqual([{ jobId: 'a', kind: 'ready' }, { jobId: 'b', kind: 'failed' }]);
    expect(r.silent).toEqual([]);
  });
  test('a running job never toasts; a job the user cancelled never toasts (and is marked seen silently)', () => {
    const r = planToasts([job({ id: 'a' }), job({ id: 'c', status: 'canceled', completedAt: ago(1000) })], none, NOW);
    expect(r.toasts).toEqual([]);
    expect(r.silent).toEqual(['c']);
  });
  test('a job already announced is skipped', () => {
    expect(planToasts([done({ id: 'a' })], (id) => id === 'a', NOW).toasts).toEqual([]);
  });
  test('old news (settled more than a day ago) is history: silent, not a toast', () => {
    const old = done({ id: 'o', completedAt: ago(TOAST_MAX_AGE_MS + 60_000) });
    const r = planToasts([old], none, NOW);
    expect(r.toasts).toEqual([]);
    expect(r.silent).toEqual(['o']);
  });
  test('a report that finished while the phone was locked is announced on return (inside the window)', () => {
    const r = planToasts([done({ id: 'late', completedAt: ago(3 * 60 * 60_000) })], none, NOW);
    expect(r.toasts).toEqual([{ jobId: 'late', kind: 'ready' }]);
  });
  test('a "completed" job with no report is a failure to the user', () => {
    expect(planToasts([done({ id: 'x', hasReport: false })], none, NOW).toasts).toEqual([{ jobId: 'x', kind: 'failed' }]);
  });
});

describe('the "already told you" memory', () => {
  test('claimNotification is true exactly once per id', () => {
    const st = memStorage();
    const mem = new Set<string>();
    expect(claimNotification('a', mem, st)).toBe(true);
    expect(claimNotification('a', mem, st)).toBe(false);
    expect(JSON.parse(st.data[NOTIFIED_KEY]!)).toEqual(['a']);
  });
  test('a second tab (fresh memory, same storage) finds the first tab\'s claim and stays quiet', () => {
    const st = memStorage();
    expect(claimNotification('a', new Set(), st)).toBe(true);
    expect(claimNotification('a', new Set(), st)).toBe(false);
    expect(claimNotification('b', new Set(), st)).toBe(true);
    expect(loadNotified(st)).toEqual(['a', 'b']);
  });
  test('markNotified claims without announcing, and is idempotent', () => {
    const st = memStorage();
    const mem = new Set<string>();
    markNotified('a', mem, st);
    markNotified('a', mem, st);
    expect(loadNotified(st)).toEqual(['a']);
    expect(claimNotification('a', mem, st)).toBe(false);
  });
  test('storage that throws or holds garbage never breaks the watcher (memory still dedupes)', () => {
    const broken: StorageLike = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    const mem = new Set<string>();
    expect(claimNotification('a', mem, broken)).toBe(true);
    expect(claimNotification('a', mem, broken)).toBe(false);
    const junk = memStorage();
    junk.data[NOTIFIED_KEY] = '{"not":"a list"}';
    expect(loadNotified(junk)).toEqual([]);
    junk.data[NOTIFIED_KEY] = 'not json';
    expect(loadNotified(junk)).toEqual([]);
  });
  test('the list is bounded', () => {
    const st = memStorage();
    const mem = new Set<string>();
    for (let i = 0; i < 260; i++) claimNotification(`id${i}`, mem, st);
    const ids = loadNotified(st);
    expect(ids.length).toBe(200);
    expect(ids[ids.length - 1]).toBe('id259');
  });
});

describe('mergeJob / sortJobs', () => {
  test('a list row (no report) does not erase the report already read for the same completed job', () => {
    const full = done({ id: 'a', report: '# R', sources: [{ url: 'https://a.example' }] });
    const row = done({ id: 'a' });
    const merged = mergeJob(full, row);
    expect(merged.report).toBe('# R');
    expect(merged.sources).toEqual([{ url: 'https://a.example' }]);
  });
  test('a job that changed status takes the new row as-is', () => {
    const prev = job({ id: 'a' });
    expect(mergeJob(prev, done({ id: 'a' })).report).toBeUndefined();
    expect(mergeJob(undefined, prev)).toBe(prev);
  });
  test('newest first', () => {
    const a = job({ id: 'a', createdAt: ago(5000) });
    const b = job({ id: 'b', createdAt: ago(1000) });
    expect(sortJobs([a, b]).map((j) => j.id)).toEqual(['b', 'a']);
  });
});
