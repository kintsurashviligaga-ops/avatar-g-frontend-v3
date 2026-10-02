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
  generateFilmVoiceover: jest.fn(async () => null),
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

import { handleFilmComposite } from './filmComposite';
import { deriveFilmTokenId, getFilmPaid } from './filmStatusStore';
import { decodeFilmRef } from './filmTaskRef';
import type { OrchestratorInput } from './providerRouter';

const queued = (n: number) => ({ success: true, predictionId: `task-${n}`, predictionStatus: 'processing', metadata: { videoProvider: 'gemini-veo' } });
const dead = { success: false, predictionStatus: 'failed', metadata: { veoFailure: { reason: 'safety', retryable: false } } };

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
  mockConsumeFree.mockResolvedValue(-1); // no free slot
  mockRestoreFree.mockResolvedValue(0);
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
  test('3 scenes × 8 s on Fast = 75 credits — one debit, on the film’s own ref, taken BEFORE the first provider call', async () => {
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockDeduct).toHaveBeenCalledTimes(1);
    const [uid, amount, ref] = mockDeduct.mock.calls[0] as [string, number, string];
    expect(uid).toBe('user-1');
    expect(amount).toBe(75);
    expect(ref).toMatch(/:charge$/);
    expect(mockDeduct.mock.invocationCallOrder[0]).toBeLessThan(mockExecute.mock.invocationCallOrder[0]!);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  test('the price follows the length, the tier and the mode — the same numbers the Generate button shows', async () => {
    await handleFilmComposite(input({ sceneCount: 6, veo: veo('fast') }));
    await handleFilmComposite(input({ sceneCount: 1, veo: veo('standard') }));
    await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast'), musicVideoMode: true }));
    expect(mockDeduct.mock.calls.map((c) => c[1])).toEqual([150, 83, 105]);
  });

  test('a clip leg no longer debits on its own (debit_wallet_gel is not on prod, and must never double-charge if it appears)', async () => {
    await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast') }));
    expect(mockWithTraceMeta).toHaveLength(2);
    for (const meta of mockWithTraceMeta) expect(meta.deduct).toBe(false);
  });

  test('the payment is recorded server-side so /assemble does not charge the stitch again', async () => {
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    const paid = await getFilmPaid(statusTokenOf(res));
    expect(paid).toMatchObject({ uid: 'user-1', credits: 75, consumed: false });
    expect(paid?.ref).toBe(mockDeduct.mock.calls[0]![2]);
  });
});

describe('a film we cannot charge for does not start', () => {
  test('a balance below the quote → the localized top-up answer; nothing debited, nothing dispatched', async () => {
    mockBalance = 40; // a 3-scene Fast film is 75
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/75/);
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
    const res = await handleFilmComposite(input({ sceneCount: 6, veo: veo('fast') })); // 150
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
    expect([uid, amount]).toEqual(['user-1', 75]);
    expect(ref).toBe(`${(mockDeduct.mock.calls[0] as unknown[])[2]}:refund`);
  });

  test('one scene of three dead at dispatch → its third (25) comes back; the film still starts and records the net 50', async () => {
    let n = 0;
    mockExecute.mockImplementation(async () => (++n === 2 ? dead : queued(n)));
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect((mockRefund.mock.calls[0] as unknown[])[1]).toBe(25);
    expect(String((mockRefund.mock.calls[0] as unknown[])[2])).toMatch(/:refund:dispatch$/);
    expect((await getFilmPaid(statusTokenOf(res)))?.credits).toBe(50);
  });

  test('a failed refund is never claimed: the charge stays recorded as taken', async () => {
    mockExecute.mockResolvedValue(dead);
    mockRefund.mockResolvedValue({ ok: false, reason: 'error' });
    const res = await handleFilmComposite(input({ sceneCount: 2, veo: veo('fast') }));
    expect(res.success).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('REFUND FAILED'));
  });

  test('a clip that queues and dies LATER is not refunded here (a poll result is not proof — the token is client-held)', async () => {
    // Nothing in this request can see a later failure; the charge stays whole.
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockRefund).not.toHaveBeenCalled();
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

  test('a 24 s film with a free slot available does NOT spend it — it is a paid film at 75', async () => {
    mockConsumeFree.mockResolvedValue(0);
    const res = await handleFilmComposite(input({ sceneCount: 3, veo: veo('fast') }));
    expect(res.success).toBe(true);
    expect(mockConsumeFree).not.toHaveBeenCalled();
    expect((mockDeduct.mock.calls[0] as unknown[])[1]).toBe(75);
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
