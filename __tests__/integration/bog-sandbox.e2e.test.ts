/**
 * @jest-environment node
 *
 * Bank of Georgia's REAL sandbox, end to end — run by scripts/bog-sandbox-e2e.sh (locally, or by the "BOG payments
 * E2E" workflow when the repository holds the sandbox pair). Skipped in a plain `jest` run and whenever the pair is
 * missing.
 *
 * Our side is the real code, as in bog-payments.e2e.test.ts: route handlers, supabase-js, the settlement engine and
 * the money functions in a throwaway local Postgres (tests/sql/bog). BOG's side is BOG itself: api-sandbox.bog.ge
 * takes the orders, saves the cards, charges the renewals, refunds, and answers the receipts; a headless Chromium
 * pays on BOG's own payment page with BOG's published test cards (/docs/en/sandbox/payments/test-cards):
 *   4000 0000 0000 0001  everything succeeds (payment, refund, saved-card charges)
 *   4000 0000 0000 0002  the payment is declined (insufficient funds)
 *   4000 0000 0000 0003  the payment and the card save succeed; refunds and saved-card charges are rejected
 *
 * What cannot happen here, by construction (fail-closed, checked before the first request):
 *   · a live BOG host: every request leaving the test process goes to oauth2-sandbox.bog.ge / api-sandbox.bog.ge or to
 *     this machine (127.0.0.1); anything else — api.bog.ge, any Supabase, myavatar.ge, Vercel — throws;
 *   · BOG reaching anything of ours: the callback and return links point at https://bog-sandbox-e2e.invalid, a name
 *     that never resolves (RFC 6761). The callback is therefore always lost, and the suite proves the paths that do not
 *     need it — the return page and the cron settle from BOG's receipt. The signed callback itself is proven in
 *     Production (2026-10-13) and by the isolated suite;
 *   · a secret in the output: the pair comes from the environment, is never printed, and the rows only ever hold
 *     BOG's redacted answers.
 * Screenshots of BOG's page (test cards only) go to BOG_SANDBOX_SHOTS_DIR when set.
 */
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import type { Browser } from 'playwright-core';
import { hs256, startSupabaseGateway, type SupabaseGateway } from './bogE2eGateway';
import { payOnBogPage as payWithChromium } from './bogSandboxPayer';

jest.mock('server-only', () => ({}));
jest.mock('@t3-oss/env-nextjs', () => ({
  createEnv: () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? process.env[k] : undefined) }),
}));
// Every scenario moves real sandbox orders: a CI retry would pay twice and muddle the evidence. One attempt each.
jest.retryTimes(0);

const POSTGREST = process.env.BOG_E2E_POSTGREST;
const JWT_SECRET = process.env.BOG_E2E_JWT_SECRET;
const SANDBOX_ID = process.env.BOG_SANDBOX_CLIENT_ID?.trim();
const SANDBOX_SECRET = process.env.BOG_SANDBOX_SECRET_KEY?.trim();
const SHOTS = process.env.BOG_SANDBOX_SHOTS_DIR?.trim() || '';
const run = POSTGREST && JWT_SECRET && SANDBOX_ID && SANDBOX_SECRET ? describe : describe.skip;

const SANDBOX_HOSTS = new Set(['oauth2-sandbox.bog.ge', 'api-sandbox.bog.ge']);
const ORIGIN = 'https://bog-sandbox-e2e.invalid';
const CARD_OK = '4000000000000001';
const CARD_DECLINED = '4000000000000002';
const CARD_NO_FOLLOW_UPS = '4000000000000003';
const CRON_SECRET = `sandbox-cron-${randomUUID()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const realFetch: typeof fetch = globalThis.fetch;

/** The only places this suite may talk to. Throws (before any byte leaves) for everything else. */
export function assertAllowedTarget(raw: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`sandbox E2E: refused a malformed URL`);
  }
  const host = u.hostname.toLowerCase();
  if (host === '127.0.0.1' || host === 'localhost') return;
  if (u.protocol === 'https:' && SANDBOX_HOSTS.has(host)) return;
  throw new Error(`sandbox E2E: refused ${u.protocol}//${host} — only BOG's sandbox and this machine are reachable`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let checkout: any, orderStatus: any, subscription: any, cron: any, svc: any, bog: any;
let gateway: SupabaseGateway;
let browser: Browser;

run('BOG payments against Bank of Georgia’s real sandbox (local database, Chromium on BOG’s page)', () => {
  jest.setTimeout(300_000);

  beforeAll(async () => {
    gateway = await startSupabaseGateway(POSTGREST!, realFetch);
    Object.assign(process.env, {
      SUPABASE_URL: gateway.url,
      NEXT_PUBLIC_SUPABASE_URL: gateway.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: hs256(JWT_SECRET!, { role: 'anon' }),
      SUPABASE_SERVICE_ROLE_KEY: hs256(JWT_SECRET!, { role: 'service_role' }),
      BOG_ENV: 'sandbox',
      BOG_CLIENT_ID: SANDBOX_ID,
      BOG_SECRET_KEY: SANDBOX_SECRET,
      NEXT_PUBLIC_SITE_URL: ORIGIN,
      CRON_SECRET,
      BOG_CHECKOUT_MODE: 'public',
      BOG_SUBSCRIPTION_MODE: 'public',
    });
    for (const k of ['BOG_API_BASE', 'BOG_OAUTH_URL', 'BOG_CALLBACK_PUBLIC_KEY', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL']) delete process.env[k];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      assertAllowedTarget(url);
      return realFetch(input as any, init);
    }) as typeof fetch;

    bog = await import('../../lib/billing/bogClient');
    const cfg = bog.bogConfig();
    // The app must resolve to the sandbox on its own — no override is set above.
    expect(cfg?.environment).toBe('sandbox');
    expect(new URL(cfg.oauthUrl).hostname).toBe('oauth2-sandbox.bog.ge');
    expect(new URL(cfg.apiBase).hostname).toBe('api-sandbox.bog.ge');

    checkout = await import('../../app/api/billing/bog/checkout/route');
    orderStatus = await import('../../app/api/billing/bog/orders/[id]/route');
    subscription = await import('../../app/api/billing/bog/subscription/route');
    cron = await import('../../app/api/cron/bog-billing/route');
    svc = (await import('../../lib/supabase/server')).createServiceRoleClient();

    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await browser?.close().catch(() => undefined);
    await gateway?.close();
  });

  // ── helpers ──
  async function newUser(): Promise<string> {
    const id = randomUUID();
    const { error } = await svc.rpc('e2e_create_user', { p_id: id });
    if (error) throw new Error(`e2e_create_user: ${error.message}`);
    return id;
  }
  const authed = (user: string, url: string, init: { method?: string; body?: unknown } = {}) =>
    new NextRequest(url, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer e2e-user-${user}`, 'Content-Type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  async function startCheckout(user: string, body: Record<string, unknown>) {
    const res = await checkout.POST(authed(user, `${ORIGIN}/api/billing/bog/checkout`, { method: 'POST', body: { locale: 'ka', ...body } }));
    return { status: res.status as number, json: (await res.json()) as any };
  }
  async function row(shopOrderId: string) {
    const { data } = await svc.from('bog_orders').select('*').eq('shop_order_id', shopOrderId).single();
    return data as any;
  }
  async function balance(user: string): Promise<number> {
    const { data } = await svc.from('profiles').select('credits_balance').eq('id', user).maybeSingle();
    return (data?.credits_balance as number) ?? 0;
  }
  async function ledger(user: string): Promise<number[]> {
    const { data } = await svc.from('credit_ledger').select('delta').eq('user_id', user).order('created_at');
    return ((data ?? []) as Array<{ delta: number }>).map((r) => r.delta);
  }
  async function status(user: string, shopOrderId: string) {
    const res = await orderStatus.GET(authed(user, `${ORIGIN}/api/billing/bog/orders/${shopOrderId}`), { params: { id: shopOrderId } });
    return (await res.json()) as any;
  }
  const cronTick = async () =>
    (await (await cron.GET(new NextRequest(`${ORIGIN}/api/cron/bog-billing`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } }))).json()) as any;
  const receipt = async (bogOrderId: string) => bog.getBogReceipt(bog.bogConfig(), { fetch }, bogOrderId);

  /** The return page's job: poll our status route (which settles from BOG's receipt) until the order is decided. */
  async function settle(user: string, shopOrderId: string, until: (s: string) => boolean, timeoutMs = 90_000) {
    const end = Date.now() + timeoutMs;
    let last: any = null;
    while (Date.now() < end) {
      last = await status(user, shopOrderId);
      if (until(String(last.status))) return last;
      await sleep(3_000);
    }
    throw new Error(`order did not settle in ${timeoutMs / 1000}s: last status ${JSON.stringify(last?.status)}`);
  }
  async function receiptUntil(bogOrderId: string, until: (r: any) => boolean, timeoutMs = 90_000) {
    const end = Date.now() + timeoutMs;
    let last: any = null;
    while (Date.now() < end) {
      last = await receipt(bogOrderId);
      if (last && until(last)) return last;
      await sleep(3_000);
    }
    throw new Error(`BOG's receipt did not reach the expected state in ${timeoutMs / 1000}s: last ${last?.statusKey ?? 'none'}`);
  }
  /** Back-date a row so the cron's time windows pick it up now (reconcile: ≥ 3 min old; refund sweep: checked ≥ 24 h ago). */
  const backdate = (shopOrderId: string, fields: Record<string, number>) =>
    svc
      .from('bog_orders')
      .update(Object.fromEntries(Object.entries(fields).map(([k, ago]) => [k, new Date(Date.now() - ago).toISOString()])))
      .eq('shop_order_id', shopOrderId);

  /** BOG's page, in Chromium (bogSandboxPayer.ts). The browser is started on first use. */
  async function payOnBogPage(redirectUrl: string, card: string, label: string): Promise<string | null> {
    const host = new URL(redirectUrl).hostname;
    expect(host === 'bog.ge' || host.endsWith('.bog.ge')).toBe(true);
    if (!browser) {
      // BOG_SANDBOX_CHROMIUM: a Chromium binary when the one playwright-core pins is not installed (local runs).
      const { chromium } = await import('playwright-core');
      browser = await chromium.launch({ headless: true, executablePath: process.env.BOG_SANDBOX_CHROMIUM?.trim() || undefined });
    }
    return payWithChromium(browser, redirectUrl, card, label, { returnOrigin: ORIGIN, shotsDir: SHOTS || undefined });
  }

  async function refund(bogOrderId: string, amountGel?: number) {
    const cfg = bog.bogConfig();
    const token = await bog.getBogAccessToken(cfg, { fetch });
    expect(token).toBeTruthy();
    const res = await fetch(`${cfg.apiBase}/payment/refund/${encodeURIComponent(bogOrderId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify(amountGel === undefined ? {} : { amount: amountGel }),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, json, text: text.slice(0, 300) };
  }
  const note = (line: string) => process.stdout.write(`    · ${line}\n`);

  // Shared between scenarios: S2's paid top-up is refunded in S6.
  const paid: { user?: string; shop?: string; bog?: string } = {};

  // ── S1 ──
  test('S1 OAuth: BOG’s sandbox accepts the pair (token never printed)', async () => {
    bog.resetBogTokenCache();
    const token = await bog.getBogAccessToken(bog.bogConfig(), { fetch });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });

  // ── S2 ──
  test('S2 top-up 10 ₾ paid with 4000…0001 on BOG’s page → the return page settles it from the receipt: 100 credits, once', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 10 });
    expect(c.status).toBe(200);
    const r = await row(c.json.orderId);
    expect(r).toMatchObject({ status: 'pending', kind: 'topup', credits: 100 });
    expect(r.bog_order_id).toBeTruthy();

    const back = await payOnBogPage(c.json.redirectUrl, CARD_OK, 's2-topup');
    note(`BOG sent the browser back: ${back ? new URL(back).searchParams.get('pay') : 'not within 90 s'}`);
    if (back) expect(new URL(back).searchParams.get('pay')).toBe('success');

    const s = await settle(u, c.json.orderId, (x) => x !== 'pending');
    expect(s).toMatchObject({ status: 'completed', credits: 100, kind: 'topup' });
    expect(await balance(u)).toBe(100);

    const rc = await receipt(r.bog_order_id);
    expect(rc).toMatchObject({ state: 'completed', externalOrderId: c.json.orderId, transferAmount: 10, currency: 'GEL', transferMethod: 'card' });
    expect(rc.transactionId).toBeTruthy();
    note(`receipt: code ${rc.code}, payment_option ${rc.paymentOption}, card ${rc.cardMask}, merchant "${rc.brandKa}" / "${rc.brandEn}"`);

    // the return page again, and the cron: still one credit
    await status(u, c.json.orderId);
    await backdate(c.json.orderId, { created_at: 5 * 60_000 });
    await cronTick();
    expect(await balance(u)).toBe(100);
    expect(await ledger(u)).toEqual([100]);
    Object.assign(paid, { user: u, shop: c.json.orderId, bog: r.bog_order_id });
  });

  // ── S3 ──
  test('S3 declined card 4000…0002 → rejected with BOG’s reason, nothing credited, the customer is told it failed', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 10 });
    expect(c.status).toBe(200);
    const back = await payOnBogPage(c.json.redirectUrl, CARD_DECLINED, 's3-declined');
    note(`BOG sent the browser back: ${back ? new URL(back).searchParams.get('pay') : 'not within 90 s'}`);
    if (back) expect(new URL(back).searchParams.get('pay')).toBe('failed');
    const s = await settle(u, c.json.orderId, (x) => x !== 'pending');
    expect(s.status).toBe('failed');
    const r = await row(c.json.orderId);
    expect(r.status).toBe('rejected');
    expect(r.reject_reason).toBeTruthy();
    note(`decline recorded as: ${r.reject_reason}`);
    expect(await balance(u)).toBe(0);
    expect(await ledger(u)).toEqual([]);
  });

  // ── S4 ──
  test('S4 plan Starter with 4000…0001: BOG accepts the card save → 230 credits; the cron renews on the saved card (MIT) → +230 once; cancel deletes the card', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'plan', tierId: 'starter' });
    expect(c.status).toBe(200);
    // PUT /orders/:id/subscriptions answered 202: BOG takes this order's card for automatic payments.
    expect(c.json.autoRenew).toBe(true);
    const r = await row(c.json.orderId);
    expect(r).toMatchObject({ kind: 'subscription', tier: 'starter', credits: 230, card_saved: true });

    await payOnBogPage(c.json.redirectUrl, CARD_OK, 's4-plan');
    expect(await settle(u, c.json.orderId, (x) => x !== 'pending')).toMatchObject({ status: 'completed', credits: 230 });
    const parent = await receipt(r.bog_order_id);
    note(`parent receipt: saved_card_type ${parent.savedCardType}, payment_option ${parent.paymentOption}`);
    const plan = (await (await subscription.GET(authed(u, `${ORIGIN}/api/billing/bog/subscription`))).json()).plan;
    expect(plan).toMatchObject({ tier: 'starter', status: 'active', autoRenew: true });

    // the month ends: the cron charges the saved card once (BOG: POST /ecommerce/orders/:parent/subscribe)
    await svc.from('subscriptions').update({ current_period_end: new Date(Date.now() + 20 * 60_000).toISOString() }).eq('user_id', u);
    const t1 = await cronTick();
    const t2 = await cronTick();
    note(`renewal ticks: ${JSON.stringify({ charged: t1.charged + t2.charged, refused: t1.refused + t2.refused, retryLater: t1.retryLater + t2.retryLater })}`);
    expect(t1.charged + t2.charged).toBe(1);
    const { data: renewals } = await svc.from('bog_orders').select('shop_order_id,bog_order_id,status').eq('user_id', u).eq('kind', 'renewal');
    expect(renewals).toHaveLength(1);
    expect(renewals[0].bog_order_id).toBeTruthy();

    // no callback can reach us: the cron reconciles the renewal from BOG's receipt
    const renewal = await receiptUntil(renewals[0].bog_order_id, (x) => x.state !== 'pending');
    expect(renewal).toMatchObject({ state: 'completed', parentOrderId: r.bog_order_id });
    note(`renewal receipt: payment_option ${renewal.paymentOption}, amount ${renewal.transferAmount}`);
    await backdate(renewals[0].shop_order_id, { created_at: 5 * 60_000 });
    await cronTick();
    expect((await row(renewals[0].shop_order_id)).status).toBe('completed');
    expect(await balance(u)).toBe(460);
    expect(await ledger(u)).toEqual([230, 230]);
    const { data: sub } = await svc.from('subscriptions').select('current_period_end').eq('user_id', u).single();
    expect(new Date(sub.current_period_end).getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);

    // cancel: the card is deleted at BOG, and nothing is charged again
    const del = await subscription.DELETE(authed(u, `${ORIGIN}/api/billing/bog/subscription`, { method: 'DELETE' }));
    expect(await del.json()).toEqual({ canceled: 1 });
    await svc.from('subscriptions').update({ current_period_end: new Date(Date.now() + 10 * 60_000).toISOString() }).eq('user_id', u);
    expect((await cronTick()).charged).toBe(0);
    expect(await balance(u)).toBe(460);
  });

  // ── S5 ──
  test('S5 plan with 4000…0003: the first month is paid, BOG rejects the automatic charge → no second month, a strike, never a credit', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'plan', tierId: 'starter' });
    expect(c.status).toBe(200);
    await payOnBogPage(c.json.redirectUrl, CARD_NO_FOLLOW_UPS, 's5-plan-0003');
    expect(await settle(u, c.json.orderId, (x) => x !== 'pending')).toMatchObject({ status: 'completed', credits: 230 });

    await svc.from('subscriptions').update({ current_period_end: new Date(Date.now() + 20 * 60_000).toISOString() }).eq('user_id', u);
    const t = await cronTick();
    note(`renewal tick: ${JSON.stringify({ charged: t.charged, refused: t.refused, retryLater: t.retryLater })}`);
    const { data: renewals } = await svc.from('bog_orders').select('shop_order_id,bog_order_id,status,reject_reason').eq('user_id', u).eq('kind', 'renewal');
    expect(renewals).toHaveLength(1);
    if (renewals[0].bog_order_id) {
      // BOG took the charge request and declined it: the receipt says so, and the cron records it.
      const rc = await receiptUntil(renewals[0].bog_order_id, (x) => x.state !== 'pending');
      expect(rc.state).toBe('rejected');
      await backdate(renewals[0].shop_order_id, { created_at: 5 * 60_000 });
      await cronTick();
    }
    const after = await row(renewals[0].shop_order_id);
    note(`renewal row: ${after.status} — ${after.reject_reason}`);
    expect(after.status).toBe('rejected'); // bog_record_renewal_failure: the period's order is closed, one strike
    const { data: sub } = await svc.from('subscriptions').select('renewal_failures,current_period_end').eq('user_id', u).single();
    expect(sub.renewal_failures).toBeGreaterThanOrEqual(1);
    expect(new Date(sub.current_period_end).getTime()).toBeLessThan(Date.now() + 86_400_000);
    expect(await balance(u)).toBe(230);
    expect(await ledger(u)).toEqual([230]);
  });

  // ── S6 ──
  test('S6 refund through BOG’s API (4 ₾, then the rest): the receipt says so, the cron’s refund sweep records it without a callback; credits never move', async () => {
    expect(paid.bog).toBeTruthy(); // S2 must have paid
    const part = await refund(paid.bog!, 4);
    note(`partial refund: HTTP ${part.status} ${part.json?.key ?? part.text}`);
    expect(part.status).toBe(200);
    const rc1 = await receiptUntil(paid.bog!, (x) => x.state === 'refunded_partially' || x.state === 'refunded');
    expect(rc1).toMatchObject({ state: 'refunded_partially', refundAmount: 4 });

    await backdate(paid.shop!, { updated_at: 25 * 3600_000 });
    const t1 = await cronTick();
    expect(t1.refundUpdated).toBeGreaterThanOrEqual(1);
    expect((await row(paid.shop!)).status).toBe('refunded_partially');
    expect((await status(paid.user!, paid.shop!)).status).toBe('refunded_partially');

    const rest = await refund(paid.bog!);
    note(`refund of the rest: HTTP ${rest.status} ${rest.json?.key ?? rest.text}`);
    expect(rest.status).toBe(200);
    const rc2 = await receiptUntil(paid.bog!, (x) => x.state === 'refunded');
    expect(rc2.refundAmount).toBe(10);
    await backdate(paid.shop!, { updated_at: 25 * 3600_000 });
    await cronTick();
    expect((await row(paid.shop!)).status).toBe('refunded');
    // bookkeeping only: the credits stay, nothing is granted again
    expect(await balance(paid.user!)).toBe(100);
    expect(await ledger(paid.user!)).toEqual([100]);
  });

  // ── S7 ──
  test('S7 a refund BOG rejects (card 4000…0003): the order stays paid in our books, credits unchanged', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 10 });
    await payOnBogPage(c.json.redirectUrl, CARD_NO_FOLLOW_UPS, 's7-refund-rejected');
    expect(await settle(u, c.json.orderId, (x) => x !== 'pending')).toMatchObject({ status: 'completed', credits: 100 });
    const bogId = (await row(c.json.orderId)).bog_order_id;

    const res = await refund(bogId);
    note(`refund request: HTTP ${res.status} ${res.json?.key ?? res.text}`);
    await sleep(10_000);
    const rc = await receipt(bogId);
    note(`receipt after the refund attempt: ${rc.statusKey}`);
    expect(['completed', 'refund_requested']).toContain(rc.state);
    await backdate(c.json.orderId, { updated_at: 25 * 3600_000 });
    await cronTick();
    expect(['completed', 'refund_requested']).toContain((await row(c.json.orderId)).status);
    expect(await balance(u)).toBe(100);
    expect(await ledger(u)).toEqual([100]);
  });
});

describe('sandbox E2E guard', () => {
  test('only BOG’s sandbox hosts and this machine are reachable', () => {
    for (const ok of ['https://api-sandbox.bog.ge/payments/v1/receipt/x', 'https://oauth2-sandbox.bog.ge/auth', 'http://127.0.0.1:3000/rest/v1/x']) {
      expect(() => assertAllowedTarget(ok)).not.toThrow();
    }
    for (const bad of [
      'https://api.bog.ge/payments/v1/receipt/x',
      'https://oauth2.bog.ge/auth',
      'http://api-sandbox.bog.ge/payments',
      'https://zwksnayknzggdcenqqxy.supabase.co/rest/v1/x',
      'https://myavatar.ge/api/billing/bog/webhook',
      'https://avatar-g-frontend-v3.vercel.app/',
      'https://api-sandbox.bog.ge.evil.test/',
      'not a url',
    ]) {
      expect(() => assertAllowedTarget(bad)).toThrow(/sandbox E2E: refused/);
    }
  });
});
