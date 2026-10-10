/** @jest-environment node */
/**
 * geminiReply — one whole answer from the product Gemini chain. Pinned here: a door can switch Google Search off, and
 * then neither the request nor the platform prompt carries it (WhatsApp is a service channel, not a general assistant).
 */
jest.mock('server-only', () => ({}));
jest.mock('./chatStream', () => ({ streamGeminiChat: jest.fn(), unbookedAttempts: jest.fn(() => []) }));
jest.mock('../../services/billing/chatBudget', () => ({ bookChatUsage: jest.fn() }));
jest.mock('../../orchestrator/gemini-guard', () => ({ resolveGeminiKey: () => 'k' }));
jest.mock('../../chat/platformPrompt', () => ({ buildPlatformPrompt: jest.fn((o: { googleSearch?: boolean }) => `PLATFORM search=${String(o.googleSearch)}`) }));

import { geminiReply } from './reply';
import { streamGeminiChat } from './chatStream';
import { buildPlatformPrompt } from '../../chat/platformPrompt';

const stream = streamGeminiChat as jest.MockedFunction<typeof streamGeminiChat>;

beforeEach(() => {
  jest.clearAllMocks();
  stream.mockResolvedValue({ ok: true, model: 'gemini-x', text: 'hi', usage: { inputTokens: 1, outputTokens: 1 } } as never);
});

const msgs = [{ role: 'user' as const, content: 'hello' }];

test('by default the product profile decides (Google Search on)', async () => {
  expect(await geminiReply(msgs, null, undefined, { locale: 'en' })).toEqual({ text: 'hi', model: 'gemini-x' });
  expect(stream.mock.calls[0]![0].config.googleSearch).toBe(true);
  expect(buildPlatformPrompt).toHaveBeenCalledWith(expect.objectContaining({ googleSearch: true }));
});

test('googleSearch: false takes the search tool out of the request and the prompt; the door note is appended', async () => {
  await geminiReply(msgs, null, undefined, { locale: 'en', googleSearch: false, systemNote: 'WA NOTE' });
  const config = stream.mock.calls[0]![0].config;
  expect(config.googleSearch).toBe(false);
  expect(buildPlatformPrompt).toHaveBeenCalledWith(expect.objectContaining({ googleSearch: false }));
  expect(config.system).toContain('PLATFORM search=false');
  expect(config.system).toContain('WA NOTE');
});
