import { test, expect } from '@playwright/test';
import { assertIsolatedSupabase } from './guard';
import { balanceOf, evidence, ledgerOf, liveUser, rest, rows, rpc, signInToken } from './_live';

/**
 * THE DATABASE AND ACCESS CONTRACTS, on the real local stack (PostgREST + GoTrue + Postgres with the Test Schema
 * Baseline) and the real `next start` server. No browser: what an attacker holding the public anon key, or a signed-in
 * ordinary user, can and cannot do — and what the server's own money functions do when called twice.
 */
test.describe('Video Core live — RLS, RPC, starter grant and access contracts', () => {
  test.beforeAll(() => { assertIsolatedSupabase(process.env); });

  test('a confirmed sign-up gets its profile and exactly one 50-credit starter grant (auth triggers + ledger trigger)', async () => {
    for (const key of ['desktop', 'mobile', 'other'] as const) {
      const u = liveUser(key);
      expect(await balanceOf(u.id)).toBe(50);
      const grants = (await ledgerOf(u.id)).filter((r) => r.metadata?.kind === 'signup_bonus');
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({ delta: 50, reason: 'purchase' });
    }
  });

  test('RLS: a signed-in user reads only their own profile, ledger and jobs, and writes none of them', async () => {
    const other = liveUser('other');
    const desktop = liveUser('desktop');
    const token = await signInToken(other.email);
    const me = { token };

    const profiles = await rows<{ id: string }>('profiles?select=id', me);
    expect(profiles.map((p) => p.id)).toEqual([other.id]);
    const ledger = await rows<{ user_id: string }>('credit_ledger?select=user_id', me);
    expect(ledger.length).toBeGreaterThan(0);
    expect(new Set(ledger.map((r) => r.user_id))).toEqual(new Set([other.id]));
    expect(await rows(`profiles?id=eq.${desktop.id}&select=id`, me)).toEqual([]);
    expect(await rows(`credit_ledger?user_id=eq.${desktop.id}&select=id`, me)).toEqual([]);

    // No client writes on money or jobs: a credit to oneself, a balance edit, a forged job row.
    const credit = await rest('credit_ledger', me, { method: 'POST', body: JSON.stringify({ user_id: other.id, delta: 1000, reason: 'purchase' }) });
    expect(credit.status, JSON.stringify(credit.body)).toBeGreaterThanOrEqual(400);
    const edit = await rest(`profiles?id=eq.${other.id}`, me, { method: 'PATCH', body: JSON.stringify({ credits_balance: 99999 }) });
    expect([401, 403, 404].includes(edit.status) || (edit.status === 204 || edit.status === 200)).toBe(true);
    expect(await balanceOf(other.id)).toBe(50); // whatever PostgREST answered, nothing changed
    const job = await rest('generation_jobs', me, { method: 'POST', body: JSON.stringify({ id: 'forged-job', user_id: other.id, service_type: 'film', status: 'processing', params: { _reserve: 999 } }) });
    expect(job.status, JSON.stringify(job.body)).toBeGreaterThanOrEqual(400);
    expect(await rows("generation_jobs?id=eq.forged-job&select=id")).toEqual([]);

    // The anonymous key sees nothing at all.
    for (const t of ['profiles', 'credit_ledger', 'generation_jobs', 'analytics_events', 'agent_evolution_traces']) {
      const r = await rest(`${t}?select=*&limit=1`, 'anon');
      expect(r.status === 200 ? r.body : [], `${t} as anon`).toEqual([]);
    }
    evidence('rls-contract', { user: other.id, ownProfiles: profiles.length, ownLedgerRows: ledger.length, creditInsert: credit.status, balancePatch: edit.status, jobInsert: job.status });
  });

  test('RPC: the money functions and the account lookup refuse anon and users; the service role gets idempotent results', async () => {
    const other = liveUser('other');
    const token = await signInToken(other.email);
    const calls: Record<string, number> = {};
    for (const [fn, args] of [
      ['deduct_credits', { p_user_id: other.id, p_amount: 1, p_ref: 'e2e:probe' }],
      ['deduct_credits_once', { p_user_id: other.id, p_amount: 1, p_ref: 'e2e:probe' }],
      ['refund_credits', { p_user_id: other.id, p_amount: 1, p_ref: 'e2e:probe' }],
      ['auth_account_status', { p_email: other.email }],
    ] as const) {
      for (const as of ['anon', { token }] as const) {
        const r = await rpc(fn, args, as);
        calls[`${fn}:${as === 'anon' ? 'anon' : 'user'}`] = r.status;
        expect(r.status, `${fn} as ${as === 'anon' ? 'anon' : 'user'}: ${JSON.stringify(r.body)}`).toBeGreaterThanOrEqual(400);
      }
    }
    expect(await balanceOf(other.id)).toBe(50);

    // The server's own path (service role): a debit by ref happens once, its refund happens once.
    const ref = `e2e:reserve:${Date.now()}`;
    const first = await rpc('deduct_credits_once', { p_user_id: other.id, p_amount: 7, p_ref: ref });
    const again = await rpc('deduct_credits_once', { p_user_id: other.id, p_amount: 7, p_ref: ref });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ charged: true, balance: 43 });
    expect(again.body).toMatchObject({ charged: false, balance: 43 });
    const twins = await Promise.all(Array.from({ length: 6 }, () => rpc('deduct_credits_once', { p_user_id: other.id, p_amount: 5, p_ref: `${ref}:race` })));
    expect(twins.every((t) => t.status === 200)).toBe(true);
    expect(await balanceOf(other.id)).toBe(38); // six concurrent twins → one debit
    const back = await rpc('refund_credits', { p_user_id: other.id, p_amount: 7, p_ref: `${ref}:refund` });
    const backAgain = await rpc('refund_credits', { p_user_id: other.id, p_amount: 7, p_ref: `${ref}:refund` });
    expect(back.status).toBe(200);
    expect(backAgain.status).toBe(200);
    expect(await balanceOf(other.id)).toBe(45); // refunded once
    const mine = (await ledgerOf(other.id)).filter((r) => String(r.metadata?.ref ?? '').startsWith(ref));
    expect(mine.map((r) => r.delta).sort((a, b) => a - b)).toEqual([-7, -5, 7]);
    evidence('rpc-contract', { refusals: calls, debitOnce: [first.body, again.body], concurrentTwins: 6, ledger: mine.map((r) => ({ delta: r.delta, ref: r.metadata?.ref })) });
  });

  test('access: Agent G media is closed to an ordinary user and to anonymous callers (AGENT_G_MEDIA_EXEC=admin)', async ({ request }) => {
    const other = liveUser('other');
    const token = await signInToken(other.email);
    const asUser = { Authorization: `Bearer ${token}` };
    const cap = await request.get('/api/agent/media/montage', { headers: asUser });
    expect(cap.status()).toBe(200);
    expect(await cap.json()).toMatchObject({ enabled: false });
    const quote = await request.post('/api/agent/media/montage', { headers: asUser, data: { action: 'quote', files: ['omni-uploads/x/a.mp4'] } });
    expect(quote.status()).toBe(404);
    const edit = await request.post('/api/agent/media/edit', { headers: asUser, data: { action: 'quote', file: 'omni-uploads/x/a.mp4', edits: [{ op: 'speed', factor: 2 }] } });
    expect(edit.status()).toBe(404);
    const anon = await request.post('/api/agent/media/montage', { data: { action: 'quote', files: [] } });
    expect([401, 404]).toContain(anon.status());
    const sweep = await request.get('/api/agent/media/sweep');
    expect([401, 403, 404]).toContain(sweep.status());
    // An admin of this run sees the lane open.
    const admin = await signInToken(liveUser('desktop').email);
    const open = await request.get('/api/agent/media/montage', { headers: { Authorization: `Bearer ${admin}` } });
    expect(await open.json()).toMatchObject({ enabled: true });
    evidence('access-contract', { ordinaryCapability: 'enabled:false', ordinaryQuote: quote.status(), ordinaryEdit: edit.status(), anonymousQuote: anon.status(), sweepWithoutSecret: sweep.status(), adminCapability: 'enabled:true' });
  });

  test('storage: the uploads and the renders buckets are private (20261008c, 20261009b)', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(`${url}/storage/v1/bucket`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; public: boolean; file_size_limit: number | null }>;
    const byId = Object.fromEntries(list.map((b) => [b.id, { public: b.public, limit: b.file_size_limit }]));
    expect(byId.uploads).toMatchObject({ public: false, limit: 52428800 });
    expect(byId.renders).toMatchObject({ public: false });
    evidence('buckets', byId);
  });
});
