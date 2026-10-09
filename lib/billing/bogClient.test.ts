/** @jest-environment node */
/**
 * lib/billing/bogClient — the api.bog.ge client, against the request/response shapes in BOG's docs
 * (https://api.bog.ge/docs/en/payments, 2026-10-02). No network: every call goes through an injected fetch.
 */
jest.mock('server-only', () => ({}));

import { createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';
import {
  BOG_PUBLISHED_CALLBACK_KEYS,
  bogConfig,
  bogFullyConfigured,
  bogIdempotencyKey,
  callbackSourceIp,
  chargeSavedCard,
  createBogOrder,
  deleteSavedCard,
  getBogAccessToken,
  getBogReceipt,
  isAllowedBogCallbackIp,
  parseBogCallback,
  parseBogReceipt,
  resetBogTokenCache,
  saveCardForAutomaticPayments,
  tokenLifetimeMs,
  verifyBogCallbackSignature,
  type BogConfig,
} from './bogClient';

const ENV = { BOG_CLIENT_ID: 'client-1', BOG_SECRET_KEY: 'secret-1' } as unknown as NodeJS.ProcessEnv;
const cfg = bogConfig(ENV) as BogConfig;

interface Call { url: string; init: RequestInit }
function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fn = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift() ?? { status: 500 };
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return new Response(text, { status: r.status, headers: { 'content-type': 'application/json' } });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}
const TOKEN = { status: 200, body: { access_token: 'tok-1', token_type: 'Bearer', expires_in: 3600 } };
const header = (c: Call, k: string) => (c.init.headers as Record<string, string>)[k];

beforeEach(() => resetBogTokenCache());

describe('bogConfig', () => {
  test('null without both merchant credentials — nothing can be charged half-configured', () => {
    expect(bogConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(bogConfig({ BOG_CLIENT_ID: 'x' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(bogFullyConfigured({ BOG_SECRET_KEY: 'y' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(bogFullyConfigured(ENV)).toBe(true);
  });

  test('production by default: api.bog.ge hosts and the published live callback key', () => {
    expect(cfg.environment).toBe('production');
    expect(cfg.oauthUrl).toBe('https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token');
    expect(cfg.apiBase).toBe('https://api.bog.ge/payments/v1');
    expect(cfg.callbackPublicKey).toBe(BOG_PUBLISHED_CALLBACK_KEYS.production);
  });

  test('BOG_ENV=sandbox switches every host AND the callback key', () => {
    const s = bogConfig({ ...ENV, BOG_ENV: 'sandbox' } as NodeJS.ProcessEnv) as BogConfig;
    expect(s.environment).toBe('sandbox');
    expect(s.oauthUrl).toBe('https://oauth2-sandbox.bog.ge/auth/realms/bog/protocol/openid-connect/token');
    expect(s.apiBase).toBe('https://api-sandbox.bog.ge/payments/v1');
    expect(s.callbackPublicKey).toBe(BOG_PUBLISHED_CALLBACK_KEYS.sandbox);
  });

  test('overrides: a \\n-escaped key, host bases without a trailing slash, an IP allowlist', () => {
    const c = bogConfig({
      ...ENV,
      BOG_CALLBACK_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\nABC\\n-----END PUBLIC KEY-----',
      BOG_API_BASE: 'https://example.test/payments/v1/',
      BOG_CALLBACK_IP_ALLOWLIST: ' 1.2.3.4 , 5.6.7.8 ',
    } as NodeJS.ProcessEnv) as BogConfig;
    expect(c.callbackPublicKey).toBe('-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----');
    expect(c.apiBase).toBe('https://example.test/payments/v1');
    expect(c.callbackIpAllowlist).toEqual(['1.2.3.4', '5.6.7.8']);
  });

  test('both published keys are real 2048-bit RSA public keys, and they differ', () => {
    for (const pem of Object.values(BOG_PUBLISHED_CALLBACK_KEYS)) {
      const key = createPublicKey(pem);
      expect(key.asymmetricKeyType).toBe('rsa');
      expect(key.asymmetricKeyDetails?.modulusLength).toBe(2048);
    }
    expect(BOG_PUBLISHED_CALLBACK_KEYS.production).not.toBe(BOG_PUBLISHED_CALLBACK_KEYS.sandbox);
  });
});

describe('OAuth token', () => {
  test('expires_in as seconds, epoch ms (the docs’ example) or epoch s — refreshed a minute early, capped at an hour', () => {
    const now = 1_700_000_000_000;
    expect(tokenLifetimeMs(600, now)).toBe(540_000);
    expect(tokenLifetimeMs(now + 600_000, now)).toBe(540_000);
    expect(tokenLifetimeMs(Math.floor(now / 1000) + 600, now)).toBe(540_000);
    expect(tokenLifetimeMs(86_400, now)).toBe(3_600_000);
    expect(tokenLifetimeMs(undefined, now)).toBe(240_000);
    expect(tokenLifetimeMs(now - 5_000, now)).toBe(30_000);
  });

  test('client-credentials with Basic auth; cached across calls; refreshed once expired', async () => {
    let t = 1_000_000;
    const { fetch, calls } = fakeFetch([TOKEN, { status: 200, body: { access_token: 'tok-2', expires_in: 3600 } }]);
    const deps = { fetch, now: () => t };
    expect(await getBogAccessToken(cfg, deps)).toBe('tok-1');
    expect(await getBogAccessToken(cfg, deps)).toBe('tok-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(cfg.oauthUrl);
    expect(header(calls[0], 'Authorization')).toBe(`Basic ${Buffer.from('client-1:secret-1').toString('base64')}`);
    expect(calls[0].init.body).toBe('grant_type=client_credentials');
    t += 3_600_000;
    expect(await getBogAccessToken(cfg, deps)).toBe('tok-2');
    expect(calls).toHaveLength(2);
  });

  test('a refused grant yields no token (fail closed)', async () => {
    const { fetch } = fakeFetch([{ status: 401, body: { error: 'invalid_client' } }]);
    expect(await getBogAccessToken(cfg, { fetch })).toBeNull();
  });
});

describe('createBogOrder', () => {
  const params = {
    externalOrderId: 'myavatar-topup-0123456789abcdef',
    amountGel: 20,
    productId: 'credits-200',
    description: 'MyAvatar — 200 credits',
    callbackUrl: 'https://myavatar.ge/api/billing/bog/webhook',
    successUrl: 'https://myavatar.ge/ka/dashboard?bog=x&pay=success',
    failUrl: 'https://myavatar.ge/ka/dashboard?bog=x&pay=failed',
    locale: 'ka',
  };
  const created = { status: 200, body: { id: 'bog-ord-1', _links: { details: { href: 'https://api.bog.ge/payments/v1/receipt/bog-ord-1' }, redirect: { href: 'https://payment.bog.ge/?order_id=bog-ord-1' } } } };

  test('POST /ecommerce/orders in the documented shape — currency always GEL, deterministic Idempotency-Key', async () => {
    const { fetch, calls } = fakeFetch([TOKEN, created]);
    const r = await createBogOrder(cfg, { fetch }, params);
    expect(r).toEqual({ orderId: 'bog-ord-1', redirectUrl: 'https://payment.bog.ge/?order_id=bog-ord-1' });
    const c = calls[1];
    expect(c.url).toBe('https://api.bog.ge/payments/v1/ecommerce/orders');
    expect(c.init.method).toBe('POST');
    expect(header(c, 'Authorization')).toBe('Bearer tok-1');
    expect(header(c, 'Accept-Language')).toBe('ka');
    expect(header(c, 'Idempotency-Key')).toBe(bogIdempotencyKey(`order:${params.externalOrderId}`));
    const body = JSON.parse(String(c.init.body));
    expect(body).toEqual({
      callback_url: params.callbackUrl,
      external_order_id: params.externalOrderId,
      capture: 'automatic',
      purchase_units: { currency: 'GEL', total_amount: 20, basket: [{ product_id: 'credits-200', description: params.description, quantity: 1, unit_price: 20 }] },
      redirect_urls: { success: params.successUrl, fail: params.failUrl },
      ttl: 30,
    });
  });

  test('a plan order is card-only (nothing else can be saved for renewals); ru/en get the English page', async () => {
    const { fetch, calls } = fakeFetch([TOKEN, created]);
    await createBogOrder(cfg, { fetch }, { ...params, locale: 'ru', cardOnly: true, ttlMinutes: 99999 });
    const body = JSON.parse(String(calls[1].init.body));
    expect(body.payment_method).toEqual(['card']);
    expect(body.ttl).toBe(1440);
    expect(header(calls[1], 'Accept-Language')).toBe('en');
  });

  test('an expired token is refreshed once and the request repeated with the same Idempotency-Key', async () => {
    const { fetch, calls } = fakeFetch([TOKEN, { status: 401 }, { status: 200, body: { access_token: 'tok-2', expires_in: 3600 } }, created]);
    expect(await createBogOrder(cfg, { fetch }, params)).not.toBeNull();
    expect(header(calls[3], 'Authorization')).toBe('Bearer tok-2');
    expect(header(calls[3], 'Idempotency-Key')).toBe(header(calls[1], 'Idempotency-Key'));
  });

  test('null on an error, a missing id, or a non-https redirect; no request for a non-positive amount', async () => {
    let f = fakeFetch([TOKEN, { status: 400, body: { message: 'bad' } }]);
    expect(await createBogOrder(cfg, { fetch: f.fetch }, params)).toBeNull();
    resetBogTokenCache();
    f = fakeFetch([TOKEN, { status: 200, body: { id: 'x', _links: { redirect: { href: 'http://payment.bog.ge/?order_id=x' } } } }]);
    expect(await createBogOrder(cfg, { fetch: f.fetch }, params)).toBeNull();
    f = fakeFetch([]);
    expect(await createBogOrder(cfg, { fetch: f.fetch }, { ...params, amountGel: 0 })).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  test('a failure says why: the OAuth answer, BOG\'s error body, or no answer — and never echoes the secret', async () => {
    const why = async (responses: Array<{ status: number; body?: unknown }> | 'throw') => {
      resetBogTokenCache();
      const reasons: string[] = [];
      const f =
        responses === 'throw'
          ? ((async () => {
              throw new Error('ECONNRESET');
            }) as unknown as typeof fetch)
          : fakeFetch(responses).fetch;
      expect(await createBogOrder(cfg, { fetch: f }, params, (r) => reasons.push(r))).toBeNull();
      expect(reasons).toHaveLength(1);
      return reasons[0];
    };
    expect(await why([{ status: 401, body: { error: 'unauthorized_client', error_description: 'Invalid client secret secret-1' } }])).toBe(
      'oauth HTTP 401 {"error":"unauthorized_client","error_description":"Invalid client secret [redacted]"}',
    );
    expect(await why('throw')).toBe('oauth: no usable answer (network, timeout or not JSON)');
    expect(await why([TOKEN, { status: 403, body: { message: 'Merchant is not active' } }])).toBe(
      'POST /ecommerce/orders HTTP 403 {"message":"Merchant is not active"}',
    );
    expect(await why([TOKEN, { status: 401 }, { status: 200, body: { access_token: 'tok-2', expires_in: 3600 } }, { status: 401 }])).toBe(
      'POST /ecommerce/orders HTTP 401',
    );
    expect(await why([TOKEN, { status: 200, body: { id: 'x' } }])).toBe('POST /ecommerce/orders HTTP 200 without an order id or an https redirect');
    expect(await why([TOKEN, { status: 400, body: 'x'.repeat(500) }])).toMatch(/^POST \/ecommerce\/orders HTTP 400 "x{139}$/);
  });
});

describe('saved cards', () => {
  test('save for automatic payments = PUT /orders/:id/subscriptions → 202', async () => {
    const { fetch, calls } = fakeFetch([TOKEN, { status: 202 }]);
    expect(await saveCardForAutomaticPayments(cfg, { fetch }, 'bog-ord-1')).toBe(true);
    expect(calls[1].url).toBe('https://api.bog.ge/payments/v1/orders/bog-ord-1/subscriptions');
    expect(calls[1].init.method).toBe('PUT');
  });

  test('a merchant without automatic payments → false (the plan is sold as one month)', async () => {
    const { fetch } = fakeFetch([TOKEN, { status: 403, body: { message: 'forbidden' } }]);
    expect(await saveCardForAutomaticPayments(cfg, { fetch }, 'bog-ord-1')).toBe(false);
  });

  test('charge = POST /ecommerce/orders/:parent/subscribe with our id; amount inherited (not sent)', async () => {
    const { fetch, calls } = fakeFetch([TOKEN, { status: 200, body: { id: 'bog-ord-2', _links: { details: { href: 'x' } } } }]);
    const r = await chargeSavedCard(cfg, { fetch }, { parentOrderId: 'bog-ord-1', externalOrderId: 'myavatar-renew-20261102-1-abc', callbackUrl: 'https://myavatar.ge/api/billing/bog/webhook' });
    expect(r).toEqual({ ok: true, orderId: 'bog-ord-2' });
    expect(calls[1].url).toBe('https://api.bog.ge/payments/v1/ecommerce/orders/bog-ord-1/subscribe');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ callback_url: 'https://myavatar.ge/api/billing/bog/webhook', external_order_id: 'myavatar-renew-20261102-1-abc' });
    expect(header(calls[1], 'Idempotency-Key')).toBe(bogIdempotencyKey('charge:myavatar-renew-20261102-1-abc'));
  });

  test('charge: a 4xx is "refused" (do not retry), a 5xx or no answer is "unavailable" (retry, same key)', async () => {
    let f = fakeFetch([TOKEN, { status: 404, body: { message: 'card not found' } }]);
    expect(await chargeSavedCard(cfg, { fetch: f.fetch }, { parentOrderId: 'p', externalOrderId: 'e', callbackUrl: 'c' })).toEqual({ ok: false, error: 'refused', status: 404 });
    f = fakeFetch([{ status: 503 }]);
    expect(await chargeSavedCard(cfg, { fetch: f.fetch }, { parentOrderId: 'p', externalOrderId: 'e', callbackUrl: 'c' })).toEqual({ ok: false, error: 'unavailable', status: 503 });
  });

  test('delete = DELETE /charges/card/:id; a 404 (already gone) counts as deleted', async () => {
    let f = fakeFetch([TOKEN, { status: 202 }]);
    expect(await deleteSavedCard(cfg, { fetch: f.fetch }, 'bog-ord-1')).toBe(true);
    expect(f.calls[1].url).toBe('https://api.bog.ge/payments/v1/charges/card/bog-ord-1');
    expect(f.calls[1].init.method).toBe('DELETE');
    f = fakeFetch([{ status: 404 }]);
    expect(await deleteSavedCard(cfg, { fetch: f.fetch }, 'bog-ord-1')).toBe(true);
    f = fakeFetch([{ status: 500 }]);
    expect(await deleteSavedCard(cfg, { fetch: f.fetch }, 'bog-ord-1')).toBe(false);
  });
});

// The docs' own receipt example (GET /receipt/:order_id), trimmed to the fields we read.
const DOC_RECEIPT = {
  order_id: 'a767a276-cddd-43ec-9db3-9f9b39eee02d',
  external_order_id: '123456',
  order_status: { key: 'completed', value: 'შესრულებული' },
  purchase_units: { request_amount: '100.5', transfer_amount: '100.5', refund_amount: '0.0', currency_code: 'GEL' },
  payment_detail: {
    transfer_method: { key: 'card', value: 'ბარათით გადახდა' },
    code: '100',
    code_description: 'Successful payment',
    payer_identifier: '548888xxxxxx9893',
    payment_option: 'direct_debit',
    card_expiry_date: '03/24',
    saved_card_type: 'subscription',
    parent_order_id: null,
  },
  reject_reason: null,
};

describe('receipts + callbacks', () => {
  test('parses the documented receipt — strings to numbers, the masked PAN for card payments', () => {
    expect(parseBogReceipt(DOC_RECEIPT)).toEqual({
      orderId: DOC_RECEIPT.order_id,
      externalOrderId: '123456',
      statusKey: 'completed',
      state: 'completed',
      requestAmount: 100.5,
      transferAmount: 100.5,
      currency: 'GEL',
      transferMethod: 'card',
      savedCardType: 'subscription',
      parentOrderId: null,
      paymentOption: 'direct_debit',
      cardMask: '548888xxxxxx9893',
      cardExpiry: '03/24',
      code: '100',
      rejectReason: null,
    });
  });

  test('maps every documented status key; an unknown one is never "completed"', () => {
    const st = (key: string) => parseBogReceipt({ ...DOC_RECEIPT, order_status: { key } })?.state;
    expect([st('created'), st('processing'), st('auth_requested')]).toEqual(['pending', 'pending', 'pending']);
    expect(st('rejected')).toBe('rejected');
    expect([st('refund_requested'), st('refunded'), st('refunded_partially')]).toEqual(['refunded', 'refunded', 'refunded']);
    expect([st('blocked'), st('partial_completed'), st('mystery')]).toEqual(['other', 'other', 'other']);
  });

  test('a rejected receipt carries its reason; a non-card payment has no card mask; no id → null', () => {
    const r = parseBogReceipt({ ...DOC_RECEIPT, order_status: { key: 'rejected' }, reject_reason: 'expiration', payment_detail: { transfer_method: { key: 'bog_p2p' }, payer_identifier: 'GIORGI K' } });
    expect(r?.rejectReason).toBe('expiration');
    expect(r?.cardMask).toBeNull();
    expect(parseBogReceipt({ order_status: { key: 'completed' } })).toBeNull();
  });

  test('a callback is { event, zoned_request_time, body: <receipt> }', () => {
    const cb = parseBogCallback({ event: 'order_payment', zoned_request_time: '2022-11-23T18:06:37.240559Z', body: DOC_RECEIPT });
    expect(cb.event).toBe('order_payment');
    expect(cb.receipt?.orderId).toBe(DOC_RECEIPT.order_id);
  });

  test('GET /receipt/:id → parsed; null when BOG does not answer', async () => {
    let f = fakeFetch([TOKEN, { status: 200, body: DOC_RECEIPT }]);
    expect((await getBogReceipt(cfg, { fetch: f.fetch }, DOC_RECEIPT.order_id))?.state).toBe('completed');
    expect(f.calls[1].url).toBe(`https://api.bog.ge/payments/v1/receipt/${DOC_RECEIPT.order_id}`);
    f = fakeFetch([{ status: 502 }]);
    expect(await getBogReceipt(cfg, { fetch: f.fetch }, 'x')).toBeNull();
  });
});

describe('callback signature (SHA256withRSA over the raw body)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const sign = (body: string) => {
    const s = createSign('RSA-SHA256');
    s.update(body, 'utf8');
    s.end();
    return s.sign(privateKey, 'base64');
  };
  const body = JSON.stringify({ event: 'order_payment', body: DOC_RECEIPT });

  test('verifies a genuine signature; refuses a tampered body, a wrong key and missing inputs', () => {
    expect(verifyBogCallbackSignature(body, sign(body), PUB)).toBe(true);
    expect(verifyBogCallbackSignature(body.replace('100.5', '999.0'), sign(body), PUB)).toBe(false);
    expect(verifyBogCallbackSignature(body, sign(body), BOG_PUBLISHED_CALLBACK_KEYS.production)).toBe(false);
    expect(verifyBogCallbackSignature(body, null, PUB)).toBe(false);
    expect(verifyBogCallbackSignature('', sign(body), PUB)).toBe(false);
    expect(verifyBogCallbackSignature(body, sign(body), 'not a key')).toBe(false);
  });
});

describe('helpers', () => {
  test('Idempotency-Key: a UUID v4 shape, deterministic per seed, different across seeds', () => {
    const k = bogIdempotencyKey('order:myavatar-topup-1');
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(bogIdempotencyKey('order:myavatar-topup-1')).toBe(k);
    expect(bogIdempotencyKey('order:myavatar-topup-2')).not.toBe(k);
  });

  test('IP allowlist is only enforced when configured', () => {
    expect(callbackSourceIp('9.9.9.9, 10.0.0.1', null)).toBe('9.9.9.9');
    expect(callbackSourceIp(null, ' 8.8.8.8 ')).toBe('8.8.8.8');
    expect(isAllowedBogCallbackIp(null, [])).toBe(true);
    expect(isAllowedBogCallbackIp('1.1.1.1', ['1.1.1.1'])).toBe(true);
    expect(isAllowedBogCallbackIp('2.2.2.2', ['1.1.1.1'])).toBe(false);
  });
});
