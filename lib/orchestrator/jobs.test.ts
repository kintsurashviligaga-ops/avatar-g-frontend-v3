/** @jest-environment node */
jest.mock('server-only', () => ({}));

// Capture writes through a configurable in-memory Supabase double. Names are
// `mock`-prefixed so the jest.mock factory may close over them. An update only lands on rows that pass every
// filter (`eq`, `in`), like PostgREST, and `.select()` answers the rows it moved.
const mockInserts: Array<Record<string, unknown>> = [];
const mockUpdates: Array<Record<string, unknown>> = [];
const mockRows = new Map<string, Record<string, unknown>>();
let mockThrow = false;
let mockWriteError: string | null = null;

jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => {
    if (mockThrow) throw new Error('no client in test');
    return {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          mockInserts.push(row);
          return Promise.resolve({ error: null });
        },
        update: (fields: Record<string, unknown>) => {
          const filters: Array<(r: Record<string, unknown>) => boolean> = [];
          const run = () => {
            if (mockWriteError) return { data: null, error: { message: mockWriteError } };
            const moved: Array<{ id: unknown }> = [];
            for (const row of mockRows.values()) {
              if (filters.every((f) => f(row))) {
                Object.assign(row, fields);
                mockUpdates.push(fields);
                moved.push({ id: row.id });
              }
            }
            return { data: moved, error: null };
          };
          const b = {
            eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return b; },
            in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return b; },
            select: () => Promise.resolve(run()),
          };
          return b;
        },
        select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: () => Promise.resolve({ data: mockRows.get(id) ?? null, error: null }) }) }),
      }),
    };
  },
}));

jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));

import { completeJob, createJob, failJob, recordJobEvent, recordJobSettle, updateJobStage, JOB_COLUMNS } from './jobs';

const flush = () => new Promise((r) => setTimeout(r, 0));
const seed = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  mockRows.set(id, { id, status, current_stage: null, pct: 0, params: {}, ...extra });

beforeEach(() => {
  mockInserts.length = 0;
  mockUpdates.length = 0;
  mockRows.clear();
  mockThrow = false;
  mockWriteError = null;
  seed('p1', 'pending');
  seed('p2', 'pending');
});

describe('createJob', () => {
  test('inserts a pending row with the right shape', async () => {
    const ok = await createJob({ id: 'p1', userId: 'u1', serviceType: 'film', params: { prompt: 'x' } });
    expect(ok).toBe(true);
    expect(mockInserts).toHaveLength(1);
    expect(mockInserts[0]).toMatchObject({
      id: 'p1', user_id: 'u1', service_type: 'film', status: 'pending', pct: 0, params: { prompt: 'x' },
    });
  });

  test('fails open (false) when no client is available', async () => {
    mockThrow = true;
    expect(await createJob({ id: 'p', userId: 'u', serviceType: 'image' })).toBe(false);
    expect(mockInserts).toHaveLength(0);
  });
});

describe('recordJobEvent', () => {
  test('completed → status completed + signed_url + verbatim result', async () => {
    recordJobEvent('p1', { stage: 'completed', pct: 100, url: 'https://x/y.mp4', shots: 5 });
    await flush();
    expect(mockUpdates).toHaveLength(1);
    expect(mockUpdates[0]).toMatchObject({
      status: 'completed', pct: 100, signed_url: 'https://x/y.mp4',
      result: { stage: 'completed', url: 'https://x/y.mp4', shots: 5 },
    });
  });

  test('completed without a url stores a null signed_url (e.g. interior/room)', async () => {
    recordJobEvent('p2', { stage: 'completed', pct: 100, geometry: { w: 4 } });
    await flush();
    expect(mockUpdates[0]).toMatchObject({ status: 'completed', signed_url: null });
  });

  test('failed → status failed + truncated error', async () => {
    recordJobEvent('p1', { stage: 'failed', error: 'boom' });
    await flush();
    expect(mockUpdates[0]).toMatchObject({ status: 'failed', current_stage: 'failed', error: 'boom' });
  });

  test('progress → processing + stage + pct clamped to [0,100]', async () => {
    recordJobEvent('p1', { stage: 'scripting', pct: 142 });
    await flush();
    expect(mockUpdates[0]).toMatchObject({ status: 'processing', current_stage: 'scripting', pct: 100 });
  });

  test('null jobId is a no-op (unauthenticated dev-bypass runs)', async () => {
    recordJobEvent(null, { stage: 'completed', url: 'x' });
    await flush();
    expect(mockUpdates).toHaveLength(0);
  });
});

describe('JOB_COLUMNS', () => {
  test('covers the recovery projection', () => {
    for (const c of ['id', 'user_id', 'service_type', 'status', 'current_stage', 'pct', 'params', 'result', 'signed_url', 'error', 'updated_at']) {
      expect(JOB_COLUMNS).toContain(c);
    }
  });
});

describe('terminal is terminal: completed and failed rows never move again', () => {
  test('a late stage write does not revive a cancelled job', async () => {
    seed('c', 'failed', { error: 'cancelled by the user' });
    expect(await updateJobStage('c', 'stitch', 88)).toBe(false);
    expect(mockRows.get('c')).toMatchObject({ status: 'failed', error: 'cancelled by the user' });
  });

  test('a render finishing after the drainer failed and refunded it does not turn the row completed', async () => {
    seed('r', 'failed', { error: 'render abandoned (tab closed) — reaped by drainer' });
    expect(await completeJob('r', { signedUrl: 'https://x/late.mp4', result: { url: 'https://x/late.mp4' } })).toBe(false);
    expect(mockRows.get('r')).toMatchObject({ status: 'failed' });
  });

  test('a delivered job never turns failed', async () => {
    seed('d', 'completed', { signed_url: 'https://x/ok.mp4' });
    expect(await failJob('d', 'post-step failed')).toBe(false);
    expect(mockRows.get('d')).toMatchObject({ status: 'completed', signed_url: 'https://x/ok.mp4' });
  });

  test('a live row moves and says so', async () => {
    expect(await updateJobStage('p1', 'stitch', 50)).toBe(true);
    expect(await completeJob('p1', { signedUrl: 'https://x/a.mp4', result: {} })).toBe(true);
    expect(mockRows.get('p1')).toMatchObject({ status: 'completed', pct: 100 });
    expect(await completeJob('p1', { signedUrl: 'https://x/b.mp4', result: {} })).toBe(false);
    expect(mockRows.get('p1')).toMatchObject({ signed_url: 'https://x/a.mp4' });
  });

  test('a missing row, a failed write and no client all answer false without throwing', async () => {
    expect(await failJob('nope', 'x')).toBe(false);
    mockWriteError = 'db down';
    expect(await failJob('p1', 'x')).toBe(false);
    mockWriteError = null;
    mockThrow = true;
    expect(await completeJob('p1', { signedUrl: null, result: {} })).toBe(false);
  });

  test('recordJobSettle does not revive a final row', async () => {
    seed('s', 'completed');
    expect(await recordJobSettle('s', { _settle: { ref: 'x' } })).toBe(false);
    expect(mockRows.get('s')).toMatchObject({ status: 'completed' });
    expect(await recordJobSettle('p1', { _settle: { ref: 'x' } })).toBe(true);
    expect(mockRows.get('p1')).toMatchObject({ status: 'processing', params: { _settle: { ref: 'x' } } });
  });
});
