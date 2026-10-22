/** @jest-environment node */
/**
 * POST /api/replicate/image — raw image renders on NanoBanana or Replicate.
 *
 * ⚠️ Neither is a Google engine, so a new render AND a poll of an old one are refused with 503 google_only before the
 * guards, the charge or any provider, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). Images are made by the Image
 * tool on Google's image model. The charge-before-delivery rules it used to pin went with the code.
 * Every collaborator the route used to call is mocked so any call is caught — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn() }));
jest.mock('../../../../lib/api/generationGuard', () => ({ guardGeneration: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateNanoBananaImage } from '../../../../lib/nanobanana/client';
import { createPrediction, pollPrediction } from '../../../../lib/replicate/client';
import { applyApiGuards } from '../../../../lib/api/guard';
import { guardGeneration } from '../../../../lib/api/generationGuard';
import { deductCredits } from '../../../../lib/orchestrator/ledger';

const post = (body: unknown, locale?: string) => POST(new NextRequest('https://myavatar.ge/api/replicate/image', {
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
    ['a new image', { prompt: 'a lighthouse at dusk', provider: 'replicate' }],
    ['a poll of an old prediction', { predictionId: 'pred-1' }],
  ])('%s → 503 google_only before anything runs', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
    expect(generateNanoBananaImage).not.toHaveBeenCalled();
    expect(createPrediction).not.toHaveBeenCalled();
    expect(pollPrediction).not.toHaveBeenCalled();
    expect(applyApiGuards).not.toHaveBeenCalled();
    expect(guardGeneration).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post({ prompt: 'a lighthouse at dusk', provider: 'replicate' }, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post({ prompt: 'a lighthouse at dusk', provider: 'replicate' }, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
