/** @jest-environment node */
/**
 * POST /api/replicate/generate — raw Replicate models by name.
 *
 * ⚠️ Replicate has no Google engine, so a new prediction AND a poll of an old one are refused with 503 google_only before
 * the guard, the charge or Replicate, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). Production has answered both
 * this way since the switch was turned on; no env value re-opens it now. The reserve-and-refund rules it used to pin went
 * with the code.
 * Every collaborator the route used to call is mocked so any call is caught — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/generationGuard', () => ({ guardGeneration: jest.fn() }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundDebitByRef: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { guardGeneration } from '../../../../lib/api/generationGuard';
import { createPrediction, pollPrediction } from '../../../../lib/replicate/client';
import { deductCredits, refundDebitByRef } from '../../../../lib/orchestrator/ledger';

const post = (body: unknown, locale?: string) => POST(new NextRequest('https://myavatar.ge/api/replicate/generate', {
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
    ['a new video', { service: 'video', prompt: 'waves crashing on a rocky shore at dusk' }],
    ['a poll of an old prediction', { predictionId: 'pred-9~rg1.e30.sig' }],
  ])('%s → 503 google_only before anything runs', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
    expect(guardGeneration).not.toHaveBeenCalled();
    expect(createPrediction).not.toHaveBeenCalled();
    expect(pollPrediction).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(refundDebitByRef).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post({ service: 'video', prompt: 'waves crashing on a rocky shore at dusk' }, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post({ service: 'video', prompt: 'waves crashing on a rocky shore at dusk' }, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
