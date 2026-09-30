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
 *
 * Veo is mocked at lib/veo/engine — the one surface the queue calls (it used to call lib/ai/geminiVeo,
 * which could not reach Vertex AI and spent outside the budget guard). guardedCall is a pass-through so
 * the tests can read the envelope it was given, and throw its refusal.
 */
import { drainOnce } from './videoQueue';

const refundCredits = jest.fn();
const deductCredits = jest.fn();
const veoTransport = jest.fn();
const createVeoClip = jest.fn();
const pollVeoClip = jest.fn();
const deliverableUrl = jest.fn();
const downloadGeminiVideo = jest.fn();
const uploadBufferAndSign = jest.fn();
const guardedCall = jest.fn();
const hostGcsVideo = jest.fn();

jest.mock('../orchestrator/ledger', () => ({
  deductCredits: (...a: unknown[]) => deductCredits(...a),
  refundCredits: (...a: unknown[]) => refundCredits(...a),
}));
jest.mock('../credits/pricing', () => ({ creditCostFor: () => 25 }));
jest.mock('../veo/engine', () => ({
  veoTransport: () => veoTransport(),
  createVeoClip: (...a: unknown[]) => createVeoClip(...a),
  pollVeoClip: (...a: unknown[]) => pollVeoClip(...a),
  deliverableUrl: (...a: unknown[]) => deliverableUrl(...a),
}));
jest.mock('../veo/geminiTransport', () => ({ downloadGeminiVideo: (...a: unknown[]) => downloadGeminiVideo(...a) }));
jest.mock('../veo/deliver', () => ({ hostGcsVideo: (...a: unknown[]) => hostGcsVideo(...a) }));
jest.mock('../services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    readonly reason: string;
    constructor(_service: string, reason: string) {
      super(`budget_exceeded:${reason}`);
      this.reason = reason;
    }
  }
  return { BudgetExceededError, guardedCall: (...a: unknown[]) => guardedCall(...a) };
});
jest.mock('../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: (...a: unknown[]) => uploadBufferAndSign(...a) }));
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
      let returning = false;
      const self = {
        select() { if (mode === 'update') returning = true; else mode = 'select'; return self; },
        update(p: Row) { mode = 'update'; patch = p; return self; },
        order() { return self; },
        limit() { return self; },
        maybeSingle: async () => ({ data: match()[0] ? { ...match()[0] } : null, error: null }),
        eq(k: string, v: unknown) { filters.push([k, v]); return self; },
        // Like PostgREST, an update runs when it is AWAITED — after every .eq() filter is in (a conditional claim
        // `.eq('status','queued')` must see the row as it is at that moment) — and `.select()` returns the rows hit.
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          if (mode !== 'update') return Promise.resolve({ data: match(), error: null }).then(resolve, reject);
          const hit = match();
          for (const r of hit) Object.assign(r, patch);
          return Promise.resolve(returning ? { data: hit.map((r) => ({ id: r.id })), error: null } : { error: null }).then(resolve, reject);
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

const GEMINI_OP = 'models/veo-3.1-generate-preview/operations/op1';
const VERTEX_OP = 'projects/p/locations/us-central1/publishers/google/models/veo-3.1-generate-001/operations/op1';
/** Big enough to clear the 1 KiB "not a playable clip" floor. */
const MP4 = Buffer.alloc(4_096, 7);

/** What createVeoClip returns — the outcome is all the queue reads. */
const accepted = (name = GEMINI_OP) => ({
  outcome: { ok: true, operation: { name, model: 'veo-3.1-generate-preview' } },
  request: { aspect: '9:16' }, adjustments: [], model: 'veo-3.1-generate-preview', transport: 'gemini',
});
const refused = (reason: string, retryable = false, status?: number) => ({
  outcome: { ok: false, reason, retryable, ...(status ? { status } : {}) },
  request: { aspect: '9:16' }, adjustments: [], model: 'veo-3.1-generate-preview', transport: 'gemini',
});

type GuardOpts = { service: string; model: string; units: number; unitCostUsd: number; userId: string; actualCost: (r: unknown) => number | undefined };
const guardOpts = (): GuardOpts => guardedCall.mock.calls[0][0] as GuardOpts;

beforeEach(() => {
  jest.clearAllMocks();
  deductCredits.mockResolvedValue({ ok: true });
  refundCredits.mockResolvedValue({ ok: true });
  veoTransport.mockReturnValue('gemini');
  guardedCall.mockImplementation(async (_opts: unknown, fn: () => Promise<unknown>) => fn());
  downloadGeminiVideo.mockResolvedValue(MP4);
  uploadBufferAndSign.mockResolvedValue('https://x/clip.mp4');
  deliverableUrl.mockResolvedValue('https://storage.googleapis.com/bucket/veo/clip.mp4?X-Goog-Signature=abc');
});

describe('a clip the provider refuses', () => {
  it('refunds the charge that was just written to the row', async () => {
    createVeoClip.mockResolvedValue(refused('rate_limited', true, 429)); // exactly what a 429 produces
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
    createVeoClip.mockResolvedValue(refused('rate_limited', true, 429));
    refundCredits.mockResolvedValue({ ok: false, reason: 'error' });
    const db = fakeDb([queued()]);

    await drainOnce(db as never, UID);

    expect(db.rows[0].status).toBe('failed');
    expect(db.rows[0].credits).toBe(25);
  });

  it('charges nothing when the provider is not configured at all', async () => {
    veoTransport.mockReturnValue(null); // neither Vertex AI nor a Gemini key
    const db = fakeDb([queued()]);

    await drainOnce(db as never, UID);

    expect(deductCredits).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    expect(createVeoClip).not.toHaveBeenCalled();
  });

  it('refunds when the platform budget refuses — and nothing reaches Google', async () => {
    const { BudgetExceededError } = jest.requireMock('../services/billing/guardedCall') as {
      BudgetExceededError: new (service: string, reason: string) => Error;
    };
    guardedCall.mockRejectedValue(new BudgetExceededError('video', 'daily_cap'));
    const db = fakeDb([queued()]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('failed');
    expect(createVeoClip).not.toHaveBeenCalled();
    expect(refundCredits).toHaveBeenCalledWith(UID, 25, 'agentq:item-1');
    expect(db.rows[0].status).toBe('failed');
    expect(db.rows[0].credits).toBe(0);
  });

  it('never re-submits an ambiguous create — it refunds and the item ends', async () => {
    // A timed-out / 5xx submit MAY have made a billed job; a second POST could make two.
    createVeoClip.mockResolvedValue(refused('ambiguous'));
    const db = fakeDb([queued()]);

    const first = await drainOnce(db as never, UID);
    const second = await drainOnce(db as never, UID);

    expect(first.action).toBe('failed');
    expect(second.action).toBe('idle');
    expect(createVeoClip).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith(UID, 25, 'agentq:item-1');
    expect(db.rows[0].error).toBe('the provider did not confirm the clip');
    // …and the budget keeps its estimate for a job that may exist, while a definitive refusal books $0.
    expect(guardOpts().actualCost(refused('ambiguous'))).toBeUndefined();
    expect(guardOpts().actualCost(refused('rate_limited', true, 429))).toBe(0);
  });
});

describe('a clip that fails while in flight', () => {
  it('refunds what the row records as charged', async () => {
    pollVeoClip.mockResolvedValue({ state: 'failed', reason: 'internal error' });
    const db = fakeDb([queued({ status: 'submitted', operation: GEMINI_OP, credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('failed');
    expect(refundCredits).toHaveBeenCalledWith(UID, 25, 'agentq:item-1');
  });

  it('does NOT refund a clip that is merely still rendering', async () => {
    // Everything transient maps to `processing` on purpose — refunding here would give away a clip that
    // then completes.
    pollVeoClip.mockResolvedValue({ state: 'processing' });
    const db = fakeDb([queued({ status: 'submitted', operation: GEMINI_OP, credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('pending');
    expect(refundCredits).not.toHaveBeenCalled();
    expect(db.rows[0].status).toBe('submitted');
  });
});

describe('a clip that succeeds', () => {
  it('keeps the charge and stores the finished video', async () => {
    pollVeoClip.mockResolvedValue({
      state: 'succeeded',
      videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x:download', mimeType: 'video/mp4' }],
    });
    const db = fakeDb([queued({ status: 'submitted', operation: GEMINI_OP, credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('done');
    expect(refundCredits).not.toHaveBeenCalled();
    expect(pollVeoClip).toHaveBeenCalledWith(GEMINI_OP);
    expect(uploadBufferAndSign).toHaveBeenCalledWith('uploads', 'agentq/item-1.mp4', MP4, 'video/mp4', 604_800);
    expect(db.rows[0].video_url).toBe('https://x/clip.mp4');
    expect(db.rows[0].credits).toBe(25);
  });

  it('delivers a Vertex AI clip copied once into Supabase (the Library re-signs only Supabase) — nothing downloaded from Gemini', async () => {
    hostGcsVideo.mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/renders/agentq/item-1.mp4?token=t');
    pollVeoClip.mockResolvedValue({
      state: 'succeeded',
      videos: [{ kind: 'gcs', gcsUri: 'gs://bucket/veo/s/0-ab/sample_0.mp4', mimeType: 'video/mp4' }],
    });
    const db = fakeDb([queued({ status: 'submitted', operation: VERTEX_OP, credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('done');
    expect(hostGcsVideo).toHaveBeenCalledWith(expect.objectContaining({ kind: 'gcs' }), 'agentq/item-1.mp4');
    expect(downloadGeminiVideo).not.toHaveBeenCalled();
    expect(uploadBufferAndSign).not.toHaveBeenCalled();
    expect(db.rows[0].video_url).toMatch(/supabase\.co/);
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('refunds a finished clip that cannot be delivered', async () => {
    pollVeoClip.mockResolvedValue({
      state: 'succeeded',
      videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x:download', mimeType: 'video/mp4' }],
    });
    downloadGeminiVideo.mockResolvedValue(null);
    const db = fakeDb([queued({ status: 'submitted', operation: GEMINI_OP, credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('failed');
    expect(refundCredits).toHaveBeenCalledWith(UID, 25, 'agentq:item-1');
  });
});

describe('a clip Google declines under its safety rules', () => {
  it('refunds — a filtered clip will never exist', async () => {
    pollVeoClip.mockResolvedValue({ state: 'filtered', reason: 'blocked', supportCodes: ['58061214'] });
    const db = fakeDb([queued({ status: 'submitted', operation: GEMINI_OP, credits: 25 })]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('failed');
    expect(refundCredits).toHaveBeenCalledWith(UID, 25, 'agentq:item-1');
    expect(db.rows[0].status).toBe('failed');
  });
});

describe('a clip that is accepted', () => {
  it('runs the submit inside the budget guard and stores the engine operation name', async () => {
    createVeoClip.mockResolvedValue(accepted(VERTEX_OP));
    const db = fakeDb([queued()]);

    const res = await drainOnce(db as never, UID);

    expect(res.action).toBe('submitted');
    expect(db.rows[0].status).toBe('submitted');
    // The name alone says which transport polls it on the next drain (engine.transportOf).
    expect(db.rows[0].operation).toBe(VERTEX_OP);
    expect(refundCredits).not.toHaveBeenCalled();

    expect(guardedCall).toHaveBeenCalledTimes(1);
    const opts = guardOpts();
    expect(opts).toEqual(expect.objectContaining({ service: 'video', units: 8, userId: UID }));
    expect(opts.model).toMatch(/^veo-/);
    expect(opts.unitCostUsd).toBeGreaterThan(0);
    // A clip that was accepted keeps the estimate.
    expect(opts.actualCost(accepted())).toBeUndefined();

    expect(createVeoClip).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ aspect: '9:16', durationSec: 8, generateAudio: true }),
      sessionId: 'agentq-b1',
      ordinal: 0,
    }));
  });
});

describe('two drains at once', () => {
  it('only one drain claims a queued row — the other neither charges nor submits', async () => {
    veoTransport.mockReturnValue('gemini');
    deductCredits.mockResolvedValue({ ok: true });
    guardedCall.mockImplementation(async (_o: unknown, fn: () => Promise<unknown>) => fn());
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    createVeoClip.mockImplementation(async () => { await gate; return accepted(); });
    const db = fakeDb([queued()]);

    const first = drainOnce(db as never, UID);
    await new Promise((r) => setImmediate(r)); // the first drain has claimed the row and is waiting on Google
    const second = await drainOnce(db as never, UID);
    release();
    const done = await first;

    expect(done.action).toBe('submitted');
    expect(second.action).toBe('pending'); // it saw a claimed row with no operation yet — in progress, not failed
    expect(createVeoClip).toHaveBeenCalledTimes(1);
    expect(deductCredits).toHaveBeenCalledTimes(1);
    expect(db.rows[0]).toMatchObject({ status: 'submitted', operation: GEMINI_OP });
  });

  it('a claim abandoned by a dead drain is failed and refunded once it is stale', async () => {
    refundCredits.mockResolvedValue({ ok: true });
    const stale = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const db = fakeDb([queued({ status: 'submitted', operation: null, credits: 25, charge_ref: 'agentq:item-1', updated_at: stale })]);
    const res = await drainOnce(db as never, UID);
    expect(res.action).toBe('failed');
    expect(refundCredits).toHaveBeenCalled();
  });
});
