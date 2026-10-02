/** @jest-environment node */
/**
 * POST /api/agent-g/whatsapp/send — operator-only outbound WhatsApp: a text, or an approved template (Meta's `hello_world`
 * sample included). Pinned: no admin → 401 and nothing sent; the template body is exactly Meta's; a refusal is a 502 with
 * Meta's code; no credentials → 503.
 */
jest.mock('../../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) }));
jest.mock('../../../../../lib/auth/adminGuard', () => ({ isAdmin: jest.fn(async () => false) }));
jest.mock('../../../../../lib/security/opsAccess', () => ({ adminKeyHeaderMatches: (req: Request) => req.headers.get('x-admin-key') === 'admin-key' }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const ENV = { ...process.env };
let fetchMock: jest.Mock;
const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const send = (body: unknown, admin = true) =>
  POST(new NextRequest('https://myavatar.ge/api/agent-g/whatsapp/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(admin ? { 'x-admin-key': 'admin-key' } : {}) },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1047915818394991';
  delete process.env.WHATSAPP_GRAPH_VERSION;
  fetchMock = jest.fn(() => ok({ messages: [{ id: 'wamid.x' }] }));
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test('without the admin key or an admin session: 401, nothing sent', async () => {
  expect((await send({ to: '995571333194', text: 'hi' }, false)).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('hello_world: the exact body of Meta’s sample, to graph v25.0 /{phone-number-id}/messages with the bearer token', async () => {
  const res = await send({ to: '+995 571 333 194', template: { name: 'hello_world', language: 'en_US' } });
  expect(res.status).toBe(200);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('https://graph.facebook.com/v25.0/1047915818394991/messages');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  expect(JSON.parse(String(init.body))).toEqual({
    messaging_product: 'whatsapp', to: '995571333194', type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } },
  });
  expect(((await res.json()) as { data: unknown }).data).toEqual({ ok: true, status: 200, error_code: null, message_ids: ['wamid.x'], graph_version: 'v25.0' });
});

test('a text, and a template with parameters', async () => {
  await send({ to: '995571333194', text: 'გამარჯობა' });
  expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toMatchObject({ type: 'text', text: { body: 'გამარჯობა' } });
  await send({ to: '995571333194', template: { name: 'result_ready', language: 'ka', params: ['🎬 მზადაა', 'https://myavatar.ge/library'] } });
  expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).template.components).toEqual([
    { type: 'body', parameters: [{ type: 'text', text: '🎬 მზადაა' }, { type: 'text', text: 'https://myavatar.ge/library' }] },
  ]);
});

test('Meta refuses → 502 with its error code; a malformed body → 400; no credentials → 503', async () => {
  fetchMock.mockImplementationOnce(() => ok({ error: { code: 190, message: 'Invalid OAuth access token' } }, 401));
  const refused = await send({ to: '995571333194', template: { name: 'hello_world' } });
  expect(refused.status).toBe(502);
  expect(((await refused.json()) as { data: { error_code: number } }).data.error_code).toBe(190);
  expect((await send({ to: '12', text: 'x' })).status).toBe(400);
  expect((await send({ to: '995571333194', template: { name: 'Hello World!' } })).status).toBe(400);
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  expect((await send({ to: '995571333194', text: 'x' })).status).toBe(503);
});
