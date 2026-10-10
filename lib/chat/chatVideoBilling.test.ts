/** @jest-environment node */
/**
 * A signed-in user's chat VIDEO (a single Veo clip) is paid for by whoever DISPATCHED it — never by whoever polls.
 *
 * ⚠️ The price used to be taken only on the poll path, by the polling session: re-poll anonymously, wrap the task ref in
 * an unsigned composite token, or let /api/chat/stream poll it (no userId), and the clip was free. Now:
 *   · the render is charged the moment Google accepts it, under `poll:<predictionId>` — the same ref the poll path
 *     charges under, so the two can never both land;
 *   · a terminal failure on the poll path pays it back through the ledger (refundDebitByRef — only what was taken);
 *   · check → submit → charge is serialised per user (a Redis lock), so parallel requests cannot all pass a
 *     balance that only covers one;
 *   · the price is HELD before Google is asked (gap C6): a refused hold renders nothing, a synchronous asset keeps the
 *     hold as its charge, anything else gives it back (an accepted async job then pays under its poll ref).
 */
jest.mock('server-only', () => ({}));

jest.mock('./ServiceManager', () => {
  const execute = jest.fn();
  const poll = jest.fn();
  return { ServiceManager: jest.fn().mockImplementation(() => ({ execute, poll })), __sm: { execute, poll } };
});
jest.mock('./filmComposite', () => ({
  // The real keyword predicate (a pure regex in filmPipeline) — only the composite HANDLER is stubbed.
  isThirtySecondFilm: (m: string) => (jest.requireActual('./filmPipeline') as typeof import('./filmPipeline')).isThirtySecondFilm(m),
  handleFilmComposite: jest.fn(async () => ({ success: true, intent: 'video_generation', responseType: 'video', message: 'film queued', metadata: { provider: 'film' } })),
}));
jest.mock('./musicVideoComposite', () => ({
  isMusicVideoComposite: jest.fn(() => false),
  handleMusicVideoComposite: jest.fn(async () => ({ success: true, intent: 'video_generation', responseType: 'video', message: 'mv queued', metadata: { provider: 'mv' } })),
}));
jest.mock('../orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 25 })),
}));
jest.mock('../orchestrator/idempotency', () => ({
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
}));
jest.mock('../gemini/client', () => ({ generateWithGemini: jest.fn(async () => ({ text: 'hi there', model: 'gemini-test' })) }));
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: jest.fn() } })));
jest.mock('../udio/client', () => ({ startUdioGeneration: jest.fn(), getUdioGenerationStatus: jest.fn() }));
jest.mock('../worldlabs/client', () => ({ generateWorldLabsInterior: jest.fn() }));
jest.mock('../nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../replicate/client', () => ({ createPrediction: jest.fn(), pollUntilDone: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../monetization/audit-engine', () => ({
  isFounderAuditCommand: jest.fn(() => false),
  isFounder: jest.fn(() => false),
  runFounderAudit: jest.fn(),
  renderAuditAsMarkdown: jest.fn(),
  forecastMarginForAction: jest.fn(),
}));
jest.mock('./filmStatusStore', () => ({ deriveFilmTokenId: jest.fn(), buildFilmSnapshot: jest.fn(), putFilmStatus: jest.fn() }));
jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));

import { orchestrate, pollOrchestrationTask, type OrchestratorInput } from './providerRouter';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '../orchestrator/ledger';
import { claimIdempotencyKey, releaseIdempotencyKey } from '../orchestrator/idempotency';
import { billableCreditCost } from './chatBilling';

const { __sm: sm } = jest.requireMock('./ServiceManager') as { __sm: { execute: jest.Mock; poll: jest.Mock } };
const VIDEO_CMD = 'create a video of waves crashing on a rocky shore at dusk';
const TASK = 'eyJ2IjoxLCJwcm92aWRlciI6ImdlbWluaS12ZW8ifQ';

function input(over: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return { message: VIDEO_CMD, serviceContext: 'global', agentId: 'main-assistant', userId: 'user-7', sessionId: 's1', locale: 'en', history: [], ...over };
}

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps queued *Once values: a test whose render is now refused before the provider is asked would
  // leave its execute answer for the next test.
  sm.execute.mockReset();
  sm.poll.mockReset();
  delete process.env.FILM_ALLOW_ANONYMOUS;
  (claimIdempotencyKey as jest.Mock).mockResolvedValue(true);
  (hasSufficientBalance as jest.Mock).mockResolvedValue(true);
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  sm.execute.mockResolvedValue({
    success: true, provider: 'replicate', operation: 'video-avatar', responseType: 'video', message: 'accepted',
    predictionId: TASK, predictionStatus: 'processing',
    metadata: { provider: 'replicate', videoProvider: 'gemini-veo', operation: 'video-avatar', sessionId: 's1', promptHash: 'h' },
  });
});
afterEach(() => fetchSpy.mockRestore());

describe('chat video billing', () => {
  it('holds the price before Google is asked, then moves it to the poll ref once the job is accepted', async () => {
    const cost = billableCreditCost('video_generation');
    const res = await orchestrate(input());
    expect(res.predictionId).toBe(TASK);
    expect(deductCredits).toHaveBeenCalledTimes(2);
    const holdRef = (deductCredits as jest.Mock).mock.calls[0][2] as string;
    expect(holdRef).toMatch(/^chat:video_generation:user-7:s1:[0-9a-f-]{36}$/);
    expect(deductCredits).toHaveBeenNthCalledWith(1, 'user-7', cost, holdRef);
    expect(deductCredits).toHaveBeenNthCalledWith(2, 'user-7', cost, `poll:${TASK}`);
    // the hold is given back BEFORE the poll-ref charge, so one render's balance is enough
    expect(refundDebitByRef).toHaveBeenCalledWith('user-7', holdRef, cost);
    const holdOrder = (deductCredits as jest.Mock).mock.invocationCallOrder[0]!;
    const execOrder = sm.execute.mock.invocationCallOrder[0]!;
    const backOrder = (refundDebitByRef as jest.Mock).mock.invocationCallOrder[0]!;
    const pollChargeOrder = (deductCredits as jest.Mock).mock.invocationCallOrder[1]!;
    expect(holdOrder).toBeLessThan(execOrder);
    expect(backOrder).toBeLessThan(pollChargeOrder);
  });

  it('checks the balance and charges INSIDE the per-user dispatch lock, and always releases it', async () => {
    await orchestrate(input());
    const claimOrder = (claimIdempotencyKey as jest.Mock).mock.invocationCallOrder[0]!;
    const balanceOrder = (hasSufficientBalance as jest.Mock).mock.invocationCallOrder[0]!;
    const chargeOrder = (deductCredits as jest.Mock).mock.invocationCallOrder[0]!;
    const releaseOrder = (releaseIdempotencyKey as jest.Mock).mock.invocationCallOrder[0]!;
    expect(claimOrder).toBeLessThan(balanceOrder);
    expect(chargeOrder).toBeLessThan(releaseOrder);
    expect(claimIdempotencyKey).toHaveBeenCalledWith('user-7', 'chat-paid-dispatch', 90);
  });

  it('a user still holding the lock after the bounded wait gets "busy" — nothing is rendered or charged', async () => {
    jest.useFakeTimers();
    try {
      (claimIdempotencyKey as jest.Mock).mockResolvedValue(false);
      const pending = orchestrate(input());
      for (let i = 0; i < 13; i++) await jest.advanceTimersByTimeAsync(1_500);
      const res = await pending;
      expect(res.metadata.dispatchBusy).toBe(true);
      expect(sm.execute).not.toHaveBeenCalled();
      expect(deductCredits).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('without the balance: refused before any render, and the lock is released', async () => {
    (hasSufficientBalance as jest.Mock).mockResolvedValueOnce(false);
    const res = await orchestrate(input());
    expect(res.metadata.insufficientCredits).toBe(true);
    expect(sm.execute).not.toHaveBeenCalled();
    expect(releaseIdempotencyKey).toHaveBeenCalled();
  });

  it('a failed render is refunded on the poll path — exactly what the ledger took under its ref', async () => {
    sm.poll.mockResolvedValue({
      success: false, provider: 'replicate', operation: 'video-avatar', responseType: 'video', message: 'failed',
      predictionId: TASK, predictionStatus: 'failed', metadata: { provider: 'replicate', operation: 'video-avatar', sessionId: 's1', promptHash: 'h' },
    });
    await pollOrchestrationTask(TASK, 's1', 'user-7');
    expect(refundDebitByRef).toHaveBeenCalledWith('user-7', `poll:${TASK}`);
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it('a successful poll re-uses the acceptance ref (a no-op charge), and an anonymous poller is never refunded', async () => {
    sm.poll.mockResolvedValue({
      success: true, provider: 'replicate', operation: 'video-avatar', responseType: 'video', message: 'done',
      assetUrl: 'https://x.supabase.co/clip.mp4', assetType: 'video', predictionId: TASK, predictionStatus: 'succeeded',
      metadata: { provider: 'replicate', operation: 'video-avatar', sessionId: 's1', promptHash: 'h' },
    });
    await pollOrchestrationTask(TASK, 's1', 'user-7');
    expect(deductCredits).toHaveBeenCalledWith('user-7', billableCreditCost('video_generation'), `poll:${TASK}`);
    (deductCredits as jest.Mock).mockClear();
    sm.poll.mockResolvedValue({ success: false, predictionStatus: 'failed', responseType: 'video', operation: 'video-avatar', provider: 'replicate', message: 'x', metadata: { provider: 'replicate' } });
    await pollOrchestrationTask(TASK, 's1', 'anonymous');
    expect(refundDebitByRef).not.toHaveBeenCalled();
  });
});

describe('an asset is handed over only once its charge LANDED (it used to be `.catch(() => {})` and delivered anyway)', () => {
  const DONE = {
    success: true, provider: 'replicate', operation: 'video-avatar', responseType: 'video', message: 'done',
    assetUrl: 'https://x.supabase.co/clip.mp4', assetType: 'video', predictionId: TASK, predictionStatus: 'succeeded',
    metadata: { provider: 'replicate', operation: 'video-avatar', sessionId: 's1', promptHash: 'h' },
  };

  it.each([
    ['insufficient', 'insufficientCredits'],
    ['error', 'billingUnavailable'],
  ])('a %s hold renders nothing: Google is never asked (C6)', async (reason, flag) => {
    (deductCredits as jest.Mock).mockResolvedValueOnce({ ok: false, reason });
    const res = await orchestrate(input());
    expect(res.success).toBe(false);
    expect(sm.execute).not.toHaveBeenCalled();
    expect(refundDebitByRef).not.toHaveBeenCalled();
    expect(res.metadata[flag]).toBe(true);
    expect(releaseIdempotencyKey).toHaveBeenCalled();
  });

  it.each([
    ['insufficient', 'insufficientCredits'],
    ['error', 'billingUnavailable'],
  ])('a %s acceptance charge withholds the task handle (no predictionId to poll into a free clip)', async (reason, flag) => {
    (deductCredits as jest.Mock).mockResolvedValueOnce({ ok: true, balance: 100 }).mockResolvedValueOnce({ ok: false, reason });
    const res = await orchestrate(input());
    expect(res.success).toBe(false);
    expect(res.predictionId).toBeUndefined();
    expect(res.metadata[flag]).toBe(true);
    expect(releaseIdempotencyKey).toHaveBeenCalled(); // the per-user dispatch lock is still released
  });

  it('a poll whose charge does not land withholds the asset', async () => {
    sm.poll.mockResolvedValue(DONE);
    (deductCredits as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'insufficient' });
    const res = await pollOrchestrationTask(TASK, 's1', 'user-7');
    expect(res.assetUrl).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain('clip.mp4');
    expect(res.metadata.insufficientCredits).toBe(true);
  });

  it('no ledger RPC at all (skipped) still delivers — the documented degrade', async () => {
    sm.poll.mockResolvedValue(DONE);
    (deductCredits as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'skipped' });
    expect((await pollOrchestrationTask(TASK, 's1', 'user-7')).assetUrl).toBe('https://x.supabase.co/clip.mp4');
  });

  it('a synchronous image whose charge does not land is withheld, not handed out free', async () => {
    sm.execute.mockResolvedValueOnce({
      success: true, provider: 'nanobanana', operation: 'image', responseType: 'image', message: 'done',
      assetUrl: 'https://x.supabase.co/img.png', assetType: 'image', predictionStatus: 'succeeded',
      metadata: { provider: 'nanobanana', operation: 'image', sessionId: 's1', promptHash: 'h' },
    });
    (deductCredits as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'error' });
    const res = await orchestrate(input({ message: 'generate an image of a red fox in the snow' }));
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toContain('img.png');
    expect(res.metadata.billingUnavailable).toBe(true);
    expect(sm.execute).not.toHaveBeenCalled(); // C6: the charge is refused BEFORE the paid render, not after it
  });

  it('a synchronous image delivered now keeps its hold as the charge: one debit, nothing given back', async () => {
    sm.execute.mockResolvedValueOnce({
      success: true, provider: 'nanobanana', operation: 'image', responseType: 'image', message: 'done',
      assetUrl: 'https://x.supabase.co/img.png', assetType: 'image', predictionStatus: 'succeeded',
      metadata: { provider: 'nanobanana', operation: 'image', sessionId: 's1', promptHash: 'h' },
    });
    const res = await orchestrate(input({ message: 'generate an image of a red fox in the snow' }));
    expect(res.assetUrl).toBe('https://x.supabase.co/img.png');
    expect(deductCredits).toHaveBeenCalledTimes(1);
    expect((deductCredits as jest.Mock).mock.calls[0][2]).toMatch(/^chat:image_generation:user-7:s1:/);
    expect(refundDebitByRef).not.toHaveBeenCalled();
  });

  it('a render that fails or throws gives the hold back through the ledger', async () => {
    sm.execute.mockResolvedValueOnce({
      success: false, provider: 'nanobanana', operation: 'image', responseType: 'text', message: 'engine refused',
      metadata: { provider: 'nanobanana', operation: 'image', sessionId: 's1', promptHash: 'h' },
    });
    await orchestrate(input({ message: 'generate an image of a red fox in the snow' }));
    const holdRef = (deductCredits as jest.Mock).mock.calls[0][2] as string;
    expect(refundDebitByRef).toHaveBeenCalledWith('user-7', holdRef, billableCreditCost('image_generation'));

    jest.clearAllMocks();
    sm.execute.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(orchestrate(input({ message: 'generate an image of a red fox in the snow' }))).rejects.toThrow('socket hang up');
    expect(refundDebitByRef).toHaveBeenCalledTimes(1);
    expect(releaseIdempotencyKey).toHaveBeenCalled();
  });
});
