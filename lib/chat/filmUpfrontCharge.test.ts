/** @jest-environment node */
/**
 * A film is charged ONCE, UP FRONT, at the quote for its real length — and refunded only for what THIS request proves it
 * did not deliver.
 *
 * ⚠️ WHAT THIS PINS. The studio used to charge a film almost nothing: every clip's debit called `debit_wallet_gel`, which does
 * not exist on the production database (so every clip was free) and the stitch took a flat 20 credits whatever the length —
 * a 48 s film cost the platform ~$5.76 of Veo and the customer 20 credits. handleFilmComposite is driven for real here, with
 * the ledger, the wallet and the provider mocked (no network, no spend).
 */
jest.mock('server-only', () => ({}));

let mockBalance: number | null = 1000;
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockBalance === null ? null : { credits_balance: mockBalance }, error: null }) }) }),
    }),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: id === 'founder' ? 'founder@example.test' : 'user@example.test' } }, error: null }) } },
  })),
  authedClientFromRequest: jest.fn(),
}));
jest.mock('../auth/adminGuard', () => ({ isAdminEmail: (e: string) => e === 'founder@example.test' }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../veo/engine', () => ({ veoTransport: jest.fn(() => 'gemini') }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => null) }));
jest.mock('./promptAgent', () => ({ runPromptAgent: jest.fn(async () => null) }));
jest.mock('./filmVoiceover', () => ({
  generateCheckedFilmVoiceover: jest.fn(async () => null),
  generateDialogueVoiceover: jest.fn(async () => null),
  generateDialogueStems: jest.fn(async () => null),
  dialogueStemsViable: jest.fn(() => false),
  wantsCommentary: jest.fn(() => false),
  generateFilmSfx: jest.fn(async () => null),
}));
jest.mock('../ai/qaDirectorAgent', () => ({ evaluateFilmQa: jest.fn(async () => null) }));
jest.mock('../elevenlabs/music', () => ({ hasElevenLabsMusicKey: jest.fn(() => false) }));
jest.mock('./filmClipRetry', () => {
  const actual = jest.requireActual('./filmClipRetry');
  return { ...actual, MAX_CLIP_DISPATCH_ATTEMPTS: 1, clipDispatchJitterMs: () => 0, clipRetryBackoffMs: () => 0 };
});
// Every clip leg runs through withTrace; the film no longer asks it to debit (the test proves it by `deduct`).
const mockWithTraceMeta: Array<Record<string, unknown>> = [];
jest.mock('../observability/agentTrace', () => ({
  withTrace: jest.fn(async (meta: Record<string, unknown>, fn: () => Promise<unknown>) => {
    mockWithTraceMeta.push(meta);
    return fn();
  }),
}));

const mockExecute = jest.fn();
jest.mock('./ServiceManager', () => ({ ServiceManager: jest.fn().mockImplementation(() => ({ execute: (...a: unknown[]) => mockExecute(...a), poll: jest.fn() })) }));

const mockDeduct = jest.fn();
const mockRefund = jest.fn();
jest.mock('../orchestrator/ledger', () => ({
  deductCredits: (...a: unknown[]) => mockDeduct(...a),
  refundCredits: (...a: unknown[]) => mockRefund(...a),
  refundDebitByRef: jest.fn(async () => ({ ok: true })),
}));
const mockConsumeFree = jest.fn();
const mockRestoreFree = jest.fn();
jest.mock('../billing/wallet-ledger', () => ({
  consumeFreeFilm: (...a: unknown[]) => mockConsumeFree(...a),
  restoreFreeFilm: (...a: unknown[]) => mockRestoreFree(...a),
}));

// The film start's duplicate guard (claimPaidStartKey): a store with the database's semantics — first claim of a
// (user, key) wins, a release frees it. Its real atomicity on Postgres: lib/chat/filmBilling.pg.test.ts.
const mockStartKeys = new Set<string>();
const mockClaimStart = jest.fn();
const mockReleaseKey = jest.fn();
jest.mock('../orchestrator/idempotency', () => ({
  ...jest.requireActual('../orchestrator/idempotency'),
  claimPaidStartKey: (...a: unknown[]) => mockClaimStart(...a),
  releaseIdempotencyKey: (...a: unknown[]) => mockReleaseKey(...a),
}));

// R3-A: what the start records server-side for each queued Veo scene (the poll later settles it with Google).
const mockRecordScenes = jest.fn();
jest.mock('./filmBilling', () => ({
  ...jest.requireActual('./filmBilling'),
  recordFilmScenes: (...a: unknown[]) => mockRecordScenes(...a),
}));

import { filmStartRefused, handleFilmComposite } from './filmComposite';
import { deriveFilmTokenId, getFilmPaid } from './filmStatusStore';
import { decodeFilmRef } from './filmTaskRef';
import type { OrchestratorInput } from './providerRouter';
import { filmCredits, type ClipTier } from '@/lib/credits/priceBook';
import { perSceneCredits } from '@/lib/credits/videoPricing';

/** A film of `scenes` × 8 s: the quote the Generate button shows and the route charges (lib/credits/priceBook). */
const film = (scenes: number, tier: ClipTier = 'fast', musicVideo = false): number => filmCredits(scenes * 8, tier, musicVideo, scenes);
/** One scene's even share of that film, what a scene dead at dispatch gives back. */
const share = (scenes: number): number => perSceneCredits(film(scenes), scenes);

const queued = (n: number) => ({ success: true, predictionId: `task-${n}`, predictionStatus: 'processing', metadata: { videoProvider: 'gemini-veo' } });
const dead = { success: false, predictionStatus: 'failed', metadata: { veoFailure: { reason: 'safety', retryable: false } } };
/** A clip queued on Veo, its task ref encoded the way ServiceManager encodes a 'gemini-veo' job. */
const veoOp = (n: number) => `projects/p/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/op-${n}`;
const queuedOnVeo = (n: number) => ({
  ...queued(n),
  predictionId: Buffer.from(JSON.stringify({ v: 1, provider: 'gemini-veo', providerTaskId: `${veoOp(n)}::16:9` })).toString('base64url'),
});

/** The studio's Veo plan as it travels on the wire (lib/veo/renderOptions.ts VeoRenderOptionsSchema). */
const veo = (tier: 'standard' | 'fast' | 'lite') => ({
  tier, format: '16:9', referenceMode: 'first_frame', generateAudio: true, seedLock: true, enhancePrompt: false, scenes: [],
});

/** The status token a film's payment is recorded under — derived from the film token the response hands the client. */
function statusTokenOf(res: { predictionId?: unknown }): string {
  const ref = decodeFilmRef(String(res.predictionId));
  if (!ref) throw new Error('the response carries no film token');
  return deriveFilmTokenId({ sessionId: ref.sessionId, createdAt: ref.createdAt, seed: ref.seed });
}

let seq = 0;
const input = (metadata: Record<string, unknown>, userId = 'user-1'): OrchestratorInput => ({
  message: 'A detective waits for an informant on a rain-soaked pier at midnight',
  serviceContext: 'video', agentId: '', userId, sessionId: `s-${++seq}`, locale: 'en', history: [],
  metadata: { orientation: 'landscape', ...metadata },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWithTraceMeta.length = 0;
  mockBalance = 1000;
  mockDeduct.mockResolvedValue({ ok: true, balance: 900 });
  mockRefund.mockResolvedValue({ ok: true });
  mockRecordScenes.mockResolvedValue('recorded');
  mockConsumeFree.mockResolvedValue(-1); // no free slot
  mockRestoreFree.mockResolvedValue(0);
  mockStartKeys.clear();
  mockClaimStart.mockImplementation(async (uid: string, key: string) => {
    const k = `${uid}|${key}`;
    if (mockStartKeys.has(k)) return 'held';
    mockStartKeys.add(k);
    return 'claimed';
  });
  mockReleaseKey.mockImplementation(async (uid: string, key: string) => { mockStartKeys.delete(`${uid}|${key}`); });
  let n = 0;
  mockExecute.mockImplementation(async () => queued(++n));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => jest.restoreAllMocks());

describe('a paid film is charged ONCE, at its quote, before any clip is dispatched', () => {
  test('3 scenes × 8 s on Fast = 217 credits — one debit, on the film’s own durable ref, taken BEFORE the first provider call', async () => {
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockDeduct).toHaveBeenCalledTimes(1);
    const [uid, amount, ref] = mockDeduct.mock.calls[0] as [string, number, string];
    expect(uid).toBe('user-1');
    expect(amount).toBe(film(3));
    expect(amount).toBe(217);
    // The ledger itself is the film's payment record: /assemble finds it under the token it is handed.
    expect(ref).toBe(`filmpay:${statusTokenOf(res)}`);
    expect(mockDeduct.mock.invocationCallOrder[0]).toBeLessThan(mockExecute.mock.invocationCallOrder[0]!);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  test('the price follows the length, the tier and the mode — the same numbers the Generate button shows', async () => {
    await handleFilmComposite(input({ sceneCount: 6, veo: veo('fast') }));
    await handleFilmComposite(input({ sceneCount: 1, veo: veo('standard') }));
    await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast'), musicVideoMode: true }));
    expect(mockDeduct.mock.calls.map((c) => c[1])).toEqual([film(6), film(1, 'standard'), film(3, 'fast', true)]);
  });

  test('a clip leg no longer debits on its own (debit_wallet_gel is not on prod, and must never double-charge if it appears)', async () => {
    await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast') }));
    expect(mockWithTraceMeta).toHaveLength(2);
    for (const meta of mockWithTraceMeta) expect(meta.deduct).toBe(false);
  });

  test('the payment is recorded server-side so /assemble does not charge the stitch again', async () => {
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    const paid = await getFilmPaid(statusTokenOf(res));
    expect(paid).toMatchObject({ uid: 'user-1', credits: film(3), consumed: false });
    expect(paid?.ref).toBe(mockDeduct.mock.calls[0]![2]);
  });
});

describe('a film we cannot charge for does not start', () => {
  test('a balance below the quote → the localized top-up answer; nothing debited, nothing dispatched', async () => {
    mockBalance = 40; // a 3-scene Fast film is 217
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(false);
    expect(res.message).toMatch(new RegExp(String(film(3))));
    expect((res.metadata as { insufficientCredits?: boolean }).insufficientCredits).toBe(true);
    expect(mockDeduct).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('the race the read-only gate cannot see: the atomic debit says insufficient → same answer, nothing dispatched', async () => {
    mockDeduct.mockResolvedValueOnce({ ok: false, reason: 'insufficient' });
    const res = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast') }));
    expect(res.success).toBe(false);
    expect((res.metadata as { insufficientCredits?: boolean }).insufficientCredits).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test.each(['error', 'skipped'] as const)('a ledger that cannot answer (%s) FAILS CLOSED — no render, nothing to refund', async (reason) => {
    mockDeduct.mockResolvedValueOnce({ ok: false, reason });
    const res = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast') }));
    expect(res.success).toBe(false);
    expect((res.metadata as { billingUnavailable?: boolean }).billingUnavailable).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('the gate compares credits with credits: a 10-credit balance no longer passes a film quoted in the hundreds', async () => {
    mockBalance = 10;
    const res = await handleFilmComposite(input({ sceneCount: 6, veo: veo('fast') })); // 430
    expect(res.success).toBe(false);
    expect(mockDeduct).not.toHaveBeenCalled();
  });
});

describe('refunds: only what this request proves it did not deliver', () => {
  test('every clip refused at dispatch → the WHOLE charge comes back, once, on the film’s own refund ref', async () => {
    mockExecute.mockResolvedValue(dead);
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(false);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    const [uid, amount, ref] = mockRefund.mock.calls[0] as [string, number, string];
    expect([uid, amount]).toEqual(['user-1', film(3)]);
    expect(ref).toBe(`${(mockDeduct.mock.calls[0] as unknown[])[2]}:refund`);
  });

  test('one scene of three dead at dispatch → its third comes back; the film still starts and records the net', async () => {
    let n = 0;
    mockExecute.mockImplementation(async () => (++n === 2 ? dead : queued(n)));
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect((mockRefund.mock.calls[0] as unknown[])[1]).toBe(share(3));
    expect(String((mockRefund.mock.calls[0] as unknown[])[2])).toMatch(/:refund:dispatch$/);
    expect((await getFilmPaid(statusTokenOf(res)))?.credits).toBe(film(3) - share(3));
  });

  test('the daily Veo ceiling refusing scene 2 (engine `quota`, not retryable) → that scene is refunded at dispatch and never re-posted', async () => {
    const capped = { success: false, predictionStatus: 'failed', metadata: { veoFailure: { reason: 'quota', retryable: false } } };
    let n = 0;
    mockExecute.mockImplementation(async () => (++n === 2 ? capped : queued(n)));
    const res = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(2); // one dispatch per scene: a ceiling refusal is not retried
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect((mockRefund.mock.calls[0] as unknown[])[1]).toBe(share(2));
    expect(String((mockRefund.mock.calls[0] as unknown[])[2])).toMatch(/:refund:dispatch$/);
  });

  test('a failed refund is never claimed: the charge stays recorded as taken', async () => {
    mockExecute.mockResolvedValue(dead);
    mockRefund.mockResolvedValue({ ok: false, reason: 'error' });
    const res = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast') }));
    expect(res.success).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('REFUND FAILED'));
  });

  test('a clip that queues and dies LATER is not refunded here (a poll result is not proof — the token is client-held)', async () => {
    // Nothing in this request can see a later failure; the charge stays whole. R3-A settles it from the poll, on the
    // server's own record and Google's word (lib/chat/filmSceneRefund.test.ts).
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('R3-A: the start records each QUEUED Veo scene with its operation and its share; a scene dead at dispatch is not', async () => {
    let n = 0;
    mockExecute.mockImplementation(async () => (++n === 2 ? dead : queuedOnVeo(n)));
    const res = await handleFilmComposite(input({ sceneCount: 4, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect((mockDeduct.mock.calls[0] as unknown[])[1]).toBe(film(4));
    expect(mockRecordScenes).toHaveBeenCalledTimes(1);
    const [uid, token, shares] = mockRecordScenes.mock.calls[0] as [string, string, Array<{ ordinal: number; operation: string; credits: number }>];
    expect([uid, token]).toEqual(['user-1', statusTokenOf(res)]);
    expect(shares.map((x) => x.credits)).toEqual([share(4), share(4), share(4)]);
    expect(shares.map((x) => x.operation)).toEqual([veoOp(1), veoOp(3), veoOp(4)]);
    // the dispatch refund took the dead scene's share; the three recorded shares are exactly what the film still holds
    expect((mockRefund.mock.calls[0] as unknown[])[1]).toBe(share(4));
    expect((await getFilmPaid(statusTokenOf(res)))?.credits).toBe(3 * share(4));
  });

  test('R3-A: a free film and a clip on another engine record nothing', async () => {
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') })); // task refs that are not Veo jobs
    expect(res.success).toBe(true);
    expect(mockRecordScenes).not.toHaveBeenCalled();
    mockConsumeFree.mockResolvedValue(0);
    mockExecute.mockImplementation(async () => queuedOnVeo(9));
    expect((await handleFilmComposite(input({ sceneCount: 1, veo: veo('fast') }))).success).toBe(true);
    expect(mockRecordScenes).not.toHaveBeenCalled();
  });
});

describe('the free video is ONE SHORT CLIP, not a film of any length', () => {
  test('an 8 s film with a free slot: the slot is spent, nothing is debited', async () => {
    mockConsumeFree.mockResolvedValue(0); // ≥ 0 = a slot was available and is now spent
    const res = await handleFilmComposite(input({ sceneCount: 1, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockConsumeFree).toHaveBeenCalledTimes(1);
    expect(mockDeduct).not.toHaveBeenCalled();
  });

  test('a 24 s film with a free slot available does NOT spend it — it is a paid film at 217', async () => {
    mockConsumeFree.mockResolvedValue(0);
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockConsumeFree).not.toHaveBeenCalled();
    expect((mockDeduct.mock.calls[0] as unknown[])[1]).toBe(film(3));
  });

  test('a free film that dispatches nothing hands the slot back', async () => {
    mockConsumeFree.mockResolvedValue(0);
    mockExecute.mockResolvedValue(dead);
    await handleFilmComposite(input({ sceneCount: 1, veo: veo('fast') }));
    expect(mockRestoreFree).toHaveBeenCalledTimes(1);
    expect(mockRefund).not.toHaveBeenCalled(); // nothing was charged, so nothing is refunded
  });
});

describe('who is not charged', () => {
  test('the founder / admin renders on the platform’s budget: no debit, no gate', async () => {
    mockBalance = 0;
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }, 'founder'));
    expect(res.success).toBe(true);
    expect(mockDeduct).not.toHaveBeenCalled();
  });
});

describe('one approved start = at most one charge (the film start’s duplicate guard)', () => {
  const press = () => '3f2b8a4e-1c2d-4e5f-8a9b-' + Math.floor(Math.random() * 1e12).toString(16).padStart(12, '0');
  const refusal = (res: { metadata?: unknown }) => (res.metadata as { filmStart?: string } | undefined)?.filmStart;

  test('the provider answered but the browser timed out: the retried press gets THE SAME film back — no second charge or render', async () => {
    const id = press();
    const first = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }));
    // …the answer never reached the browser, which sends the same press again.
    const again = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }));
    expect(first.success).toBe(true);
    expect(again.success).toBe(true);
    expect(refusal(again)).toBe('replayed');
    expect(again.predictionId).toBe(first.predictionId); // the same token to poll and stitch: the same paid film
    expect((again.metadata as { film?: unknown }).film).toEqual((first.metadata as { film?: unknown }).film);
    expect(mockDeduct).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(2); // the first start's two scenes, and no more
    expect(mockClaimStart).toHaveBeenCalledWith('user-1', `film-start:${id}`, 3600);
  });

  test('a duplicate that lands while the first start is still under way is refused (no answer to give yet), nothing charged', async () => {
    const id = press();
    mockStartKeys.add(`user-1|film-start:${id}`); // the first start holds the key and has not answered
    const res = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }));
    expect(res.success).toBe(false);
    expect(refusal(res)).toBe('duplicate');
    expect(mockDeduct).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('another user’s press id never replays someone else’s film', async () => {
    const id = press();
    await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }));
    const other = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }, 'user-2'));
    expect(refusal(other)).toBeUndefined(); // their own start: claimed under their own (user, key), charged to them
    expect(mockDeduct.mock.calls.map((c) => c[0])).toEqual(['user-1', 'user-2']);
  });

  test('20 parallel identical starts (one press, double-sent and retried) → ONE charge, one set of clips, 19 refusals', async () => {
    const id = press();
    const all = await Promise.all(Array.from({ length: 20 }, () => handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }))));
    expect(all.filter((r) => r.success && refusal(r) === undefined)).toHaveLength(1);
    expect(all.filter((r) => refusal(r) === 'duplicate')).toHaveLength(19);
    expect(mockDeduct).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  test('a client without a press id: the same film from the same session twice is the same start (derived key)', async () => {
    const same = input({ sceneCount: 2, veo: veo('fast') });
    expect((await handleFilmComposite(same)).success).toBe(true);
    expect(refusal(await handleFilmComposite(same))).toBe('replayed');
    expect(mockDeduct).toHaveBeenCalledTimes(1);
    expect(String(mockClaimStart.mock.calls[0]![1])).toMatch(/^film-start:h:/);
    expect(mockClaimStart.mock.calls[0]![2]).toBe(330);
  });

  test('two DIFFERENT presses are two films, two charges', async () => {
    await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: press() }));
    await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: press() }));
    expect(mockDeduct).toHaveBeenCalledTimes(2);
  });

  describe('neither the database nor Redis can answer', () => {
    const ENV = process.env.VERCEL_ENV;
    afterEach(() => { if (ENV === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = ENV; });

    test('in Production → refused (unconfirmed): a money question nobody can answer charges nothing', async () => {
      process.env.VERCEL_ENV = 'production';
      mockClaimStart.mockResolvedValue('unavailable');
      const res = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: press() }));
      expect(res.success).toBe(false);
      expect(refusal(res)).toBe('unconfirmed');
      expect(mockDeduct).not.toHaveBeenCalled();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test('outside Production (local / CI without the guard’s table) → proceeds as before', async () => {
      delete process.env.VERCEL_ENV;
      mockClaimStart.mockResolvedValue('unavailable');
      const res = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: press() }));
      expect(res.success).toBe(true);
      expect(mockDeduct).toHaveBeenCalledTimes(1);
      expect(mockReleaseKey).not.toHaveBeenCalled(); // nothing was claimed, so nothing is released
    });
  });

  describe('a start that delivered nothing gives its key back, so an honest retry of the same press works', () => {
    test('balance too low → key released; topped up, the same press starts and is charged once', async () => {
      const id = press();
      mockBalance = 40;
      expect((await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast'), filmRequestId: id }))).success).toBe(false);
      expect(mockReleaseKey).toHaveBeenCalledWith('user-1', `film-start:${id}`);
      mockBalance = 1000;
      expect((await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast'), filmRequestId: id }))).success).toBe(true);
      expect(mockDeduct).toHaveBeenCalledTimes(1);
    });

    test('the ledger refused the debit → key released, nothing charged', async () => {
      const id = press();
      mockDeduct.mockResolvedValueOnce({ ok: false, reason: 'error' });
      await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }));
      expect(mockReleaseKey).toHaveBeenCalledWith('user-1', `film-start:${id}`);
    });

    test('every clip refused at dispatch → full refund AND key released; the retry is a new film with its own charge', async () => {
      const id = press();
      mockExecute.mockResolvedValue(dead);
      expect((await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }))).success).toBe(false);
      expect(mockRefund).toHaveBeenCalledTimes(1);
      expect(mockReleaseKey).toHaveBeenCalledWith('user-1', `film-start:${id}`);
      let n = 0;
      mockExecute.mockImplementation(async () => queued(++n));
      expect((await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }))).success).toBe(true);
      const refs = mockDeduct.mock.calls.map((c) => c[2]);
      expect(refs).toHaveLength(2);
      expect(refs[0]).not.toBe(refs[1]); // a new film token, so the ledger never mistakes the retry for a replay
    });

    test('a start that dispatched keeps its key (a partial film is still a film in progress)', async () => {
      let n = 0;
      mockExecute.mockImplementation(async () => (++n === 1 ? dead : queued(n)));
      await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: press() }));
      expect(mockReleaseKey).not.toHaveBeenCalled();
    });
  });

  test('the founder / admin start is guarded too (no charge, but never two renders of one press)', async () => {
    const id = press();
    await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }, 'founder'));
    const again = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast'), filmRequestId: id }, 'founder'));
    expect(refusal(again)).toBe('replayed');
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  test.each(['ka', 'en', 'ru'])('the refusal is localized (%s) and says nothing was charged', (locale) => {
    const dup = filmStartRefused(locale, 'duplicate');
    const unk = filmStartRefused(locale, 'unconfirmed');
    expect(dup.success).toBe(false);
    expect(dup.message).not.toBe(unk.message);
    expect(dup.message).toMatch(locale === 'en' ? /nothing more was charged/ : locale === 'ru' ? /ничего не списано/ : /არაფერი ჩამოგეჭრა/);
  });
});
