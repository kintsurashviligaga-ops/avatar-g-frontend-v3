/** @jest-environment node */
/**
 * POST /api/ltx-video — a raw LTX render.
 *
 * ⚠️ LTX has no Google engine, so every request is refused with 503 google_only before the limit, the guard, the charge
 * or LTX itself, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). Video is made in the studio on Veo. The
 * reserve-before-render rules it used to pin went with the code.
 * Every collaborator the route used to call is mocked so any call is caught — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('../../../lib/api/generationGuard', () => ({ guardGeneration: jest.fn() }));
jest.mock('../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { checkRateLimit } from '../../../lib/api/rate-limit';
import { guardGeneration } from '../../../lib/api/generationGuard';
import { deductCredits, refundCredits } from '../../../lib/orchestrator/ledger';

const post = (body: unknown, locale?: string) => POST(new NextRequest('https://myavatar.ge/api/ltx-video', {
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
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-ltx' },
])('env %p', (env) => {
  beforeEach(() => { Object.assign(process.env, env); });

  test.each([
    ['a render', { prompt: 'a lighthouse at dusk' }],
  ])('%s → 503 google_only before anything runs', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(guardGeneration).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post({ prompt: 'a lighthouse at dusk' }, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post({ prompt: 'a lighthouse at dusk' }, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
