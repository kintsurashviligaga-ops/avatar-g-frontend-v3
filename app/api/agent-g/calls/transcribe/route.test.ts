/** @jest-environment node */
/**
 * POST /api/agent-g/calls/transcribe — the telephony STT. Internal-token only, and under AI_GOOGLE_ONLY (on by
 * default) refused outright: its engines are OpenAI and Deepgram, so no audio is read or sent.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../../lib/voice-v2v/providers', () => ({ transcribeRealtimePcmChunk: jest.fn(async () => ({ text: 'hi', provider: 'openai', isFinal: true })) }));

import { NextRequest } from 'next/server';
import { transcribeRealtimePcmChunk } from '../../../../../lib/voice-v2v/providers';
import { POST } from './route';

const ENV = { ...process.env };
const post = (token?: string) =>
  POST(new NextRequest('https://myavatar.ge/api/agent-g/calls/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-worker-token': token } : {}) },
    body: JSON.stringify({ audioBase64: 'AAAA', language: 'ka-GE' }),
  }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, WORKER_INTERNAL_TOKEN: 'tok' };
  delete process.env.AI_GOOGLE_ONLY;
});
afterAll(() => { process.env = ENV; });

test('without the internal token: 401', async () => {
  expect((await post()).status).toBe(401);
  expect(transcribeRealtimePcmChunk).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY on (the default): 503, the audio is never sent', async () => {
  expect((await post('tok')).status).toBe(503);
  expect(transcribeRealtimePcmChunk).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY off: it transcribes as before', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  const res = await post('tok');
  expect(res.status).toBe(200);
  expect(transcribeRealtimePcmChunk).toHaveBeenCalledTimes(1);
});
