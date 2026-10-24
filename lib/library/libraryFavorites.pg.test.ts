/** @jest-environment node */
/**
 * Library stars (§4.2.4) on a REAL Postgres 16 + PostgREST (scripts/lease-isolation/run.sh), through the Library route
 * itself (app/api/studio/library GET and PATCH) with its two clients pointed at the local PostgREST: the signed-in
 * caller's session (RLS) and the service role. generation_jobs is set up as Production has it for that reader
 * (scripts/lease-isolation/library-favorites.setup.sql). Two states:
 *   FAV_PHASE=before — supabase/migrations/20261024a_library_favorites.sql not applied (Production until the owner applies
 *                      it): the Library still loads, with no star on any card; the Favorites tab and a star answer
 *                      503 favorites_unavailable; nothing is written anywhere.
 *   FAV_PHASE=after  — applied (twice): a star is the caller's own row, on their own finished work only, never a write
 *                      to generation_jobs (its updated_at stays put); the Favorites tab joins only the caller's stars;
 *                      nobody but the server writes the table; a deleted work takes its star with it.
 *
 * Opt-in: runs only when LEASE_PG_REST_URL, LEASE_PG_JWT_SECRET and FAV_PHASE are set, and never against a URL that is
 * not on this machine.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const PHASE = process.env.FAV_PHASE ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local && (PHASE === 'before' || PHASE === 'after') ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwtFor(claims: Record<string, unknown>): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ ...claims, iat: now, exp: now + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
function clientAs(claims: Record<string, unknown>): PostgrestClient {
  const jwt = REST && SECRET ? jwtFor(claims) : '';
  return new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } });
}
const service = clientAs({ role: 'service_role' });
const anon = clientAs({ role: 'anon' });
// The suite's two accounts (library-favorites.setup.sql).
const A = '0e000000-0000-4000-8000-00000000fa01';
const B = '0e000000-0000-4000-8000-00000000fa02';
const as = (id: string) => clientAs({ role: 'authenticated', aud: 'authenticated', sub: id });

// The route's clients: the caller's session is the local PostgREST under their JWT, the service role is the local one.
let mockCaller: string | null = A;
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: mockCaller ? as(mockCaller) : anon, user: mockCaller ? { id: mockCaller } : null })),
  createServiceRoleClient: () => service,
}));
jest.mock('../audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: '0e000000-0000-4000-8000-00000000fa0d' }));
jest.mock('../orchestrator/jobs', () => ({
  JOB_COLUMNS: 'id,user_id,service_type,status,current_stage,pct,params,result,signed_url,error,created_at,updated_at',
  recordCompletedAsset: jest.fn(async () => true),
}));

import { NextRequest } from 'next/server';
import { GET, PATCH } from '../../app/api/studio/library/route';

const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co' };
  mockCaller = A;
});
afterAll(() => { process.env = ENV; });

type Item = { id: string; favorite?: boolean };
async function read(qs: string) {
  const res = await GET(new NextRequest(`https://myavatar.ge/api/studio/library?${qs}`));
  return { status: res.status, body: (await res.json()) as { items: Item[]; error?: string; demo?: boolean } };
}
async function star(body: unknown) {
  const res = await PATCH(new NextRequest('https://myavatar.ge/api/studio/library', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  return { status: res.status, body: (await res.json()) as { success: boolean; ids?: string[]; error?: string } };
}
/** One finished work of `owner`, `minutesAgo` old; a public URL, so the route has nothing to sign. */
async function work(owner: string, minutesAgo: number, extra: Record<string, unknown> = {}) {
  const id = `fav_${randomUUID()}`;
  const at = new Date(Date.parse('2026-10-24T08:00:00Z') - minutesAgo * 60_000).toISOString();
  const { error } = await service.from('generation_jobs').insert({
    id, user_id: owner, service_type: 'film', status: 'completed', params: { prompt: id },
    signed_url: `https://cdn.example.com/${id}.mp4`, created_at: at, updated_at: at, ...extra,
  });
  if (error) throw new Error(error.message);
  return id;
}
const starsOf = async (owner: string) => {
  const { data, error } = await service.from('library_favorites').select('job_id').eq('user_id', owner);
  if (error) throw new Error(error.message);
  return (data as { job_id: string }[]).map((r) => r.job_id).sort();
};
const updatedAt = async (id: string) => {
  const { data } = await service.from('generation_jobs').select('updated_at').eq('id', id).single();
  return (data as { updated_at: string }).updated_at;
};

suite(`Library stars on a real PostgREST (${PHASE} 20261024a)`, () => {
  if (PHASE === 'before') {
    it('without the table the Library still loads, every star off; the Favorites tab and a star say they are unavailable', async () => {
      const w = await work(A, 1);
      const before = await updatedAt(w);
      const page = await read('limit=60');
      expect(page.status).toBe(200);
      const card = page.body.items.find((i) => i.id === w);
      expect(card).toBeDefined();
      expect(card).not.toHaveProperty('favorite');

      expect(await read('favorite=1&limit=12&offset=0')).toEqual({ status: 503, body: { items: [], error: 'favorites_unavailable' } });
      expect(await star({ id: w, favorite: true })).toEqual({ status: 503, body: { success: false, error: 'favorites_unavailable' } });
      expect(await star({ id: w, favorite: false })).toEqual({ status: 503, body: { success: false, error: 'favorites_unavailable' } });
      const after = await service.from('generation_jobs').select('updated_at,params').eq('id', w).single();
      expect(after.data).toEqual({ updated_at: before, params: { prompt: w } });
    });
    return;
  }

  it('a star is the caller\'s own row and never a write to the work: its updated_at stays where it was', async () => {
    const w = await work(A, 600); // finished ten hours ago
    const before = await updatedAt(w);
    expect(await star({ id: w, favorite: true })).toEqual({ status: 200, body: { success: true, favorite: true, ids: [w] } });
    expect(await starsOf(A)).toContain(w);
    expect(await updatedAt(w)).toBe(before); // the bell, the task tray and the outbox still see a work ten hours old

    // Twice is still one star.
    expect((await star({ id: w, favorite: true })).status).toBe(200);
    const { data } = await service.from('library_favorites').select('job_id').eq('user_id', A).eq('job_id', w);
    expect(data).toHaveLength(1);

    expect(await star({ id: w, favorite: false })).toEqual({ status: 200, body: { success: true, favorite: false, ids: [w] } });
    expect(await starsOf(A)).not.toContain(w);
    expect(await updatedAt(w)).toBe(before);
  });

  it('only one\'s own finished works can be starred', async () => {
    const theirs = await work(B, 5);
    const running = await work(A, 5, { status: 'processing' });
    const voice = await work(A, 5, { service_type: 'voice' });
    for (const id of [theirs, running, voice, 'fav_missing']) {
      expect(await star({ id, favorite: true })).toEqual({ status: 404, body: { success: false, error: 'not_found' } });
    }
    expect(await starsOf(B)).not.toContain(theirs);
    const mine = await starsOf(A);
    expect(mine).not.toContain(running);
    expect(mine).not.toContain(voice);

    // A batch (the browser's old stars) stars only the caller's own.
    const a1 = await work(A, 7);
    const a2 = await work(A, 8);
    const batch = await star({ ids: [a1, theirs, a2, 'fav_missing'], favorite: true });
    expect(batch.status).toBe(200);
    expect(batch.body.ids!.sort()).toEqual([a1, a2].sort());
    expect(await starsOf(B)).not.toContain(theirs);
    // Nobody else's unstar reaches them either: B's call deletes only B's rows.
    mockCaller = B;
    expect((await star({ ids: [a1, a2], favorite: false })).status).toBe(200);
    expect(await starsOf(A)).toEqual(expect.arrayContaining([a1, a2]));
  });

  it('a page says which of its works are starred; the Favorites tab pages through the caller\'s stars alone, newest first', async () => {
    mockCaller = B;
    const b = await Promise.all([30, 31, 32, 33, 34].map((m) => work(B, m)));
    const other = await work(B, 35);
    for (const id of b) expect((await star({ id, favorite: true })).status).toBe(200);
    // A star row of A's on B's work cannot be made through the route; made by hand, it must still not show for B.
    const { error } = await service.from('library_favorites').insert({ user_id: A, job_id: other });
    expect(error).toBeNull();

    const page = await read('kind=film&limit=60');
    expect(page.status).toBe(200);
    const flags = new Map(page.body.items.map((i) => [i.id, i.favorite]));
    for (const id of b) expect(flags.get(id)).toBe(true);
    expect(flags.get(other)).toBe(false);

    const first = await read('favorite=1&limit=3&offset=0');
    const second = await read('favorite=1&limit=3&offset=3');
    expect(first.status).toBe(200);
    expect(first.body.items.map((i) => i.id)).toEqual(b.slice(0, 3)); // newest first
    expect(second.body.items.map((i) => i.id)).toEqual(b.slice(3));
    expect([...first.body.items, ...second.body.items].every((i) => i.favorite === true)).toBe(true);
    expect([...first.body.items, ...second.body.items].map((i) => i.id)).not.toContain(other);

    // A's Favorites tab: A's star on B's work is not A's work, so it shows nothing of B's.
    mockCaller = A;
    const theirs = await read('favorite=1&limit=60&offset=0');
    expect(theirs.body.items.map((i) => i.id)).not.toContain(other);
    // Signed out: no Favorites at all, and no table read.
    mockCaller = null;
    expect(await read('favorite=1&limit=12&offset=0')).toEqual({ status: 200, body: { items: [], demo: true, nextCursor: null } });
  });

  it('nobody but the server writes the table, and a signed-in reader sees only their own stars', async () => {
    const w = await work(A, 40);
    expect((await star({ id: w, favorite: true })).status).toBe(200);
    const theirs = await work(B, 41);

    const insertA = await as(A).from('library_favorites').insert({ user_id: A, job_id: w });
    expect(insertA.error?.code).toBe('42501');
    const insertB = await as(A).from('library_favorites').insert({ user_id: A, job_id: theirs });
    expect(insertB.error?.code).toBe('42501');
    const del = await as(A).from('library_favorites').delete().eq('job_id', w);
    expect(del.error?.code).toBe('42501');
    expect(await starsOf(A)).toContain(w);

    const anonRead = await anon.from('library_favorites').select('job_id');
    expect(anonRead.error?.code).toBe('42501');

    const own = await as(A).from('library_favorites').select('user_id,job_id');
    expect(own.error).toBeNull();
    expect((own.data as { user_id: string }[]).every((r) => r.user_id === A)).toBe(true);
    expect((own.data as { job_id: string }[]).map((r) => r.job_id)).toContain(w);
    const others = await as(B).from('library_favorites').select('job_id').eq('user_id', A);
    expect(others.data).toEqual([]);
  });

  it('a work its owner deletes takes its star with it', async () => {
    const w = await work(A, 50);
    expect((await star({ id: w, favorite: true })).status).toBe(200);
    // The owner's own delete (their session, RLS's owner-delete policy), as the Library's Delete does.
    const { error } = await as(A).from('generation_jobs').delete().eq('id', w);
    expect(error).toBeNull();
    expect(await starsOf(A)).not.toContain(w);
  });
});
