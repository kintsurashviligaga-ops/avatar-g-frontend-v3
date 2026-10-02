/** @jest-environment node */
/**
 * /api/agent-g/whatsapp/link — the Settings card's API. Pinned: a guest/unconfigured deployment gets honest flags; a code
 * needs a session AND a ready deployment; the wa.me link carries `connect CODE`; PATCH takes exactly { alerts }; DELETE
 * unlinks. No route takes a phone number.
 */
jest.mock('../../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock('../../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null) }));
jest.mock('../../../../../lib/agent-g/channels/whatsapp-client', () => ({
  whatsappConfig: jest.fn(),
  businessNumber: jest.fn(async () => '995322000000'),
}));
jest.mock('../../../../../lib/agent-g/channels/whatsapp-link', () => ({
  createConnectCode: jest.fn(),
  findLinkByUser: jest.fn(),
  patchLinkMeta: jest.fn(async () => true),
  unlink: jest.fn(async () => true),
}));

import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST } from './route';
import { getAuthenticatedUser } from '../../../../../lib/supabase/auth';
import { whatsappConfig } from '../../../../../lib/agent-g/channels/whatsapp-client';
import * as store from '../../../../../lib/agent-g/channels/whatsapp-link';

const m = store as jest.Mocked<typeof store>;
const auth = getAuthenticatedUser as jest.Mock;
const URL_ = 'https://myavatar.ge/api/agent-g/whatsapp/link';
const req = (method: string, body?: unknown) =>
  new NextRequest(URL_, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
const data = async (res: Response) => ((await res.json()) as { data?: Record<string, unknown> }).data;
const LINK = { id: 'L', userId: 'u1', waId: '995555000111', meta: { alerts: true, linked_at: '2026-10-03T10:00:00Z' } };

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_APP_SECRET = 's';
  process.env.WHATSAPP_VERIFY_TOKEN = 'v';
  (whatsappConfig as jest.Mock).mockReturnValue({ token: 't', phoneNumberId: 'p', graphVersion: 'v21.0' });
  auth.mockResolvedValue({ id: 'u1' });
});
afterEach(() => { process.env = { ...ENV }; });

describe('GET', () => {
  test('a guest learns only whether WhatsApp is set up', async () => {
    auth.mockResolvedValue(null);
    expect(await data(await GET(req('GET')))).toEqual({ guest: true, configured: true, available: true, linked: null });
  });
  test('a linked user sees a MASKED number and the alerts switch', async () => {
    m.findLinkByUser.mockResolvedValue({ state: 'linked', link: LINK });
    expect(await data(await GET(req('GET')))).toEqual({
      guest: false, configured: true, available: true, linked: { number: '+995 ••• ••111', linked_at: '2026-10-03T10:00:00Z', alerts: true },
    });
  });
  test('missing tables or missing keys → not available', async () => {
    m.findLinkByUser.mockResolvedValue({ state: 'unavailable' });
    expect((await data(await GET(req('GET'))))?.available).toBe(false);
    delete process.env.WHATSAPP_APP_SECRET;
    m.findLinkByUser.mockResolvedValue({ state: 'unlinked' });
    expect(await data(await GET(req('GET')))).toMatchObject({ configured: false, available: false });
  });
});

describe('POST (a one-time code)', () => {
  test('needs a session', async () => {
    auth.mockResolvedValue(null);
    expect((await POST(req('POST'))).status).toBe(401);
    expect(m.createConnectCode).not.toHaveBeenCalled();
  });
  test('needs the deployment to be able to RECEIVE the code (app secret + verify token)', async () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    expect((await POST(req('POST'))).status).toBe(503);
    expect(m.createConnectCode).not.toHaveBeenCalled();
  });
  test('missing tables → 503', async () => {
    m.createConnectCode.mockResolvedValue('unavailable');
    expect((await POST(req('POST'))).status).toBe(503);
  });
  test('the code, the command, and a wa.me link with the command typed in', async () => {
    m.createConnectCode.mockResolvedValue({ code: 'ABCD2345', expiresAt: '2026-10-03T10:15:00Z' });
    const res = await POST(req('POST'));
    expect(res.status).toBe(201);
    expect(await data(res)).toEqual({
      code: 'ABCD2345', command: 'connect ABCD2345', expires_at: '2026-10-03T10:15:00Z',
      wa_link: 'https://wa.me/995322000000?text=connect%20ABCD2345',
    });
    expect(m.createConnectCode).toHaveBeenCalledWith({}, 'u1');
  });
});

describe('PATCH / DELETE', () => {
  test('PATCH takes exactly { alerts: boolean }', async () => {
    m.findLinkByUser.mockResolvedValue({ state: 'linked', link: LINK });
    expect((await PATCH(req('PATCH', { alerts: 'no' }))).status).toBe(400);
    expect((await PATCH(req('PATCH', { alerts: false, external_id: '1' }))).status).toBe(400);
    const res = await PATCH(req('PATCH', { alerts: false }));
    expect(res.status).toBe(200);
    expect(m.patchLinkMeta).toHaveBeenCalledWith({}, LINK, { alerts: false });
  });
  test('PATCH without a link → 404', async () => {
    m.findLinkByUser.mockResolvedValue({ state: 'unlinked' });
    expect((await PATCH(req('PATCH', { alerts: true }))).status).toBe(404);
  });
  test('DELETE unlinks; already unlinked is fine; a guest is refused', async () => {
    m.findLinkByUser.mockResolvedValue({ state: 'linked', link: LINK });
    expect((await DELETE(req('DELETE'))).status).toBe(200);
    expect(m.unlink).toHaveBeenCalledWith({}, 'L');
    m.findLinkByUser.mockResolvedValue({ state: 'unlinked' });
    expect((await DELETE(req('DELETE'))).status).toBe(200);
    auth.mockResolvedValue(null);
    expect((await DELETE(req('DELETE'))).status).toBe(401);
  });
});
