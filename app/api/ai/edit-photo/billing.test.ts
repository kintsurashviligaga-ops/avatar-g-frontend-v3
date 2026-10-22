/** @jest-environment node */
/**
 * POST /api/ai/edit-photo — the photo editor (background removal and the like, on Replicate).
 *
 * ⚠️ It has no Google engine, so every request is refused with 503 google_only before the guard, the limit, the charge,
 * storage or Replicate, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). The fail-closed charge it used to pin went
 * with the code.
 * Every collaborator the route used to call is mocked so any call is caught — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/generationGuard', () => ({ guardGeneration: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn() }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollUntilDone: jest.fn() }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ createSignedAssetUrl: jest.fn(), uploadAndSign: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { guardGeneration } from '../../../../lib/api/generationGuard';
import { checkRateLimit } from '../../../../lib/api/rate-limit';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { createPrediction, pollUntilDone } from '../../../../lib/replicate/client';
import { createSignedAssetUrl, uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';

const post = (body: unknown, locale?: string) => POST(new NextRequest('https://myavatar.ge/api/ai/edit-photo', {
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
    ['a background removal', { action: 'remove_bg', mediaUrl: 'user-1/photo.png' }],
  ])('%s → 503 google_only before anything runs', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
    expect(guardGeneration).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    expect(createPrediction).not.toHaveBeenCalled();
    expect(pollUntilDone).not.toHaveBeenCalled();
    expect(createSignedAssetUrl).not.toHaveBeenCalled();
    expect(uploadAndSign).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post({ action: 'remove_bg', mediaUrl: 'user-1/photo.png' }, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post({ action: 'remove_bg', mediaUrl: 'user-1/photo.png' }, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
