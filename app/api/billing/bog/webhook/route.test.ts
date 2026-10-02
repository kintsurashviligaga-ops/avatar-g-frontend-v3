/** @jest-environment node */
/**
 * POST /api/billing/bog/webhook — nothing is read, let alone settled, without BOG's signature over the raw body.
 * Real RSA keys (a test pair passed as BOG_CALLBACK_PUBLIC_KEY); the settlement engine is mocked — it has its own
 * suite (lib/billing/bogSettlement.test.ts).
 */
jest.mock('server-only', () => ({}));

import { createSign, generateKeyPairSync } from 'node:crypto';

const mockLoad = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../../../../lib/billing/bogSettlement', () => ({
  loadBogOrder: (...a: unknown[]) => mockLoad(...a),
  settleBogOrder: (...a: unknown[]) => mockSettle(...a),
}));
jest.mock('../../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: jest.fn() }) }));
jest.mock('../../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { POST } from './route';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const sign = (body: string) => {
  const s = createSign('RSA-SHA256');
  s.update(body, 'utf8');
  s.end();
  return s.sign(privateKey, 'base64');
};
const ENV = { ...process.env };
const BODY = JSON.stringify({
  event: 'order_payment',
  zoned_request_time: '2026-10-02T10:00:00.000000Z',
  body: {
    order_id: 'bog-1',
    external_order_id: 'myavatar-topup-0123456789abcdef',
    order_status: { key: 'completed' },
    purchase_units: { request_amount: '20.0', transfer_amount: '20.0', currency_code: 'GEL' },
    payment_detail: { transfer_method: { key: 'card' }, payer_identifier: '548888xxxxxx9893', code: '100' },
  },
});
const req = (body: string, headers: Record<string, string> = {}) => {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { text: async () => body, headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null } } as never;
};
const call = async (body: string, headers: Record<string, string> = {}) => {
  const res = await POST(req(body, headers));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};
const ORDER = { shop_order_id: 'myavatar-topup-0123456789abcdef', bog_order_id: 'bog-1', user_id: 'u1', amount_gel: 20, status: 'pending', kind: 'topup' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, BOG_CLIENT_ID: 'c', BOG_SECRET_KEY: 's', BOG_CALLBACK_PUBLIC_KEY: PUB };
  delete process.env.BOG_CALLBACK_IP_ALLOWLIST;
  mockLoad.mockResolvedValue(ORDER);
  mockSettle.mockResolvedValue({ status: 'completed', granted: true, kind: 'topup', credits: 200, tier: null, periodEnd: null, autoRenew: null });
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('503 when BOG is not configured', async () => {
  delete process.env.BOG_CLIENT_ID;
  expect((await call(BODY, { 'Callback-Signature': sign(BODY) })).status).toBe(503);
});

test('unsigned, wrongly signed or tampered → 401 and nothing is looked up', async () => {
  expect((await call(BODY)).status).toBe(401);
  expect((await call(BODY, { 'Callback-Signature': 'AAAA' })).status).toBe(401);
  expect((await call(BODY.replace('20.0', '2000.0'), { 'Callback-Signature': sign(BODY) })).status).toBe(401);
  expect(mockLoad).not.toHaveBeenCalled();
  expect(mockSettle).not.toHaveBeenCalled();
});

test('the published BOG key is used when no override is set — a callback signed by anyone else is refused', async () => {
  delete process.env.BOG_CALLBACK_PUBLIC_KEY;
  expect((await call(BODY, { 'Callback-Signature': sign(BODY) })).status).toBe(401);
});

test('signed → the order is found by our id / BOG’s id and settled', async () => {
  const r = await call(BODY, { 'Callback-Signature': sign(BODY) });
  expect(r).toEqual({ status: 200, json: { received: true, status: 'completed' } });
  expect(mockLoad).toHaveBeenCalledWith(expect.anything(), { shopOrderId: 'myavatar-topup-0123456789abcdef', bogOrderId: 'bog-1' });
  const [, order, receipt] = mockSettle.mock.calls[0];
  expect(order).toBe(ORDER);
  expect(receipt).toMatchObject({ orderId: 'bog-1', state: 'completed', requestAmount: 20, currency: 'GEL' });
});

test('a signed callback for an order we never created is acknowledged and ignored', async () => {
  mockLoad.mockResolvedValueOnce(null);
  const r = await call(BODY, { 'Callback-Signature': sign(BODY) });
  expect(r).toEqual({ status: 200, json: { received: true, ignored: 'unknown_order' } });
  expect(mockSettle).not.toHaveBeenCalled();
});

test('a settlement failure answers 500 (logged; the cron reconciles — BOG does not retry)', async () => {
  mockSettle.mockResolvedValueOnce({ status: 'error', reason: 'fulfill_failed' });
  expect((await call(BODY, { 'Callback-Signature': sign(BODY) })).status).toBe(500);
});

test('the optional IP allowlist is an extra gate on top of the signature', async () => {
  process.env.BOG_CALLBACK_IP_ALLOWLIST = '1.2.3.4';
  expect((await call(BODY, { 'Callback-Signature': sign(BODY), 'x-forwarded-for': '9.9.9.9' })).status).toBe(401);
  expect((await call(BODY, { 'Callback-Signature': sign(BODY), 'x-forwarded-for': '1.2.3.4' })).status).toBe(200);
});

test('another event type is acknowledged without settling', async () => {
  const other = BODY.replace('order_payment', 'something_else');
  expect((await call(other, { 'Callback-Signature': sign(other) })).json).toEqual({ received: true, ignored: 'event' });
  expect(mockSettle).not.toHaveBeenCalled();
});
