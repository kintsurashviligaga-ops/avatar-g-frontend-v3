/** @jest-environment node */
/**
 * The two admin marketing renders (/api/video/generate-hero, /api/video/generate-promo) ran on Replicate MiniMax. Video
 * renders on Veo only, whatever VIDEO_GOOGLE_ONLY says (MASTER TASK v3.1), so they refuse and Replicate is never
 * constructed. The SDK stays mocked so any call to it is caught.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdmin: jest.fn(async () => true) }));
const mockRun = jest.fn(async () => 'https://replicate.delivery/v.mp4');
jest.mock('replicate', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ run: mockRun })) }));

import { NextRequest } from 'next/server';
import Replicate from 'replicate';
import { isAdmin } from '../../../../lib/auth/adminGuard';
import { POST as hero } from './route';
import { POST as promo } from '../generate-promo/route';

const ENV = { ...process.env };
const req = (path: string) => new NextRequest(`https://myavatar.ge/api/video/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageUrl: 'https://x.test/a.png', phase: 'intro' }),
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, REPLICATE_API_TOKEN: 'r8-test' };
  delete process.env.VIDEO_GOOGLE_ONLY;
});
afterAll(() => { process.env = ENV; });

test.each([['hero', hero, 'generate-hero'], ['promo', promo, 'generate-promo']])('%s: a non-admin is refused', async (_n, POST, path) => {
  (isAdmin as jest.Mock).mockResolvedValueOnce(false);
  expect((await POST(req(path))).status).toBe(403);
  expect(Replicate).not.toHaveBeenCalled();
});

test.each([['hero', hero, 'generate-hero'], ['promo', promo, 'generate-promo']])('%s: an admin → 503 google_only, Replicate never constructed', async (_n, POST, path) => {
  const res = await POST(req(path));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: 'google_only' });
  expect(Replicate).not.toHaveBeenCalled();
});

test.each([
  ['hero', hero, 'generate-hero', { VIDEO_GOOGLE_ONLY: '0' }],
  ['promo', promo, 'generate-promo', { VIDEO_GOOGLE_ONLY: 'off', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-minimax' }],
])('%s: no env value re-opens the Replicate render (%#)', async (_n, POST, path, env) => {
  Object.assign(process.env, env);
  const res = await POST(req(path));
  expect(res.status).toBe(503);
  expect(Replicate).not.toHaveBeenCalled();
  expect(mockRun).not.toHaveBeenCalled();
});
