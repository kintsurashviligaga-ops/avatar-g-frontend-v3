/** @jest-environment node */
/**
 * POST /api/ai/music — the length picks the Lyria model (owner, GG 2026-10-18): up to 30 s Lyria 3 Clip, 60 s / 90 s /
 * Full song Lyria 3 Pro, steered to its length by the prompt (neither model takes a length). Pro is offered only once
 * verified (MUSIC_LYRIA_PRO_VERIFIED + MUSIC_LYRIA_PRO_SECONDS); until then a longer length is refused before any charge
 * instead of coming back as a ~30 s clip. One model per request, no failover between them. Prices unchanged.
 *
 * Runs the real latencyFailover; every provider, the ledger, storage and the idempotency store are mocked.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ response: null, auth: null, budgetRemaining: null })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/elevenlabs/music', () => ({ composeElevenLabsMusic: jest.fn(), hasElevenLabsMusicKey: jest.fn(() => true) }));
jest.mock('../../../../lib/ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn(() => true), generateLyriaTrack: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ getUserVoiceModel: jest.fn(async () => null), DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://storage.example/signed.mp3'), createSignedAssetUrl: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  isProviderTripped: jest.fn(async () => false),
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
jest.mock('../../../../lib/ai/promptToEnglish', () => ({
  promptToEnglish: jest.fn(async (p: string) => p),
  lastTranslateOutcome: jest.fn(() => 'ok'),
}));
jest.mock('../../../../lib/audio/trackDuration', () => ({ probeTrackDurationSec: jest.fn() }));
jest.mock('../../../../lib/services/billing/budgetCheck', () => ({ platformBudgetRefusal: jest.fn(async () => null) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { composeElevenLabsMusic } from '../../../../lib/elevenlabs/music';
import { generateLyriaTrack } from '../../../../lib/ai/lyriaMusic';
import { isProviderTripped } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { platformBudgetRefusal } from '../../../../lib/services/billing/budgetCheck';
import { creditCostFor } from '../../../../lib/credits/pricing';
import { LYRIA_PRO_MODEL } from '../../../../lib/studio/musicEngines';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/music', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const BODY = { prompt: 'a summer night by the sea', styles: ['georgian folk', 'jazz'], tempo: 'medium', instrumental: true, vocalGender: 'auto' };
const ENV = { ...process.env };
const lyriaCall = () => (generateLyriaTrack as jest.Mock).mock.calls[0][0] as { prompt: string; model?: string };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, MUSIC_LYRIA_PRO_VERIFIED: '1', MUSIC_LYRIA_PRO_SECONDS: '180' };
  (generateLyriaTrack as jest.Mock).mockResolvedValue({ base64: 'AAAA', mime: 'audio/mpeg' });
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

test('30 s is Lyria 3 Clip: no model named (the deployment default), no length direction, the clip breaker', async () => {
  const json = await (await POST(post({ ...BODY, durationSec: 30 }))).json();
  expect(json).toMatchObject({ success: true, engine: 'Lyria' });
  expect(lyriaCall().model).toBeUndefined();
  expect(lyriaCall().prompt).not.toMatch(/seconds long|3 minutes/);
  expect(isProviderTripped).toHaveBeenCalledWith('lyria');
  expect((deductCredits as jest.Mock).mock.calls[0][1]).toBe(creditCostFor('music', { seconds: 30 }));
});

test('60 s is Lyria 3 Pro, steered to 60 s; billed at the 60 s tier; never ElevenLabs', async () => {
  const json = await (await POST(post({ ...BODY, durationSec: 60 }))).json();
  expect(json).toMatchObject({ success: true, engine: 'Lyria 3 Pro' });
  expect(generateLyriaTrack).toHaveBeenCalledTimes(1);
  expect(lyriaCall().model).toBe(LYRIA_PRO_MODEL);
  expect(lyriaCall().prompt).toMatch(/^About 60 seconds long/);
  expect(isProviderTripped).toHaveBeenCalledWith('lyria-pro');
  expect(platformBudgetRefusal).toHaveBeenCalledWith({ service: 'music', model: LYRIA_PRO_MODEL, units: 1 });
  expect((deductCredits as jest.Mock).mock.calls[0][1]).toBe(creditCostFor('music', { seconds: 60 }));
  expect(composeElevenLabsMusic).not.toHaveBeenCalled();
});

test('Full song is Lyria 3 Pro, steered to a complete ~3-minute song — still billed at the 90 s tier', async () => {
  const json = await (await POST(post({ ...BODY, durationSec: 0 }))).json();
  expect(json).toMatchObject({ success: true, engine: 'Lyria 3 Pro' });
  expect(lyriaCall().model).toBe(LYRIA_PRO_MODEL);
  expect(lyriaCall().prompt).toMatch(/^A complete full-length song of about 3 minutes/);
  expect((deductCredits as jest.Mock).mock.calls[0][1]).toBe(creditCostFor('music', { seconds: 90 }));
  expect(composeElevenLabsMusic).not.toHaveBeenCalled();
});

test('genre / style handling is the same brief on both models: only the length direction is added', async () => {
  await POST(post({ ...BODY, durationSec: 30 }));
  const clip = lyriaCall().prompt;
  (generateLyriaTrack as jest.Mock).mockClear();
  await POST(post({ ...BODY, durationSec: 90 }));
  expect(lyriaCall().prompt).toBe(`About 90 seconds long, with a complete structure and a real ending. ${clip}`);
  expect(clip).toContain('georgian folk, jazz');
});

test('a Pro miss is the explicit, refunded failure — the clip is not tried behind it', async () => {
  (generateLyriaTrack as jest.Mock).mockResolvedValue(null);
  const res = await POST(post({ ...BODY, durationSec: 90 }));
  expect(res.status).toBe(502);
  expect(await res.json()).toMatchObject({ success: false, refunded: true });
  expect(generateLyriaTrack).toHaveBeenCalledTimes(1);
  expect(refundCredits).toHaveBeenCalledTimes(1);
});

describe('Pro not verified', () => {
  test.each([
    ['gate off', {}, [60, 90, 0]],
    ['verified at 60 s only', { MUSIC_LYRIA_PRO_SECONDS: '60' }, [90, 0]],
  ])('%s: the longer lengths are refused before any charge, never composed as ~30 s', async (_l, env, refused) => {
    delete process.env.MUSIC_LYRIA_PRO_VERIFIED;
    delete process.env.MUSIC_LYRIA_PRO_SECONDS;
    if (Object.keys(env).length) Object.assign(process.env, { MUSIC_LYRIA_PRO_VERIFIED: '1' }, env);
    for (const durationSec of refused) {
      const res = await POST(post({ ...BODY, durationSec }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ success: false, code: 'unsupported' });
    }
    expect(deductCredits).not.toHaveBeenCalled();
    expect(generateLyriaTrack).not.toHaveBeenCalled();
    // 30 s still works.
    expect(await (await POST(post({ ...BODY, durationSec: 30 }))).json()).toMatchObject({ success: true, engine: 'Lyria' });
  });
});
