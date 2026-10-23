/** @jest-environment node */
/**
 * POST /api/ai/upscale — an image upscale (Real-ESRGAN on Replicate).
 *
 * ⚠️ It has no Google engine, so every request is refused with 503 google_only before the session, the limits, Replicate
 * or storage, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). The sign-in gate and the per-account ceiling it used
 * to pin went with the code.
 * Every collaborator the route used to call is mocked so any call is caught — no network, no spend. The Replicate client
 * itself is gone (PR 20), so the network spy is what would catch a call to it.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(), checkRateLimitByKey: jest.fn() }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey } from '../../../../lib/api/rate-limit';
import { uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';
import { recordCompletedAsset } from '../../../../lib/orchestrator/jobs';

const post = (body: unknown, locale?: string) => POST(new NextRequest('https://myavatar.ge/api/ai/upscale', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
  body: JSON.stringify(body),
}));
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
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-replicate' },
])('env %p', (env) => {
  beforeEach(() => { Object.assign(process.env, env); });

  test.each([
    ['an upscale', { imageUrl: 'https://cdn.example.com/photo.png', scale: 2 }],
    ['a malformed request', {}],
  ])('%s → 503 google_only before anything runs', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
    expect(authedClientFromRequest).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(checkRateLimitByKey).not.toHaveBeenCalled();
    expect(uploadAndSign).not.toHaveBeenCalled();
    expect(recordCompletedAsset).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post({ imageUrl: 'https://cdn.example.com/photo.png', scale: 2 }, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post({ imageUrl: 'https://cdn.example.com/photo.png', scale: 2 }, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
