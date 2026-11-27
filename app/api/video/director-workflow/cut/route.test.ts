/** @jest-environment node */
/**
 * POST /api/video/director-workflow/cut — the final cut. Pins: 404 while the flag is off; a quote is free; only our own
 * storage links are accepted; a scene with no clip, a changed music price or a missing Lyria are refused BEFORE any
 * debit; the cut itself is free; the music bed is debited once and refunded when the bed or the cut misses; the film is
 * filed in the Library under one stable id per project. No network: Lyria, the ledger, ffmpeg and the Library are mocked.
 */
jest.mock('server-only', () => ({}));
let mockUser: { id: string } | null = null;
jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../../lib/admin/guard', () => ({ isAdminUser: jest.fn(() => false) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: {} }));
jest.mock('../../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../../lib/orchestrator/idempotency', () => ({
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
}));
jest.mock('../../../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../../lib/orchestrator/jobs', () => ({ recordCompletedFilm: jest.fn(async () => true) }));
jest.mock('../../../../../lib/server/serviceSwitches', () => ({ serviceOffResponse: jest.fn(async () => null) }));
jest.mock('../../../../../lib/audio/lyriaBed', () => ({
  lyriaBedReady: jest.fn(() => true),
  lyriaBedPlan: jest.fn(() => ({ model: 'lyria-3-clip', sec: 30 })),
  composeLyriaBed: jest.fn(async () => 'https://own.supabase.co/storage/v1/object/sign/films/bed.mp3?token=t'),
}));
jest.mock('../../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (t: string) => `EN(${t})`) }));
jest.mock('../../../../../lib/video/directorsWorkflow/cut.server', () => ({ makeFinalCut: jest.fn() }));
jest.mock('../../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { composeLyriaBed, lyriaBedReady } from '../../../../../lib/audio/lyriaBed';
import { claimIdempotencyKey } from '../../../../../lib/orchestrator/idempotency';
import { recordCompletedFilm } from '../../../../../lib/orchestrator/jobs';
import { deductCredits, refundDebitByRef } from '../../../../../lib/orchestrator/ledger';
import { makeFinalCut } from '../../../../../lib/video/directorsWorkflow/cut.server';
import { emptyScene, musicBedCredits, type DwProject } from '../../../../../lib/video/directorsWorkflow';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const OWN = 'https://own.supabase.co';
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/video/director-workflow/cut', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const board = (): DwProject => ({
  id: 'dw_1', title: 'Café', logline: 'Two friends meet', aspect: '9:16', resolution: '720p', characters: [],
  scenes: [
    { ...emptyScene('s1'), order: 1, title: 'One', action: 'Nino walks into a cafe.', firstFrame: 'none' },
    { ...emptyScene('s2'), order: 2, title: 'Two', action: 'Nino sits at the window and waves.', firstFrame: 'previous' },
  ],
  status: 'approved', version: 3,
});
const clipsOf = () => [
  { sceneId: 's2', url: `${OWN}/storage/v1/object/sign/renders/s2.mp4?token=b` },
  { sceneId: 's1', url: `${OWN}/storage/v1/object/sign/renders/s1.mp4?token=a` },
];
const MUSIC_PRICE = musicBedCredits(30);

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-genjutsu-secret', DIRECTORS_WORKFLOW: 'everyone', NEXT_PUBLIC_SUPABASE_URL: OWN };
  mockUser = { id: UID };
  (makeFinalCut as jest.Mock).mockResolvedValue({ ok: true, url: `${OWN}/sign/film.mp4`, path: 'director/dw_1/film-v3-1.mp4', bytes: 9e6, seconds: 16, mode: 'copy' });
});
afterAll(() => { process.env = ENV; });

it('404 while the flag is off', async () => {
  process.env.DIRECTORS_WORKFLOW = '';
  expect((await POST(post({ project: board(), clips: clipsOf() }))).status).toBe(404);
  expect(makeFinalCut).not.toHaveBeenCalled();
});

it('a quote is free and says what the bed costs', async () => {
  const res = await POST(post({ project: board(), music: { prompt: 'soft piano' }, quote: true }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ musicCredits: MUSIC_PRICE, bedSeconds: 30, musicAvailable: true });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(makeFinalCut).not.toHaveBeenCalled();
});

it('only our own storage links are cut; a missing scene is refused before anything runs', async () => {
  const foreign = [{ sceneId: 's1', url: 'https://evil.example.com/a.mp4' }, clipsOf()[0]];
  expect((await POST(post({ project: board(), clips: foreign }))).status).toBe(400);
  const other = [{ sceneId: 's1', url: 'https://other-tenant.supabase.co/a.mp4' }, clipsOf()[0]];
  expect((await POST(post({ project: board(), clips: other }))).status).toBe(400);
  const res = await POST(post({ project: board(), clips: [clipsOf()[1]] }));
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ missing: ['s2'] });
  expect(makeFinalCut).not.toHaveBeenCalled();
});

it('a cut without music is free, in storyboard order, and filed under one id per project', async () => {
  const res = await POST(post({ project: board(), clips: clipsOf() }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true, libraryId: 'dwfilm_dw_1', savedToLibrary: true, musicCredits: 0, mode: 'copy' });
  expect(deductCredits).not.toHaveBeenCalled();
  const input = (makeFinalCut as jest.Mock).mock.calls[0][0];
  expect(input.urls).toEqual([clipsOf()[1].url, clipsOf()[0].url]);
  expect(input.music).toBeNull();
  expect((recordCompletedFilm as jest.Mock).mock.calls[0][0]).toMatchObject({ id: 'dwfilm_dw_1', userId: UID, subtype: 'director', orientation: 'vertical' });
});

it('music: a changed price or no Lyria is refused before any debit', async () => {
  expect((await POST(post({ project: board(), clips: clipsOf(), music: { prompt: 'piano' }, expectedCredits: MUSIC_PRICE + 1 }))).status).toBe(409);
  (lyriaBedReady as jest.Mock).mockReturnValueOnce(false);
  expect((await POST(post({ project: board(), clips: clipsOf(), music: { prompt: 'piano' }, expectedCredits: MUSIC_PRICE }))).status).toBe(503);
  expect(deductCredits).not.toHaveBeenCalled();
});

it('music: debited once, an instrumental bed in English, mixed into the cut', async () => {
  const res = await POST(post({ project: board(), clips: clipsOf(), music: { prompt: 'რბილი პიანინო' }, expectedCredits: MUSIC_PRICE }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ musicCredits: MUSIC_PRICE });
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect((deductCredits as jest.Mock).mock.calls[0][1]).toBe(MUSIC_PRICE);
  const ask = (composeLyriaBed as jest.Mock).mock.calls[0][0];
  expect(ask.prompt).toContain('EN(რბილი პიანინო)');
  expect(ask.prompt).toMatch(/No vocals/);
  expect(ask.instrumental).toBe(true);
  expect((makeFinalCut as jest.Mock).mock.calls[0][0].music).toEqual({ url: expect.stringContaining('bed.mp3'), durationSec: 30 });
  expect(refundDebitByRef).not.toHaveBeenCalled();
});

it('music: a Lyria miss or a cut miss is refunded', async () => {
  (composeLyriaBed as jest.Mock).mockResolvedValueOnce(null);
  let res = await POST(post({ project: board(), clips: clipsOf(), music: { prompt: 'piano' }, expectedCredits: MUSIC_PRICE }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ refunded: true });
  expect(makeFinalCut).not.toHaveBeenCalled();
  expect(refundDebitByRef).toHaveBeenCalledTimes(1);

  (makeFinalCut as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'clip_2_unavailable' });
  res = await POST(post({ project: board(), clips: clipsOf(), music: { prompt: 'piano' }, expectedCredits: MUSIC_PRICE }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ reason: 'clip_2_unavailable', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledTimes(2);
  expect(recordCompletedFilm).not.toHaveBeenCalled();
});

it('a cut already running for this project is refused', async () => {
  (claimIdempotencyKey as jest.Mock).mockResolvedValueOnce(false);
  expect((await POST(post({ project: board(), clips: clipsOf() }))).status).toBe(409);
  expect((claimIdempotencyKey as jest.Mock).mock.calls[0][1]).toBe('dw-cut:dw_1');
  expect(makeFinalCut).not.toHaveBeenCalled();
});
