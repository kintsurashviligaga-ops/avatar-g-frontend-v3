/** @jest-environment node */
jest.mock('../../../../../lib/voice-v2v/providers', () => ({ streamAssistantTokens: jest.fn() }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { WRITE: {} }, checkRateLimit: jest.fn(async () => null) }));
import { NextRequest } from 'next/server';
import { POST } from './route';
import { streamAssistantTokens } from '../../../../../lib/voice-v2v/providers';
import { checkRateLimit } from '../../../../../lib/api/rate-limit';
const request = (body: unknown, token = 'worker') => new NextRequest('http://localhost/api/agent-g/calls/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-worker-token': token }, body: JSON.stringify(body) });
const env = { ...process.env };
beforeEach(() => { jest.clearAllMocks(); process.env.WORKER_INTERNAL_TOKEN = 'worker'; (checkRateLimit as jest.Mock).mockResolvedValue(null); });
afterEach(() => { process.env = { ...env }; });
test('requires the internal worker token before model execution', async () => {
  expect((await POST(request({ text: 'hello' }, 'wrong'))).status).toBe(401);
  expect(streamAssistantTokens).not.toHaveBeenCalled();
});
test('rate limits and invalid history stop before model execution', async () => {
  expect((await POST(request({ text: 'hello', history: Array(7).fill({ role: 'user', content: 'a' }) }))).status).toBe(400);
  (checkRateLimit as jest.Mock).mockResolvedValue(new Response('', { status: 429 }));
  expect((await POST(request({ text: 'hello' }))).status).toBe(429);
  expect(streamAssistantTokens).not.toHaveBeenCalled();
});
test('the relay emits real token NDJSON and a typed error on provider failure', async () => {
  (streamAssistantTokens as jest.Mock).mockImplementation(async function* () { yield 'გამარჯობა'; throw new Error('private provider detail'); });
  const response = await POST(request({ text: 'hello', language: 'ka-GE' }));
  expect(response.headers.get('content-type')).toBe('application/x-ndjson');
  expect((await response.text()).trim().split('\n').map((line) => JSON.parse(line))).toEqual([{ token: 'გამარჯობა' }, { error: 'voice_provider_unavailable' }]);
});
