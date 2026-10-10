/** @jest-environment node */
/**
 * ONE ENGINE PER AVATAR JOB (the owner, 2026-10-09: no silent fallback to another outside provider). With HeyGen
 * configured, a HeyGen miss is a miss — lipsyncCreate answers null (the route refunds) and never starts a Replicate
 * SadTalker render instead. SadTalker runs only when it IS the configured engine.
 */
jest.mock('server-only', () => ({}));
jest.mock('../server/feature-flags', () => ({ getFeatureFlag: jest.fn(async (_k: string, d: boolean) => d) }));
const fetchPublicBytes = jest.fn();
jest.mock('../web/publicFetch', () => ({ fetchPublicBytes: (...a: unknown[]) => fetchPublicBytes(...a) }));

import { lipsyncCreate } from './lipsync';

const realFetch = global.fetch;
const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  fetchPublicBytes.mockResolvedValue({ ok: true, bytes: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' });
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('heygen')) return new Response('{}', { status: 500 }); // HeyGen refuses the upload
    return new Response(JSON.stringify({ id: 'pred-1' }), { status: 201 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  delete process.env.HEYGEN_API_KEY;
  delete process.env.REPLICATE_API_TOKEN;
});

test('HeyGen configured and it misses → null, and no Replicate request is made', async () => {
  process.env.HEYGEN_API_KEY = 'hg';
  process.env.REPLICATE_API_TOKEN = 'r8';
  await expect(lipsyncCreate('https://x.supabase.co/face.jpg', 'https://x.supabase.co/a.mp3')).resolves.toBeNull();
  expect(calls.some((u) => u.includes('heygen'))).toBe(true);
  expect(calls.some((u) => u.includes('replicate'))).toBe(false);
});

test('no HeyGen key → SadTalker is the configured engine and runs', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8';
  await expect(lipsyncCreate('https://x.supabase.co/face.jpg', 'https://x.supabase.co/a.mp3')).resolves.toBe('pred-1');
  expect(calls.every((u) => !u.includes('heygen'))).toBe(true);
});
