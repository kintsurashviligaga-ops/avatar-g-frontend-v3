/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { generateKeyPairSync, createSign } from 'node:crypto';
import {
  bogConfig,
  getBogAccessToken,
  createBogOrder,
  extractRedirectUrl,
  verifyBogCallbackSignature,
  callbackSourceIp,
  isAllowedBogCallbackIp,
  normalizeBogStatus,
  parseBogCallback,
  bogCreditRef,
  type BogConfig,
} from './bogClient';

/** A mock fetch that records the last call and returns a scripted response. */
function mockFetch(response: { ok: boolean; json?: unknown; status?: number }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.json ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const CFG: BogConfig = {
  clientId: 'client_123',
  secretKey: 'secret_456',
  oauthUrl: 'https://ipay.ge/opay/api/v1/oauth2/token',
  orderUrl: 'https://ipay.ge/sso/api/v1/ecommerce/orders',
  callbackPublicKey: null,
  callbackSignatureHeader: 'Callback-Signature',
  callbackIpAllowlist: [],
};

describe('bogConfig', () => {
  it('returns null when credentials are absent (fail-safe)', () => {
    expect(bogConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(bogConfig({ BOG_CLIENT_ID: 'x' } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it('builds config with defaults + un-escapes a \\n-encoded PEM', () => {
    const cfg = bogConfig({
      BOG_CLIENT_ID: ' id ',
      BOG_SECRET_KEY: ' key ',
      BOG_CALLBACK_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\nABC\\n-----END PUBLIC KEY-----',
      BOG_CALLBACK_IP_ALLOWLIST: '1.2.3.4, 5.6.7.8 ,',
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.clientId).toBe('id');
    expect(cfg!.oauthUrl).toContain('ipay.ge');
    expect(cfg!.callbackPublicKey).toContain('\n');
    expect(cfg!.callbackPublicKey).not.toContain('\\n');
    expect(cfg!.callbackIpAllowlist).toEqual(['1.2.3.4', '5.6.7.8']);
  });
});

describe('getBogAccessToken', () => {
  it('sends Basic auth + client_credentials and returns the token', async () => {
    const m = mockFetch({ ok: true, json: { access_token: 'tok_abc', expires_in: 1800 } });
    const tok = await getBogAccessToken(CFG, { fetch: m.fetch });
    expect(tok).toEqual({ accessToken: 'tok_abc', expiresInSec: 1800 });
    const { url, init } = m.calls[0]!;
    expect(url).toBe(CFG.oauthUrl);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('client_123:secret_456').toString('base64')}`,
    );
    expect(init.body).toBe('grant_type=client_credentials');
  });

  it('returns null on non-ok, missing token, or thrown fetch', async () => {
    expect(await getBogAccessToken(CFG, mockFetch({ ok: false }))).toBeNull();
    expect(await getBogAccessToken(CFG, mockFetch({ ok: true, json: {} }))).toBeNull();
    const throwing = { fetch: (async () => { throw new Error('net'); }) as unknown as typeof fetch };
    expect(await getBogAccessToken(CFG, throwing)).toBeNull();
  });
});

describe('createBogOrder', () => {
  it('forces currency GEL and returns orderId + redirectUrl', async () => {
    const m = mockFetch({ ok: true, json: { order_id: 'ord_1', _links: { redirect: { href: 'https://ipay.ge/pay/ord_1' } } } });
    const res = await createBogOrder(CFG, 'tok', {
      amountGel: 10,
      shopOrderId: 'shop_1',
      redirectSuccessUrl: 'https://app/ok',
      redirectFailUrl: 'https://app/no',
      callbackUrl: 'https://app/api/billing/bog/webhook',
    }, { fetch: m.fetch });
    expect(res).toEqual({ orderId: 'ord_1', redirectUrl: 'https://ipay.ge/pay/ord_1', raw: expect.anything() });
    const sent = JSON.parse((m.calls[0]!.init.body as string));
    expect(sent.purchase_units.currency).toBe('GEL');
    expect(sent.purchase_units.total_amount).toBe(10);
    expect((m.calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('rejects a non-positive amount and returns null on missing id/redirect', async () => {
    expect(await createBogOrder(CFG, 'tok', { amountGel: 0, shopOrderId: 's', redirectSuccessUrl: 'a', redirectFailUrl: 'b', callbackUrl: 'c' }, mockFetch({ ok: true }))).toBeNull();
    expect(await createBogOrder(CFG, 'tok', { amountGel: 5, shopOrderId: 's', redirectSuccessUrl: 'a', redirectFailUrl: 'b', callbackUrl: 'c' }, mockFetch({ ok: true, json: { order_id: 'x' } }))).toBeNull();
  });
});

describe('extractRedirectUrl', () => {
  it('handles multiple envelope shapes and rejects non-http', () => {
    expect(extractRedirectUrl({ _links: { approve: { href: 'https://a' } } })).toBe('https://a');
    expect(extractRedirectUrl({ links: [{ rel: 'redirect', href: 'http://b' }] })).toBe('http://b');
    expect(extractRedirectUrl({ redirect_url: 'https://c' })).toBe('https://c');
    expect(extractRedirectUrl({ redirect_url: 'javascript:alert(1)' })).toBeNull();
    expect(extractRedirectUrl({})).toBeNull();
  });
});

describe('verifyBogCallbackSignature (real RSA keypair)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const body = JSON.stringify({ order_id: 'ord_9', order_status: { key: 'completed' } });

  function sign(payload: string): string {
    const s = createSign('RSA-SHA256');
    s.update(payload, 'utf8');
    s.end();
    return s.sign(privateKey, 'base64');
  }

  it('accepts a correctly signed body', () => {
    expect(verifyBogCallbackSignature(body, sign(body), pubPem)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = sign(body);
    expect(verifyBogCallbackSignature(body + ' ', sig, pubPem)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const s = createSign('RSA-SHA256'); s.update(body); s.end();
    expect(verifyBogCallbackSignature(body, s.sign(other, 'base64'), pubPem)).toBe(false);
  });

  it('rejects missing signature, missing key, or malformed key', () => {
    expect(verifyBogCallbackSignature(body, null, pubPem)).toBe(false);
    expect(verifyBogCallbackSignature(body, sign(body), null)).toBe(false);
    expect(verifyBogCallbackSignature(body, sign(body), 'not-a-key')).toBe(false);
    expect(verifyBogCallbackSignature('', sign(body), pubPem)).toBe(false);
  });
});

describe('IP allowlist', () => {
  it('extracts the first XFF hop', () => {
    expect(callbackSourceIp('1.1.1.1, 2.2.2.2', null)).toBe('1.1.1.1');
    expect(callbackSourceIp(null, '3.3.3.3')).toBe('3.3.3.3');
    expect(callbackSourceIp(null, null)).toBeNull();
  });

  it('allows all when empty, else exact-matches', () => {
    expect(isAllowedBogCallbackIp('9.9.9.9', [])).toBe(true);
    expect(isAllowedBogCallbackIp('1.2.3.4', ['1.2.3.4'])).toBe(true);
    expect(isAllowedBogCallbackIp('9.9.9.9', ['1.2.3.4'])).toBe(false);
    expect(isAllowedBogCallbackIp(null, ['1.2.3.4'])).toBe(false);
  });
});

describe('status parsing', () => {
  it('normalizes tokens to the canonical enum', () => {
    expect(normalizeBogStatus('completed')).toBe('APPROVED');
    expect(normalizeBogStatus('APPROVED')).toBe('APPROVED');
    expect(normalizeBogStatus('rejected')).toBe('REJECTED');
    expect(normalizeBogStatus('declined')).toBe('REJECTED');
    expect(normalizeBogStatus('pending')).toBe('PENDING');
    expect(normalizeBogStatus('weird')).toBe('UNKNOWN');
    expect(normalizeBogStatus(null)).toBe('UNKNOWN');
  });

  it('parses a nested BOG callback body', () => {
    const parsed = parseBogCallback({
      body: {
        order_id: 'ord_5',
        shop_order_id: 'shop_5',
        order_status: { key: 'completed' },
        purchase_units: { transferred_amount: '20.00', currency_code: 'GEL' },
      },
    });
    expect(parsed).toEqual({ orderId: 'ord_5', shopOrderId: 'shop_5', status: 'APPROVED', amountGel: 20, currency: 'GEL' });
  });

  it('parses a flat body + a rejected status', () => {
    const parsed = parseBogCallback({ order_id: 'o', status: 'rejected', amount: 9, currency: 'GEL' });
    expect(parsed.status).toBe('REJECTED');
    expect(parsed.amountGel).toBe(9);
  });
});

describe('bogCreditRef', () => {
  it('is a CREDIT namespace, distinct from the remix DEBIT refs', () => {
    expect(bogCreditRef('ord_1')).toBe('bog:ord_1');
    expect(bogCreditRef('ord_1').startsWith('remix:')).toBe(false);
  });
});
