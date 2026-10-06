/** @jest-environment node */
/**
 * The chat's free-text music video ("make a music video of …") is charged ONCE, up front, at the music-video quote — it used to
 * charge nothing (its three legs debited through `debit_wallet_gel`, which is not on the production database).
 */
jest.mock('server-only', () => ({}));

let mockBalance: number | null = 500;
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockBalance === null ? null : { credits_balance: mockBalance }, error: null }) }) }) }),
  })),
}));
jest.mock('./videoProvider', () => ({ hasVideoProvider: jest.fn(() => true) }));
jest.mock('../ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn(() => true), generateLyriaTrack: jest.fn(async () => ({ base64: 'YXVkaW8=', mime: 'audio/mpeg' })) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://test.supabase.co/storage/v1/object/sign/music.mp3') }));
jest.mock('../udio/client', () => ({ generateLyriaTrack: jest.fn(async () => ({ workId: 'work-1' })) }));
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
import { generateLyriaTrack, hasLyriaProvider } from '../ai/lyriaMusic';
import type { OrchestratorInput } from './providerRouter';

const input = (): OrchestratorInput => ({
  message: 'make a music video about Tbilisi at night', serviceContext: 'video', agentId: '', userId: 'user-1',
  sessionId: 's-1', locale: 'en', history: [], metadata: {},
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMeta.length = 0;
  mockBalance = 500;
  mockDeduct.mockResolvedValue({ ok: true, balance: 465 });
  mockRefund.mockResolvedValue({ ok: true });
  mockExecute.mockResolvedValue({ success: true, predictionId: 'clip-1' });
  (hasLyriaProvider as jest.Mock).mockReturnValue(true);
  (generateLyriaTrack as jest.Mock).mockResolvedValue({ base64: 'YXVkaW8=', mime: 'audio/mpeg' });
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); delete process.env.GEMINI_API_KEY; });

test('charged once, up front, at the music-video quote (35) — before any leg runs — and no leg debits on its own', async () => {
  const res = await handleMusicVideoComposite(input());
  expect(res.success).toBe(true);
  expect(mockDeduct).toHaveBeenCalledTimes(1);
  expect(mockDeduct.mock.calls[0]!.slice(0, 2)).toEqual(['user-1', 35]);
  expect(String(mockDeduct.mock.calls[0]![2])).toMatch(/:charge$/);
  expect(mockDeduct.mock.invocationCallOrder[0]).toBeLessThan(mockExecute.mock.invocationCallOrder[0]!);
  expect(mockMeta.length).toBeGreaterThanOrEqual(2);
  for (const m of mockMeta) expect(m.deduct).toBe(false);
  expect(mockRefund).not.toHaveBeenCalled();
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
  expect(generateLyriaTrack).not.toHaveBeenCalled();
  expect(mockRefund).not.toHaveBeenCalled();
});

test('both paid legs delivered → no refund', async () => {
  await handleMusicVideoComposite(input());
  expect(mockRefund).not.toHaveBeenCalled();
});

test('neither the song nor the clip came back → the WHOLE charge is returned, once', async () => {
  (hasLyriaProvider as jest.Mock).mockReturnValue(false);
  mockExecute.mockResolvedValue({ success: false });
  await handleMusicVideoComposite(input());
  expect(mockRefund).toHaveBeenCalledTimes(1);
  expect(mockRefund.mock.calls[0]!.slice(0, 2)).toEqual(['user-1', 35]);
  expect(String(mockRefund.mock.calls[0]![2])).toMatch(/:charge:refund$/);
});

test('only one leg delivered → half comes back, rounded DOWN (never more than was taken)', async () => {
  (hasLyriaProvider as jest.Mock).mockReturnValue(false); // no song
  await handleMusicVideoComposite(input());            // the clip still queues
  expect(mockRefund).toHaveBeenCalledTimes(1);
  expect(mockRefund.mock.calls[0]![1]).toBe(17);
});
