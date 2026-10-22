/** @jest-environment node */
/**
 * Built-in avatars only (GG, 2026-10-22; MASTER TASK v3.1 PR 9): every entry point that made a custom avatar answers
 * 422 `capability_unavailable` (gap `custom_avatar`) after sign-in and before any write, reservation or provider call.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(),
  createRouteHandlerClient: jest.fn(),
  createServerClient: jest.fn(),
  requireUser: jest.fn(),
}));
jest.mock('../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { WRITE: {} } }));

import { NextRequest } from 'next/server';
import { authedClientFromRequest, createRouteHandlerClient, createServerClient, requireUser } from '../../../lib/supabase/server';
import { customAvatarBody } from '../../../lib/avatar/curated';
import { POST as generate } from './generate/route';
import { POST as create } from './create/route';
import { POST as produce } from '../orchestrator/avatar/produce/route';

const UID = '11111111-2222-4333-8444-555555555555';
const post = (path: string, body: unknown, cookie = 'NEXT_LOCALE=en') =>
  new NextRequest(`https://myavatar.ge${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });

const fetchSpy = jest.fn();
const realFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchSpy as unknown as typeof fetch;
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (createRouteHandlerClient as jest.Mock).mockReturnValue({ auth: { getUser: jest.fn(async () => ({ data: { user: { id: UID } }, error: null })) } });
  (requireUser as jest.Mock).mockResolvedValue({ id: UID });
});
afterAll(() => { global.fetch = realFetch; });

test.each([
  ['/api/avatar/generate (a prompt-drawn avatar)', '/api/avatar/generate', generate, { prompt: 'a knight in silver armour', stylePreset: 'anime' }],
  ['/api/avatar/create (a scan, photo set or selfie pack)', '/api/avatar/create', create, { avatar_goal: 'personal', avatar_type: 'scan', input_method: 'photo_set', output_options: { fullBody: true, background: 'studio', rigging: false } }],
  ['/api/orchestrator/avatar/produce (the HeyGen talking photo)', '/api/orchestrator/avatar/produce', produce, { script: 'Hello', photoBase64: 'AAAA', photoMimeType: 'image/jpeg' }],
] as const)('%s answers capability_unavailable before anything is written or called', async (_name, path, route, body) => {
  const res = await route(post(path, body));
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual(customAvatarBody('en'));
  expect(createServerClient).not.toHaveBeenCalled(); // no avatars / jobs / avatar_assets row
  expect(fetchSpy).not.toHaveBeenCalled(); // no /api/heygen/avatar, no provider
});

test('a visitor is still told to sign in first', async () => {
  (createRouteHandlerClient as jest.Mock).mockReturnValue({ auth: { getUser: jest.fn(async () => ({ data: { user: null }, error: null })) } });
  expect((await generate(post('/api/avatar/generate', {}))).status).toBe(401);
  (requireUser as jest.Mock).mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await create(post('/api/avatar/create', {}))).status).toBe(401);
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: null });
  expect((await produce(post('/api/orchestrator/avatar/produce', { script: 'Hello' }))).status).toBe(401);
});

test('the gap is said in the caller\'s language (Georgian by default)', async () => {
  const res = await generate(post('/api/avatar/generate', {}, ''));
  expect((await res.json()).message).toBe(customAvatarBody('ka').message);
});
