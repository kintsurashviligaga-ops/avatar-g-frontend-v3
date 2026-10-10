/** @jest-environment node */
/**
 * The two admin marketing renders (/api/video/generate-hero, /api/video/generate-promo) run on Replicate MiniMax. Video
 * renders on Veo only while VIDEO_GOOGLE_ONLY is on (the default), so they refuse before Replicate is constructed.
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

test.each([['hero', hero, 'generate-hero'], ['promo', promo, 'generate-promo']])('%s: VIDEO_GOOGLE_ONLY on (the default) → 503, Replicate never constructed', async (_n, POST, path) => {
  const res = await POST(req(path));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: 'google_only' });
  expect(Replicate).not.toHaveBeenCalled();
});

test('with the video switch off, the admin render reaches Replicate as before', async () => {
  process.env.VIDEO_GOOGLE_ONLY = '0';
  await hero(req('generate-hero'));
  expect(mockRun).toHaveBeenCalledTimes(1);
});
