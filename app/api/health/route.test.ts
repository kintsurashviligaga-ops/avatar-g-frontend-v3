/** @jest-environment node */
/**
 * GET /api/health — the public liveness answer does no I/O; the operator view now fails on what breaks every request
 * (invalid core env, an unreadable database, a Redis error) instead of answering `ok: true, status: "healthy"` always.
 * HTTP stays 200 on every path.
 */
jest.mock('server-only', () => ({}));

let mockOps = true;
jest.mock('../../../lib/security/opsAccess', () => ({ opsCallerAllowed: async () => mockOps }));

let mockDbError: { code?: string; message: string } | null = null;
let mockDbThrows = false;
const mockDbCalls: string[] = [];
jest.mock('../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => {
    if (mockDbThrows) throw new Error('fetch failed: connect ECONNREFUSED secret-host');
    return {
      from: (table: string) => {
        mockDbCalls.push(table);
        return { select: () => ({ limit: async () => ({ data: mockDbError ? null : [{ id: 'x' }], error: mockDbError }) }) };
      },
    };
  },
}));

// Vertex readiness is the transport's own check (lib/ai/google/transport), the one every route runs before a call.
let mockVertex = true;
jest.mock('../../../lib/ai/google/transport', () => ({ googleAiConfigured: () => mockVertex }));

let mockRedisFails = false;
jest.mock('@upstash/redis', () => ({
  Redis: class {
    private store = new Map<string, unknown>();
    async set(k: string, v: unknown) { if (mockRedisFails) throw new Error('redis down'); this.store.set(k, v); }
    async get(k: string) { return this.store.get(k); }
    async del() { return 1; }
  },
}));

import { GET } from './route';

const ENV = { ...process.env };
beforeEach(() => {
  process.env = {
    ...ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    NEXT_PUBLIC_SITE_URL: 'https://myavatar.ge',
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'token',
  };
  mockOps = true;
  mockDbError = null;
  mockDbThrows = false;
  mockRedisFails = false;
  mockVertex = true;
  mockDbCalls.length = 0;
});
afterEach(() => { process.env = { ...ENV }; });

const health = async () => {
  const res = await GET(new Request('https://myavatar.ge/api/health'));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe('GET /api/health', () => {
  it('answers a public caller with liveness only and touches nothing', async () => {
    mockOps = false;
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'healthy' });
    expect(body).not.toHaveProperty('database');
    expect(body).not.toHaveProperty('providers');
    expect(mockDbCalls).toEqual([]);
  });

  it('is healthy for an operator only when env, database and Redis all work', async () => {
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'healthy', env: 'valid', database: 'connected', redis: 'connected' });
    expect(mockDbCalls).toEqual(['profiles']);
  });

  it('is degraded when the database refuses the read, and reports the code only', async () => {
    mockDbError = { code: 'PGRST301', message: 'JWT secret mismatch for secret-host' };
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: false, status: 'degraded', database: 'error', database_error: 'PGRST301' });
    expect(JSON.stringify(body)).not.toContain('secret-host');
  });

  it('is degraded when the database cannot be reached at all', async () => {
    mockDbThrows = true;
    const { body } = await health();
    expect(body).toMatchObject({ ok: false, status: 'degraded', database: 'error', database_error: 'unreachable' });
    expect(JSON.stringify(body)).not.toContain('secret-host');
  });

  it('is degraded, without querying, when the core Supabase env is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { body } = await health();
    expect(body).toMatchObject({ ok: false, status: 'degraded', env: 'invalid', database: 'unconfigured' });
    expect(body.missing).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
    expect(mockDbCalls).toEqual([]);
  });

  it('is degraded on a Redis error, but not merely because Redis is unconfigured', async () => {
    mockRedisFails = true;
    expect((await health()).body).toMatchObject({ ok: false, status: 'degraded', redis: 'error' });
    mockRedisFails = false;
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect((await health()).body).toMatchObject({ ok: true, status: 'healthy', redis: 'unconfigured' });
  });

  it('a missing provider key is listed but does not degrade the deployment', async () => {
    delete process.env.RESEND_API_KEY;
    const { body } = await health();
    expect(body.ok).toBe(true);
    expect(body.providers_missing).toEqual(expect.arrayContaining(['resend']));
  });

  it('reports Vertex readiness, never whether an AI Studio key is set (v3.1: Vertex is the only transport)', async () => {
    process.env.GEMINI_API_KEY = 'aistudio-key';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'aistudio-key-2';
    mockVertex = false;
    const off = (await health()).body;
    expect(off.providers).toMatchObject({ vertex: false });
    expect(off.providers).not.toHaveProperty('gemini');
    expect(off.providers_missing).toEqual(expect.arrayContaining(['vertex']));
    expect(off.ok).toBe(true); // one absent provider degrades its services, not the deployment
    mockVertex = true;
    expect((await health()).body.providers).toMatchObject({ vertex: true });
  });

  it('does not report outside vendors: no generation path may use them, so their absence is not "missing"', async () => {
    Object.assign(process.env, {
      ANTHROPIC_API_KEY: 'a', REPLICATE_API_TOKEN: 'r', NANOBANANA_API_KEY: 'n', ELEVENLABS_API_KEY: 'e', HEYGEN_API_KEY: 'h', XAI_API_KEY: 'x',
    });
    const { body } = await health();
    expect(Object.keys(body.providers as object).sort()).toEqual(['resend', 'sentry', 'stripe', 'vertex']);
    for (const k of ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY']) delete process.env[k];
    expect((await health()).body.providers_missing).not.toEqual(expect.arrayContaining(['anthropic']));
  });
});
