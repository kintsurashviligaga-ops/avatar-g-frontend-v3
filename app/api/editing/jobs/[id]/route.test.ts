/** @jest-environment node */
/**
 * GET /api/editing/jobs/<id> touches only storage that POST /api/editing/jobs minted for the caller.
 *
 * ⚠️ The row names what the service role downloads (`payload.source_assets`), where the agent writes
 * (`payload.output_path_prefix`) and what gets signed back (`result.exports`), and a signed-in user can write their own
 * `jobs` rows. Pinned: a queued row naming anything outside `job-artifacts/editing-input|output/<uid>/` never runs, and
 * only the caller's own outputs are signed.
 */
const ME = '11111111-2222-4333-8444-555555555555';
const YOU = '99999999-8888-4777-8666-555555555555';

let row: Record<string, unknown> | null = null;
const signed: Array<{ bucket: string; path: string }> = [];
const updates: unknown[] = [];

jest.mock('../../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain,
        eq: chain,
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          if (row) row = { ...row, ...patch };
          return q;
        },
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
      });
      return q;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          signed.push({ bucket, path });
          return { data: { signedUrl: `https://signed/${bucket}/${path}` } };
        },
      }),
    },
  }),
}));
jest.mock('../../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: jest.fn(async () => ({ id: ME })) }));
const editingAgent = jest.fn(async () => ({ success: false, error: 'stub' }));
jest.mock('../../../../../workers/gpu/agents/editingAgent', () => ({ editingAgent: (...args: unknown[]) => editingAgent(...(args as [])) }));

import { NextRequest } from 'next/server';
import { GET } from './route';

const get = () => GET(new NextRequest('https://myavatar.ge/api/editing/jobs/job-1'), { params: Promise.resolve({ id: 'job-1' }) });
const queued = (payload: Record<string, unknown>) => ({
  id: 'job-1', user_id: ME, agent_id: 'editing-agent', status: 'queued', payload, result: null,
  error_message: null, created_at: '', updated_at: '',
});
const OWN_SOURCE = { bucket: 'job-artifacts', path: `editing-input/${ME}/1700000000000-abc123.mp4` };
const OWN_PREFIX = `editing-output/${ME}/7c9e6679-7425-40de-944b-e07fc1f90ae7`;

beforeEach(() => {
  row = null;
  signed.length = 0;
  updates.length = 0;
  editingAgent.mockClear();
});

test.each([
  ['a source in another user\'s folder', { source_assets: [{ bucket: 'job-artifacts', path: `editing-input/${YOU}/x.mp4` }], output_path_prefix: OWN_PREFIX }],
  ['a source in another bucket', { source_assets: [{ bucket: 'uploads', path: `${YOU}/photo.jpg` }], output_path_prefix: OWN_PREFIX }],
  ['an output prefix in another user\'s folder', { source_assets: [OWN_SOURCE], output_path_prefix: `editing-output/${YOU}/run` }],
  ['an output prefix that climbs out', { source_assets: [OWN_SOURCE], output_path_prefix: `editing-output/${ME}/../../avatars` }],
  ['no sources at all', { source_assets: [], output_path_prefix: OWN_PREFIX }],
])('a queued row naming %s is refused before anything runs', async (_label, payload) => {
  row = queued(payload);
  const res = await get();
  expect(res.status).toBe(403);
  expect(editingAgent).not.toHaveBeenCalled();
  expect(updates).toEqual([]);
  expect(signed).toEqual([]);
});

test('a queued row this route minted for the caller runs', async () => {
  row = queued({ source_assets: [OWN_SOURCE], output_path_prefix: OWN_PREFIX });
  await get();
  expect(editingAgent).toHaveBeenCalledTimes(1);
});

test('only the caller\'s own outputs are signed', async () => {
  const own = { format: 'mp4_1080p', bucket: 'job-artifacts', path: `${OWN_PREFIX}/export/output_mp4_1080p.mp4` };
  row = {
    ...queued({ source_assets: [OWN_SOURCE], output_path_prefix: OWN_PREFIX }),
    status: 'completed',
    result: {
      exports: [
        { format: 'x', bucket: 'uploads', path: `${YOU}/voice.mp3` },
        { format: 'y', bucket: 'job-artifacts', path: `editing-output/${YOU}/run/export/output.mp4` },
        own,
      ],
    },
  };
  const res = await get();
  expect(res.status).toBe(200);
  expect(signed).toEqual([{ bucket: own.bucket, path: own.path }]);
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain(YOU);
});
