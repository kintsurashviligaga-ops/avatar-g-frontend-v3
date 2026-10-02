/** @jest-environment node */
/**
 * GET /api/connectors and /api/connectors/files through the real store over an in-memory database: honest states, a guest
 * sees statuses but cannot keep files, owner scoping, the caps, and graceful degradation while the table is not migrated.
 */
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { FakeDb } from '@/lib/research/testing/fakeDb';
import { RESEARCH_DB_OPTIONS } from '@/lib/research/testing/fakes';
import { resetResearchSchemaProbe } from '@/lib/research/capabilities';
import { RESEARCH_FILES_MAX } from '@/lib/research/context';

let mockUser: string | null = 'u1';
let mockDb: FakeDb;
const mockRateKeyed = jest.fn();

jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ supabase: {}, user: mockUser ? { id: mockUser } : null }),
  createServiceRoleClient: () => mockDb,
}));
jest.mock('../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundDebitByRef: jest.fn() }));
jest.mock('../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { READ: { maxRequests: 100, windowMs: 60_000, keyPrefix: 'rl:read' }, WRITE: { maxRequests: 20, windowMs: 60_000, keyPrefix: 'rl:write' } },
  checkRateLimit: async () => null,
  checkRateLimitByKey: (...a: unknown[]) => mockRateKeyed(...a),
}));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../lib/observability/reliability', () => ({ opsMarker: jest.fn() }));

import { GET as connectorsGET } from './route';
import { DELETE, GET as filesGET, POST as filesPOST } from './files/route';

const get = (path: string) => new NextRequest(`https://myavatar.ge${path}`);
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/connectors/files', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const del = (id: string) => new NextRequest(`https://myavatar.ge/api/connectors/files?id=${id}`, { method: 'DELETE' });

beforeEach(() => {
  mockUser = 'u1';
  mockDb = new FakeDb({}, RESEARCH_DB_OPTIONS);
  mockRateKeyed.mockReset().mockResolvedValue(null);
  resetResearchSchemaProbe();
});

describe('GET /api/connectors', () => {
  test('lists every connector with its honest status and the limits', async () => {
    const body = await (await connectorsGET(get('/api/connectors'))).json();
    expect(body.connectors.map((c: { id: string; status: string }) => `${c.id}:${c.status}`)).toEqual([
      'local_files:ready', 'google_drive:soon', 'onedrive:soon', 'notion:soon', 'dropbox:soon',
    ]);
    expect(body.limits).toMatchObject({ maxFiles: RESEARCH_FILES_MAX, maxFileChars: 30_000, maxAttach: 5, maxContextChars: 40_000 });
    expect(JSON.stringify(body)).not.toMatch(/token|secret|oauth|scope/i);
  });

  test('a guest still sees the statuses (no count); with the table absent Local files is "unavailable"', async () => {
    mockUser = null;
    const guest = await (await connectorsGET(get('/api/connectors'))).json();
    expect(guest.connectors[0]).toMatchObject({ id: 'local_files', status: 'ready' });
    expect(guest.connectors[0].fileCount).toBeUndefined();
    mockUser = 'u1';
    resetResearchSchemaProbe();
    mockDb.failNext('research_context_files', 'select', 'relation does not exist', '42P01');
    const none = await (await connectorsGET(get('/api/connectors'))).json();
    expect(none.connectors[0]).toMatchObject({ id: 'local_files', status: 'unavailable' });
    expect(none.connectors[1]).toMatchObject({ id: 'google_drive', status: 'soon' });
  });
});

describe('/api/connectors/files', () => {
  test('a guest gets 401 on every method', async () => {
    mockUser = null;
    expect((await filesGET(get('/api/connectors/files'))).status).toBe(401);
    expect((await filesPOST(post({ name: 'a', text: 'b' }))).status).toBe(401);
    expect((await DELETE(del('11111111-1111-4111-8111-111111111111'))).status).toBe(401);
    expect(mockDb.writes()).toEqual([]);
  });

  test('add → list → delete round trip; the list carries no text', async () => {
    const created = await filesPOST(post({ name: 'brief.pdf', mimeType: 'application/pdf', bytes: 2048, text: 'The brief says something specific.' }));
    expect(created.status).toBe(201);
    const { file } = await created.json();
    expect(file).toMatchObject({ name: 'brief.pdf', chars: 'The brief says something specific.'.length });
    const listed = await (await filesGET(get('/api/connectors/files'))).json();
    expect(listed.files).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain('something specific');
    expect((await DELETE(del(file.id))).status).toBe(200);
    expect((await (await filesGET(get('/api/connectors/files'))).json()).files).toEqual([]);
  });

  test('another account\'s document is invisible and cannot be deleted (404)', async () => {
    const { file } = await (await filesPOST(post({ name: 'mine.txt', text: 'private' }))).json();
    mockUser = 'u2';
    expect((await (await filesGET(get('/api/connectors/files'))).json()).files).toEqual([]);
    expect((await DELETE(del(file.id))).status).toBe(404);
    mockUser = 'u1';
    expect((await (await filesGET(get('/api/connectors/files'))).json()).files).toHaveLength(1);
    expect((await DELETE(del('not-a-uuid'))).status).toBe(404);
  });

  test('unreadable text → 400 empty with a plain message; bad JSON → 400; an oversized body → 413', async () => {
    const empty = await filesPOST(post({ name: 'scan.pdf', text: '   ' }));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ error: 'empty' });
    expect((await filesPOST(post('{nope'))).status).toBe(400);
    expect((await filesPOST(post({ name: 'x', text: 'y'.repeat(500_000) }))).status).toBe(413);
    expect(mockDb.rows('research_context_files')).toHaveLength(0);
  });

  test('the per-account cap → 409 too_many', async () => {
    for (let i = 0; i < RESEARCH_FILES_MAX; i++) expect((await filesPOST(post({ name: `f${i}`, text: `t${i}` }))).status).toBe(201);
    const r = await filesPOST(post({ name: 'extra', text: 'x' }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: 'too_many' });
  });

  test('the daily write limit answers 429 before touching the database', async () => {
    mockRateKeyed.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    expect((await filesPOST(post({ name: 'a', text: 'b' }))).status).toBe(429);
    expect(mockDb.writes()).toEqual([]);
  });

  test('while the table is not migrated every method is 503 unavailable', async () => {
    mockDb.failNext('research_context_files', 'select', 'relation does not exist', '42P01');
    const r = await filesGET(get('/api/connectors/files'));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: 'unavailable' });
    expect(mockDb.writes()).toEqual([]);
  });

  test('error bodies are in the caller\'s language', async () => {
    const ka = await (await filesPOST(post({ name: 's', text: '  ', locale: 'ka' }))).json();
    const ru = await (await filesPOST(post({ name: 's', text: '  ', locale: 'ru' }))).json();
    expect(ka.message).toMatch(/[Ⴀ-ჿ]/);
    expect(ru.message).toMatch(/[Ѐ-ӿ]/);
  });
});
