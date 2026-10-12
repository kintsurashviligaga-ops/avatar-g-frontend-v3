/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./bogSettlement', () => ({
  bogSchemaReady: jest.fn(async () => true),
  bogCallbackUrl: () => 'https://myavatar.ge/api/billing/bog/webhook',
}));

import { bogReadiness, probeBogOAuth } from './bogDiagnostics';

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
});

describe('bogReadiness — what is deployed, no secrets, no user ids', () => {
  const rows = [
    { kind: 'subscription', status: 'init_failed', amount_gel: '54', created_at: '2026-10-06T14:02:00Z', reject_reason: `init (production): oauth HTTP 401 ${SECRET}`, user_id: 'u1' },
    { kind: 'topup', status: 'init_failed', amount_gel: 10, created_at: '2026-10-03T07:38:18Z', reject_reason: null, user_id: 'u2' },
  ];
  const db = {
    from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }),
  } as never;

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
      limitsGel: { singleTransaction: 500, per24h: 1000, per30d: 5000 },
      paidGel: { last24h: 0, last30d: 0 },
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
  });

  test('paid ₾ against BOG\'s rolling limits: completed and refunded count, failed and pending do not', async () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const paid = [
      { kind: 'topup', status: 'completed', amount_gel: '500', created_at: '2026-10-20T08:00:00Z', reject_reason: null },
      { kind: 'renewal', status: 'completed', amount_gel: 54, created_at: '2026-10-19T13:00:00Z', reject_reason: null },
      { kind: 'subscription', status: 'refunded', amount_gel: 108, created_at: '2026-10-10T10:00:00Z', reject_reason: null },
      { kind: 'topup', status: 'pending', amount_gel: 50, created_at: '2026-10-20T11:00:00Z', reject_reason: null },
      { kind: 'topup', status: 'init_failed', amount_gel: 20, created_at: '2026-10-20T11:30:00Z', reject_reason: null },
      { kind: 'topup', status: 'completed', amount_gel: 20, created_at: '2026-09-01T00:00:00Z', reject_reason: null },
    ];
    const paidDb = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: paid, error: null }) }) }) }) } as never;
    const r = await bogReadiness(paidDb, ENV, now);
    expect(r.paidGel).toEqual({ last24h: 554, last30d: 662 });
  });
});
