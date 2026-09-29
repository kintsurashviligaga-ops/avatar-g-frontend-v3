/** @jest-environment node */
/**
 * GET /api/generate — the caller's recent studio jobs. Signed in, behind STUDIO_V2, only their own rows, and
 * outputs signed only for completed jobs (a failed job has nothing to show, and nothing to leak).
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = { id: 'user-1' };
let mockRuntime: unknown = null;
jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: async () => ({ user: mockUser }) }));
jest.mock('../../../lib/studio/runtime', () => ({ getStudioRuntime: () => mockRuntime, signUploadedReference: jest.fn() }));
jest.mock('../../../lib/orchestrator/rate-limit', () => ({ checkProduceRate: async () => ({ ok: true }), rateLimitedResponse: jest.fn() }));

import { GET } from './route';

const job = (over: Record<string, unknown>) => ({
  id: 'j', user_id: 'user-1', service: 'video', model_id: 'hf/kling-3-std-t2v', status: 'completed', input: { prompt: 'a sunset' },
  prompt_original: 'მზის ჩასვლა', estimate_gel: 1.3, charge_credits: 13, refund_state: null, error_code: null,
  output_urls: [{ bucket: 'studio', path: 'user-1/j/0.mp4', contentType: 'video/mp4' }], created_at: '2026-09-29T10:00:00Z', completed_at: null,
  ...over,
});

const req = (q = '') => ({ nextUrl: new URL(`https://myavatar.ge/api/generate${q}`) }) as never;

let listForUser: jest.Mock;
let signOutputs: jest.Mock;
beforeEach(() => {
  process.env.STUDIO_V2 = '1';
  mockUser = { id: 'user-1' };
  listForUser = jest.fn().mockResolvedValue([
    job({ id: 'a', status: 'completed' }),
    job({ id: 'b', status: 'in_progress' }),
    job({ id: 'c', status: 'failed', error_code: 'generation_failed', refund_state: 'done' }),
  ]);
  signOutputs = jest.fn().mockResolvedValue(['https://storage.example/signed/0.mp4']);
  mockRuntime = { store: { listForUser }, signOutputs };
});

test('returns the caller’s own jobs, newest first as stored, with signed outputs only when completed', async () => {
  const res = await GET(req());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(listForUser).toHaveBeenCalledWith('user-1', 12);
  expect(body.jobs.map((j: { id: string }) => j.id)).toEqual(['a', 'b', 'c']);
  expect(body.jobs[0]).toMatchObject({ status: 'completed', outputUrls: ['https://storage.example/signed/0.mp4'], terminal: true, promptOriginal: 'მზის ჩასვლა', promptSent: 'a sunset' });
  expect(body.jobs[1]).toMatchObject({ status: 'in_progress', outputUrls: [], terminal: false });
  expect(body.jobs[2]).toMatchObject({ status: 'failed', outputUrls: [], refunded: true, terminal: true });
  expect(signOutputs).toHaveBeenCalledTimes(1);
  expect(res.headers.get('cache-control')).toBe('no-store');
});

test('never exposes provider internals', async () => {
  const body = await (await GET(req())).json();
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/provider_request_id|provider_endpoint|error_detail|user-1\/j/);
});

test('limit is bounded', async () => {
  await GET(req('?limit=500'));
  expect(listForUser).toHaveBeenLastCalledWith('user-1', 30);
  await GET(req('?limit=abc'));
  expect(listForUser).toHaveBeenLastCalledWith('user-1', 12);
});

test('signed out → 401; flag off → 404; no runtime → 503', async () => {
  mockUser = null;
  expect((await GET(req())).status).toBe(401);
  mockUser = { id: 'user-1' };
  process.env.STUDIO_V2 = '';
  expect((await GET(req())).status).toBe(404);
  process.env.STUDIO_V2 = '1';
  mockRuntime = null;
  expect((await GET(req())).status).toBe(503);
});

test('a signing failure costs the thumbnail, not the whole list', async () => {
  signOutputs.mockRejectedValueOnce(new Error('storage down'));
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect((await res.json()).jobs[0].outputUrls).toEqual([]);
});
