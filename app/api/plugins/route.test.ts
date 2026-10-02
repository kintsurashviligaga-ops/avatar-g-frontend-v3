/** @jest-environment node */
/**
 * GET / PUT /api/plugins over an in-memory table: auth first, ids validated against the real tool list, owner scoping, and
 * graceful degradation while `user_plugin_settings` is not migrated (GET answers `{ available: false }`, never a 500).
 */
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { PLUGGABLE_TOOLS } from '@/lib/plugins/catalog';
import { resetPluginSchemaProbe } from '@/lib/plugins/settings';

type Row = { user_id: string; disabled_tools: string[]; updated_at: string };

/** Just the supabase-js calls lib/plugins/settings.ts makes. Like supabase-js it answers `{ data, error }` and never throws. */
class FakePluginDb {
  rows = new Map<string, Row>();
  missing = false;
  failRead = false;
  failWrite = false;
  writes: Array<{ table: string; row: Row; onConflict?: string }> = [];
  selects: string[] = [];

  from(table: string) {
    return tableApi(this, table);
  }
}

/** One table of the fake (a plain function, so the closures read the database without aliasing `this`). */
function tableApi(db: FakePluginDb, table: string) {
  const relationError = { message: `relation "public.${table}" does not exist`, code: '42P01' };
  return {
    select(cols: string) {
      db.selects.push(`${table}:${cols}`);
      let userId: string | null = null;
      const q = {
        limit: async () => ({ data: db.missing ? null : [...db.rows.values()].slice(0, 1), error: db.missing ? relationError : null }),
        eq(col: string, v: string) { if (col === 'user_id') userId = v; return q; },
        maybeSingle: async () => {
          if (db.missing) return { data: null, error: relationError };
          if (db.failRead) return { data: null, error: { message: 'boom' } };
          const r = userId ? db.rows.get(userId) : undefined;
          return { data: r ? { disabled_tools: r.disabled_tools } : null, error: null };
        },
      };
      return q;
    },
    upsert(row: Row, opts?: { onConflict?: string }) {
      return {
        select: () => ({
          single: async () => {
            if (db.missing) return { data: null, error: relationError };
            if (db.failWrite) return { data: null, error: { message: 'boom' } };
            db.writes.push({ table, row, onConflict: opts?.onConflict });
            db.rows.set(row.user_id, { ...row });
            return { data: { disabled_tools: row.disabled_tools }, error: null };
          },
        }),
      };
    },
  };
}

let mockUser: string | null = 'u1';
let mockDb: FakePluginDb;
const mockRateKeyed = jest.fn();

jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ supabase: {}, user: mockUser ? { id: mockUser } : null }),
  createServiceRoleClient: () => mockDb,
}));
jest.mock('../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { READ: { maxRequests: 100, windowMs: 60_000, keyPrefix: 'rl:read' }, WRITE: { maxRequests: 20, windowMs: 60_000, keyPrefix: 'rl:write' } },
  checkRateLimit: async () => null,
  checkRateLimitByKey: (...a: unknown[]) => mockRateKeyed(...a),
}));

import { GET, PUT } from './route';

const get = () => new NextRequest('https://myavatar.ge/api/plugins');
const put = (body: unknown) => new NextRequest('https://myavatar.ge/api/plugins', {
  method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
});

beforeEach(() => {
  mockUser = 'u1';
  mockDb = new FakePluginDb();
  mockRateKeyed.mockReset().mockResolvedValue(null);
  resetPluginSchemaProbe();
});

describe('auth', () => {
  test('a guest gets 401 auth_required on GET and PUT, and nothing is read or written', async () => {
    mockUser = null;
    const g = await GET(get());
    expect(g.status).toBe(401);
    expect(await g.json()).toMatchObject({ error: 'auth_required' });
    expect((await PUT(put({ disabledTools: ['music'] }))).status).toBe(401);
    expect(mockDb.writes).toEqual([]);
    expect(mockDb.selects).toEqual([]);
  });
});

describe('GET', () => {
  test('no row yet → available with nothing switched off; answers are never cached', async () => {
    const r = await GET(get());
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ available: true, disabledTools: [] });
  });

  test('the table is missing → { available: false } with 200 (an answer, not an error); PUT → 503 and no write', async () => {
    mockDb.missing = true;
    const r = await GET(get());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ available: false });
    const w = await PUT(put({ disabledTools: ['music'] }));
    expect(w.status).toBe(503);
    expect(await w.json()).toMatchObject({ available: false, error: 'unavailable' });
    expect(mockDb.writes).toEqual([]);
  });

  test('the probe is cached briefly, so applying the migration shows up without a deploy', async () => {
    mockDb.missing = true;
    expect(await (await GET(get())).json()).toEqual({ available: false });
    mockDb.missing = false;
    resetPluginSchemaProbe(); // stands in for the 30 s the negative answer is cached
    expect(await (await GET(get())).json()).toEqual({ available: true, disabledTools: [] });
  });

  test('a stored id the studio no longer knows (or the chat) drops out instead of breaking the list', async () => {
    mockDb.rows.set('u1', { user_id: 'u1', disabled_tools: ['remix', 'teleport', 'chat', 'music', 'music'], updated_at: '' });
    expect(await (await GET(get())).json()).toEqual({ available: true, disabledTools: ['music', 'remix'] });
  });

  test('a failed read (table present) → 503 read_failed, not "opening soon"', async () => {
    mockDb.failRead = true;
    const r = await GET(get());
    expect(r.status).toBe(503);
    const body = await r.json();
    expect(body).toEqual({ error: 'read_failed' });
    expect(body.available).toBeUndefined();
  });
});

describe('PUT', () => {
  test('saves the list in the product order, scoped to the caller; GET reads it back; another account sees its own', async () => {
    const r = await PUT(put({ disabledTools: ['remix', 'music'] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ available: true, disabledTools: ['music', 'remix'] });
    expect(mockDb.writes).toHaveLength(1);
    expect(mockDb.writes[0]).toMatchObject({ table: 'user_plugin_settings', onConflict: 'user_id', row: { user_id: 'u1', disabled_tools: ['music', 'remix'] } });
    expect(await (await GET(get())).json()).toEqual({ available: true, disabledTools: ['music', 'remix'] });

    mockUser = 'u2';
    expect(await (await GET(get())).json()).toEqual({ available: true, disabledTools: [] });
    await PUT(put({ disabledTools: [] }));
    expect(mockDb.rows.get('u1')!.disabled_tools).toEqual(['music', 'remix']);
  });

  test('every pluggable tool may be switched off at once; switching all back on stores []', async () => {
    expect(await (await PUT(put({ disabledTools: [...PLUGGABLE_TOOLS] }))).json()).toEqual({ available: true, disabledTools: [...PLUGGABLE_TOOLS] });
    expect(await (await PUT(put({ disabledTools: [] }))).json()).toEqual({ available: true, disabledTools: [] });
  });

  test.each([
    ['an unknown id', { disabledTools: ['teleport'] }],
    ['the chat (always on — it is the hub)', { disabledTools: ['chat'] }],
    ['a duplicate', { disabledTools: ['music', 'music'] }],
    ['a non-string', { disabledTools: [3] }],
    ['not an array', { disabledTools: 'music' }],
    ['a missing list', {}],
    ['an extra key', { disabledTools: [], userId: 'u2' }],
    ['malformed JSON', '{nope'],
    ['a bare array', '["music"]'],
  ])('rejects %s with 400 and writes nothing', async (_name, body) => {
    const r = await PUT(put(body));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid' });
    expect(mockDb.writes).toEqual([]);
  });

  test('a body far larger than any real list → 413 before parsing', async () => {
    const r = await PUT(put({ disabledTools: [], pad: 'x'.repeat(5000) }));
    expect(r.status).toBe(413);
    expect(mockDb.writes).toEqual([]);
  });

  test('a failed write → 503 save_failed (the tab puts the switch back and says so)', async () => {
    mockDb.failWrite = true;
    const r = await PUT(put({ disabledTools: ['music'] }));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'save_failed' });
  });

  test('the per-account limit answers 429 before touching the database', async () => {
    mockRateKeyed.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    expect((await PUT(put({ disabledTools: ['music'] }))).status).toBe(429);
    expect(mockDb.writes).toEqual([]);
    expect(mockRateKeyed).toHaveBeenCalledWith('u1', expect.objectContaining({ keyPrefix: 'rl:plugins:user' }));
  });
});
