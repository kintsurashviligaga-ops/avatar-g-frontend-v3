/** @jest-environment node */
/**
 * POST /api/elevenlabs/sound — refused (MASTER TASK v3.1 PR 5e): it ran on ElevenLabs only, which has no Google engine here. Every
 * request answers 503 google_only before the session, the limit or any provider call. Global fetch rejects, so a call
 * to ElevenLabs put back would fail the test — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/supabase/auth', () => ({ requireAuthenticatedUser: jest.fn(async () => ({ id: 'user-1' })) }));

import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { requireAuthenticatedUser } from '../../../../lib/supabase/auth';
import { POST } from './route';

const post = (body: unknown, locale?: string) =>
  POST(new NextRequest('https://myavatar.ge/api/elevenlabs/sound', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  }));
const BODY = { prompt: 'rain on a tin roof', duration: 6 };
const ENV = { ...process.env };

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.ELEVENLABS_API_KEY = 'el-test-key';
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('a valid request → 503 google_only, and nothing runs', async () => {
  const res = await post(BODY);
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
  expect(authedClientFromRequest).not.toHaveBeenCalled();
  expect(requireAuthenticatedUser).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post(BODY, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post(BODY, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
