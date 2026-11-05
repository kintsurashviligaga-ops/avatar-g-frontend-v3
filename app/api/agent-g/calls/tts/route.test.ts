/** @jest-environment node */
/**
 * POST /api/agent-g/calls/tts — the telephony worker's Cloud TTS. Internal-token only; refused while no phone call can be
 * placed (lib/calls/availability.ts); and, once calls open, asks the platform budget before any provider call (MASTER
 * TASK v3.1 Phase 6: it was the one billable route without that check).
 */
jest.mock('server-only', () => ({}));
const mockSynth = jest.fn(async (..._a: unknown[]) => ({ audioBase64: 'QUJD', mimeType: 'audio/mpeg', provider: 'google-cloud-tts' }));
jest.mock('../../../../../lib/voice-v2v/providers', () => ({ synthesizeSpeechChunk: (...a: unknown[]) => mockSynth(...a) }));
const mockBudget = jest.fn(async (..._a: unknown[]) => true);
jest.mock('../../../../../lib/services/billing/chatBudget', () => ({ chatBudgetAllows: (...a: unknown[]) => mockBudget(...a) }));
let mockReady = false;
jest.mock('../../../../../lib/calls/availability', () => ({
  ...jest.requireActual('../../../../../lib/calls/availability'),
  phoneCallsReady: () => mockReady,
}));

import { NextRequest } from 'next/server';
import { PHONE_CALLS_UNAVAILABLE } from '../../../../../lib/calls/availability';
import { POST } from './route';

const ENV = { ...process.env };
let bodyRead = 0;
const post = (token?: string, body: unknown = { text: 'გამარჯობა', language: 'ka-GE' }) => {
  const req = new NextRequest('https://myavatar.ge/api/agent-g/calls/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-worker-token': token } : {}) },
    body: JSON.stringify(body),
  });
  const json = req.json.bind(req);
  req.json = async () => { bodyRead += 1; return json(); };
  return POST(req);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReady = false;
  bodyRead = 0;
  mockBudget.mockImplementation(async () => true);
  process.env = { ...ENV, WORKER_INTERNAL_TOKEN: 'tok' };
});
afterAll(() => { process.env = ENV; });

test('without the internal token, or with a wrong one: 401 and no speech', async () => {
  expect((await post()).status).toBe(401);
  expect((await post('wrong')).status).toBe(401);
  delete process.env.WORKER_INTERNAL_TOKEN;
  expect((await post('tok')).status).toBe(401);
  expect(mockSynth).not.toHaveBeenCalled();
});

test('while phone calls are unavailable: the named 503, before the body is read, the budget asked or a voice made', async () => {
  const res = await post('tok');
  expect(res.status).toBe(503);
  expect((await res.json()).error).toBe(PHONE_CALLS_UNAVAILABLE);
  expect(bodyRead).toBe(0);
  expect(mockBudget).not.toHaveBeenCalled();
  expect(mockSynth).not.toHaveBeenCalled();
});

describe('once phone calls are available', () => {
  beforeEach(() => { mockReady = true; });

  test('a budget refusal (incl. a guard fault, which chatBudgetAllows turns into a refusal) is a 503 with no voice made', async () => {
    mockBudget.mockImplementation(async () => false);
    const res = await post('tok');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('budget_exhausted');
    expect(mockBudget).toHaveBeenCalledWith('გამარჯობა');
    expect(mockSynth).not.toHaveBeenCalled();
  });

  test('within budget: the budget is asked first, then Cloud TTS speaks the text', async () => {
    const res = await post('tok');
    expect(res.status).toBe(200);
    expect(mockBudget).toHaveBeenCalledTimes(1);
    expect(mockSynth).toHaveBeenCalledWith({ text: 'გამარჯობა', language: 'ka-GE' });
    expect(mockBudget.mock.invocationCallOrder[0]).toBeLessThan(mockSynth.mock.invocationCallOrder[0]);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain('data:audio/mpeg;base64,QUJD');
  });

  test('an invalid body is a 400 with neither the budget nor the voice touched', async () => {
    expect((await post('tok', { text: '' })).status).toBe(400);
    expect(mockBudget).not.toHaveBeenCalled();
    expect(mockSynth).not.toHaveBeenCalled();
  });
});
