/** @jest-environment node */
/**
 * POST /api/ai/music — a SUNG song is Lyria vocals, offered only once verified on this project
 * (MUSIC_LYRIA_VOCALS_VERIFIED, the same gate Music Studio's matrix and the film beds read, lib/music/studio/capabilities).
 * Until then a sung request is refused before the platform budget, the ledger or Lyria is asked, and no instrumental is
 * composed in its place (R7, no silent substitution). Instrumentals are unaffected.
 *
 * Runs the real latencyFailover; every provider, the ledger, storage and the idempotency store are mocked.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ response: null, auth: null, budgetRemaining: null })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
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
import { generateLyriaTrack } from '../../../../lib/ai/lyriaMusic';
import { deductCredits } from '../../../../lib/orchestrator/ledger';
import { platformBudgetRefusal } from '../../../../lib/services/billing/budgetCheck';

const post = (body: unknown, locale?: string) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  });

const SONG = { prompt: 'a summer night by the sea', styles: ['georgian folk'], tempo: 'medium', durationSec: 30, instrumental: false, vocalGender: 'female' };
const ENV = { ...process.env };
const lyriaCall = () => (generateLyriaTrack as jest.Mock).mock.calls[0][0] as { instrumental: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.MUSIC_LYRIA_VOCALS_VERIFIED;
  (generateLyriaTrack as jest.Mock).mockResolvedValue({ base64: 'AAAA', mime: 'audio/mpeg' });
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

describe('vocals not verified', () => {
  test('a sung song is refused before the budget, the ledger or Lyria: 400 unsupported, in Georgian by default', async () => {
    const res = await POST(post(SONG));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ success: false, code: 'unsupported', url: null });
    expect(json.message).toBe('ნამღერი სიმღერა ჯერ მიუწვდომელია: აირჩიე ინსტრუმენტალი. თანხა არ ჩამოგეჭრა.');
    expect(platformBudgetRefusal).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(generateLyriaTrack).not.toHaveBeenCalled();
  });

  test.each([
    ['en', 'Sung songs are not available yet: choose an instrumental. You were not charged.'],
    ['ru', 'Песни с вокалом пока недоступны: выберите инструментал. Списания не было.'],
  ])('the refusal speaks the visitor\'s language (%s)', async (locale, message) => {
    expect(await (await POST(post(SONG, locale))).json()).toMatchObject({ code: 'unsupported', message });
  });

  test('the flag set to anything but a truthy value is still off', async () => {
    process.env.MUSIC_LYRIA_VOCALS_VERIFIED = '0';
    expect((await POST(post(SONG))).status).toBe(400);
    expect(generateLyriaTrack).not.toHaveBeenCalled();
  });

  test('an instrumental still composes and bills as before', async () => {
    const json = await (await POST(post({ ...SONG, instrumental: true }))).json();
    expect(json).toMatchObject({ success: true, engine: 'Lyria' });
    expect(lyriaCall().instrumental).toBe(true);
    expect(deductCredits).toHaveBeenCalledTimes(1);
  });

  test('a body that names no `instrumental` is the route default, an instrumental: not refused', async () => {
    const { instrumental: _omit, ...body } = SONG;
    expect(await (await POST(post(body))).json()).toMatchObject({ success: true, engine: 'Lyria' });
    expect(lyriaCall().instrumental).toBe(true);
  });
});

test('vocals verified: the sung song is composed as a song, never an instrumental', async () => {
  process.env.MUSIC_LYRIA_VOCALS_VERIFIED = '1';
  const json = await (await POST(post(SONG))).json();
  expect(json).toMatchObject({ success: true, engine: 'Lyria' });
  expect(generateLyriaTrack).toHaveBeenCalledTimes(1);
  expect(lyriaCall().instrumental).toBe(false);
  expect(deductCredits).toHaveBeenCalledTimes(1);
});
