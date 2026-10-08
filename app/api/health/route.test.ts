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
    delete process.env.ELEVENLABS_API_KEY;
    const { body } = await health();
    expect(body.ok).toBe(true);
    expect(body.providers_missing).toEqual(expect.arrayContaining(['elevenlabs']));
  });
});
