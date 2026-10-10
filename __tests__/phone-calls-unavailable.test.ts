/** @jest-environment node */
/**
 * No phone-call path exists (lib/calls/availability.ts), so no route may report a call that nobody placed (Omnichannel C,
 * 2026-10-10). Each one used to: /api/agent-g/calls/start stored an `active` / `queued` call, the task call-back stored
 * an `ended, delivered` one, /api/voice/outgoing answered a made-up call SID, and /api/voice/outbound, /notify and
 * /web-token stored `demo` rows without Vapi or rang through an Anthropic-model assistant with it. Now each answers 503
 * after its own door check, and nothing behind it runs: no row, no provider call, no Vapi.
 */
jest.mock('server-only', () => ({}));

const mockFrom = jest.fn();
const mockGetUser = jest.fn(async (..._a: unknown[]) => ({ data: { user: { id: 'user-1' } }, error: null }));
jest.mock('../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: (...a: unknown[]) => mockFrom(...a), auth: { getUser: (...a: unknown[]) => mockGetUser(...a) } }),
  requireUser: jest.fn(async () => ({ id: 'user-1' })),
}));
const mockAuthUser = jest.fn(async (..._a: unknown[]): Promise<{ id: string } | null> => ({ id: 'user-1' }));
jest.mock('../lib/supabase/auth', () => ({ getAuthenticatedUser: (...a: unknown[]) => mockAuthUser(...a) }));
jest.mock('../lib/api/rate-limit', () => ({
  ...jest.requireActual('../lib/api/rate-limit'),
  checkRateLimit: jest.fn(async () => null),
}));
const mockCreateVapiCall = jest.fn();
const mockCreateVapiAssistant = jest.fn();
jest.mock('../lib/vapi', () => ({
  isVapiServerConfigured: () => true,
  getVapiPhoneNumberId: () => 'pn_1',
  createVapiCall: (...a: unknown[]) => mockCreateVapiCall(...a),
  createVapiAssistant: (...a: unknown[]) => mockCreateVapiAssistant(...a),
}));
const mockUpsertCall = jest.fn();
const mockInsertCall = jest.fn();
jest.mock('../lib/voice/repository', () => ({
  upsertVoiceCallByVapiId: (...a: unknown[]) => mockUpsertCall(...a),
  insertVoiceCall: (...a: unknown[]) => mockInsertCall(...a),
}));

import { NextRequest } from 'next/server';
import { PHONE_CALLS_UNAVAILABLE } from '../lib/calls/availability';
import { buildVapiWebhookSignature } from '../lib/voice/webhook-signature';
import { POST as callsStart } from '../app/api/agent-g/calls/start/route';
import { POST as callsCallback } from '../app/api/agent-g/calls/callback/route';
import { POST as voiceOutgoing } from '../app/api/voice/outgoing/route';
import { POST as voiceOutbound } from '../app/api/voice/outbound/route';
import { POST as voiceNotify } from '../app/api/voice/notify/route';
import { POST as voiceInbound } from '../app/api/voice/inbound/route';
import { POST as voiceWebToken } from '../app/api/voice/web-token/route';

const ENV = { ...process.env };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`https://myavatar.ge${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, WORKER_INTERNAL_TOKEN: 'tok', VAPI_WEBHOOK_SECRET: 'vapi-secret', NEXT_PUBLIC_VAPI_PUBLIC_KEY: 'pk' };
  delete process.env.AI_GOOGLE_ONLY;
});
afterAll(() => { process.env = ENV; });

/** Nothing behind the door ran: no table touched, no Vapi call or assistant, no voice_calls row. */
function nothingRan() {
  expect(mockFrom).not.toHaveBeenCalled();
  expect(mockCreateVapiCall).not.toHaveBeenCalled();
  expect(mockCreateVapiAssistant).not.toHaveBeenCalled();
  expect(mockUpsertCall).not.toHaveBeenCalled();
  expect(mockInsertCall).not.toHaveBeenCalled();
}

describe('/api/agent-g/calls/start', () => {
  const body = { channel: 'phone', mode: 'qa', initial_text: 'hello' };

  it('still asks for a session first', async () => {
    mockAuthUser.mockResolvedValueOnce(null);
    expect((await callsStart(post('/api/agent-g/calls/start', body))).status).toBe(401);
    nothingRan();
  });

  it('a signed-in start answers 503 and stores no call', async () => {
    const res = await callsStart(post('/api/agent-g/calls/start', body));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(PHONE_CALLS_UNAVAILABLE);
    nothingRan();
  });
});

describe('/api/agent-g/calls/callback (and every task end through queueAgentGCallback)', () => {
  it('answers queued: false with the reason, even with force, and stores nothing', async () => {
    const res = await callsCallback(post('/api/agent-g/calls/callback', {
      taskId: '00000000-0000-4000-8000-000000000001', summary: 'done', force: true,
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ queued: false, reason: PHONE_CALLS_UNAVAILABLE });
    nothingRan();
  });
});

describe('/api/voice/outgoing', () => {
  it('without a bearer token: 401', async () => {
    expect((await voiceOutgoing(post('/api/voice/outgoing', { to: '+995599123456' }))).status).toBe(401);
  });

  it('signed in: 503, no made-up call SID', async () => {
    const res = await voiceOutgoing(post('/api/voice/outgoing', { to: '+995599123456' }, { authorization: 'Bearer t' }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe(PHONE_CALLS_UNAVAILABLE);
    expect(json.callSid).toBeUndefined();
  });
});

describe('/api/voice/outbound', () => {
  it('signed in, Vapi configured: 503, no Vapi call, no balance read, no row', async () => {
    const res = await voiceOutbound(post('/api/voice/outbound', { phoneNumber: '+995599123456' }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(PHONE_CALLS_UNAVAILABLE);
    nothingRan();
  });
});

describe('/api/voice/notify', () => {
  const body = { userId: 'user-1', jobId: 'j1', service: 'video', resultUrl: 'https://myavatar.ge/r' };

  it('without the worker token: 401', async () => {
    expect((await voiceNotify(post('/api/voice/notify', body))).status).toBe(401);
  });

  it('with the worker token: queued false, 503, nothing read or placed', async () => {
    const res = await voiceNotify(post('/api/voice/notify', body, { 'x-internal-worker-token': 'tok' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ queued: false, reason: PHONE_CALLS_UNAVAILABLE });
    nothingRan();
  });
});

describe('/api/voice/inbound (Vapi asks which assistant answers)', () => {
  const raw = JSON.stringify({ call: { id: 'call_1', customer: { number: '+995599123456' } } });

  it('a forged signature: 401', async () => {
    expect((await voiceInbound(post('/api/voice/inbound', raw, { 'x-vapi-signature': 'nope' }))).status).toBe(401);
  });

  it('a genuine Vapi request: 503, no assistant handed out, no ringing row', async () => {
    const sig = buildVapiWebhookSignature(raw, 'vapi-secret');
    const res = await voiceInbound(post('/api/voice/inbound', raw, { 'x-vapi-signature': sig }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe(PHONE_CALLS_UNAVAILABLE);
    expect(json.assistant).toBeUndefined();
    nothingRan();
  });
});

describe('/api/voice/web-token (Vapi in the browser, Anthropic model)', () => {
  it('AI_GOOGLE_ONLY on (the default): 503, no assistant or system prompt sent, no row', async () => {
    const res = await voiceWebToken(post('/api/voice/web-token', {}));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('voice_provider_not_allowed');
    expect(json.assistant).toBeUndefined();
    expect(json.token).toBeUndefined();
    nothingRan();
  });
});
