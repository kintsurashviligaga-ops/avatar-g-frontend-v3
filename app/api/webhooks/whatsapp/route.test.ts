/** @jest-environment node */
/**
 * POST /api/webhooks/whatsapp — a delivery is accepted ONLY with a valid Meta signature, and never without an app secret.
 *
 * ⚠️ verifyMetaSignature returned `true` when WHATSAPP_APP_SECRET was unset, so any unsigned POST was queued and the
 * worker tick drained it into an LLM reply on the platform keys. Pinned: no secret → 403 and nothing queued; a wrong
 * signature → 403; a correctly signed delivery still goes through.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/platform/queues', () => ({ enqueueQueueItem: jest.fn(async () => undefined) }));
jest.mock('../../../../lib/platform/idempotency', () => ({
  hashIdempotencyKey: jest.fn((s: string) => `h:${s.length}`),
  markIdempotentDuplicate: jest.fn(async () => true),
}));
jest.mock('../../../../lib/platform/request-metrics', () => ({ recordRouteMetric: jest.fn() }));
jest.mock('../../../../lib/agent-g/channels/whatsapp-processor', () => ({
  parseWhatsAppMessageSummary: jest.fn(() => [{ id: 'wamid.1', from: '995500000000', text: 'hi' }]),
  processWhatsAppPayload: jest.fn(async () => undefined),
}));

import crypto from 'node:crypto';
import { GET, POST } from './route';
import { enqueueQueueItem } from '../../../../lib/platform/queues';
import { parseWhatsAppMessageSummary, processWhatsAppPayload } from '../../../../lib/agent-g/channels/whatsapp-processor';

const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
const sign = (secret: string, body: string) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
const post = (headers: Record<string, string> = {}) =>
  new Request('https://myavatar.ge/api/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}`, ...headers },
    body: BODY,
  });

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WHATSAPP_APP_SECRET;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test('with NO app secret configured, an unsigned delivery is refused (403) and nothing is queued', async () => {
  const res = await POST(post());
  expect(res.status).toBe(403);
  expect(enqueueQueueItem).not.toHaveBeenCalled();
});

test('with NO app secret configured, even a "signed" delivery is refused — nothing can be verified', async () => {
  const res = await POST(post({ 'x-hub-signature-256': sign('anything', BODY) }));
  expect(res.status).toBe(403);
  expect(enqueueQueueItem).not.toHaveBeenCalled();
});

test('a wrong signature is refused', async () => {
  process.env.WHATSAPP_APP_SECRET = 'app-secret-123';
  const res = await POST(post({ 'x-hub-signature-256': sign('not-the-secret', BODY) }));
  expect(res.status).toBe(403);
  expect(enqueueQueueItem).not.toHaveBeenCalled();
});

test('a correctly signed delivery is accepted and queued', async () => {
  process.env.WHATSAPP_APP_SECRET = 'app-secret-123';
  const res = await POST(post({ 'x-hub-signature-256': sign('app-secret-123', BODY) }));
  expect(res.status).toBe(200);
  expect(enqueueQueueItem).toHaveBeenCalledTimes(1);
});

describe('on Vercel (a request context with waitUntil): the message is answered after the 200, not queued', () => {
  const key = Symbol.for('@vercel/request-context');
  let waitUntil: jest.Mock;
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = 'app-secret-123';
    waitUntil = jest.fn();
    (globalThis as Record<symbol, unknown>)[key] = { get: () => ({ waitUntil }) };
  });
  afterEach(() => { delete (globalThis as Record<symbol, unknown>)[key]; });

  test('a signed message delivery is answered inline', async () => {
    const res = await POST(post({ 'x-hub-signature-256': sign('app-secret-123', BODY) }));
    expect(res.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(processWhatsAppPayload).toHaveBeenCalledWith(JSON.parse(BODY), expect.any(String), 'https://myavatar.ge');
    expect(enqueueQueueItem).not.toHaveBeenCalled();
  });

  test('if answering throws, the delivery falls back to the queue', async () => {
    (processWhatsAppPayload as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await POST(post({ 'x-hub-signature-256': sign('app-secret-123', BODY) }));
    await waitUntil.mock.calls[0][0];
    expect(enqueueQueueItem).toHaveBeenCalledTimes(1);
  });

  test('a status-only callback (delivered/read) runs nothing', async () => {
    (parseWhatsAppMessageSummary as jest.Mock).mockReturnValueOnce([]);
    const res = await POST(post({ 'x-hub-signature-256': sign('app-secret-123', BODY) }));
    expect(res.status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
    expect(enqueueQueueItem).not.toHaveBeenCalled();
  });
});

describe('GET — Meta\'s "Verify and save" handshake', () => {
  const verify = (token: string | null, mode = 'subscribe', challenge: string | null = '1158201444') => {
    const q = new URLSearchParams();
    if (mode) q.set('hub.mode', mode);
    if (token !== null) q.set('hub.verify_token', token);
    if (challenge !== null) q.set('hub.challenge', challenge);
    return GET(new Request(`https://myavatar.ge/api/webhooks/whatsapp?${q.toString()}`));
  };
  beforeEach(() => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.META_VERIFY_TOKEN;
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  });

  test('the right token → 200 with the challenge as plain text, exactly', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'myavatar-verify-123';
    const res = await verify('myavatar-verify-123');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await res.text()).toBe('1158201444');
  });

  test('what a paste into the Vercel form adds (a trailing newline, spaces, surrounding quotes) does not break it', async () => {
    for (const stored of ['myavatar-verify-123\n', '  myavatar-verify-123  ', '"myavatar-verify-123"', "'myavatar-verify-123'\r\n", 'myavatar-verify -123']) {
      process.env.WHATSAPP_VERIFY_TOKEN = stored;
      const res = await verify('myavatar-verify-123');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('1158201444');
    }
    process.env.WHATSAPP_VERIFY_TOKEN = 'myavatar-verify-123';
    expect((await verify(' myavatar-verify-123 ')).status).toBe(200); // typed with a space in Meta's form
  });

  test('the names Meta\'s guides use are read too', async () => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'alias-token';
    expect((await verify('alias-token')).status).toBe(200);
  });

  test('a wrong token, a missing one, another mode, no challenge, or nothing configured → 403', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'myavatar-verify-123';
    for (const res of [await verify('wrong'), await verify(null), await verify('myavatar-verify-123', 'unsubscribe'), await verify('myavatar-verify-123', 'subscribe', null)]) {
      expect(res.status).toBe(403);
      expect(await res.text()).toBe('Forbidden');
    }
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    expect((await verify('')).status).toBe(403);
    expect((await verify('anything')).status).toBe(403);
  });


});
