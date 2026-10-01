/** @jest-environment node */
/**
 * GET /api/video/longform/[id] with an in-memory database. Rules under test: 404 while the flag is off (before auth);
 * 401 without a session; a malformed id, a missing job and SOMEONE ELSE'S job are the same 404; progress for the
 * owner with every URL signed fresh from its stored PATH (clips while rendering, only the film once done); and no
 * ledger ref, operation name, provider text or storage path on the wire.
 */
jest.mock('server-only', () => ({}));
const mockAuth = jest.fn();
const mockSvc = jest.fn();
jest.mock('../../../../../lib/supabase/server', () => ({
  authedClientFromRequest: (...a: unknown[]) => mockAuth(...a),
  createServiceRoleClient: (...a: unknown[]) => mockSvc(...a),
}));
const mockSign = jest.fn();
const mockSignMany = jest.fn();
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({
  createSignedAssetUrl: (...a: unknown[]) => mockSign(...a),
  createSignedAssetUrls: (...a: unknown[]) => mockSignMany(...a),
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({ checkRateLimit: async () => null, RATE_LIMITS: { READ: {} } }));
jest.mock('../../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { FakeDb } from '@/lib/video/longform/testing/fakeDb';

const ID = '11111111-2222-4333-8444-555555555555';
const env = process.env as Record<string, string | undefined>;
let saved: string | undefined;
let db: FakeDb;

const get = (id: string) => GET(new NextRequest(`https://myavatar.ge/api/video/longform/${id}`), { params: { id } });

const jobRow = (o: Record<string, unknown> = {}) => ({
  id: ID, user_id: 'u1', status: 'rendering', cancel_requested: false, hold_until: null, hold_reason: null, stitch_attempts: 0,
  deadline_at: '2027-01-16T08:00:00.000Z', error_code: null, output_url: 'https://stale/film.mp4', output_path: null, output_bytes: null,
  scene_count: 3, act_count: 1, tier: 'fast', format: '16:9', resolution: '1080p', generate_audio: true,
  bible: { title: 'The Long Way Home', arc: [{ summary: 's' }] }, seed: 1, credits_per_scene: 39, refunds_pending: false,
  prompt: 'my private brief', created_at: '2027-01-15T08:00:00.000Z', completed_at: null, ...o,
});
const sceneRows = () => [
  { job_id: ID, user_id: 'u1', ordinal: 0, act: 0, status: 'delivered', output_path: `longform/${ID}/s00-aa.mp4`, output_url: 'https://stale/0.mp4', charge_ref: `longform:${ID}:act:0` },
  { job_id: ID, user_id: 'u1', ordinal: 1, act: 0, status: 'rendering', output_path: null, operation_name: 'models/veo/operations/1' },
  { job_id: ID, user_id: 'u1', ordinal: 2, act: 0, status: 'failed', output_path: null, error_detail: 'filtered: provider words' },
];

beforeEach(() => {
  saved = env.LONGFORM_VIDEO_ENABLED;
  env.LONGFORM_VIDEO_ENABLED = '1';
  db = new FakeDb({ longform_jobs: [jobRow()], longform_scenes: sceneRows() });
  mockAuth.mockReset().mockResolvedValue({ supabase: {}, user: { id: 'u1' } });
  mockSvc.mockReset().mockImplementation(() => db);
  mockSign.mockReset().mockResolvedValue('https://signed/film.mp4?token=fresh');
  mockSignMany.mockReset().mockImplementation(async (_b: string, paths: string[]) => paths.map((p) => `https://signed/${p}?token=fresh`));
});
afterEach(() => {
  if (saved === undefined) delete env.LONGFORM_VIDEO_ENABLED;
  else env.LONGFORM_VIDEO_ENABLED = saved;
});

test('404 while the flag is off — before auth', async () => {
  delete env.LONGFORM_VIDEO_ENABLED;
  expect((await get(ID)).status).toBe(404);
  expect(mockAuth).not.toHaveBeenCalled();
  expect(db.ops).toEqual([]);
});

test('401 without a session', async () => {
  mockAuth.mockResolvedValueOnce({ supabase: {}, user: null });
  expect((await get(ID)).status).toBe(401);
  expect(db.ops).toEqual([]);
});

test('a malformed id, a missing job and another user\'s job are the same 404', async () => {
  const bad = await get('../../etc/passwd');
  expect(bad.status).toBe(404);
  expect(db.ops).toEqual([]);
  const missing = await get('99999999-2222-4333-8444-555555555555');
  mockAuth.mockResolvedValueOnce({ supabase: {}, user: { id: 'u2' } });
  const theirs = await get(ID);
  for (const r of [missing, theirs]) {
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'Not found' });
  }
  // The read was scoped to the caller, not filtered afterwards.
  expect(db.ops.filter((o) => o.table === 'longform_jobs').at(-1)!.filters).toEqual([['eq', 'id', ID], ['eq', 'user_id', 'u2']]);
});

test('rendering: progress + the delivered clip, signed fresh from its path for 24 h; no internals on the wire', async () => {
  const res = await get(ID);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    id: ID, status: 'rendering', terminal: false, seconds: 24, sceneCount: 3, title: 'The Long Way Home', film: null,
    progress: { total: 3, delivered: 1, failed: 1, inFlight: 1, queued: 0 }, credits: { perScene: 39, total: 117 },
  });
  expect(body.scenes).toEqual([
    { ordinal: 0, act: 0, status: 'delivered', url: `https://signed/longform/${ID}/s00-aa.mp4?token=fresh` },
    { ordinal: 1, act: 0, status: 'rendering', url: null },
    { ordinal: 2, act: 0, status: 'failed', url: null },
  ]);
  expect(mockSignMany).toHaveBeenCalledWith('renders', [`longform/${ID}/s00-aa.mp4`], 86_400);
  expect(mockSign).not.toHaveBeenCalled();
  const wire = JSON.stringify(body).replace(/https:\/\/signed\/[^"]+/g, '');
  for (const secret of ['act:0', 'operations/1', 'provider words', 'longform/', 'https://stale', 'my private brief', 'u1']) expect(wire).not.toContain(secret);
  expect(res.headers.get('cache-control')).toBe('private, no-store');
});

test('done: only the film, signed from output_path (never the stored 7-day URL); the clips are not signed', async () => {
  db = new FakeDb({
    longform_jobs: [jobRow({ status: 'done', output_path: `longform/${ID}/film.mp4`, output_bytes: 40_000_000, completed_at: '2027-01-15T09:00:00.000Z' })],
    longform_scenes: sceneRows(),
  });
  const body = await (await get(ID)).json();
  expect(body).toMatchObject({ status: 'done', terminal: true, film: { url: 'https://signed/film.mp4?token=fresh', bytes: 40_000_000 } });
  expect(mockSign).toHaveBeenCalledWith('renders', `longform/${ID}/film.mp4`, 86_400);
  expect(mockSignMany).not.toHaveBeenCalled();
  expect(body.scenes.every((s: { url: unknown }) => s.url === null)).toBe(true);
});

test('a database error is a 503, not a 404', async () => {
  db.failNext('longform_jobs', 'select');
  expect((await get(ID)).status).toBe(503);
  db.failNext('longform_scenes', 'select');
  expect((await get(ID)).status).toBe(503);
});
