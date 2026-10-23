/** @jest-environment node */
/**
 * GET /api/admin/flags — the Master Control Panel's read-only agent readiness. MASTER TASK v3.1: every model call is
 * on Vertex AI, so a row is ready only when Vertex is configured (the transport's own check), never because an AI
 * Studio key or an outside vendor's key (NanoBanana) is set. Music also needs Lyria switched on (the route's gate).
 */
jest.mock('server-only', () => ({}));

let mockAdmin = true;
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdmin: async () => mockAdmin }));
jest.mock('../../../../lib/supabase/server', () => ({ createRouteHandlerClient: jest.fn() }));
jest.mock('../../../../lib/server/feature-flags', () => ({
  resolveAllFlags: async () => [],
  setFeatureFlag: jest.fn(),
  isKnownFlag: () => false,
}));
let mockVertex = false;
let mockLyria = false;
jest.mock('../../../../lib/ai/google/transport', () => ({ googleAiConfigured: () => mockVertex }));
jest.mock('../../../../lib/ai/lyriaMusic', () => ({ hasLyriaProvider: () => mockLyria }));

import { GET } from './route';

type Row = { key: string; label: string; ready: boolean };
const readiness = async () => {
  const res = await GET();
  return { status: res.status, rows: ((await res.json()) as { providers?: Row[] }).providers ?? [] };
};
const ready = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.key, r.ready]));

const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV };
  mockAdmin = true;
  mockVertex = false;
  mockLyria = false;
});
afterEach(() => { process.env = { ...ENV }; });

test('an AI Studio key or a NanoBanana key makes no row ready while Vertex is not configured', async () => {
  Object.assign(process.env, { GEMINI_API_KEY: 'aistudio', GOOGLE_GENERATIVE_AI_API_KEY: 'aistudio-2', NANOBANANA_API_KEY: 'nb', GOOGLE_CLOUD_PROJECT: 'p' });
  const { status, rows } = await readiness();
  expect(status).toBe(200);
  expect(ready(rows)).toEqual({ video: false, gemini: false, music: false, image: false, audio: false, audiomix: true });
  expect(JSON.stringify(rows)).not.toMatch(/aistudio|nb"/);
});

test('Vertex configured: every model row is ready; music follows the Lyria gate', async () => {
  mockVertex = true;
  mockLyria = true;
  expect(ready((await readiness()).rows)).toEqual({ video: true, gemini: true, music: true, image: true, audio: true, audiomix: true });
  mockLyria = false; // LYRIA_ENABLED off
  expect(ready((await readiness()).rows)).toMatchObject({ music: false, video: true });
});

test('a caller who is not an admin gets 403 and no readiness', async () => {
  mockAdmin = false;
  const { status, rows } = await readiness();
  expect(status).toBe(403);
  expect(rows).toEqual([]);
});
