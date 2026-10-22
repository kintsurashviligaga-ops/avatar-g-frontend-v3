/** @jest-environment node */
/**
 * The chat's free-text music video ("make a music video of …") is charged ONCE, up front, at the music-video quote — it used to
 * charge nothing (its three legs debited through `debit_wallet_gel`, which is not on the production database).
 *
 * Its song leg was Udio, which has no Google engine (MASTER TASK v3.1): the composite queues the clip alone, whatever
 * MEDIA_GOOGLE_ONLY says, and the song's half of the charge comes back. The Udio mock is primed to succeed, so a reinstated
 * leg would show up as a call and a kept charge.
 */
jest.mock('server-only', () => ({}));

let mockBalance: number | null = 500;
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockBalance === null ? null : { credits_balance: mockBalance }, error: null }) }) }) }),
  })),
}));
jest.mock('./videoProvider', () => ({ hasVideoProvider: jest.fn(() => true) }));
jest.mock('../udio/client', () => ({ startUdioGeneration: jest.fn(async () => ({ workId: 'work-1' })) }));
jest.mock('../gemini/client', () => ({ generateWithGemini: jest.fn(async () => ({ text: 'la la la' })) }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
const mockMeta: Array<Record<string, unknown>> = [];
jest.mock('../observability/agentTrace', () => ({
  withTrace: jest.fn(async (meta: Record<string, unknown>, fn: () => Promise<unknown>) => { mockMeta.push(meta); return fn(); }),
}));
const mockExecute = jest.fn();
jest.mock('./ServiceManager', () => ({ ServiceManager: jest.fn().mockImplementation(() => ({ execute: (...a: unknown[]) => mockExecute(...a) })) }));
const mockDeduct = jest.fn();
const mockRefund = jest.fn();
jest.mock('../orchestrator/ledger', () => ({
  deductCredits: (...a: unknown[]) => mockDeduct(...a),
  refundCredits: (...a: unknown[]) => mockRefund(...a),
}));

import { handleMusicVideoComposite } from './musicVideoComposite';
import { startUdioGeneration } from '../udio/client';
import type { OrchestratorInput } from './providerRouter';
import { filmCredits } from '@/lib/credits/priceBook';

/** The music-video quote: one 8 s Fast scene with its song, as a film (lib/credits/priceBook) — 77 credits. */
const MV_QUOTE = filmCredits(8, 'fast', true);

const input = (): OrchestratorInput => ({
  message: 'make a music video about Tbilisi at night', serviceContext: 'video', agentId: '', userId: 'user-1',
  sessionId: 's-1', locale: 'en', history: [], metadata: {},
});

const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMeta.length = 0;
  mockBalance = 500;
  mockDeduct.mockResolvedValue({ ok: true, balance: 465 });
  mockRefund.mockResolvedValue({ ok: true });
  mockExecute.mockResolvedValue({ success: true, predictionId: 'clip-1' });
  (startUdioGeneration as jest.Mock).mockResolvedValue({ workId: 'work-1' });
  delete process.env.GEMINI_TRANSPORT;
  Object.assign(process.env, VERTEX_ENV); // the lyrics leg runs on Vertex AI (MASTER TASK v3.1)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
const ENV = { ...process.env };
afterEach(() => { jest.restoreAllMocks(); process.env = { ...ENV }; });

test('charged once, up front, at the music-video quote (77) — before any leg runs — and no leg debits on its own', async () => {
  const res = await handleMusicVideoComposite(input());
  expect(res.success).toBe(true);
  expect(mockDeduct).toHaveBeenCalledTimes(1);
  expect(mockDeduct.mock.calls[0]!.slice(0, 2)).toEqual(['user-1', MV_QUOTE]);
  expect(String(mockDeduct.mock.calls[0]![2])).toMatch(/:charge$/);
  expect(mockDeduct.mock.invocationCallOrder[0]).toBeLessThan(mockExecute.mock.invocationCallOrder[0]!);
  expect(mockMeta.length).toBeGreaterThanOrEqual(2);
  for (const m of mockMeta) expect(m.deduct).toBe(false);
});

test('short of credits → the localized top-up answer, nothing debited or started', async () => {
  mockBalance = 10;
  const res = await handleMusicVideoComposite(input());
  expect(res.success).toBe(false);
  expect((res.metadata as { insufficientCredits?: boolean }).insufficientCredits).toBe(true);
  expect(mockDeduct).not.toHaveBeenCalled();
  expect(mockExecute).not.toHaveBeenCalled();
});

test.each(['insufficient', 'error', 'skipped'] as const)('a refused debit (%s) starts nothing', async (reason) => {
  mockDeduct.mockResolvedValueOnce({ ok: false, reason });
  const res = await handleMusicVideoComposite(input());
  expect(res.success).toBe(false);
  expect(mockExecute).not.toHaveBeenCalled();
  expect(startUdioGeneration).not.toHaveBeenCalled();
  expect(mockRefund).not.toHaveBeenCalled();
});

test('the clip did not come back either → the WHOLE charge is returned, once', async () => {
  mockExecute.mockResolvedValue({ success: false });
  await handleMusicVideoComposite(input());
  expect(mockRefund).toHaveBeenCalledTimes(1);
  expect(mockRefund.mock.calls[0]!.slice(0, 2)).toEqual(['user-1', MV_QUOTE]);
  expect(String(mockRefund.mock.calls[0]![2])).toMatch(/:charge:refund$/);
});

test.each([
  {},
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-udio' },
])('env %o: the clip queues with no song, Udio is never called, and the song\'s half comes back rounded DOWN', async (env) => {
  Object.assign(process.env, env);
  const res = await handleMusicVideoComposite(input());
  expect(res.success).toBe(true);
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(startUdioGeneration).not.toHaveBeenCalled();
  expect(mockRefund).toHaveBeenCalledTimes(1);
  expect(mockRefund.mock.calls[0]![1]).toBe(Math.floor(MV_QUOTE / 2));
  expect(String(mockRefund.mock.calls[0]![2])).toMatch(/:charge:refund$/);
});
