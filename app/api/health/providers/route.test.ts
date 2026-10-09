/** @jest-environment node */
/**
 * GET /api/health/providers — the admin diagnostic names the engines the code runs, not the pre-Google-only ones.
 *
 * Before (2026-10-09): `pipeline` always said the film anchor was "FLUX 1.1 Pro" and the clip model Kling
 * (REPLICATE_VIDEO_MODEL), though under VIDEO_GOOGLE_ONLY (on by default) clips are Veo alone and the frames are
 * Gemini's image model — the FLUX anchor and Kling run only with Google-only switched off.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
}));
let mockAdmin = true;
jest.mock('../../../../lib/admin/guard', () => ({
  assertAdminAccess: jest.fn(async () => (mockAdmin ? { ok: true } : { ok: false, reason: 'forbidden' })),
}));
let mockVeo: 'vertex' | 'gemini' | null = 'vertex';
jest.mock('../../../../lib/veo/engine', () => ({ veoTransport: () => mockVeo }));

import { NextRequest } from 'next/server';
import { GET } from './route';

const ENV = { ...process.env };
const get = () => GET(new NextRequest('https://myavatar.ge/api/health/providers'));
const pipeline = async () => ((await (await get()).json()) as { pipeline: Record<string, unknown> }).pipeline;

beforeEach(() => {
  process.env = { ...ENV };
  for (const k of ['VIDEO_GOOGLE_ONLY', 'REPLICATE_VIDEO_MODEL', 'AUTO_ANCHOR_FRAME', 'ANCHOR_MODEL', 'GEMINI_FRAME_MODEL', 'VEO_MODEL_STANDARD', 'VEO_MODEL_FAST', 'VEO_MODEL_LITE', 'GEMINI_VEO_MODEL']) delete process.env[k];
  mockAdmin = true;
  mockVeo = 'vertex';
});
afterAll(() => { process.env = ENV; });

test('not an admin → refused, nothing reported', async () => {
  mockAdmin = false;
  expect((await get()).status).toBe(403);
});

test('Google-only (the default): Veo clips and a Gemini anchor, whatever the Replicate env says', async () => {
  process.env.REPLICATE_VIDEO_MODEL = 'kwaivgi/kling-v1.6-standard';
  process.env.ANCHOR_MODEL = 'schnell';
  const p = await pipeline();
  expect(p.googleOnly).toBe(true);
  expect(p.videoClipEngine).toBe('Veo');
  expect(String(p.videoClipModel)).toMatch(/veo/i);
  expect(p.videoPinnedToV16).toBe(false);
  expect(p.anchor).toBe('Gemini gemini-3.1-flash-image');
  expect(JSON.stringify(p)).not.toMatch(/kling|flux schnell/i);
});

test('Google-only with no Veo route: no clip model is claimed', async () => {
  mockVeo = null;
  expect((await pipeline()).videoClipModel).toBeNull();
});

test('Google-only switched off: the legacy Replicate legs are named again', async () => {
  process.env.VIDEO_GOOGLE_ONLY = '0';
  process.env.REPLICATE_VIDEO_MODEL = 'kwaivgi/kling-v1.6-standard';
  let p = await pipeline();
  expect(p.googleOnly).toBe(false);
  expect(p.videoClipModel).toBe('kwaivgi/kling-v1.6-standard');
  expect(p.videoPinnedToV16).toBe(true);
  expect(p.anchor).toBe('nano-banana → FLUX (Replicate)');
  process.env.AUTO_ANCHOR_FRAME = '1';
  process.env.ANCHOR_MODEL = 'schnell';
  p = await pipeline();
  expect(p.anchor).toBe('FLUX Schnell');
});
