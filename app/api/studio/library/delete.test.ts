/** @jest-environment node */
/**
 * DELETE /api/studio/library — the Library's "delete this file permanently" now removes the stored file too.
 *
 *   • only a row the caller's own session actually deleted can touch storage;
 *   • the file goes only when it is provably ours (a SIGNED url, OUR host, one of OUR media buckets), the row is not a
 *     manual save, and no other generation_jobs row names the object;
 *   • anything that fails a check, or cannot be checked, is kept; a storage error still deletes the row.
 *
 * The session client and the service-role client are mocked; storage-adapter runs for real. The reference check's
 * LIKE patterns are evaluated against the mock rows, so the pattern itself is under test.
 */
jest.mock('server-only', () => ({}));

const OWN = 'https://proj.supabase.co';
const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';

type Row = { id: string; user_id: string; service_type: string; params: Record<string, unknown>; signed_url: string | null; result: Record<string, unknown> | null; created_at: string };
let mockUser: { id: string } | null = null;
let mockRows: Row[] = [];
let mockDeleteError: { message: string } | null = null;
let mockRefError: { message: string } | null = null;
let mockRemoveError: { message: string } | null = null;
const mockRemoveCalls: Array<{ bucket: string; paths: string[] }> = [];
const mockRefQueries: Array<{ column: string; pattern: string }> = [];

/** Postgres LIKE (default escape) → RegExp, for evaluating the route's patterns against the mock rows. */
function likeToRegExp(pattern: string): RegExp {
  let src = '';
  for (const ch of pattern) {
    if (ch === '%') src += '[\\s\\S]*';
    else if (ch === '_') src += '[\\s\\S]';
    else src += ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${src}$`);
}
function columnValue(row: Row, column: string): string | null {
  if (column === 'signed_url') return row.signed_url;
  if (column === 'result->>url') return typeof row.result?.url === 'string' ? (row.result.url as string) : null;
  throw new Error(`unexpected column ${column}`);
}

/** The caller's session: DELETE … WHERE id AND user_id RETURNING the deleted rows (RLS = owner only). */
function mockSessionDelete() {
  const filters: Record<string, string> = {};
  const chain: Record<string, unknown> = {};
  chain.delete = () => chain;
  chain.eq = (col: string, val: string) => { filters[col] = val; return chain; };
  chain.select = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => {
    if (mockDeleteError) return resolve({ data: null, error: mockDeleteError });
    const hit = mockRows.filter((r) => r.id === filters.id && r.user_id === filters.user_id && r.user_id === mockUser?.id);
    mockRows = mockRows.filter((r) => !hit.includes(r));
    return resolve({ data: hit, error: null });
  };
  return chain;
}

/** The service role's reference check: SELECT id … WHERE <column> LIKE <pattern> AND id <> <row> LIMIT 1. */
function mockRefQuery() {
  let column = '';
  let pattern = '';
  let notId = '';
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.like = (col: string, pat: string) => { column = col; pattern = pat; mockRefQueries.push({ column, pattern }); return chain; };
  chain.neq = (_col: string, val: string) => { notId = val; return chain; };
  chain.limit = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => {
    if (mockRefError) return resolve({ data: null, error: mockRefError });
    const re = likeToRegExp(pattern);
    const hits = mockRows.filter((r) => r.id !== notId && re.test(columnValue(r, column) ?? '')).slice(0, 1);
    return resolve({ data: hits.map((r) => ({ id: r.id })), error: null });
  };
  return chain;
}

const mockServiceClient = {
  from: () => mockRefQuery(),
  storage: {
    from: (bucket: string) => ({
      remove: async (paths: string[]) => {
        mockRemoveCalls.push({ bucket, paths });
        return { data: mockRemoveError ? null : paths.map((name) => ({ name })), error: mockRemoveError };
      },
    }),
  },
};
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: { from: () => mockSessionDelete() }, user: mockUser })),
  createServiceRoleClient: () => mockServiceClient,
}));
jest.mock('../../../../lib/audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo-user' }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({
  JOB_COLUMNS: 'id,user_id,service_type,status,params,result,signed_url,created_at',
  recordCompletedAsset: jest.fn(async () => true),
}));

import { NextRequest } from 'next/server';
import { DELETE } from './route';

const ENV = { ...process.env };
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  process.env = { ...ENV, NEXT_PUBLIC_SUPABASE_URL: OWN };
  delete process.env.SUPABASE_URL;
  delete process.env.RENDER_BUCKET;
  delete process.env.UPLOAD_BUCKET;
  mockUser = { id: USER };
  mockRows = [];
  mockDeleteError = null;
  mockRefError = null;
  mockRemoveError = null;
  mockRemoveCalls.length = 0;
  mockRefQueries.length = 0;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  process.env = { ...ENV };
});

const signed = (bucket: string, path: string, host = OWN, token = 'OLD') => `${host}/storage/v1/object/sign/${bucket}/${path}?token=${token}`;
const row = (id: string, url: string | null, over: Partial<Row> = {}): Row => ({
  id, user_id: USER, service_type: 'film', params: {}, signed_url: url, result: null, created_at: '2026-10-08T00:00:00Z', ...over,
});
const del = async (id?: string) => {
  const qs = id === undefined ? '' : `?id=${encodeURIComponent(id)}`;
  const res = await DELETE(new NextRequest(`https://myavatar.ge/api/studio/library${qs}`, { method: 'DELETE' }));
  return { status: res.status, body: (await res.json()) as { success: boolean; storage?: string; error?: string } };
};

describe('DELETE /api/studio/library — the row and its stored file', () => {
  it('removes a producer row\'s own signed object together with the row', async () => {
    mockRows = [row('a', signed('renders', 'pipe-1/clip.mp4'))];
    const { status, body } = await del('a');
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, storage: 'deleted' });
    expect(mockRows).toHaveLength(0);
    expect(mockRemoveCalls).toEqual([{ bucket: 'renders', paths: ['pipe-1/clip.mp4'] }]);
    // Both places a row can carry its URL are checked for other references.
    expect(mockRefQueries.map((q) => q.column).sort()).toEqual(['result->>url', 'signed_url']);
  });

  it('removes an object whose row carries it in result.url (no signed_url)', async () => {
    mockRows = [row('a', null, { service_type: 'music', result: { url: signed('uploads', 'music/1-x.mp3') } })];
    const { body } = await del('a');
    expect(body.storage).toBe('deleted');
    expect(mockRemoveCalls).toEqual([{ bucket: 'uploads', paths: ['music/1-x.mp3'] }]);
  });

  it('removes the decoded path when the stored URL percent-encodes it', async () => {
    mockRows = [row('a', signed('uploads', 'edits/my%20cut.mp4'))];
    const { body } = await del('a');
    expect(body.storage).toBe('deleted');
    expect(mockRemoveCalls).toEqual([{ bucket: 'uploads', paths: ['edits/my cut.mp4'] }]);
  });

  it('keeps the file of a manual save — readable is not the same as the caller\'s to destroy', async () => {
    mockRows = [row('a', signed('renders', 'pipe-1/clip.mp4'), { params: { source: 'manual-save', storage_verified: true } })];
    const { body } = await del('a');
    expect(body).toEqual({ success: true, storage: 'kept' });
    expect(mockRows).toHaveLength(0);
    expect(mockRemoveCalls).toHaveLength(0);
  });

  it('keeps the file while another row still names it (signed under another token)', async () => {
    mockRows = [
      row('a', signed('renders', 'pipe-1/clip.mp4')),
      row('b', signed('renders', 'pipe-1/clip.mp4', OWN, 'OTHER'), { params: { source: 'manual-save' } }),
    ];
    const { body } = await del('a');
    expect(body.storage).toBe('kept');
    expect(mockRows.map((r) => r.id)).toEqual(['b']);
    expect(mockRemoveCalls).toHaveLength(0);
  });

  it('keeps the file while another row names it in result.url under another spelling', async () => {
    mockRows = [
      row('a', signed('uploads', 'edits/my cut.mp4')),
      row('b', null, { result: { url: `${OWN}/storage/v1/object/public/uploads/edits/my%20cut.mp4` } }),
    ];
    const { body } = await del('a');
    expect(body.storage).toBe('kept');
    expect(mockRemoveCalls).toHaveLength(0);
  });

  it('removes the file once the last row naming it is deleted', async () => {
    mockRows = [row('a', signed('renders', 'pipe-1/clip.mp4')), row('b', signed('renders', 'pipe-1/clip.mp4', OWN, 'T2'))];
    expect((await del('a')).body.storage).toBe('kept');
    expect((await del('b')).body.storage).toBe('deleted');
    expect(mockRemoveCalls).toEqual([{ bucket: 'renders', paths: ['pipe-1/clip.mp4'] }]);
  });

  it('does not let a near-miss path keep or remove the wrong file', async () => {
    mockRows = [row('a', signed('renders', 'pipe-1/clip.mp4')), row('b', signed('renders', 'pipe-2/clip.mp4'))];
    const { body } = await del('a');
    expect(body.storage).toBe('deleted');
    expect(mockRemoveCalls).toEqual([{ bucket: 'renders', paths: ['pipe-1/clip.mp4'] }]);
  });

  it.each([
    ['another project\'s host', signed('renders', 'pipe-1/clip.mp4', 'https://evil.supabase.co')],
    ['a public URL', `${OWN}/storage/v1/object/public/renders/pipe-1/clip.mp4`],
    ['a bucket outside the Library (avatars)', signed('avatars', `${USER}/face.png`)],
    ['the twin bucket', signed('twins', `${USER}/voice.webm`)],
  ])('keeps %s', async (_label, url) => {
    mockRows = [row('a', url)];
    const { body } = await del('a');
    expect(body).toEqual({ success: true, storage: 'kept' });
    expect(mockRemoveCalls).toHaveLength(0);
    expect(mockRefQueries).toHaveLength(0);
  });

  it('touches nothing for a provider URL — there is no file of ours', async () => {
    mockRows = [row('a', 'https://cdn.provider.example/out/1.mp4')];
    const { body } = await del('a');
    expect(body).toEqual({ success: true, storage: 'none' });
    expect(mockRemoveCalls).toHaveLength(0);
  });

  it('keeps the file when the reference check cannot answer', async () => {
    mockRows = [row('a', signed('renders', 'pipe-1/clip.mp4'))];
    mockRefError = { message: 'db down' };
    const { body } = await del('a');
    expect(body).toEqual({ success: true, storage: 'kept' });
    expect(mockRemoveCalls).toHaveLength(0);
  });

  it('still deletes the row and says so when storage refuses the removal', async () => {
    mockRows = [row('a', signed('renders', 'pipe-1/clip.mp4'))];
    mockRemoveError = { message: 'storage down' };
    const { status, body } = await del('a');
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, storage: 'failed' });
    expect(mockRows).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('removes nothing for someone else\'s row — the session deletes nothing, so storage is never touched', async () => {
    mockRows = [row('a', signed('renders', 'pipe-1/clip.mp4'), { user_id: OTHER })];
    const { body } = await del('a');
    expect(body).toEqual({ success: true, storage: 'none' });
    expect(mockRows).toHaveLength(1);
    expect(mockRemoveCalls).toHaveLength(0);
    expect(mockRefQueries).toHaveLength(0);
  });

  it('returns 500 and removes nothing when the row delete fails', async () => {
    mockRows = [row('a', signed('renders', 'pipe-1/clip.mp4'))];
    mockDeleteError = { message: 'rls' };
    const { status, body } = await del('a');
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(mockRemoveCalls).toHaveLength(0);
  });

  it('401 without a session, 400 without an id', async () => {
    mockUser = null;
    expect((await del('a')).status).toBe(401);
    mockUser = { id: USER };
    expect((await del()).status).toBe(400);
    expect(mockRemoveCalls).toHaveLength(0);
  });
});
