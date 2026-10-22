/** @jest-environment node */
/**
 * A film stopped by the PLATFORM's daily AI limit says so, asks Google nothing more, and hands every credit back.
 *
 * ⚠️ 2026-10-16 17:05Z: the site-wide DAILY_COST_LIMIT was used up. Every clip leg was refused by the budget guard
 * before anything reached Google, the film asked again three more times per clip, and then told the owner
 * "could not reach the video service" — so the one cause (the day's limit, back at 04:00 Tbilisi) was invisible.
 * The ServiceManager here answers exactly as it does on a BudgetExceededError (ServiceManager.ts, `budgetExceeded`).
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
jest.mock('../veo/engine', () => ({ veoTransport: jest.fn(() => 'vertex') }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => null) }));
jest.mock('./promptAgent', () => ({ runPromptAgent: jest.fn(async () => null) }));
jest.mock('./filmVoiceover', () => ({
  generateCheckedFilmVoiceover: jest.fn(async () => null),
  generateDialogueVoiceover: jest.fn(async () => null),
  generateDialogueStems: jest.fn(async () => null),
  dialogueStemsViable: jest.fn(() => false),
  wantsCommentary: jest.fn(() => false),
}));
jest.mock('../ai/qaDirectorAgent', () => ({ evaluateFilmQa: jest.fn(async () => null) }));
jest.mock('../audio/lyriaBed', () => ({ lyriaBedReady: jest.fn(() => false) }));
jest.mock('./filmClipRetry', () => {
  const actual = jest.requireActual('./filmClipRetry');
  return { ...actual, MAX_CLIP_DISPATCH_ATTEMPTS: 3, clipDispatchJitterMs: () => 0, clipRetryBackoffMs: () => 0 };
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

import { handleFilmComposite } from './filmComposite';
import { budgetRefusalMessage } from '@/lib/services/billing/budgetMessage';
import type { OrchestratorInput } from './providerRouter';

const queued = (n: number) => ({ success: true, predictionId: `task-${n}`, predictionStatus: 'processing', metadata: { videoProvider: 'gemini-veo' } });
/** The studio's Veo plan as it travels on the wire (lib/veo/renderOptions.ts VeoRenderOptionsSchema). */
const veo = (tier: 'standard' | 'fast' | 'lite') => ({
  tier, format: '9:16', referenceMode: 'first_frame', generateAudio: true, seedLock: true, enhancePrompt: false, scenes: [],
});

let seq = 0;
const input = (metadata: Record<string, unknown>, userId = 'user-1'): OrchestratorInput => ({
  message: 'A detective waits for an informant on a rain-soaked pier at midnight',
  serviceContext: 'video', agentId: '', userId, sessionId: `s-${++seq}`, locale: 'en', history: [],
  metadata: { orientation: 'vertical', ...metadata },
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


const SCENES = [
  'A presenter in a black blazer on a pitch-black stage, slow dolly in.',
  'Medium close-up: the presenter smiles at the camera, warm light.',
];
const panel = () => ({ sceneCount: 2, clipSec: 8, veo: veo('fast'), sceneScripts: SCENES });
const clipCalls = () => mockExecute.mock.calls
  .map((c) => c[0] as { serviceContext: string })
  .filter((r) => r.serviceContext === 'video');
/** ServiceManager.execute's answer when guardedCall throws BudgetExceededError (nothing was sent to Google). */
const refused = (reason: string) => ({
  success: false, provider: 'replicate', operation: 'video', responseType: 'video',
  message: 'refused', predictionStatus: 'failed',
  metadata: { provider: 'replicate', operation: 'video', budgetExceeded: true, budgetReason: reason },
});

describe('a film refused by the platform budget', () => {
  test('each scene is asked once, and the film names the daily limit and when it lifts (not "could not connect")', async () => {
    mockExecute.mockImplementation(async () => refused('daily_limit'));
    const res = await handleFilmComposite(input(panel()));
    expect(res.success).toBe(false);
    expect(clipCalls()).toHaveLength(2);
    expect(res.message).toBe(budgetRefusalMessage('en', 'daily_limit'));
    expect(res.message).toContain('04:00');
    const meta = res.metadata as { platformBudget?: boolean; budgetReason?: string; balanceProtected?: boolean };
    expect(meta.platformBudget).toBe(true);
    expect(meta.budgetReason).toBe('daily_limit');
    expect(meta.balanceProtected).toBe(true);
  });

  test('the Georgian studio reads it in Georgian', async () => {
    mockExecute.mockImplementation(async () => refused('daily_limit'));
    const res = await handleFilmComposite({ ...input(panel()), locale: 'ka' });
    expect(res.message).toBe(budgetRefusalMessage('ka', 'daily_limit'));
    expect(res.message).toContain('04:00');
  });

  test('the monthly limit is named as the monthly limit', async () => {
    mockExecute.mockImplementation(async () => refused('monthly_limit'));
    const res = await handleFilmComposite(input(panel()));
    expect(res.message).toBe(budgetRefusalMessage('en', 'monthly_limit'));
    expect((res.metadata as { budgetReason?: string }).budgetReason).toBe('monthly_limit');
  });

  test('the film’s charge is handed back in full and its start key is freed for a retry tomorrow', async () => {
    mockExecute.mockImplementation(async () => refused('daily_limit'));
    await handleFilmComposite(input(panel()));
    expect(mockDeduct).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0]![1]).toBe(mockDeduct.mock.calls[0]![1]);
    expect(mockReleaseKey).toHaveBeenCalledTimes(1);
  });

  test('an ordinary dead dispatch is still retried and still reads as a connection failure', async () => {
    mockExecute.mockImplementation(async () => ({ success: false, predictionStatus: 'failed', metadata: {} }));
    const res = await handleFilmComposite(input(panel()));
    expect(res.success).toBe(false);
    expect(clipCalls().length).toBeGreaterThan(2);
    expect((res.metadata as { platformBudget?: boolean }).platformBudget).toBeUndefined();
  });
});
