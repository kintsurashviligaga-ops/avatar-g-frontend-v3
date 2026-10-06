/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./google/transport', () => ({ googleAiConfigured: jest.fn() }));
jest.mock('../gemini/client', () => ({ generateWithGemini: jest.fn() }));
jest.mock('../services/billing/chatBudget', () => ({ chatBudgetAllows: jest.fn(), bookChatUsage: jest.fn() }));
jest.mock('../observability/reliability', () => ({ reportReliability: jest.fn() }));
jest.mock('./deepseekClient', () => { throw new Error('Deprecated provider must not be loaded'); });
jest.mock('./atlasClient', () => { throw new Error('Deprecated provider must not be loaded'); });
jest.mock('@anthropic-ai/sdk', () => { throw new Error('Deprecated provider must not be loaded'); });
import { llmText } from './llmText';
import { googleAiConfigured } from './google/transport';
import { generateWithGemini } from '@/lib/gemini/client';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(googleAiConfigured).mockReturnValue(true);
  jest.mocked(chatBudgetAllows).mockResolvedValue(true);
});
test('uses Gemini even when old caller options request the multi-provider chain', async () => {
  jest.mocked(generateWithGemini).mockResolvedValue({ text: 'A scene', tokensUsed: 12, model: 'gemini' } as Awaited<ReturnType<typeof generateWithGemini>>);
  expect(await llmText({ user: 'Write a scene', googleOnly: false, geminiFirst: false })).toBe('A scene');
  expect(generateWithGemini).toHaveBeenCalledTimes(1);
  expect(bookChatUsage).toHaveBeenCalledWith(' Write a scene', 7, 'gemini');
});
test('a Gemini failure returns unavailable without charging or trying another provider', async () => {
  jest.mocked(generateWithGemini).mockRejectedValue(new Error('quota'));
  expect(await llmText({ user: 'A scene', googleOnly: false })).toBeNull();
  expect(bookChatUsage).not.toHaveBeenCalled();
});
test('missing Google configuration does not use a different provider', async () => {
  jest.mocked(googleAiConfigured).mockReturnValue(false);
  expect(await llmText({ user: 'A scene' })).toBeNull();
  expect(generateWithGemini).not.toHaveBeenCalled();
});
test('budget refusal prevents generation', async () => {
  jest.mocked(chatBudgetAllows).mockResolvedValue(false);
  expect(await llmText({ user: 'A scene' })).toBeNull();
  expect(generateWithGemini).not.toHaveBeenCalled();
  expect(bookChatUsage).not.toHaveBeenCalled();
});
