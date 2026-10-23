/** @jest-environment node */
/**
 * GET /api/admin/reliability — the admin reliability snapshot reports Google engines only (MASTER TASK v3.1).
 * It also named the Runway model (RUNWAY_MODEL), an engine no route runs; that line is gone, whatever the env says.
 * The job and money tables are not reached here: the service-role client throws, and the route fails open to zeros.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
  createServiceRoleClient: () => { throw new Error('no database in this test'); },
}));
let mockAdmin = true;
jest.mock('../../../../lib/admin/guard', () => ({
  assertAdminAccess: jest.fn(async () => (mockAdmin ? { ok: true } : { ok: false, reason: 'forbidden' })),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const ENV = { ...process.env };
const get = () => GET(new NextRequest('https://myavatar.ge/api/admin/reliability?days=7'));

beforeEach(() => {
  process.env = { ...ENV };
  mockAdmin = true;
});
afterAll(() => { process.env = ENV; });

test('not an admin → refused, nothing reported', async () => {
  mockAdmin = false;
  const res = await get();
  expect(res.status).toBe(403);
  expect(await res.json()).not.toHaveProperty('providers');
});

test('no outside engine is reported, even with its key and model set', async () => {
  Object.assign(process.env, { RUNWAY_API_KEY: 'k', RUNWAY_MODEL: 'gen4_turbo', HEYGEN_API_KEY: 'k', REPLICATE_API_TOKEN: 'k' });
  const res = await get();
  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.ok).toBe(true);
  expect(body).not.toHaveProperty('runwayModel');
  expect(Object.keys(body.providers as object).sort()).toEqual(['gemini', 'lyria_music', 'stripe_bog', 'supabase', 'vertex_veo']);
  expect(String(body.videoModel)).toMatch(/Vertex AI/);
  expect(JSON.stringify(body)).not.toMatch(/runway|gen4|heygen|replicate/i);
});
