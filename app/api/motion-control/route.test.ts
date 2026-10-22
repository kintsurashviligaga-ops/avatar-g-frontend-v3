/** @jest-environment node */
/**
 * POST /api/motion-control — Motion transfer (Kling Motion Control).
 *
 * ⚠️ Kling has no Google engine, so every new motion transfer is refused with 503 google_only before the session, the
 * limit, the charge, storage or Kling, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). /api/motion-control/status
 * stays open and keeps its own tests, so a transfer started before the change still finishes and a failed one is still
 * refunded. The reserve-before-submit rules it used to pin went with the code.
 * Every collaborator the route used to call is mocked so any call is caught — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('../../../lib/ai/klingClient', () => ({ klingSubmit: jest.fn() }));
jest.mock('../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundDebitByRef: jest.fn() }));
jest.mock('../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn() }));
jest.mock('../../../lib/orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn(), createSignedAssetUrl: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../lib/supabase/server';
import { checkRateLimit } from '../../../lib/api/rate-limit';
import { klingSubmit } from '../../../lib/ai/klingClient';
import { deductCredits, refundDebitByRef } from '../../../lib/orchestrator/ledger';
import { createJob } from '../../../lib/orchestrator/jobs';
import { uploadBufferAndSign, createSignedAssetUrl } from '../../../lib/orchestrator/storage-adapter';

const post = (body: unknown, locale?: string) => POST(new NextRequest('https://myavatar.ge/api/motion-control', {
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
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-kling' },
])('env %p', (env) => {
  beforeEach(() => { Object.assign(process.env, env); });

  test.each([
    ['a motion transfer', { characterImageUrl: 'data:image/png;base64,AAAA', motionPrompt: 'dancing', duration: 5, aspectRatio: '9:16' }],
    ['another account upload path', { characterImageUrl: 'someone-else/face.png', motionPrompt: 'dancing' }],
  ])('%s → 503 google_only before anything runs', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
    expect(authedClientFromRequest).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(klingSubmit).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(refundDebitByRef).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(uploadBufferAndSign).not.toHaveBeenCalled();
    expect(createSignedAssetUrl).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post({ characterImageUrl: 'data:image/png;base64,AAAA', motionPrompt: 'dancing', duration: 5, aspectRatio: '9:16' }, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post({ characterImageUrl: 'data:image/png;base64,AAAA', motionPrompt: 'dancing', duration: 5, aspectRatio: '9:16' }, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
