/** @jest-environment node */
/**
 * The bridge's door into the app: off (404) unless WhatsApp calling is on, and with it on, nothing — no body read, no
 * Live token minted, no Meta call — before a ticket our app signed. The rules past the door: lib/calls/whatsapp/bridgeApi.
 */
const mockHandle = jest.fn(async (..._a: unknown[]) => ({ status: 200, body: { ok: true } }));
jest.mock('../../../../../lib/calls/whatsapp/bridgeApi', () => ({ handleBridgeRequest: (...a: unknown[]) => mockHandle(...a), BRIDGE_BODY_MAX_BYTES: 65536 }));
jest.mock('../../../../../lib/calls/whatsapp/liveDeps', () => ({
  callingEnabled: () => process.env.WHATSAPP_CALLING_ENABLED === '1',
  liveCallDeps: () => ({}),
  livePhoneToolDeps: () => ({}),
}));
const mockMint = jest.fn((..._a: unknown[]) => undefined);
jest.mock('../../../../../lib/calls/whatsapp/liveSession', () => ({ liveCallSessionDeps: () => ({}), mintCallSession: (...a: unknown[]) => mockMint(...a) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { issueTicket } from '../../../../../lib/calls/whatsapp/ticket';

const SECRET = 'route-door-secret-route-door-secret-0123456789';
const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; jest.clearAllMocks(); });

const req = (auth: string | null, body = '{}') =>
  new NextRequest('https://app.example/api/calls/bridge/session', {
    method: 'POST',
    body,
    headers: auth ? { authorization: auth, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
  });
const ctx = { params: { op: 'session' } };
const ticket = () => issueTicket({ callId: 'wacid.R', userId: 'u1', phoneNumberId: 'p', locale: 'ka', maxSeconds: 600, creditsPerMinute: 12, direction: 'USER_INITIATED' }, SECRET, Date.now());

test('off unless WhatsApp calling is enabled', async () => {
  process.env.CALL_BRIDGE_SECRET = SECRET;
  expect((await POST(req(`Bearer ${ticket()}`), ctx)).status).toBe(404);
  expect(mockHandle).not.toHaveBeenCalled();
});

test.each([
  ['no ticket', null],
  ['a forged ticket', 'Bearer eyJ2IjoxfQ.forged'],
  ['a ticket signed with another secret', 'OTHER'],
])('on, but %s: 401 at the door, nothing behind it runs', async (_l, auth) => {
  process.env.WHATSAPP_CALLING_ENABLED = '1';
  process.env.CALL_BRIDGE_SECRET = SECRET;
  const header = auth === 'OTHER'
    ? `Bearer ${issueTicket({ callId: 'wacid.R', userId: 'u1', phoneNumberId: 'p', locale: 'ka', maxSeconds: 600, creditsPerMinute: 12, direction: 'USER_INITIATED' }, `${SECRET}-other`, Date.now())}`
    : auth;
  const res = await POST(req(header), ctx);
  expect(res.status).toBe(401);
  expect(mockHandle).not.toHaveBeenCalled();
  expect(mockMint).not.toHaveBeenCalled();
});

test('on, without CALL_BRIDGE_SECRET: every ticket is refused (fail closed)', async () => {
  process.env.WHATSAPP_CALLING_ENABLED = '1';
  delete process.env.CALL_BRIDGE_SECRET;
  expect((await POST(req(`Bearer ${ticket()}`), ctx)).status).toBe(401);
  expect(mockHandle).not.toHaveBeenCalled();
});

test('a signed ticket passes the door to the full check', async () => {
  process.env.WHATSAPP_CALLING_ENABLED = '1';
  process.env.CALL_BRIDGE_SECRET = SECRET;
  const t = ticket();
  const res = await POST(req(`Bearer ${t}`, '{"resumptionHandle":null}'), ctx);
  expect(res.status).toBe(200);
  expect(mockHandle).toHaveBeenCalledWith(expect.anything(), 'session', t, { resumptionHandle: null });
});
