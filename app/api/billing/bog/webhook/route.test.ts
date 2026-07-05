/** @jest-environment node */
/**
 * Route-level regression tests for the BOG webhook — lock the fixes from the adversarial review:
 *  • signature is REQUIRED to credit (no IP-only bypass);
 *  • the idempotency ref is keyed on our own shop_order_id, IDENTICAL across callback envelope shapes
 *    (the double-credit hole);
 *  • a callback amount/currency mismatch refuses to credit;
 *  • an unmapped or unconfigured callback never credits.
 */
jest.mock('server-only', () => ({}));

import { generateKeyPairSync, createSign } from 'node:crypto';

// NB: jest.mock factories may only reference `mock`-prefixed outer vars (babel-jest hoist allowlist),
// and use RELATIVE paths (matching lib/billing/wallet-ledger.test.ts — `@/` isn't mapped for jest.mock).
const mockCreditWalletGel = jest.fn();
jest.mock('../../../../../lib/billing/wallet-ledger', () => ({
  creditWalletGel: (...args: unknown[]) => mockCreditWalletGel(...args),
}));

const mockState: { orderRow: Record<string, unknown> | null; updates: Array<{ patch: Record<string, unknown>; id: string }> } = {
  orderRow: null,
  updates: [],
};
jest.mock('../../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockState.orderRow, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          mockState.updates.push({ patch, id });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

import { POST } from './route';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function sign(body: string): string {
  const s = createSign('RSA-SHA256');
  s.update(body, 'utf8');
  s.end();
  return s.sign(privateKey, 'base64');
}

function fakeReq(body: string, headers: Record<string, string> = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { text: async () => body, headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null } } as never;
}

async function callWebhook(body: string, headers: Record<string, string> = {}) {
  const res = await POST(fakeReq(body, headers));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const APPROVED = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ order_id: 'BOG_1', shop_order_id: 'shop_uuid_1', order_status: { key: 'completed' }, ...extra });

beforeAll(() => {
  process.env.BOG_CLIENT_ID = 'c';
  process.env.BOG_SECRET_KEY = 's';
  process.env.BOG_CALLBACK_PUBLIC_KEY = PUB_PEM;
});

beforeEach(() => {
  mockCreditWalletGel.mockReset().mockResolvedValue(99);
  mockState.updates.length = 0;
  mockState.orderRow = { shop_order_id: 'shop_uuid_1', user_id: 'user_1', amount_gel: 10, status: 'pending' };
});

describe('auth', () => {
  it('401s a callback with no signature (never IP-only) and credits nothing', async () => {
    const r = await callWebhook(APPROVED());
    expect(r.status).toBe(401);
    expect(r.json.reason).toBe('signature');
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
  });

  it('401s a wrong-key signature', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const body = APPROVED();
    const s = createSign('RSA-SHA256'); s.update(body); s.end();
    const r = await callWebhook(body, { 'Callback-Signature': s.sign(other, 'base64') });
    expect(r.status).toBe(401);
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
  });

  it('401s when no public key is configured (no credit on an unverifiable callback)', async () => {
    const saved = process.env.BOG_CALLBACK_PUBLIC_KEY;
    delete process.env.BOG_CALLBACK_PUBLIC_KEY;
    const body = APPROVED();
    const r = await callWebhook(body, { 'Callback-Signature': sign(body) });
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('callback_auth_not_configured');
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
    process.env.BOG_CALLBACK_PUBLIC_KEY = saved;
  });
});

describe('credit', () => {
  it('credits exactly once on a signed APPROVED callback, ref keyed on shop_order_id', async () => {
    const body = APPROVED({ purchase_units: { transferred_amount: '10.00', currency_code: 'GEL' } });
    const r = await callWebhook(body, { 'Callback-Signature': sign(body) });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ credited: true, status: 'APPROVED' });
    expect(mockCreditWalletGel).toHaveBeenCalledTimes(1);
    expect(mockCreditWalletGel).toHaveBeenCalledWith('user_1', 10, 'bog:shop_uuid_1');
  });

  it('REGRESSION: same order in two DIFFERENT envelopes yields the SAME ref (no double-credit window)', async () => {
    // Delivery A carries order_id; delivery B carries ONLY shop_order_id. Pre-fix these produced
    // bog:BOG_1 vs bog:shop_uuid_1 → the ref PK failed to dedupe. Now both must be bog:shop_uuid_1.
    const bodyA = JSON.stringify({ order_id: 'BOG_1', shop_order_id: 'shop_uuid_1', order_status: { key: 'approved' } });
    const bodyB = JSON.stringify({ shop_order_id: 'shop_uuid_1', status: 'completed' });
    await callWebhook(bodyA, { 'Callback-Signature': sign(bodyA) });
    await callWebhook(bodyB, { 'Callback-Signature': sign(bodyB) });
    expect(mockCreditWalletGel).toHaveBeenCalledTimes(2);
    const refs = mockCreditWalletGel.mock.calls.map((c) => c[2]);
    expect(refs).toEqual(['bog:shop_uuid_1', 'bog:shop_uuid_1']); // identical → wallet_topups.ref dedupes
  });

  it('refuses to credit when the callback amount mismatches the recorded order', async () => {
    const body = APPROVED({ purchase_units: { transferred_amount: '5.00', currency_code: 'GEL' } });
    const r = await callWebhook(body, { 'Callback-Signature': sign(body) });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ credited: false, reason: 'amount_mismatch' });
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
    expect(mockState.updates.some((u) => u.patch.status === 'amount_mismatch')).toBe(true);
  });

  it('refuses to credit a non-GEL currency', async () => {
    const body = APPROVED({ purchase_units: { transferred_amount: '10.00', currency_code: 'USD' } });
    const r = await callWebhook(body, { 'Callback-Signature': sign(body) });
    expect(r.json).toMatchObject({ credited: false, reason: 'amount_mismatch' });
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
  });

  it('404s (no credit) when there is no order mapping', async () => {
    mockState.orderRow = null;
    const body = APPROVED();
    const r = await callWebhook(body, { 'Callback-Signature': sign(body) });
    expect(r.status).toBe(404);
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
  });

  it('acknowledges a REJECTED callback without crediting', async () => {
    const body = JSON.stringify({ order_id: 'BOG_1', shop_order_id: 'shop_uuid_1', order_status: { key: 'rejected' } });
    const r = await callWebhook(body, { 'Callback-Signature': sign(body) });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ credited: false, status: 'REJECTED' });
    expect(mockCreditWalletGel).not.toHaveBeenCalled();
  });
});
