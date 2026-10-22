/** @jest-environment node */
/**
 * POST /api/udio/generate — retired (Music Studio v1, Phase 2): Udio is outside the approved music provider boundary.
 * Every request gets the 503 google_only refusal before any charge or provider call, in the caller's language, whatever
 * MEDIA_GOOGLE_ONLY or OUTSIDE_ENGINES_APPROVED say (MASTER TASK v3.1). Nothing is mocked to succeed.
 */
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const post = (cookie = '') => POST(new NextRequest('https://myavatar.ge/api/udio/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify({ prompt: 'a song' }),
}));

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

test('refused as google_only (Georgian by default), whatever keys exist', async () => {
  process.env.UDIO_API_KEY = 'k';
  const res = await post();
  expect(res.status).toBe(503);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, code: 'google_only', url: null });
  expect(j.message).toMatch(/თანხა არ ჩამოგეჭრა/);
});

test('English and Russian callers get their own language', async () => {
  expect((await (await post('NEXT_LOCALE=en')).json()).message).toMatch(/not charged/);
  expect((await (await post('NEXT_LOCALE=ru')).json()).message).toMatch(/Списания не было/);
});

test.each([
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-udio' },
])('no env value re-opens Udio (%o)', async (env) => {
  Object.assign(process.env, env, { UDIO_API_KEY: 'k' });
  const res = await post();
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ code: 'google_only' });
});
