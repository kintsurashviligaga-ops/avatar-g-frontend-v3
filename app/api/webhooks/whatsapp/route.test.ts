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
import { POST } from './route';
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
