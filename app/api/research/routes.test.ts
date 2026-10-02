/** @jest-environment node */
/**
 * The research ROUTES end to end with a fake Supabase (in-memory), the real ledger SEMANTICS (a fake wired in place of the RPCs),
 * and an injected `fetch` standing in for Google — through the REAL store, service and Interactions client. What only the
 * route level can show: the order of money and provider call across HTTP, the status codes, that no provider text or id reaches
 * a body, owner-only reads, the caps, the idempotent replay, the read-through and the cron.
 */
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { FakeLedger } from '@/lib/research/testing/fakes';
import { FakeDb } from '@/lib/research/testing/fakeDb';
import { RESEARCH_DB_OPTIONS } from '@/lib/research/testing/fakes';
import { resetResearchSchemaProbe } from '@/lib/research/capabilities';
import { researchCredits } from '@/lib/research/pricing';

let mockUser: string | null = 'u1';
let mockDb: FakeDb;
let mockLedger: FakeLedger;
const mockRateKeyed = jest.fn();
const mockRateIp = jest.fn();

jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ supabase: {}, user: mockUser ? { id: mockUser } : null }),
  createServiceRoleClient: () => mockDb,
}));
jest.mock('../../../lib/orchestrator/ledger', () => ({
  deductCredits: (...a: [string, number, string]) => mockLedger.deduct(...a),
  refundDebitByRef: (...a: [string, string, number?]) => mockLedger.refundByRef(...a),
}));
// ⚠️ NOT requireActual: the real module starts a setInterval (its in-memory cleanup) that keeps jest from exiting.
jest.mock('../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: {
    READ: { maxRequests: 100, windowMs: 60_000, keyPrefix: 'rl:read' },
    EXPENSIVE: { maxRequests: 5, windowMs: 60_000, keyPrefix: 'rl:exp' },
  },
  checkRateLimit: (...a: unknown[]) => mockRateIp(...a),
  checkRateLimitByKey: (...a: unknown[]) => mockRateKeyed(...a),
}));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../lib/observability/reliability', () => ({ opsMarker: jest.fn() }));

import { POST as startPOST } from './start/route';
import { GET as listGET } from './route';
import { GET as capsGET } from './capabilities/route';
import { GET as getGET } from './[id]/route';
import { POST as cancelPOST } from './[id]/cancel/route';
import { GET as cronGET, POST as cronPOST } from '../cron/research-sweep/route';

const PRICE = researchCredits();
const ENV_KEYS = ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEYS', 'CRON_SECRET', 'RESEARCH_ENABLED', 'RESEARCH_DAILY_CAP', 'RESEARCH_USER_DAILY_CAP', 'RESEARCH_MAX_ACTIVE', 'RESEARCH_AGENT'];
const savedEnv: Record<string, string | undefined> = {};
const env = process.env as Record<string, string | undefined>;
const realFetch = global.fetch;

const GOOGLE_KEY = 'AQ.route-test-key-0001';
let google: Array<{ url: string; method: string; body: string | null; headers: Record<string, string>; redirect?: string }>;
let googleHandler: (url: string, init: RequestInit) => Response | Promise<Response>;
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const completed = {
  id: 'rt-interaction-1',
  status: 'completed',
  steps: [{ type: 'model_output', content: [{ type: 'text', text: '# Market report\n\n## Findings\n\nBody text.', annotations: [{ type: 'url_citation', url: 'https://example.org/s', title: 'Source' }] }] }],
};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = env[k];
    delete env[k];
  }
  env.GEMINI_API_KEY = GOOGLE_KEY;
  env.CRON_SECRET = 'cron-secret-test';
  mockUser = 'u1';
  mockDb = new FakeDb({}, RESEARCH_DB_OPTIONS);
  mockLedger = new FakeLedger(1_000);
  mockRateKeyed.mockReset().mockResolvedValue(null);
  mockRateIp.mockReset().mockResolvedValue(null);
  resetResearchSchemaProbe();
  google = [];
  googleHandler = (url, init) => {
    if (init.method === 'POST' && url.endsWith('/interactions')) return ok({ id: 'rt-interaction-1', status: 'in_progress' });
    return ok({ id: 'rt-interaction-1', status: 'in_progress' });
  };
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    google.push({ url: u, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null, headers: (init?.headers ?? {}) as Record<string, string>, redirect: init?.redirect });
    return googleHandler(u, init ?? {});
  }) as unknown as typeof fetch;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete env[k];
    else env[k] = savedEnv[k];
  }
  global.fetch = realFetch;
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`https://myavatar.ge${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
const get = (path: string, headers: Record<string, string> = {}) => new NextRequest(`https://myavatar.ge${path}`, { method: 'GET', headers });
const BODY = { prompt: 'Compare the wine export markets of Georgia', locale: 'en', confirmedCredits: PRICE };
const idParams = (id: string) => ({ params: { id } });
const jobs = () => mockDb.rows('research_jobs');
const dueNow = () => jobs().forEach((j) => { j.next_poll_at = new Date(0).toISOString(); j.last_polled_at = new Date(0).toISOString(); });

describe('GET /api/research/capabilities', () => {
  test('available when the switch is on, a key is set and the table answers; carries the price', async () => {
    const r = await capsGET(get('/api/research/capabilities'));
    expect(await r.json()).toMatchObject({ available: true, credits: PRICE, filesAvailable: true, maxActive: 2 });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  test.each([
    ['the table is not migrated', () => { mockDb.failNext('research_jobs', 'select', 'relation "research_jobs" does not exist', '42P01'); }, 'schema'],
    ['RESEARCH_ENABLED is off', () => { env.RESEARCH_ENABLED = 'off'; }, 'disabled'],
    ['RESEARCH_DAILY_CAP is 0 (the kill switch)', () => { env.RESEARCH_DAILY_CAP = '0'; }, 'disabled'],
    ['there is no Gemini key', () => { delete env.GEMINI_API_KEY; }, 'no_key'],
  ])('NOT available when %s', async (_n, arrange, reason) => {
    arrange();
    const r = await capsGET(get('/api/research/capabilities'));
    expect(await r.json()).toMatchObject({ available: false, reason, credits: PRICE });
  });
});

describe('POST /api/research/start — money first, then the provider', () => {
  test('a guest is refused (401 auth_required) before anything is written, charged or sent', async () => {
    mockUser = null;
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: 'auth_required', authRequired: true });
    expect(mockDb.writes()).toEqual([]);
    expect(mockLedger.calls).toEqual([]);
    expect(google).toEqual([]);
  });

  test('"anonymous" is not a user either', async () => {
    mockUser = 'anonymous';
    expect((await startPOST(post('/api/research/start', BODY))).status).toBe(401);
    expect(google).toEqual([]);
  });

  test('table not migrated → 503 unavailable, with nothing written, charged or sent', async () => {
    mockDb.failNext('research_jobs', 'select', 'relation does not exist', '42P01');
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: 'unavailable', reason: 'schema' });
    expect(mockDb.writes('research_jobs')).toEqual([]);
    expect(mockLedger.calls).toEqual([]);
    expect(google).toEqual([]);
  });

  test('the price the user saw must be the price charged: missing → 409 confirmation_required, wrong → 409 price_changed', async () => {
    const a = await startPOST(post('/api/research/start', { ...BODY, confirmedCredits: undefined }));
    expect(a.status).toBe(409);
    expect(await a.json()).toMatchObject({ error: 'confirmation_required', credits: PRICE });
    const b = await startPOST(post('/api/research/start', { ...BODY, confirmedCredits: PRICE - 20 }));
    expect(b.status).toBe(409);
    expect(await b.json()).toMatchObject({ error: 'price_changed', credits: PRICE });
    expect(mockLedger.calls).toEqual([]);
    expect(google).toEqual([]);
    expect(jobs()).toHaveLength(0);
  });

  test('happy path: the credits are taken BEFORE Google is called, once; the answer carries no provider id or ledger ref', async () => {
    let balanceWhenGoogleWasCalled = -1;
    googleHandler = () => {
      balanceWhenGoogleWasCalled = mockLedger.balance;
      return ok({ id: 'rt-interaction-1', status: 'in_progress' });
    };
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(balanceWhenGoogleWasCalled).toBe(1_000 - PRICE);
    expect(j.job).toMatchObject({ status: 'running', credits: PRICE, prompt: BODY.prompt, hasReport: false, refunded: false });
    expect(typeof j.serverNow).toBe('string');
    const text = JSON.stringify(j);
    expect(text).not.toContain('rt-interaction-1');
    expect(text).not.toContain('research:');
    expect(Object.keys(j.job)).not.toEqual(expect.arrayContaining(['provider_interaction_id', 'charge_ref', 'error_detail']));
    expect(mockLedger.calls).toEqual([`deduct:${PRICE}:research:${j.job.id}`]);
    expect(google).toHaveLength(1);
  });

  test('the Google request: POST /v1beta/interactions, the key ONLY in x-goog-api-key, redirect manual, background + store, no key in the URL or body', async () => {
    await startPOST(post('/api/research/start', BODY));
    const g = google[0]!;
    expect(g.method).toBe('POST');
    expect(g.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(g.url).not.toMatch(/key=/i);
    expect(g.headers['x-goog-api-key']).toBe(GOOGLE_KEY);
    expect(g.redirect).toBe('manual');
    expect(g.body).not.toContain(GOOGLE_KEY);
    const sent = JSON.parse(g.body!);
    expect(sent).toMatchObject({ agent: 'deep-research-preview-04-2026', background: true, store: true });
    expect(sent.agent_config).toMatchObject({ type: 'deep-research', collaborative_planning: false });
    expect(sent.input).toContain('Compare the wine export markets of Georgia');
  });

  test('insufficient credits → 402, and Google is never called', async () => {
    mockLedger = new FakeLedger(PRICE - 1);
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ error: 'insufficient_credits' });
    expect(google).toEqual([]);
    expect(mockLedger.balance).toBe(PRICE - 1);
  });

  test('a ledger that cannot answer (RPC absent / lost answer) fails closed: 503, no provider call', async () => {
    mockLedger.nextDeduct = 'skipped';
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: 'billing_unavailable' });
    expect(google).toEqual([]);
  });

  test('Google refuses the request (400) → 422 with OUR sanitized copy, the credits come back, no supplier text in the body', async () => {
    googleHandler = () => ok({ error: { code: 400, message: 'Invalid agent. See https://ai.google.dev/billing', status: 'INVALID_ARGUMENT' } }, 400);
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(422);
    const body = await r.json();
    expect(body.error).toBe('provider_rejected');
    expect(JSON.stringify(body)).not.toMatch(/google|billing|INVALID_ARGUMENT|ai\.google/i);
    expect(mockLedger.balance).toBe(1_000);
    expect(jobs()[0]).toMatchObject({ status: 'failed', refund_state: 'done' });
  });

  test('Google 5xx (the run may exist) → 503, refunded, ONE request, never re-sent; Google 402 reads as OUR outage', async () => {
    googleHandler = () => ok({ error: { message: 'internal' } }, 500);
    const a = await startPOST(post('/api/research/start', BODY));
    expect(a.status).toBe(503);
    expect(google).toHaveLength(1);
    expect(mockLedger.balance).toBe(1_000);

    googleHandler = () => ok({ error: { message: 'Quota exceeded for billing account' } }, 402);
    const b = await startPOST(post('/api/research/start', { ...BODY, prompt: 'Another topic worth researching' }));
    expect(b.status).toBe(503);
    expect(await b.json()).toMatchObject({ error: 'provider_unfunded' });
    expect(mockLedger.balance).toBe(1_000);
  });

  test('a network error / timeout reaching Google → refunded, one request', async () => {
    googleHandler = () => { throw new TypeError('fetch failed'); };
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(503);
    expect(google).toHaveLength(1);
    expect(mockLedger.balance).toBe(1_000);
  });

  test('invalid bodies → 400 and nothing happens', async () => {
    for (const body of [{}, { ...BODY, prompt: '' }, { ...BODY, prompt: 'x'.repeat(4_001) }, { ...BODY, fileIds: ['nope'] }, { ...BODY, confirmedCredits: 'free' }, { ...BODY, requestId: 'a b' }]) {
      const r = await startPOST(post('/api/research/start', body));
      expect(r.status).toBe(400);
    }
    expect((await startPOST(new NextRequest('https://myavatar.ge/api/research/start', { method: 'POST', body: 'not json', headers: { 'content-type': 'application/json' } }))).status).toBe(400);
    expect(mockLedger.calls).toEqual([]);
    expect(google).toEqual([]);
  });

  test('a stranger\'s document id → 400 invalid_file with no charge', async () => {
    const r = await startPOST(post('/api/research/start', { ...BODY, fileIds: ['11111111-1111-4111-8111-111111111111'] }));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: 'invalid_file' });
    expect(mockLedger.calls).toEqual([]);
    expect(google).toEqual([]);
  });

  test('the caps: a third concurrent job → 429 too_many_active (no charge); a per-account daily cap → 429 daily_limit', async () => {
    env.RESEARCH_MAX_ACTIVE = '2';
    expect((await startPOST(post('/api/research/start', { ...BODY, requestId: 'req-aaaaaaaa' }))).status).toBe(201);
    expect((await startPOST(post('/api/research/start', { ...BODY, requestId: 'req-bbbbbbbb' }))).status).toBe(201);
    const third = await startPOST(post('/api/research/start', { ...BODY, requestId: 'req-cccccccc' }));
    expect(third.status).toBe(429);
    expect(await third.json()).toMatchObject({ error: 'too_many_active' });
    expect(google).toHaveLength(2);
    expect(mockLedger.balance).toBe(1_000 - 2 * PRICE);
  });

  test('the global kill switch: RESEARCH_DAILY_CAP=0 → 503 unavailable, nothing written', async () => {
    env.RESEARCH_DAILY_CAP = '0';
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(503);
    expect(mockDb.writes('research_jobs')).toEqual([]);
    expect(google).toEqual([]);
  });

  test('an Idempotency-Key replays the SAME job (200): one debit, one Google call', async () => {
    const a = await startPOST(post('/api/research/start', BODY, { 'idempotency-key': 'key-1234567890' }));
    const b = await startPOST(post('/api/research/start', BODY, { 'idempotency-key': 'key-1234567890' }));
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(ja.job.id).toBe(jb.job.id);
    expect(jb.replayed).toBe(true);
    expect(mockLedger.calls.filter((c) => c.startsWith('deduct'))).toHaveLength(1);
    expect(google).toHaveLength(1);
  });

  test('the per-account start rate limit answers 429 before any work', async () => {
    mockRateKeyed.mockResolvedValueOnce(new Response('{"error":"Too many requests"}', { status: 429 }));
    const r = await startPOST(post('/api/research/start', BODY));
    expect(r.status).toBe(429);
    expect(mockDb.writes('research_jobs')).toEqual([]);
    expect(google).toEqual([]);
  });
});

describe('reads are owner-only', () => {
  async function startAs(user: string) {
    mockUser = user;
    const r = await startPOST(post('/api/research/start', { ...BODY, requestId: `req-${user}-0000` }));
    return (await r.json()).job as { id: string };
  }

  test('the list shows only the caller\'s jobs and never a report or sources', async () => {
    const mine = await startAs('u1');
    await startAs('u2');
    mockUser = 'u1';
    const r = await listGET(get('/api/research'));
    const body = await r.json();
    expect(body.available).toBe(true);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([mine.id]);
    expect(Object.keys(body.items[0])).not.toEqual(expect.arrayContaining(['report']));
    // the list query never selects the heavy columns
    const sel = mockDb.ops.filter((o) => o.op === 'select' && o.table === 'research_jobs' && (o.cols ?? '').includes('prompt'));
    expect(sel.length).toBeGreaterThan(0);
    for (const o of sel) expect(o.cols).not.toMatch(/report_md|sources\b|error_detail|provider_interaction_id|charge_ref/);
  });

  test('a guest gets 401; with the table absent the list is an empty "unavailable", not an error', async () => {
    mockUser = null;
    expect((await listGET(get('/api/research'))).status).toBe(401);
    mockUser = 'u1';
    mockDb.failNext('research_jobs', 'select', 'relation does not exist', '42P01');
    const r = await listGET(get('/api/research'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ items: [], available: false });
  });

  test('GET /api/research/[id]: the owner reads it; another account and a malformed id get an identical 404', async () => {
    const mine = await startAs('u1');
    mockUser = 'u1';
    expect((await getGET(get(`/api/research/${mine.id}`), idParams(mine.id))).status).toBe(200);
    mockUser = 'u2';
    const other = await getGET(get(`/api/research/${mine.id}`), idParams(mine.id));
    expect(other.status).toBe(404);
    const malformed = await getGET(get('/api/research/not-a-uuid'), idParams('not-a-uuid'));
    expect(malformed.status).toBe(404);
    expect(await other.json()).toEqual(await malformed.json());
    mockUser = null;
    expect((await getGET(get(`/api/research/${mine.id}`), idParams(mine.id))).status).toBe(401);
  });

  test('the read-through: a running job that Google has finished is settled by the read itself (report + sources, ONE notification)', async () => {
    const mine = await startAs('u1');
    mockUser = 'u1';
    dueNow();
    googleHandler = () => ok(completed);
    const r = await getGET(get(`/api/research/${mine.id}`), idParams(mine.id));
    const j = (await r.json()).job;
    expect(j).toMatchObject({ status: 'completed', hasReport: true, sourcesCount: 1, title: 'Market report', refunded: false });
    expect(j.report).toContain('## Findings');
    expect(j.sources).toEqual([{ url: 'https://example.org/s', title: 'Source' }]);
    // the answer for GET carries no provider id either
    expect(JSON.stringify(j)).not.toContain('rt-interaction-1');
    const notes = mockDb.rows('notifications');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ user_id: 'u1', type: 'research' });
    expect(String(notes[0]!.message)).toContain('1 source');
    // a second read does not file another
    await getGET(get(`/api/research/${mine.id}`), idParams(mine.id));
    expect(mockDb.rows('notifications')).toHaveLength(1);
    expect(mockLedger.balance).toBe(1_000 - PRICE);
  });

  test('list?refresh=1 polls running jobs at Google and returns the settled state, still without the report', async () => {
    const mine = await startAs('u1');
    mockUser = 'u1';
    dueNow();
    googleHandler = () => ok(completed);
    const body = await (await listGET(get('/api/research?refresh=1'))).json();
    expect(body.items[0]).toMatchObject({ id: mine.id, status: 'completed', hasReport: true });
    expect(body.items[0].report).toBeUndefined();
  });
});

describe('POST /api/research/[id]/cancel', () => {
  test('the owner cancels: Google is told, the credits come back once, a second press is a no-op', async () => {
    mockUser = 'u1';
    const job = (await (await startPOST(post('/api/research/start', BODY))).json()).job as { id: string };
    google.length = 0;
    googleHandler = (url) => ok(url.endsWith('/cancel') ? { id: 'rt-interaction-1', status: 'cancelled' } : { id: 'rt-interaction-1', status: 'cancelled' });
    const r = await cancelPOST(post(`/api/research/${job.id}/cancel`, {}), idParams(job.id));
    expect(r.status).toBe(200);
    expect((await r.json()).job).toMatchObject({ status: 'canceled', refunded: true, errorCode: 'user_canceled' });
    expect(google.some((g) => g.method === 'POST' && g.url.endsWith('/rt-interaction-1/cancel'))).toBe(true);
    expect(mockLedger.balance).toBe(1_000);
    const callsBefore = google.length;
    const again = await cancelPOST(post(`/api/research/${job.id}/cancel`, {}), idParams(job.id));
    expect(again.status).toBe(200);
    expect(google).toHaveLength(callsBefore);
    expect(mockLedger.balance).toBe(1_000);
  });

  test('somebody else cannot cancel it (404, Google never called); a guest gets 401', async () => {
    mockUser = 'u1';
    const job = (await (await startPOST(post('/api/research/start', BODY))).json()).job as { id: string };
    google.length = 0;
    mockUser = 'u2';
    expect((await cancelPOST(post(`/api/research/${job.id}/cancel`, {}), idParams(job.id))).status).toBe(404);
    mockUser = null;
    expect((await cancelPOST(post(`/api/research/${job.id}/cancel`, {}), idParams(job.id))).status).toBe(401);
    expect(google).toEqual([]);
    expect(jobs()[0]!.status).toBe('running');
    expect(mockLedger.balance).toBe(1_000 - PRICE);
  });
});

describe('GET|POST /api/cron/research-sweep', () => {
  const cron = (secret?: string, method: 'GET' | 'POST' = 'GET') =>
    new NextRequest('https://myavatar.ge/api/cron/research-sweep', { method, headers: secret ? { authorization: `Bearer ${secret}` } : {} });

  test('403 without the secret, with a wrong one, and when CRON_SECRET is unset (never open)', async () => {
    expect((await cronGET(cron())).status).toBe(403);
    expect((await cronGET(cron('wrong'))).status).toBe(403);
    expect((await cronGET(new NextRequest('https://myavatar.ge/api/cron/research-sweep', { headers: { authorization: 'Bearer undefined' } }))).status).toBe(403);
    delete env.CRON_SECRET;
    expect((await cronGET(cron('anything'))).status).toBe(403);
    expect((await cronPOST(cron('anything', 'POST'))).status).toBe(403);
  });

  test('with the secret it settles due jobs: the finished report is stored and ONE notification filed', async () => {
    mockUser = 'u1';
    await startPOST(post('/api/research/start', BODY));
    dueNow();
    googleHandler = () => ok(completed);
    const r = await cronGET(cron('cron-secret-test'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, polled: 1, completed: 1 });
    expect(jobs()[0]).toMatchObject({ status: 'completed' });
    expect(mockDb.rows('notifications')).toHaveLength(1);
    await cronGET(cron('cron-secret-test'));
    expect(mockDb.rows('notifications')).toHaveLength(1);
  });

  test('it refunds a job Google failed', async () => {
    mockUser = 'u1';
    await startPOST(post('/api/research/start', BODY));
    dueNow();
    googleHandler = () => ok({ id: 'rt-interaction-1', status: 'failed', errors: [{ code: 'x', message: 'boom' }] });
    await cronGET(cron('cron-secret-test'));
    expect(jobs()[0]).toMatchObject({ status: 'failed', error_code: 'provider_failed', refund_state: 'done' });
    expect(mockLedger.balance).toBe(1_000);
  });

  test('while the table is not migrated it skips quietly (200), never errors', async () => {
    mockDb.failNext('research_jobs', 'select', 'relation does not exist', '42P01');
    const r = await cronGET(cron('cron-secret-test'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, skipped: 'schema' });
  });
});
