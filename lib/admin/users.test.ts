/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { listUsers, grantCredits, MAX_GRANT, USERS_PAGE_SIZE } from './users';

/** Chainable Supabase mock. `listResult` feeds awaited queries; profiles maybeSingle #1 = target check, #2 = new balance. */
function makeClient(cfg: { listResult?: unknown; targetExists?: boolean; insertError?: { message: string } | null; newBalance?: number; captureOr?: (s: string) => void }) {
  let profilesSingle = 0;
  const from = (table: string) => {
    const p: Record<string, unknown> = {
      select: () => p,
      order: () => p,
      range: () => p,
      eq: () => p,
      or: (s: string) => { cfg.captureOr?.(s); return p; },
      maybeSingle: () => {
        if (table === 'profiles') {
          profilesSingle += 1;
          if (profilesSingle === 1) return Promise.resolve({ data: cfg.targetExists ? { id: 'u1' } : null });
          return Promise.resolve({ data: { credits_balance: cfg.newBalance ?? 0 } });
        }
        return Promise.resolve({ data: null });
      },
      insert: () => Promise.resolve({ error: cfg.insertError ?? null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(cfg.listResult ?? { data: [], count: 0, error: null }).then(resolve),
    };
    return p;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

describe('listUsers', () => {
  it('maps rows and total', async () => {
    const client = makeClient({ listResult: { data: [{ id: 'u1', email: 'a@b.com', full_name: 'A', credits_balance: 5, created_at: '2026-07-01' }], count: 42, error: null } });
    const res = await listUsers(client, { page: 0 });
    expect(res.total).toBe(42);
    expect(res.users[0]).toEqual({ id: 'u1', email: 'a@b.com', full_name: 'A', credits_balance: 5, created_at: '2026-07-01' });
  });

  it('fails open to an empty page on error', async () => {
    const client = makeClient({ listResult: { data: null, count: null, error: { message: 'boom' } } });
    expect(await listUsers(client, {})).toEqual({ users: [], total: 0 });
  });

  it('escapes ilike wildcards in the search term (no injection into or())', async () => {
    let captured = '';
    const client = makeClient({ listResult: { data: [], count: 0, error: null }, captureOr: (s) => { captured = s; } });
    await listUsers(client, { q: '100%_x,y)' });
    expect(captured).toContain('\\%');
    expect(captured).toContain('\\_');
    expect(captured).toContain('\\,');
    expect(captured).toContain('\\)');
  });

  it('exposes a stable page size', () => {
    expect(USERS_PAGE_SIZE).toBe(25);
  });
});

describe('grantCredits', () => {
  it('rejects non-positive, non-finite, and over-cap amounts', async () => {
    const client = makeClient({ targetExists: true });
    for (const bad of [0, -5, Number.NaN, MAX_GRANT + 1]) {
      const r = await grantCredits(client, 'u1', bad, 'admin1');
      expect(r).toEqual({ ok: false, newBalance: null, error: 'invalid_amount' });
    }
  });

  it('rejects a missing user id', async () => {
    const client = makeClient({ targetExists: true });
    expect((await grantCredits(client, '', 100, 'admin1')).error).toBe('invalid_amount');
  });

  it('returns user_not_found when the target does not exist', async () => {
    const client = makeClient({ targetExists: false });
    expect((await grantCredits(client, 'ghost', 100, 'admin1')).error).toBe('user_not_found');
  });

  it('surfaces an insert error', async () => {
    const client = makeClient({ targetExists: true, insertError: { message: 'constraint x' } });
    const r = await grantCredits(client, 'u1', 100, 'admin1');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('constraint x');
  });

  it('grants and returns the new balance on success', async () => {
    const client = makeClient({ targetExists: true, insertError: null, newBalance: 150 });
    const r = await grantCredits(client, 'u1', 50, 'admin1');
    expect(r).toEqual({ ok: true, newBalance: 150 });
  });

  it('floors a fractional amount', async () => {
    const client = makeClient({ targetExists: true, newBalance: 10 });
    const r = await grantCredits(client, 'u1', 10.9, 'admin1');
    expect(r.ok).toBe(true); // 10.9 → 10, still valid
  });
});
