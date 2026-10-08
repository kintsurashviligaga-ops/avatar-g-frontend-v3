/** @jest-environment node */
/**
 * /api/studio/library — the cross-user file-access fix.
 *
 *   POST: signed-in only; one of OUR storage objects only through a currently valid signed URL (probed); anything else
 *         must be a public http(s) address. Nothing lands in the shared demo library any more.
 *   GET:  the service role re-signs only a SIGNED url on OUR host, in one of OUR media buckets, on a row the caller
 *         owns whose URL we wrote or verified — batched, one call per bucket.
 *
 * The session, the service-role client, the job store and the network are mocked; storage-adapter runs for real.
 */
jest.mock('server-only', () => ({}));

const OWN = 'https://proj.supabase.co';
const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';

type Row = { id: string; user_id: string; service_type: string; params: Record<string, unknown>; signed_url: string | null; result: Record<string, unknown> | null; created_at: string };
let mockUser: { id: string } | null = null;
let mockRows: Row[] = [];
const mockSignCalls: Array<{ bucket: string; paths: string[]; ttl: number }> = [];

function mockQuery() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'order', 'range']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: mockRows, error: null });
  return chain;
}
const mockServiceClient = {
  from: () => mockQuery(),
  storage: {
    from: (bucket: string) => ({
      createSignedUrls: async (paths: string[], ttl: number) => {
        mockSignCalls.push({ bucket, paths, ttl });
        return { data: paths.map((p) => ({ signedUrl: `${OWN}/storage/v1/object/sign/${bucket}/${p}?token=FRESH` })), error: null };
      },
    }),
  },
};
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: { from: () => mockQuery() }, user: mockUser })),
  createServiceRoleClient: () => mockServiceClient,
}));
jest.mock('../../../../lib/audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo-user' }));
const mockRecord = jest.fn(async (_input: Record<string, unknown>) => true);
jest.mock('../../../../lib/orchestrator/jobs', () => ({
  JOB_COLUMNS: 'id,user_id,service_type,status,params,result,signed_url,created_at',
  recordCompletedAsset: (input: Record<string, unknown>) => mockRecord(input),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  process.env = { ...ENV, NEXT_PUBLIC_SUPABASE_URL: OWN };
  delete process.env.SUPABASE_URL;
  delete process.env.RENDER_BUCKET;
  delete process.env.UPLOAD_BUCKET;
  mockUser = { id: USER };
  mockRows = [];
  mockSignCalls.length = 0;
  mockRecord.mockClear();
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 206 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

const signed = (bucket: string, path: string, host = OWN) => `${host}/storage/v1/object/sign/${bucket}/${path}?token=OLD`;
const row = (id: string, url: string, over: Partial<Row> = {}): Row => ({
  id, user_id: USER, service_type: 'film', params: {}, signed_url: url, result: null, created_at: '2026-10-08T00:00:00Z', ...over,
});
const getItems = async () => {
  const res = await GET(new NextRequest('https://myavatar.ge/api/studio/library?limit=40'));
  return ((await res.json()) as { items: Array<{ id: string; url: string }> }).items;
};
const urlOf = (items: Array<{ id: string; url: string }>, id: string) => items.find((i) => i.id === id)?.url;

describe('GET — re-signing is limited to what is provably ours', () => {
  test('a producer row in a media bucket on our host is re-signed, in ONE batched call per bucket', async () => {
    mockRows = [
      row('a', signed('renders', 'captioned/1-abc.mp4')),
      row('b', signed('renders', 'montage/master-2.mp4')),
      row('c', signed('uploads', 'edits/concat-3.mp4')),
      row('d', signed('studio', 'u/out.png')),
    ];
    const items = await getItems();
    expect(urlOf(items, 'a')).toBe(`${OWN}/storage/v1/object/sign/renders/captioned/1-abc.mp4?token=FRESH`);
    expect(urlOf(items, 'c')).toContain('/uploads/edits/concat-3.mp4?token=FRESH');
    expect(urlOf(items, 'd')).toContain('/studio/u/out.png?token=FRESH');
    expect(mockSignCalls.map((c) => c.bucket).sort()).toEqual(['renders', 'studio', 'uploads']);
    expect(mockSignCalls.find((c) => c.bucket === 'renders')).toEqual({ bucket: 'renders', paths: ['captioned/1-abc.mp4', 'montage/master-2.mp4'], ttl: 86_400 });
  });

  test('never re-signs: another tenant, a public URL, a non-media bucket, the twin bucket, or an external URL', async () => {
    mockRows = [
      row('foreign', signed('renders', 'captioned/1.mp4', 'https://evil.supabase.co')),
      row('public', `${OWN}/storage/v1/object/public/renders/captioned/victim.mp4`),
      row('avatars', signed('avatars', 'u/face.jpg')),
      row('twins', signed('twins', `${OTHER}/voice.webm`)),
      row('ext', 'https://replicate.delivery/x/out.mp4'),
    ];
    const items = await getItems();
    expect(mockSignCalls).toEqual([]);
    for (const r of mockRows) expect(urlOf(items, r.id)).toBe(r.signed_url);
  });

  test('a manual save is re-signed only when POST verified it — legacy unverified saves keep their stored URL', async () => {
    mockRows = [
      row('legacy', signed('renders', 'captioned/victim.mp4'), { params: { source: 'manual-save' } }),
      row('verified', signed('renders', 'captioned/mine.mp4'), { params: { source: 'manual-save', storage_verified: true } }),
    ];
    const items = await getItems();
    expect(urlOf(items, 'legacy')).toBe(signed('renders', 'captioned/victim.mp4'));
    expect(urlOf(items, 'verified')).toContain('captioned/mine.mp4?token=FRESH');
    expect(mockSignCalls).toEqual([{ bucket: 'renders', paths: ['captioned/mine.mp4'], ttl: 86_400 }]);
  });

  test('a row that is not the caller’s never reaches the signer (or the response), even if a filter slipped', async () => {
    mockRows = [row('mine', signed('renders', 'a.mp4')), row('theirs', signed('renders', 'b.mp4'), { user_id: OTHER })];
    const items = await getItems();
    expect(items.map((i) => i.id)).toEqual(['mine']);
    expect(mockSignCalls).toEqual([{ bucket: 'renders', paths: ['a.mp4'], ttl: 86_400 }]);
  });

  test('SUPABASE_URL (the service-role spelling) counts as our host too', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://other-alias.example.com';
    process.env.SUPABASE_URL = OWN;
    mockRows = [row('a', signed('renders', 'x.mp4'))];
    expect(urlOf(await getItems(), 'a')).toContain('token=FRESH');
  });
});

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/studio/library', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
const saved = () => mockRecord.mock.calls.map((c) => c[0]);

describe('POST — signed-in only, and only URLs the caller can already read', () => {
  test('anonymous → 401, nothing filed (no demo-library write)', async () => {
    mockUser = null;
    const res = await POST(post({ url: 'https://replicate.delivery/x/out.mp4', kind: 'film' }));
    expect(res.status).toBe(401);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test('a public external URL is filed under the caller, unverified (so never re-signed)', async () => {
    const res = await POST(post({ url: 'https://replicate.delivery/x/out.mp4', kind: 'image', prompt: 'p' }));
    expect(res.status).toBe(200);
    expect(saved()).toEqual([expect.objectContaining({ userId: USER, serviceType: 'image', source: 'manual-save', storageVerified: false })]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each([
    'http://169.254.169.254/latest/meta-data',
    'http://localhost:3000/x.mp4',
    'http://10.0.0.5/x.mp4',
    'https://metadata.google.internal/x',
    'ftp://example.com/x.mp4',
    'javascript:alert(1)',
  ])('an internal or non-http address is refused (400): %s', async (url) => {
    const res = await POST(post({ url }));
    expect(res.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test('our signed URL that storage still honours is filed and marked verified; the probe is a 1-byte ranged GET', async () => {
    const url = signed('renders', 'captioned/1700-abc.mp4');
    const res = await POST(post({ url, kind: 'film' }));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [probed, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(probed).toBe(url);
    expect(init).toEqual(expect.objectContaining({ method: 'GET', redirect: 'manual', headers: { Range: 'bytes=0-0' } }));
    expect(saved()).toEqual([expect.objectContaining({ url, userId: USER, storageVerified: true })]);
  });

  test('our signed URL that storage refuses (expired / forged token) → 400, nothing filed', async () => {
    fetchSpy.mockResolvedValue(new Response('{"error":"InvalidJWT"}', { status: 400 }));
    const res = await POST(post({ url: signed('renders', 'captioned/victim.mp4') }));
    expect(res.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test('the probe failing outright (network) also refuses', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNRESET'));
    expect((await POST(post({ url: signed('renders', 'a.mp4') }))).status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test('our /object/sign/ path with no token → 400 without a probe', async () => {
    const res = await POST(post({ url: `${OWN}/storage/v1/object/sign/renders/captioned/victim.mp4` }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each(['avatars', 'twins', 'job-artifacts'])('our signed URL in a non-media bucket (%s) → 400 without a probe', async (bucket) => {
    const res = await POST(post({ url: signed(bucket, `${OTHER}/x`) }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('our /object/public/ URL is accepted as-is and NOT marked verified (GET never re-signs a public URL)', async () => {
    const res = await POST(post({ url: `${OWN}/storage/v1/object/public/renders/captioned/x.mp4` }));
    expect(res.status).toBe(200);
    expect(saved()).toEqual([expect.objectContaining({ storageVerified: false })]);
  });

  test('another tenant’s storage URL is just an external URL: filed, never verified, never probed', async () => {
    const res = await POST(post({ url: signed('renders', 'captioned/x.mp4', 'https://evil.supabase.co') }));
    expect(res.status).toBe(200);
    expect(saved()).toEqual([expect.objectContaining({ storageVerified: false })]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
