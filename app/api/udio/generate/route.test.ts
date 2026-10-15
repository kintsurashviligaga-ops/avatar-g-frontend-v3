/** @jest-environment node */
/**
 * POST /api/udio/generate — retired (Music Studio v1, Phase 2): Udio is outside the approved music provider boundary.
 * Every request is refused before any charge or provider call, in the caller's language. Nothing is mocked to succeed.
 */
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const post = (cookie = '') => POST(new NextRequest('https://myavatar.ge/api/udio/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify({ prompt: 'a song' }),
}));

afterEach(() => { delete process.env.MEDIA_GOOGLE_ONLY; });

test('refused as unsupported (Georgian by default), whatever keys exist', async () => {
  process.env.UDIO_API_KEY = 'k';
  const res = await post();
  expect(res.status).toBe(400);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, code: 'unsupported', url: null });
  expect(j.message).toMatch(/თანხა არ ჩამოგეჭრა/);
});

test('English and Russian callers get their own language', async () => {
  expect((await (await post('NEXT_LOCALE=en')).json()).message).toMatch(/not charged/);
  expect((await (await post('NEXT_LOCALE=ru')).json()).message).toMatch(/Списания не было/);
});

test('MEDIA_GOOGLE_ONLY on keeps its own paused-tool answer', async () => {
  process.env.MEDIA_GOOGLE_ONLY = '1';
  const res = await post();
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ code: 'google_only' });
});
