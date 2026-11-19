/** @jest-environment node */
/**
 * /api/studio/library — the cross-user file-access fix.
 *
 *   POST: signed-in only; one of OUR storage objects only through a currently valid signed URL (probed); anything else
 *         must be a public http(s) address. Nothing lands in the shared demo library any more.
 *   GET:  the service role re-signs only a SIGNED url on OUR host, in one of OUR media buckets, on a row the caller
 *         owns whose URL we wrote or verified — batched, one call per bucket. A failure is an error status, never an
 *         empty Library; the demo library says it is one; pages continue from a cursor.
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

const mockFilters: Array<[string, ...unknown[]]> = [];
const mockUpdates: Array<Record<string, unknown>> = [];
/** order / range / or, in call order: how the page is cut. */
const mockPaging: Array<[string, ...unknown[]]> = [];
let mockQueryError: { message: string } | null = null;
let mockQueryThrows = false;
let mockNoService = false;
/** public.library_favorites: what a read of it answers, and every write to it. */
let mockFavRows: Array<{ job_id: string }> = [];
let mockFavError: { message: string } | null = null;
const mockFavWrites: Array<{ op: string; rows?: unknown; opts?: unknown; filters: Array<[string, ...unknown[]]> }> = [];
const mockSelects: Array<[string, string]> = [];
function mockQuery(table = 'generation_jobs') {
  const chain: Record<string, unknown> = {};
  const write = table === 'library_favorites' ? { op: 'read', filters: [] as Array<[string, ...unknown[]]> } as (typeof mockFavWrites)[number] : null;
  chain.select = (cols: string) => { mockSelects.push([table, cols]); return chain; };
  for (const m of ['like', 'limit']) chain[m] = () => chain;
  chain.upsert = (rows: unknown, opts: unknown) => { if (write) { write.op = 'upsert'; write.rows = rows; write.opts = opts; mockFavWrites.push(write); } return chain; };
  chain.delete = () => { if (write) { write.op = 'delete'; mockFavWrites.push(write); } return chain; };
  for (const m of ['order', 'range', 'or']) chain[m] = (...a: unknown[]) => { mockPaging.push([m, ...a]); return chain; };
  chain.update = (patch: Record<string, unknown>) => { mockUpdates.push(patch); return chain; };
  for (const m of ['eq', 'neq', 'in']) chain[m] = (...a: unknown[]) => { (write ? write.filters : mockFilters).push([m, ...a]); return chain; };
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    if (write) return resolve({ data: mockFavError ? null : write.op === 'read' ? mockFavRows : null, error: mockFavError });
    return mockQueryThrows ? reject(new Error('socket hang up')) : resolve({ data: mockQueryError ? null : mockRows, error: mockQueryError });
  };
  return chain;
}
const mockServiceClient = {
  from: (table: string) => mockQuery(table),
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
  authedClientFromRequest: jest.fn(async () => ({ supabase: { from: (table: string) => mockQuery(table) }, user: mockUser })),
  createServiceRoleClient: () => (mockNoService ? null : mockServiceClient),
}));
jest.mock('../../../../lib/audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo-user' }));
const mockRecord = jest.fn(async (_input: Record<string, unknown>) => true);
jest.mock('../../../../lib/orchestrator/jobs', () => ({
  JOB_COLUMNS: 'id,user_id,service_type,status,params,result,signed_url,created_at',
  recordCompletedAsset: (input: Record<string, unknown>) => mockRecord(input),
}));

import { NextRequest } from 'next/server';
import { decodeLibraryCursor, encodeLibraryCursor, GET, PATCH, POST } from './route';

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
  mockFilters.length = 0;
  mockUpdates.length = 0;
  mockPaging.length = 0;
  mockQueryError = null;
  mockQueryThrows = false;
  mockNoService = false;
  mockFavRows = [];
  mockFavError = null;
  mockFavWrites.length = 0;
  mockSelects.length = 0;
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

  test('a manual save is re-signed only when POST verified it — a legacy save whose token proves nothing keeps its stored URL', async () => {
    mockRows = [
      row('legacy', signed('renders', 'captioned/victim.mp4'), { params: { source: 'manual-save' } }),
      row('verified', signed('renders', 'captioned/mine.mp4'), { params: { source: 'manual-save', storage_verified: true } }),
    ];
    const items = await getItems();
    expect(urlOf(items, 'legacy')).toBe(signed('renders', 'captioned/victim.mp4'));
    expect(urlOf(items, 'verified')).toContain('captioned/mine.mp4?token=FRESH');
    expect(mockSignCalls).toEqual([{ bucket: 'renders', paths: ['captioned/mine.mp4'], ttl: 86_400 }]);
  });

  // Live 2026-10-18: every remix / character-swap / dub / overlay video saved by hand before POST probed links answered
  // 400 InvalidJWT "exp" and the Library showed "Unable to play media". Storage checks a token's signature before its
  // age, so that answer plus the token's own `url` claim proves the link was minted for that object.
  const jwt = (claims: Record<string, unknown>) => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.c2ln`;
  };
  const tokened = (bucket: string, path: string, claimUrl = `${bucket}/${path}`) =>
    `${OWN}/storage/v1/object/sign/${bucket}/${path}?token=${jwt({ url: claimUrl, iat: 1, exp: 2 })}`;
  const expired = () => new Response(JSON.stringify({ statusCode: '400', error: 'InvalidJWT', message: '"exp" claim timestamp check failed' }), { status: 400 });

  test('a legacy manual save whose expired token was minted for its own object is re-signed, and the proof is kept', async () => {
    fetchSpy.mockResolvedValue(expired());
    const url = tokened('uploads', 'remix/faceswap-1-abc.mp4');
    mockRows = [row('old', url, { params: { source: 'manual-save', prompt: 'swap' } })];
    const items = await getItems();
    expect(urlOf(items, 'old')).toBe(`${OWN}/storage/v1/object/sign/uploads/remix/faceswap-1-abc.mp4?token=FRESH`);
    expect(fetchSpy).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'GET', headers: { Range: 'bytes=0-0' } }));
    expect(mockUpdates).toEqual([{ params: { source: 'manual-save', prompt: 'swap', storage_verified: true } }]);
    expect(mockFilters).toEqual(expect.arrayContaining([['eq', 'id', 'old'], ['eq', 'user_id', USER]]));
  });

  test('a legacy save is NOT re-signed when its token names another object, is forged, or storage refuses it otherwise', async () => {
    mockRows = [
      row('repointed', tokened('uploads', 'remix/victim.mp4', 'uploads/remix/mine.mp4'), { params: { source: 'manual-save' } }),
      row('forged', tokened('uploads', 'remix/forged.mp4'), { params: { source: 'manual-save' } }),
      row('external', 'https://tempfile.example.com/x.png', { params: { source: 'manual-save' } }),
    ];
    fetchSpy.mockImplementation(async (u: string) => (String(u).includes('forged')
      ? new Response(JSON.stringify({ statusCode: '400', error: 'InvalidSignature', message: 'signature verification failed' }), { status: 400 })
      : expired()));
    const items = await getItems();
    for (const r of mockRows) expect(urlOf(items, r.id)).toBe(r.signed_url);
    expect(mockSignCalls).toEqual([]);
    expect(mockUpdates).toEqual([]);
  });

  test('a legacy save storage still honours is re-signed too (its token proves the same thing)', async () => {
    mockRows = [row('live', tokened('renders', 'captioned/2-x.mp4'), { params: { source: 'manual-save' } })];
    expect(urlOf(await getItems(), 'live')).toContain('/renders/captioned/2-x.mp4?token=FRESH');
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

describe('GET — the Interior designer’s 3D plan', () => {
  test('a filed plan lists with its render as the picture and the plan itself, normalised', async () => {
    const geometry = { roomType: 'bedroom', floor: { widthM: 900, depthM: 4 }, wallHeightM: 2.6, walls: [], openings: [], confidence: 0.7 };
    mockRows = [
      row('plan', signed('renders', 'room.png'), {
        service_type: 'interior', params: { prompt: 'Japandi bedroom', source: 'interior-plan' },
        result: { stage: 'completed', url: signed('renders', 'room.png'), geometry, style: { styleName: 'Japandi', palette: ['#eeeeee', 'red'] } },
      }),
      // A plan filed before it had a picture stays out: the Library shows only what it can draw.
      row('bare', '', { service_type: 'interior', signed_url: null, result: { stage: 'completed', geometry } }),
      row('pic', signed('renders', 'p.png'), { service_type: 'image', result: { geometry } }),
    ];
    const items = (await getItems()) as Array<{ id: string; url: string; kind: string; prompt: string | null; plan?: { geometry: { floor: { widthM: number } }; style: { styleName: string; palette: string[] } } }>;
    expect(items.map((i) => i.id)).toEqual(['plan', 'pic']);
    const plan = items[0];
    expect(plan).toMatchObject({ kind: 'interior', prompt: 'Japandi bedroom', url: expect.stringContaining('token=FRESH') });
    expect(plan.plan?.geometry.floor.widthM).toBe(40); // clamped like the studio's own reader
    expect(plan.plan?.style).toMatchObject({ styleName: 'Japandi', palette: ['#eeeeee'] });
    expect(items[1].plan).toBeUndefined(); // only an interior row carries a plan
  });
});

describe('GET — the kind filter', () => {
  const serviceFilters = () => mockFilters.filter(([m, col]) => col === 'service_type' && m !== 'neq');
  test('one kind filters with eq, a comma list with in (the Image tab is image + interior)', async () => {
    await GET(new NextRequest('https://myavatar.ge/api/studio/library?kind=image'));
    expect(serviceFilters()).toEqual([['eq', 'service_type', 'image']]);
    mockFilters.length = 0;
    await GET(new NextRequest('https://myavatar.ge/api/studio/library?kind=image,interior'));
    expect(serviceFilters()).toEqual([['in', 'service_type', ['image', 'interior']]]);
  });

  test('unknown kinds are dropped; a filter with none left answers nothing instead of everything', async () => {
    mockRows = [row('a', 'https://cdn.example.com/a.mp4')];
    await GET(new NextRequest("https://myavatar.ge/api/studio/library?kind=film,x'or'1"));
    expect(serviceFilters()).toEqual([['eq', 'service_type', 'film']]);
    const res = await GET(new NextRequest('https://myavatar.ge/api/studio/library?kind=bogus'));
    expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
  });

  test('the Docs tab asks for Agent G\'s PDFs', async () => {
    await GET(new NextRequest('https://myavatar.ge/api/studio/library?kind=document'));
    expect(serviceFilters()).toEqual([['eq', 'service_type', 'document']]);
  });
});

describe('GET — empty, demo, unavailable and failed are told apart (§4.2.7)', () => {
  const read = async (path = '/api/studio/library?limit=40') => {
    const res = await GET(new NextRequest(`https://myavatar.ge${path}`));
    return { status: res.status, cache: res.headers.get('cache-control'), body: (await res.json()) as Record<string, unknown> };
  };

  test('the caller\'s own works say demo: false; an empty Library is a 200 with no items', async () => {
    mockRows = [row('a', 'https://cdn.example.com/a.mp4')];
    expect(await read()).toMatchObject({ status: 200, body: { demo: false } });
    mockRows = [];
    expect(await read()).toEqual({ status: 200, cache: 'private, no-store', body: { items: [], demo: false, nextCursor: null } });
  });

  test('a signed-out visitor gets the demo library, marked as such', async () => {
    mockUser = null;
    mockRows = [row('d', 'https://cdn.example.com/demo.mp4', { user_id: 'demo-user' })];
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body.demo).toBe(true);
    expect((body.items as Array<{ id: string }>).map((i) => i.id)).toEqual(['d']);
    expect(mockFilters).toEqual(expect.arrayContaining([['eq', 'user_id', 'demo-user']]));
  });

  test('a database error is 503 „unavailable", not „you have no works"', async () => {
    mockQueryError = { message: 'connection refused' };
    expect(await read()).toEqual({ status: 503, cache: 'private, no-store', body: { items: [], error: 'library_unavailable' } });
  });

  test('no demo reader for a signed-out visitor is 503 too', async () => {
    mockUser = null;
    mockNoService = true;
    expect(await read()).toMatchObject({ status: 503, body: { error: 'library_unavailable' } });
  });

  test('anything else that throws is 500 „failed"', async () => {
    mockQueryThrows = true;
    expect(await read()).toEqual({ status: 500, cache: 'private, no-store', body: { items: [], error: 'library_failed' } });
  });
});

describe('GET — stable pages: a cursor names where the last page ended (§4.2.4)', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => row(`job_${String(i).padStart(3, '0')}`, 'https://cdn.example.com/x.mp4', { created_at: `2026-10-${String(20 - Math.floor(i / 10)).padStart(2, '0')}T00:00:00.000+00:00` }));

  test('one total order: newest first, then id', async () => {
    await GET(new NextRequest('https://myavatar.ge/api/studio/library?limit=24'));
    expect(mockPaging).toEqual([
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
      ['range', 0, 23],
    ]);
  });

  test('a full page carries the cursor of its last row; a short page carries none', async () => {
    mockRows = rows(3);
    let body = (await (await GET(new NextRequest('https://myavatar.ge/api/studio/library?limit=3'))).json()) as { nextCursor: string | null };
    expect(decodeLibraryCursor(body.nextCursor)).toEqual({ t: mockRows[2]!.created_at, i: 'job_002' });
    body = (await (await GET(new NextRequest('https://myavatar.ge/api/studio/library?limit=4'))).json()) as { nextCursor: string | null };
    expect(body.nextCursor).toBeNull();
  });

  test('a row with no media still marks where the page ended', async () => {
    mockRows = [row('a', 'https://cdn.example.com/a.mp4'), row('b', '', { signed_url: null })];
    const body = (await (await GET(new NextRequest('https://myavatar.ge/api/studio/library?limit=2'))).json()) as { items: unknown[]; nextCursor: string };
    expect(body.items).toHaveLength(1);
    expect(decodeLibraryCursor(body.nextCursor)?.i).toBe('b');
  });

  test('`before` reads strictly after that row, from the top of the remaining rows (offset is ignored)', async () => {
    const cursor = encodeLibraryCursor('2026-10-20T00:00:00.123456+00:00', 'vremix:productad:abc');
    await GET(new NextRequest(`https://myavatar.ge/api/studio/library?limit=24&offset=48&before=${cursor}`));
    expect(mockPaging).toEqual([
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
      ['range', 0, 23],
      ['or', 'created_at.lt."2026-10-20T00:00:00.123456+00:00",and(created_at.eq."2026-10-20T00:00:00.123456+00:00",id.lt."vremix:productad:abc")'],
    ]);
  });

  test.each([
    ['not base64 JSON', 'nope!'],
    ['a quote in the id', Buffer.from(JSON.stringify({ t: '2026-10-20T00:00:00Z', i: 'a",id.gt."' })).toString('base64url')],
    ['a comma and parenthesis in the id', Buffer.from(JSON.stringify({ t: '2026-10-20T00:00:00Z', i: 'a),or(id.gt.0' })).toString('base64url')],
    ['not a time', Buffer.from(JSON.stringify({ t: 'yesterday', i: 'a' })).toString('base64url')],
    ['a missing part', Buffer.from(JSON.stringify({ t: '2026-10-20T00:00:00Z' })).toString('base64url')],
  ])('a malformed cursor (%s) is refused with 400 and reads nothing', async (_label, before) => {
    const res = await GET(new NextRequest(`https://myavatar.ge/api/studio/library?before=${encodeURIComponent(before)}`));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('bad_cursor');
    expect(mockPaging).toEqual([]);
  });

  test('a cursor round-trips the stored time and id exactly', () => {
    for (const [t, i] of [['2026-10-24T05:51:46.123456+00:00', 'prod_1700000000000_ab12cd'], ['2026-10-24 05:51:46+00', '11111111-2222-4333-8444-555555555555']] as const) {
      expect(decodeLibraryCursor(encodeLibraryCursor(t, i))).toEqual({ t, i });
    }
  });
});

describe('GET — expiresAt says when a link minted here stops working', () => {
  test('a re-signed link carries its 24 h expiry; a link we did not sign carries none', async () => {
    const now = Date.parse('2026-10-24T06:00:00.000Z');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    mockRows = [row('ours', signed('renders', 'u/a.mp4')), row('ext', 'https://cdn.example.com/b.mp4')];
    const items = (await (await GET(new NextRequest('https://myavatar.ge/api/studio/library?limit=40'))).json()).items as Array<{ id: string; expiresAt?: string }>;
    clock.mockRestore();
    expect(items.find((i) => i.id === 'ours')?.expiresAt).toBe('2026-10-25T06:00:00.000Z');
    expect(items.find((i) => i.id === 'ext')).not.toHaveProperty('expiresAt');
  });
});

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/studio/library', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
const saved = () => mockRecord.mock.calls.map((c) => c[0]);

describe('GET — server timing (lib/perf/serverTiming), only for a traced request', () => {
  const TRACE = '0123456789abcdef';
  const traced = (path = '/api/studio/library?limit=40') =>
    GET(new NextRequest(`https://myavatar.ge${path}`, { headers: { 'x-myavatar-trace': TRACE } }));

  test('a traced request gets its auth, db, proof and sign spans, with no URL, token or prompt in them', async () => {
    mockRows = [
      row('a', signed('renders', 'u/a.mp4'), { params: { prompt: 'a secret prompt' } }),
      row('b', signed('renders', 'u/b.mp4'), { params: { source: 'manual-save', prompt: 'another prompt' } }),
    ];
    const res = await traced();
    const timing = res.headers.get('server-timing') ?? '';
    // `fav` is the page's stars, read alongside proof and sign (a signed-in caller).
    expect(timing.split(', ').map((e) => e.split(';')[0])).toEqual(['auth', 'db', 'fav', 'proof', 'sign', 'total']);
    for (const entry of timing.split(', ')) expect(entry).toMatch(/^[a-z]+;dur=\d+(\.\d)?$/);
    expect(timing).not.toMatch(/token|supabase|prompt|renders/);
    expect(res.headers.get('x-myavatar-trace')).toBe(TRACE);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  test('the early answers carry the spans too (an unknown kind, a failed query)', async () => {
    const res = await traced('/api/studio/library?kind=nope');
    expect(res.headers.get('server-timing')).toMatch(/^auth;dur=[\d.]+, total;dur=[\d.]+$/);
  });

  test('an untraced request (or a malformed id) is answered exactly as before: no timing, no echo', async () => {
    mockRows = [row('a', signed('renders', 'u/a.mp4'))];
    for (const headers of [{}, { 'x-myavatar-trace': 'not a trace id, a prompt' }]) {
      const res = await GET(new NextRequest('https://myavatar.ge/api/studio/library?limit=40', { headers }));
      expect(res.headers.get('server-timing')).toBeNull();
      expect(res.headers.get('x-myavatar-trace')).toBeNull();
      expect(res.headers.get('cache-control')).toBe('private, no-store');
    }
  });
});

describe('POST — signed-in only, and only URLs the caller can already read', () => {
  test('anonymous → 401, nothing filed (no demo-library write)', async () => {
    mockUser = null;
    const res = await POST(post({ url: 'https://replicate.delivery/x/out.mp4', kind: 'film' }));
    expect(res.status).toBe(401);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test('a manual save is never filed as a document (only the PDF route files those)', async () => {
    const res = await POST(post({ url: 'https://replicate.delivery/x/out.pdf', kind: 'document' }));
    expect(res.status).toBe(200);
    expect(saved()).toEqual([expect.objectContaining({ serviceType: 'film' })]);
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

describe('POST — one file, one Library row', () => {
  test('a storage object the caller already has (the remix route filed it) is answered as saved, with no second row', async () => {
    const url = signed('renders', 'remix/1700-out.mp4');
    mockRows = [row('vremix:restyle:job-1', `${OWN}/storage/v1/object/sign/renders/remix/1700-out.mp4?token=SERVER`)];
    const res = await POST(post({ url, kind: 'film' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, already: true });
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test('a new object is filed as before', async () => {
    const res = await POST(post({ url: signed('renders', 'remix/new.mp4'), kind: 'film' }));
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });
});

describe('stars (§4.2.4): the account’s, in public.library_favorites, never a write to generation_jobs', () => {
  const read = async (qs = 'limit=40') => {
    const res = await GET(new NextRequest(`https://myavatar.ge/api/studio/library?${qs}`));
    return { res, body: (await res.json()) as { items: Array<{ id: string; favorite?: boolean }>; error?: string; demo?: boolean } };
  };
  const patch = (body: unknown) => PATCH(new NextRequest('https://myavatar.ge/api/studio/library', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));

  test('a signed-in page says which works are starred, from one read of the page’s ids', async () => {
    mockRows = [row('a', signed('renders', 'a.mp4')), row('vremix:productad:b', signed('renders', 'b.mp4')), row('c', signed('renders', 'c.mp4'))];
    mockFavRows = [{ job_id: 'vremix:productad:b' }];
    const { body } = await read();
    expect(body.items.map((i) => [i.id, i.favorite])).toEqual([['a', false], ['vremix:productad:b', true], ['c', false]]);
    expect(mockFavWrites).toHaveLength(0);
    expect(mockSelects).toContainEqual(['library_favorites', 'job_id']);
  });

  test('stars that cannot be read leave `favorite` out; the page still loads', async () => {
    mockRows = [row('a', signed('renders', 'a.mp4'))];
    mockFavError = { message: 'relation "public.library_favorites" does not exist' };
    const { res, body } = await read();
    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).not.toHaveProperty('favorite');
  });

  test('the demo library has no stars, and is never asked for them', async () => {
    mockUser = null;
    mockRows = [row('demo-1', signed('renders', 'd.mp4'), { user_id: 'demo-user' })];
    const { body } = await read();
    expect(body.demo).toBe(true);
    expect(body.items[0]).not.toHaveProperty('favorite');
    expect(mockSelects.some(([t]) => t === 'library_favorites')).toBe(false);
  });

  test('favorite=1 reads only the starred works, through an inner join on the caller’s own stars, paged and ordered like any tab', async () => {
    mockRows = [row('a', signed('renders', 'a.mp4')), row('b', signed('renders', 'b.mp4'))];
    const { res, body } = await read('favorite=1&limit=12&offset=12');
    expect(res.status).toBe(200);
    expect(body.items.map((i) => [i.id, i.favorite])).toEqual([['a', true], ['b', true]]);
    expect(mockSelects.find(([t]) => t === 'generation_jobs')?.[1]).toMatch(/,library_favorites!inner\(job_id\)$/);
    expect(mockPaging).toEqual([['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['range', 12, 23]]);
    expect(mockFilters).toContainEqual(['eq', 'user_id', USER]);
  });

  test('favorite=1 without the table: 503 favorites_unavailable, never an empty Favorites tab', async () => {
    mockQueryError = { message: 'Could not find a relationship between generation_jobs and library_favorites' };
    const { res, body } = await read('favorite=1&limit=12');
    expect(res.status).toBe(503);
    expect(body).toEqual({ items: [], error: 'favorites_unavailable' });
  });

  test('favorite=1 signed out: no stars, nothing read', async () => {
    mockUser = null;
    const { res, body } = await read('favorite=1&limit=12');
    expect(res.status).toBe(200);
    expect(body).toEqual({ items: [], demo: true, nextCursor: null });
    expect(mockSelects).toEqual([]);
  });

  test('star: only a finished Library work the caller’s own session can read, upserted with the CALLER’s id', async () => {
    mockRows = [row('vremix:restyle:j1', signed('renders', 'r.mp4'))];
    const res = await patch({ id: 'vremix:restyle:j1', favorite: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ success: true, favorite: true, ids: ['vremix:restyle:j1'] });
    expect(mockFilters).toEqual(expect.arrayContaining([
      ['in', 'id', ['vremix:restyle:j1']], ['eq', 'user_id', USER], ['eq', 'status', 'completed'], ['neq', 'service_type', 'voice'],
    ]));
    expect(mockFavWrites).toEqual([{
      op: 'upsert', rows: [{ user_id: USER, job_id: 'vremix:restyle:j1' }], opts: { onConflict: 'user_id,job_id', ignoreDuplicates: true }, filters: [],
    }]);
    expect(mockUpdates).toEqual([]); // the work's own row is never written (its updated_at would move)
  });

  test('star a work that is not the caller’s: 404, nothing written', async () => {
    mockRows = [];
    const res = await patch({ id: 'someone-elses-job', favorite: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'not_found' });
    expect(mockFavWrites).toEqual([]);
  });

  test('a batch (a browser’s old stars) stars only the caller’s own works and names only those', async () => {
    mockRows = [row('mine-1', signed('renders', 'm1.mp4')), row('mine-2', signed('renders', 'm2.mp4'))];
    const res = await patch({ ids: ['mine-1', 'theirs', 'mine-2', 'mine-1'], favorite: true });
    expect(await res.json()).toEqual({ success: true, favorite: true, ids: ['mine-1', 'mine-2'] });
    expect(mockFilters).toContainEqual(['in', 'id', ['mine-1', 'theirs', 'mine-2']]);
    expect(mockFavWrites[0]?.rows).toEqual([{ user_id: USER, job_id: 'mine-1' }, { user_id: USER, job_id: 'mine-2' }]);
  });

  test('a batch with none of the caller’s works: 200 with no ids, nothing written', async () => {
    const res = await patch({ ids: ['theirs-1', 'theirs-2'], favorite: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, favorite: true, ids: [] });
    expect(mockFavWrites).toEqual([]);
  });

  test('unstar deletes only the caller’s own stars', async () => {
    const res = await patch({ id: 'a', favorite: false });
    expect(await res.json()).toEqual({ success: true, favorite: false, ids: ['a'] });
    expect(mockFavWrites).toEqual([{ op: 'delete', filters: [['eq', 'user_id', USER], ['in', 'job_id', ['a']]] }]);
    expect(mockUpdates).toEqual([]);
  });

  test('signed out: 401, nothing read or written', async () => {
    mockUser = null;
    const res = await patch({ id: 'a', favorite: true });
    expect(res.status).toBe(401);
    expect(mockSelects).toEqual([]);
    expect(mockFavWrites).toEqual([]);
  });

  test.each([
    ['no favorite flag', { id: 'a' }],
    ['a non-boolean flag', { id: 'a', favorite: 'yes' }],
    ['no id', { favorite: true }],
    ['an empty batch', { ids: [], favorite: true }],
    ['a batch over 200', { ids: Array.from({ length: 201 }, (_, i) => `j${i}`), favorite: true }],
    ['an id that could break a filter', { id: 'a),user_id.neq.(x', favorite: true }],
    ['a non-string id in a batch', { ids: ['a', 7], favorite: true }],
  ])('400 for %s', async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(mockSelects).toEqual([]);
    expect(mockFavWrites).toEqual([]);
  });

  test('the table cannot be written (not applied yet, or no service role): 503, never a silent success', async () => {
    mockRows = [row('a', signed('renders', 'a.mp4'))];
    mockFavError = { message: 'relation "public.library_favorites" does not exist' };
    expect((await patch({ id: 'a', favorite: true })).status).toBe(503);
    expect((await patch({ id: 'a', favorite: false })).status).toBe(503);
    mockFavError = null;
    mockNoService = true;
    const res = await patch({ id: 'a', favorite: true });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ success: false, error: 'favorites_unavailable' });
  });
});
