import { isReapable, selectReapable, reapReserve, drainerEnabled, RENDER_STALE_THRESHOLD_MS, type DrainJobRow } from './renderDrainer';

const NOW = Date.parse('2026-08-01T12:00:00Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const job = (status: string, updatedMsAgo: number): DrainJobRow => ({ id: 'j', status, updated_at: at(updatedMsAgo) });

describe('renderDrainer.isReapable — never kills a live render', () => {
  it('reaps a processing row older than the threshold', () => {
    expect(isReapable(job('processing', RENDER_STALE_THRESHOLD_MS + 60_000), NOW)).toBe(true);
  });

  it('does NOT reap a slow-but-live render (updated within the threshold)', () => {
    // a 10-min render updated 9 min ago is still live — must NOT be reaped
    expect(isReapable(job('processing', 9 * 60_000), NOW)).toBe(false);
    // exactly at the threshold boundary: just under → live
    expect(isReapable(job('processing', RENDER_STALE_THRESHOLD_MS - 1), NOW)).toBe(false);
  });

  it('leaves non-processing rows alone (pending/completed/failed)', () => {
    for (const s of ['pending', 'completed', 'failed', 'queued']) {
      expect(isReapable(job(s, RENDER_STALE_THRESHOLD_MS + 60_000), NOW)).toBe(false);
    }
  });

  it('never guesses a job dead on a bad/absent timestamp', () => {
    expect(isReapable({ id: 'j', status: 'processing', updated_at: 'not-a-date' }, NOW)).toBe(false);
    expect(isReapable({ id: 'j', status: 'processing', updated_at: '' }, NOW)).toBe(false);
    expect(isReapable(null as unknown as DrainJobRow, NOW)).toBe(false);
  });

  it('threshold is well beyond the max render time (safety invariant)', () => {
    expect(RENDER_STALE_THRESHOLD_MS).toBeGreaterThanOrEqual(20 * 60_000); // ≥ 2× the ~10-min max render
  });
});

describe('renderDrainer.selectReapable', () => {
  it('picks only the stale processing rows from a mixed batch', () => {
    const jobs: DrainJobRow[] = [
      { id: 'live', status: 'processing', updated_at: at(60_000) },
      { id: 'stale', status: 'processing', updated_at: at(RENDER_STALE_THRESHOLD_MS + 120_000) },
      { id: 'done', status: 'completed', updated_at: at(RENDER_STALE_THRESHOLD_MS + 120_000) },
    ];
    expect(selectReapable(jobs, NOW).map((j) => j.id)).toEqual(['stale']);
    expect(selectReapable([], NOW)).toEqual([]);
  });
});

describe('renderDrainer.reapReserve — refund only a real, charged reservation', () => {
  const base = { id: 'j', status: 'processing', updated_at: at(0) };

  it('extracts a well-formed charged reservation', () => {
    const j: DrainJobRow = { ...base, user_id: 'u-1', params: { prompt: 'x', _reserve: { ref: 'film:prod_1', credits: 50 } } };
    expect(reapReserve(j)).toEqual({ userId: 'u-1', credits: 50, ref: 'film:prod_1' });
  });

  it('rounds a fractional credits value', () => {
    const j: DrainJobRow = { ...base, user_id: 'u-1', params: { _reserve: { ref: 'r', credits: 12.6 } } };
    expect(reapReserve(j)?.credits).toBe(13);
  });

  it('returns null for a FREE-slot / skipped render (no _reserve stamped)', () => {
    // the whole point: an un-charged render is never refunded → no minted credits
    expect(reapReserve({ ...base, user_id: 'u-1', params: { prompt: 'x' } })).toBeNull();
    expect(reapReserve({ ...base, user_id: 'u-1', params: {} })).toBeNull();
    expect(reapReserve({ ...base, user_id: 'u-1', params: null })).toBeNull();
    expect(reapReserve({ ...base, user_id: 'u-1' })).toBeNull();
  });

  it('returns null when the owner is missing', () => {
    expect(reapReserve({ ...base, params: { _reserve: { ref: 'r', credits: 50 } } })).toBeNull();
    expect(reapReserve({ ...base, user_id: '', params: { _reserve: { ref: 'r', credits: 50 } } })).toBeNull();
    expect(reapReserve({ ...base, user_id: '   ', params: { _reserve: { ref: 'r', credits: 50 } } })).toBeNull();
  });

  it('never guesses an amount from a malformed _reserve', () => {
    const bad = [
      { ref: 'r' },                       // no credits
      { ref: 'r', credits: 0 },           // zero
      { ref: 'r', credits: -10 },         // negative
      { ref: 'r', credits: 'lots' },      // non-numeric
      { ref: 'r', credits: NaN },         // NaN
      { ref: '', credits: 50 },           // empty ref
      { credits: 50 },                    // no ref
      'not-an-object',
      42,
      null,
      [{ ref: 'r', credits: 50 }],        // array, not object
    ];
    for (const r of bad) {
      expect(reapReserve({ ...base, user_id: 'u-1', params: { _reserve: r } as Record<string, unknown> })).toBeNull();
    }
  });

  it('handles a null/garbage job defensively', () => {
    expect(reapReserve(null as unknown as DrainJobRow)).toBeNull();
    expect(reapReserve({ ...base, user_id: 'u-1', params: [] as unknown as Record<string, unknown> })).toBeNull();
  });
});

describe('renderDrainer.drainerEnabled — INERT unless explicitly opted in', () => {
  it('is off by default and for falsey values', () => {
    expect(drainerEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(drainerEnabled({ RENDER_DRAINER_ENABLED: '' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(drainerEnabled({ RENDER_DRAINER_ENABLED: '0' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(drainerEnabled({ RENDER_DRAINER_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
  it('is on only for explicit truthy opt-in', () => {
    for (const v of ['1', 'true', 'on', 'TRUE']) {
      expect(drainerEnabled({ RENDER_DRAINER_ENABLED: v } as unknown as NodeJS.ProcessEnv)).toBe(true);
    }
  });
});
