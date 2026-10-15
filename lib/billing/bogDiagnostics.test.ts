/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./bogSettlement', () => ({
  BOG_REFUND_STATUSES: ['refund_requested', 'refunded_partially', 'refunded'],
  bogSchemaReady: jest.fn(async () => true),
  bogCallbackUrl: (origin?: string, env?: string) =>
    env === 'sandbox' ? `${origin}/api/billing/bog/webhook` : 'https://myavatar.ge/api/billing/bog/webhook',
  bogSandboxBlocked: (cfg: { environment?: string } | null, env: NodeJS.ProcessEnv) => cfg?.environment === 'sandbox' && Boolean(env.VERCEL_ENV),
}));

import { bogMerchantSeen, bogReadiness, probeBogOAuth } from './bogDiagnostics';

const SECRET = 'S3cr3t-Value-xyz';
const ENV = { BOG_CLIENT_ID: 'client-abcd1234', BOG_SECRET_KEY: SECRET, CRON_SECRET: 'c' } as unknown as NodeJS.ProcessEnv;
const answer = (status: number, body: unknown) =>
  jest.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

describe('probeBogOAuth — one token request, no order', () => {
  test('unconfigured → no request at all', async () => {
    const f = jest.fn();
    const r = await probeBogOAuth({ fetch: f as unknown as typeof fetch }, {} as NodeJS.ProcessEnv);
    expect(r.verdict).toBe('unconfigured');
    expect(f).not.toHaveBeenCalled();
  });

  test('ok → the production OAuth URL, Basic auth, client_credentials; the token is never echoed', async () => {
    const f = answer(200, { access_token: 'TOKEN-123', expires_in: 300 });
    const r = await probeBogOAuth({ fetch: f as unknown as typeof fetch }, ENV);
    expect(r).toMatchObject({ verdict: 'ok', environment: 'production', httpStatus: 200, answer: null });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token');
    expect(init.body).toBe('grant_type=client_credentials');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`client-abcd1234:${SECRET}`).toString('base64')}`);
    expect(JSON.stringify(r)).not.toContain('TOKEN-123');
  });

  test('sandbox env → sandbox host', async () => {
    const f = answer(200, { access_token: 't' });
    await probeBogOAuth({ fetch: f as unknown as typeof fetch }, { ...ENV, BOG_ENV: 'sandbox' });
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('oauth2-sandbox.bog.ge');
  });

  test('401 invalid_client → credentials_refused with a sandbox/production hint; the secret is scrubbed', async () => {
    const f = answer(401, { error: 'invalid_client', error_description: `bad secret ${SECRET}` });
    const r = await probeBogOAuth({ fetch: f as unknown as typeof fetch }, ENV);
    expect(r.verdict).toBe('credentials_refused');
    expect(r.hint).toMatch(/BOG_ENV=sandbox/);
    expect(r.answer).toContain('invalid_client');
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  test.each([
    [403, 'forbidden'],
    [404, 'endpoint_not_found'],
    [503, 'bog_error'],
  ])('HTTP %i → %s', async (status, verdict) => {
    const r = await probeBogOAuth({ fetch: answer(status, 'x') as unknown as typeof fetch }, ENV);
    expect(r.verdict).toBe(verdict);
  });

  test('network failure → no_answer; 2xx without a token → malformed_answer', async () => {
    const boom = jest.fn(async () => {
      throw new Error('ENOTFOUND');
    });
    expect((await probeBogOAuth({ fetch: boom as unknown as typeof fetch }, ENV)).verdict).toBe('no_answer');
    expect((await probeBogOAuth({ fetch: answer(200, { nope: 1 }) as unknown as typeof fetch }, ENV)).verdict).toBe('malformed_answer');
  });

  test('a 2xx answer without access_token shows its keys, never its values (one may be a token)', async () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl';
    const r = await probeBogOAuth({ fetch: answer(200, { token: jwt, token_type: 'bearer' }) as unknown as typeof fetch }, ENV);
    expect(r).toMatchObject({ verdict: 'malformed_answer', answer: 'JSON keys: token, token_type' });
    expect(JSON.stringify(r)).not.toContain(jwt);
    expect((await probeBogOAuth({ fetch: answer(200, '<html>ok</html>') as unknown as typeof fetch }, ENV)).answer).toBe('not JSON (15 bytes)');
  });

  test('a refusal that echoes the credentials back — escaped, or as the Basic header — prints none of them', async () => {
    const secret = 'Se"cr/et+=';
    const env = { ...ENV, BOG_SECRET_KEY: secret };
    const basic = Buffer.from(`client-abcd1234:${secret}`).toString('base64');
    const r = await probeBogOAuth({ fetch: answer(401, { error: 'invalid_client', got: secret, header: `Basic ${basic}`, access_token: 'eyJabcde.eyJfghij.sig' }) as unknown as typeof fetch }, env);
    const out = JSON.stringify(r);
    expect(r.verdict).toBe('credentials_refused');
    expect(out).not.toContain(JSON.stringify(secret).slice(1, -1));
    expect(out).not.toContain(basic);
    expect(out).not.toContain('eyJabcde');
    expect(r.answer).toContain('[redacted]');
  });
});

describe('bogReadiness — what is deployed, no secrets, no user ids', () => {
  const rows = [
    { kind: 'subscription', status: 'init_failed', amount_gel: '54', created_at: '2026-10-06T14:02:00Z', reject_reason: `init (production): oauth HTTP 401 ${SECRET}`, user_id: 'u1' },
    { kind: 'topup', status: 'init_failed', amount_gel: 10, created_at: '2026-10-03T07:38:18Z', reject_reason: null, user_id: 'u2' },
  ];
  // A recording fake: the recent-orders query is select → order → limit; the paid-₾ query adds in + gte.
  const fakeDb = (recent: unknown[], paid: unknown[] = []) => {
    const calls: Array<Record<string, unknown>> = [];
    return {
      calls,
      db: {
        from: () => {
          const q: Record<string, unknown> = {};
          calls.push(q);
          const b = {
            select: (cols: string) => ((q.select = cols), b),
            in: (col: string, vals: unknown[]) => ((q.in = [col, vals]), b),
            gte: (col: string, val: unknown) => ((q.gte = [col, val]), b),
            order: () => b,
            limit: async (n: number) => ((q.limit = n), { data: q.in ? paid : recent, error: null }),
          };
          return b;
        },
      } as never,
    };
  };
  const db = fakeDb(rows).db;

  test('configured production deployment', async () => {
    const r = await bogReadiness(db, ENV);
    expect(r).toMatchObject({
      configured: true,
      environment: 'production',
      clientIdTail: '1234',
      callbackKey: 'published-production',
      callbackUrl: 'https://myavatar.ge/api/billing/bog/webhook',
      apiBase: 'https://api.bog.ge/payments/v1',
      schemaReady: true,
      cronSecretSet: true,
      checkoutMode: 'public',
      subscriptionMode: 'admin',
      sandboxBlocked: false,
      limitsGel: { singleTransaction: 500, per24h: 1000, per30d: 5000 },
      limitScope: 'merchant',
      paidGel: { last24h: 0, last30d: 0, window: 'rolling', capped: false },
      ordersByStatus: { init_failed: 2 },
    });
    expect(r.recentOrders[0]).toEqual({ kind: 'subscription', status: 'init_failed', amountGel: 54, createdAt: '2026-10-06T14:02:00Z', rejectReason: 'init (production): oauth HTTP 401 [redacted]' });
    const out = JSON.stringify(r);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain('client-abcd1234');
    expect(out).not.toContain('u1');
  });

  test('unconfigured deployment still reports the schema and orders', async () => {
    const r = await bogReadiness(db, {} as NodeJS.ProcessEnv);
    expect(r).toMatchObject({ configured: false, environment: null, clientIdTail: null, callbackKey: null, cronSecretSet: false });
    expect(r.recentOrders).toHaveLength(2);
  });

  test('BOG_CHECKOUT_MODE is reported; a typo reads as off', async () => {
    expect((await bogReadiness(db, { ...ENV, BOG_CHECKOUT_MODE: 'admin' })).checkoutMode).toBe('admin');
    expect((await bogReadiness(db, { ...ENV, BOG_CHECKOUT_MODE: 'admim' })).checkoutMode).toBe('off');
    expect((await bogReadiness(db, { ...ENV, BOG_CHECKOUT_MODE: 'admin', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv)).checkoutMode).toBe('off');
    expect((await bogReadiness(db, { ...ENV, BOG_CHECKOUT_MODE: 'admin', VERCEL_ENV: 'production' } as NodeJS.ProcessEnv)).checkoutMode).toBe('admin');
  });

  test('paid ₾ against BOG\'s limits: its own query, every status whose money reached the bank, timed by when it was paid', async () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const paid = [
      { amount_gel: '500', created_at: '2026-10-20T08:00:00Z', credited_at: '2026-10-20T08:01:00Z' },
      // made 25 h ago but paid (credited) 20 h ago → inside the 24 h window
      { amount_gel: 54, created_at: '2026-10-19T11:00:00Z', credited_at: '2026-10-19T16:00:00Z' },
      { amount_gel: 108, created_at: '2026-10-10T10:00:00Z', credited_at: '2026-10-10T10:02:00Z' },
      // amount_mismatch: paid, never credited → timed by created_at
      { amount_gel: 20, created_at: '2026-10-01T00:00:00Z', credited_at: null },
      // paid 33 days ago → outside 30 days
      { amount_gel: 20, created_at: '2026-09-17T00:00:00Z', credited_at: '2026-09-17T00:01:00Z' },
    ];
    const { db: paidDb, calls } = fakeDb([], paid);
    const r = await bogReadiness(paidDb, ENV, now);
    expect(r.paidGel).toEqual({ last24h: 554, last30d: 682, window: 'rolling', capped: false });
    const q = calls.find((c) => c.in)!;
    expect(q.in).toEqual(['status', ['completed', 'refund_requested', 'refunded_partially', 'refunded', 'amount_mismatch']]);
    expect(q.gte).toEqual(['created_at', new Date(now - 31 * 86_400_000).toISOString()]);
    expect(q.select).toBe('amount_gel,created_at,credited_at');
    expect(q.limit).toBe(1000);
  });

  test('1,000 paid orders in the window is flagged (more could not be under the bank\'s 5,000 ₾ / 30 days)', async () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const many = Array.from({ length: 1000 }, () => ({ amount_gel: 5, created_at: '2026-10-19T00:00:00Z', credited_at: null }));
    const r = await bogReadiness(fakeDb([], many).db, ENV, now);
    expect(r.paidGel).toMatchObject({ last30d: 5000, capped: true });
  });

  test('sandbox credentials on a Vercel deployment are reported as blocked; the callback shown is never the live site', async () => {
    const r = await bogReadiness(db, { ...ENV, BOG_ENV: 'sandbox', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv);
    expect(r).toMatchObject({ environment: 'sandbox', sandboxBlocked: true });
    expect(r.callbackUrl).not.toContain('myavatar.ge');
  });
});

describe('bogMerchantSeen — the merchant name on the receipt of the latest paid order (one GET, no order, no money)', () => {
  const RECEIPT = {
    order_id: 'bog-ord-9',
    order_status: { key: 'completed' },
    client: { id: '10001', brand_ka: 'მაიავატარი', brand_en: 'MyAvatar.ge', url: 'https://myavatar.ge' },
  };
  const paidDb = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    const b = {
      select: (cols: string) => ((q.select = cols), b),
      in: (col: string, vals: unknown[]) => ((q.in = [col, vals]), b),
      not: (...a: unknown[]) => ((q.not = a), b),
      order: (...a: unknown[]) => ((q.order = a), b),
      limit: async (n: number) => ((q.limit = n), { data: rows, error: null }),
    };
    return { q, db: { from: () => b } as never };
  };
  const bog = (receipt: unknown, status = 200) => {
    const f = jest.fn(async (url: string) =>
      String(url).includes('/token')
        ? new Response(JSON.stringify({ access_token: 'T', expires_in: 300 }), { status: 200 })
        : new Response(JSON.stringify(receipt), { status }),
    );
    return f;
  };

  test('reads the latest paid order with a BOG id and returns the brand BOG reports', async () => {
    const { q, db } = paidDb([{ bog_order_id: 'bog-ord-9', created_at: '2026-10-13T09:08:08Z' }]);
    const f = bog(RECEIPT);
    const r = await bogMerchantSeen(db, { fetch: f as unknown as typeof fetch }, ENV);
    expect(r).toEqual({ verdict: 'ok', brandKa: 'მაიავატარი', brandEn: 'MyAvatar.ge', orderCreatedAt: '2026-10-13T09:08:08Z' });
    expect(q).toMatchObject({ select: 'bog_order_id,created_at', not: ['bog_order_id', 'is', null], order: ['created_at', { ascending: false }], limit: 1 });
    expect((q.in as unknown[])[1]).toEqual(['completed', 'refund_requested', 'refunded_partially', 'refunded', 'amount_mismatch']);
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls[urls.length - 1]).toBe('https://api.bog.ge/payments/v1/receipt/bog-ord-9');
    // Read-only: nothing but the token request and one GET.
    expect(f.mock.calls.filter((c) => !String(c[0]).includes('/token')).map((c) => (c[1] as RequestInit | undefined)?.method ?? 'GET')).toEqual(['GET']);
  });

  test('nothing paid yet → no_paid_order and no request; BOG silent → no_answer; no credentials → unconfigured', async () => {
    const f = bog(RECEIPT);
    expect((await bogMerchantSeen(paidDb([]).db, { fetch: f as unknown as typeof fetch }, ENV)).verdict).toBe('no_paid_order');
    expect(f).not.toHaveBeenCalled();
    const down = bog({}, 502);
    expect(await bogMerchantSeen(paidDb([{ bog_order_id: 'x', created_at: 't' }]).db, { fetch: down as unknown as typeof fetch }, ENV)).toEqual({
      verdict: 'no_answer',
      brandKa: null,
      brandEn: null,
      orderCreatedAt: 't',
    });
    expect((await bogMerchantSeen(paidDb([]).db, { fetch: f as unknown as typeof fetch }, {} as NodeJS.ProcessEnv)).verdict).toBe('unconfigured');
  });
});
