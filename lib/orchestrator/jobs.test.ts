/** @jest-environment node */
jest.mock('server-only', () => ({}));

// Capture writes through a configurable in-memory Supabase double. Names are
// `mock`-prefixed so the jest.mock factory may close over them.
const mockInserts: Array<Record<string, unknown>> = [];
const mockUpdates: Array<Record<string, unknown>> = [];
let mockThrow = false;

jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => {
    if (mockThrow) throw new Error('no client in test');
    return {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          mockInserts.push(row);
          return Promise.resolve({ error: null });
        },
        update: (fields: Record<string, unknown>) => ({
          eq: () => {
            mockUpdates.push(fields);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
  },
}));

import { createJob, recordJobEvent, JOB_COLUMNS } from './jobs';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockInserts.length = 0;
  mockUpdates.length = 0;
  mockThrow = false;
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
