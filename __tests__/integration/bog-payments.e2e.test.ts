/**
 * @jest-environment node
 *
 * Bank of Georgia payments, end to end — run by scripts/bog-e2e.sh (skipped in a plain `jest` run).
 *
 * Everything on our side is the real code: the route handlers, supabase-js, the settlement engine, and the money
 * functions in a real Postgres (tests/sql/bog — code-identical to Production's). Only two things are stand-ins:
 *   · BOG itself — a fake api.bog.ge below (OAuth, orders, saved cards, receipts, renewals) that signs its callbacks
 *     with a throwaway RSA key, exactly as BOG signs them (SHA256withRSA over the raw body, Callback-Signature);
 *   · Supabase's gateway — a 30-line proxy that maps /rest/v1 to a local PostgREST and answers /auth/v1/user for
 *     test bearer tokens, so the routes' real auth path (Bearer → auth.getUser) runs.
 * No network, no credentials, no Production anything.
 */
import http from 'node:http';
import { createHmac, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));
// @t3-oss/env-nextjs ships ESM only (jest cannot load it); the env it validates is plain process.env here.
jest.mock('@t3-oss/env-nextjs', () => ({
  createEnv: () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? process.env[k] : undefined) }),
}));

const POSTGREST = process.env.BOG_E2E_POSTGREST;
const JWT_SECRET = process.env.BOG_E2E_JWT_SECRET;
const run = POSTGREST && JWT_SECRET ? describe : describe.skip;

// ─── fake BOG ────────────────────────────────────────────────────────────────────────────────────────────────
const BOG = 'http://fake-bog.test';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

interface FakeOrder {
  id: string;
  external: string;
  amount: number;
  status: 'created' | 'completed' | 'rejected' | 'refunded';
  saveCard: boolean;
  parent: string | null;
  currency: string;
  transferAmount?: number;
}
const bank = {
  orders: new Map<string, FakeOrder>(),
  savedCards: new Set<string>(),
  calls: [] as string[],
  oauthRefuses: false,
  seq: 0,
  idemSeen: new Map<string, string>(),
};
function resetBank() {
  bank.orders.clear();
  bank.savedCards.clear();
  bank.calls.length = 0;
  bank.oauthRefuses = false;
  bank.idemSeen.clear();
}
const reply = (status: number, body: unknown) =>
  new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function receiptOf(o: FakeOrder) {
  return {
    order_id: o.id,
    external_order_id: o.external,
    order_status: { key: o.status },
    purchase_units: { request_amount: String(o.amount), transfer_amount: String(o.transferAmount ?? (o.status === 'completed' ? o.amount : 0)), currency_code: o.currency },
    payment_detail: {
      transfer_method: { key: 'card' },
      payer_identifier: '548888xxxxxx9893',
      saved_card_type: o.saveCard && o.status === 'completed' ? 'subscription' : null,
      parent_order_id: o.parent,
      code: o.status === 'rejected' ? '107' : '100',
      code_description: o.status === 'rejected' ? 'Insufficient funds' : 'Successful payment',
    },
    reject_reason: o.status === 'rejected' ? 'Insufficient funds' : null,
  };
}

async function fakeBog(url: string, init: RequestInit = {}): Promise<Response> {
  const path = url.slice(BOG.length);
  const method = (init.method ?? 'GET').toUpperCase();
  bank.calls.push(`${method} ${path.replace(/\/[0-9a-f-]{36}/g, '/:id')}`);
  if (path === '/oauth') {
    const auth = new Headers(init.headers).get('authorization') ?? '';
    const ok = auth === `Basic ${Buffer.from('e2e-client:e2e-secret').toString('base64')}`;
    if (bank.oauthRefuses || !ok) return reply(401, { error: 'invalid_client', error_description: 'e2e-secret was refused' });
    return reply(200, { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 });
  }
  const h = new Headers(init.headers);
  if (h.get('authorization') !== 'Bearer tok') return reply(401, {});
  const idem = h.get('idempotency-key');
  const body = init.body ? JSON.parse(String(init.body)) : {};

  if (method === 'POST' && path === '/ecommerce/orders') {
    if (idem && bank.idemSeen.has(idem)) return reply(200, { id: bank.idemSeen.get(idem), _links: { redirect: { href: `https://payment.bog.ge/?order_id=${bank.idemSeen.get(idem)}` } } });
    if (body.purchase_units?.currency !== 'GEL') return reply(400, { message: 'currency' });
    const id = randomUUID();
    bank.orders.set(id, { id, external: body.external_order_id, amount: body.purchase_units.total_amount, status: 'created', saveCard: false, parent: null, currency: 'GEL' });
    if (idem) bank.idemSeen.set(idem, id);
    return reply(200, { id, _links: { redirect: { href: `https://payment.bog.ge/?order_id=${id}` } } });
  }
  let m = path.match(/^\/orders\/([^/]+)\/subscriptions$/);
  if (method === 'PUT' && m) {
    const o = bank.orders.get(decodeURIComponent(m[1]!));
    if (!o) return reply(404, {});
    o.saveCard = true;
    return reply(202, undefined);
  }
  m = path.match(/^\/ecommerce\/orders\/([^/]+)\/subscribe$/);
  if (method === 'POST' && m) {
    const parent = decodeURIComponent(m[1]!);
    if (!bank.savedCards.has(parent)) return reply(400, { message: 'no saved card' });
    if (idem && bank.idemSeen.has(idem)) return reply(200, { id: bank.idemSeen.get(idem) });
    const p = bank.orders.get(parent)!;
    const id = randomUUID();
    bank.orders.set(id, { id, external: body.external_order_id, amount: p.amount, status: 'completed', saveCard: false, parent, currency: 'GEL' });
    if (idem) bank.idemSeen.set(idem, id);
    return reply(200, { id });
  }
  m = path.match(/^\/receipt\/([^/]+)$/);
  if (method === 'GET' && m) {
    const o = bank.orders.get(decodeURIComponent(m[1]!));
    return o ? reply(200, receiptOf(o)) : reply(404, {});
  }
  m = path.match(/^\/charges\/card\/([^/]+)$/);
  if (method === 'DELETE' && m) {
    bank.savedCards.delete(decodeURIComponent(m[1]!));
    return reply(200, {});
  }
  return reply(404, { message: `fake BOG: no route ${method} ${path}` });
}

/** The customer pays (or is declined) on BOG's page. */
function customerPays(bogId: string, outcome: 'completed' | 'rejected' = 'completed') {
  const o = bank.orders.get(bogId)!;
  o.status = outcome;
  if (outcome === 'completed' && o.saveCard) bank.savedCards.add(o.id);
}
function signedCallback(receipt: unknown, opts: { forge?: boolean } = {}) {
  const raw = JSON.stringify({ event: 'order_payment', zoned_request_time: new Date().toISOString(), body: receipt });
  const key = opts.forge ? generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey : privateKey;
  const sig = createSign('RSA-SHA256').update(raw).end().sign(key, 'base64');
  return new NextRequest('http://localhost/api/billing/bog/webhook', { method: 'POST', body: raw, headers: { 'Callback-Signature': sig } });
}

// ─── Supabase gateway stand-in ───────────────────────────────────────────────────────────────────────────────
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function hs256(payload: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${b64url(createHmac('sha256', JWT_SECRET ?? 'x').update(`${head}.${body}`).digest())}`;
}
let gateway: http.Server;
async function startGateway(): Promise<string> {
  gateway = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    if (req.url?.startsWith('/auth/v1/user')) {
      const tok = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
      const id = tok.startsWith('e2e-user-') ? tok.slice('e2e-user-'.length) : null;
      res.writeHead(id ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(id ? { id, aud: 'authenticated', role: 'authenticated', email: `${id}@test.local` } : { msg: 'invalid' }));
      return;
    }
    const target = `${POSTGREST}${(req.url ?? '').replace(/^\/rest\/v1/, '')}`;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !['host', 'content-length', 'connection'].includes(k)) headers[k] = v;
    const up = await realFetch(target, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const out = Buffer.from(await up.arrayBuffer());
    const outHeaders: Record<string, string> = {};
    up.headers.forEach((v, k) => {
      if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) outHeaders[k] = v;
    });
    res.writeHead(up.status, outHeaders);
    res.end(out);
  });
  await new Promise<void>((r) => gateway.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
}

const realFetch: typeof fetch = globalThis.fetch;

// ─── the app ─────────────────────────────────────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
let checkout: any, webhook: any, orderStatus: any, subscription: any, cron: any, svc: any;
const CRON_SECRET = 'e2e-cron-secret';

run('BOG payments end to end (local Postgres + PostgREST, fake BOG)', () => {
  beforeAll(async () => {
    const supabaseUrl = await startGateway();
    Object.assign(process.env, {
      SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: hs256({ role: 'anon' }),
      SUPABASE_SERVICE_ROLE_KEY: hs256({ role: 'service_role' }),
      BOG_CLIENT_ID: 'e2e-client',
      BOG_SECRET_KEY: 'e2e-secret',
      BOG_ENV: 'sandbox',
      BOG_API_BASE: BOG,
      BOG_OAUTH_URL: `${BOG}/oauth`,
      BOG_CALLBACK_PUBLIC_KEY: PUBLIC_PEM,
      NEXT_PUBLIC_SITE_URL: 'https://e2e.myavatar.test',
      CRON_SECRET,
    });
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url.startsWith(BOG) ? fakeBog(url, init) : realFetch(input as any, init);
    }) as typeof fetch;
    checkout = await import('../../app/api/billing/bog/checkout/route');
    webhook = await import('../../app/api/billing/bog/webhook/route');
    orderStatus = await import('../../app/api/billing/bog/orders/[id]/route');
    subscription = await import('../../app/api/billing/bog/subscription/route');
    cron = await import('../../app/api/cron/bog-billing/route');
    svc = (await import('../../lib/supabase/server')).createServiceRoleClient();
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await new Promise((r) => gateway.close(r));
  });
  beforeEach(() => {
    resetBank();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  // ── helpers ──
  async function newUser(): Promise<string> {
    const id = randomUUID();
    // auth.users is outside the REST schema: tests/sql/bog/05_postgrest.sql adds a service-role-only helper.
    const { error } = await svc.rpc('e2e_create_user', { p_id: id });
    if (error) throw new Error(`e2e_create_user: ${error.message}`);
    return id;
  }
  const authed = (user: string, url: string, init: { method?: string; body?: unknown } = {}) =>
    new NextRequest(url, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer e2e-user-${user}`, 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  async function startCheckout(user: string, body: Record<string, unknown>) {
    const res = await checkout.POST(authed(user, 'https://e2e.myavatar.test/api/billing/bog/checkout', { method: 'POST', body: { locale: 'ka', ...body } }));
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
  async function status(user: string, shopOrderId: string) {
    const res = await orderStatus.GET(authed(user, `https://e2e.myavatar.test/api/billing/bog/orders/${shopOrderId}`), { params: { id: shopOrderId } });
    return { status: res.status as number, json: (await res.json()) as any };
  }
  const cronTick = async () =>
    (await (await cron.GET(new NextRequest('https://e2e.myavatar.test/api/cron/bog-billing', { headers: { Authorization: `Bearer ${CRON_SECRET}` } }))).json()) as any;

  // ── E1 ──
  test('E1 top-up: checkout writes the priced row first, the signed callback credits 20 ₾ → 200 credits, exactly once', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 20 });
    expect(c.status).toBe(200);
    expect(c.json.redirectUrl).toMatch(/^https:\/\/payment\.bog\.ge\//);
    const r = await row(c.json.orderId);
    expect(r).toMatchObject({ status: 'pending', kind: 'topup', credits: 200, locale: 'ka' });
    expect(Number(r.amount_gel)).toBe(20);
    expect(r.bog_order_id).toBeTruthy();

    customerPays(r.bog_order_id);
    const cb = await webhook.POST(signedCallback(receiptOf(bank.orders.get(r.bog_order_id)!)));
    expect(cb.status).toBe(200);
    expect(await cb.json()).toMatchObject({ status: 'completed' });
    expect(await balance(u)).toBe(200);

    // BOG (or an attacker replaying a captured callback) delivers it again; the return page and cron also settle.
    expect((await webhook.POST(signedCallback(receiptOf(bank.orders.get(r.bog_order_id)!)))).status).toBe(200);
    expect((await status(u, c.json.orderId)).json).toMatchObject({ status: 'completed', credits: 200, kind: 'topup' });
    await cronTick();
    expect(await balance(u)).toBe(200);
    const { data: ledger } = await svc.from('credit_ledger').select('delta').eq('user_id', u);
    expect(ledger).toEqual([{ delta: 200 }]);
  });

  // ── E2 ──
  test('E2 lost callback: the customer returns, the status route reconciles from the receipt and credits', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 10 });
    customerPays((await row(c.json.orderId)).bog_order_id);
    const s = await status(u, c.json.orderId);
    expect(s.json).toMatchObject({ status: 'completed', credits: 100 });
    expect(await balance(u)).toBe(100);
    expect(bank.calls).toContain('GET /receipt/:id');
  });

  // ── E3 ──
  test('E3 lost callback, customer never returns: the cron reconciles it', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 50 });
    customerPays((await row(c.json.orderId)).bog_order_id);
    await svc.from('bog_orders').update({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq('shop_order_id', c.json.orderId);
    const t = await cronTick();
    expect(t).toMatchObject({ ok: true });
    expect(t.completed).toBeGreaterThanOrEqual(1);
    expect(await balance(u)).toBe(500);
  });

  // ── E4 ──
  test('E4 forged or tampered callback → 401, nothing credited', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 20 });
    const bogId = (await row(c.json.orderId)).bog_order_id;
    const paid = { ...receiptOf(bank.orders.get(bogId)!), order_status: { key: 'completed' } };
    expect((await webhook.POST(signedCallback(paid, { forge: true }))).status).toBe(401);
    const good = signedCallback(receiptOf(bank.orders.get(bogId)!));
    const tampered = new NextRequest(good.url, { method: 'POST', body: (await good.text()).replace('"created"', '"completed"'), headers: { 'Callback-Signature': good.headers.get('callback-signature')! } });
    expect((await webhook.POST(tampered)).status).toBe(401);
    expect(await balance(u)).toBe(0);
    expect((await row(c.json.orderId)).status).toBe('pending');
  });

  // ── E5 ──
  test('E5 a paid receipt for a different amount or currency credits nothing and is held for review', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 50 });
    const bogId = (await row(c.json.orderId)).bog_order_id;
    customerPays(bogId);
    const o = bank.orders.get(bogId)!;
    const cheap = { ...receiptOf(o), purchase_units: { request_amount: '0.50', transfer_amount: '0.50', currency_code: 'GEL' } };
    expect(await (await webhook.POST(signedCallback(cheap))).json()).toMatchObject({ status: 'mismatch' });
    const usd = { ...receiptOf(o), purchase_units: { request_amount: '50', transfer_amount: '50', currency_code: 'USD' } };
    expect(await (await webhook.POST(signedCallback(usd))).json()).toMatchObject({ status: 'mismatch' });
    expect(await balance(u)).toBe(0);
    expect((await row(c.json.orderId)).status).toBe('amount_mismatch');
    expect((await status(u, c.json.orderId)).json.status).toBe('review');
  });

  // ── E6 ──
  test('E6 declined payment: rejected, nothing credited, the customer is told it failed', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 10 });
    const bogId = (await row(c.json.orderId)).bog_order_id;
    customerPays(bogId, 'rejected');
    expect(await (await webhook.POST(signedCallback(receiptOf(bank.orders.get(bogId)!)))).json()).toMatchObject({ status: 'rejected' });
    expect(await balance(u)).toBe(0);
    expect((await status(u, c.json.orderId)).json.status).toBe('failed');
  });

  // ── E7 ──
  test('E7 BOG refuses our credentials: 502, the row says why (env + BOG answer), and never contains the secret', async () => {
    const u = await newUser();
    bank.oauthRefuses = true;
    const { resetBogTokenCache } = await import('../../lib/billing/bogClient');
    resetBogTokenCache();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 10 });
    expect(c.status).toBe(502);
    const { data } = await svc.from('bog_orders').select('status,reject_reason').eq('user_id', u).single();
    expect(data.status).toBe('init_failed');
    expect(data.reject_reason).toMatch(/^init \(sandbox\): oauth HTTP 401/);
    expect(data.reject_reason).not.toContain('e2e-secret');
    expect(data.reject_reason).toContain('[redacted]');
  });

  // ── E8 ──
  test('E8 another user cannot read my order; a malformed id is 404', async () => {
    const u = await newUser();
    const stranger = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 10 });
    expect((await status(stranger, c.json.orderId)).status).toBe(404);
    expect((await status(u, "myavatar-topup-' or 1=1 --")).status).toBe(404);
  });

  // ── E9 ──
  test('E9 plan: Starter 54 ₾ → card saved → 230 credits + renewing plan; the cron renews once on the saved card; cancel stops it', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'plan', tierId: 'starter' });
    expect(c.status).toBe(200);
    expect(c.json.autoRenew).toBe(true);
    const r = await row(c.json.orderId);
    expect(r).toMatchObject({ kind: 'subscription', tier: 'starter', credits: 230, card_saved: true });
    expect(Number(r.amount_gel)).toBe(54);

    // a second checkout for the same live tier is refused only once the first is PAID; first pay it
    customerPays(r.bog_order_id);
    expect(await (await webhook.POST(signedCallback(receiptOf(bank.orders.get(r.bog_order_id)!)))).json()).toMatchObject({ status: 'completed' });
    expect(await balance(u)).toBe(230);
    const again = await startCheckout(u, { kind: 'plan', tierId: 'starter' });
    expect(again.status).toBe(409);

    const planRes = await subscription.GET(authed(u, 'https://e2e.myavatar.test/api/billing/bog/subscription'));
    const plan = (await planRes.json()).plan;
    expect(plan).toMatchObject({ tier: 'starter', status: 'active', autoRenew: true, amountGel: 54, cardMask: '548888xxxxxx9893' });

    // the month is ending: two overlapping cron ticks charge the saved card ONCE
    await svc.from('subscriptions').update({ current_period_end: new Date(Date.now() + 20 * 60_000).toISOString() }).eq('user_id', u);
    const t1 = await cronTick();
    const t2 = await cronTick();
    expect(t1.charged + t2.charged).toBe(1);
    expect(bank.calls.filter((x) => x.startsWith('POST /ecommerce/orders/') && x.endsWith('/subscribe'))).toHaveLength(1);
    const { data: renewals } = await svc.from('bog_orders').select('shop_order_id,bog_order_id,status').eq('user_id', u).eq('kind', 'renewal');
    expect(renewals).toHaveLength(1);
    // BOG's callback for the renewal (the charge completed at BOG)
    const renewalBog = bank.orders.get(renewals[0].bog_order_id)!;
    expect(await (await webhook.POST(signedCallback(receiptOf(renewalBog)))).json()).toMatchObject({ status: 'completed' });
    expect(await balance(u)).toBe(460);
    const { data: sub } = await svc.from('subscriptions').select('current_period_end,renewal_failures').eq('user_id', u).single();
    expect(new Date(sub.current_period_end).getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);

    // cancel auto-renewal: the card is deleted at BOG and nothing is charged again
    const del = await subscription.DELETE(authed(u, 'https://e2e.myavatar.test/api/billing/bog/subscription', { method: 'DELETE' }));
    expect(await del.json()).toEqual({ canceled: 1 });
    expect(bank.calls).toContain(`DELETE /charges/card/:id`);
    await svc.from('subscriptions').update({ current_period_end: new Date(Date.now() + 10 * 60_000).toISOString() }).eq('user_id', u);
    const before = bank.calls.length;
    await cronTick();
    expect(bank.calls.slice(before).some((x) => x.endsWith('/subscribe'))).toBe(false);
  });

  // ── E10 ──
  test('E10 renewal declined three times → past_due, never charged a fourth time', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'plan', tierId: 'creator' });
    const r = await row(c.json.orderId);
    customerPays(r.bog_order_id);
    await webhook.POST(signedCallback(receiptOf(bank.orders.get(r.bog_order_id)!)));
    expect(await balance(u)).toBe(525);
    // the card disappears at the bank (expired / blocked): every renewal charge is refused
    bank.savedCards.clear();
    for (let i = 0; i < 3; i++) {
      await svc.from('subscriptions').update({ current_period_end: new Date(Date.now() + 10 * 60_000).toISOString(), next_attempt_at: null }).eq('user_id', u);
      const t = await cronTick();
      expect(t.refused).toBe(1);
    }
    const { data: sub } = await svc.from('subscriptions').select('status,renewal_failures').eq('user_id', u).single();
    expect(sub).toEqual({ status: 'past_due', renewal_failures: 3 });
    await svc.from('subscriptions').update({ next_attempt_at: null }).eq('user_id', u);
    const before = bank.calls.filter((x) => x.endsWith('/subscribe')).length;
    await cronTick();
    expect(bank.calls.filter((x) => x.endsWith('/subscribe')).length).toBe(before);
    expect(await balance(u)).toBe(525);
  });

  // ── E11 ──
  test('E11 the amount cannot be chosen by the browser: an off-catalogue top-up is refused before BOG hears of it', async () => {
    const u = await newUser();
    const c = await startCheckout(u, { kind: 'topup', amountGel: 0.01 });
    expect(c.status).toBe(400);
    const p = await startCheckout(u, { kind: 'plan', tierId: 'enterprise-free' });
    expect(p.status).toBe(400);
    expect(bank.calls.filter((x) => x === 'POST /ecommerce/orders')).toHaveLength(0);
  });
});
