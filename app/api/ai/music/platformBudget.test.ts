/** @jest-environment node */
/**
 * POST /api/ai/music — the PLATFORM's AI limit is asked before any credit is taken, and its refusal says which limit.
 *
 * ⚠️ 2026-10-16: with the site's daily AI limit spent, the music route reserved the person's credits, Lyria's own gate
 * then refused, and the person read a generic "service unavailable" — no word of the limit or of when it lifts.
 * Every provider, the ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })),
}));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ response: null, auth: null, budgetRemaining: null })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/replicate', () => ({ generateMusicCover: jest.fn(), generateVoiceSong: jest.fn(), generateMusic: jest.fn() }));
jest.mock('../../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../../lib/ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn(() => true), generateLyriaTrack: jest.fn() }));
jest.mock('../../../../lib/chat/mediaKeys', () => ({ hasUdioApiKey: jest.fn(() => true) }));
jest.mock('../../../../lib/audio/trimAudio', () => ({ trimAudioToDuration: jest.fn() }));
jest.mock('../../../../lib/audio/transcode', () => ({ transcodeVoiceToMp3: jest.fn() }));
jest.mock('../../../../lib/audio/rvc', () => ({ convertSongWithRvc: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ getUserVoiceModel: jest.fn(async () => null), DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(), createSignedAssetUrl: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/providers/latencyFailover', () => ({ runWithLatencyFailover: jest.fn() }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  isProviderTripped: jest.fn(() => false),
  recordProviderResult: jest.fn(),
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
  hashPayload: jest.fn(async () => 'hash'),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  debitExistsForRef: jest.fn(async () => false),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/credits/musicSettlement', () => ({ settleMusicCharge: jest.fn() }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({
  // The render's first awaited step. Throwing here is a provider failure right after the reserve.
  promptToEnglish: jest.fn(async () => {
    throw new Error('Replicate API 402: {"title":"Insufficient credit","detail":"Go to https://replicate.com/account/billing"}');
  }),
  lastTranslateOutcome: jest.fn(() => 'ok'),
}));
jest.mock('../../../../lib/audio/trackDuration', () => ({ probeTrackDurationSec: jest.fn() }));

const mockBudget = jest.fn();
jest.mock('../../../../lib/services/billing/budgetCheck', () => ({ platformBudgetRefusal: (...a: unknown[]) => mockBudget(...a) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { promptToEnglish } from '../../../../lib/ai/promptToEnglish';
import { deductCredits, debitExistsForRef } from '../../../../lib/orchestrator/ledger';
import { claimIdempotencyKey } from '../../../../lib/orchestrator/idempotency';
import { budgetRefusalMessage } from '../../../../lib/services/billing/budgetMessage';

const post = (body: unknown, locale?: string) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  });
const BODY = { prompt: 'მშვიდი ფორტეპიანო წვიმიან საღამოს', style: 'ambient', durationSec: 30, jobId: 'job-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockBudget.mockResolvedValue(null);
  (debitExistsForRef as jest.Mock).mockResolvedValue(false);
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('a spent daily limit refuses with 503 platform_budget before any charge, claim or render', async () => {
  mockBudget.mockResolvedValue('daily_limit');
  const res = await POST(post(BODY));
  expect(res.status).toBe(503);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, code: 'platform_budget', budgetReason: 'daily_limit', url: null });
  expect(j.message).toBe(budgetRefusalMessage('ka', 'daily_limit'));
  expect(j.message).toContain('04:00');
  expect(deductCredits).not.toHaveBeenCalled();
  expect(claimIdempotencyKey).not.toHaveBeenCalled();
  expect(promptToEnglish).not.toHaveBeenCalled();
  expect(mockBudget).toHaveBeenCalledWith({ service: 'music', model: 'lyria-3', units: 1 });
});

test('the refusal follows the caller’s language and names the monthly limit as monthly', async () => {
  mockBudget.mockResolvedValue('monthly_limit');
  const j = await (await POST(post(BODY, 'en'))).json();
  expect(j.message).toBe(budgetRefusalMessage('en', 'monthly_limit'));
});

test('with budget left the track goes on to the charge exactly as before', async () => {
  await POST(post(BODY));
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect(promptToEnglish).toHaveBeenCalled();
});
