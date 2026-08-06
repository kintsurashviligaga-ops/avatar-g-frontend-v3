/** @jest-environment node */
/**
 * A failed clip must give the money back.
 *
 * ⚠️ THIS TEST EXISTS BECAUSE IT DIDN'T. Drained live on 2026-08-06 with a real balance: Veo refused the
 * clip (Google prepayment credits depleted → 429), the row came back `status: failed, credits: 0` as if
 * nothing had been charged, and the balance had gone 879 → 854. `credit_ledger` held the −25 `commit` and
 * no refund at all.
 *
 * The cause was a stale snapshot. `fail()` guarded on `item.credits > 0`, but on the SUBMIT path the
 * charge is written to the row *after* drainOnce reads it, so the caller's copy still said 0 and the
 * refund never fired. The poll path happened to work — its `item` comes from a later read — which is
 * exactly why the code reads as correct.
 *
 * The fake below is deliberately a real little database: `update` mutates the row, so a test that trusts
 * the snapshot instead of the stored value fails the way production did.
 */
import { drainOnce } from './videoQueue';

const refundCredits = jest.fn();
const deductCredits = jest.fn();
const createGeminiVeoClip = jest.fn();
const pollGeminiVeoTask = jest.fn();

jest.mock('../orchestrator/ledger', () => ({
  deductCredits: (...a: unknown[]) => deductCredits(...a),
  refundCredits: (...a: unknown[]) => refundCredits(...a),
}));
jest.mock('../credits/pricing', () => ({ creditCostFor: () => 25 }));
jest.mock('../ai/geminiVeo', () => ({
  hasGeminiVeoProvider: () => true,
  createGeminiVeoClip: (...a: unknown[]) => createGeminiVeoClip(...a),
  pollGeminiVeoTask: (...a: unknown[]) => pollGeminiVeoTask(...a),
  fetchVeoVideoBuffer: async () => Buffer.from('mp4'),
}));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => 'https://x/clip.mp4' }));
jest.mock('../video/remixOps', () => ({ addWatermark: async (u: string) => u }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: async (p: string) => p }));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

const UID = 'user-1';

interface Row { [k: string]: unknown }

/** A minimal stand-in for the PostgREST builder — only the chains drainOnce actually uses. */
function fakeDb(rows: Row[]) {
  return {
    rows,
    from() {
      let mode: 'select' | 'update' | 'none' = 'none';
      let patch: Row = {};
      const filters: Array<[string, unknown]> = [];
      const match = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v));
      const self = {
        select() { mode = 'select'; return self; },
        update(p: Row) { mode = 'update'; patch = p; return self; },
        order() { return self; },
        limit() { return self; },
        maybeSingle: async () => ({ data: match()[0] ? { ...match()[0] } : null, error: null }),
        eq(k: string, v: unknown) {
          filters.push([k, v]);
          // An update is awaited straight off .eq() — a select keeps chaining.
          if (mode === 'update') {
            for (const r of match()) Object.assign(r, patch);
            return Promise.resolve({ error: null }) as never;
          }
          return self;
        },
      };
      return self;
    },
  };
}

const queued = (over: Row = {}): Row => ({
  id: 'item-1', batch_id: 'b1', user_id: UID, ordinal: 0, prompt: 'ზღვის სანაპირო',
  aspect: '9:16', watermark: true, status: 'queued', operation: null, video_url: null,
  error: null, credits: 0, attempts: 0, created_at: '2026-08-06T00:00:00Z', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  deductCredits.mockResolvedValue({ ok: true });
  refundCredits.mockResolvedValue({ ok: true });
});

describe('a clip the provider refuses', () => {
  it('refunds the charge that was just written to the row', async () => {
    createGeminiVeoClip.mockResolvedValue(null); // exactly what a 429 produces
    const db = fakeDb([queued()]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('failed');
    expect(deductCredits).toHaveBeenCalledWith(UID, 25, 'agentq:item-1');
    // THE ASSERTION THAT WAS MISSING. The snapshot drainOnce read said credits: 0; the row says 25.
    expect(refundCredits).toHaveBeenCalledWith(UID, 25, 'agentq:item-1');
    expect(db.rows[0].status).toBe('failed');
    expect(db.rows[0].credits).toBe(0); // cleared only because the refund landed
  });

  it('keeps the charge on the row when the refund does NOT land', async () => {
    // Otherwise the evidence that the user is still owed money is erased, and a retry finds nothing.
    createGeminiVeoClip.mockResolvedValue(null);
    refundCredits.mockResolvedValue({ ok: false, reason: 'error' });
    const db = fakeDb([queued()]);

    await drainOnce(db as never, UID);

    expect(db.rows[0].status).toBe('failed');
    expect(db.rows[0].credits).toBe(25);
  });

  it('charges nothing when the provider is not configured at all', async () => {
    const geminiVeo = jest.requireMock('../ai/geminiVeo') as { hasGeminiVeoProvider: () => boolean };
    const spy = jest.spyOn(geminiVeo, 'hasGeminiVeoProvider').mockReturnValue(false);
    const db = fakeDb([queued()]);

    await drainOnce(db as never, UID);

    expect(deductCredits).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('a clip that fails while in flight', () => {
  it('refunds what the row records as charged', async () => {
    pollGeminiVeoTask.mockResolvedValue({ status: 'failed' });
    const db = fakeDb([queued({ status: 'submitted', operation: 'op/1', credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('failed');
    expect(refundCredits).toHaveBeenCalledWith(UID, 25, 'agentq:item-1');
  });

  it('does NOT refund a clip that is merely still rendering', async () => {
    // Everything transient maps to `processing` on purpose — refunding here would give away a clip that
    // then completes.
    pollGeminiVeoTask.mockResolvedValue({ status: 'processing' });
    const db = fakeDb([queued({ status: 'submitted', operation: 'op/1', credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('pending');
    expect(refundCredits).not.toHaveBeenCalled();
    expect(db.rows[0].status).toBe('submitted');
  });
});

describe('a clip that succeeds', () => {
  it('keeps the charge and stores the finished video', async () => {
    pollGeminiVeoTask.mockResolvedValue({ status: 'done', uri: 'https://veo/out.mp4' });
    const db = fakeDb([queued({ status: 'submitted', operation: 'op/1', credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('done');
    expect(refundCredits).not.toHaveBeenCalled();
    expect(db.rows[0].video_url).toBe('https://x/clip.mp4');
    expect(db.rows[0].credits).toBe(25);
  });
});
