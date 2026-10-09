/** @jest-environment node */
/**
 * The two Vapi callbacks (/api/voice/webhook, /api/voice/inbound) write `voice_calls` through the service role. Pinned: with
 * VAPI_WEBHOOK_SECRET unset they refuse (503) instead of skipping the signature check, which let anyone POST a call event
 * naming any user_id; with it set, only a valid HMAC gets through.
 */
jest.mock('../../../../lib/voice/webhook-processing', () => ({ processVoiceWebhookEventWithRetry: jest.fn(async () => {}) }));
jest.mock('../../../../lib/voice/repository', () => ({ upsertVoiceCallByVapiId: jest.fn(async () => ({})) }));
jest.mock('../../../../lib/agent-g-voice-config', () => ({ buildAgentGVapiAssistantConfig: () => ({}) }));

import { NextRequest } from 'next/server';
import { POST as webhook } from './route';
import { POST as inbound } from '../inbound/route';
import { buildVapiWebhookSignature } from '../../../../lib/voice/webhook-signature';
import { processVoiceWebhookEventWithRetry } from '../../../../lib/voice/webhook-processing';
import { upsertVoiceCallByVapiId } from '../../../../lib/voice/repository';

const BODY = JSON.stringify({ type: 'call.started', call: { id: 'c1', metadata: { userId: 'victim' } } });
const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://myavatar.ge${path}`, { method: 'POST', body: BODY, headers });

const ROUTES = [
  ['/api/voice/webhook', webhook, processVoiceWebhookEventWithRetry],
  ['/api/voice/inbound', inbound, upsertVoiceCallByVapiId],
] as const;

const saved = process.env.VAPI_WEBHOOK_SECRET;
afterAll(() => {
  if (saved === undefined) delete process.env.VAPI_WEBHOOK_SECRET;
  else process.env.VAPI_WEBHOOK_SECRET = saved;
});
beforeEach(() => jest.clearAllMocks());
const settle = () => new Promise((r) => setTimeout(r, 0)); // the webhook processes in a microtask

describe.each(ROUTES)('%s', (path, POST, writer) => {
  test('no secret configured → 503 and nothing is written', async () => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    const res = await POST(req(path));
    expect(res.status).toBe(503);
    await settle();
    expect(writer).not.toHaveBeenCalled();
  });

  test('a secret configured and no or a wrong signature → 401 and nothing is written', async () => {
    process.env.VAPI_WEBHOOK_SECRET = 'whsec';
    expect((await POST(req(path))).status).toBe(401);
    expect((await POST(req(path, { 'x-vapi-signature': buildVapiWebhookSignature(BODY, 'other') }))).status).toBe(401);
    await settle();
    expect(writer).not.toHaveBeenCalled();
  });

  test('a valid signature is processed', async () => {
    process.env.VAPI_WEBHOOK_SECRET = 'whsec';
    const res = await POST(req(path, { 'x-vapi-signature': buildVapiWebhookSignature(BODY, 'whsec') }));
    expect(res.status).toBe(200);
    await settle();
    expect(writer).toHaveBeenCalledTimes(1);
  });
});
