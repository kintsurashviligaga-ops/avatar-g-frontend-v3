/** @jest-environment node */
/**
 * POST /api/v2/dubbing/start — refused (MASTER TASK v3.1 PR 5e). The dub ran on ElevenLabs Scribe and ElevenLabs' timed
 * TTS; neither has a Google engine here. Every request answers 503 google_only before the session, the quote, ffmpeg,
 * the ledger or the pipeline, whatever the owner's price approval says. All of them are mocked so any call is caught.
 */
jest.mock('server-only', () => ({}));

const getUser = jest.fn(async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }));
jest.mock('../../../../../lib/supabase/server', () => ({ createSupabaseServerClient: () => ({ auth: { getUser } }) }));
jest.mock('../../../../../lib/services/dubbing/dubbingPipeline', () => ({ runDubbing: jest.fn() }));
jest.mock('../../../../../lib/services/dubbing/dubbingFfmpeg', () => ({ extractAudioTrack: jest.fn() }));
jest.mock('../../../../../lib/orchestrator/confirmedJob', () => ({ startConfirmedJob: jest.fn(), persistCompletion: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { runDubbing } from '../../../../../lib/services/dubbing/dubbingPipeline';
import { extractAudioTrack } from '../../../../../lib/services/dubbing/dubbingFfmpeg';
import { startConfirmedJob } from '../../../../../lib/orchestrator/confirmedJob';

const post = (body: unknown, locale?: string) =>
  POST(new NextRequest('https://myavatar.ge/api/v2/dubbing/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  }));
const SOURCE = { sourceVideoUrl: 'https://example.com/clip.mp4', targetLanguage: 'ka' };
const ENV = { ...process.env };

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

describe.each([
  {},
  { OWNER_APPROVED_PRICING: 'dubbing:10', ELEVENLABS_API_KEY: 'el-test-key' },
])('env %p', (env) => {
  beforeEach(() => { Object.assign(process.env, env); });

  test.each([
    ['a quote request', SOURCE],
    ['a confirm', { ...SOURCE, quoteToken: 'q.token', confirm: true }],
  ])('%s → 503 google_only before anything runs', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
    expect(getUser).not.toHaveBeenCalled();
    expect(extractAudioTrack).not.toHaveBeenCalled();
    expect(startConfirmedJob).not.toHaveBeenCalled();
    expect(runDubbing).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post(SOURCE, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post(SOURCE, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
